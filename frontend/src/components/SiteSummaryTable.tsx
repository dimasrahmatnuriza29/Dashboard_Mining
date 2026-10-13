import { Download } from 'lucide-react'
import type { SiteRow } from '../types'

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

const STATUS_STYLE: Record<SiteRow['status'], string> = {
  'On Track': 'bg-emerald-50 text-emerald-600',
  Ahead: 'bg-emerald-50 text-emerald-600',
  Watch: 'bg-amber-50 text-amber-600',
  Behind: 'bg-red-50 text-red-500',
}

export default function SiteSummaryTable({ rows, onRowClick }: { rows: SiteRow[]; onRowClick?: (r: SiteRow) => void }) {
  const th = 'sticky top-0 z-10 bg-slate-50 px-5 py-2.5'
  return (
    <div className="max-h-[260px] overflow-y-auto">
      <table className="w-full text-left text-xs">
      <thead>
        <tr className="border-y border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <th className={th}>Site</th>
          <th className={th}>Commodity</th>
          <th className={th}>Production (t)</th>
          <th className={th}>Achievement</th>
          <th className={th} title="Latest month vs trailing 6-month average">Downtime (h)</th>
          <th className={th}>Forecast Δ</th>
          <th className={th}>Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.site} className={`transition hover:bg-mine-50/40 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(r)}>
            <td className="px-5 py-3 font-semibold text-slate-700">{r.site}</td>
            <td className="px-5 py-3 text-slate-500">{r.commodity ? titleCase(r.commodity) : '—'}</td>
            <td className="px-5 py-3">{r.production_t.toLocaleString('en-US')}</td>
            <td className="px-5 py-3">{r.achievement_pct}%</td>
            <td className="px-5 py-3">
              {r.downtime_h.toLocaleString('en-US')}
              {r.downtime_avg_h != null && (
                <span
                  className={`ml-1 text-[10px] font-semibold ${r.downtime_h > r.downtime_avg_h ? 'text-red-500' : 'text-emerald-600'}`}
                  title="vs avg 6 bulan"
                >
                  · avg {r.downtime_avg_h.toLocaleString('en-US')}
                </span>
              )}
            </td>
            <td className={`px-5 py-3 font-semibold ${r.forecast_delta_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {r.forecast_delta_pct > 0 ? '+' : ''}{r.forecast_delta_pct}%
            </td>
            <td className="px-5 py-3">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

export function ExportButton() {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-mine-300 hover:text-mine-700">
      <Download size={12} /> Export CSV
    </button>
  )
}
