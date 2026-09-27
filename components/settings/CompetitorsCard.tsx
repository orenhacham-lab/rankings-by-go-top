'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { Plus, ScanSearch, Swords, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { MAX_ACTIVE_COMPETITORS } from '@/lib/seed-scan/settings'
import { competitorDomainInput, competitorKey } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import Notice from './Notice'
import SettingsCard, { fieldClass } from './SettingsCard'
import SourceChip from './SourceChip'
import { SECTION } from './anchors'
import { Ltr } from './copy'

type Copy = DashboardDictionary['projectSettings']

type Competitor = { id: string; name: string; domain: string | null; is_active: boolean }

type Load =
  | { status: 'loading' }
  | { status: 'ready'; items: Competitor[] }
  | { status: 'failed'; signedOut: boolean }
  /** The competitors routes answer 404: their feature is off, so the card is not shown. */
  | { status: 'off' }

/** What an add or a removal went wrong with, in the card's own words. */
type Problem = 'invalid' | 'duplicate' | 'self' | 'max' | 'saveError' | 'signedOut'

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/ai-visibility/competitors`

/** The route's rows, field by field; anything else it sends is ignored. */
function readCompetitors(body: unknown): Competitor[] {
  const list = (body as { competitors?: unknown } | null)?.competitors
  if (!Array.isArray(list)) return []
  const out: Competitor[] = []
  for (const raw of list) {
    const r = raw as Record<string, unknown> | null
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') continue
    out.push({ id: r.id, name: r.name, domain: typeof r.domain === 'string' && r.domain ? r.domain : null, is_active: r.is_active === true })
  }
  return out
}

/**
 * Row 6: the competitors the rankings and the AI visibility are measured
 * against, through the same owner-checked routes the AI visibility screen uses
 * (nothing about them changes). Each add or removal is saved at once, like
 * there. The route's own messages are never shown: every answer is mapped to
 * this card's copy by its status and code.
 *
 * There is no "detect again with AI" here: competitors come from real search
 * results, which only a scan of the site runs. The card points to it instead.
 */
export default function CompetitorsCard({
  projectId,
  projectDomain,
  scanCompetitors,
  seedFeatures,
  onScanLink,
  onAvailability,
  t,
}: {
  projectId: string
  projectDomain: string
  /** Domains the scan itself added, for their "from the scan" chip. */
  scanCompetitors: string[]
  seedFeatures: boolean
  /** Take the owner to the site scan. */
  onScanLink: () => void
  /** Whether the card is shown at all (its routes may be off), for the screen's index. */
  onAvailability?: (shown: boolean) => void
  t: Copy
}) {
  const c = t.competitors
  const inputId = useId()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [input, setInput] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(base(projectId), { cache: 'no-store' })
      if (res.status === 404) return setLoad({ status: 'off' })
      if (!res.ok) return setLoad({ status: 'failed', signedOut: res.status === 401 })
      setLoad({ status: 'ready', items: readCompetitors(await res.json().catch(() => null)) })
    } catch {
      setLoad({ status: 'failed', signedOut: false })
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (load.status !== 'loading') onAvailability?.(load.status !== 'off')
  }, [load.status, onAvailability])

  if (load.status === 'off') return null

  const items = load.status === 'ready' ? load.items : []
  const active = items.filter((i) => i.is_active)
  const scanKeys = new Set(scanCompetitors)
  const self = competitorDomainInput(projectDomain)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (adding) return
    const domain = competitorDomainInput(input)
    if (!domain) return setProblem('invalid')
    if (domain === self) return setProblem('self')
    if (active.some((i) => competitorKey(i) === domain)) return setProblem('duplicate')
    if (active.length >= MAX_ACTIVE_COMPETITORS) return setProblem('max')
    setProblem(null)
    setAdding(true)
    try {
      // A competitor removed earlier comes back as it was (its history stays one row).
      const earlier = items.find((i) => !i.is_active && competitorKey(i) === domain)
      const res = earlier
        ? await fetch(`${base(projectId)}/${encodeURIComponent(earlier.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: true }),
          })
        : await fetch(base(projectId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: domain, domain }),
          })
      if (res.ok) {
        setInput('')
        await refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { code?: unknown } | null
        setProblem(res.status === 401 ? 'signedOut' : body?.code === 'max_competitors_reached' ? 'max' : 'saveError')
      }
    } catch {
      setProblem('saveError')
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    if (removing) return
    setRemoving(id)
    setProblem(null)
    try {
      const res = await fetch(`${base(projectId)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) await refresh()
      else setProblem(res.status === 401 ? 'signedOut' : 'saveError')
    } catch {
      setProblem('saveError')
    } finally {
      setRemoving(null)
    }
  }

  const full = active.length >= MAX_ACTIVE_COMPETITORS
  return (
    <SettingsCard
      id={SECTION.competitors}
      icon={Swords}
      title={c.title}
      description={c.body}
      actions={
        load.status === 'ready' ? (
          <span className="rounded-pill border border-line bg-sunk px-2.5 py-0.5 text-caption font-semibold tabular-nums text-muted">
            {active.length}/{MAX_ACTIVE_COMPETITORS}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {load.status === 'loading' && (
          <div className="space-y-2" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-control bg-sunk" />
            ))}
          </div>
        )}

        {load.status === 'failed' && (
          <Notice tone="bad" action={load.signedOut ? null : { label: t.retry, onClick: () => void refresh() }}>
            {load.signedOut ? c.signedOut : c.loadError}
          </Notice>
        )}

        {load.status === 'ready' && (
          <>
            {active.length === 0 ? (
              <p className="rounded-control border border-dashed border-line-strong px-3 py-4 text-center text-copy text-muted">{c.empty}</p>
            ) : (
              <ul className="space-y-2">
                {active.map((item) => {
                  const key = competitorKey(item)
                  const shown = item.domain ?? item.name
                  const named = item.domain && item.name.toLowerCase() !== item.domain.toLowerCase() ? item.name : null
                  return (
                    <li
                      key={item.id}
                      data-competitor={key ?? item.id}
                      className={cn(
                        'flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5 animate-pop-in transition-opacity',
                        removing === item.id && 'opacity-50',
                      )}
                    >
                      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-sunk text-caption font-bold uppercase text-muted">
                        {shown.replace(/^www\./, '').slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Ltr className="block truncate text-copy font-medium text-ink">{shown}</Ltr>
                        {named && <span className="block truncate text-caption text-muted">{named}</span>}
                      </span>
                      {seedFeatures && key && scanKeys.has(key) && (
                        <SourceChip compact kind="scan" label={t.source.scan} title={t.source.scanTitle} />
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        disabled={removing !== null}
                        aria-label={`${c.remove} ${shown}`}
                        title={c.remove}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <form onSubmit={add} noValidate>
              <label htmlFor={inputId} className="mb-1.5 block text-copy font-medium text-body">{c.addLabel}</label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    if (problem) setProblem(null)
                  }}
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={c.addPlaceholder}
                  disabled={full}
                  aria-invalid={problem === 'invalid' || problem === 'duplicate' || problem === 'self' ? true : undefined}
                  aria-describedby={problem ? `${inputId}-problem` : undefined}
                  className={cn(fieldClass, 'min-w-0 flex-1 text-start')}
                />
                <Button type="submit" variant="secondary" loading={adding} disabled={full || !input.trim()}>
                  {!adding && <Plus size={15} aria-hidden />}
                  {c.add}
                </Button>
              </div>
              {(problem || full) && (
                <p id={`${inputId}-problem`} role={problem ? 'alert' : undefined} className={cn('mt-1.5 text-caption', problem ? 'text-bad' : 'text-muted')}>
                  {problem ? c[problem] : c.max}
                </p>
              )}
            </form>
          </>
        )}

        {seedFeatures && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-caption text-muted">
            <ScanSearch size={14} aria-hidden className="shrink-0 text-info" />
            <span className="min-w-0">{c.scanNote}</span>
            <a
              href={`#${SECTION.scan}`}
              onClick={(e) => {
                e.preventDefault()
                onScanLink()
              }}
              className="font-semibold text-action underline-offset-2 hover:underline"
            >
              {c.scanLink}
            </a>
          </p>
        )}
      </div>
    </SettingsCard>
  )
}
