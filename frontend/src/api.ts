import type { ChatResp, InsightResp, ProductionData, WasteData } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

const qs = (period?: string, pt?: string) => {
  const p = new URLSearchParams()
  if (period) p.set('period', period)
  if (pt) p.set('pt', pt)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const fetchProduction = (period?: string, pt?: string) =>
  request<ProductionData>(`/api/production${qs(period, pt)}`)

export const fetchWaste = (period?: string) =>
  request<WasteData>(`/api/waste${qs(period)}`)

export const fetchInsight = (context: unknown) =>
  request<InsightResp>('/api/ai/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  })

export const fetchChat = (
  message: string,
  history: { role: string; content: string }[],
  context: unknown,
) =>
  request<ChatResp>('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, context }),
  })
