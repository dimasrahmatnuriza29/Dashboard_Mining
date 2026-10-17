import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type {
  DonutItem,
  MapSite,
  PtProdRow,
  PtWaste,
  RevBar,
  TrendSeries,
  VizSpec,
  WasteTrend,
} from '../types'

export const NAVY = '#0d2d4f'
export const GREEN = '#16a34a'
export const GREY = '#c3cdd9'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

const tooltip = { backgroundColor: '#fff', borderColor: '#E2E8F0', textStyle: { color: '#334155', fontSize: 11 } }

/* ---------- shared mini sparkline ---------- */
export function miniSpark(data: number[], color: string): EChartsOption {
  return {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 'dataMin' },
    series: [
      {
        type: 'line', data, smooth: true, symbol: 'none',
        lineStyle: { color, width: 1.8 },
        areaStyle: { color, opacity: 0.12 },
      },
    ],
    tooltip: { show: false },
    animationDuration: 800,
  }
}

/* ---------- Production: trend & forecast (line) ---------- */
export function prodTrendOption(t: TrendSeries): EChartsOption {
  const vals = [...t.actual, ...t.forecast, t.target].filter((v): v is number => v != null)
  const lo = Math.max(0, Math.floor(Math.min(...vals) * 0.85))
  const hi = Math.ceil(Math.max(...vals) * 1.1)
  return {
    tooltip: { trigger: 'axis', ...tooltip, valueFormatter: (v: unknown) => `${fmt(Number(v), 2)} Mt` },
    legend: {
      top: 2, left: 0, itemGap: 14, itemWidth: 18, itemHeight: 3,
      textStyle: { fontSize: 10, color: '#475569' },
      data: ['Actual', 'Forecast', 'Target'],
    },
    grid: { left: 36, right: 10, top: 34, bottom: 24 },
    xAxis: {
      type: 'category', data: t.months, boundaryGap: false,
      axisLabel: { fontSize: 9.5, color: '#64748b' },
      axisLine: { lineStyle: { color: '#dbe3ec' } },
    },
    yAxis: {
      type: 'value', min: lo, max: hi,
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f6' } },
    },
    series: [
      {
        name: 'Actual', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: t.actual,
        lineStyle: { width: 2.5, color: '#2563eb' },
        itemStyle: { color: '#2563eb', borderColor: '#fff', borderWidth: 1.5 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37,99,235,.18)' },
              { offset: 1, color: 'rgba(37,99,235,0)' },
            ],
          },
        },
      },
      {
        name: 'Forecast', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: t.forecast,
        lineStyle: { width: 2.5, type: 'dashed', color: '#f59e0b' },
        itemStyle: { color: '#f59e0b', borderColor: '#fff', borderWidth: 1.5 },
      },
      {
        name: 'Target', type: 'line',
        data: t.months.map(() => t.target),
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1.5, color: NAVY },
        itemStyle: { color: NAVY },
      },
    ],
  }
}

/* ---------- Production: commodity donut (HTML legend below) ---------- */
export function prodDonutOption(items: DonutItem[], centerTop: string, centerBottom: string): EChartsOption {
  return {
    tooltip: { ...tooltip, valueFormatter: (v: unknown) => `${v}%` },
    series: [
      {
        type: 'pie', radius: ['56%', '80%'], center: ['50%', '50%'],
        label: {
          show: true, position: 'center',
          formatter: `{a|${centerTop}}\n{b|${centerBottom}}`,
          rich: {
            a: { fontSize: 16, fontWeight: 800, color: NAVY },
            b: { fontSize: 9.5, color: '#94a3b8' },
          },
        },
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        data: items.map((i) => ({ name: i.name, value: i.value, itemStyle: { color: i.color } })),
      },
    ],
  }
}

