'use client'

/**
 * The research summary: what stage A found, in the plan's ten blocks and in
 * their order (plan §0), with no sign-up gate since the merchant is signed in.
 *
 *   1 the badge, "here's what we found about {business}", "we just scanned {domain}"
 *   2 four tiles, each with its coloured status dot
 *   3 the business (chips and description)   ┐
 *   4 its audiences                          ├ each with "Edit", into settings
 *   5 its competitors                        ┘
 *   6 what's holding the site back
 *   7 the keywords we would promote, each with a checkbox and why
 *   8 readiness for AI answers, four rows with why each matters
 *   9 the articles we would write (and the one first-article button)
 *  10 "Start": tracks the keywords still checked, starts stage B, opens the dashboard
 *
 * Every block says honestly when it has nothing: a locked storefront is "not
 * checked", never failing and never 0/4; so is a site whose firewall refused
 * our reader, whose research was built from Google's index of it (a notice
 * under the intro says so); a step that did not finish says so.
 * The snapshot's own text (the business, keywords, topics) is in the language
 * it was written in, so it carries its own `lang` and direction; the labels
 * around it follow the interface.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  FileText,
  Lock,
  MapPin,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { freeCheckCopy } from '@/lib/free-check/copy'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { dashboardHref, settingsHref, summaryHref, type SummaryEditSection } from '@/lib/onboarding/links'
import { continueNotice, OFFLINE_NOTICE, trackingNotice, type Notice } from '@/lib/onboarding/notices'
import {
  findingsView,
  geoView,
  initialSelection,
  keywordReason,
  orderedCompetitors,
  scannedAgo,
  siteFirewalled,
  stepStatusOf,
  storefrontLocked,
  tilesView,
  type TileView,
} from '@/lib/onboarding/summary-view'
import { MAX_CONTINUE_KEYWORDS, type SeedRunView, type SeedSummary } from '@/lib/seed-scan/types'
import { cn } from '@/lib/utils'
import FirstArticleButton from './FirstArticleButton'
import { ActionLink, BlockNote, isolate, StatusDot, SummaryBlock } from './parts'
import SeedNotice from './SeedNotice'

const SEVERITY_STYLE: Record<string, string> = {
  blocker: 'bg-bad-soft text-bad border-bad/20',
  warning: 'bg-warn-soft text-warn border-warn/25',
  info: 'bg-info-soft text-info border-info/20',
}

export default function ResearchSummary({
  projectId,
  domain,
  projectName,
  run,
  summary,
  started,
  contentEnabled,
  serverNow,
  onContinued,
}: {
  projectId: string
  domain: string
  projectName: string
  run: SeedRunView
  summary: SeedSummary
  /** Stage B already began: the keywords are read-only and "Start" is behind us. */
  started: boolean
  contentEnabled: boolean
  /** The server's clock when the page was rendered. */
  serverNow: string
  /** Stage B was accepted: read the run again. */
  onContinued: () => void
}) {
  const router = useRouter()
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).seedOnboarding
  const t = dict.summary
  const checks = freeCheckCopy(language)
  const Arrow = language === 'he' ? ArrowLeft : ArrowRight

  const [selected, setSelected] = useState<string[]>(() => initialSelection(summary.seedKeywords))
  const [continuing, setContinuing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const a3 = stepStatusOf(run, 'a3')
  const locked = storefrontLocked(summary)
  const firewalled = siteFirewalled(summary)
  const tiles = tilesView(summary, run)
  const findings = findingsView(summary, a3)
  const geo = geoView(summary, a3)
  const competitors = orderedCompetitors(summary)
  const business = summary.business
  const name = business?.companyName?.trim() || projectName.trim() || domain
  const ago = scannedAgo(summary.scannedAt, new Date(serverNow))
  const site = isolate(domain)
  // Built from Google's index: the site itself was not scanned, so no "we just scanned it".
  const scannedLine = firewalled
    ? t.fromSearchIndex(site)
    : !ago
      ? null
      : ago.kind === 'justNow'
        ? t.scannedJustNow(site)
        : ago.kind === 'hours'
          ? t.scannedHoursAgo(site, ago.value)
          : t.scannedDaysAgo(site, ago.value)
  // Evidence ("12 of 48 images") is written in the snapshot's language; shown only when it matches.
  const sameLanguage = summary.locale === language
  const snapshotText = { lang: summary.locale, dir: 'auto' as const }

  const atLimit = selected.length >= MAX_CONTINUE_KEYWORDS

  function toggle(keyword: string) {
    setSelected((current) => {
      if (current.includes(keyword)) return current.filter((k) => k !== keyword)
      if (current.length >= MAX_CONTINUE_KEYWORDS) return current
      // Keep the scan's order, whatever order they were checked in.
      return summary.seedKeywords.filter((k) => k === keyword || current.includes(k))
    })
  }

  async function start() {
    if (continuing) return
    setContinuing(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'continue', keywords: selected }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: unknown; tracking?: unknown } | null
      if (res.status === 202 && body?.ok === true) {
        onContinued()
        const tracked = trackingNotice(body.tracking)
        // The keywords may not have been added (the plan's limit): say so before moving on.
        if (tracked) setNotice(tracked)
        else router.push(dashboardHref(projectId))
        return
      }
      const refusal = continueNotice(res.status, body)
      if (refusal === 'open_dashboard') {
        router.push(dashboardHref(projectId))
        return
      }
      setNotice(refusal)
    } catch {
      setNotice(OFFLINE_NOTICE)
    } finally {
      setContinuing(false)
    }
  }

  const editLink = (section: SummaryEditSection, title: string) => (
    <ActionLink href={settingsHref(projectId, section)} variant="secondary" className="h-8 px-3">
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      <span aria-hidden>{t.edit}</span>
      <span className="sr-only">{t.editLabel(title)}</span>
    </ActionLink>
  )

  const tileLabel = (tile: TileView) => t.tiles[tile.id]
  const tileValue = (tile: TileView) =>
    tile.state === 'value' ? tile.value : tile.state === 'pending' ? t.tiles.pending : t.tiles.notChecked

  return (
    <div className="mx-auto w-full max-w-6xl" data-seed-screen={started ? 'started' : 'summary'}>
      {/* 1 ── who and when */}
      <header data-summary-block="intro" className="pt-1 md:pt-4">
        <p className="inline-flex items-center gap-2 rounded-pill border border-action/20 bg-action-soft px-3 py-1 text-caption font-semibold text-action">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t.badge}
        </p>
        <h1 className="mt-4 max-w-[28ch] text-balance text-3xl font-bold leading-tight tracking-tight text-ink md:text-[2.5rem] md:leading-[1.1]">
          {t.title(isolate(name))}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">
          {scannedLine && <span>{scannedLine}</span>}
          {summary.source === 'claim' && (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-sunk px-2.5 py-0.5 text-caption font-medium text-body">
              {t.fromFreeCheck}
            </span>
          )}
        </p>
      </header>

      {firewalled && (
        <div
          data-summary-block="firewall"
          role="note"
          className="mt-6 flex items-start gap-3 rounded-card border border-warn/25 bg-warn-soft px-4 py-4 md:px-5"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-warn">
            <ShieldAlert className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{t.firewall.title}</p>
            <p className="mt-1 max-w-[80ch] text-sm leading-6 text-body">{t.firewall.body}</p>
          </div>
        </div>
      )}

      {/* 2 ── the four tiles */}
      <section data-summary-block="tiles" aria-label={t.badge} className="mt-8 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.id} data-tile={tile.id} data-tile-state={tile.state} className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
            <p className="flex items-start gap-2 text-sm leading-5 text-muted">
              <StatusDot tone={tile.tone} className="mt-1.5" />
              <span className="min-w-0">{tileLabel(tile)}</span>
            </p>
            <p
              className={cn(
                'mt-3 font-semibold tabular-nums text-ink',
                tile.state === 'value' ? 'text-3xl tracking-tight md:text-[2.25rem]' : 'text-base text-muted',
              )}
            >
              {tileValue(tile)}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-4 md:gap-5 lg:grid-cols-12">
        {/* 3 ── the business */}
        <SummaryBlock id="business" index={1} title={t.business.title} action={editLink('business', t.business.title)} className="lg:col-span-7">
          {business ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {business.niche && (
                  <li className="rounded-pill border border-line bg-sunk px-3 py-1 text-sm">
                    <span className="text-muted">{t.business.niche} </span>
                    <span className="font-medium text-ink" {...snapshotText}>{business.niche}</span>
                  </li>
                )}
                <li className="rounded-pill border border-line bg-sunk px-3 py-1 text-sm">
                  <span className="text-muted">{t.business.commerceType} </span>
                  <span className="font-medium text-ink">{t.business.commerce[business.commerceType] ?? t.business.commerce.other}</span>
                </li>
                {business.platform && (
                  <li className="rounded-pill border border-line bg-sunk px-3 py-1 text-sm">
                    <span className="text-muted">{t.business.platform} </span>
                    <span className="font-medium text-ink" dir="auto">{business.platform}</span>
                  </li>
                )}
                <li className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-sunk px-3 py-1 text-sm font-medium text-ink">
                  <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden />
                  {business.isLocal ? t.business.local : t.business.notLocal}
                </li>
              </ul>
              {business.description && (
                <p className="mt-4 max-w-[70ch] text-base leading-7 text-body" {...snapshotText}>
                  {business.description}
                </p>
              )}
            </>
          ) : (
            <BlockNote icon={locked ? <Lock className="h-4 w-4" aria-hidden /> : undefined}>{locked ? t.business.locked : t.business.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 4 ── audiences */}
        <SummaryBlock id="audiences" index={2} title={t.audiences.title} action={editLink('audiences', t.audiences.title)} className="lg:col-span-5">
          {summary.audiences.length > 0 ? (
            <ul className="space-y-2">
              {summary.audiences.map((audience) => (
                <li key={audience} className="flex items-start gap-3 text-base leading-7 text-body">
                  <span aria-hidden className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-action" />
                  <span {...snapshotText}>{audience}</span>
                </li>
              ))}
            </ul>
          ) : (
            <BlockNote>{t.audiences.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 5 ── competitors */}
        <SummaryBlock id="competitors" index={3} title={t.competitors.title} action={editLink('competitors', t.competitors.title)} className="lg:col-span-5">
          {competitors.length > 0 ? (
            <ul className="divide-y divide-line">
              {competitors.map((c) => (
                <li key={c.domain} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink" dir="ltr">{c.domain}</p>
                    <p className="text-sm text-muted">{c.validated ? t.competitors.seenIn(c.seenIn) : t.competitors.suggested}</p>
                  </div>
                  {c.validated && (
                    <span aria-hidden className="flex shrink-0 gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={cn('h-1.5 w-4 rounded-full', i < c.seenIn ? 'bg-action' : 'bg-line')} />
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <BlockNote>{t.competitors.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 6 ── what's holding the site back */}
        <SummaryBlock id="findings" index={4} title={t.findings.title} className="lg:col-span-7">
          {findings.kind === 'list' ? (
            <>
              <ul className="space-y-3">
                {findings.findings.map((f) => {
                  const copy = checks.findings[f.id]
                  return (
                    <li key={f.id} className="rounded-control border border-line p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-pill border px-2 py-0.5 text-caption font-semibold', SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info)}>
                          {t.findings.severity[f.severity] ?? t.findings.severity.info}
                        </span>
                        <p className="min-w-0 font-medium text-ink" {...(copy ? {} : snapshotText)}>{copy?.title ?? f.title}</p>
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-muted" {...(copy ? {} : snapshotText)}>{copy?.detail ?? f.detail}</p>
                      {f.evidence && sameLanguage && <p className="mt-1 font-mono text-xs text-muted">{f.evidence}</p>}
                    </li>
                  )
                })}
              </ul>
              {findings.omitted > 0 && <p className="mt-3 text-sm text-muted">{t.findings.omitted(findings.omitted)}</p>}
            </>
          ) : findings.kind === 'clean' ? (
            <div className="flex items-center gap-3 rounded-control bg-ok-soft px-4 py-3 text-sm font-medium text-ok">
              <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
              {t.findings.clean}
            </div>
          ) : (
            <BlockNote
              icon={
                findings.kind === 'locked' ? (
                  <Lock className="h-4 w-4" aria-hidden />
                ) : findings.kind === 'firewall' ? (
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                ) : findings.kind === 'pending' ? (
                  <CircleDashed className="h-4 w-4" aria-hidden />
                ) : undefined
              }
            >
              {findings.kind === 'locked'
                ? t.findings.locked
                : findings.kind === 'firewall'
                  ? t.findings.firewall
                  : findings.kind === 'pending'
                    ? t.findings.pending
                    : t.findings.failed}
            </BlockNote>
          )}
        </SummaryBlock>

        {/* 7 ── keywords */}
        <SummaryBlock
          id="keywords"
          index={5}
          title={t.keywords.title}
          description={started || summary.seedKeywords.length === 0 ? undefined : t.keywords.hint}
          action={
            started || summary.seedKeywords.length === 0 ? null : (
              <p className="font-mono text-xs tabular-nums text-muted" aria-live="polite">
                {t.keywords.selected(selected.length, summary.seedKeywords.length)}
              </p>
            )
          }
          className="lg:col-span-7"
        >
          {summary.seedKeywords.length === 0 ? (
            <BlockNote>{t.keywords.empty}</BlockNote>
          ) : started ? (
            <>
              <ul className="space-y-2">
                {summary.seedKeywords.map((keyword) => (
                  <li key={keyword} className="rounded-control border border-line px-4 py-3">
                    <p className="font-medium text-ink" {...snapshotText}>{keyword}</p>
                    <p className="mt-0.5 text-sm text-muted">{t.keywords.reasons[keywordReason(keyword, business, domain)]}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">{t.keywords.tracked}</p>
            </>
          ) : (
            <>
              <ul className="space-y-2">
                {summary.seedKeywords.map((keyword, i) => {
                  const checked = selected.includes(keyword)
                  const disabled = !checked && atLimit
                  const inputId = `seed-keyword-${i}`
                  return (
                    <li key={keyword}>
                      <label
                        htmlFor={inputId}
                        className={cn(
                          'flex items-start gap-3 rounded-control border px-4 py-3 transition-colors duration-150',
                          checked ? 'border-action/40 bg-action-soft/60' : 'border-line bg-surface',
                          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-strong',
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          className="peer sr-only"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(keyword)}
                        />
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-[background-color,border-color,transform] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-action peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas',
                            checked ? 'scale-100 border-action bg-action text-action-ink' : 'border-line-strong bg-surface',
                          )}
                        >
                          {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-ink" {...snapshotText}>{keyword}</span>
                          <span className="mt-0.5 block text-sm text-muted">{t.keywords.reasons[keywordReason(keyword, business, domain)]}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {atLimit && summary.seedKeywords.length > MAX_CONTINUE_KEYWORDS && (
                <p className="mt-3 text-sm text-muted">{t.keywords.limit(MAX_CONTINUE_KEYWORDS)}</p>
              )}
            </>
          )}
        </SummaryBlock>

        {/* 8 ── readiness for AI answers */}
        <SummaryBlock
          id="geo"
          index={6}
          title={t.geo.title}
          description={geo.kind === 'measured' ? t.geo.intro : undefined}
          action={geo.kind === 'measured' ? <p className="text-sm font-semibold tabular-nums text-ink">{t.geo.score(geo.passed, geo.total)}</p> : null}
          className="lg:col-span-5"
        >
          {geo.kind === 'measured' ? (
            <ul className="space-y-3">
              {geo.signals.map((s) => {
                const copy = checks.geo[s.id]?.[s.ok ? 'pass' : 'fail']
                return (
                  <li key={s.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        s.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
                      )}
                    >
                      {s.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <span className="sr-only">{s.ok ? t.geo.pass : t.geo.fail}: </span>
                        <span {...(copy ? {} : snapshotText)}>{copy?.title ?? s.title}</span>
                      </p>
                      <p className="mt-0.5 text-sm leading-6 text-muted" {...(copy ? {} : snapshotText)}>{copy?.detail ?? s.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex items-start gap-3 rounded-control border border-line bg-sunk px-4 py-4" data-geo-state={geo.kind}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                {geo.kind === 'locked' ? (
                  <Lock className="h-4 w-4" aria-hidden />
                ) : geo.kind === 'firewall' ? (
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                ) : (
                  <CircleDashed className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {geo.kind === 'locked'
                    ? t.geo.locked
                    : geo.kind === 'firewall'
                      ? t.geo.firewall
                      : geo.kind === 'pending'
                        ? t.geo.pending
                        : geo.kind === 'failed'
                          ? t.geo.failed
                          : t.geo.notChecked}
                </p>
                {geo.kind !== 'failed' && (
                  <p className="mt-0.5 text-sm leading-6 text-muted">
                    {geo.kind === 'locked'
                      ? t.geo.lockedBody
                      : geo.kind === 'firewall'
                        ? t.geo.firewallBody
                        : geo.kind === 'pending'
                          ? t.geo.pendingBody
                          : t.geo.notCheckedBody}
                  </p>
                )}
              </div>
            </div>
          )}
        </SummaryBlock>

        {/* 9 ── articles */}
        <SummaryBlock id="articles" index={7} title={t.articles.title} className="lg:col-span-12">
          {summary.topics.length > 0 ? (
            <>
              <ol className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                {summary.topics.map((topic, i) => (
                  <li key={topic} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                    <span className="mt-0.5 font-mono text-xs tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                    <FileText className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 text-base leading-7 text-ink" {...snapshotText}>{topic}</span>
                  </li>
                ))}
              </ol>
              {contentEnabled && (
                <FirstArticleButton
                  projectId={projectId}
                  projectName={projectName || domain}
                  businessName={business?.companyName ?? null}
                  articleLanguage={business?.language ?? summary.locale}
                  topic={summary.topics[0]}
                  primaryKeyword={summary.seedKeywords[0] ?? null}
                />
              )}
            </>
          ) : (
            <BlockNote>{t.articles.empty}</BlockNote>
          )}
        </SummaryBlock>
      </div>

      {/* 10 ── start */}
      <section data-summary-block="start" aria-labelledby="seed-block-start" className="mt-6 mb-4">
        <div className="relative overflow-hidden rounded-card border border-action/25 bg-action-soft p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 id="seed-block-start" className="text-xl font-bold tracking-tight text-ink md:text-2xl">
                {started ? t.start.runningTitle : t.start.title}
              </h2>
              <p className="mt-2 max-w-[60ch] text-base leading-7 text-body">
                {started ? t.start.runningBody : t.start.body(selected.length)}
              </p>
            </div>
            {started ? (
              <ActionLink href={dashboardHref(projectId)} size="lg" className="shrink-0">
                {t.start.openDashboard}
                <Arrow className="h-4 w-4" aria-hidden />
              </ActionLink>
            ) : (
              <Button size="lg" onClick={() => void start()} loading={continuing} className="h-12 shrink-0 px-8 text-base" data-seed-start>
                {continuing ? t.start.starting : t.start.button}
                {!continuing && <Arrow className="h-4 w-4" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
        {notice && (
          <SeedNotice
            notice={notice}
            projectId={projectId}
            returnPath={summaryHref(projectId)}
            onRetry={() => void start()}
            busy={continuing}
            className="mt-4"
          />
        )}
      </section>
    </div>
  )
}
