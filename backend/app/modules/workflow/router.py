"""
DSA OS — Follow-up Tasks, Workflow, and SLA API Endpoints
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_SLA_MANAGE,
    PERM_TASKS_MANAGE,
    PERM_TASKS_READ,
)
from app.modules.workflow.schemas import (
    SLAConfigItem,
    SLAConfigRequest,
    StatusTransitionResponse,
    TaskCreateRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.modules.workflow.service import TaskService, WorkflowConfigService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Workflow & Tasks"])


# -----------------------------------------------------------------------------
# Follow-up Tasks
# -----------------------------------------------------------------------------


@router.get(
    "/tasks",
    response_model=ApiResponse[list[TaskResponse]],
    summary="List operational follow-up tasks",
)
@router.get(
    "/workflow/tasks",
    response_model=ApiResponse[list[TaskResponse]],
    summary="List operational follow-up tasks (alias)",
)
async def list_tasks(
    status: str | None = Query(None, description="Filter by pending/completed/cancelled"),
    due_filter: str | None = Query(None, description="today, overdue, or upcoming"),
    owner_id: uuid.UUID | None = Query(None, description="Filter by assigned user"),
    case_id: uuid.UUID | None = Query(None, description="Filter by case"),
    current_user: User = Depends(require_permission(PERM_TASKS_READ)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TaskResponse]]:
    service = TaskService(db)
    tasks = await service.list_tasks(
        org_id=current_user.org_id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        status=status,
        case_id=case_id,
        due_filter=due_filter,
        owner_id=owner_id,
    )
    return ApiResponse(data=tasks)


@router.post(
    "/tasks",
    response_model=ApiResponse[TaskResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new follow-up task",
)
@router.post(
    "/workflow/tasks",
    response_model=ApiResponse[TaskResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new follow-up task (alias)",
)
async def create_task(
    payload: TaskCreateRequest,
    current_user: User = Depends(require_permission(PERM_TASKS_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskResponse]:
    service = TaskService(db)
    task = await service.create_task(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=task)


@router.post(
    "/cases/{case_id}/tasks",
    response_model=ApiResponse[TaskResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a scheduled follow-up task on a case",
)
async def create_case_task(
    case_id: uuid.UUID,
    payload: TaskCreateRequest,
    current_user: User = Depends(require_permission(PERM_TASKS_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskResponse]:
    payload.case_id = case_id
    service = TaskService(db)
    task = await service.create_task(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=task)


@router.patch(
    "/tasks/{id}",
    response_model=ApiResponse[TaskResponse],
    summary="Complete, reschedule, or cancel a task",
)
@router.patch(
    "/workflow/tasks/{id}",
    response_model=ApiResponse[TaskResponse],
    summary="Complete, reschedule, or cancel a task (alias)",
)
async def update_task(
    id: uuid.UUID,
    payload: TaskUpdateRequest,
    current_user: User = Depends(require_permission(PERM_TASKS_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskResponse]:
    service = TaskService(db)
    task = await service.update_task(
        org_id=current_user.org_id,
        task_id=id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=task)


# -----------------------------------------------------------------------------
# Workflow & SLA Configuration
# -----------------------------------------------------------------------------


@router.get(
    "/config/sla",
    response_model=ApiResponse[list[SLAConfigItem]],
    summary="Get SLA turnaround configuration per stage",
)
async def get_sla_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SLAConfigItem]]:
    service = WorkflowConfigService(db)
    configs = await service.get_sla_configs(org_id=current_user.org_id)
    return ApiResponse(data=configs)


@router.put(
    "/config/sla",
    response_model=ApiResponse[list[SLAConfigItem]],
    summary="Update SLA turnaround benchmarks (Owner only)",
)
async def update_sla_config(
    payload: SLAConfigRequest,
    current_user: User = Depends(require_permission(PERM_SLA_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SLAConfigItem]]:
    service = WorkflowConfigService(db)
    configs = await service.update_sla_configs(
        org_id=current_user.org_id,
        items=payload.items,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=configs)


@router.get(
    "/config/status-transitions",
    response_model=ApiResponse[StatusTransitionResponse],
    summary="Get allowed status transitions for cases and lender applications",
)
async def get_status_transitions(
    current_user: User = Depends(get_current_user),
) -> ApiResponse[StatusTransitionResponse]:
    transitions = WorkflowConfigService.get_allowed_transitions()
    return ApiResponse(data=transitions)
