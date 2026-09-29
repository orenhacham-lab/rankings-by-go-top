'use client'

/**
 * The link network for one project ("רשת הקישורים"):
 *
 *   - the hero: what the network is, the switch (OFF until the owner accepts the
 *     consent text; leaving asks first), and the link type in force;
 *   - three figures: sites in the network (shown before joining too), links
 *     received, links given;
 *   - how it works in three lines, and the rules that protect the site;
 *   - the placement log of both sides (PlacementLog), where a link this project
 *     gave can be taken out of the draft before it is published.
 *
 * Every write goes through the owner-checked routes of lib/link-network/http.ts;
 * no server text is ever shown, only the dictionary's words.
 */
import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Network, ShieldCheck, Users } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Notice from '@/components/ui/Notice'
import StatTile from '@/components/ui/StatTile'
import Switch from '@/components/ui/Switch'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import PlacementLog from './PlacementLog'
import { formatDay, networkUrl, type AvailableNetwork } from './shared'

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return res.ok
  } catch {
    return false
  }
}

export default function NetworkPanel({ projectId, data, onChanged }: { projectId: string; data: AvailableNetwork; onChanged: () => void }) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks.network
  const { confirm, dialog } = useConfirm()
  const { toasts, dismiss, error: toastError } = useToasts()
  const [consentOpen, setConsentOpen] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const active = data.membership.active
  // Only a site whose owner proved it is theirs (a WordPress or Search Console
  // connection on that domain) can join; the server refuses too.
  const cannotJoin = !active && data.readiness === 'domain_unverified'
  const nf = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US')

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

  const switchDescription = active
    ? copy.switch.onDescription(formatDay(data.membership.since, language))
    : cannotJoin
      ? copy.switch.domainUnverified
    : data.membership.leftAt
      ? copy.switch.leftDescription(formatDay(data.membership.leftAt, language))
      : copy.switch.offDescription

  return (
    <div className="space-y-8" data-link-network="panel" data-member={active ? 'yes' : 'no'}>
      {/* The hero: what it is, and the one switch. */}
      <section aria-labelledby="link-network-title" className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 end-[-6rem] size-80 rounded-full bg-action-soft blur-3xl" />
        <div className="relative grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:p-8">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-overline font-semibold uppercase tracking-wide text-action">
              <Network size={16} strokeWidth={1.75} aria-hidden="true" />
              {copy.hero.overline}
            </p>
            <h2 id="link-network-title" className="mt-3 max-w-[30ch] text-title font-bold tracking-tight text-ink text-balance">{copy.hero.title}</h2>
            <p className="mt-3 max-w-prose text-copy text-body text-pretty">{copy.hero.body}</p>
          </div>
          <div className={cn('rounded-inset border bg-canvas/70 p-5', active ? 'border-action/25' : 'border-line')} data-link-network="switch">
            <Switch
              checked={active}
              onChange={onSwitch}
              disabled={busy || cannotJoin}
              label={<span className="font-semibold">{copy.switch.label}</span>}
              description={switchDescription}
            />
            <p className="mt-4 border-t border-line pt-4 text-caption text-muted" data-link-network="link-type">
              {copy.linkType[data.linkRel]}
            </p>
          </div>
        </div>

        {consentOpen && !active && !cannotJoin && (
          <div className="relative border-t border-line bg-sunk/50 p-5 sm:p-6 lg:px-8 motion-safe:animate-pop-in" data-link-network="consent">
            <h3 className="text-section font-semibold text-ink">{copy.consent.title}</h3>
            <p className="mt-1 text-copy text-body">{copy.consent.intro}</p>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {copy.consent.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 rounded-inset border border-line bg-surface p-4 text-copy text-body">
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
          </div>
        )}
      </section>

      {/* The figures: the network's size is shown before joining too. */}
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-5" data-link-network="stats">
        <StatTile label={copy.stats.members} value={nf.format(data.memberCount)} source={copy.stats.membersSource} icon={<Users />} />
        <StatTile label={copy.stats.received} value={nf.format(data.totals.received)}
          empty={active || data.totals.received ? undefined : copy.stats.notJoined} source={copy.stats.sinceJoining} icon={<ArrowDownLeft />} />
        <StatTile label={copy.stats.given} value={nf.format(data.totals.given)}
          empty={active || data.totals.given ? undefined : copy.stats.notJoined} source={copy.stats.sinceJoining} icon={<ArrowUpRight />} />
      </div>

      {active && data.readiness !== 'ready' && (
        <Notice tone="warn">{copy.readiness[data.readiness]}</Notice>
      )}
      {active && data.readiness === 'ready' && (
        <p className="text-caption text-muted" data-link-network="caps">{copy.caps(data.caps.receivedThisMonth, data.caps.receivedCap)}</p>
      )}

      {/* How it works, and the rules that protect the site. */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section aria-labelledby="link-network-how" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <h2 id="link-network-how" className="text-section font-semibold text-ink">{copy.how.title}</h2>
          <ol className="mt-4 space-y-4">
            {copy.how.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-pill bg-action-soft text-caption font-bold text-action tabular-nums">{i + 1}</span>
                <span className="text-copy text-body text-pretty">{step}</span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="link-network-rules" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <h2 id="link-network-rules" className="flex items-center gap-2 text-section font-semibold text-ink">
            <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" className="text-ok" />
            {copy.rules.title}
          </h2>
          <ul className="mt-4 space-y-2.5">
            {copy.rules.items.map((rule) => (
              <li key={rule} className="flex items-start gap-2.5 text-copy text-body">
                <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 shrink-0 text-ok" />
                <span className="text-pretty">{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PlacementLog projectId={projectId} data={data} onChanged={onChanged} />

      {dialog}
      <ToastHost toasts={toasts} dismiss={dismiss} dir={language === 'he' ? 'rtl' : 'ltr'} />
    </div>
  )
}
