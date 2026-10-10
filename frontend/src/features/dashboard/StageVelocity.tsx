import React from 'react'
import { FunnelStageItem } from './types'
import { formatINR } from './utils'

interface StageVelocityProps {
  stages: FunnelStageItem[]
}

export const StageVelocity: React.FC<StageVelocityProps> = ({ stages }) => {
  const stageList = Array.isArray(stages) ? stages : []
  const maxCount = Math.max(...stageList.map((s) => s.count || 0), 1)

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 className="type-h3" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
            Lead Conversion Funnel & Stage Velocity
          </h3>
          <p className="type-body-xs" style={{ color: '#475569', margin: '2px 0 0', fontSize: '12px' }}>
            Cold lead progression from intake to qualified client conversion
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {stageList.map((st) => {
          const widthPct = Math.max(8, (st.count / maxCount) * 100)

          return (
            <div key={st.stage} className="stage-velocity-row">
              <div>
                <span className="type-body-sm" style={{ fontWeight: 600, color: '#0f172a' }}>
                  {st.stage_label}
                </span>
                {st.is_bottleneck && (
                  <span
                    style={{
                      marginLeft: '6px',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      padding: '1px 6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '4px',
                    }}
                  >
                    STUCK
                  </span>
                )}
              </div>

              {/* Velocity Bar */}
              <div style={{ background: '#f1f5f9', height: '18px', width: '100%', position: 'relative', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: st.is_bottleneck ? '#dc2626' : '#0f172a',
                    width: `${widthPct}%`,
                    height: '100%',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Volume / Count */}
              <div style={{ textAlign: 'right' }}>
                <span className="type-mono-sm" style={{ fontWeight: 700, color: '#0f172a' }}>
                  {st.count} {st.count === 1 ? 'lead' : 'leads'}
                </span>
                <span className="type-body-xs" style={{ color: '#475569', display: 'block', fontSize: '11px' }}>
                  {formatINR(st.total_amount)}
                </span>
              </div>

              {/* Avg Ageing */}
              <div style={{ textAlign: 'right' }}>
                <span className="type-mono-sm" style={{ fontWeight: 600, color: parseFloat(st.avg_ageing_hours) > 48 ? '#b45309' : '#64748b' }}>
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

