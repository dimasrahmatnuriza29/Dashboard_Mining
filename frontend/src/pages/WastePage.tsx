import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowRight,
  CircleCheck,
  Cloud,
  Coins,
  Leaf,
  Lightbulb,
  Maximize2,
  Recycle,
  Send,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CountUp from '../components/CountUp'
import EChart from '../components/EChart'
import MapChart from '../components/MapChart'
import {
  aiVizOption,
  GREEN,
  fmt,
  miniSpark,
  monthlyPtOption,
  revBarOption,
  wasteDonutOption,
  wasteTrendOption,
} from '../lib/mockupCharts'
import { fetchChat, fetchInsight } from '../api'
import type { InsightResp, VizSpec, WasteData } from '../types'

const ICONS: Record<string, LucideIcon> = {
  recycle: Recycle, coins: Coins, leaf: Leaf, cloud: Cloud, target: Target,
}

const ICON_TONE: Record<string, string> = {
  green: 'bg-green-50 text-green-600',
  sky: 'bg-sky-50 text-sky-700',
  blue: 'bg-blue-50 text-blue-600',
}

const DELTA_TONE: Record<string, string> = {
  green: 'text-green-600',
  amber: 'text-amber-600',
  red: 'text-red-500',
  slate: 'text-slate-400',
}

/* AI context snapshot — shared by the live insight call and the chat Q&A */
function buildAiCtx(data: WasteData) {
  return {
    dashboard: 'waste',
    period: data.periods[0],
    source: data.source,
    kpis: data.kpis.map((k) => ({ label: k.label, value: k.value, suffix: k.suffix, delta: k.delta })),
    utilization_by_pt: data.util_rings,
    trend: data.trend,
    waste_composition: data.comp_sets.map((c) => ({
      label: c.label,
      items: c.items.map((i) => ({ name: i.name, share_pct: i.value })),
    })),
    revenue_potential_vs_realized: data.rev_bars,
    realization_by_pt: data.pt_realize,
    quality_gap_reasons: data.gap_pareto.map((g) => ({ reason: g.name, gap_kton: g.value })),
    top_opportunities: data.top_opps,
    pt_details: data.pt_details.map((d) => ({
      pt: d.pt, waste_ton: d.waste, utilization_pct: d.util, revenue_musd: d.rev,
      top_streams: d.streams,
    })),
    key_insights: data.key_insights.map((i) => i.text),
    next_actions: data.next_actions,
  }
}

