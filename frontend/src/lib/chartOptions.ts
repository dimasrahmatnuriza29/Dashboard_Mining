import type { EChartsOption } from 'echarts'
import type { CompositionSlice, TrendPoint } from '../types'

const tooltip = {
  backgroundColor: '#fff',
  borderColor: '#E2E8F0',
  textStyle: { color: '#334155', fontSize: 11 },
}

const baseAxis = {
  axisLine: { lineStyle: { color: '#E2E8F0' } },
  axisTick: { show: false },
  axisLabel: { color: '#94A3B8', fontSize: 10 },
  splitLine: { lineStyle: { color: '#F1F5F9' } },
}

const grad = (c0: string, c1: string, vertical = true) => ({
  type: 'linear' as const,
  x: 0, y: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0,
  colorStops: [{ offset: 0, color: c0 }, { offset: 1, color: c1 }],
})

/* ---------- Production trend + forecast band ---------- */
export const fmtQty = (v: number | null | undefined) =>
  v == null ? '—' : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)} Mt`
    : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)} kt` : `${v}`

export function trendOption(points: TrendPoint[]): EChartsOption {
  const dates = points.map((p) => p.date.slice(5))
  // gap shading: area between forecast and target on forecast months
  const gapBase = points.map((p) =>
    p.forecast != null && p.target != null ? Math.min(p.forecast, p.target) : null)
  const gapMiss = points.map((p) =>
    p.forecast != null && p.target != null && p.forecast < p.target ? p.target - p.forecast : null)
  const gapSurp = points.map((p) =>
    p.forecast != null && p.target != null && p.forecast > p.target ? p.forecast - p.target : null)

  return {
    tooltip: {
      trigger: 'axis', ...tooltip,
      formatter: (params: any) => {
        const pts = (params as any[]).filter((x) => x.value != null)
        const i = pts[0]?.dataIndex ?? 0
        const p = points[i]
        const rows = [`<b>${p?.date ?? ''}</b>`]
        if (p?.actual != null) rows.push(`Actual&nbsp;&nbsp;<b>${fmtQty(p.actual)}</b>`)
        if (p?.forecast != null) rows.push(`Forecast&nbsp;&nbsp;<b>${fmtQty(p.forecast)}</b>`)
        if (p?.target != null) rows.push(`Target&nbsp;&nbsp;<b>${fmtQty(p.target)}</b>`)
        const gap = p?.gap ?? (p?.forecast != null && p?.target != null ? p.forecast - p.target : null)
        if (gap != null) {
          const col = gap >= 0 ? '#059669' : '#DC2626'
          const pct = p?.target ? ` (${((gap / p.target) * 100).toFixed(1)}%)` : ''
          rows.push(`<span style="color:${col}">Gap&nbsp;&nbsp;<b>${gap >= 0 ? '+' : ''}${fmtQty(gap)}</b>${pct}</span>`)
        }
        return rows.join('<br/>')
      },
    },
    grid: { left: 54, right: 16, top: 20, bottom: 26 },
    xAxis: { type: 'category', data: dates, boundaryGap: false, ...baseAxis, splitLine: { show: false } },
    yAxis: {
      type: 'value', ...baseAxis,
      axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => fmtQty(v) },
    },
    series: [
      // 95% confidence band (stacked: lower + upper-lower)
      { name: 'lo', type: 'line', data: points.map((p) => p.lower), stack: 'band', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: 'band', type: 'line', data: points.map((p) => (p.upper != null && p.lower != null ? +(p.upper - p.lower).toFixed(2) : null)), stack: 'band', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(245,138,11,.12)' }, tooltip: { show: false } },
      // gap shading between forecast and target (red = miss, green = surplus)
      { name: 'gapbase', type: 'line', data: gapBase, stack: 'gap', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: 'gapmiss', type: 'line', data: gapMiss, stack: 'gap', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(220,38,38,.10)' }, tooltip: { show: false } },
      { name: 'gapsurp', type: 'line', data: gapSurp, stack: 'gap', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(5,150,105,.10)' }, tooltip: { show: false } },
      {
        name: 'Target', type: 'line', data: points.map((p) => p.target),
        smooth: 0.3, symbol: 'none',
        lineStyle: { width: 1.8, color: '#94A3B8', type: 'dotted' },
        itemStyle: { color: '#94A3B8' },
      },
      {
        name: 'Actual', type: 'line', data: points.map((p) => p.actual),
        smooth: 0.4, symbolSize: 7,
        itemStyle: { color: '#0C85E9', borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2.6, color: '#0C85E9' },
        areaStyle: { color: grad('rgba(12,133,233,.20)', 'rgba(12,133,233,0)') },
      },
      {
        name: 'Forecast', type: 'line', data: points.map((p) => p.forecast),
        smooth: 0.4, symbolSize: 6,
        itemStyle: { color: '#F58A0B', borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2.4, color: '#F58A0B', type: 'dashed' },
      },
    ],
    animationDuration: 900,
  }
}

/* ---------- Material composition donut ---------- */
const COMPOSITION_PALETTE = ['#0C85E9', '#F58A0B', '#475569', '#36A2F9', '#FBBF24']
const OTHERS_COLOR = '#CBD5E1'
export const MAX_SLICES = 4

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function donutOption(slices: CompositionSlice[]): EChartsOption {
  const sorted = [...slices].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const othersValue = +rest.reduce((sum, s) => sum + s.value, 0).toFixed(1)

  const data = top.map((s, i) => ({
    name: titleCase(s.name),
    value: s.value,
    itemStyle: { color: COMPOSITION_PALETTE[i % COMPOSITION_PALETTE.length] },
  }))
  if (rest.length) {
    data.push({ name: `Others (${rest.length})`, value: othersValue, itemStyle: { color: OTHERS_COLOR } })
  }
  const share = Object.fromEntries(data.map((d) => [d.name, d.value]))
  const othersDetail = rest.map((s) => `${titleCase(s.name)}: ${s.value}%`).join('<br/>')

  return {
    tooltip: {
      ...tooltip,
      formatter: (p: any) =>
        p.name.startsWith('Others') && othersDetail
          ? `<b>${p.name}</b> — ${p.value}%<br/>${othersDetail}`
          : `<b>${p.name}</b> — ${p.value}%`,
    },
    legend: {
      orient: 'vertical', right: 4, top: 'middle', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 12,
      textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
      formatter: (name: string) => `${name}  ${share[name] ?? ''}%`,
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '74%'],
        center: ['32%', '50%'],
        padAngle: 2,
        minAngle: 3,
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: {
          fontSize: 10, color: '#fff', fontWeight: 700, position: 'inside',
          formatter: (p: any) => (p.percent >= 8 ? `${Math.round(p.percent)}%` : ''),
        },
        labelLine: { show: false },
        emphasis: { scaleSize: 6 },
        data,
      },
    ],
    animationType: 'scale',
    animationDuration: 1100,
  }
}

