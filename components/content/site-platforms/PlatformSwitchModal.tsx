'use client'

/**
 * "Switch platform" — one modal for choosing where a web project's articles go:
 * WordPress, Shopify, Wix or a custom-built site (signed webhook).
 *
 *   - If something is connected, the disconnect warning is on screen from the
 *     moment the modal opens, before any choice.
 *   - The four options are cards; a choice reveals ONLY its own fields.
 *   - WordPress and Shopify keep their existing connect flows: confirming
 *     disconnects the current platform and opens that platform's own panel.
 *   - Wix and webhook are validated first (Wix: one harmless read; webhook: the
 *     SSRF admission), and only then is the current platform disconnected and
 *     the new one saved — a typo never leaves the project with nothing.
 *
 * The decisions live in lib/site-platforms/switch-flow.ts (pure, QA-held);
 * PlatformSwitchBody is the presentational half, rendered by the QA suite.
 *
 * For a merchant who is not a developer: the platform the site scan detected
 * is chosen when the modal opens (only while nothing is connected, and only
 * as a choice, never as a connection); Wix says in three steps where its two
 * details are; and the custom-built site offers a way out for whoever does not
 * know what a webhook is: send the instructions to their developer, or write
 * to us on WhatsApp.
 */
import { useEffect, useId, useState } from 'react'
import { TriangleAlert, CircleCheck, Copy, Check, LifeBuoy, Mail, MessageCircle, ScanSearch } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { CHOOSABLE_PLATFORMS, type ChoosablePlatform, type SanitizedSiteConnection } from '@/lib/site-platforms/types'
import { disconnectUrl, switchSteps, switchView, type SwitchField, type SwitchValues } from '@/lib/site-platforms/switch-flow'
import { SUPPORT_WHATSAPP_HREF } from '@/lib/onboarding/links'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import PlatformIcon from './PlatformIcon'
import WebhookDocs from './WebhookDocs'

type T = DashboardDictionary['sitePlatforms']

export function siteErrorText(t: T, code: unknown): string {
  return (t.errors as Record<string, string>)[String(code ?? '')] ?? t.errors.unexpected
}

