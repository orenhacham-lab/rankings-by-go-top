'use client'

/**
 * The optional import of Search Console's Links export, under "Links Google
 * already found". The Search Console API has no links report, so the owner can
 * export the report from Search Console and upload its CSV files here (CSV
 * only, up to MAX_IMPORT_FILES at once, one request; no zip, no Excel: the
 * server rejects anything that is not plain-text CSV).
 *
 * What it shows is a SNAPSHOT of that file and says so: the import date, and
 * "the list does not update by itself, import a new file to update it". A new
 * import replaces the previous one. Three lists when the file has them: sites
 * that link (site, linking pages, target pages), the most linked pages (page,
 * incoming links, linking sites) and the latest links (page, last crawled), 25
 * rows each with "show all".
 *
 * Reads and writes only /api/projects/[id]/site-links/gsc-import (the route does
 * the auth, the ownership check and the strict parsing). Every cell is drawn as
 * plain text (cleanCell, so no leading = + - @); a value is a link only when it
 * is an http(s) address with a real host (importedHref), opened in a new tab with
 * rel="nofollow noopener noreferrer". When the database does not have the table
 * yet the import shows as not yet available, with no error; if the read itself
 * fails the whole block stays out of the way. Guarded by
 * lib/site-links/gsc-import/__qa__/gsc-import.qa.ts.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, FileUp, Info, Upload } from 'lucide-react'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import {
  MAX_IMPORT_FILES, MAX_UPLOAD_BYTES, cleanCell, importedHref, readSnapshot, visibleRows,
  type GscImportSnapshot, type ImportErrorCode,
} from '@/lib/site-links/gsc-import/snapshot'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']
type ImportCopy = Copy['gscLinks']['import']

type Load = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'ok'; available: boolean; snapshot: GscImportSnapshot | null }
export type Banner = { tone: 'ok' | 'bad'; text: string } | null

export function gscImportUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/site-links/gsc-import`
}

function readAnswer(body: unknown): { available: boolean; snapshot: GscImportSnapshot | null } | null {
  if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) return null
  const b = body as { available?: unknown; snapshot?: unknown }
  return { available: b.available !== false, snapshot: b.snapshot ? readSnapshot(b.snapshot) : null }
}

export default function GscLinksImport({ projectId, copy }: { projectId: string; copy: Copy }) {
  const t = copy.gscLinks.import
  const { language } = useDashboardLanguage()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Banner>(null)

  useEffect(() => {
    let cancelled = false
    fetch(gscImportUrl(projectId), { cache: 'no-store' })
      .then(async (res) => (res.ok ? readAnswer(await res.json().catch(() => null)) : null))
      .catch(() => null)
      .then((a) => { if (!cancelled) setLoad(a ? { kind: 'ok', ...a } : { kind: 'hidden' }) })
    return () => { cancelled = true }
  }, [projectId])

  const upload = useCallback(async (files: File[]) => {
    setNotice(null)
    if (files.length > MAX_IMPORT_FILES) { setNotice({ tone: 'bad', text: t.errors.too_many_files }); return }
    if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) { setNotice({ tone: 'bad', text: t.errors.too_big }); return }
    setBusy(true)
    try {
      const form = new FormData()
      for (const f of files) form.append('file', f)
      const res = await fetch(gscImportUrl(projectId), { method: 'POST', body: form })
      const body = await res.json().catch(() => null) as { ok?: unknown; code?: unknown } | null
      const answer = res.ok ? readAnswer(body) : null
      if (answer?.snapshot) {
        setLoad({ kind: 'ok', available: true, snapshot: answer.snapshot })
        setNotice({ tone: 'ok', text: t.done })
      } else {
        const code = typeof body?.code === 'string' ? (body.code as ImportErrorCode) : null
        const known = code && code in t.errors ? (code as keyof typeof t.errors) : 'generic'
        setNotice({ tone: 'bad', text: t.errors[known] })
      }
    } catch {
      setNotice({ tone: 'bad', text: t.errors.generic })
    } finally {
      setBusy(false)
    }
  }, [projectId, t])

  if (load.kind === 'hidden') return null
  if (load.kind === 'loading') {
    return <div aria-hidden="true" className="mt-4"><Skeleton className="h-28 w-full rounded-card" /></div>
  }
  return (
    <ImportView
      copy={copy} locale={language === 'he' ? 'he-IL' : 'en-US'} available={load.available} snapshot={load.snapshot}
      busy={busy} notice={notice} onDismiss={() => setNotice(null)} onPick={(files) => void upload(files)}
    />
  )
}

/** Everything the block draws, from its state: what the QA renders and the screenshots show. */
export function ImportView({ copy, locale, available, snapshot, busy = false, notice = null, onDismiss, onPick }: {
  copy: Copy
  locale: string
  /** False when the database has no table for the snapshot yet: the import is shown, switched off. */
  available: boolean
  snapshot: GscImportSnapshot | null
  busy?: boolean
  notice?: Banner
  onDismiss?: () => void
  onPick?: (files: File[]) => void
}) {
  const t = copy.gscLinks.import
  const input = useRef<HTMLInputElement>(null)
  const picker = (variant: 'primary' | 'secondary', label: string) => (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={!available}
        data-gsc-import="file"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length > 0) onPick?.(files); e.target.value = '' }}
      />
      <Button type="button" variant={variant} loading={busy} disabled={!available} onClick={() => input.current?.click()} data-gsc-import="choose">
        {!busy && <Upload size={16} aria-hidden="true" />}
        {label}
      </Button>
    </>
  )

  return (
    <div className="mt-4 space-y-4" data-gsc-import={snapshot ? 'snapshot' : available ? 'empty' : 'unavailable'}>
      {notice && <Notice tone={notice.tone} onDismiss={onDismiss}>{notice.text}</Notice>}
      {busy && <p role="status" className="sr-only">{t.uploading}</p>}

      {snapshot ? (
        <>
          <section aria-label={t.title} className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 items-center rounded-pill border border-info/20 bg-info-soft px-2.5 text-caption font-semibold text-info">{t.snapshotBadge}</span>
                  <p className="text-copy font-semibold text-ink" data-gsc-import="updated">{t.updatedFrom(formatDate(snapshot.importedAt, locale))}</p>
                </div>
                <p className="mt-2 flex items-start gap-2 text-copy text-body text-pretty" data-gsc-import="not-auto">
                  <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>{t.notAuto}</span>
                </p>
                {snapshot.fileName && <p className="mt-1.5 text-caption text-muted">{t.fileLabel} <bdi dir="ltr">{snapshot.fileName}</bdi></p>}
              </div>
              <div className="shrink-0">{picker('secondary', t.chooseNew)}</div>
            </div>
            <details className="group mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer select-none rounded-sm text-caption font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action">{t.stepsLabel}</summary>
              <Steps t={t} className="mt-3" />
            </details>
          </section>
          <SnapshotLists snapshot={snapshot} copy={copy} locale={locale} />
        </>
      ) : (
        <section aria-label={t.title} className="rounded-card border border-dashed border-line-strong bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-sunk text-muted ring-1 ring-line">
              <FileUp size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-copy font-semibold text-ink">{t.title}</h3>
                <span className="inline-flex h-6 items-center rounded-pill border border-line bg-sunk px-2.5 text-caption font-semibold text-muted">{t.optional}</span>
              </div>
              <p className="mt-1 max-w-prose text-copy text-body text-pretty">{t.intro}</p>
            </div>
          </div>
          <Steps t={t} className="mt-5" />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="shrink-0">{picker('primary', t.choose)}</div>
            <p className="text-caption text-muted">{t.formats}</p>
          </div>
          <p className="mt-4 flex items-start gap-2 text-caption text-muted text-pretty" data-gsc-import="not-auto">
            <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{available ? t.notAutoEmpty : t.unavailable}</span>
          </p>
        </section>
      )}
    </div>
  )
}

