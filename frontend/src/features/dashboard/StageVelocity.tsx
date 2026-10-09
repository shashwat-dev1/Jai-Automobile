import React from 'react'
import { FunnelStageItem } from './types'
import { formatINR } from './utils'

interface StageVelocityProps {
  stages: FunnelStageItem[]
}

export const StageVelocity: React.FC<StageVelocityProps> = ({ stages }) => {
  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        padding: 'var(--spacing-5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
        <div>
          <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            File Movement & Stage Velocity
          </h3>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            Pipeline conversion progression with bottleneck detection
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        {stages.map((st) => {
          const widthPct = Math.max(8, (st.count / maxCount) * 100)

          return (
            <div key={st.stage} className="stage-velocity-row">
              <div>
                <span className="type-body-sm" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {st.stage_label}
                </span>
                {st.is_bottleneck && (
                  <span
                    style={{
                      marginLeft: '6px',
                      background: 'rgba(217, 83, 79, 0.15)',
                      color: '#d9534f',
                      padding: '1px 5px',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '2px',
                    }}
                  >
                    STUCK
                  </span>
                )}
              </div>

              {/* Velocity Bar */}
              <div style={{ background: 'var(--color-border-light)', height: '18px', width: '100%', position: 'relative' }}>
                <div
                  style={{
                    background: st.is_bottleneck ? '#d9534f' : 'var(--color-primary)',
                    width: `${widthPct}%`,
                    height: '100%',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Volume / Count */}
              <div style={{ textAlign: 'right' }}>
                <span className="type-mono-sm" style={{ fontWeight: 700 }}>
                  {st.count} {st.count === 1 ? 'file' : 'files'}
                </span>
                <span className="type-body-xs" style={{ color: 'var(--color-text-secondary)', display: 'block' }}>
                  {formatINR(st.total_amount)}
                </span>
              </div>

              {/* Avg Ageing */}
              <div style={{ textAlign: 'right' }}>
                <span className="type-mono-sm" style={{ color: parseFloat(st.avg_ageing_hours) > 48 ? 'var(--color-status-warning)' : 'var(--color-text-secondary)' }}>
                  {st.avg_ageing_hours}h avg
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
