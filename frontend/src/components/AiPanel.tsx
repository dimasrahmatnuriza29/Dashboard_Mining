import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, ChevronRight, Send, Sparkles, RefreshCw } from 'lucide-react'
import { fetchInsights, sendChat } from '../api'
import type { DashboardData, Finding, Recommendation } from '../types'

interface Msg {
  role: 'user' | 'ai'
  html: string
  recs?: Recommendation[]
  findings?: Finding[]
  label?: string
}

const GREETING: Msg[] = [
  {
    role: 'ai',
    html: 'Halo! Saya <b>MindID Assistant</b>. Saya membaca data dashboard yang sedang tampil — tanyakan tentang produksi, forecast, downtime, atau minta rekomendasi.',
  },
]

// compact snapshot the LLM reads — everything on screen, no raw series
function buildContext(data: DashboardData | null, scope: string, asof: string) {
  if (!data) return { scope, note: 'dashboard masih loading' }
  return {
    scope,
    as_of_month: asof,
    kpis: data.kpis.map((k) => ({
      metric: k.label,
      value: k.value,
      unit: k.unit,
      delta_pct_mom: k.delta,
    })),
    ytd_achievement_pct: data.ytd_achievement_pct,
    composition_share: data.composition.map((c) => ({ commodity: c.name, qty_t: c.value })),
    sites: data.site_summary.map((s) => ({
      site: s.site,
      commodity: s.commodity,
      production_t: s.production_t,
      achievement_pct: s.achievement_pct,
      downtime_h: s.downtime_h,
      downtime_avg_6m_h: s.downtime_avg_h,
      forecast_delta_pct: s.forecast_delta_pct,
      status: s.status,
    })),
  }
}

const REC_STYLE: Record<Recommendation['level'], { box: string; dot: string; label: string }> = {
  warning: { box: 'border-amber-100 bg-amber-50/60', dot: 'bg-amber-500', label: 'text-amber-700' },
  opportunity: { box: 'border-emerald-100 bg-emerald-50/60', dot: 'bg-emerald-500', label: 'text-emerald-700' },
  info: { box: 'border-mine-100 bg-mine-50/60', dot: 'bg-mine-500', label: 'text-mine-700' },
}

const SEV_STYLE: Record<Finding['severity'], { box: string; chip: string; label: string }> = {
  high: { box: 'border-rose-100 bg-rose-50/70', chip: 'bg-rose-500', label: 'HIGH' },
  medium: { box: 'border-amber-100 bg-amber-50/70', chip: 'bg-amber-500', label: 'MEDIUM' },
  low: { box: 'border-slate-200 bg-white/70', chip: 'bg-slate-400', label: 'LOW' },
}

// LLM output is rendered as HTML — keep only harmless formatting tags, drop attributes
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'br', 'p', 'ul', 'ol', 'li'])
const sanitize = (s: string) =>
  s.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (t, tag: string) => {
    const n = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(n)) return ''
    return t.startsWith('</') ? `</${n}>` : `<${n}>`
  })

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// plain-text version of a message for LLM history (includes findings + recs)
const msgText = (m: Msg) =>
  [
    stripHtml(m.html),
    ...(m.findings ?? []).map((f) => `Temuan [${f.severity}] ${f.title}: ${f.detail}`),
    ...(m.recs ?? []).map((r) => `Rekomendasi ${r.tag}: ${r.text}`),
  ].join('\n')
const resizeCharts = () => setTimeout(() => window.dispatchEvent(new Event('resize')), 380)

interface Props {
  data: DashboardData | null
  scope: string
  asof: string
}