/** The three lists of an imported file, 25 rows each with "show all". */
export function SnapshotLists({ snapshot, copy, locale }: { snapshot: GscImportSnapshot; copy: Copy; locale: string }) {
  const t = copy.gscLinks.import
  return (
    <>
      <ListCard
        id="sites" title={t.sites.title} total={snapshot.totals.linkingSites} rows={snapshot.linkingSites} t={t}
        row={(r) => (
          <Row
            main={<ImportedText value={r.site} newTabLabel={copy.opensNewTab} />}
            metrics={[[t.sites.linkingPages, r.linkingPages], [t.sites.targetPages, r.targetPages]]}
          />
        )}
      />
      <ListCard
        id="pages" title={t.pages.title} total={snapshot.totals.targetPages} rows={snapshot.targetPages} t={t}
        row={(r) => (
          <Row
            main={<ImportedText value={r.page} newTabLabel={copy.opensNewTab} />}
            metrics={[[t.pages.incomingLinks, r.incomingLinks], [t.pages.linkingSites, r.linkingSites]]}
          />
        )}
      />
      <ListCard
        id="latest" title={t.latest.title} total={snapshot.totals.latestLinks} rows={snapshot.latestLinks} t={t}
        row={(r) => (
          <Row
            main={<ImportedText value={r.linkingPage} newTabLabel={copy.opensNewTab} />}
            metrics={[[t.latest.lastCrawled, r.lastCrawled ? formatDate(r.lastCrawled, locale) : null]]}
          />
        )}
      />
    </>
  )
}

