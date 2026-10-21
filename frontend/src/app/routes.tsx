import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './AppShell'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { UsersPage } from '../features/admin/UsersPage'
import { AuditLogPage } from '../features/admin/AuditLogPage'
import { PERMISSIONS } from '../features/auth/types'

import { CaseListPage } from '../features/cases/CaseListPage'
import { CaseDetailPage } from '../features/cases/CaseDetailPage'
import { CaseIntakeWorkspace } from '../features/cases/CaseIntakeWorkspace'
import { PartiesPage } from '../features/parties/PartiesPage'
import { LendersPage } from '../features/lenders/LendersPage'
import { TasksPage } from '../features/workflow/TasksPage'
import { PDDBoardPage } from '../features/pdd/PDDBoardPage'
import { PayoutExpectationsPage } from '../features/payout/PayoutExpectationsPage'
import { PayoutRulesPage } from '../features/payout/PayoutRulesPage'
import { AttentionListPage } from '../features/payout/AttentionListPage'
import { ReconciliationPage } from '../features/payout/ReconciliationPage'
import { OutstandingReportPage } from '../features/payout/OutstandingReportPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { TodayPage } from '../features/dashboard/TodayPage'
import { SourcesReportPage } from '../features/reports/SourcesReportPage'
import { TelecallerWorkspacePage } from '../features/cases/TelecallerWorkspacePage'
import { ReferralPartnersPage } from '../features/referrals/ReferralPartnersPage'
import { GuestReferralPage } from '../features/referrals/GuestReferralPage'
import { AllocateToTelecallerPage } from '../features/cases/AllocateToTelecallerPage'
import { AllocateToPartnerPage } from '../features/cases/AllocateToPartnerPage'
import { TelecallerPerformancePage } from '../features/reports/TelecallerPerformancePage'
import { PartnerPerformancePage } from '../features/reports/PartnerPerformancePage'
import { PayoutDashboardPage } from '../features/payout/PayoutDashboardPage'

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/referral" element={<GuestReferralPage />} />
      <Route path="/refer/:orgSlug" element={<GuestReferralPage />} />

      {/* Authenticated Workspace */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="today" element={<TodayPage />} />

        {/* Core Operations */}
        <Route path="cases" element={<CaseListPage />} />
        <Route path="cases/allocate-telecaller" element={<AllocateToTelecallerPage />} />
        <Route path="allocate-telecaller" element={<Navigate to="/cases/allocate-telecaller" replace />} />
        <Route path="cases/allocate-partner" element={<AllocateToPartnerPage />} />
        <Route path="allocate-partner" element={<Navigate to="/cases/allocate-partner" replace />} />
        <Route path="telecaller-performance" element={<TelecallerPerformancePage />} />
        <Route path="partner-performance" element={<PartnerPerformancePage />} />
        <Route
          path="payout-dashboard"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <PayoutDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="cases/new"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.CASES_CREATE}>
              <CaseIntakeWorkspace />
            </ProtectedRoute>
          }
        />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="telecaller" element={<TelecallerWorkspacePage />} />
        <Route path="referrals" element={<ReferralPartnersPage />} />
        <Route path="referral-partners" element={<ReferralPartnersPage />} />
        <Route path="pdd" element={<PDDBoardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="customers" element={<PartiesPage />} />
        <Route path="sources" element={<Navigate to="/cases" replace />} />
        <Route path="reports/sources" element={<SourcesReportPage />} />
        <Route path="lenders" element={<LendersPage />} />

        {/* Finance & Payouts */}
        <Route
          path="payouts"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <PayoutExpectationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payout"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <PayoutExpectationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payout/rules"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <PayoutRulesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payout/attention"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <AttentionListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payout/reconciliation"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <ReconciliationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payout/outstanding"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.PAYOUT_READ}>
              <OutstandingReportPage />
            </ProtectedRoute>
          }
        />

        {/* Administration & Governance */}
        <Route
          path="admin/users"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.USERS_MANAGE}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit"
          element={
            <ProtectedRoute requiredPermission={PERMISSIONS.AUDIT_READ}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/organizations"
          element={<Navigate to="/admin/users" replace />}
        />
        <Route
          path="admin/branding"
          element={<Navigate to="/admin/users" replace />}
        />
        <Route
          path="admin/tenants"
          element={<Navigate to="/admin/users" replace />}
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return (
    <div style={{ padding: 'var(--spacing-12)', textAlign: 'center' }}>
      <h1 className="type-h1">404</h1>
      <p className="type-body-lg" style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
        Requested operational view does not exist.
      </p>
    </div>
  )
}

export default AppRoutes