/** The modal's content for one state. Pure: props in, markup out. */
export function PlatformSwitchBody({
  t, current, choice, values, onChoose, onChange, test, error, disabled, detected = null,
}: {
  t: T
  current: ChoosablePlatform | null
  choice: ChoosablePlatform | null
  /** The platform the site scan detected, when the modal chose it for the merchant. */
  detected?: ChoosablePlatform | null
  values: SwitchValues
  onChoose: (p: ChoosablePlatform) => void
  onChange: (f: SwitchField, v: string) => void
  test?: { state: 'idle' | 'busy' | 'ok'; onRun: () => void } | null
  error?: string | null
  disabled?: boolean
}) {
  const view = switchView(current, choice, values)
  const group = useId()
  return (
    <div className="space-y-4" data-switch-choice={choice ?? 'none'}>
      <p className="text-copy text-muted">{t.modal.intro}</p>

      {view.warnAbout && (
        <div role="alert" data-switch-warning={view.warnAbout} className="flex items-start gap-2.5 rounded-inset border border-warn/20 bg-warn-soft px-4 py-3 text-warn">
          <TriangleAlert className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-copy">
            <p className="font-semibold">{t.modal.warnTitle.replace('{platform}', t.names[view.warnAbout])}</p>
            <p className="mt-0.5 text-caption">{t.modal.warnBody}</p>
          </div>
        </div>
      )}

      <div role="radiogroup" aria-labelledby={`${group}-label`} className="grid gap-2.5 sm:grid-cols-2">
        <span id={`${group}-label`} className="sr-only">{t.modal.title}</span>
        {CHOOSABLE_PLATFORMS.map((p) => {
          const selected = choice === p
          const isCurrent = current === p
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              data-platform-option={p}
              disabled={disabled || isCurrent}
              onClick={() => onChoose(p)}
              className={cn(
                'group flex items-start gap-3 rounded-inset border bg-surface p-3 text-start shadow-control',
                'transition-[border-color,box-shadow,background-color] duration-150 ease-snappy',
                'hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
                'disabled:cursor-not-allowed disabled:opacity-60',
                selected ? 'border-action ring-4 ring-action/15' : 'border-line',
              )}
            >
              <PlatformIcon platform={p} size="sm" className={cn(selected && 'bg-action text-action-ink ring-action/30')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-copy font-semibold text-ink">{t.names[p]}</span>
                  {isCurrent && <Badge variant="info">{t.modal.currentBadge}</Badge>}
                </span>
                <span className="mt-0.5 block text-caption text-muted">{t.blurbs[p]}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'mt-1 grid size-4 shrink-0 place-items-center rounded-pill border transition-colors',
                  selected ? 'border-action bg-action' : 'border-line-strong bg-surface',
                )}
              >
                {selected && <span className="size-1.5 rounded-pill bg-action-ink" />}
              </span>
            </button>
          )
        })}
      </div>

      {!choice && <p className="text-caption text-muted">{t.modal.pickFirst}</p>}
      {choice && detected === choice && (
        <p data-switch-detected={detected} className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-info/20 bg-info-soft px-2.5 py-1 text-caption font-medium text-info">
          <ScanSearch className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{t.modal.detectedNote}</span>
        </p>
      )}

      {choice && (
        <div key={choice} data-switch-fields={choice} className="space-y-3 rounded-card border border-line bg-sunk/40 p-4 motion-safe:animate-pop-in">
          {view.nextNote === 'wordpress' && <p className="text-copy text-body">{t.modal.wordpressNext}</p>}
          {view.nextNote === 'shopify' && <p className="text-copy text-body">{t.modal.shopifyNext}</p>}

          {choice === 'wix' && <GuideSteps title={t.wix.stepsTitle} steps={t.wix.steps} />}

          {view.fields.includes('siteUrl') && (
            <Input
              label={t.wix.siteUrl} hint={t.wix.siteUrlHint} type="url" name="siteUrl" autoComplete="off"
              placeholder="https://www.your-site.com" value={values.siteUrl ?? ''} disabled={disabled}
              onChange={(e) => onChange('siteUrl', e.target.value)}
            />
          )}
          {view.fields.includes('siteId') && (
            <Input
              label={t.wix.siteId} hint={t.wix.siteIdHint} type="text" dir="ltr" className="text-left" name="siteId" autoComplete="off" spellCheck={false}
              placeholder={t.wix.siteIdPlaceholder} value={values.siteId ?? ''} disabled={disabled}
              onChange={(e) => onChange('siteId', e.target.value)}
            />
          )}
          {view.fields.includes('apiKey') && (
            <Input
              label={t.wix.apiKey} hint={t.wix.apiKeyHint} type="password" name="apiKey" autoComplete="new-password"
              value={values.apiKey ?? ''} disabled={disabled}
              onChange={(e) => onChange('apiKey', e.target.value)}
            />
          )}
          {view.fields.includes('endpointUrl') && (
            <>
              <Input
                label={t.webhook.url} hint={t.webhook.urlHint} type="url" name="endpointUrl" autoComplete="off"
                placeholder="https://www.your-site.com/api/gotop-webhook" value={values.endpointUrl ?? ''} disabled={disabled}
                onChange={(e) => onChange('endpointUrl', e.target.value)}
              />
              <WebhookDocs t={t.webhook.docs} />
            </>
          )}

          {(choice === 'webhook' || choice === 'wix') && <HelpPath t={t} platform={choice} />}

          {choice === 'wix' && test && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={test.onRun} loading={test.state === 'busy'} disabled={disabled || !view.canTest}>
                {test.state === 'busy' ? t.wix.testing : t.wix.test}
              </Button>
              {test.state === 'ok' && (
                <span role="status" className="inline-flex items-center gap-1.5 text-caption font-medium text-ok motion-safe:animate-pop-in">
                  <CircleCheck aria-hidden="true" className="size-4" /> {t.wix.testOk}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-inset border border-bad/20 bg-bad-soft px-4 py-3 text-copy text-bad motion-safe:animate-pop-in">{error}</p>}
    </div>
  )
}

/** Short numbered steps: where a detail is found, in the words of the platform's own screens. */
function GuideSteps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div className="rounded-inset border border-line bg-surface px-4 py-3" data-switch-steps>
      <p className="text-caption font-semibold text-ink">{title}</p>
      <ol className="mt-1.5 list-decimal space-y-1 ps-5 text-caption text-body">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The way out for a merchant who does not know what goes in the fields: write
 * to us on WhatsApp (a fixed address of ours), or, for a custom-built site,
 * send the instructions to their developer by email (a mailto with our own
 * fixed text; no address and nothing typed here is in it).
 */
function HelpPath({ t, platform }: { t: T; platform: 'webhook' | 'wix' }) {
  const mailto = `mailto:?subject=${encodeURIComponent(t.help.developerSubject)}&body=${encodeURIComponent(t.help.developerBody)}`
  return (
    <div className="rounded-inset bg-sunk/60 px-4 py-3" data-switch-help={platform}>
      <p className="flex items-center gap-1.5 text-caption font-semibold text-ink">
        <LifeBuoy className="size-4 shrink-0 text-action" aria-hidden="true" /> {t.help.title}
      </p>
      <p className="mt-1 text-caption text-body">{platform === 'webhook' ? t.help.webhookBody : t.help.wixBody}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {platform === 'webhook' && (
          <a href={mailto} className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20" data-help-developer>
            <Mail aria-hidden="true" className="size-4" /> {t.help.developer}
          </a>
        )}
        <a href={SUPPORT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20" data-help-whatsapp>
          <MessageCircle className="size-4 text-whatsapp" aria-hidden="true" /> {t.help.whatsapp}
        </a>
      </div>
    </div>
  )
}

/** The one-time reveal of a new webhook signing secret. */
function SecretReveal({ t, secret, onDone }: { t: T; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-3 motion-safe:animate-pop-in" data-secret-reveal>
      <p className="text-copy font-semibold text-ink">{t.modal.secretTitle}</p>
      <p className="text-copy text-muted">{t.modal.secretBody}</p>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-control border border-line bg-sunk px-3 py-2 text-caption tabular-nums text-ink">{secret}</code>
        <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(secret).then(() => setCopied(true)) }}>
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />} {copied ? t.modal.copied : t.modal.copy}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone}>{t.modal.done}</Button>
      </div>
    </div>
  )
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({})) as Promise<Record<string, unknown>>
}