function Steps({ t, className }: { t: ImportCopy; className?: string }) {
  return (
    <ol className={cn('grid gap-3 sm:grid-cols-3 sm:gap-4', className)} data-gsc-import="steps">
      {t.steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-inset bg-sunk/60 p-3.5">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-caption font-semibold text-ink ring-1 ring-line">{i + 1}</span>
          <span className="text-copy text-body text-pretty">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function ListCard<T>({ id, title, total, rows, t, row }: {
  id: string; title: string; total: number; rows: readonly T[]; t: ImportCopy; row: (r: T) => React.ReactNode
}) {
  const [all, setAll] = useState(false)
  const listId = useId()
  if (rows.length === 0) return null
  const shown = visibleRows(rows, all)
  const more = rows.length > shown.length || all
  return (
    <section aria-label={title} data-gsc-import-list={id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
        <h3 className="text-copy font-semibold text-ink">{title}</h3>
        <span className="text-caption tabular-nums text-muted">{total}</span>
      </div>
      <ul id={listId} className="divide-y divide-line">
        {shown.map((r, i) => <li key={i} className="px-5 py-3 sm:px-6">{row(r)}</li>)}
      </ul>
      {(more || total > rows.length) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sunk/40 px-5 py-3 sm:px-6">
          {more ? (
            <button
              type="button"
              aria-expanded={all}
              aria-controls={listId}
              onClick={() => setAll((v) => !v)}
              data-gsc-import="show-all"
              className="rounded-sm text-copy font-semibold text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {all ? t.showLess : t.showAll(rows.length)}
            </button>
          ) : <span />}
          {total > rows.length && <span className="text-caption text-muted">{t.shownOf(rows.length, total)}</span>}
        </div>
      )}
    </section>
  )
}

function Row({ main, metrics }: { main: React.ReactNode; metrics: [string, number | string | null][] }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1 text-copy text-ink">{main}</div>
      <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-0.5">
        {metrics.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <dt className="text-caption text-muted">{label}</dt>
            <dd className="text-copy font-semibold tabular-nums text-ink">{value === null ? '—' : value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Plain text, or an external link when (and only when) it is an http(s) address. */
export function ImportedText({ value, newTabLabel }: { value: string; newTabLabel: string }) {
  const text = cleanCell(value, 2048)
  const href = importedHref(text)
  if (!href) return <bdi dir="ltr" className="block truncate" title={text}>{text}</bdi>
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      title={text}
      className="inline-flex max-w-full items-center gap-1 rounded-sm text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <bdi dir="ltr" className="min-w-0 truncate">{text}</bdi>
      <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
      <span className="sr-only">{` (${newTabLabel})`}</span>
    </a>
  )
}

/** "2 באוקטובר 2026" from an ISO date or timestamp; the text itself when it is not a date. */
export function formatDate(value: string, locale: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
  if (Number.isNaN(d.getTime())) return cleanCell(value, 40)
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}
