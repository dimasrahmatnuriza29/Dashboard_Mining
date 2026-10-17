/* Types mirror backend/app/schemas.py — intelligence pages payload. */

export type Page = 'production' | 'waste'

export interface KpiCard {
  id: string
  label: string
  sub: string
  icon: string           // lucide icon key
  icon_tone: 'blue' | 'green' | 'sky'
  value: number
  decimals: number
  prefix: string
  suffix: string
  delta: string
  delta_tone: 'green' | 'amber' | 'red' | 'slate'
  spark: number[]
  progress: number | null
  progress_min: string
  progress_max: string
}

export interface TrendSeries {
  months: string[]
  actual: (number | null)[]
  forecast: (number | null)[]
  target: number | null
}

export interface TrendDimRow {
  pt_code: string
  pt: string
  commodity: string
  unit: string
  actual: (number | null)[]
  forecast: (number | null)[]
  target_monthly: number | null
  projected: number | null
  target_annual: number | null
  delta_pct: number | null
}

export interface ForecastBadge {
  label: string
  value: number
  decimals: number
  unit: string
  delta: string
}

export interface DonutItem { name: string; value: number; color: string }
export interface DonutChart { items: DonutItem[]; center_top: string; center_bottom: string }

export interface PtProdRow {
  pt: string
  pt_code: string
  color: string
  actual: number
  plan: number
  achievement_pct: number
  delta_pct: number
}

export interface MapSite {
  name: string
  pt: string
  lon: number
  lat: number
  show_label: boolean
  size: number
}

export interface TopSite {
  rank: number
  site: string
  pt: string
  prod: number
  vs_plan: string
  spark: number[]
}

export interface MarketItem { name: string; price: string; delta: string; up: boolean }

export interface InsightItem { kind: 'check' | 'warn'; text: string }

export interface AiBlock { title: string; tag: string; body: string; actions: string[] }

export interface AiFinding { severity: string; title: string; detail: string }
export interface AiRec { level: string; tag: string; text: string }
export interface VizSpec { kind: 'bar' | 'line' | 'pie'; title: string; x: string[]; series: { name: string; data: number[] }[] }
export interface KeyInsightItem { kind: 'check' | 'warn'; text: string }
export interface InsightResp { summary: string; findings: AiFinding[]; recommendations: AiRec[]; viz?: VizSpec | null; key_insights?: KeyInsightItem[]; next_actions?: string[]; generated_at?: string }
export interface ChatResp { reply: string; recommendations: AiRec[]; viz?: VizSpec | null }

export interface ProductionData {
  generated_at: string
  source: string
  periods: string[]
  selected_pt: string
  kpis: KpiCard[]
  trend: TrendSeries
  forecast_badge: ForecastBadge
  trend_dim: TrendDimRow[]
  commodity: DonutChart
  pt_rows: PtProdRow[]
  pt_total: PtProdRow
  ai: AiBlock
  sites: MapSite[]
  pt_colors: Record<string, string>
  top_sites: TopSite[]
  market: MarketItem[]
  key_insights: InsightItem[]
  next_actions: string[]
}

/* ---------- Zero Waste ---------- */

export interface WasteTrend {
  quarters: string[]
  recycled: number[]
  landfill: number[]
  utilization: number[]
}

export interface UtilRing { pt: string; pct: number; yoy: string }

export interface CompSet { key: string; label: string; items: DonutItem[]; center: string }

export interface BarItem { name: string; value: number; color: string }

export interface RevBar { name: string; pot: number; rea: number }

export interface TopOpp { rank: number; opp: string; pt: string; rev: number }

export interface Story { pt: string; gradient: string; title: string; body: string; status: string; image?: string | null }

export interface WasteStream { name: string; volume: number; util: number; rev: number }

export interface PtWaste {
  pt: string
  letter: string
  color: string
  waste: number
  util: number
  rev: number
  streams: WasteStream[]
  monthly: number[]
  monthly_util: number[]
}

export interface AiItem { title: string; body: string }   // body may contain <b> markup

export interface WasteData {
  generated_at: string
  source: string
  periods: string[]
  kpis: KpiCard[]
  trend: WasteTrend
  util_rings: UtilRing[]
  sites: MapSite[]
  pt_colors: Record<string, string>
  ai_items: AiItem[]
  ai_generated_at: string
  comp_sets: CompSet[]
  rev_bars: RevBar[]
  gap_pareto: BarItem[]
  pt_realize: RevBar[]
  top_opps: TopOpp[]
  stories: Story[]
  pt_details: PtWaste[]
  key_insights: InsightItem[]
  next_actions: string[]
}
