import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import {
  getISTDateParts,
  type FinancingPartnerAllocation,
  type FinancingPartnerMaster,
} from '../../shared/lib/leadQueues'
import './PartnerPerformancePage.css'

interface PartnerRowMetric {
  partnerId: string
  partnerName: string
  partnerType: 'bank' | 'nbfc'
  leadsAllocated: number
  inProcess: number
  sanctionedCount: number
  rejectedCount: number
  totalSanctionAmount: number
  decidedSanctionRate: string // percentage or "-"
  allocatedSanctionRate: string // percentage or "-"
  allocations: FinancingPartnerAllocation[]
}

export function PartnerPerformancePage() {
  const currentMonth = useMemo(() => getISTDateParts().reportingMonth, [])
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth)
  const [partners, setPartners] = useState<FinancingPartnerMaster[]>([])
  const [allAllocations, setAllAllocations] = useState<FinancingPartnerAllocation[]>([])
  const [selectedPartnerDetail, setSelectedPartnerDetail] = useState<PartnerRowMetric | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [partnersRes, allocsRes] = await Promise.all([
        api.get<FinancingPartnerMaster[]>('/financing-partners'),
        api.get<FinancingPartnerAllocation[]>('/partner-allocations'),
      ])
      setPartners(Array.isArray(partnersRes) ? partnersRes : [])
      setAllAllocations(Array.isArray(allocsRes) ? allocsRes : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load partner performance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const handleUpdate = () => {
      loadData()
    }
    window.addEventListener('dsa_os_partner_allocations_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dsa_os_partner_allocations_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [loadData])

  // Aggregate metrics per partner for the selected reporting period in IST
  const partnerMetrics: PartnerRowMetric[] = useMemo(() => {
    return partners.map((partner) => {
      const partnerAllocs = allAllocations.filter((a) => a.financingPartnerId === partner.id)

      // Allocations in this period by allocatedAt in IST
      const periodAllocs = partnerAllocs.filter((a) => {
        if (!a.allocatedAt) return false
        const { reportingMonth } = getISTDateParts(a.allocatedAt)
        return reportingMonth === selectedPeriod
      })

      const inProcess = partnerAllocs.filter(
        (a) => a.status === 'Allocated' || a.status === 'In Process'
      ).length

      // Sanctioned allocations in period
      const sanctionedInPeriod = partnerAllocs.filter((a) => {
        if (a.status !== 'Sanctioned') return false
        const relevantDate = a.sanctionedAt || a.allocatedAt
        if (!relevantDate) return false
        const { reportingMonth } = getISTDateParts(relevantDate)
        return reportingMonth === selectedPeriod
      })

      // Rejected allocations in period
      const rejectedInPeriod = partnerAllocs.filter((a) => {
        if (a.status !== 'Rejected') return false
        const relevantDate = a.rejectedAt || a.allocatedAt
        if (!relevantDate) return false
        const { reportingMonth } = getISTDateParts(relevantDate)
        return reportingMonth === selectedPeriod
      })

      const sanctionedCount = sanctionedInPeriod.length
      const rejectedCount = rejectedInPeriod.length
      const decidedCount = sanctionedCount + rejectedCount
      const allocatedCount = periodAllocs.length

      const totalSanctionAmount = sanctionedInPeriod.reduce(
        (sum, a) => sum + (a.sanctionAmount || 0),
        0
      )

      const decidedSanctionRate =
        decidedCount > 0 ? `${((sanctionedCount / decidedCount) * 100).toFixed(1)}%` : '—'
      const allocatedSanctionRate =
        allocatedCount > 0 ? `${((sanctionedCount / allocatedCount) * 100).toFixed(1)}%` : '—'

      return {
        partnerId: partner.id,
        partnerName: partner.name,
        partnerType: partner.type,
        leadsAllocated: allocatedCount,
        inProcess,
        sanctionedCount,
        rejectedCount,
        totalSanctionAmount,
        decidedSanctionRate,
        allocatedSanctionRate,
        allocations: partnerAllocs,
      }
    })
  }, [partners, allAllocations, selectedPeriod])

  // Summary KPI Cards across all partners
  const summary = useMemo(() => {
    const totalAllocated = partnerMetrics.reduce((sum, p) => sum + p.leadsAllocated, 0)
    const totalInProcess = partnerMetrics.reduce((sum, p) => sum + p.inProcess, 0)
    const totalSanctioned = partnerMetrics.reduce((sum, p) => sum + p.sanctionedCount, 0)
    const totalVolume = partnerMetrics.reduce((sum, p) => sum + p.totalSanctionAmount, 0)

    return { totalAllocated, totalInProcess, totalSanctioned, totalVolume }
  }, [partnerMetrics])

  return (
    <div className="performance-page-container">
      <div className="performance-header">
        <div className="performance-title-group">
          <h1>Partner Performance</h1>
          <p>Traceable underwriting performance, sanction rates, and loan volume across Banks & NBFCs.</p>
        </div>

        <div className="period-filter-group">
          <label htmlFor="period-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Period (IST):
          </label>
          <select
            id="period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
            <option value="2026-07">July 2026</option>
            <option value="2026-06">June 2026</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="alert-result-banner error" role="alert">
          {error}
        </div>
      )}

      {/* Top 4 Summary Cards */}
      <div className="performance-summary-cards">
        <div className="perf-card">
          <div className="perf-card-label">Total Allocated in Period</div>
          <div className="perf-card-value">{summary.totalAllocated}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Currently In Process</div>
          <div className="perf-card-value" style={{ color: '#d97706' }}>{summary.totalInProcess}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Total Sanctioned Loans</div>
          <div className="perf-card-value" style={{ color: '#16a34a' }}>{summary.totalSanctioned}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Sanctioned Volume</div>
          <div className="perf-card-value">{formatINR(summary.totalVolume)}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>Loading partner performance...</div>
      ) : (
        <div className="allocate-table-wrapper">
          <table className="allocate-table" aria-label="Financing Partner Performance Ranking">
            <thead>
              <tr>
                <th>Financing Partner</th>
                <th>Type</th>
                <th>Allocated (Period)</th>
                <th>In Process</th>
                <th>Sanctioned</th>
                <th>Rejected</th>
                <th>Sanctioned Volume</th>
                <th>Sanction Rate (Decided)</th>
                <th>Sanction Rate (Allocated)</th>
              </tr>
            </thead>
            <tbody>
              {partnerMetrics.map((p) => (
                <tr
                  key={p.partnerId}
                  className="clickable-row"
                  onClick={() => setSelectedPartnerDetail(p)}
                  title="Click to view detailed contributing allocations"
                >
                  <td>
                    <div className="lead-name-cell">{p.partnerName}</div>
                    <div className="lead-id-sub">{p.partnerId}</div>
                  </td>
                  <td>
                    <span className={`partner-type-tag ${p.partnerType}`}>{p.partnerType}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.leadsAllocated}</td>
                  <td style={{ color: '#d97706', fontWeight: 600 }}>{p.inProcess}</td>
                  <td style={{ color: '#16a34a', fontWeight: 600 }}>{p.sanctionedCount}</td>
                  <td style={{ color: '#dc2626' }}>{p.rejectedCount}</td>
                  <td style={{ fontWeight: 700 }}>{formatINR(p.totalSanctionAmount)}</td>
                  <td style={{ fontWeight: 600 }}>{p.decidedSanctionRate}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{p.allocatedSanctionRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer: Contributing Allocations */}
      {selectedPartnerDetail && (
        <div
          className="perf-detail-drawer-backdrop"
          onClick={() => setSelectedPartnerDetail(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="perf-detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>{selectedPartnerDetail.partnerName} — Allocated Leads</h2>
                <span className="lead-id-sub">Total Allocations: {selectedPartnerDetail.allocations.length}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedPartnerDetail(null)}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              {selectedPartnerDetail.allocations.length === 0 ? (
                <p>No allocation records found for this partner.</p>
              ) : (
                selectedPartnerDetail.allocations.map((alloc) => {
                  const allocDate = alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
                  const statusClass = alloc.status.toLowerCase().replace(/\s+/g, '-')

                  return (
                    <div key={alloc.id} className="alloc-detail-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <strong>Lead: </strong>
                          <a href={`/cases/${alloc.leadId}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                            {alloc.leadId}
                          </a>
                        </div>
                        <span className={`status-badge ${statusClass}`}>{alloc.status}</span>
                      </div>

                      <div style={{ fontSize: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--color-text-secondary)' }}>
                        <div>
                          <span>Requested: </span>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{formatINR(alloc.requestedAmountSnapshot)}</strong>
                        </div>
                        <div>
                          <span>Sanctioned: </span>
                          <strong style={{ color: alloc.sanctionAmount ? '#15803d' : 'var(--color-text-primary)' }}>
                            {alloc.sanctionAmount ? formatINR(alloc.sanctionAmount) : '—'}
                          </strong>
                        </div>
                        <div>
                          <span>Allocated On: </span>
                          <span>{allocDate}</span>
                        </div>
                        {alloc.rejectionReason && (
                          <div style={{ gridColumn: 'span 2', color: '#dc2626' }}>
                            <span>Reason: </span>
                            <span>{alloc.rejectionReason}</span>
                          </div>
                        )}
                      </div>

                      {Array.isArray(alloc.history) && alloc.history.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '11px', color: '#64748b' }}>
                          <strong>History:</strong> {alloc.history.map((h) => `${h.toStatus} (${h.reason || 'updated'})`).join(' → ')}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PartnerPerformancePage
