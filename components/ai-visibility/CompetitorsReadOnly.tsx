'use client'

/**
 * The competitors tab of the AI-visibility tool, once the project has a
 * seeding scan: the competitors each answer is compared against, shown, and a
 * link to settings for adding and removing them. Management moved to the
 * settings screen (its #competitors section); showing them stays here.
 *
 * It reads the same owner-checked route the editor reads
 * (/api/projects/[id]/ai-visibility/competitors) and writes nothing. A failed
 * read says so in our own words; the route's error text is never shown.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Settings2, Sparkles } from 'lucide-react'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Row = { id: string; name: string; domain: string | null; is_active: boolean }

type ReadState = { status: 'loading' | 'error' } | { status: 'ready'; rows: Row[] }

async function readCompetitors(projectId: string): Promise<ReadState> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-visibility/competitors`, { cache: 'no-store' })
    if (!res.ok) return { status: 'error' }
    const body = await res.json().catch(() => null)
    const list = Array.isArray(body?.competitors) ? (body.competitors as Row[]) : []
    return { status: 'ready', rows: list.filter((r) => r && r.is_active && typeof r.name === 'string') }
  } catch {
    return { status: 'error' }
  }
}

const domainKey =(d: string | null | undefined) =>
  (d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')

export default function CompetitorsReadOnly({
  projectId,
  scanDomains,
  manageHref,
}: {
  projectId: string
  /** Domains the seeding scan validated; those rows carry a "from the scan" tag. */
  scanDomains: string[]
  manageHref: string
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).aiVisibilityOverview
  const [state, setState] = useState<ReadState>({ status: 'loading' })

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void readCompetitors(projectId).then((next) => { if (!cancelled) setState(next) })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const fromScan = new Set(scanDomains.map(domainKey))

  return (
    <section
      aria-labelledby="ai-competitors-title"
      data-ai-competitors={state.status === 'ready' ? (state.rows.length ? 'ready' : 'empty') : state.status}
      className="rounded-card border border-line bg-surface p-5"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="ai-competitors-title" className="text-section font-semibold text-ink">{c.competitorsTitle}</h3>
          <p className="mt-0.5 max-w-[60ch] text-caption text-muted">{c.competitorsSubtitle}</p>
        </div>
        <Link
          href={manageHref}
          data-ai-competitors-manage=""
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-control border border-line bg-surface px-3 py-1.5 text-copy font-medium text-body transition-colors hover:bg-sunk"
        >
          <Settings2 size={14} aria-hidden="true" />
          {c.competitorsManage}
        </Link>
      </header>

      {state.status === 'loading' && (
        <div className="mt-4 flex gap-2" aria-busy="true">
          <span className="sr-only">{c.competitorsLoading}</span>
          {[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="h-9 w-40 rounded-control bg-sunk" />)}
        </div>
      )}
      {state.status === 'error' && (
        <p className="mt-4 text-copy text-muted">
          {c.competitorsLoadFailed}{' '}
          <button type="button" onClick={retry} className="font-medium text-action hover:underline">{c.competitorsRetry}</button>
        </p>
      )}
      {state.status === 'ready' && state.rows.length === 0 && <p className="mt-4 text-copy text-body">{c.competitorsEmpty}</p>}
      {state.status === 'ready' && state.rows.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {state.rows.map((r) => {
            const scanned = fromScan.has(domainKey(r.domain)) || fromScan.has(domainKey(r.name))
            return (
              <li key={r.id} data-ai-competitor-chip="" className="flex min-w-0 max-w-full items-center gap-2.5 rounded-control border border-line bg-surface py-2 pe-3 ps-2 shadow-control">
                <SiteAvatar domain={r.domain} name={r.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-copy font-medium text-ink">{r.name}</span>
                  {r.domain && r.domain !== r.name && <span className="block truncate text-caption text-muted" dir="ltr">{r.domain}</span>}
                </span>
                {scanned && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-action-soft px-2 py-0.5 text-caption font-medium text-action">
                    <Sparkles size={11} aria-hidden="true" />
                    {c.competitorsFromScan}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
