import type { ChatResponse, DashboardData } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

export const fetchDashboard = (pt?: string, asof?: string) => {
  const q = new URLSearchParams()
  if (pt && pt !== 'ALL') q.set('pt', pt)
  if (asof) q.set('asof', asof)
  const qs = q.toString()
  return request<DashboardData>(`/api/dashboard${qs ? `?${qs}` : ''}`)
}

export const sendChat = (
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  context: Record<string, unknown>,
) =>
  request<ChatResponse>('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, context }),
  })
