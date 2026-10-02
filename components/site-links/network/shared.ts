/**
 * Small pieces the link network's screen shares: the routes' addresses, the
 * answer type, and how a day is written.
 */
import type { NetworkAnswer } from '@/lib/link-network/http'

export type AvailableNetwork = Extract<NetworkAnswer, { available: true }>

export function networkUrl(projectId: string, rest = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}/link-network${rest}`
}

export function formatDay(iso: string | null | undefined, language: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
