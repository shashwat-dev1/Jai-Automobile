/**
 * DSA OS — Jai Automobiles Admin Dashboard
 *
 * Implements the executive Stitch design reference (Desktop & Mobile):
 * - Clean business overview ("Your business at a glance.")
 * - Functional date filters (All Time, Last 30 Days, Last 90 Days)
 * - Export CSV of filtered dataset
 * - 6 KPI cards (Leads, Active Calling, Interested, Follow-ups, Converted, Unassigned)
 * - Due Today priority actions panel
 * - Telecaller Performance ranking panel
 * - Leads Inflow vs Contacted velocity bar chart
 */

import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import { useAuthStore } from '../auth/useAuth'
import { TelecallerDashboard } from './TelecallerDashboard'
import { DashboardKPIs } from './DashboardKPIs'
import { DueTodaySection } from './DueTodaySection'
import { TelecallerPerformanceSection } from './TelecallerPerformanceSection'
import { LeadsInflowChart } from './LeadsInflowChart'
import { StitchDashboardData } from './dashboardDataService'
import './DashboardPage.css'

export const DashboardPage: React.FC = () => {
  const user = useAuthStore((s) => s.user)

  // Telecallers access their dedicated outreach workspace
  if (user?.role === 'telecaller') {
    return <TelecallerDashboard />
  }

  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all')
  const [data, setData] = useState<StitchDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Fetch dashboard overview according to selected date range
  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = ''
      const now = new Date()

      if (dateRange === 'last30') {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        query = `?date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      } else if (dateRange === 'last90') {
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        query = `?date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      }

      const res = await api.get<StitchDashboardData>(`/dashboard/overview${query}`)
      setData(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load executive dashboard data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Direct CSV Export of filtered records
  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const now = new Date()
      let dateFrom: Date | null = null
      if (dateRange === 'last30') {
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      } else if (dateRange === 'last90') {
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      }

      // Fetch current cases
      const cases = await api.get<any[]>('/cases').catch(() => [])
      let exportable = Array.isArray(cases) ? cases : []

      if (dateFrom) {
        const fromMs = dateFrom.getTime()
        exportable = exportable.filter((c) => {
          const t = new Date(c.created_at).getTime()
          return !isNaN(t) && t >= fromMs
        })
      }

      const headers = [
        'Lead Reference',
        'Customer Name',
        'Mobile',
        'Vehicle / Product',
        'Requested Loan (INR)',
        'Status',
        'Assigned Telecaller',
        'Call Outcome',
        'Created Date',
      ]

      const rows = exportable.map((c) => [
        c.case_no || c.id,
        `"${c.primary_applicant_name || c.applicant_name || ''}"`,
        c.primary_applicant_mobile || c.mobile || '',
        `"${c.vehicle_summary || c.vehicle_details || c.product || ''}"`,
        c.loan_amount_requested || c.applied_loan_amount || 0,
        c.status || '',
        `"${c.assigned_telecaller_name || 'Unassigned'}"`,
        c.call_outcome || '',
        c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : '',
      ])

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `jai_automobiles_leads_${dateRange}_${now.toISOString().split('T')[0]}.csv`
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      // Graceful fallback
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="stitch-dashboard-container">
      {/* Top Header & Date Filter Bar */}
      <div className="stitch-dashboard-header">
        <div className="stitch-dashboard-title-group">
          <div className="stitch-title-row">
            <h1 className="stitch-dashboard-title">Dashboard</h1>

            {/* Mobile Export Button (Circular download icon next to title) */}
            <button
              type="button"
              className="stitch-mobile-export-btn"
              onClick={handleExportCSV}
              disabled={isExporting}
              aria-label="Export leads to CSV"
              title="Export CSV"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
          <p className="stitch-dashboard-subtitle">Your business at a glance.</p>
        </div>

        {/* Date Filter & Desktop Export Button */}
        <div className="stitch-controls-group">
          {/* Segmented Date Range Filter */}
          <div className="stitch-date-filter" role="tablist" aria-label="Date Range Filter">
            <button
              type="button"
              role="tab"
              aria-selected={dateRange === 'all'}
              className={`stitch-filter-tab ${dateRange === 'all' ? 'is-active' : ''}`}
              onClick={() => setDateRange('all')}
            >
              All Time
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dateRange === 'last30'}
              className={`stitch-filter-tab ${dateRange === 'last30' ? 'is-active' : ''}`}
              onClick={() => setDateRange('last30')}
            >
              <span className="stitch-tab-desktop">Last 30 Days</span>
              <span className="stitch-tab-mobile">30 Days</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dateRange === 'last90'}
              className={`stitch-filter-tab ${dateRange === 'last90' ? 'is-active' : ''}`}
              onClick={() => setDateRange('last90')}
            >
              <span className="stitch-tab-desktop">Last 90 Days</span>
              <span className="stitch-tab-mobile">90 Days</span>
            </button>
          </div>

          {/* Desktop Export CSV Button */}
          <button
            type="button"
            className="stitch-desktop-export-btn"
            onClick={handleExportCSV}
            disabled={isExporting}
            aria-label="Export leads to CSV"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="stitch-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={fetchDashboardData} className="stitch-retry-btn">
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton Indicator */}
      {loading && !data && (
        <div className="stitch-loading-state" role="status">
          <div className="stitch-loading-spinner" aria-hidden="true" />
          <p className="stitch-loading-text">Loading executive dashboard metrics...</p>
        </div>
      )}

      {/* Main Dashboard Content */}
      {data && (
        <div className="stitch-dashboard-content">
          {/* 1. Six KPI Cards */}
          <DashboardKPIs
            leadsTotal={data.leads_total}
            leadsNewCount={data.leads_new_count}
            activeCallingCount={data.active_calling_count}
            interestedCount={data.interested_count}
            followUpsCount={data.follow_ups_count}
            convertedClientsCount={data.converted_clients_count}
            conversionRatePct={data.conversion_rate_pct}
            unassignedLeadsCount={data.unassigned_leads_count}
          />

          {/* 2. Middle Section: Due Today (Left) + Telecaller Performance (Right) */}
          <div className="stitch-middle-grid">
            <DueTodaySection
              unassignedCount={data.due_today_data?.unassigned_count ?? data.unassigned_leads_count}
              followUpsCount={data.due_today_data?.follow_ups_count ?? data.follow_ups_count}
              interestedCount={data.due_today_data?.interested_count ?? data.interested_count}
            />

            <TelecallerPerformanceSection telecallers={data.telecaller_performance || []} />
          </div>

          {/* 3. Bottom Section: Leads Inflow vs Contacted Grouped Bar Chart */}
          <LeadsInflowChart data={data.chart_data || []} />
        </div>
      )}
    </div>
  )
}

export default DashboardPage
