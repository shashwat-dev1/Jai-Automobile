import React from 'react'
import { PipelineSummary, PayoutSummary } from './types'
import { formatINR } from './utils'

interface KPIStripProps {
  pipeline: PipelineSummary
  payout: PayoutSummary
}

export const KPIStrip: React.FC<KPIStripProps> = ({ pipeline, payout }) => {
  const cards = [
    {
      label: 'Active Pipeline',
      value: pipeline.active_files_count.toString(),
      subtext: `${pipeline.new_inflow_count} new inflow`,
      accent: '#0f172a',
    },
    {
      label: 'Requested Volume',
      value: formatINR(pipeline.total_loan_amount_requested),
      subtext: 'Current gross pipeline',
      accent: '#334155',
    },
    {
      label: 'Disbursed Volume',
      value: formatINR(pipeline.disbursed_volume),
      subtext: `${pipeline.disbursed_count} files disbursed`,
      accent: '#047857',
    },
    {
      label: 'Expected Commission',
      value: formatINR(payout.total_expected_net),
      subtext: 'Net accrued receivable',
      accent: '#b45309',
    },
    {
      label: 'Collected Payout',
      value: formatINR(payout.total_received_net),
      subtext: `${payout.realisation_rate_pct}% realisation`,
      accent: '#059669',
    },
    {
      label: 'Outstanding Payout',
      value: formatINR(payout.outstanding_net),
      subtext: parseFloat(payout.variance_net) < 0 ? `Shortfall: ${formatINR(Math.abs(parseFloat(payout.variance_net)))}` : 'On track',
      accent: parseFloat(payout.outstanding_net) > 0 ? '#d97706' : '#64748b',
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
