/**
 * Config-driven dashboard layout.
 *
 * Rows render top→bottom, each on a 3-col grid. Widget `span` maps to
 * lg:col-span-N. Adding a widget = one entry here — nothing else changes.
 * When the Snowflake schema lands, new widget types plug into the same
 * data bundle (DashboardData).
 */

export type WidgetType = 'kpiGrid' | 'trend' | 'donut' | 'siteTable' | 'gauge'

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  subtitle?: string
  span?: 1 | 2 | 3
}

export interface RowConfig {
  id: string
  /** grid columns for this row at lg+ (default 3) */
  cols?: 2 | 3
  widgets: WidgetConfig[]
}

export const DASHBOARD_ROWS: RowConfig[] = [
  {
    id: 'kpis',
    widgets: [{ id: 'kpis', type: 'kpiGrid', title: 'KPIs' }],
  },
  {
    id: 'main',
    widgets: [
      {
        id: 'trend',
        type: 'trend',
        title: 'Production Trend & Forecast',
        subtitle: 'Actual vs ML forecast — 95% confidence band · click point to drill down',
        span: 2,
      },
      {
        id: 'donut',
        type: 'donut',
        title: 'Material Composition',
        subtitle: 'Production share by commodity · last 12 months — click slice to drill down',
      },
    ],
  },
  {
    id: 'detail',
    widgets: [
      {
        id: 'sites',
        type: 'siteTable',
        title: 'Site Summary',
        subtitle: 'Aggregated from ANALYTICS schema',
        span: 2,
      },
      {
        id: 'ytd',
        type: 'gauge',
        title: 'YTD Target Achievement',
        subtitle: 'Annual plan vs actual',
      },
    ],
  },
]
