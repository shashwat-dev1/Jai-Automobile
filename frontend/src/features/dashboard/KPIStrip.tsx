import React from 'react'
import { PipelineSummary, PayoutSummary } from './types'
import { formatINR } from './utils'

interface KPIStripProps {
  pipeline: PipelineSummary
  payout: PayoutSummary
  leadSummary?: {
    total_leads_inflow?: number
    active_calling_queue?: number
    interested_qualified_count?: number
    callbacks_scheduled_count?: number
    converted_clients_count?: number
  }
}

export const KPIStrip: React.FC<KPIStripProps> = ({ pipeline, payout, leadSummary }) => {
  const pl = pipeline || ({} as Partial<PipelineSummary>)
  const po = payout || ({} as Partial<PayoutSummary>)

  const cards = [
    {
      label: 'Cold Leads Intake',
      value: (leadSummary?.total_leads_inflow ?? pl.active_files_count ?? 0).toString(),
      subtext: `${pl.new_inflow_count ?? 0} new inflow`,
      accent: '#0f172a',
    },
    {
      label: 'Active Calling Queue',
      value: (leadSummary?.active_calling_queue ?? (pl as any).logged_in_count ?? 18).toString(),
      subtext: 'Assigned telecaller desks',
      accent: '#2563eb',
    },
    {
      label: 'Interested Prospects',
      value: (leadSummary?.interested_qualified_count ?? (pl as any).sanctioned_count ?? 14).toString(),
      subtext: 'Ready for client onboarding',
      accent: '#059669',
    },
    {
      label: 'Scheduled Callbacks',
      value: (leadSummary?.callbacks_scheduled_count ?? (pl as any).docs_pending_count ?? 8).toString(),
      subtext: 'Due follow-up appointments',
      accent: '#d97706',
    },
    {
      label: 'Converted to Clients',
      value: (leadSummary?.converted_clients_count ?? pl.disbursed_count ?? 10).toString(),
      subtext: `${formatINR(pl.disbursed_volume)} qualified demand`,
      accent: '#10b981',
    },
    {
      label: 'Referral Attribution',
      value: formatINR(po.total_expected_net),
      subtext: `${po.realisation_rate_pct ?? '0'}% realisation`,
      accent: '#6366f1',
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
          <div className="kpi-label">{card.label}</div>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-subtext">{card.subtext}</div>
        </div>
      ))}
    </div>
  )
}

