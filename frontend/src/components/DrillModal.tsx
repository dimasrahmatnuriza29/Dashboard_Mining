import { useEffect, useMemo, useState } from 'react'
import { LineChart, X } from 'lucide-react'
import EChart from './EChart'
import { modalOption, trendOption } from '../lib/chartOptions'
import type { DrillSpec } from '../types'

interface Props {
  spec: DrillSpec | null
  onClose: () => void
}

const TONE_CLS = {
  good: 'text-emerald-600',
  bad: 'text-red-500',
  neutral: 'text-slate-700',
}

export default function DrillModal({ spec, onClose }: Props) {
  const [cur, setCur] = useState<DrillSpec | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (spec) {
      setCur(spec)
      const raf = requestAnimationFrame(() => setOpen(true))
      return () => cancelAnimationFrame(raf)
    }
    setOpen(false)
    const t = setTimeout(() => setCur(null), 260)
    return () => clearTimeout(t)
  }, [spec])

  const opt = useMemo(() => {
    if (!cur) return null
    if (cur.trend?.length) return trendOption(cur.trend)
    if (cur.points?.length) return modalOption(cur.points, cur.unit)
    return null
  }, [cur])

  if (!cur) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className={`modal-backdrop absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`modal-panel relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-100 text-copper-600">
              <LineChart size={16} />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">{cur.title}</p>
              {cur.subtitle && <p className="text-[10px] font-medium text-slate-400">{cur.subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          {cur.stats && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {cur.stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                  <p className={`mt-0.5 text-sm font-extrabold ${TONE_CLS[s.tone ?? 'neutral']}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
          {opt
            ? <EChart option={opt} className="h-56" />
            : <p className="py-8 text-center text-[11px] text-slate-400">No monthly series for this selection.</p>}
        </div>
      </div>
    </div>
  )
}