export default function PlatformSwitchModal({
  open, onClose, projectId, current, t, onSwitched, preferred = null,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  current: ChoosablePlatform | null
  /** The platform the site scan detected: chosen on opening while nothing is connected. */
  preferred?: ChoosablePlatform | null
  t: T
  /** After a confirmed switch: which platform, and (Wix/webhook) the saved connection. */
  onSwitched: (platform: ChoosablePlatform, saved?: SanitizedSiteConnection | null) => void
}) {
  const detectedChoice = !current && preferred && CHOOSABLE_PLATFORMS.includes(preferred) ? preferred : null
  const [choice, setChoice] = useState<ChoosablePlatform | null>(detectedChoice)
  const [values, setValues] = useState<SwitchValues>({})
  const [busy, setBusy] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'busy' | 'ok'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [saved, setSaved] = useState<SanitizedSiteConnection | null>(null)

  // Every opening starts clean.
  useEffect(() => {
    if (open) { setChoice(detectedChoice); setValues({}); setBusy(false); setTestState('idle'); setError(null); setSecret(null); setSaved(null) }
    // Only on opening: a later change of the hint must not undo the merchant's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const view = switchView(current, choice, values)
  const payload = () => choice === 'wix'
    ? { projectId, platform: 'wix', siteId: values.siteId?.trim(), apiKey: values.apiKey?.trim(), siteUrl: values.siteUrl?.trim() }
    : { projectId, platform: 'webhook', endpointUrl: values.endpointUrl?.trim() }

  async function runTest() {
    setTestState('busy'); setError(null)
    try {
      const res = await fetch('/api/site-platforms/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
      const d = await readJson(res)
      if (res.ok && d.ok) setTestState('ok')
      else { setTestState('idle'); setError(siteErrorText(t, d.code ?? d.reason)) }
    } catch { setTestState('idle'); setError(t.errors.unexpected) }
  }

  async function confirm() {
    if (!choice || !view.canConfirm) return
    setBusy(true); setError(null)
    try {
      for (const step of switchSteps(current, choice)) {
        if (step.kind === 'validate') {
          const res = await fetch('/api/site-platforms/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
          const d = await readJson(res)
          if (!res.ok || !d.ok) { setError(siteErrorText(t, d.code ?? d.reason)); return }
        } else if (step.kind === 'disconnect') {
          const res = await fetch(disconnectUrl(step.platform, projectId), { method: 'DELETE' })
          if (!res.ok) { const d = await readJson(res); setError(siteErrorText(t, d.reason)); return }
        } else if (step.kind === 'save') {
          const res = await fetch('/api/site-platforms/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
          const d = await readJson(res)
          if (!res.ok) {
            setError(siteErrorText(t, d.reason ?? d.error))
            // The old platform is already gone: the card must say so too.
            onSwitched(choice, null)
            return
          }
          const conn = (d.connection ?? null) as SanitizedSiteConnection | null
          if (typeof d.secret === 'string') { setSaved(conn); setSecret(d.secret); return }
          onSwitched(choice, conn)
          onClose()
          return
        } else {
          onSwitched(step.platform, null)
          onClose()
          return
        }
      }
    } catch {
      setError(t.errors.unexpected)
    } finally {
      setBusy(false)
    }
  }

  const finishSecret = () => { if (choice) onSwitched(choice, saved); setSecret(null); onClose() }

  return (
    <Modal open={open} onClose={secret ? finishSecret : onClose} title={t.modal.title} size="lg">
      {secret ? (
        <SecretReveal t={t} secret={secret} onDone={finishSecret} />
      ) : (
        <>
          <PlatformSwitchBody
            t={t} current={current} choice={choice} values={values} disabled={busy} error={error} detected={detectedChoice}
            onChoose={(p) => { setChoice(p); setError(null); setTestState('idle') }}
            onChange={(f, v) => { setValues((s) => ({ ...s, [f]: v })); if (f !== 'siteUrl') setTestState('idle') }}
            test={{ state: testState, onRun: () => void runTest() }}
          />
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={onClose} disabled={busy}>{t.modal.cancel}</Button>
            <Button
              variant={view.confirmLabel === 'switch' ? 'danger' : 'primary'}
              onClick={() => void confirm()}
              loading={busy}
              disabled={!view.canConfirm || busy}
              data-switch-confirm={view.confirmLabel}
            >
              {busy ? t.modal.working : view.confirmLabel === 'switch' ? t.modal.confirmSwitch : t.modal.confirmConnect}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
