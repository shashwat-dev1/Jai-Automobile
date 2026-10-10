import React from 'react'
import { PipelineSummary, PayoutSummary } from './types'
import { formatINR } from './utils'

interface KPIStripProps {
  pipeline: PipelineSummary
  payout: PayoutSummary
}

export const KPIStrip: React.FC<KPIStripProps> = ({ pipeline, payout }) => {
  const pl = pipeline || ({} as Partial<PipelineSummary>)
  const po = payout || ({} as Partial<PayoutSummary>)
  const varianceNet = parseFloat(po.variance_net || '0') || 0
  const outstandingNet = parseFloat(po.outstanding_net || '0') || 0

  const cards = [
    {
      label: 'Active Pipeline',
      value: (pl.active_files_count ?? 0).toString(),
      subtext: `${pl.new_inflow_count ?? 0} new inflow`,
      accent: '#0f172a',
    },
    {
      label: 'Requested Volume',
      value: formatINR(pl.total_loan_amount_requested),
      subtext: 'Current gross pipeline',
      accent: '#334155',
    },
    {
      label: 'Disbursed Volume',
      value: formatINR(pl.disbursed_volume),
      subtext: `${pl.disbursed_count ?? 0} files disbursed`,
      accent: '#047857',
    },
    {
      label: 'Expected Commission',
      value: formatINR(po.total_expected_net),
      subtext: 'Net accrued receivable',
      accent: '#b45309',
    },
    {
      label: 'Collected Payout',
      value: formatINR(po.total_received_net),
      subtext: `${po.realisation_rate_pct ?? '0'}% realisation`,
      accent: '#059669',
    },
    {
      label: 'Outstanding Payout',
      value: formatINR(po.outstanding_net),
      subtext: varianceNet < 0 ? `Shortfall: ${formatINR(Math.abs(varianceNet))}` : 'On track',
      accent: outstandingNet > 0 ? '#d97706' : '#64748b',
    },
  ]

  return (
    <div className="kpi-grid">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="kpi-card"
          style={{
            borderLeft: `4px solid ${card.accent}`,
          }}
        >
          <div className="kpi-label">
            {card.label}
          </div>
          <div className="kpi-value">
            {card.value}
          </div>
          <div className="kpi-subtext">
            {card.subtext}
          </div>
        </div>
      ))}
    </div>
  )
}
