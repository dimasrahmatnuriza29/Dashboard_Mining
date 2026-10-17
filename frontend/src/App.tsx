import { useEffect, useState } from 'react'
import AppHeader from './components/AppHeader'
import ProductionPage from './pages/ProductionPage'
import WastePage from './pages/WastePage'
import { fetchProduction, fetchWaste } from './api'
import type { Page, ProductionData, WasteData } from './types'

const PATHS: Record<Page, string> = { production: '/production', waste: '/waste' }

const pageFromPath = (): Page =>
  window.location.pathname.startsWith('/waste') ? 'waste' : 'production'

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath)
  const [prod, setProd] = useState<ProductionData | null>(null)
  const [waste, setWaste] = useState<WasteData | null>(null)
  const [periods, setPeriods] = useState<string[]>([])
  const [period, setPeriod] = useState('')
  const [pt, setPt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const navigate = (p: Page) => {
    window.history.pushState({}, '', PATHS[p])
    setPage(p)
  }

  useEffect(() => {
    const onPop = () => setPage(pageFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    setError(null)
    const load = page === 'production'
      ? () => fetchProduction(period, pt)
      : () => fetchWaste(period)
    load()
      .then((d) => {
        setPeriods(d.periods)
        if (!d.periods.includes(period)) {
          setPeriod(d.periods[0])          // stale period → refetch with a valid one
          return
        }
        if (page === 'production') {
          const pd = d as ProductionData
          setProd(pd)
          // warm-up: silently cache other PT scopes so header filter switches are instant
          pd.pt_rows
            .map((r) => r.pt_code)
            .filter((code) => code !== pt)
            .forEach((code) => { fetchProduction(period, code).catch(() => {}) })
        } else {
          const wd = d as WasteData
          setWaste(wd)
          // warm-up: silently cache other periods so header period switches are instant
          wd.periods
            .filter((p) => p !== period)
            .forEach((p) => { fetchWaste(p).catch(() => {}) })
        }
      })
      .catch((e) => setError(String(e)))
  }, [page, period, pt])

  const data = page === 'production' ? prod : waste

  return (
    <div className="font-sans text-slate-700 antialiased">
      <AppHeader
        page={page} onNavigate={navigate}
        periods={periods} period={period} onPeriod={setPeriod}
        ptOpts={page === 'production' && prod ? prod.pt_rows.map((r) => [r.pt_code, r.pt]) : []}
        pt={pt} onPt={setPt}
      />

      {!data && (
        <div className="m-4 grid grid-cols-12 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card col-span-4 h-40 p-4">
              <div className="shimmer h-4 w-40 rounded" />
              <div className="shimmer mt-4 h-24 rounded-xl" />
              {error && i === 0 && (
                <p className="mt-3 text-[11px] text-red-500">Backend unreachable: {error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {page === 'production' && prod && <ProductionPage data={prod} />}
      {page === 'waste' && waste && <WastePage data={waste} />}
    </div>
  )
}