/* ---------- Production: actual vs plan bars ---------- */
export function vsPlanOption(rows: PtProdRow[], selCode = ''): EChartsOption {
  const hi = Math.ceil(Math.max(...rows.map((r) => Math.max(r.actual, r.plan))) * 1.15)
  // header PT filter → highlight the selected PT, dim the rest (keep context)
  const op = (r: PtProdRow) => (selCode && r.pt_code !== selCode ? 0.28 : 1)
  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltip,
      valueFormatter: (v: unknown) => `${fmt(Number(v), 2)} Mt`,
    },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 9, textStyle: { fontSize: 10, color: '#475569' } },
    grid: { left: 34, right: 8, top: 30, bottom: 36 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => `${r.pt}\n${r.achievement_pct}%`),
      axisLabel: { fontSize: 9.5, color: '#64748b', interval: 0, lineHeight: 13 },
      axisLine: { lineStyle: { color: '#dbe3ec' } },
    },
    yAxis: {
      type: 'value', max: hi,
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f6' } },
    },
    series: [
      {
        name: 'Actual', type: 'bar', barWidth: '30%',
        data: rows.map((r) => ({ value: r.actual, itemStyle: { color: '#2563eb', borderRadius: [3, 3, 0, 0], opacity: op(r) } })),
        label: { show: true, position: 'top', fontSize: 9, fontWeight: 700, color: NAVY, formatter: (p: { value: unknown }) => fmt(Number(p.value), 2) },
      },
      {
        name: 'Plan/RKAP', type: 'bar', barWidth: '30%',
        data: rows.map((r) => ({ value: r.plan, itemStyle: { color: '#93c5fd', borderRadius: [3, 3, 0, 0], opacity: op(r) } })),
        label: { show: true, position: 'top', fontSize: 9, color: '#64748b', formatter: (p: { value: unknown }) => fmt(Number(p.value), 2) },
      },
    ],
  }
}

/* ---------- AI-generated chart (VizSpec from LLM) ---------- */
export function aiVizOption(v: VizSpec): EChartsOption {
  const base = {
    tooltip: { ...tooltip, trigger: v.kind === 'pie' ? 'item' : 'axis' },
    title: v.title
      ? { text: v.title, left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 700, color: NAVY } }
      : undefined,
    legend: { bottom: 0, itemWidth: 12, itemHeight: 9, textStyle: { fontSize: 9.5, color: '#475569' } },
  } as Record<string, unknown>
  if (v.kind === 'pie') {
    return {
      ...base,
      series: [{
        type: 'pie', radius: ['35%', '62%'], center: ['50%', '52%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { fontSize: 9.5, color: '#475569' },
        data: v.x.map((name, i) => ({ name, value: v.series[0]?.data[i] ?? 0 })),
      }],
    } as EChartsOption
  }
  const PALETTE = ['#2563eb', '#93c5fd', '#f59e0b', '#16a34a', '#a855f7', '#0d2d4f']
  return {
    ...base,
    grid: { left: 44, right: 12, top: 34, bottom: 40 },
    xAxis: {
      type: 'category', data: v.x,
      axisLabel: { fontSize: 9.5, color: '#64748b', interval: 0 },
      axisLine: { lineStyle: { color: '#dbe3ec' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f6' } },
    },
    series: v.series.map((s, i) => ({
      name: s.name, type: v.kind, data: s.data, smooth: v.kind === 'line',
      itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: v.kind === 'bar' ? [3, 3, 0, 0] : 0 },
      label: { show: v.kind === 'bar', position: 'top', fontSize: 9, color: NAVY, formatter: (p: { value: unknown }) => fmt(Number(p.value), 2) },
    })),
  } as EChartsOption
}

/* ---------- Indonesia map ---------- */
const GEO_URL = 'https://raw.githubusercontent.com/ans-4175/peta-indonesia-geojson/master/indonesia-prov.geojson'
let geoPromise: Promise<boolean> | null = null

/** Fetch + register the Indonesia geojson once. Resolves false on failure. */
export function loadIndonesiaGeo(): Promise<boolean> {
  if (!geoPromise) {
    geoPromise = fetch(GEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error('geo fetch failed')
        return r.json()
      })
      .then((geo) => {
        echarts.registerMap('indonesia', geo as never)
        return true
      })
      .catch(() => false)
  }
  return geoPromise
}

