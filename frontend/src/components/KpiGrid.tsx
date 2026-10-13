import { useEffect, useMemo, useState } from 'react'
import EChart from './EChart'
import { sparkOption } from '../lib/chartOptions'
import type { Kpi } from '../types'

function useCountUp(target: number, decimals: number, duration = 1400) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(parseFloat((target * eased).toFixed(decimals)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, decimals, duration])
  return val
}

const DELAYS = ['d2', 'd3', 'd4', 'd5']

function KpiCard({ kpi, delay, onClick }: { kpi: Kpi; delay: string; onClick: () => void }) {
  const v = useCountUp(kpi.value, kpi.decimals)
  const good = kpi.good_when_negative ? kpi.delta <= 0 : kpi.delta >= 0
  const display = kpi.decimals ? v.toFixed(kpi.decimals) : Math.round(v).toLocaleString('en-US')
  const opt = useMemo(() => sparkOption(kpi.sparkline, good ? '#0C85E9' : '#F58A0B'), [kpi.sparkline, good])

  return (
    <div className={`kpi-card rise ${delay} cursor-pointer rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm`} onClick={onClick}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${good ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
          {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900">
        {(kpi.unit === '$' || kpi.unit === 'Rp') && <span className="text-sm font-semibold text-slate-400">{kpi.unit} </span>}
        {display}
        {kpi.unit && kpi.unit !== '$' && kpi.unit !== 'Rp' && <span className="text-sm font-semibold text-slate-400"> {kpi.unit}</span>}
      </p>
      <EChart option={opt} className="mt-1 h-9" />
    </div>
  )
}

export default function KpiGrid({ kpis, onDrill }: { kpis: Kpi[]; onDrill: (kpi: Kpi) => void }) {
  return (
    <section className="grid grid-cols-2 gap-4 lg:col-span-3 lg:grid-cols-4">
      {kpis.map((k, i) => (
        <KpiCard key={k.id} kpi={k} delay={DELAYS[i % DELAYS.length]} onClick={() => onDrill(k)} />
      ))}
    </section>
  )
}
