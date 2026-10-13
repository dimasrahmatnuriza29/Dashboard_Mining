import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { DashboardData } from '../types'

interface Notif {
  dot: string
  title: string
  msg: string
}

// alerts derived from the live dashboard payload — worst-first ordering
function buildNotifs(d: DashboardData | null): Notif[] {
  if (!d) return []
  const out: Notif[] = []

  const behind = d.site_summary
    .filter((s) => s.status === 'Behind')
    .sort((a, b) => a.achievement_pct - b.achievement_pct)
  if (behind.length)
    out.push({
      dot: 'bg-red-500',
      title: `${behind.length} site${behind.length > 1 ? 's' : ''} behind plan`,
      msg: `Worst: ${behind[0].site} at ${behind[0].achievement_pct}% achievement.`,
    })

  const spikes = d.site_summary
    .filter((s) => s.downtime_avg_h != null && s.downtime_h > s.downtime_avg_h)
    .sort((a, b) => b.downtime_h - b.downtime_avg_h! - (a.downtime_h - a.downtime_avg_h!))
  if (spikes.length)
    out.push({
      dot: 'bg-amber-500',
      title: 'Downtime above 6M average',
      msg: `${spikes.length} site${spikes.length > 1 ? 's' : ''} over baseline — ${spikes[0].site} +${(spikes[0].downtime_h - spikes[0].downtime_avg_h!).toFixed(1)} h.`,
    })

  if (d.ytd_achievement_pct < 90)
    out.push({ dot: 'bg-red-500', title: 'YTD below plan', msg: `Group YTD achievement at ${d.ytd_achievement_pct}%.` })

  const badKpis = d.kpis.filter((k) => (k.good_when_negative ? k.delta > 5 : k.delta < -5))
  for (const k of badKpis)
    out.push({
      dot: 'bg-amber-500',
      title: `${k.label} moved against target`,
      msg: `${k.delta > 0 ? '+' : ''}${k.delta}% vs previous month.`,
    })

  const ahead = d.site_summary
    .filter((s) => s.status === 'Ahead')
    .sort((a, b) => b.achievement_pct - a.achievement_pct)
  if (ahead.length)
    out.push({
      dot: 'bg-emerald-500',
      title: `${ahead.length} site${ahead.length > 1 ? 's' : ''} ahead of plan`,
      msg: `Best: ${ahead[0].site} at ${ahead[0].achievement_pct}% achievement.`,
    })

  return out
}

interface Props {
  data: DashboardData | null
  scope: string
}

export default function Header({ data, scope }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const notifs = useMemo(() => buildNotifs(data), [data])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <header className="relative z-20 border-b border-slate-200/80 bg-white/70 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-mine-800 via-mine-600 to-mine-400 shadow-md shadow-mine-600/20">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20 L7 8 L12 15 L16 6 L21 20" /></svg>
          </div>
          <div>
            <p className="text-[15px] font-extrabold leading-tight tracking-tight text-slate-900">MindID <span className="text-grad">Analytics</span></p>
            <p className="text-[11px] font-medium text-slate-500">Mining Operations Dashboard — POC</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={box}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-mine-700"
            >
              <Bell size={16} strokeWidth={2.2} />
              {notifs.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-copper-500 text-[9px] font-bold text-white">
                  {notifs.length}
                </span>
              )}
            </button>
            <div
              className={`absolute right-0 top-11 w-80 rounded-xl border border-slate-200 bg-white shadow-xl transition-all ${
                open ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-1 opacity-0'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <p className="text-xs font-bold text-slate-700">Alerts</p>
                <span className="rounded-full bg-copper-100 px-2 py-0.5 text-[10px] font-bold text-copper-700">
                  {notifs.length ? `${notifs.length} active` : 'clear'}
                </span>
              </div>
              <div className="max-h-64 overflow-auto p-1.5">
                {notifs.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] text-slate-400">
                    {data ? 'All clear — no alerts in current scope.' : 'Loading data…'}
                  </p>
                ) : (
                  notifs.map((n) => (
                    <div key={n.title} className="flex gap-3 rounded-lg p-2.5 hover:bg-slate-50">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${n.dot}`} />
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{n.title}</p>
                        <p className="text-[11px] text-slate-500">{n.msg}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="border-t border-slate-100 px-4 py-2 text-[10px] font-medium text-slate-400">{scope}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
