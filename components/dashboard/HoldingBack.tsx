'use client'

/**
 * Widget 13, what is holding the site back: the first scan's findings, blockers
 * first, and the four AI-readiness checks, each with why it matters.
 *
 * A password-locked store was not checked, so every check says "not checked"
 * and nothing is reported as failing. A scan that could not read the site says
 * so and points to settings, where it can run again; it never shows an error
 * code or a provider's words.
 */
import { AlertOctagon, CheckCircle2, CircleDashed, Lock, ShieldAlert, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeoCheck, HoldingBack as HoldingBackModel } from '@/lib/dashboard/seed'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { HeaderLink, LinkButton, StatusPill, Widget, WidgetEmpty, WidgetLoading } from './ui'

type Copy = DashboardDictionary['dashboardHome']

export default function HoldingBack({ t, model, scannedLabel, settingsHref, summary }: {
  t: Copy
  model: HoldingBackModel
  /** "Scanned 2 hours ago", already in the merchant's language; null when unknown. */
  scannedLabel: string | null
  settingsHref: string
  /** The research summary of the scan, when it can be opened: its link and its name. */
  summary?: { href: string; label: string } | null
}) {
  const h = t.holdingBack
  const icon = <ShieldAlert size={16} strokeWidth={2} />
  const subtitle = model.state === 'ready' && scannedLabel ? `${h.subtitle} · ${scannedLabel}` : h.subtitle

  return (
    <Widget id="holding-back" state={model.state} title={h.title} subtitle={subtitle} icon={icon} tone={model.state === 'ready' ? 'attention' : 'default'}
      action={summary ? <HeaderLink href={summary.href}>{summary.label}</HeaderLink> : undefined}>
      {model.state === 'pending' && (
        <div className="space-y-3">
          <p className="text-copy font-medium text-ink">{h.pendingTitle}</p>
          <p className="text-copy text-muted">{h.pending}</p>
          <WidgetLoading lines={3} label={h.pendingTitle} />
        </div>
      )}
      {model.state === 'failed' && (
        <WidgetEmpty
          icon={<AlertOctagon size={18} strokeWidth={2} />}
          title={h.failedTitle}
          body={h.failed}
          action={<LinkButton href={settingsHref} variant="secondary" size="sm">{t.actions.openSettings}</LinkButton>}
        />
      )}
      {model.state === 'locked' && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-control bg-sunk/70 p-3 text-copy text-body">
            <Lock size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
            <span>{h.locked}</span>
          </p>
          <GeoChecks t={t} checks={model.checks} />
        </div>
      )}
      {model.state === 'ready' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl bg-surface p-4 shadow-card ring-1 ring-warn/15">
            <h3 className="text-caption font-semibold uppercase tracking-wide text-muted">{h.findingsTitle}</h3>
            {model.findings.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-copy text-body">
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ok" />
                {h.clean}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {model.findings.map((f) => (
                  <li key={f.id} data-finding={f.id} className="py-3 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-copy font-medium text-ink">{f.title}</p>
                      <StatusPill tone={f.severity === 'blocker' ? 'bad' : f.severity === 'warning' ? 'warn' : 'neutral'}>
                        {h.severity[f.severity]}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-caption text-muted"><span className="font-medium text-body">{h.why}: </span>{f.why}</p>
                  </li>
                ))}
              </ul>
            )}
            {model.hidden > 0 && <p className="mt-2 text-caption text-muted">{h.more(model.hidden)}</p>}
          </div>
          <div className="min-w-0 rounded-xl bg-surface p-4 shadow-card ring-1 ring-warn/15">
            <h3 className="flex items-baseline justify-between gap-2 text-caption font-semibold uppercase tracking-wide text-muted">
              <span>{h.geoTitle}</span>
              {model.total > 0 && <span className="normal-case tracking-normal tabular-nums">{h.geoScore(model.passed, model.total)}</span>}
            </h3>
            <GeoChecks t={t} checks={model.checks} />
          </div>
        </div>
      )}
    </Widget>
  )
}

function GeoChecks({ t, checks }: { t: Copy; checks: GeoCheck[] }) {
  const h = t.holdingBack
  return (
    <ul className="mt-2 divide-y divide-line">
      {checks.map((c) => {
        const copy = h.geo[c.id]
        const state = c.ok === null ? 'notChecked' : c.ok ? 'ok' : 'fail'
        return (
          <li key={c.id} data-geo-check={c.id} data-geo-state={state} className="flex items-start gap-3 py-3 first:pt-1">
            {c.ok === null
              ? <CircleDashed size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
              : c.ok
                ? <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
                : <XCircle size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-copy font-medium text-ink">{copy.title}</p>
                <span className={cn('shrink-0 text-caption font-medium', state === 'ok' ? 'text-ok' : state === 'fail' ? 'text-warn' : 'text-muted')}>
                  {h.checkState[state]}
                </span>
              </div>
              <p className="mt-1 text-caption text-muted"><span className="font-medium text-body">{h.why}: </span>{copy.why}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