export function indonesiaMapOption(
  sites: MapSite[],
  ptColors: Record<string, string>,
  opts: { zoom?: number; labels?: boolean } = {},
): EChartsOption {
  return {
    tooltip: { ...tooltip, formatter: (p: any) => p.name ?? '' },
    geo: {
      map: 'indonesia', roam: false, zoom: opts.zoom ?? 1.18, top: 12, bottom: 8,
      itemStyle: { areaColor: '#e8eef5', borderColor: '#c3cdd9', borderWidth: 0.6 },
      emphasis: { itemStyle: { areaColor: '#dbe6f2' }, label: { show: false } },
    },
    series: sites.map((s) => ({
      name: s.pt,
      type: 'scatter',
      coordinateSystem: 'geo',
      zlevel: 2,
      symbolSize: s.size,
      itemStyle: {
        color: ptColors[s.pt] ?? '#64748b',
        borderColor: '#fff', borderWidth: 1.5,
        shadowBlur: 4, shadowColor: 'rgba(0,0,0,.25)',
      },
      data: [{ name: s.name, value: [s.lon, s.lat] }],
      label: opts.labels === false || !s.show_label
        ? { show: false }
        : { show: true, formatter: '{b}', position: 'top', fontSize: 8.5, fontWeight: 600, color: NAVY, distance: 4 },
    })) as EChartsOption['series'],
  }
}

/** Fallback: schematic lon/lat scatter when geojson can't be fetched. */
export function indonesiaFallbackOption(
  sites: MapSite[],
  ptColors: Record<string, string>,
): EChartsOption {
  return {
    tooltip: { ...tooltip },
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    xAxis: { min: 94, max: 142, show: false },
    yAxis: { min: -12, max: 8, show: false },
    series: sites.map((s) => ({
      name: s.pt,
      type: 'scatter',
      symbolSize: s.size,
      itemStyle: { color: ptColors[s.pt] ?? '#64748b', borderColor: '#fff', borderWidth: 1.5 },
      data: [{ name: s.name, value: [s.lon, s.lat] }],
    })) as EChartsOption['series'],
  }
}

