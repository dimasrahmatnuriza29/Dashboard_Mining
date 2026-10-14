export interface Kpi {
  id: string
  label: string
  value: number
  unit: string
  decimals: number
  delta: number
  good_when_negative: boolean
  sparkline: number[]
}

export interface TrendPoint {
  date: string
  actual: number | null
  forecast: number | null
  lower: number | null
  upper: number | null
  target: number | null
  gap: number | null
}

export interface TrendRow extends TrendPoint {
  pt_code: string
  commodity: string
  unit: string
}

export interface CompositionSlice {
  name: string
  value: number
}

export interface SiteRow {
  site: string
  commodity: string | null
  production_t: number
  achievement_pct: number
  downtime_h: number
  downtime_avg_h: number | null
  forecast_delta_pct: number
  status: 'On Track' | 'Ahead' | 'Watch' | 'Behind'
}

export interface DashboardData {
  generated_at: string
  source: string
  kpis: Kpi[]
  trend: TrendPoint[]
  trend_dim: TrendRow[]
  composition: CompositionSlice[]
  site_summary: SiteRow[]
  ytd_achievement_pct: number
}

export interface Recommendation {
  level: 'warning' | 'opportunity' | 'info'
  tag: string
  text: string
}

/** What to render inside the drill-down modal — depends on click source. */
export interface DrillSpec {
  title: string
  subtitle?: string
  unit?: string                          // qty suffix for tooltips/labels
  trend?: TrendPoint[]                   // full actual/forecast/target series
  points?: { date: string; value: number }[]  // simple monthly series
  stats?: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }[]
}

export interface ChatResponse {
  reply: string
  recommendations: Recommendation[]
}

export interface Finding {
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface InsightResponse {
  summary: string
  findings: Finding[]
  recommendations: Recommendation[]
}
