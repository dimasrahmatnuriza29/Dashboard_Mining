import { useEffect, useState } from 'react'
import EChart from './EChart'
import { indonesiaFallbackOption, indonesiaMapOption, loadIndonesiaGeo } from '../lib/mockupCharts'
import type { MapSite } from '../types'

interface Props {
  sites: MapSite[]
  ptColors: Record<string, string>
  zoom?: number
  labels?: boolean
  className?: string
}

type GeoState = 'loading' | 'ready' | 'fallback'

/** Indonesia map — geojson if reachable, schematic lon/lat scatter otherwise. */
export default function MapChart({ sites, ptColors, zoom, labels, className }: Props) {
  const [geo, setGeo] = useState<GeoState>('loading')

  useEffect(() => {
    let alive = true
    loadIndonesiaGeo().then((ok) => alive && setGeo(ok ? 'ready' : 'fallback'))
    return () => {
      alive = false
    }
  }, [])

  if (geo === 'loading') {
    return <div className={`${className} shimmer rounded-lg`} />
  }

  const option =
    geo === 'ready'
      ? indonesiaMapOption(sites, ptColors, { zoom, labels })
      : indonesiaFallbackOption(sites, ptColors)

  return <EChart option={option} className={className} />
}