export default function AiPanel({ data, scope, asof }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(GREETING)
  const [typing, setTyping] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const lastKey = useRef('')
  const reqId = useRef(0)
  const [max, setMax] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)
  const truckRef = useRef<SVGSVGElement>(null)
  const boostT = useRef<number>()

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
  }, [msgs, typing, analyzing])

  const boostTruck = () => {
    const t = truckRef.current
    if (!t) return
    t.classList.add('boost')
    window.clearTimeout(boostT.current)
    boostT.current = window.setTimeout(() => t.classList.remove('boost'), 4000)
  }

  // auto-analysis: whenever fresh dashboard data arrives for a new scope
  const analyze = (force = false) => {
    if (!data) return
    const key = `${scope}|${asof}`
    if (!force && key === lastKey.current) return
    lastKey.current = key
    const id = ++reqId.current
    setAnalyzing(true)
    boostTruck()
    fetchInsights(buildContext(data, scope, asof))
      .then((r) => {
        if (id !== reqId.current) return // superseded by a newer filter
        setMsgs((m) => [
          ...m,
          {
            role: 'ai',
            label: `Analisis otomatis · ${scope}${asof && !scope.includes(asof) ? ` · ${asof}` : ''}`,
            html: r.summary,
            findings: r.findings,
            recs: r.recommendations,
          },
        ])
      })
      .catch(() => {
        if (id !== reqId.current) return
        setMsgs((m) => [...m, { role: 'ai', html: 'Maaf, analisis otomatis gagal — AI tidak bisa dihubungi. Klik tombol analisis ulang di atas.' }])
      })
      .finally(() => {
        if (id === reqId.current) setAnalyzing(false)
      })
  }

  useEffect(() => {
    analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim()
    if (!v || typing || analyzing) return
    setInput('')
    setMsgs((m) => [...m, { role: 'user', html: v.replace(/</g, '&lt;') }])
    setTyping(true)
    boostTruck()

    const done = (reply: string, recs?: Recommendation[]) => {
      setMsgs((m) => [...m, { role: 'ai', html: reply, recs }])
      setTyping(false)
    }
    const history = msgs
      .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: msgText(m) }))
      .slice(-10)
    sendChat(v, history, buildContext(data, scope, asof))
      .then((r) => done(r.reply, r.recommendations))
      .catch(() => done('Maaf, AI tidak bisa dihubungi — backend mungkin sedang restart. Coba lagi.'))
  }

  return (
    <>
      <aside
        id="aiPanel"
        className={`sticky top-5 h-[calc(100vh-7rem)] w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm md:flex ${
          collapsed ? 'ai-collapsed' : ''
        }`}
        style={{ width: max ? 'min(760px,58vw)' : undefined }}
      >
        {/* animated haul-truck background */}
        <div className="truck-wrap">
          <div className="truck-road" />
          <svg ref={truckRef} className="truck" viewBox="0 0 240 90" fill="none">
            <g className="haul-body">
              <path d="M58 16 L148 16 L136 50 L70 50 Z" fill="#FCC855" />
              <path d="M58 16 L148 16 L144 28 L62 28 Z" fill="#FBAD24" />
              <path d="M66 34 L140 34" stroke="#D96406" strokeWidth="2.5" />
              <path d="M69 42 L137 42" stroke="#D96406" strokeWidth="2.5" />
              <rect x="44" y="52" width="150" height="7" rx="3" fill="#475569" />
              <path d="M148 36 L170 36 L177 48 L177 59 L148 59 Z" fill="#0C85E9" />
              <rect x="153" y="41" width="14" height="9" rx="1.5" fill="#BAE6FD" />
              <circle className="puff p1" cx="40" cy="64" r="5" fill="#64748B" />
              <circle className="puff p2" cx="30" cy="70" r="4" fill="#94A3B8" />
              <circle className="puff p3" cx="22" cy="66" r="5.5" fill="#94A3B8" />
              <circle className="puff p4" cx="34" cy="76" r="3.5" fill="#64748B" />
              <circle className="puff p5" cx="16" cy="74" r="4.5" fill="#94A3B8" />
              <circle className="puff p6" cx="48" cy="74" r="3" fill="#64748B" />
              <g className="wheel" style={{ transformOrigin: '78px 68px' }}>
                <circle cx="78" cy="68" r="16" fill="#334155" />
                <circle cx="78" cy="68" r="9" fill="#CBD5E1" />
                <line x1="78" y1="60" x2="78" y2="76" stroke="#475569" strokeWidth="2.4" />
                <line x1="70" y1="68" x2="86" y2="68" stroke="#475569" strokeWidth="2.4" />
                <circle cx="78" cy="68" r="3.2" fill="#475569" />
              </g>
              <g className="wheel" style={{ transformOrigin: '152px 68px' }}>
                <circle cx="152" cy="68" r="16" fill="#334155" />
                <circle cx="152" cy="68" r="9" fill="#CBD5E1" />
                <line x1="152" y1="60" x2="152" y2="76" stroke="#475569" strokeWidth="2.4" />
                <line x1="144" y1="68" x2="160" y2="68" stroke="#475569" strokeWidth="2.4" />
                <circle cx="152" cy="68" r="3.2" fill="#475569" />
              </g>
            </g>
          </svg>
        </div>

        {/* panel header */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-copper-400 to-copper-600 text-white shadow-md shadow-copper-500/25">
              <Sparkles size={15} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
            </span>
            <div>
              <p className="text-xs font-extrabold text-slate-800">MindID Assistant</p>
              <p className={`text-[10px] font-medium ${analyzing ? 'text-amber-500' : 'text-emerald-500'}`}>
                {analyzing ? 'Menganalisis dashboard…' : 'Analyzing live data'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => analyze(true)}
              disabled={analyzing || !data}
              title="Analisis ulang dashboard"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-mine-700 disabled:opacity-40"
            >
              <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setMax((v) => !v); resizeCharts() }}
              title="Maximize / restore"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-mine-700"
            >
              {max ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              onClick={() => { setCollapsed(true); resizeCharts() }}
              title="Collapse"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* messages */}
        <div ref={msgsRef} className="no-scrollbar relative z-10 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-mine-100/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-mine-800 shadow-md backdrop-blur-sm ring-1 ring-mine-200" dangerouslySetInnerHTML={{ __html: m.html }} />
              </div>
            ) : (
              <div key={i} className="space-y-2">
                <div className="flex gap-2.5">
                  <span className="mt-1 h-6 w-6 shrink-0 rounded-lg bg-gradient-to-br from-copper-400 to-copper-600" />
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-100">
                    {m.label && (
                      <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-copper-600">
                        <Sparkles size={10} /> {m.label}
                      </p>
                    )}
                    <div
                      className="[&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mt-1 [&_ul]:list-disc [&_ul]:pl-4"
                      dangerouslySetInnerHTML={{ __html: sanitize(m.html) }}
                    />
                  </div>
                </div>
                {m.findings && m.findings.length > 0 && (
                  <div className="ml-8 space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Temuan ({m.findings.length})</p>
                    {m.findings.map((f, j) => {
                      const s = SEV_STYLE[f.severity]
                      return (
                        <div key={j} className={`rounded-xl border p-3 shadow-sm ${s.box}`}>
                          <div className="flex items-start gap-1.5">
                            <span className={`mt-px shrink-0 rounded px-1.5 py-px text-[8px] font-extrabold tracking-wide text-white ${s.chip}`}>{s.label}</span>
                            <p className="text-[11px] font-bold leading-snug text-slate-700">{f.title}</p>
                          </div>
                          <div
                            className="mt-1.5 text-[11px] leading-relaxed text-slate-600 [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4"
                            dangerouslySetInnerHTML={{ __html: sanitize(f.detail) }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
                {m.recs && m.recs.length > 0 && (
                  <div className="ml-8 space-y-2">
                    {m.findings && <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Rekomendasi ({m.recs.length})</p>}
                    {m.recs.map((r, j) => {
                      const s = REC_STYLE[r.level]
                      return (
                        <div key={j} className={`rounded-xl border p-3 ${s.box}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            <p className={`text-[10px] font-bold tracking-wide ${s.label}`}>{r.tag}</p>
                          </div>
                          <div
                            className="mt-1 text-[11px] leading-relaxed text-slate-600 [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4"
                            dangerouslySetInnerHTML={{ __html: sanitize(r.text) }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ),
          )}
          {(typing || analyzing) && (
            <div className="flex gap-2.5">
              <span className="mt-1 h-6 w-6 shrink-0 rounded-lg bg-gradient-to-br from-copper-400 to-copper-600" />
              <div className="rounded-2xl rounded-tl-sm bg-slate-50 px-3.5 py-3 ring-1 ring-slate-100">
                {analyzing && (
                  <p className="mb-1.5 text-[10px] font-semibold text-slate-500">Membaca seluruh data dashboard & menyusun temuan…</p>
                )}
                <span className="typing-dot" /> <span className="typing-dot" /> <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        {/* input */}
        <form onSubmit={send} className="relative z-10 border-t border-slate-100 bg-white p-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 transition focus-within:border-mine-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-mine-100">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              type="text"
              placeholder="Ask about production, forecast..."
              autoComplete="off"
              className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
            <button type="submit" disabled={analyzing || typing} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mine-600 text-white transition hover:bg-mine-700 disabled:opacity-50">
              <Send size={13} />
            </button>
          </div>
          <p className="mt-2 text-center text-[9px] font-medium text-slate-400">Live · qwen3.5-122b via OpenRouter · reads current dashboard scope</p>
        </form>
      </aside>

      {/* floating button when panel collapsed */}
      <button
        onClick={() => { setCollapsed(false); resizeCharts() }}
        className={`fixed bottom-6 right-6 z-40 h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-copper-400 to-copper-600 text-white shadow-xl shadow-copper-500/30 transition hover:scale-105 ${
          collapsed ? 'flex' : 'hidden'
        }`}
      >
        <Sparkles size={19} />
      </button>
    </>
  )
}
