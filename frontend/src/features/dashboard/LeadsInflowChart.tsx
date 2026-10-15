import React, { useState } from 'react'
import type { ChartPeriodItem } from './dashboardDataService'

interface LeadsInflowChartProps {
  data: ChartPeriodItem[]
}

export const LeadsInflowChart: React.FC<LeadsInflowChartProps> = ({ data }) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)

  // Max scale reference for y-axis
  const maxVal = 40

  return (
    <section className="stitch-chart-card" aria-label="Leads Inflow vs Contacted Velocity">
      <div className="stitch-chart-header">
        <div>
          <h2 className="stitch-chart-title">Leads Inflow vs Contacted</h2>
          <p className="stitch-chart-subtitle">
            Outreach velocity and engagement across recent periods
          </p>
        </div>

        {/* Legend */}
        <div className="stitch-chart-legend">
          <div className="stitch-legend-item">
            <span className="stitch-chart-square stitch-square-inflow" aria-hidden="true" />
            <span className="stitch-legend-text">Leads Inflow</span>
          </div>
          <div className="stitch-legend-item">
            <span className="stitch-chart-square stitch-square-contacted" aria-hidden="true" />
            <span className="stitch-legend-text">Contacted</span>
          </div>
        </div>
      </div>

      <div className="stitch-chart-canvas">
        {/* Y-Axis Gridlines */}
        <div className="stitch-chart-grid" aria-hidden="true">
          <div className="stitch-grid-line">
            <span className="stitch-grid-label">40</span>
            <div className="stitch-grid-rule" />
          </div>
          <div className="stitch-grid-line">
            <span className="stitch-grid-label">25</span>
            <div className="stitch-grid-rule" />
          </div>
          <div className="stitch-grid-line">
            <span className="stitch-grid-label">10</span>
            <div className="stitch-grid-rule" />
          </div>
          <div className="stitch-grid-line">
            <span className="stitch-grid-label">0</span>
            <div className="stitch-grid-rule stitch-grid-base" />
          </div>
        </div>

        {/* Grouped Columns */}
        <div className="stitch-chart-columns">
          {data.map((item) => {
            const inflowHeight = Math.min(100, (item.inflow / maxVal) * 100)
            const contactedHeight = Math.min(100, (item.contacted / maxVal) * 100)
            const isHovered = activeTooltip === item.period_label

            return (
              <div
                key={item.period_label}
                className="stitch-chart-col-group"
                onMouseEnter={() => setActiveTooltip(item.period_label)}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="stitch-chart-tooltip" role="tooltip">
                    <div className="stitch-tooltip-label">{item.period_label}</div>
                    <div className="stitch-tooltip-row">
                      <span className="stitch-tooltip-dot stitch-dot-inflow" />
                      <span>Inflow: {item.inflow}</span>
                    </div>
                    <div className="stitch-tooltip-row">
                      <span className="stitch-tooltip-dot stitch-dot-contacted" />
                      <span>Contacted: {item.contacted}</span>
                    </div>
                  </div>
                )}

                {/* Bars Pair */}
                <div className="stitch-bar-pair">
                  <div
                    className="stitch-bar stitch-bar-inflow"
                    style={{ height: `${inflowHeight}%` }}
                    title={`Inflow: ${item.inflow}`}
                  />
                  <div
                    className="stitch-bar stitch-bar-contacted"
                    style={{ height: `${contactedHeight}%` }}
                    title={`Contacted: ${item.contacted}`}
                  />
                </div>

                {/* Period X-Axis Label */}
                <div className="stitch-x-label">{item.period_label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