/* ---------- Waste: generation & utilization trend ---------- */
export function wasteTrendOption(t: WasteTrend): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltip,
      formatter: (params: any) => {
        const pts = params as { seriesName?: string; value?: number; axisValue?: string }[]
        const rows = [`<b>${pts[0]?.axisValue ?? ''}</b>`]
        for (const p of pts) {
          const v = p.seriesName === '% Utilization' ? `${p.value}%` : `${fmt(Number(p.value))}k Ton`
          rows.push(`${p.seriesName}&nbsp;&nbsp;<b>${v}</b>`)
        }
        return rows.join('<br/>')
      },
    },
    legend: {
      top: 0, left: 'center', itemGap: 14, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
      textStyle: { fontSize: 10.5, color: '#475569' },
      data: ['Recycled / Utilized', 'Landfill / Others', '% Utilization'],
    },
    graphic: [{ type: 'text', left: 2, top: 3, style: { text: 'Unit: Ton', fontSize: 10, fill: '#94a3b8' } }],
    grid: { left: 42, right: 42, top: 36, bottom: 24 },
    xAxis: {
      type: 'category', data: t.quarters,
      axisLabel: { fontSize: 10, color: '#64748b' },
      axisLine: { lineStyle: { color: '#dbe3ec' } },
    },
    yAxis: [
      {
        type: 'value', max: 200,
        axisLabel: { formatter: (v: number) => `${v}k`, fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#eef2f6' } },
      },
      {
        type: 'value', max: 100,
        axisLabel: { formatter: '{value}%', fontSize: 10, color: '#94a3b8' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Recycled / Utilized', type: 'bar', stack: 'w', data: t.recycled, barWidth: 22,
        itemStyle: { color: GREEN, borderRadius: [2, 2, 0, 0] },
      },
      {
        name: 'Landfill / Others', type: 'bar', stack: 'w', data: t.landfill,
        itemStyle: { color: GREY, borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '% Utilization', type: 'line', yAxisIndex: 1, data: t.utilization, smooth: true,
        lineStyle: { color: NAVY, width: 2.4 }, itemStyle: { color: NAVY }, symbolSize: 6,
        label: { show: true, position: 'top', formatter: '{c}%', fontSize: 10, fontWeight: 700, color: NAVY },
      },
    ],
  }
}

/* ---------- Waste: composition donut (ECharts legend right) ---------- */
export function wasteDonutOption(items: DonutItem[], center: string): EChartsOption {
  return {
    tooltip: { ...tooltip, formatter: '{b}: {c}%' },
    legend: {
      orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10,
      textStyle: { fontSize: 10.5, color: '#475569' },
      formatter: (name: string) => `${name}  ${items.find((i) => i.name === name)?.value ?? ''}%`,
    },
    series: [
      {
        type: 'pie', radius: ['58%', '82%'], center: ['32%', '52%'],
        label: { show: false },
        data: items.map((i) => ({ name: i.name, value: i.value, itemStyle: { color: i.color } })),
      },
      {
        type: 'pie', radius: ['0%', '0%'], center: ['32%', '52%'], silent: true,
        label: { show: true, position: 'center', formatter: () => center, fontSize: 15, fontWeight: 800, color: NAVY, lineHeight: 16 },
        data: [{ value: 1 }],
      },
    ],
  }
}

/* ---------- Waste: potential vs realized grouped bars ---------- */
export function revBarOption(bars: RevBar[]): EChartsOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltip },
    legend: {
      show: true, top: 0, right: 0, itemWidth: 10, itemHeight: 8,
      textStyle: { fontSize: 9, color: '#475569' },
    },
    grid: { left: 4, right: 8, top: 22, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f6' } },
    },
    yAxis: {
      type: 'category', inverse: true, data: bars.map((b) => b.name),
      axisLabel: { fontSize: 9, color: '#475569', width: 92, overflow: 'truncate' },
      axisTick: { show: false }, axisLine: { show: false },
    },
    series: [
      {
        name: 'Potential', type: 'bar',
        data: bars.map((b) => b.pot),
        barWidth: 7, itemStyle: { color: GREY, borderRadius: [0, 3, 3, 0] },
      },
      {
        name: 'Realized', type: 'bar',
        data: bars.map((b) => b.rea),
        barWidth: 7,
        itemStyle: { color: GREEN, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true, position: 'right', fontSize: 8.5, fontWeight: 700, color: NAVY,
          formatter: (p: unknown) => `${(p as { value: number }).value}M`,
        },
      },
    ],
  }
}

/* ---------- Waste: monthly waste & utilization per PT ---------- */
export function monthlyPtOption(d: PtWaste): EChartsOption {
  return {
    tooltip: { trigger: 'axis', ...tooltip },
    legend: { show: true, top: 0, right: 0, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 9, color: '#475569' } },
    grid: { left: 30, right: 30, top: 26, bottom: 20 },
    xAxis: {
      type: 'category', data: MONTHS,
      axisLabel: { fontSize: 8.5, color: '#64748b', rotate: 0 },
      axisLine: { lineStyle: { color: '#dbe3ec' } },
    },
    yAxis: [
      {
        type: 'value', max: 80,
        axisLabel: { formatter: (v: number) => `${v}k`, fontSize: 9, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#eef2f6' } },
      },
      {
        type: 'value', max: 100,
        axisLabel: { formatter: '{value}%', fontSize: 9, color: '#94a3b8' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Waste Generated', type: 'bar', data: d.monthly, barWidth: 8,
        itemStyle: { color: '#94a3b8', borderRadius: [2, 2, 0, 0] },
      },
      {
        name: 'Utilization Rate', type: 'line', yAxisIndex: 1, data: d.monthly_util, smooth: true,
        lineStyle: { color: GREEN, width: 2 }, itemStyle: { color: GREEN }, symbolSize: 4,
      },
    ],
  }
}
