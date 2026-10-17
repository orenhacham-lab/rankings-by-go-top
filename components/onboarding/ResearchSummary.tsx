'use client'

/**
 * The research summary: what stage A found, in the plan's ten blocks and in
 * their order (plan §0), with no sign-up gate since the merchant is signed in.
 *
 *   1 the badge, "here's what we found about {business}", "we just scanned {domain}"
 *   2 four tiles, each with its state as a small icon in its tone
 *   3 the business (chips and description)   ┐
 *   4 its audiences                          ├ each with "Edit", into settings
 *   5 its competitors                        ┘
 *   6 what's holding the site back
 *   7 the keywords we would promote, each with a checkbox and why
 *   8 readiness for AI answers, four rows with why each matters
 *   9 the articles we would write (and the one first-article button)
 *  10 "Start": tracks the keywords still checked, starts stage B, opens the dashboard
 *
 * BEFORE SIGN-UP (`preview`, the free check's research, lib/presignup) the
 * same screen shows what an anonymous stage A found, minus what the account
 * opens: no "Edit" links (there is no project yet), the competitors and
 * keywords the server sent (the rest arrive only as counts, "+N in the full
 * research"), each keyword's search volume locked, no tracking checkboxes, and
 * block 10 is "Open the full research, free": the sign-up itself.
 *
 * Every block says honestly when it has nothing: a locked storefront is "not
 * checked", never failing and never 0/4; so is a site whose firewall refused
 * our reader, whose research was built from Google's index of it (a notice
 * under the intro says so); a step that did not finish says so.
 * The snapshot's own text (the business, keywords, topics) is in the language
 * it was written in, so it carries its own `lang` and direction; the labels
 * around it follow the interface.
 */
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  Check,
  CircleDashed,
  FileText,
  KeyRound,
  Lock,
  MapPin,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
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
  stageBState,
  stepStatusOf,
  storefrontLocked,
  tilesView,
  type TileView,
} from '@/lib/onboarding/summary-view'
import { MAX_CONTINUE_KEYWORDS, type SeedRunView, type SeedSummary } from '@/lib/seed-scan/types'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { cn } from '@/lib/utils'
import FirstArticleButton from './FirstArticleButton'
import { ActionLink, BlockNote, isolate, StatusIcon, SummaryBlock } from './parts'
import SeedNotice from './SeedNotice'

/**
 * One action hue plus the ok/warn/bad tones on icons and badges only (final review
 * R26): a finding's severity is its Badge, never a rail, a dot or a bar of colours.
 */
const SEVERITY_BADGE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  blocker: 'danger',
  warning: 'warning',
  info: 'neutral',
}
/** The ring's arc on the dark hero: the action hue lifted to read on ink, whatever the score. */
const HERO_ARC = 'stroke-rail-focus'
/** Competitors were checked against this many of the site's searches (the scale the bar is drawn on). */
const COMPETITOR_SCALE = 3

