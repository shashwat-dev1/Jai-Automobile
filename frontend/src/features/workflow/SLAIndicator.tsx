import React from 'react'
import type { SLAInfo } from './types'
import './SLAIndicator.css'

interface SLAIndicatorProps {
  sla?: SLAInfo | null
  compact?: boolean
}

export const SLAIndicator: React.FC<SLAIndicatorProps> = ({ sla, compact = false }) => {
  if (!sla) return null

  const { ageing_hours, benchmark_sla_hours, is_stuck, stuck_hours } = sla

  const formatHours = (hours: number): string => {
    if (hours < 1) return '< 1h'
    if (hours < 24) return `${Math.round(hours)}h`
    const days = Math.floor(hours / 24)
    const remHours = Math.round(hours % 24)
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }

  if (compact) {
    if (is_stuck) {
      return (
        <span
          className="sla-pill sla-stuck-compact"
          title={`Stuck by ${formatHours(stuck_hours)} beyond benchmark SLA (${formatHours(benchmark_sla_hours)})`}
        >
          ⚠ Stuck +{formatHours(stuck_hours)}
        </span>
      )
    }
    return (
      <span className="sla-pill sla-healthy-compact" title={`Benchmark SLA: ${formatHours(benchmark_sla_hours)}`}>
        ⏱ {formatHours(ageing_hours)}
      </span>
    )
  }

  return (
    <div className={`sla-badge ${is_stuck ? 'is-stuck' : 'is-healthy'}`}>
      <div className="sla-badge-icon">{is_stuck ? '⚠' : '⏱'}</div>
      <div className="sla-badge-info">
        <span className="sla-title">
          {is_stuck ? `STUCK (+${formatHours(stuck_hours)})` : `${formatHours(ageing_hours)} in stage`}
        </span>
        <span className="sla-subtitle">
          Benchmark SLA: {formatHours(benchmark_sla_hours)}
        </span>
      </div>
    </div>
  )
}
