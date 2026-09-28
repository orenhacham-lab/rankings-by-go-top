'use client'

/**
 * A refusal or a stop, said plainly: a title, one sentence, and at most one
 * action. The copy comes from seedOnboarding.notices by the notice's key, so
 * nothing a route or a provider said can reach the screen.
 */
import { AlertTriangle, Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { Locale } from '@/lib/i18n/locales'
import { BILLING_HREF, CLIENTS_HREF, dashboardHref, settingsHref, signInHref } from '@/lib/onboarding/links'
import { WAIT_NOTICES, waitParts, type Notice } from '@/lib/onboarding/notices'
import { cn } from '@/lib/utils'
import { ActionLink } from './parts'

/** The notice's title and sentence in `locale`, its wait (if any) spelled out. */
export function noticeCopy(notice: Notice, locale: Locale): { title: string; body: string } {
  const t = getDashboardDictionary(locale).seedOnboarding
  const copy = t.notices[notice.key] as { title: string; body: string | ((wait: string) => string) }
  if (typeof copy.body === 'string') return { title: copy.title, body: copy.body }
  // Without the server's Retry-After the sentence says "later", never a time we would be guessing.
  if (!notice.retryAfterSeconds) return { title: copy.title, body: copy.body(t.wait.later) }
  const wait = waitParts(notice.retryAfterSeconds)
  const waitText = wait.unit === 'minutes' ? t.wait.minutes(wait.value) : t.wait.hours(wait.value)
  return { title: copy.title, body: copy.body(waitText) }
}

export default function SeedNotice({
  notice,
  projectId,
  returnPath,
  onRetry,
  onRefresh,
  busy,
  tone = 'warn',
  className,
}: {
  notice: Notice
  /** The project the action is about, when there is one. */
  projectId?: string | null
  /** Where signing in again returns to: always a path this app built. */
  returnPath: string
  onRetry?: () => void
  onRefresh?: () => void
  busy?: boolean
  tone?: 'warn' | 'info'
  className?: string
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).seedOnboarding
  const { title, body } = noticeCopy(notice, language)
  const isWait = WAIT_NOTICES.includes(notice.key)

  let action: React.ReactNode = null
  switch (notice.action) {
    case 'retry':
      if (onRetry) action = <Button onClick={onRetry} loading={busy}>{t.actions.retry}</Button>
      break
    case 'refresh':
      action = <Button variant="secondary" onClick={onRefresh ?? (() => window.location.reload())} loading={busy}>{t.actions.refresh}</Button>
      break
    case 'billing':
      action = <ActionLink href={BILLING_HREF}>{t.actions.billing}</ActionLink>
      break
    case 'signin':
      action = <ActionLink href={signInHref(returnPath)}>{t.actions.signin}</ActionLink>
      break
    case 'dashboard':
      action = <ActionLink href={projectId ? dashboardHref(projectId) : '/dashboard'} variant={isWait ? 'secondary' : 'primary'}>{t.actions.dashboard}</ActionLink>
      break
    case 'settings':
      action = projectId ? <ActionLink href={settingsHref(projectId)}>{t.actions.settings}</ActionLink> : null
      break
    case 'clients':
      action = <ActionLink href={CLIENTS_HREF}>{t.actions.clients}</ActionLink>
      break
    default:
      action = null
  }

  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      data-notice={notice.key}
      className={cn(
        'animate-pop-in flex flex-col gap-4 rounded-card border p-5 sm:flex-row sm:items-center sm:justify-between',
        tone === 'info' ? 'border-info/20 bg-info-soft' : 'border-warn/25 bg-warn-soft',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface', tone === 'info' ? 'text-info' : 'text-warn')}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-copy font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-copy text-body">{body}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