/** The research before sign-up: what is locked, and where "open the full research" leads. */
export type SummaryPreview = {
  signupHref: string
  loginHref: string
  lockedCompetitors: number
  lockedKeywords: number
  /** Under the call to action: "email me the report". */
  after?: ReactNode
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
  preview,
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
  /** Before sign-up: the free check's research, gated (see the header). */
  preview?: SummaryPreview
}) {
  const router = useRouter()
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale).seedOnboarding
  const t = dict.summary
  const p = dict.preview
  const checks = freeCheckCopy(language)
  const Arrow = language === 'he' ? ArrowLeft : ArrowRight

  const [selected, setSelected] = useState<string[]>(() => initialSelection(summary.seedKeywords))
  const [continuing, setContinuing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const a3 = stepStatusOf(run, 'a3')
  // Stage B as it really is, for the bottom bar (P1-12); read again every 20s while it works.
  const stageB = started ? stageBState(run, new Date()) : null
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

  const reasonOf = (keyword: string) => keywordReason(keyword, business, domain)

  const editLink = (section: SummaryEditSection, title: string) => preview ? null : (
    <ActionLink href={settingsHref(projectId, section)} variant="secondary" className="h-8 px-3">
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      <span aria-hidden>{t.edit}</span>
      <span className="sr-only">{t.editLabel(title)}</span>
    </ActionLink>
  )

  const tileLabel = (tile: TileView) => t.tiles[tile.id]
  const tileValue = (tile: TileView) =>
    tile.state !== 'value'
      ? tile.state === 'pending' ? t.tiles.pending : t.tiles.notChecked
      : preview && tile.id === 'keywords'
        // The keywords the research found, the locked ones included: only their words are withheld.
        ? String(summary.seedKeywords.length + preview.lockedKeywords)
        : tile.value
  const geoTile = tiles.find((x) => x.id === 'geo')
  const severityCounts = findings.kind === 'list'
    ? (['blocker', 'warning', 'info'] as const).map((sev) => ({ sev, n: findings.findings.filter((f) => f.severity === sev).length })).filter((x) => x.n > 0)
    : []

  return (
    <div className="mx-auto w-full max-w-6xl" data-seed-screen={preview ? 'preview' : started ? 'started' : 'summary'}>
      {/* 1 ── who and when: the one dark surface of the screen, with the site's
          readiness for AI answers as its single visual. */}
      <div className="relative overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-card">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_85%_0%,rgb(83_115_255/0.32),transparent_60%),radial-gradient(50%_80%_at_0%_100%,rgb(157_180_255/0.10),transparent_60%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <header data-summary-block="intro" className="relative grid gap-8 px-6 pt-7 pb-20 md:px-10 md:pt-10 md:pb-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <SiteAvatar domain={domain} icon={summary.siteIcon} size="lg" tone="dark" />
              <span className="min-w-0 truncate text-copy font-medium text-contrast-ink/80" dir="ltr">{domain}</span>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1 text-caption font-semibold text-contrast-ink ring-1 ring-white/15">
                <Sparkles className="h-3.5 w-3.5 text-contrast-ink/70" aria-hidden />
                {t.badge}
              </span>
            </div>
            <h1 className="mt-6 max-w-[24ch] text-balance text-title font-bold tracking-tight text-contrast-ink md:text-display">
              {t.title(isolate(name))}
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-copy text-contrast-ink/70">
              {scannedLine && <span>{scannedLine}</span>}
              {summary.source === 'claim' && (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-0.5 text-caption font-medium text-contrast-ink">
                  {t.fromFreeCheck}
                </span>
              )}
            </p>
          </div>
          {geoTile && (
            <div className="flex items-center gap-4 lg:flex-col lg:gap-3 lg:text-center">
              <Ring
                size={132}
                stroke={11}
                fraction={geo.kind === 'measured' && geo.total > 0 ? geo.passed / geo.total : 0}
                arcClass={HERO_ARC}
                trackClass="stroke-white/12"
              >
                <span className={cn('font-bold tabular-nums text-contrast-ink', geoTile.state === 'value' ? 'text-metric leading-none' : 'px-3 text-copy')}>
                  {tileValue(geoTile)}
                </span>
              </Ring>
              <p className="max-w-[12rem] text-copy font-medium leading-5 text-contrast-ink/75">{tileLabel(geoTile)}</p>
            </div>
          )}
        </header>
      </div>

      {/* 2 ── the four tiles, lifted over the hero's edge. What needs fixing leads. */}
      <section
        data-summary-block="tiles"
        aria-label={t.badge}
        className="relative z-10 -mt-12 grid grid-cols-2 gap-3 px-3 md:-mt-14 md:gap-4 md:px-6 lg:grid-cols-[1fr_1.35fr_1fr_1fr]"
      >
        {tiles.map((tile) => {
          const primary = tile.id === 'fixes'
          return (
            <div
              key={tile.id}
              data-tile={tile.id}
              data-tile-state={tile.state}
              className={cn(
                'flex flex-col rounded-card border bg-surface p-4 md:p-5',
                primary ? 'border-line-strong shadow-pop' : 'border-line shadow-card',
              )}
            >
              <p className="order-1 flex items-start gap-2 text-copy text-muted">
                <StatusIcon tone={tile.tone} className="mt-0.5" />
                <span className="min-w-0">{tileLabel(tile)}</span>
              </p>
              {/* Under the figure: the fixes by severity in words, and the AI signs as one
                  meter in the action hue. The other tiles are their number alone. */}
              {tile.id === 'fixes' && severityCounts.length > 0 ? (
                <span className="order-3 mt-2 block text-caption text-muted" aria-hidden>
                  {severityCounts.map((x, i) => (
                    <span key={x.sev}>{i > 0 && ' · '}<span className="tabular-nums">{x.n}</span> {t.findings.severity[x.sev]}</span>
                  ))}
                </span>
              ) : tile.id === 'geo' && geo.kind === 'measured' && geo.total > 0 ? (
                <span className="order-3 mt-3 block h-1.5 w-full overflow-hidden rounded-pill bg-sunk" aria-hidden>
                  <span className="block h-full rounded-pill bg-action" style={{ width: `${Math.round((geo.passed / geo.total) * 100)}%` }} />
                </span>
              ) : null}
              <p
                className={cn(
                  'order-2 mt-3 font-semibold tabular-nums text-ink',
                  tile.state === 'value' ? (primary ? 'text-metric leading-none tracking-tight' : 'text-metric leading-none tracking-tight') : 'text-copy text-muted',
                )}
              >
                {tileValue(tile)}
              </p>
            </div>
          )
        })}
      </section>

      {firewalled && (
        <div
          data-summary-block="firewall"
          role="note"
          className="mt-8 flex items-start gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-warn-soft text-warn">
            <ShieldAlert className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{t.firewall.title}</p>
            <p className="mt-1 max-w-[80ch] text-copy text-body">{t.firewall.body}</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 md:gap-5 lg:grid-cols-12">
        {/* 3 ── the business */}
        <SummaryBlock id="business" index={1} icon={<Building2 />} title={t.business.title} action={editLink('business', t.business.title)} className="lg:col-span-7">
          {business ? (
            <>
              {business.description && (
                <p className="max-w-[62ch] text-section text-ink" {...snapshotText}>
                  {business.description}
                </p>
              )}
              <ul className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-inset border border-line bg-line', business.description && 'mt-5')}>
                {business.niche && (
                  <li className="bg-sunk/60 px-4 py-3">
                    <span className="block text-caption text-muted">{t.business.niche}</span>
                    <span className="mt-0.5 block font-semibold text-ink" {...snapshotText}>{business.niche}</span>
                  </li>
                )}
                <li className="bg-sunk/60 px-4 py-3">
                  <span className="block text-caption text-muted">{t.business.commerceType}</span>
                  <span className="mt-0.5 block font-semibold text-ink">{t.business.commerce[business.commerceType] ?? t.business.commerce.other}</span>
                </li>
                {business.platform && (
                  <li className="bg-sunk/60 px-4 py-3">
                    <span className="block text-caption text-muted">{t.business.platform}</span>
                    <span className="mt-0.5 block font-semibold text-ink" dir="auto">{business.platform}</span>
                  </li>
                )}
                <li className="flex items-center gap-2 bg-sunk/60 px-4 py-3 font-semibold text-ink">
                  <MapPin className="h-4 w-4 shrink-0 text-action" aria-hidden />
                  {business.isLocal ? t.business.local : t.business.notLocal}
                </li>
              </ul>
            </>
          ) : (
            <BlockNote icon={locked ? <Lock className="h-4 w-4" aria-hidden /> : undefined}>{locked ? t.business.locked : t.business.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 4 ── audiences */}
        <SummaryBlock id="audiences" index={2} icon={<Users />} title={t.audiences.title} action={editLink('audiences', t.audiences.title)} className="lg:col-span-5">
          {summary.audiences.length > 0 ? (
            <ul className="space-y-2">
              {summary.audiences.map((audience) => (
                <li key={audience} className="flex items-center gap-3 rounded-inset border border-line bg-surface px-3 py-2.5 text-copy text-ink">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-sunk text-muted">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0" {...snapshotText}>{audience}</span>
                </li>
              ))}
            </ul>
          ) : (
            <BlockNote>{t.audiences.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 5 ── competitors: how often each one showed up, as a bar you can compare */}
        <SummaryBlock id="competitors" index={3} icon={<CompetitorIcon />} title={t.competitors.title} action={editLink('competitors', t.competitors.title)} className="lg:col-span-5">
          {competitors.length > 0 ? (
            <ul className="space-y-4">
              {competitors.map((c) => (
                <li key={c.domain} className="flex items-center gap-3">
                  <SiteAvatar domain={c.domain} size="md" tentative={!c.validated} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold text-ink" dir="ltr">{c.domain}</p>
                    </div>
                    {c.validated && (
                      <span aria-hidden className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-pill bg-sunk">
                        <span className="block h-full rounded-pill bg-action" style={{ width: `${Math.max(8, Math.min(1, c.seenIn / COMPETITOR_SCALE) * 100)}%` }} />
                      </span>
                    )}
                    <p className="mt-1 text-copy text-muted">{c.validated ? t.competitors.seenIn(c.seenIn) : t.competitors.suggested}</p>
                  </div>
                </li>
              ))}
              {preview && preview.lockedCompetitors > 0 && <LockedRow data-locked="competitors">{p.competitorsLocked(preview.lockedCompetitors)}</LockedRow>}
            </ul>
          ) : (
            <BlockNote>{t.competitors.empty}</BlockNote>
          )}
        </SummaryBlock>

        {/* 6 ── what's holding the site back: the one tinted block, because it asks for action */}
        <SummaryBlock id="findings" index={4} icon={<TriangleAlert />} tone={findings.kind === 'list' ? 'attention' : 'default'} title={t.findings.title} className="lg:col-span-7">
          {findings.kind === 'list' ? (
            <>
              <ul className="divide-y divide-line">
                {findings.findings.map((f) => {
                  const copy = checks.findings[f.id]
                  return (
                    <li key={f.id} data-finding-severity={f.severity} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={SEVERITY_BADGE[f.severity] ?? 'neutral'}>
                          {t.findings.severity[f.severity] ?? t.findings.severity.info}
                        </Badge>
                        <p className="min-w-0 font-semibold text-ink" {...(copy ? {} : snapshotText)}>{copy?.title ?? f.title}</p>
                      </div>
                      <p className="mt-1.5 text-copy text-body" {...(copy ? {} : snapshotText)}>{copy?.detail ?? f.detail}</p>
                      {f.evidence && sameLanguage && <p className="mt-2 inline-block rounded-control bg-sunk px-2 py-0.5 text-caption text-muted">{f.evidence}</p>}
                    </li>
                  )
                })}
              </ul>
              {findings.omitted > 0 && <p className="mt-3 text-copy text-muted">{t.findings.omitted(findings.omitted)}</p>}
            </>
          ) : findings.kind === 'clean' ? (
            <div className="flex items-center gap-3 rounded-control border border-line px-4 py-3 text-copy font-medium text-ink">
              <ShieldCheck className="h-5 w-5 shrink-0 text-ok" aria-hidden />
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

        {/* 7 ── keywords: one compact list. Each row's reason shows when it changes from
            the row above; a repeated one stays for screen readers only. */}
        <SummaryBlock
          id="keywords"
          index={5}
          icon={<KeyRound />}
          title={t.keywords.title}
          description={summary.seedKeywords.length === 0 ? undefined : preview ? p.keywordsHint : started ? undefined : t.keywords.hint}
          action={
            preview || started || summary.seedKeywords.length === 0 ? null : (
              <p className="rounded-pill bg-action-soft px-2.5 py-1 text-caption font-semibold tabular-nums text-action" aria-live="polite">
                {t.keywords.selected(selected.length, summary.seedKeywords.length)}
              </p>
            )
          }
          className="lg:col-span-7"
        >
          {summary.seedKeywords.length === 0 ? (
            <BlockNote>{t.keywords.empty}</BlockNote>
          ) : preview ? (
            <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line">
              {summary.seedKeywords.map((keyword, i) => {
                const reason = reasonOf(keyword)
                const repeat = i > 0 && reasonOf(summary.seedKeywords[i - 1]) === reason
                return (
                  <li key={keyword} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-ink" {...snapshotText}>{keyword}</span>
                      <span className={repeat ? 'sr-only' : 'rounded-pill bg-sunk px-2.5 py-0.5 text-caption text-muted'}>{t.keywords.reasons[reason]}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-dashed border-line-strong px-2.5 py-0.5 text-caption text-muted" data-locked="volume">
                      <Lock className="h-3 w-3" aria-hidden />
                      <span aria-hidden>{p.volumeLocked}</span>
                      <span className="sr-only">{p.volumeLockedLabel}</span>
                    </span>
                  </li>
                )
              })}
              {preview.lockedKeywords > 0 && <LockedRow className="px-4 py-3" data-locked="keywords">{p.keywordsLocked(preview.lockedKeywords)}</LockedRow>}
            </ul>
          ) : started ? (
            <>
              <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line">
                {summary.seedKeywords.map((keyword, i) => {
                  const reason = reasonOf(keyword)
                  const repeat = i > 0 && reasonOf(summary.seedKeywords[i - 1]) === reason
                  return (
                    <li key={keyword} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                      <p className="font-semibold text-ink" {...snapshotText}>{keyword}</p>
                      <p className={repeat ? 'sr-only' : 'rounded-pill bg-sunk px-2.5 py-0.5 text-caption text-muted'}>{t.keywords.reasons[reason]}</p>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-copy text-muted">{t.keywords.tracked}</p>
            </>
          ) : (
            <>
              <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line">
                {summary.seedKeywords.map((keyword, i) => {
                  const checked = selected.includes(keyword)
                  const disabled = !checked && atLimit
                  const inputId = `seed-keyword-${i}`
                  const reason = reasonOf(keyword)
                  const repeat = i > 0 && reasonOf(summary.seedKeywords[i - 1]) === reason
                  return (
                    <li key={keyword}>
                      <label
                        htmlFor={inputId}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 transition-colors duration-150 ease-snappy',
                          checked ? 'bg-action-soft' : 'bg-surface',
                          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-sunk/60',
                        )}
                      >
                        <Checkbox id={inputId} checked={checked} disabled={disabled} onChange={() => toggle(keyword)} />
                        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="font-semibold text-ink" {...snapshotText}>{keyword}</span>
                          <span className={repeat ? 'sr-only' : 'rounded-pill bg-sunk px-2.5 py-0.5 text-caption text-muted'}>{t.keywords.reasons[reason]}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {atLimit && summary.seedKeywords.length > MAX_CONTINUE_KEYWORDS && (
                <p className="mt-3 text-copy text-muted">{t.keywords.limit(MAX_CONTINUE_KEYWORDS)}</p>
              )}
            </>
          )}
        </SummaryBlock>

        {/* 8 ── readiness for AI answers */}
        <SummaryBlock
          id="geo"
          index={6}
          icon={<Bot />}
          title={t.geo.title}
          description={geo.kind === 'measured' ? t.geo.intro : undefined}
          action={geo.kind === 'measured' ? <p className="rounded-pill bg-sunk px-2.5 py-1 text-copy font-semibold tabular-nums text-ink">{t.geo.score(geo.passed, geo.total)}</p> : null}
          className="lg:col-span-5"
        >
          {geo.kind === 'measured' ? (
            <ul className="space-y-1">
              {geo.signals.map((s) => {
                const copy = checks.geo[s.id]?.[s.ok ? 'pass' : 'fail']
                return (
                  <li key={s.id} data-geo-ok={s.ok ? 'true' : 'false'} className="flex items-start gap-3 rounded-inset p-2.5">
                    {/* A missing sign is the same neutral row: its tone is the icon's only. */}
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill',
                        s.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
                      )}
                    >
                      {s.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        <span className="sr-only">{s.ok ? t.geo.pass : t.geo.fail}: </span>
                        <span {...(copy ? {} : snapshotText)}>{copy?.title ?? s.title}</span>
                      </p>
                      <p className="mt-0.5 text-copy text-muted" {...(copy ? {} : snapshotText)}>{copy?.detail ?? s.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex items-start gap-3 rounded-control border border-line bg-sunk px-4 py-4" data-geo-state={geo.kind}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface text-muted">
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
                  <p className="mt-0.5 text-copy text-muted">
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

        {/* 9 ── articles: each one a small card, numbered, ready to open */}
        <SummaryBlock id="articles" index={7} icon={<FileText />} title={t.articles.title} className="lg:col-span-12">
          {summary.topics.length > 0 ? (
            <>
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summary.topics.map((topic, i) => (
                  <li key={topic} className="group flex items-start gap-3 rounded-inset border border-line bg-surface p-4 transition-[border-color] duration-150 ease-snappy hover:border-line-strong">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-sunk text-caption font-semibold tabular-nums text-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 pt-1.5 text-copy font-medium leading-6 text-ink" {...snapshotText}>{topic}</span>
                  </li>
                ))}
              </ol>
              {contentEnabled && !preview && (
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

      {/* 10 ── before sign-up: "Open the full research, free", the sign-up itself. On a phone it
          rides above the public pages' contact bar (components/public/MobileContactBar), and is compact. */}
      {preview && (
        <>
          <section data-summary-block="cta" aria-labelledby="seed-block-cta" className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 mt-6 mb-4 md:bottom-5">
            <div className="relative overflow-hidden rounded-card bg-contrast p-4 text-contrast-ink shadow-pop ring-1 ring-white/10 md:p-5">
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_100%_50%,rgb(83_115_255/0.28),transparent_65%)]" />
              <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <span aria-hidden className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-inset bg-white/10 ring-1 ring-white/15 sm:flex">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="seed-block-cta" className="text-section font-bold text-contrast-ink">{p.ctaTitle}</h2>
                    <p className="mt-0.5 hidden max-w-[70ch] text-copy text-contrast-ink/75 sm:block">{p.ctaBody}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
                  <ActionLink href={preview.signupHref} size="lg" variant="onInk" className="shrink-0">
                    {p.cta}
                    <Arrow className="h-4 w-4" aria-hidden />
                  </ActionLink>
                  <p className="text-center text-caption text-contrast-ink/60 md:text-end">{p.terms}</p>
                </div>
              </div>
            </div>
          </section>
          <div className="mb-10 flex flex-col items-center gap-3 text-copy text-muted">
            <p>
              {p.haveAccount}{' '}
              <a href={preview.loginHref} className="font-medium text-action underline-offset-4 hover:underline">
                {p.login}
              </a>
            </p>
            {preview.after}
          </div>
        </>
      )}

      {/* 10 ── start: a bar that stays at the bottom of the screen while the summary
          scrolls, carrying how many keywords "Start" will track. Once stage B began it
          says where stage B really is (P1-12): working (still at the bottom, and short on
          a phone), ready, or not finished. A finished stage B is news, not a task, so
          its line sits in the page instead of covering it. */}
      {!preview && (
      <section
        data-summary-block="start"
        data-float-clear=""
        data-stage-b={stageB ?? 'not_started'}
        aria-labelledby="seed-block-start"
        className={cn('mt-6 mb-4', (!started || stageB === 'running') && 'sticky bottom-3 z-20 md:bottom-5')}
      >
        {stageB === 'done' || stageB === 'failed' ? (
          <div
            role="status"
            className={cn(
              'flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-pop md:flex-row md:items-center md:justify-between md:p-5',
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <StatusIcon tone={stageB === 'done' ? 'ok' : 'warn'} className="mt-0.5 size-5" />
              <div className="min-w-0">
              <h2 id="seed-block-start" className="text-copy font-bold text-ink">
                {stageB === 'done' ? t.start.readyTitle : t.start.failedTitle}
              </h2>
              <p className="mt-0.5 max-w-[70ch] text-copy text-body">{stageB === 'done' ? t.start.readyBody : t.start.failedBody}</p>
              </div>
            </div>
            <ActionLink href={dashboardHref(projectId)} variant={stageB === 'done' ? 'primary' : 'secondary'} className="shrink-0">
              {t.start.openDashboard}
              <Arrow className="h-4 w-4" aria-hidden />
            </ActionLink>
          </div>
        ) : (
        <div className={cn('relative overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-pop ring-1 ring-white/10 md:p-5', started ? 'p-3' : 'p-4')}>
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_100%_50%,rgb(83_115_255/0.28),transparent_65%)]" />
          <div className={cn('relative flex gap-4 md:flex-row md:items-center md:justify-between', started ? 'flex-row items-center justify-between' : 'flex-col')}>
            <div className="flex min-w-0 items-center gap-4">
              {!started && (
                <span aria-hidden className="hidden h-12 w-12 shrink-0 flex-col items-center justify-center rounded-inset bg-white/10 ring-1 ring-white/15 sm:flex">
                  <span className="text-section font-bold leading-none tabular-nums">{selected.length}</span>
                </span>
              )}
              <div className="min-w-0">
                <h2 id="seed-block-start" className={cn('font-bold text-contrast-ink', started ? 'text-copy md:text-section' : 'text-section')}>
                  {started ? t.start.runningTitle : t.start.title}
                </h2>
                <p className={cn('mt-0.5 max-w-[70ch] text-copy text-contrast-ink/75', started && 'hidden md:block')}>
                  {started ? t.start.runningBody : t.start.body(selected.length)}
                </p>
              </div>
            </div>
            {started ? (
              <ActionLink href={dashboardHref(projectId)} size="lg" variant="onInk" className="shrink-0 max-md:h-10 max-md:px-4">
                {t.start.openDashboard}
                <Arrow className="h-4 w-4" aria-hidden />
              </ActionLink>
            ) : (
              <Button size="lg" onClick={() => void start()} loading={continuing} className="h-12 shrink-0 px-8 text-copy" data-seed-start>
                {continuing ? t.start.starting : t.start.button}
                {!continuing && <Arrow className="h-4 w-4" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
        )}
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
      )}
    </div>
  )
}

/** "+N more in the full research": what the account opens, counted, never listed. */
function LockedRow({ children, className, ...rest }: { children: ReactNode; className?: string; 'data-locked': string }) {
  return (
    <li className={cn('flex items-center gap-2 text-copy font-medium text-muted', className)} {...rest}>
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-dashed border-line-strong">
        <Lock className="h-3.5 w-3.5" />
      </span>
      {children}
    </li>
  )
}

/** A progress ring: `fraction` of the circle drawn from the top. Decorative; the value beside or inside it says the same in words. */
function Ring({
  size, stroke, fraction, arcClass, trackClass, children,
}: { size: number; stroke: number; fraction: number; arcClass: string; trackClass: string; children: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        {f > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * f} ${c}`} className={arcClass}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center">{children}</span>
    </span>
  )
}
