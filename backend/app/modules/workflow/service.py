"""
DSA OS — Workflow, Follow-up Tasks, and SLA Configuration Service
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.cases.state_machine import ALLOWED_STATUS_TRANSITIONS
from app.modules.workflow.models import SLAConfig, Task
from app.modules.workflow.schemas import (
    SLAConfigItem,
    StatusTransitionResponse,
    TaskCreateRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.modules.workflow.state_machine import ALLOWED_APP_TRANSITIONS
from app.shared.exceptions import NotFoundError, PermissionDeniedError


class TaskService:
    """Follow-up tasks, client reminders, document pickups, and underwriter queries."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def list_tasks(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
        status: str | None = None,
        case_id: uuid.UUID | None = None,
        due_filter: str | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> list[TaskResponse]:
        stmt = (
            select(Task)
            .options(selectinload(Task.case), selectinload(Task.owner))
            .where(Task.org_id == org_id, Task.deleted_at.is_(None))
            .order_by(Task.due_date.asc())
        )

        # RBAC: Field Executive sees only own tasks
        if actor_role == "field_executive":
            stmt = stmt.where(Task.owner_id == actor_id)
        elif owner_id:
            stmt = stmt.where(Task.owner_id == owner_id)

        if status:
            stmt = stmt.where(Task.status == status)
        if case_id:
            stmt = stmt.where(Task.case_id == case_id)

        now = datetime.now(UTC)
        if due_filter == "overdue":
            stmt = stmt.where(Task.status == "pending", Task.due_date < now)
        elif due_filter == "today":
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            stmt = stmt.where(Task.due_date >= start_of_day, Task.due_date < end_of_day)
        elif due_filter == "upcoming":
            stmt = stmt.where(Task.due_date >= now)

        res = await self.session.execute(stmt)
        tasks = res.scalars().all()

        responses: list[TaskResponse] = []
        for t in tasks:
            is_overdue = t.status == "pending" and (
                t.due_date.replace(tzinfo=UTC) if t.due_date.tzinfo is None else t.due_date
            ) < now
            resp = TaskResponse(
                id=t.id,
                org_id=t.org_id,
                case_id=t.case_id,
                case_no=t.case.case_no if t.case else None,
                lender_application_id=t.lender_application_id,
                type=t.type,
                title=t.title,
                description=t.description,
                owner_id=t.owner_id,
                owner_name=t.owner.name if t.owner else None,
                due_date=t.due_date,
                status=t.status,
                completed_at=t.completed_at,
                notes=t.notes,
                is_overdue=is_overdue,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            responses.append(resp)
        return responses

    async def get_task(self, org_id: uuid.UUID, task_id: uuid.UUID) -> Task:
        stmt = (
            select(Task)
            .options(selectinload(Task.case), selectinload(Task.owner))
            .where(Task.id == task_id, Task.org_id == org_id, Task.deleted_at.is_(None))
        )
        res = await self.session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise NotFoundError(f"Task '{task_id}' not found.")
        return task

    async def create_task(
        self,
        org_id: uuid.UUID,
        payload: TaskCreateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> TaskResponse:
        target_owner_id = payload.assigned_to_id or actor_id

        # Verify owner exists in org
        user_stmt = select(User).where(User.id == target_owner_id, User.org_id == org_id)
        owner_user = (await self.session.execute(user_stmt)).scalar_one_or_none()
        if not owner_user:
            raise NotFoundError(f"Assignee user '{target_owner_id}' not found.")

        # Verify case if provided
        case_obj = None
        if payload.case_id:
            case_stmt = select(Case).where(Case.id == payload.case_id, Case.org_id == org_id)
            case_obj = (await self.session.execute(case_stmt)).scalar_one_or_none()
            if not case_obj:
                raise NotFoundError(f"Case '{payload.case_id}' not found.")

        now_dt = datetime.now(UTC)
        task = Task(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=payload.case_id,
            lender_application_id=payload.lender_application_id,
            type=payload.type,
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            owner_id=target_owner_id,
            due_date=payload.due_date,
            status="pending",
            created_at=now_dt,
            updated_at=now_dt,
        )
        self.session.add(task)
        await self.session.commit()
        await self.session.refresh(task)

        await self.audit.log_event(
            org_id=org_id,
            action="task.created",
            entity_type="task",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(task.id),
            changes={"title": task.title, "due_date": task.due_date.isoformat()},
        )

        return TaskResponse(
            id=task.id,
            org_id=task.org_id,
            case_id=task.case_id,
            case_no=case_obj.case_no if case_obj else None,
            lender_application_id=task.lender_application_id,
            type=task.type,
            title=task.title,
            description=task.description,
            owner_id=task.owner_id,
            owner_name=owner_user.name,
            due_date=task.due_date,
            status=task.status,
            completed_at=task.completed_at,
            notes=task.notes,
            is_overdue=False,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    async def update_task(
        self,
        org_id: uuid.UUID,
        task_id: uuid.UUID,
        payload: TaskUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> TaskResponse:
        task = await self.get_task(org_id, task_id)

        # RBAC: Field Executive can only update own task
        if actor_role == "field_executive" and task.owner_id != actor_id:
            raise PermissionDeniedError("Field Executives can only update tasks assigned to them.")

        before_state = {"status": task.status, "due_date": task.due_date.isoformat()}

        if payload.status:
            task.status = payload.status
            if payload.status == "completed":
                task.completed_at = datetime.now(UTC)
            else:
                task.completed_at = None

        if payload.outcome_notes:
            task.notes = payload.outcome_notes

        if payload.due_date:
            task.due_date = payload.due_date

        if payload.assigned_to_id:
            # Verify new assignee
            user_stmt = select(User).where(User.id == payload.assigned_to_id, User.org_id == org_id)
            new_owner = (await self.session.execute(user_stmt)).scalar_one_or_none()
            if not new_owner:
                raise NotFoundError(f"Assignee user '{payload.assigned_to_id}' not found.")
            task.owner_id = payload.assigned_to_id

        task.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(task)

        await self.audit.log_event(
            org_id=org_id,
            action="task.updated",
            entity_type="task",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(task.id),
            changes={
                "before": before_state,
                "after": {"status": task.status, "due_date": task.due_date.isoformat()},
            },
        )

        now = datetime.now(UTC)
        is_overdue = task.status == "pending" and (
            task.due_date.replace(tzinfo=UTC) if task.due_date.tzinfo is None else task.due_date
        ) < now

        return TaskResponse(
            id=task.id,
            org_id=task.org_id,
            case_id=task.case_id,
            case_no=task.case.case_no if task.case else None,
            lender_application_id=task.lender_application_id,
            type=task.type,
            title=task.title,
            description=task.description,
            owner_id=task.owner_id,
            owner_name=task.owner.name if task.owner else None,
            due_date=task.due_date,
            status=task.status,
            completed_at=task.completed_at,
            notes=task.notes,
            is_overdue=is_overdue,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )


class WorkflowConfigService:
    """Manages configurable stage SLAs and retrieves allowed state transitions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def get_sla_configs(self, org_id: uuid.UUID) -> list[SLAConfigItem]:
        stmt = (
            select(SLAConfig)
            .where(SLAConfig.org_id == org_id, SLAConfig.deleted_at.is_(None))
            .order_by(SLAConfig.entity_type.asc(), SLAConfig.status.asc())
        )
        res = await self.session.execute(stmt)
        configs = res.scalars().all()
        return [
            SLAConfigItem(
                entity_type=c.entity_type,
                status=c.status,
                sla_hours=c.sla_hours,
                is_active=c.is_active,
            )
            for c in configs
        ]

    async def update_sla_configs(
        self,
        org_id: uuid.UUID,
        items: list[SLAConfigItem],
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> list[SLAConfigItem]:
        if actor_role != "owner":
            raise PermissionDeniedError("Only organization Owners can update SLA configuration.")

        for item in items:
            stmt = select(SLAConfig).where(
                SLAConfig.org_id == org_id,
                SLAConfig.entity_type == item.entity_type,
                SLAConfig.status == item.status,
            )
            cfg = (await self.session.execute(stmt)).scalar_one_or_none()
            if cfg:
                cfg.sla_hours = item.sla_hours
                cfg.is_active = item.is_active
                cfg.updated_at = datetime.now(UTC)
            else:
                new_cfg = SLAConfig(
                    id=uuid.uuid4(),
                    org_id=org_id,
                    entity_type=item.entity_type,
                    status=item.status,
                    sla_hours=item.sla_hours,
                    is_active=item.is_active,
                )
                self.session.add(new_cfg)

        await self.session.commit()

        await self.audit.log_event(
            org_id=org_id,
            action="config.sla_updated",
            entity_type="sla_config",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(org_id),
            changes={"count": len(items)},
        )
        return await self.get_sla_configs(org_id)

    @staticmethod
    def get_allowed_transitions() -> StatusTransitionResponse:
        return StatusTransitionResponse(
            case_transitions={k: sorted(v) for k, v in ALLOWED_STATUS_TRANSITIONS.items()},
            application_transitions={
                k: sorted(v) for k, v in ALLOWED_APP_TRANSITIONS.items()
            },
        )
