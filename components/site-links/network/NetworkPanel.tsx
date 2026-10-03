'use client'

/**
 * The link network's state, first on the Links screen (wave 8, UX A1-A2):
 *
 *   - the hero (HeroPanel, as on every other tab): a badge and a headline that
 *     say in words whether the network is on for this site (on / on but not
 *     placing yet / off / cannot join yet, with the reason and the step that
 *     fixes it), the switch with its state word beside it (never the toggle
 *     alone), and three figures: links received, links given, waiting to go live;
 *   - directly under it, the consent panel, opened by the hero's button or the
 *     switch (OFF until the owner accepts the consent text; leaving asks first).
 *
 * The placement log, how it works and the rules sit further down the screen
 * (SiteLinksScreen). Every write goes through the owner-checked routes of
 * lib/link-network/http.ts; no server text is ever shown, only the dictionary's words.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Clock, Network } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import HeroPanel, { HERO_INVERSE_BUTTON, HeroBadge, HeroStat } from '@/components/ui/HeroPanel'
import Switch from '@/components/ui/Switch'
import { AnimatedNumber } from '@/components/ui/motion'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { SECTION } from '@/components/settings/anchors'
import LinkButton from '../LinkButton'
import { formatDay, networkUrl, type AvailableNetwork } from './shared'

/**
 * The network's three promises, in every state of the hero (wave 9): no reciprocal
 * links, anchors taken from the article's own content, never a competitor. What the
 * rules in lib/link-network/rules.ts and anchor.ts already enforce, said in words.
 */
export function NetworkPromises({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <ul aria-label={label} data-link-network="promises" className="mt-4 grid max-w-prose gap-1.5">
      {items.map((p) => (
        <li key={p} className="flex items-start gap-2 text-caption text-contrast-ink/80">
          <Check size={14} strokeWidth={2.4} aria-hidden="true" className="mt-0.5 shrink-0 text-contrast-ink" />
          <span className="text-pretty">{p}</span>
        </li>
      ))}
    </ul>
  )
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return res.ok
  } catch {
    return false
  }
}

/** The network's size is shown to a visitor only from this many sites: "2 sites" works against the offer. */
export const NETWORK_SIZE_SHOWN_FROM = 10

/** The five states of the hero (UX A2 a-e); f (no network here) is SiteLinksView's OutreachHero. */
export type NetworkState = 'on' | 'not_placing' | 'off' | 'cannot_join' | 'left'

export function networkState(data: Pick<AvailableNetwork, 'membership' | 'readiness'>): NetworkState {
  if (data.membership.active) return data.readiness === 'ready' ? 'on' : 'not_placing'
  if (data.readiness === 'domain_unverified') return 'cannot_join'
  return data.membership.leftAt ? 'left' : 'off'
}

