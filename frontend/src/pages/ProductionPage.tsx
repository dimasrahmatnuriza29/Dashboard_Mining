import { useEffect, useState } from 'react'
import {
  ArrowRight,
  CircleCheck,
  CircleDot,
  Coins,
  Layers,
  Leaf,
  Lightbulb,
  Maximize2,
  Send,
  Sparkles,
  X,
  Target,
  TriangleAlert,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CountUp from '../components/CountUp'
import EChart from '../components/EChart'
import MapChart from '../components/MapChart'
import { aiVizOption, fmt, GREEN, miniSpark, prodDonutOption, prodTrendOption, vsPlanOption } from '../lib/mockupCharts'
import { fetchChat, fetchInsight, fetchProduction } from '../api'
import type { InsightResp, ProductionData, VizSpec } from '../types'

const ICONS: Record<string, LucideIcon> = {
  truck: Truck, target: Target, coins: Coins, wallet: Wallet, wrench: Wrench, leaf: Leaf,
}

const ICON_TONE: Record<string, string> = {
  blue: 'text-blue-500',
  green: 'text-green-600',
  sky: 'text-sky-600',
}

const DELTA_TONE: Record<string, string> = {
  green: 'text-green-600',
  amber: 'text-amber-600',
  red: 'text-red-500',
  slate: 'text-slate-400',
}

/* Build the AI context for a given payload + card selection — shared by the
   live insight call and the background warm-up for other PT scopes.
   Scope rule: card PT×commodity > header PT > holding. */
function buildAiCtx(data: ProductionData, selPt: string, selCom: string) {
  const dims = data.trend_dim ?? []
  const ptOpts = [...new Map(dims.map((d) => [d.pt_code, d.pt])).entries()]
  const effPt = ptOpts.some(([code]) => code === selPt) ? selPt : ''
  const comOpts = dims.filter((d) => d.pt_code === effPt)
  const selRow = comOpts.find((d) => d.commodity === selCom) ?? comOpts[0] ?? null
  const isDim = selRow !== null
  const ptScope = isDim ? selRow.pt_code : data.selected_pt || ''
  const dimScope = isDim
    ? [selRow]
    : data.selected_pt
      ? data.trend_dim.filter((d) => d.pt_code === data.selected_pt)
      : data.trend_dim
  return {
    period: data.periods[0],
    pt_filter: data.selected_pt || 'All PT',
    card_selection: isDim
      ? { pt: selRow.pt, commodity: selRow.commodity, unit: selRow.unit,
          projected: selRow.projected, target_annual: selRow.target_annual,
          delta_pct: selRow.delta_pct }
      : null,
    kpis: data.kpis.map((k) => ({ label: k.label, value: k.value, suffix: k.suffix, delta: k.delta })),
    // forecast_badge/trend are holding-level series — only valid at holding scope
    forecast_badge: ptScope ? null : data.forecast_badge,
    pt_comparison: ptScope
      ? data.pt_rows.filter((r) => r.pt_code === ptScope)
          .map((r) => ({ pt: r.pt, actual: r.actual, plan: r.plan, achievement_pct: r.achievement_pct, delta_pct: r.delta_pct }))
      : data.pt_rows.map((r) => ({ pt: r.pt, actual: r.actual, plan: r.plan, achievement_pct: r.achievement_pct, delta_pct: r.delta_pct })),
    commodity_detail: dimScope.map((d) => ({
      pt: d.pt, commodity: d.commodity, unit: d.unit,
      projected: d.projected, target_annual: d.target_annual, delta_pct: d.delta_pct,
    })),
    top_sites: data.top_sites,
    trend: isDim
      ? { months: data.trend.months, actual: selRow.actual, forecast: selRow.forecast, unit: selRow.unit }
      : ptScope ? null : data.trend,
  }
}

/* scopes already warmed — persists across remounts so we never re-fire */
const _warmedScopes = new Set<string>()

export default function ProductionPage({ data }: { data: ProductionData }) {
  const b = data.forecast_badge

  /* per-PT×commodity trend selector (native units) */
  const dims = data.trend_dim ?? []
  /* selection kept in sessionStorage → independent from header filters
     and preserved across Production↔Waste navigation */
  const [selPt, setSelPt] = useState(() => sessionStorage.getItem('trdPt') ?? 'ANTAM')
  const [selCom, setSelCom] = useState(() => sessionStorage.getItem('trdCom') ?? 'GOLD')
  const ptOpts = [...new Map(dims.map((d) => [d.pt_code, d.pt])).entries()]
  const effPt = ptOpts.some(([code]) => code === selPt) ? selPt : ''
  const comOpts = dims.filter((d) => d.pt_code === effPt)
  const selRow = comOpts.find((d) => d.commodity === selCom) ?? comOpts[0] ?? null
  const isDim = selRow !== null
  const year = (data.periods[0].match(/\d{4}/) ?? [''])[0]
  const dimTrend = isDim
    ? { months: data.trend.months, actual: selRow.actual, forecast: selRow.forecast, target: selRow.target_monthly }
    : data.trend
  const dimBadge = isDim
    ? {
        label: `Dec ${year} Forecast`,
        value: selRow.projected ?? 0,
        unit: selRow.unit,
        delta: selRow.delta_pct == null
          ? ''
          : `${selRow.delta_pct >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(selRow.delta_pct).toFixed(1)}% vs Target`,
      }
    : { label: b.label, value: b.value, unit: b.unit, delta: b.delta }

  /* shared AI context — insight + chat both read the filtered snapshot */
  const aiCtx = buildAiCtx(data, selPt, selCom)

  /* live LLM insight — reads the CURRENTLY FILTERED dashboard context.
     Default empty: card shows nothing until the LLM responds. */
  const [live, setLive] = useState<InsightResp | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const selKey = isDim ? `${selRow.pt_code}|${selRow.commodity}` : ''
  useEffect(() => {
    let alive = true
    setLive(null)
    setAiBusy(true)
    const t0 = Date.now()
    // keep the analyzing state visible ≥1.4s even when the response is cached
    const settle = (fn: () => void) =>
      setTimeout(() => { if (alive) { fn(); setAiBusy(false) } }, Math.max(0, 1400 - (Date.now() - t0)))
    fetchInsight(aiCtx)
      .then((r) => settle(() => setLive(r)))
      .catch(() => settle(() => setLive(null)))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selKey])

  useEffect(() => {
    if (!live) return
    const period = data.periods[0]
    const scopes = ['', ...data.pt_rows.map((r) => r.pt_code)]
      .filter((code) => code !== (data.selected_pt || ''))
    let alive = true
    ;(async () => {
      for (const code of scopes) {
        if (!alive) return
        const wkey = `${period}|${code}|${selPt}|${selCom}`
        if (_warmedScopes.has(wkey)) continue
        _warmedScopes.add(wkey)
        try {
          const pd = await fetchProduction(period, code)
          if (!alive) return
          await fetchInsight(buildAiCtx(pd, selPt, selCom))
        } catch { /* warm-up is best-effort */ }
      }
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  /* chat Q&A — lives in the maximize modal, same filtered context */
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; html: string; viz?: VizSpec | null }[]>([])
  const [msg, setMsg] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const send = () => {
    const m = msg.trim()
    if (!m || chatBusy) return
    setMsg('')
    setChatBusy(true)
    setChat((c) => [...c, { role: 'user', html: m }])
    const history = chat.map((c) => ({ role: c.role, content: c.html }))
    fetchChat(m, history, aiCtx)
      .then((r) => setChat((c) => [...c, { role: 'assistant', html: r.reply, viz: r.viz }]))
      .catch(() => setChat((c) => [...c, { role: 'assistant', html: 'Maaf, AI tidak merespons. Coba lagi.' }]))
      .finally(() => setChatBusy(false))
  }

  return (
    <main className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_290px] gap-3.5 p-4">
      {/* col 1 · KPI */}
      <div className="min-w-0 space-y-3.5">
        <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
          <Layers className="h-4 w-4 text-navy-700" />Holding Level KPI
        </p>

        <section className="grid grid-cols-6 gap-3">
          {data.kpis.map((k) => {
            const Icon = ICONS[k.icon] ?? Target
            return (
              <div key={k.id} className="card fade-in p-3.5">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[10.5px] font-semibold text-slate-500">{k.label}</p>
                  <Icon className={`h-4 w-4 ${ICON_TONE[k.icon_tone] ?? 'text-blue-500'}`} />
                </div>
                <p className="text-[21px] font-extrabold text-navy-900">
                  {k.prefix && <span className="text-[12px] font-semibold text-slate-400">{k.prefix} </span>}
                  <CountUp value={k.value} decimals={k.decimals} />
                  {k.suffix && <span className="text-[12px] font-semibold text-slate-400"> {k.suffix}</span>}
                </p>
                <p className={`text-[10px] font-semibold ${DELTA_TONE[k.delta_tone] ?? 'text-green-600'}`}>{k.delta}</p>
              </div>
            )
          })}
        </section>
      </div>

      {/* col 2 · Our Commitment */}
      <div className="dark-card fade-in self-start p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Our Commitment</p>
        <div className="mt-2 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-500/20 text-green-400">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[13.5px] font-extrabold leading-snug text-white">
              Higher Production<br />Less Emission<br />Greater Value
            </p>
            <p className="mt-1.5 text-[10px] text-slate-400">Toward Net Zero 2060</p>
          </div>
        </div>
      </div>

      {/* col 1 · ROW: trend + donut + pt table */}
      <section className="grid min-w-0 grid-cols-12 gap-3.5">
        <div className="card fade-in relative col-span-5 p-4">
          <p className="card-title">
            Production Trend &amp; Forecast{' '}
            <span className="font-normal text-slate-400">
              {isDim
                ? `(${selRow.pt} — ${selRow.commodity})`
                : '(Total Holding)'}
            </span>
          </p>
          {dims.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <p className="mr-1 text-[10px] text-slate-400">
                Unit: {isDim ? selRow.unit : 'Million Ton'}
              </p>
              <select
                className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-semibold text-slate-600 outline-none"
                value={effPt}
                onChange={(e) => {
                  setSelPt(e.target.value)
                  setSelCom('')
                  sessionStorage.setItem('trdPt', e.target.value)
                  sessionStorage.removeItem('trdCom')
                }}
              >
                <option value="">Total Holding</option>
                {ptOpts.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              {isDim && (
                <select
                  className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-semibold text-slate-600 outline-none"
                  value={selRow.commodity}
                  onChange={(e) => {
                    setSelCom(e.target.value)
                    sessionStorage.setItem('trdCom', e.target.value)
                  }}
                >
                  {comOpts.map((d) => <option key={d.commodity} value={d.commodity}>{d.commodity}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="absolute right-4 top-4 rounded-lg border border-blue-100 bg-blue-50/80 px-2.5 py-1.5 text-right shadow-sm">
            <p className="text-[9px] font-semibold text-slate-500">{dimBadge.label}</p>
            <p className="text-[14px] font-extrabold text-navy-900">
              {fmt(dimBadge.value, isDim ? 0 : b.decimals)}{' '}
              <span className="text-[9.5px] font-semibold text-slate-500">{dimBadge.unit}</span>
            </p>
            <p className="text-[9.5px] font-semibold text-green-600">{dimBadge.delta}</p>
          </div>
          <EChart
            key={isDim ? `${selRow.pt_code}-${selRow.commodity}` : 'holding'}
            option={prodTrendOption(dimTrend)}
            className="mt-1 h-[268px]"
          />
        </div>

        <div className="card fade-in col-span-3 p-4">
          <p className="card-title">
            Production by Commodity <span className="font-normal text-slate-400">(Holding)</span>
          </p>
          <EChart
            option={prodDonutOption(data.commodity.items, data.commodity.center_top, data.commodity.center_bottom)}
            className="mt-1 h-[218px]"
          />
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[10px]">
            {data.commodity.items.map((i) => (
              <p key={i.name} className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />
                {i.name}
                <span className="ml-auto font-bold text-navy-800">{i.value}%</span>
              </p>
            ))}
          </div>
        </div>

        <div className="card fade-in col-span-4 p-4">
          <p className="card-title">Production by PT</p>
          <table className="tbl mt-2 w-full">
            <thead>
              <tr><th></th><th className="text-right">Actual</th><th className="text-right">Plan/RKAP</th><th className="text-right">Achievement</th></tr>
            </thead>
            <tbody>
              {data.pt_rows.map((r) => (
                <tr key={r.pt}>
                  <td className="font-semibold">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.pt}
                  </td>
                  <td className="text-right">{fmt(r.actual, 2)}</td>
                  <td className="text-right">{fmt(r.plan, 2)}</td>
                  <td className={`text-right font-bold ${r.achievement_pct >= 93 ? 'text-navy-800' : 'text-amber-600'}`}>
                    {fmt(r.achievement_pct, 1)}% <span className="font-normal text-green-600">+{fmt(r.delta_pct, 1)}%</span>
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-navy-900">
                <td>{data.pt_total.pt}</td>
                <td className="text-right">{fmt(data.pt_total.actual, 2)}</td>
                <td className="text-right">{fmt(data.pt_total.plan, 2)}</td>
                <td className="text-right">
                  {fmt(data.pt_total.achievement_pct, 1)}%{' '}
                  <span className="font-normal text-green-600">+{fmt(data.pt_total.delta_pct, 1)}%</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[9.5px] text-slate-400">Volume in Mt · Achievement = Actual / Plan RKAP</p>
        </div>
      </section>

      {/* col 2 · AI Recommendation — fixed height (match trend row), scrollable, expandable */}
      <div className="card fade-in flex h-[344px] flex-col p-4">
        <div className="flex items-center justify-between">
          <p className="card-title flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-blue-600" />AI Recommendation
            {live?.generated_at && (
              <span className="text-[9px] font-normal text-slate-400">· generated {live.generated_at}</span>
            )}
          </p>
          {live && (
            <button
              onClick={() => setAiOpen(true)}
              title="Maximize"
              className="flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[9.5px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {live ? (
          <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-bold text-navy-800">
                {live.findings[0]?.title ?? 'Executive Summary'}
              </p>
              {live.findings[0] && (
                <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700 ring-1 ring-amber-300">
                  {live.findings[0].severity}
                </span>
              )}
              <p
                className="mt-2 text-[10px] leading-relaxed text-slate-600"
                dangerouslySetInnerHTML={{ __html: live.summary }}
              />
            </div>
            <p className="mt-2.5 text-[10.5px] font-bold text-navy-800">Recommended Actions</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-slate-600">
              {live.recommendations.map((r) => (
                <li key={r.tag}>
                  <b>{r.tag}</b> — {r.text}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center">
            <p className="text-[10px] italic text-slate-400">
              {aiBusy ? 'Analyzing dashboard data…' : 'AI analysis will appear here.'}
            </p>
          </div>
        )}
      </div>

      {/* AI maximize modal */}
      {aiOpen && live && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-6 backdrop-blur-sm"
          onClick={() => setAiOpen(false)}
        >
          <div
            className="card flex h-[92vh] w-[96vw] max-w-none flex-col p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[20px] font-extrabold text-navy-800">
                <Sparkles className="h-6 w-6 text-blue-600" />AI Recommendation — Detail
              </p>
              <button onClick={() => setAiOpen(false)} className="rounded-md p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                <p className="text-[13px] font-bold uppercase tracking-wide text-amber-700">Summary</p>
                <p
                  className="mt-2 text-[17px] font-medium leading-relaxed text-slate-800"
                  dangerouslySetInnerHTML={{ __html: live.summary }}
                />
              </div>
              {live.findings.length > 0 && (
                <div>
                  <p className="text-[16px] font-bold text-navy-800">Findings</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    {live.findings.map((f) => (
                      <div key={f.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase ring-1 ${
                            f.severity === 'high'
                              ? 'bg-red-500/15 text-red-700 ring-red-300'
                              : f.severity === 'medium'
                                ? 'bg-amber-500/15 text-amber-700 ring-amber-300'
                                : 'bg-blue-500/15 text-blue-700 ring-blue-300'
                          }`}>
                            {f.severity}
                          </span>
                          <p className="text-[15px] font-bold text-navy-800">{f.title}</p>
                        </div>
                        <p
                          className="mt-2 text-[14px] font-medium leading-relaxed text-slate-800"
                          dangerouslySetInnerHTML={{ __html: f.detail }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {live.recommendations.length > 0 && (
                <div>
                  <p className="text-[16px] font-bold text-navy-800">Recommended Actions</p>
                  <ol className="mt-2.5 list-decimal space-y-2.5 pl-6 text-[15px] font-medium leading-relaxed text-slate-800">
                    {live.recommendations.map((r) => (
                      <li key={r.tag}>
                        <b>{r.tag}</b> — {r.text}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {live.viz && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <EChart option={aiVizOption(live.viz)} className="h-80" />
                </div>
              )}

              {/* chat Q&A — same filtered context */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <p className="text-[16px] font-bold text-navy-800">Ask the Dashboard</p>
                {chat.length > 0 && (
                  <div className="mt-2.5 max-h-72 space-y-3 overflow-y-auto pr-1">
                    {chat.map((c, i) => (
                      <div key={i} className={`rounded-lg p-3 text-[14.5px] font-medium leading-relaxed ${
                        c.role === 'user'
                          ? 'ml-8 bg-blue-600 text-white'
                          : 'mr-8 border border-slate-200 bg-white text-slate-800'
                      }`}>
                        <p dangerouslySetInnerHTML={{ __html: c.html }} />
                        {c.viz && <EChart option={aiVizOption(c.viz)} className="mt-2 h-60" />}
                      </div>
                    ))}
                    {chatBusy && <p className="mr-8 text-[13px] italic text-slate-400">AI is thinking…</p>}
                  </div>
                )}
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                    placeholder="Tanya data dashboard…"
                    className="flex-1 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] font-medium text-slate-800 outline-none placeholder:font-normal focus:border-blue-400"
                  />
                  <button
                    onClick={send}
                    disabled={chatBusy || !msg.trim()}
                    className="grid w-10 place-items-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* col 1 · ROW: map + top5 + vs plan */}
      <section className="grid min-w-0 grid-cols-12 gap-3.5">
        <div className="card fade-in col-span-4 p-4">
          <div className="flex items-center justify-between">
            <p className="card-title">Production by Site / Location</p>
            <div className="flex gap-1 text-[10px] font-semibold">
              <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700 ring-1 ring-blue-200">All PT</span>
              <span className="cursor-pointer rounded-md px-2 py-1 text-slate-500 hover:bg-slate-50">By PT</span>
            </div>
          </div>
          <MapChart sites={data.sites} ptColors={data.pt_colors} labels={false} className="mt-1 h-[240px]" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9.5px] font-semibold text-slate-500">
            {Object.entries(data.pt_colors).map(([pt, c]) => (
              <span key={pt}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                {pt}
              </span>
            ))}
          </div>
        </div>

        <div className="card fade-in col-span-4 p-4">
          <div className="flex items-center justify-between">
            <p className="card-title">
              Top 5 Production Sites <span className="font-normal text-slate-400">(Total Holding)</span>
            </p>
            <p className="text-[9.5px] text-slate-400">Unit: Million Ton</p>
          </div>
          <table className="tbl mt-2 w-full">
            <thead>
              <tr><th>Rank</th><th>Site</th><th>PT</th><th className="text-right">Prod. (Mt)</th><th className="text-right">vs Plan</th><th>Trend</th></tr>
            </thead>
            <tbody>
              {data.top_sites.map((t) => (
                <tr key={t.rank}>
                  <td className="font-bold text-navy-800">{t.rank}</td>
                  <td className="font-semibold">{t.site}</td>
                  <td>{t.pt}</td>
                  <td className="text-right font-bold">{fmt(t.prod, 2)}</td>
                  <td className="text-right font-semibold text-green-600">{t.vs_plan}</td>
                  <td><EChart option={miniSpark(t.spark, GREEN)} className="h-6 w-16" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card fade-in col-span-4 p-4">
          <p className="card-title">
            Production vs Plan <span className="font-normal text-slate-400">(By PT)</span>
          </p>
          <EChart option={vsPlanOption(data.pt_rows, data.selected_pt)} className="mt-1 h-[265px]" />
        </div>
      </section>

      {/* col 2 · Market & Commodity Price */}
      <div className="card fade-in flex flex-col p-4">
        <div className="flex items-center justify-between">
          <p className="card-title">Market &amp; Commodity Price</p>
          <button className="flex items-center gap-1 text-[9.5px] font-semibold text-blue-600 hover:underline">
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <ul className="mt-2.5 space-y-3 text-[11px]">
          {data.market.map((m) => (
            <li key={m.name} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 text-slate-400" />{m.name}
              </span>
              <span className="font-bold text-navy-800">
                {m.price}{' '}
                <span className={`text-[9.5px] font-semibold ${m.up ? 'text-green-600' : 'text-red-500'}`}>{m.delta}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* insights row */}
      <section className="col-span-2 grid grid-cols-2 gap-3.5">
        <div className="dark-card fade-in p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-white">
            <Lightbulb className="h-4 w-4 text-amber-300" />Key Insights
          </p>
          {live?.key_insights?.length ? (
            <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
              {live.key_insights.map((i) => (
                <li key={i.text} className="flex gap-2">
                  {i.kind === 'warn' ? (
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : (
                    <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                  )}
                  {i.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-[10.5px] italic text-slate-400">
              {aiBusy ? 'Generating AI insights…' : 'Analisis AI belum tersedia.'}
            </p>
          )}
        </div>
        <div className="dark-card fade-in p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-white">
            <Target className="h-4 w-4 text-blue-300" />Next Best Action
          </p>
          {live?.next_actions?.length ? (
            <ol className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
              {live.next_actions.map((a, i) => (
                <li key={a} className="flex gap-2">
                  <span
                    className="grid shrink-0 place-items-center rounded-full bg-blue-500/25 text-[9px] font-bold text-blue-300"
                    style={{ height: 18, width: 18 }}
                  >
                    {i + 1}
                  </span>
                  {a}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2.5 text-[10.5px] italic text-slate-400">
              {aiBusy ? 'Generating AI actions…' : 'Analisis AI belum tersedia.'}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
