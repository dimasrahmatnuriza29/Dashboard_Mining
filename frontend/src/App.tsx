import { useEffect, useMemo, useState } from 'react'
import { Filter, Loader2 } from 'lucide-react'
import Header from './components/Header'
import HeroStrip from './components/HeroStrip'
import KpiGrid from './components/KpiGrid'
import Panel from './components/Panel'
import SiteSummaryTable, { ExportButton } from './components/SiteSummaryTable'
import DrillModal from './components/DrillModal'
import AiPanel from './components/AiPanel'
import EChart from './components/EChart'
import { DASHBOARD_ROWS, type WidgetConfig } from './config/dashboard'
import { fetchDashboard } from './api'
import { donutOption, fmtQty, gaugeOption, trendOption, MAX_SLICES } from './lib/chartOptions'
import type { DashboardData, DrillSpec, Kpi, SiteRow, TrendPoint } from './types'

const DELAYS = ['d2', 'd3', 'd4', 'd5']

// static class maps — Tailwind only generates literal class names
const SPAN_CLS = { 1: '', 2: 'lg:col-span-2', 3: 'lg:col-span-3' } as const
const COLS_CLS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' } as const

// aggregated views sum tonnage units only; a single commodity keeps its unit
const TON_UNITS = new Set(['WMT', 'TON', 'MTON', 'TON SN', 'TO', 'TNI', 'T', 'TONS', 'TONNE', 'TONNES'])
const MEASURES = ['actual', 'forecast', 'lower', 'upper', 'target', 'gap'] as const

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<DrillSpec | null>(null)
  const [selPT, setSelPT] = useState('ANTAM')
  const [selCom, setSelCom] = useState('CHEMICAL GRADE ALUMINA')
  const [gPt, setGPt] = useState('ALL')       // global scope — every panel except trend
  const [gAsof, setGAsof] = useState('')      // '' = latest month with actuals
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setRefreshing(true)
    fetchDashboard(gPt, gAsof || undefined)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setRefreshing(false))
  }, [gPt, gAsof])

  const dim = useMemo(() => data?.trend_dim ?? [], [data])
  const latestMo = useMemo(
    () => dim.filter((r) => r.actual != null).map((r) => r.date).sort().pop()?.slice(0, 7) ?? '',
    [dim],
  )
  const ptOptions = useMemo(() => [...new Set(dim.map((r) => r.pt_code))].sort(), [dim])
  // only commodities that actually have a forecast (FVT/FORECAST coverage)
  const comOptions = useMemo(
    () =>
      [...new Set(dim.filter((r) => r.forecast != null && (selPT === 'ALL' || r.pt_code === selPT)).map((r) => r.commodity))].sort(),
    [dim, selPT],
  )

  // aggregate dim rows into a series for the current PT × commodity selection
  // trailing 'YYYY-MM' labels ending at the latest actual month
  const lastMonths = (n: number) => {
    if (!latestMo) return Array<string>(n).fill('')
    const [y, m] = latestMo.split('-').map(Number)
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(y, m - 1 - (n - 1 - i), 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const scopeLabel = `${gPt === 'ALL' ? 'All PT' : gPt}${gAsof ? ` · as of ${gAsof}` : ''}`

  const drillKpi = (k: Kpi) =>
    setDrill({
      title: k.label,
      subtitle: `Monthly · ${scopeLabel}`,
      unit: k.unit === '$' || k.unit === 'Rp' ? 'Rp' : k.unit,
      points: k.sparkline.map((v, i, a) => ({ date: lastMonths(a.length)[i], value: v })),
    })

  const drillCommodity = (name: string) => {
    if (!data) return
    const top = [...data.composition].sort((a, b) => b.value - a.value).slice(0, MAX_SLICES).map((s) => s.name)
    const comms = [...new Set(dim.map((r) => r.commodity))]
    const picked = name.startsWith('Others')
      ? comms.filter((c) => !top.includes(c))
      : comms.filter((c) => titleCase(c) === name)
    const byDate = new Map<string, number>()
    dim.filter((r) => picked.includes(r.commodity) && r.actual != null)
      .forEach((r) => byDate.set(r.date, (byDate.get(r.date) ?? 0) + (r.actual ?? 0)))
    const points = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
    setDrill({
      title: `Material — ${name}`,
      subtitle: `${picked.length} commodit${picked.length === 1 ? 'y' : 'ies'} · ${scopeLabel}`,
      points,
    })
  }

  const drillSite = (r: SiteRow) =>
    setDrill({
      title: r.site,
      subtitle: `${r.commodity ? titleCase(r.commodity) : '—'} · ${scopeLabel}`,
      stats: [
        { label: 'Production', value: `${r.production_t.toLocaleString('en-US')} t` },
        { label: 'Achievement', value: `${r.achievement_pct}%`, tone: r.achievement_pct >= 95 ? 'good' : 'bad' },
        {
          label: 'Downtime',
          value: `${r.downtime_h} h${r.downtime_avg_h != null ? ` (avg ${r.downtime_avg_h})` : ''}`,
          tone: r.downtime_avg_h != null && r.downtime_h > r.downtime_avg_h ? 'bad' : 'good',
        },
        { label: 'Forecast Δ', value: `${r.forecast_delta_pct > 0 ? '+' : ''}${r.forecast_delta_pct}%`, tone: r.forecast_delta_pct >= 0 ? 'good' : 'bad' },
        { label: 'Status', value: r.status, tone: r.status === 'Ahead' || r.status === 'On Track' ? 'good' : 'bad' },
      ],
    })

  const selTrend = useMemo<TrendPoint[]>(() => {
    if (!data) return []
    const rows = dim.filter(
      (r) =>
        (selPT === 'ALL' || r.pt_code === selPT) &&
        (selCom === 'ALL' || r.commodity === selCom) &&
        (selCom !== 'ALL' || TON_UNITS.has(r.unit)),
    )
    if (!rows.length) return data.trend
    const byDate = new Map<string, TrendPoint>()
    for (const r of rows) {
      const p = byDate.get(r.date) ?? { date: r.date, actual: null, forecast: null, lower: null, upper: null, target: null, gap: null }
      for (const k of MEASURES) if (r[k] != null) p[k] = (p[k] ?? 0) + (r[k] as number)
      byDate.set(r.date, p)
    }
    const pts = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].actual != null) { pts[i].forecast = pts[i].actual; break } // bridge
    }
    return pts
  }, [data, dim, selPT, selCom])

  const gapInfo = useMemo(() => {
    const fs = selTrend.filter((p) => p.forecast != null && p.gap != null)
    const gap = fs.reduce((s, p) => s + (p.gap ?? 0), 0)
    const tgt = fs.reduce((s, p) => s + (p.target ?? 0), 0)
    return fs.length ? { gap, pct: tgt ? (gap / tgt) * 100 : 0 } : null
  }, [selTrend])

  const trendOpt = useMemo(() => (selTrend.length ? trendOption(selTrend) : null), [selTrend])
  const donutOpt = useMemo(() => (data ? donutOption(data.composition) : null), [data])
  const gaugeOpt = useMemo(() => (data ? gaugeOption(data.ytd_achievement_pct) : null), [data])

  const renderWidget = (w: WidgetConfig, i: number) => {
    const span = w.span ? SPAN_CLS[w.span] : ''
    const delay = DELAYS[i % DELAYS.length]
    const key = w.id

    if (!data) {
      return (
        <div key={key} className={`${span} rise ${delay} h-64 rounded-2xl border border-slate-200/70 bg-white p-5`}>
          <div className="shimmer h-4 w-40 rounded" />
          <div className="shimmer mt-4 h-40 rounded-xl" />
          {error && <p className="mt-3 text-[11px] text-red-500">Backend unreachable: {error}</p>}
        </div>
      )
    }

    switch (w.type) {
      case 'kpiGrid':
        return <KpiGrid key={key} kpis={data.kpis} onDrill={drillKpi} />
      case 'trend':
        return (
          <Panel
            key={key}
            title={w.title}
            subtitle={w.subtitle}
            delay={delay}
            className={span}
            legend={
              <div className="flex items-center gap-2">
                {gapInfo && (
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      gapInfo.gap >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                    }`}
                    title="Total expected gap across forecast months"
                  >
                    Gap {gapInfo.gap >= 0 ? '+' : ''}{fmtQty(gapInfo.gap)} ({gapInfo.pct.toFixed(1)}%)
                  </span>
                )}
                <select
                  value={selPT}
                  onChange={(e) => { setSelPT(e.target.value); setSelCom('ALL') }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 outline-none transition hover:border-mine-300 focus:border-mine-400"
                >
                  <option value="ALL">All PT</option>
                  {ptOptions.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                </select>
                <select
                  value={selCom}
                  onChange={(e) => setSelCom(e.target.value)}
                  className="max-w-[160px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 outline-none transition hover:border-mine-300 focus:border-mine-400"
                >
                  <option value="ALL">All Commodities</option>
                  {comOptions.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </select>
                <div className="flex items-center gap-2 text-[10px] font-semibold">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-mine-500" />Actual</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-copper-500" />Forecast</span>
                  <span className="flex items-center gap-1"><span className="h-0.5 w-3 border-t-2 border-dotted border-slate-400" />Target</span>
                </div>
              </div>
            }
          >
            {trendOpt && (
              <EChart
                option={trendOpt}
                className="mt-2 h-72"
                onClick={() =>
                  setDrill({
                    title: 'Production Detail',
                    subtitle: `${selPT === 'ALL' ? 'All PT' : selPT} · ${selCom === 'ALL' ? 'All Commodities' : titleCase(selCom)}`,
                    trend: selTrend,
                  })
                }
              />
            )}
          </Panel>
        )
      case 'donut':
        return (
          <Panel key={key} title={w.title} subtitle={w.subtitle} delay={delay} className={span}>
            {donutOpt && <EChart option={donutOpt} className="mt-1 h-72" onClick={(p) => p.name && drillCommodity(p.name)} />}
          </Panel>
        )
      case 'siteTable':
        return (
          <Panel key={key} title={w.title} subtitle={w.subtitle} delay={delay} className={`overflow-hidden ${span}`} padded={false} legend={<ExportButton />}>
            <div className="mt-2">
              <SiteSummaryTable rows={data.site_summary} onRowClick={drillSite} />
            </div>
          </Panel>
        )
      case 'gauge':
        return (
          <Panel key={key} title={w.title} subtitle={w.subtitle} delay={delay} className={span}>
            {gaugeOpt && <EChart option={gaugeOpt} className="mt-1 h-60" />}
          </Panel>
        )
      default:
        return null
    }
  }

  return (
    <div className="font-sans text-slate-800 antialiased">
      <div className="contour-bg" />
      <Header data={data} scope={scopeLabel} />

      <main className="relative z-10 flex w-full items-start gap-4 px-6 pb-10">
        <div className="min-w-0 flex-1">
          <HeroStrip />

          {/* global scope filter — applies to all panels except the trend (own filters) */}
          <div className="rise mt-4 flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-2.5 shadow-sm">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Filter size={13} /> Scope
            </span>
            <select
              value={gPt}
              onChange={(e) => setGPt(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 outline-none transition hover:border-mine-300 focus:border-mine-400"
            >
              <option value="ALL">All PT</option>
              {ptOptions.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
            </select>
            {gPt !== 'ALL' && (
              <span className="rounded-full bg-mine-50 px-2.5 py-1 text-[10px] font-bold text-mine-600">{gPt}</span>
            )}
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">As of</span>
            <input
              type="month"
              value={gAsof}
              max={latestMo}
              onChange={(e) => setGAsof(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 outline-none transition hover:border-mine-300 focus:border-mine-400"
            />
            {gAsof && (
              <button
                onClick={() => setGAsof('')}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-200"
                title="Back to latest month"
              >
                × reset
              </button>
            )}
            {refreshing && <Loader2 size={13} className="animate-spin text-slate-300" />}
            <span className="ml-auto hidden text-[10px] font-medium text-slate-300 md:block">
              applies to all panels except Production Trend
            </span>
          </div>

          {DASHBOARD_ROWS.map((row) => (
            <section key={row.id} className={`mt-4 grid grid-cols-1 gap-4 ${COLS_CLS[row.cols ?? 3]}`}>
              {row.widgets.map((w, i) => renderWidget(w, i))}
            </section>
          ))}

          <p className="mt-6 text-center text-[10px] font-medium text-slate-400">
            MindID Analytics Dashboard POC · source: {data?.source ?? '…'} · generated {data?.generated_at ?? '…'}
          </p>
        </div>

        <AiPanel data={data} scope={scopeLabel} />
      </main>

      <DrillModal spec={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
