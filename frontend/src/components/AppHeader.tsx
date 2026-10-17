import { BarChart3, CalendarDays, Factory, Leaf, UserRound } from 'lucide-react'
import type { Page } from '../types'

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  periods: string[]
  period: string
  onPeriod: (p: string) => void
  ptOpts?: [string, string][]   // [code, name]
  pt?: string
  onPt?: (pt: string) => void
}

const TITLES: Record<Page, { title: string; sub: string }> = {
  production: {
    title: 'Production Intelligence',
    sub: 'Data-Driven Decisions for Higher Production, Greater Efficiency,\nand Sustainable Growth',
  },
  waste: {
    title: 'Waste to Value Dashboard',
    sub: 'From Waste to Sustainable Revenue  |  Toward Zero Waste',
  },
}

const tabBase =
  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] transition'
const tabIdle = 'font-semibold text-slate-300 hover:bg-white/10 hover:text-white'
const tabActive = 'font-bold text-green-400 bg-green-500/20 ring-1 ring-green-400/40'

/** Shared navy header — MIND ID brand, page title, tab switcher, Period filter. */
export default function AppHeader({ page, onNavigate, periods, period, onPeriod, ptOpts = [], pt = '', onPt }: Props) {
  const t = TITLES[page]

  return (
    <header className="sticky top-0 z-30 relative flex h-[74px] items-center gap-6 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 px-6 text-white shadow-lg">
      <div className="flex w-[190px] shrink-0 items-center gap-2.5">
        <div className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-white">
          <div className="h-3.5 w-3.5 rounded-full bg-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[19px] font-extrabold tracking-tight">MIND ID</p>
          <p className="text-[8.5px] font-medium text-slate-300">Mining for a Better Future</p>
        </div>
      </div>

      <div className="h-10 w-px bg-white/20" />

      <div className="min-w-0">
        <h1 className="text-[21px] font-extrabold leading-tight">{t.title}</h1>
        <p className="whitespace-pre-line text-[12px] text-slate-300">{t.sub}</p>
      </div>

      <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1">
        <button
          onClick={() => onNavigate('production')}
          aria-current={page === 'production' ? 'page' : undefined}
          className={`${tabBase} ${page === 'production' ? tabActive : tabIdle}`}
        >
          <BarChart3 className="h-3.5 w-3.5" />Production Intelligence
        </button>
        <button
          onClick={() => onNavigate('waste')}
          aria-current={page === 'waste' ? 'page' : undefined}
          className={`${tabBase} ${page === 'waste' ? tabActive : tabIdle}`}
        >
          <Leaf className="h-3.5 w-3.5" />Zero Waste Intelligence
        </button>
      </nav>

      <div className="ml-auto flex items-center gap-5">
        {ptOpts.length > 0 && (
          <>
            <div className="flex items-center gap-2.5">
              <Factory className="h-5 w-5 text-slate-300" />
              <div>
                <p className="mb-0.5 text-[10px] text-slate-400">Holding</p>
                <select className="hdr" value={pt} onChange={(e) => onPt?.(e.target.value)}>
                  <option value="">All PT</option>
                  {ptOpts.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
            </div>
            <div className="h-10 w-px bg-white/20" />
          </>
        )}
        <div className="flex items-center gap-2.5">
          <CalendarDays className="h-5 w-5 text-slate-300" />
          <div>
            <p className="mb-0.5 text-[10px] text-slate-400">Period</p>
            <select className="hdr" value={period} onChange={(e) => onPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="h-10 w-px bg-white/20" />
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 ring-1 ring-white/25">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-[12px] font-semibold">MIND ID</p>
            <p className="text-[10px] text-slate-400">Executive View <span className="ml-0.5">▾</span></p>
          </div>
        </div>
      </div>
    </header>
  )
}