/* ---------- YTD gauge ---------- */
export function gaugeOption(value: number): EChartsOption {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210, endAngle: -30, min: 0, max: 100,
        progress: { show: true, width: 14, itemStyle: { color: grad('#36A2F9', '#F58A0B', false) } },
        axisLine: { lineStyle: { width: 14, color: [[1, '#EEF2F6']] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false },
        title: { show: true, offsetCenter: [0, '32%'], fontSize: 11, color: '#94A3B8', fontWeight: 600 },
        detail: { valueAnimation: true, fontSize: 30, fontWeight: 800, color: '#0F172A', formatter: '{value}%', offsetCenter: [0, '-4%'] },
        data: [{ value, name: 'Achievement' }],
      },
    ],
  }
}

/* ---------- KPI sparkline ---------- */
export function sparkOption(points: number[], color = '#0C85E9'): EChartsOption {
  return {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: points.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 'dataMin' },
    series: [
      {
        type: 'line', data: points, smooth: 0.5, symbol: 'none',
        lineStyle: { width: 1.6, color },
        areaStyle: { color: grad(`${color}2E`, `${color}00`) },
      },
    ],
    animationDuration: 800,
  }
}

/* ---------- drill-down modal chart ---------- */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const axisDate = (d: string) =>
  d.length === 7 ? MONTH_SHORT[+d.slice(5, 7) - 1] : d.slice(5)   // 'YYYY-MM' → 'Sep', else 'MM-DD'

export function modalOption(points: { date: string; value: number }[], unit = ''): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis', ...tooltip,
      valueFormatter: (v: any) => `${Number(v).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`,
    },
    grid: { left: 44, right: 16, top: 18, bottom: 26 },
    xAxis: { type: 'category', data: points.map((p) => axisDate(p.date)), boundaryGap: false, ...baseAxis, splitLine: { show: false } },
    yAxis: { type: 'value', ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => fmtQty(v) } },
    series: [
      {
        type: 'line', data: points.map((p) => p.value), smooth: 0.4, symbolSize: 6,
        itemStyle: { color: '#F58A0B', borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2.4, color: '#F58A0B' },
        areaStyle: { color: grad('rgba(245,138,11,.18)', 'rgba(245,138,11,0)') },
      },
    ],
    animationDuration: 700,
  }
}