export default function NetworkPanel({ projectId, data, onChanged }: { projectId: string; data: AvailableNetwork; onChanged: () => void }) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks.network
  const { confirm, dialog } = useConfirm()
  const { toasts, dismiss, error: toastError } = useToasts()
  const [consentOpen, setConsentOpen] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const consentRef = useRef<HTMLElement>(null)
  const ids = useId()

  const active = data.membership.active
  // Only a site whose owner proved it is theirs (a WordPress or Search Console
  // connection on that domain) can join; the server refuses too.
  const cannotJoin = !active && data.readiness === 'domain_unverified'
  const state = networkState(data)
  const nf = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US')
  const count = (n: number) => nf.format(n)

  // Opening the consent brings it into view (it sits right under the hero) and focuses it.
  useEffect(() => {
    if (!consentOpen) return
    const el = consentRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    el.focus({ preventScroll: true })
  }, [consentOpen])

  async function join() {
    if (!agreed || busy) return
    setBusy(true)
    const ok = await postJson(networkUrl(projectId, '/membership'), { join: true, consent: true, consentVersion: data.consentVersion })
    setBusy(false)
    if (!ok) { toastError(copy.consent.error); return }
    setConsentOpen(false)
    setAgreed(false)
    onChanged()
  }

  async function leave() {
    const yes = await confirm({ title: copy.leave.title, body: copy.leave.body, confirmLabel: copy.leave.confirm, tone: 'danger' })
    if (!yes) return
    setBusy(true)
    const ok = await postJson(networkUrl(projectId, '/membership'), { join: false })
    setBusy(false)
    if (!ok) { toastError(copy.leave.error); return }
    onChanged()
  }

  // The switch shows the real membership: it stays off until the consent is
  // confirmed. Pressing it while off opens (or closes) the consent panel.
  function onSwitch(next: boolean) {
    if (active) { if (!next) void leave(); return }
    if (cannotJoin) return
    if (consentOpen) { setConsentOpen(false); setAgreed(false); return }
    setConsentOpen(true)
  }

  const h = copy.hero
  const badge = {
    on: { tone: 'ok' as const, text: h.badge.on },
    not_placing: { tone: 'commit' as const, text: h.badge.notPlacing },
    off: { tone: 'muted' as const, text: h.badge.off },
    left: { tone: 'muted' as const, text: h.badge.off },
    cannot_join: { tone: 'muted' as const, text: h.badge.notAvailable },
  }[state]
  const title = state === 'on' ? h.title.on : state === 'not_placing' ? h.title.notPlacing : state === 'cannot_join' ? h.title.cannotJoin : h.title.off
  const body = state === 'on' ? h.body.on
    : state === 'not_placing' ? copy.readiness[data.readiness as Exclude<AvailableNetwork['readiness'], 'ready'>]
    : state === 'cannot_join' ? h.body.cannotJoin
    : state === 'left' ? h.body.left(formatDay(data.membership.leftAt, language))
    : h.body.off(data.memberCount >= NETWORK_SIZE_SHOWN_FROM ? count(data.memberCount) : null)

  // "Still missing: 2 more published articles, a finished scan, 5 more days": only what the server could tell.
  const g = copy.gap
  const gapParts = data.gap ? [
    data.gap.articles ? g.articles(data.gap.articles) : null,
    data.gap.scan ? g.scan : null,
    data.gap.days ? g.days(data.gap.days) : null,
  ].filter((x): x is string => !!x) : []
  const gapLine = state === 'not_placing' && data.readiness === 'thin_or_new' && gapParts.length > 0 ? `${g.label} ${gapParts.join(', ')}` : null

  // The one step that moves the state on, when there is one.
  const action = state === 'off' || state === 'left'
    ? (!consentOpen && (
      <Button onClick={() => setConsentOpen(true)} className="shadow-glow" data-link-network-turn-on="">
        {h.turnOn}
      </Button>
    ))
    : state === 'cannot_join' || (state === 'not_placing' && data.readiness === 'domain_unverified')
      ? <LinkButton href={platformSetupHref(projectId) as `/${string}`}>{h.connect}</LinkButton>
      : state === 'not_placing' && data.readiness === 'category_unknown'
        ? <LinkButton href={`/settings?projectId=${encodeURIComponent(projectId)}#${SECTION.business}`} variant="secondary" className={HERO_INVERSE_BUTTON}>{h.completeCategory}</LinkButton>
        : null

  const switchDescription = active
    ? copy.switch.onDescription(formatDay(data.membership.since, language))
    : cannotJoin ? copy.switch.cannotJoinDescription : copy.switch.offDescription

  // Counted once the site is in; before that "—" and when the count starts (UX A2).
  const counting = active || data.totals.received > 0 || data.totals.given > 0
  const waiting = data.received.filter((i) => i.state === 'waiting').length + data.given.filter((i) => i.state === 'waiting').length
  const stat = (n: number) => (counting ? <AnimatedNumber value={n} format={count} /> : '—')
  const statHint = counting ? copy.stats.sinceJoining : copy.stats.countsStart

  return (
    <div className="space-y-6" data-link-network="panel" data-member={active ? 'yes' : 'no'}>
      <HeroPanel data-link-network="hero" data-network-state={state}>
        <section aria-labelledby="link-network-title" className="px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <HeroBadge tone={badge.tone} live={state === 'on'}>{badge.text}</HeroBadge>
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-contrast-ink/70">
                  <Network aria-hidden="true" className="size-3.5" />
                  {h.overline}
                </span>
              </div>
              <h2 id="link-network-title" className="mt-5 max-w-[32ch] text-title font-bold tracking-tight text-balance">{title}</h2>
              <p className="mt-3 max-w-prose text-copy text-contrast-ink/80 text-pretty">{body}</p>
              {gapLine && <p className="mt-2 max-w-prose text-copy font-medium text-contrast-ink text-pretty" data-link-network="gap">{gapLine}</p>}
              <NetworkPromises label={h.promisesLabel} items={h.promises} />
              {action && <div className="mt-5 flex flex-wrap gap-3">{action}</div>}
            </div>

            {/* The switch, with its state in a word beside it (never the toggle alone). */}
            <div data-link-network="switch" className="self-start rounded-inset bg-contrast-ink/[0.06] p-4 ring-1 ring-inset ring-contrast-ink/10">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p id={`${ids}-label`} className="text-copy font-semibold">{copy.switch.label}</p>
                  <p id={`${ids}-desc`} className="mt-0.5 text-caption text-contrast-ink/70 text-pretty">{switchDescription}</p>
                </div>
                <div className="flex h-6 shrink-0 items-center gap-2.5">
                  <span data-link-network-state-word="" className={cn('text-caption font-bold', active ? 'text-contrast-ink' : 'text-contrast-ink/65')}>
                    {active ? copy.switch.on : copy.switch.off}
                  </span>
                  <Switch
                    checked={active}
                    onChange={onSwitch}
                    disabled={busy || cannotJoin}
                    aria-labelledby={`${ids}-label`}
                    aria-describedby={`${ids}-desc`}
                    className="focus-visible:ring-contrast-ink/40"
                  />
                </div>
              </div>
              <p className="mt-3 border-t border-contrast-ink/10 pt-3 text-caption text-contrast-ink/65 text-pretty" data-link-network="link-type">
                {copy.linkType[data.linkRel]}
              </p>
            </div>
          </div>

          <div className="stagger-in mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3" data-link-network="stats">
            <HeroStat label={copy.stats.received} icon={<ArrowDownLeft className="rtl:-scale-x-100" />} value={stat(data.totals.received)} hint={statHint} />
            <HeroStat label={copy.stats.given} icon={<ArrowUpRight className="rtl:-scale-x-100" />} value={stat(data.totals.given)} hint={statHint} />
            <HeroStat label={copy.stats.waiting} icon={<Clock />} value={stat(waiting)} hint={counting ? undefined : copy.stats.countsStart} />
          </div>
        </section>
        {active && (
          <p data-link-network="caps" className="border-t border-contrast-ink/10 px-5 py-3.5 text-caption text-contrast-ink/70 sm:px-8">
            {copy.caps(data.caps.receivedThisMonth, data.caps.receivedCap)}
          </p>
        )}
      </HeroPanel>

      {consentOpen && !active && !cannotJoin && (
        <section
          ref={consentRef}
          tabIndex={-1}
          aria-labelledby={`${ids}-consent`}
          className="scroll-mt-20 rounded-card border border-line bg-surface p-5 shadow-card focus:outline-none sm:p-6 lg:px-8 motion-safe:animate-pop-in"
          data-link-network="consent"
        >
          <h3 id={`${ids}-consent`} className="text-section font-semibold text-ink">{copy.consent.title}</h3>
          <p className="mt-1 text-copy text-body">{copy.consent.intro}</p>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {copy.consent.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 rounded-inset border border-line bg-canvas/60 p-4 text-copy text-body">
                <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 shrink-0 text-action" />
                <span className="text-pretty">{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-copy font-medium text-ink">{copy.linkType[data.linkRel]}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Checkbox checked={agreed} onChange={setAgreed} label={copy.consent.checkbox} />
              <Link
                href={language === 'he' ? '/terms#link-network' : '/en/terms#link-network'}
                target="_blank"
                className="inline-flex items-center gap-1 ps-6 text-caption text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
              >
                {copy.consent.terms}
                <ArrowUpRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setConsentOpen(false); setAgreed(false) }}>{copy.consent.cancel}</Button>
              <Button onClick={join} disabled={!agreed} loading={busy} data-link-network-join>{copy.consent.join}</Button>
            </div>
          </div>
        </section>
      )}

      {dialog}
      <ToastHost toasts={toasts} dismiss={dismiss} dir={language === 'he' ? 'rtl' : 'ltr'} />
    </div>
  )
}