export default function WastePage({ data }: { data: WasteData }) {
  const [compKey, setCompKey] = useState(data.comp_sets[0]?.key ?? '')
  const [pt, setPt] = useState(data.pt_details[0]?.pt ?? '')
  const [storyIdx, setStoryIdx] = useState(0)
  const [barW, setBarW] = useState(0)

  /* shared AI context — insight + chat read the same filtered snapshot */
  const aiCtx = buildAiCtx(data)

  /* live LLM insight — empty until the model responds */
  const [live, setLive] = useState<InsightResp | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  useEffect(() => {
    let alive = true
    setLive(null)
    setAiBusy(true)
    const t0 = Date.now()
    const settle = (fn: () => void) =>
      setTimeout(() => { if (alive) { fn(); setAiBusy(false) } }, Math.max(0, 1400 - (Date.now() - t0)))
    fetchInsight(aiCtx)
      .then((r) => settle(() => setLive(r)))
      .catch(() => settle(() => setLive(null)))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

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

  const comp = useMemo(
    () => data.comp_sets.find((c) => c.key === compKey) ?? data.comp_sets[0],
    [data, compKey],
  )
  const ptDetail = useMemo(
    () => data.pt_details.find((d) => d.pt === pt) ?? data.pt_details[0],
    [data, pt],
  )
  const zwKpi = data.kpis.find((k) => k.progress != null)
  const ki = live?.key_insights?.length ? live.key_insights : data.key_insights
  const na = live?.next_actions?.length ? live.next_actions : data.next_actions

  // animate the zero-waste progress bar after mount (matches mockup)
  useEffect(() => {
    if (zwKpi?.progress == null) return
    const t = setTimeout(() => setBarW(zwKpi.progress!), 200)
    return () => clearTimeout(t)
  }, [zwKpi])

  // success stories auto-rotate every 5s
  useEffect(() => {
    if (data.stories.length < 2) return
    const t = setInterval(() => setStoryIdx((i) => (i + 1) % data.stories.length), 5000)
    return () => clearInterval(t)
  }, [data.stories.length])

  const oppTotal = data.top_opps.reduce((a, t) => a + t.rev, 0)

  return (
    <main className="min-w-0 flex-1 space-y-3.5 p-4">
      {/* KPI ROW */}
      <section className="grid grid-cols-5 gap-3.5">
        {data.kpis.map((k) => {
          const Icon = ICONS[k.icon] ?? Leaf
          return (
            <div key={k.id} className="card fade-in flex items-start gap-3 p-4">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${ICON_TONE[k.icon_tone] ?? ICON_TONE.green}`}>
                <Icon className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-navy-800">{k.label}</p>
                <p className={`text-[10.5px] ${k.sub.trim() ? 'text-slate-400' : 'text-transparent'}`}>{k.sub.trim() ? k.sub : '.'}</p>
                <p className="mt-1.5 text-[22px] font-extrabold text-navy-900">
                  {k.prefix && <span className="text-[13px] font-semibold text-slate-500">{k.prefix} </span>}
                  <CountUp value={k.value} decimals={k.decimals} />
                  {k.suffix && <span className="text-[13px] font-semibold text-slate-500"> {k.suffix}</span>}
                </p>
                {k.progress != null ? (
                  <>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-[1500ms]"
                        style={{ width: `${barW}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9.5px] text-slate-400">
                      <span>{k.progress_min}</span><span>{k.progress_max}</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5 flex items-center justify-between">
                    <p className={`text-[10.5px] font-semibold ${DELTA_TONE[k.delta_tone] ?? 'text-green-600'}`}>
                      {k.delta}
                    </p>
                    <EChart option={miniSpark(k.spark, GREEN)} className="h-6 w-20" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* ROW 2 — trend + util rings | map | AI insights */}
      <section className="grid grid-cols-12 gap-3.5">
        <div className="card col-span-5 flex p-4">
          <div className="min-w-0 flex-1">
            <p className="card-title">Waste Generation &amp; Utilization Trend</p>
            <EChart option={wasteTrendOption(data.trend)} className="mt-1 h-[265px]" />
          </div>
          <div className="ml-3 w-[150px] shrink-0 border-l border-slate-100 pl-3">
            <p className="card-title mb-2">Utilization by PT</p>
            <div className="space-y-3.5">
              {data.util_rings.map((r) => (
                <div key={r.pt} className="flex items-center gap-3">
                  <div className="ring" style={{ '--p': r.pct } as CSSProperties}>
                    <span>{r.pct}%</span>
                  </div>
                  <div>
                    <p className="text-[11.5px] font-bold text-navy-800">{r.pt}</p>
                    <p className="text-[10.5px] font-semibold text-green-600">
                      {r.yoy} <span className="font-normal text-slate-400">YoY</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[9px] leading-snug text-slate-400">
              * Utilization = Recycled / Utilized vs. Total Waste
            </p>
          </div>
        </div>

        <div className="card col-span-4 p-4">
          <div className="flex items-center justify-between">
            <p className="card-title">Waste Potential by Location</p>
            <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-navy-700 transition hover:bg-slate-50">
              View Detail <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <MapChart sites={data.sites} ptColors={data.pt_colors} className="mt-1 h-[255px]" />
          <div className="flex justify-center gap-5 text-[10.5px] text-slate-500">
            {Object.entries(data.pt_colors).map(([ptName, c]) => (
              <span key={ptName} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{ptName}
              </span>
            ))}
          </div>
        </div>

        <div className="card col-span-3 flex h-[344px] flex-col overflow-hidden border-green-100 bg-gradient-to-b from-green-50/70 to-white p-4">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 text-[12px] font-extrabold text-white shadow-md shadow-emerald-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="card-title">AI Insights &amp; Recommendations</p>
                <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green-500" />
                  {live?.generated_at ? `Generated ${live.generated_at}` : data.ai_generated_at}
                </p>
              </div>
            </div>
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
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto text-[11px] leading-relaxed">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-bold text-navy-800">
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
              <div>
                <p className="text-[10.5px] font-bold text-navy-800">Recommended Actions</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-slate-600">
                  {live.recommendations.map((r) => (
                    <li key={r.tag}>
                      <b>{r.tag}</b> — {r.text}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center">
              <p className="text-[10px] italic text-slate-400">
                {aiBusy ? 'Analyzing dashboard data…' : 'AI analysis will appear here.'}
              </p>
            </div>
          )}
          {live && (
            <button
              onClick={() => setAiOpen(true)}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-green-600 to-emerald-700 px-5 py-2 text-[11px] font-bold text-white shadow-md shadow-emerald-600/30 transition hover:scale-[1.03]"
            >
              View AI Recommendation Detail <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* ROW 3 — composition | revenue | top5 | stories */}
      <section className="grid grid-cols-12 gap-3.5">
        <div className="card col-span-3 p-4">
          <p className="card-title">Waste Composition by Type</p>
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-50 p-1">
            {data.comp_sets.map((c) => (
              <span
                key={c.key}
                className={`tab ${compKey === c.key ? 'active' : ''}`}
                onClick={() => setCompKey(c.key)}
              >
                {c.label}
              </span>
            ))}
          </div>
          {comp && <EChart option={wasteDonutOption(comp.items, comp.center)} className="mt-1 h-[200px]" />}
        </div>

        <div className="card col-span-3 p-4">
          <p className="card-title">Revenue: Potential vs Realized</p>
          <p className="text-[10px] text-slate-400">ML classification · USD Million</p>
          <EChart option={revBarOption(data.rev_bars)} className="h-[232px]" />
        </div>

        <div className="card col-span-3 p-4">
          <p className="card-title mb-2">Top 5 Revenue Opportunities</p>
          <table className="tbl w-full overflow-hidden rounded-lg">
            <thead>
              <tr>
                <th className="w-6">#</th><th>Opportunity</th><th>PT</th>
                <th className="text-right">Potential Revenue<br /><span className="font-medium text-slate-400">(USD Million/year)</span></th>
              </tr>
            </thead>
            <tbody>
              {data.top_opps.map((t) => (
                <tr key={t.rank}>
                  <td className="font-bold text-slate-400">{t.rank}</td>
                  <td>{t.opp}</td>
                  <td className="font-semibold" style={{ color: data.pt_colors[t.pt] ?? '#64748b' }}>{t.pt}</td>
                  <td className="text-right font-bold text-navy-800">{fmt(t.rev, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="bg-slate-50 font-bold text-navy-800">Total Potential Revenue</td>
                <td className="bg-slate-50 text-right font-extrabold text-navy-900">{fmt(oppTotal, 1)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="card col-span-3 flex flex-col overflow-hidden p-4">
          <p className="card-title mb-2">Success Stories</p>
          <div className="relative flex-1 overflow-hidden">
            <div
              className="story-track flex"
              style={{ transform: `translateX(-${storyIdx * 100}%)` }}
            >
              {data.stories.map((s) => (
                <div key={s.title} className="w-full shrink-0 pr-1">
                  <div className="relative h-[150px] overflow-hidden rounded-xl shadow-sm" style={{ background: s.gradient }}>
                    {s.image && (
                      <img
                        src={s.image}
                        alt={s.title}
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      {s.pt}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] font-extrabold text-navy-800">{s.title}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{s.body}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {data.stories.map((s, i) => (
              <button
                key={s.title}
                onClick={() => setStoryIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === storyIdx ? 'w-4 bg-navy-700' : 'w-1.5 bg-slate-300'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ROW 4 — detailed view by PT */}
      <section className="grid grid-cols-12 gap-3.5">
        <div className="card col-span-12 p-4">
          <div className="flex items-center gap-4">
            <p className="card-title">Detailed View by PT</p>
            <div className="flex">
              {data.pt_details.map((d) => (
                <span
                  key={d.pt}
                  className={`tab-line ${pt === d.pt ? 'active' : ''}`}
                  onClick={() => setPt(d.pt)}
                >
                  {d.pt}
                </span>
              ))}
            </div>
          </div>
          {ptDetail && (
            <div className="mt-3 grid grid-cols-12 gap-4">
              <div className="col-span-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-full text-[11px] font-extrabold text-white"
                    style={{ background: ptDetail.color }}
                  >
                    {ptDetail.letter}
                  </div>
                  <p className="text-[15px] font-extrabold text-navy-900">{ptDetail.pt}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  <div>
                    <p className="text-[12px] text-slate-400">Total Waste</p>
                    <p className="text-[30px] font-extrabold leading-tight text-navy-900">
                      {fmt(ptDetail.waste)} <span className="text-[12px] font-semibold text-slate-400">Ton</span>
                    </p>
                  </div>
                  <div className="ml-4">
                    <p className="text-[12px] text-slate-400">Utilization</p>
                    <p className="text-[36px] font-extrabold leading-tight text-green-600">{ptDetail.util}%</p>
                  </div>
                  <div className="w-full">
                    <p className="text-[12px] text-slate-400">Revenue Potential</p>
                    <p className="text-[30px] font-extrabold leading-tight text-navy-900">USD {fmt(ptDetail.rev, 1)}M</p>
                  </div>
                </div>
              </div>
              <div className="col-span-5">
                <p className="mb-1.5 text-[11px] font-bold text-navy-800">Top Waste Streams – {ptDetail.pt}</p>
                <table className="tbl w-full overflow-hidden rounded-lg">
                  <thead>
                    <tr>
                      <th>Waste Type</th><th className="text-right">Volume (Ton)</th>
                      <th>Utilization Rate</th><th className="text-right">Revenue Potential (USD M)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ptDetail.streams.map((s) => (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td className="text-right">{fmt(s.volume)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${s.util}%`, background: ptDetail.color }} />
                            </div>
                            <span className="font-semibold">{s.util}%</span>
                          </div>
                        </td>
                        <td className="text-right font-bold text-navy-800">{fmt(s.rev, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="col-span-4">
                <p className="text-[11px] font-bold text-navy-800">Monthly Waste &amp; Utilization – {ptDetail.pt}</p>
                <EChart option={monthlyPtOption(ptDetail)} className="h-[160px]" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ROW 5 — key insights + next steps */}
      <section className="grid grid-cols-2 gap-3.5">
        <div className="dark-card fade-in p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-white">
            <Lightbulb className="h-4 w-4 text-amber-300" />Key Insights
          </p>
          <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
            {ki.map((i) => (
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
        </div>
        <div className="dark-card fade-in flex flex-col p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-white">
            <Target className="h-4 w-4 text-green-300" />Next Steps
          </p>
          <ol className="mt-2.5 flex-1 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
            {na.map((a, i) => (
              <li key={a} className="flex gap-2">
                <span
                  className="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300"
                  style={{ height: 18, width: 18 }}
                >
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      </section>

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
                <Sparkles className="h-6 w-6 text-green-600" />AI Recommendation — Detail
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
                          ? 'ml-8 bg-green-600 text-white'
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
                    className="flex-1 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] font-medium text-slate-800 outline-none placeholder:font-normal focus:border-green-400"
                  />
                  <button
                    onClick={send}
                    disabled={chatBusy || !msg.trim()}
                    className="grid w-10 place-items-center rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
