'use client'

/**
 * Where the owner stands with each site on the list: not started, contacted, or
 * link received. KEPT IN THIS BROWSER ONLY (localStorage, per project), until a
 * table for it is approved: nothing here is sent anywhere. Every read and write
 * is wrapped, so a private window or blocked storage simply starts empty and the
 * screen still works.
 */
import { useCallback, useEffect, useState } from 'react'

export const OUTREACH_STATUSES = ['not_started', 'contacted', 'got_link'] as const
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const statusKey = (projectId: string) => `site-links-status:${projectId}`

export function readStatuses(raw: string | null): Record<string, OutreachStatus> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, OutreachStatus> = {}
    for (const [domain, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (domain.length <= 253 && (OUTREACH_STATUSES as readonly unknown[]).includes(value) && value !== 'not_started') out[domain] = value as OutreachStatus
    }
    return out
  } catch {
    return {}
  }
}

export function useOpportunityStatus(projectId: string) {
  const [statuses, setStatuses] = useState<Record<string, OutreachStatus>>({})

  // Read after mount: the server render has no storage, and the first client
  // render must match it.
  useEffect(() => {
    let raw: string | null = null
    try { raw = window.localStorage.getItem(statusKey(projectId)) } catch { /* storage blocked */ }
    const next = readStatuses(raw)
    const t = setTimeout(() => setStatuses(next), 0)
    return () => clearTimeout(t)
  }, [projectId])

  const setStatus = useCallback((domain: string, status: OutreachStatus) => {
    setStatuses((prev) => {
      const next = { ...prev }
      if (status === 'not_started') delete next[domain]
      else next[domain] = status
      try { window.localStorage.setItem(statusKey(projectId), JSON.stringify(next)) } catch { /* storage blocked: kept for this visit */ }
      return next
    })
  }, [projectId])

  const statusOf = useCallback((domain: string): OutreachStatus => statuses[domain] ?? 'not_started', [statuses])
  return { statusOf, setStatus }
}
