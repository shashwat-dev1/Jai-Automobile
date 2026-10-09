"""
DSA OS — Reports and Dashboards Router

Exposes:
- GET /dashboard/overview: Executive business overview
- GET /dashboard/today: Central daily operational cockpit (IF-3)
- GET /dashboard/kpis: PRD 9.1 KPI computations
- GET /dashboard/pipeline: Live pipeline stage distribution
- GET /sources/report: Lead source and dealer performance
- GET /reports/export: CSV data export with audit logging (PERM_DATA_EXPORT)
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_CASES_READ, PERM_DATA_EXPORT
from app.modules.reports.dashboard_service import DashboardService
from app.modules.reports.export_service import ExportService
from app.modules.reports.kpi_service import KPIService
from app.modules.reports.schemas import (
    DashboardOverviewResponse,
    KPIResponse,
    PipelineResponse,
    ReportType,
    SourceReportResponse,
    TodayViewResponse,
)
from app.modules.reports.source_report_service import SourceReportService
from app.modules.reports.today_service import TodayService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Reports & Dashboards"])


@router.get("/dashboard/overview", response_model=ApiResponse[DashboardOverviewResponse])
async def get_dashboard_overview(
    date_from: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DashboardOverviewResponse]:
    """Retrieve the business overview dashboard metrics."""
    owner_id = current_user.id if current_user.role == "field_executive" else None
    service = DashboardService(session)
    data = await service.get_overview(date_from=date_from, date_to=date_to, owner_id=owner_id)
    return ApiResponse(data=data)


@router.get("/dashboard/today", response_model=ApiResponse[TodayViewResponse])
async def get_today_view(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TodayViewResponse]:
    """Retrieve daily operational cockpit tasks, stuck cases, and expiring documents."""
    owner_id = current_user.id if current_user.role == "field_executive" else None
    service = TodayService(session)
    data = await service.get_today_view(owner_id=owner_id)
    return ApiResponse(data=data)


@router.get("/dashboard/kpis", response_model=ApiResponse[KPIResponse])
async def get_kpis(
    date_from: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender UUID"),
    product: str | None = Query(None, description="Filter by product code"),
    source_id: uuid.UUID | None = Query(None, description="Filter by source UUID"),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KPIResponse]:
    """Retrieve PRD 9.1 KPI metrics computed from live application data."""
    owner_id = current_user.id if current_user.role == "field_executive" else None
    service = KPIService(session)
    data = await service.compute_kpis(
        date_from=date_from,
        date_to=date_to,
        lender_id=lender_id,
        product=product,
        source_id=source_id,
        owner_id=owner_id,
    )
    return ApiResponse(data=data)


@router.get("/dashboard/pipeline", response_model=ApiResponse[PipelineResponse])
async def get_pipeline_stages(
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PipelineResponse]:
    """Retrieve pipeline stages breakdown with case volume and average stage velocity."""
    owner_id = current_user.id if current_user.role == "field_executive" else None
    service = DashboardService(session)
    data = await service.get_pipeline(owner_id=owner_id)
    return ApiResponse(data=data)


@router.get("/sources/report", response_model=ApiResponse[SourceReportResponse])
async def get_sources_report(
    date_from: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    source_type: str | None = Query(None, description="Filter by source type"),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[SourceReportResponse]:
    """Retrieve dealer and lead-source performance report."""
    owner_id = current_user.id if current_user.role == "field_executive" else None
    service = SourceReportService(session)
    data = await service.get_source_report(
        date_from=date_from,
        date_to=date_to,
        source_type=source_type,
        owner_id=owner_id,
    )
    return ApiResponse(data=data)


@router.get("/reports/export")
async def export_report_csv(
    request: Request,
    report_type: ReportType = Query("cases", description="Report entity type to export"),
    date_from: date | None = Query(None, description="Start date filter"),
    date_to: date | None = Query(None, description="End date filter"),
    current_user: User = Depends(require_permission(PERM_DATA_EXPORT)),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Export operational data as CSV with mandatory immutable audit logging."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    service = ExportService(session)
    csv_content = await service.export_csv(
        org_id=current_user.org_id,
        user_id=current_user.id,
        user_role=current_user.role,
        report_type=report_type,
        date_from=date_from,
        date_to=date_to,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    filename = f"{report_type}_export_{date.today().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
