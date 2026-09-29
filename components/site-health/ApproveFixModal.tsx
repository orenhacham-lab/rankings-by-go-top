'use client'

/**
 * One fix, approved on its own ("אשר תיקון" / "Approve fix"). The modal reads a
 * READ-ONLY preview through the project's channel, lets the merchant edit the
 * proposal, and states in one plain sentence exactly what will be written, where,
 * and that the previous value is kept. Only its approve button sends
 * `approved: true`; the server records who approved, when and from which IP
 * before anything leaves (lib/site-fix/api.ts). After the write it shows the
 * job's outcome — applied, sent (webhook), marked for manual update (plugin not
 * connected) or failed — with undo where the channel supports it.
 *
 * FAQ: the questions and answers come prefilled from the page's own text, in its language (every
 * answer grounded in the page, lib/site-fix/suggest.ts), all editable; a page with too little text
 * says so and the form stays empty. One main heading (plugin 2.1.0): the preview names the heading
 * that stays and the ones that become H2; when the plugin cannot prove it safe the card says why and
 * shows the instructions. llms.txt: the text is built from the site's pages and editable; with the
 * plugin it is served by WordPress, otherwise it is a text to copy with the steps to place it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleCheck, Clock, Copy as CopyIcon, Info, Plus, Send, ShieldCheck, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Segmented from '@/components/ui/Segmented'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { useToasts } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Finding, FindingPage, SitePlatform } from '@/lib/site-health/types'
import type { FaqItem, FixChannel, FixErrorCode, FixJobView, FixType, H1Ref } from '@/lib/site-fix/types'
import { GuideSteps } from './FindingCard'
import { LengthMeter, SearchResultMock, Thumb } from './FixPreviewModal'
import { postFix } from './useSiteFixes'

type Copy = DashboardDictionary['siteHealth']
type Limits = { min: number; max: number; target: number }
type Via = keyof Copy['autofix']['approve']['via']

type Preview =
  | { type: 'seo_title' | 'meta_description'; before: string; after: string; expected: string | null; via: Via; limits: Limits; serp: { title: string; description: string } }
  | { type: 'focus_keyphrase' | 'canonical'; before: string; after: string; expected: string | null; via: Via }
  | { type: 'schema_jsonld'; before: string[]; schema: Record<string, unknown>; expected: string | null; via: Via }
  | { type: 'image_alt'; images: { src: string; after: string }[]; expected: string | null; via: Via }
  | { type: 'faq_block'; items: FaqItem[]; heading?: string; notice?: 'thin_content' | 'no_valid_suggestion' | null; expected: string | null; via: Via }
  | { type: 'h1_demote'; headings: H1Ref[]; keep: string; keepFrom: 'theme' | 'content'; expected: string | null; via: Via }
  | { type: 'llms_txt'; text: string; pages: number; fileUrl: string; copyOnly: boolean; expected: string | null; via: Via }
  | { type: 'broken_link'; pageUrl: string; href: string; words: string[]; expected: string | null; via: Via }
  | { type: 'internal_link'; pageUrl: string; sourceTitle: string; target: string; anchor: string; sentence: string; expected: string | null; via: Via }

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; code: FixErrorCode; reason?: H1Reason }
  | { kind: 'ready'; preview: Preview; channel: FixChannel }
  | { kind: 'done'; job: FixJobView }

type H1Reason = keyof Copy['autofix']['approve']['h1Reasons']
const H1_REASONS: readonly string[] = ['builder', 'markup', 'theme', 'unproven']
const FAQ_MAX = 8
const pathLabel = (url: string) => { try { const p = decodeURI(new URL(url).pathname); return p.replace(/\/+$/, '') || '/' } catch { return url } }
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const originOf = (url: string) => { try { return `${new URL(url).origin}/` } catch { return '' } }
const schemaTypes = (schema: Record<string, unknown>): string => {
  const nodes = Array.isArray(schema['@graph']) ? (schema['@graph'] as Record<string, unknown>[]) : [schema]
  return nodes.map((n) => String(n['@type'] ?? '')).filter(Boolean).join(' + ')
}

/** The exact value the approval sentence names, shown as the merchant will see it on the site. */
function ValueBox({ children, ltr }: { children: React.ReactNode; ltr?: boolean }) {
  return (
    <p className="mt-2 rounded-control bg-surface px-3 py-2 text-copy font-medium text-ink ring-1 ring-line break-words" dir={ltr ? 'ltr' : 'auto'} data-approve-value="">
      {children}
    </p>
  )
}

export default function ApproveFixModal({
  projectId, finding, page, type, platform, copy, toasts, onClose, onJob, onFixed, onInstall, onFocusNext, updateAvailable,
}: {
  projectId: string
  finding: Finding
  page: FindingPage
  type: FixType
  platform: SitePlatform
  copy: Copy
  toasts: ReturnType<typeof useToasts>
  onClose: () => void
  onJob: (job: FixJobView) => void
  onFixed: (on: boolean) => void
  onInstall: () => void
  /** Offered after a title is applied through the plugin: set the page's focus keyphrase too. */
  onFocusNext?: (() => void) | null
  /** The connected plugin is older than the latest version (the new fix types need the update). */
  updateAvailable?: boolean
}) {
  const a = copy.autofix
  const t = a.approve
  const { confirm, dialog } = useConfirm()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [value, setValue] = useState('')
  const [alts, setAlts] = useState<{ src: string; after: string }[]>([])
  const [faqHeading, setFaqHeading] = useState<string>(t.labels.faqHeadingDefault)
  const [faq, setFaq] = useState<FaqItem[]>([{ q: '', a: '' }, { q: '', a: '' }, { q: '', a: '' }])
  const [brokenMode, setBrokenMode] = useState<'replace' | 'unlink'>('replace')
  const [busy, setBusy] = useState(false)
  const [undoError, setUndoError] = useState<FixErrorCode | null>(null)
  /** A value the whitelist refused: the form stays as typed, with the reason above the button. */
  const [formError, setFormError] = useState<FixErrorCode | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void postFix<Preview & { channel: FixChannel }>('/api/site-health/fixes', {
      projectId, action: 'preview', type, kind: finding.id, url: page.url,
      ...(type === 'broken_link' && page.from ? { from: page.from } : {}),
      ...(type === 'internal_link' && page.value ? { keyword: page.value } : {}),
    }).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        const reason = (r as { reason?: unknown }).reason
        setPhase({ kind: 'error', code: r.code, ...(typeof reason === 'string' && H1_REASONS.includes(reason) ? { reason: reason as H1Reason } : {}) })
        return
      }
      const { channel, ...rest } = r as unknown as Preview & { channel: FixChannel; ok: true }
      const preview = rest as unknown as Preview
      if (preview.type === 'seo_title' || preview.type === 'meta_description' || preview.type === 'canonical' || preview.type === 'focus_keyphrase') setValue(preview.after)
      if (preview.type === 'image_alt') setAlts(preview.images)
      if (preview.type === 'faq_block') {
        if (preview.heading) setFaqHeading(preview.heading)
        if (preview.items.length) setFaq(preview.items.map((x) => ({ q: x.q, a: x.a })))
      }
      if (preview.type === 'llms_txt') setValue(preview.text)
      setPhase({ kind: 'ready', preview, channel })
    })
    return () => { cancelled = true }
  }, [projectId, type, finding.id, page.url, page.from, page.value])

  const trimmed = squash(value)
  const faqFilled = useMemo(() => faq.map((x) => ({ q: squash(x.q), a: squash(x.a) })).filter((x) => x.q || x.a), [faq])

  /** The fix as the whitelist takes it, or null while the form cannot be approved yet. */
  const fix = useMemo((): Record<string, unknown> | null => {
    if (phase.kind !== 'ready') return null
    const p = phase.preview
    switch (p.type) {
      case 'seo_title': case 'meta_description': case 'focus_keyphrase': case 'canonical':
        return trimmed ? { type: p.type, value: trimmed } : null
      case 'image_alt': {
        const images = alts.map((i) => ({ src: i.src, alt: squash(i.after) })).filter((i) => i.alt)
        return images.length ? { type: p.type, images } : null
      }
      case 'faq_block':
        return faqFilled.length && faqFilled.every((x) => x.q && x.a) && squash(faqHeading) ? { type: p.type, heading: squash(faqHeading), items: faqFilled } : null
      case 'schema_jsonld':
        return { type: p.type, schema: p.schema }
      case 'broken_link':
        return brokenMode === 'unlink' ? { type: p.type, href: p.href, replacement: null } : trimmed ? { type: p.type, href: p.href, replacement: trimmed } : null
      case 'internal_link':
        return { type: p.type, target: p.target, anchor: p.anchor }
      case 'h1_demote':
        return { type: p.type, headings: p.headings }
      case 'llms_txt':
        return p.copyOnly || !value.trim() ? null : { type: p.type, text: value }
    }
  }, [phase, trimmed, value, alts, faqFilled, faqHeading, brokenMode])

  const approve = useCallback(async () => {
    if (phase.kind !== 'ready' || busy || !fix) return
    const p = phase.preview
    const pageUrl = p.type === 'broken_link' || p.type === 'internal_link' ? p.pageUrl : page.url
    const before = p.type === 'seo_title' || p.type === 'meta_description' || p.type === 'canonical' || p.type === 'focus_keyphrase' ? p.before
      : p.type === 'schema_jsonld' ? p.before.join(' + ')
        : p.type === 'broken_link' ? p.href
          : p.type === 'internal_link' ? p.sentence : null
    const via = 'via' in p && (p.via === 'seo_plugin' || p.via === 'wp_title') ? p.via : null
    setBusy(true); setFormError(null)
    const r = await postFix<{ job: FixJobView }>('/api/site-health/fixes', {
      projectId, action: 'approve', approved: true, kind: finding.id, pageUrl, fix, expected: p.expected, via, before,
    })
    setBusy(false)
    if (!r.ok) {
      if (r.code === 'value_invalid' || r.code === 'off_site') { setFormError(r.code); return }
      setPhase({ kind: 'error', code: r.code }); return
    }
    onJob(r.job)
    if (r.job.status === 'applied' || r.job.status === 'sent') onFixed(true)
    setPhase({ kind: 'done', job: r.job })
  }, [phase, busy, fix, page.url, projectId, finding.id, onJob, onFixed])

  const undo = useCallback(async () => {
    if (phase.kind !== 'done' || busy) return
    const ok = await confirm({ title: a.queue.confirmUndo.title, body: a.queue.confirmUndo.body, confirmLabel: a.queue.confirmUndo.confirm })
    if (!ok) return
    setBusy(true); setUndoError(null)
    const r = await postFix<{ job: FixJobView | null }>('/api/site-health/fixes', { projectId, action: 'undo', jobId: phase.job.id })
    setBusy(false)
    if (!r.ok) { setUndoError(r.code); return }
    if (r.job) onJob(r.job)
    onFixed(false)
    onClose()
    toasts.success(a.queue.toast.undone)
  }, [phase, busy, confirm, a.queue, projectId, onJob, onFixed, onClose, toasts])

  const close = useCallback(() => {
    onClose()
    if (phase.kind === 'done') {
      const s = phase.job.status
      if (s === 'applied' || s === 'sent' || s === 'manual') toasts.success(a.queue.toast[s])
    }
  }, [onClose, phase, toasts, a.queue.toast])

  // ── The sentence: what exactly will be written, where, and what is kept ──
  const sentence = (() => {
    if (phase.kind !== 'ready') return null
    const p = phase.preview
    const lead = t.lead[phase.channel]
    let what: React.ReactNode = null
    switch (p.type) {
      case 'seo_title': case 'meta_description': case 'focus_keyphrase':
        what = <>{t.what[p.type]}{trimmed && <ValueBox>{trimmed}</ValueBox>}</>
        break
      case 'canonical':
        what = <>{t.what.canonical}{trimmed && <ValueBox ltr>{trimmed}</ValueBox>}</>
        break
      case 'image_alt':
        what = t.what.image_alt(alts.filter((i) => squash(i.after)).length)
        break
      case 'faq_block':
        what = t.what.faq_block(faqFilled.length)
        break
      case 'schema_jsonld':
        what = t.what.schema_jsonld(schemaTypes(p.schema))
        break
      case 'broken_link':
        what = brokenMode === 'unlink' ? t.what.brokenUnlink : <>{t.what.brokenReplace}{trimmed && <ValueBox ltr>{trimmed}</ValueBox>}</>
        break
      case 'internal_link':
        what = <>{t.what.internal_link}<ValueBox>{p.anchor}</ValueBox></>
        break
      case 'h1_demote':
        what = t.what.h1_demote(p.headings.length)
        break
      case 'llms_txt':
        what = <>{t.what.llms_txt}<ValueBox ltr>{p.fileUrl}</ValueBox></>
        break
    }
    return (
      <div className="rounded-inset border border-action/25 bg-action-soft/30 p-4" data-approve-sentence={phase.channel}>
        <p className="text-copy font-semibold text-ink">{lead}</p>
        <div className="mt-1.5 text-copy text-body">{what}</div>
        <ul className="mt-3 space-y-1.5 text-caption text-muted" role="list">
          <li className="flex gap-2">
            <Undo2 size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 rtl:-scale-x-100" />
            {phase.channel === 'webhook' ? t.keepSent : phase.channel === 'plugin' || phase.channel === 'app_password' ? t.keep : t.keepManual}
          </li>
          <li className="flex gap-2">
            <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t.record}
          </li>
        </ul>
      </div>
    )
  })()

  const copyOnly = phase.kind === 'ready' && phase.preview.type === 'llms_txt' && phase.preview.copyOnly
  const copyText = useCallback(async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true) } catch { setCopied(false) }
  }, [value])

  const viaNote = phase.kind === 'ready' && !copyOnly ? (
    <p className="flex gap-2 rounded-inset bg-info-soft px-4 py-3 text-copy text-ink">
      <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-1 shrink-0 text-info" />
      {t.via[phase.preview.via]}
    </p>
  ) : null

  const editor = (() => {
    if (phase.kind !== 'ready') return null
    const p = phase.preview
    switch (p.type) {
      case 'seo_title':
      case 'meta_description':
        return (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-inset border border-line bg-sunk/60 p-4" data-side="before">
                <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.before}</p>
                <p className={cn('mt-2 text-copy text-pretty', p.before ? 'text-body' : 'italic text-muted')}>{p.before || t.empty}</p>
              </div>
              <div className="rounded-inset border border-action/30 bg-action-soft/40 p-4" data-side="after">
                <label htmlFor="approve-after" className="text-overline font-semibold uppercase tracking-wide text-action">{t.after}</label>
                <Textarea id="approve-after" value={value} onChange={(e) => setValue(e.target.value)} rows={p.type === 'seo_title' ? 2 : 4} className="mt-2 bg-surface" />
                <LengthMeter n={trimmed.length} limits={p.limits} copy={copy} />
              </div>
            </div>
            <p className="text-caption text-muted">{t.labels.editHint}</p>
            <SearchResultMock
              url={page.url}
              caption={copy.preview.googleLook}
              title={p.type === 'seo_title' ? trimmed : p.serp.title}
              description={p.type === 'meta_description' ? trimmed : p.serp.description}
            />
          </>
        )
      case 'canonical':
      case 'focus_keyphrase':
        return (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-inset border border-line bg-sunk/60 p-4" data-side="before">
              <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.before}</p>
              <p className={cn('mt-2 break-words text-copy', p.before ? 'text-body' : 'italic text-muted')} dir={p.type === 'canonical' && p.before ? 'ltr' : undefined}>{p.before || t.empty}</p>
            </div>
            <div className="rounded-inset border border-action/30 bg-action-soft/40 p-4" data-side="after">
              <Input
                id="approve-after"
                label={p.type === 'canonical' ? t.labels.canonical : t.labels.focus}
                type={p.type === 'canonical' ? 'url' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                hint={p.type === 'canonical' ? t.labels.canonicalHint : t.labels.focusHint}
                className="bg-surface"
              />
            </div>
          </div>
        )
      case 'image_alt':
        return (
          <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line" role="list">
            {alts.map((img, i) => (
              <li key={img.src} className="flex items-start gap-4 p-4">
                <Thumb src={img.src} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`approve-alt-${i}`} className="text-caption font-semibold text-ink">{t.labels.alt}</label>
                  <Textarea
                    id={`approve-alt-${i}`}
                    rows={1}
                    value={img.after}
                    onChange={(e) => setAlts((list) => list.map((x, j) => (j === i ? { ...x, after: e.target.value } : x)))}
                    className="mt-1.5"
                  />
                </div>
              </li>
            ))}
          </ul>
        )
      case 'faq_block':
        return (
          <div className="space-y-4">
            {p.notice ? (
              <Notice tone="warn">{p.notice === 'thin_content' ? t.labels.faqThin : t.labels.faqNoSuggestion}</Notice>
            ) : p.items.length ? (
              <p className="flex gap-2 text-caption text-muted" data-faq-generated={p.items.length}>
                <Info size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
                {t.labels.faqGenerated}
              </p>
            ) : (
              <p className="text-caption text-muted">{t.labels.faqHint}</p>
            )}
            <Input id="approve-faq-heading" label={t.labels.faqHeading} value={faqHeading} onChange={(e) => setFaqHeading(e.target.value)} />
            <ol className="space-y-3" role="list">
              {faq.map((item, i) => (
                <li key={i} className="rounded-inset border border-line bg-sunk/40 p-4" data-faq-item={i}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`approve-faq-q-${i}`} className="text-caption font-semibold text-ink">{t.labels.question(i + 1)}</label>
                    {faq.length > 1 && (
                      <Button variant="ghost" size="sm" aria-label={t.labels.removeQuestion(i + 1)} onClick={() => setFaq((l) => l.filter((_, j) => j !== i))}>
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  <Input id={`approve-faq-q-${i}`} value={item.q} onChange={(e) => setFaq((l) => l.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} className="mt-1.5 bg-surface" />
                  <label htmlFor={`approve-faq-a-${i}`} className="mt-3 block text-caption font-semibold text-ink">{t.labels.answer}</label>
                  <Textarea id={`approve-faq-a-${i}`} rows={2} value={item.a} onChange={(e) => setFaq((l) => l.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} className="mt-1.5 bg-surface" />
                </li>
              ))}
            </ol>
            {faq.length < FAQ_MAX && (
              <Button variant="secondary" size="sm" onClick={() => setFaq((l) => [...l, { q: '', a: '' }])} data-faq-add="">
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                {t.labels.addQuestion}
              </Button>
            )}
          </div>
        )
      case 'schema_jsonld':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-caption">
              <span className="font-semibold text-ink">{t.labels.schemaCurrent}:</span>
              {p.before.length ? p.before.map((x) => <Badge key={x} variant="neutral">{x}</Badge>) : <span className="text-muted">{t.labels.schemaNone}</span>}
            </div>
            <div>
              <p className="text-caption font-semibold text-ink">{t.labels.schemaCode}</p>
              <pre dir="ltr" className="mt-1.5 max-h-56 overflow-auto rounded-inset border border-line bg-sunk/60 p-3 font-mono text-caption text-body">{JSON.stringify(p.schema, null, 2)}</pre>
            </div>
          </div>
        )
      case 'broken_link':
        return (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-inset border border-line bg-sunk/60 p-4">
                <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.labels.brokenHref}</p>
                <p className="mt-2 break-all text-copy text-body" dir="ltr">{p.href}</p>
              </div>
              <div className="rounded-inset border border-line bg-sunk/60 p-4">
                <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.labels.brokenWords}</p>
                <p className="mt-2 text-copy text-body" dir="auto">{p.words.length ? p.words.join(' · ') : t.empty}</p>
              </div>
            </div>
            <Segmented
              ariaLabel={t.labels.brokenMode}
              value={brokenMode}
              onChange={setBrokenMode}
              fill
              options={[{ value: 'replace', label: t.labels.replaceMode }, { value: 'unlink', label: t.labels.unlinkMode }]}
            />
            {brokenMode === 'replace' && (
              <Input id="approve-after" type="url" label={t.labels.replacement} value={value} onChange={(e) => setValue(e.target.value)} placeholder={originOf(p.pageUrl)} />
            )}
          </div>
        )
      case 'h1_demote':
        return (
          <div className="space-y-3" data-h1-plan={p.keepFrom}>
            <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line" role="list">
              <li className="flex flex-col gap-1.5 bg-ok-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-copy font-medium text-ink" dir="auto"><span className="me-2 font-mono text-caption text-muted" dir="ltr">H1</span>{p.keep}</p>
                <Badge variant="success">{t.labels.h1Keep} · {p.keepFrom === 'theme' ? t.labels.h1Theme : t.labels.h1Content}</Badge>
              </li>
              {p.headings.map((h) => (
                <li key={h.n} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-center sm:justify-between" data-h1-demote={h.n}>
                  <p className="min-w-0 text-copy text-body" dir="auto"><span className="me-2 font-mono text-caption text-muted" dir="ltr">H1 → H2</span>{h.text}</p>
                  <Badge variant="info">{t.labels.h1Demote}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted">{t.labels.h1Note}</p>
          </div>
        )
      case 'llms_txt':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="approve-llms" className="text-caption font-semibold text-ink">{t.labels.llmsText}</label>
              <span className="text-caption text-muted">{t.labels.llmsPages(p.pages)}</span>
            </div>
            <Textarea id="approve-llms" rows={14} value={value} onChange={(e) => { setValue(e.target.value); setCopied(false) }} dir="auto" className="font-mono text-caption" data-llms-text="" />
            <p className="text-caption text-muted">{t.labels.llmsHint}</p>
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-caption">
              <span className="font-semibold text-ink">{t.labels.llmsAddress}:</span>
              <span className="min-w-0 break-all text-body" dir="ltr">{p.fileUrl}</span>
            </p>
            {p.copyOnly && (
              <div className="space-y-3" data-llms-copy="">
                <GuideSteps steps={t.labels.llmsCopySteps} title={t.labels.llmsCopyTitle} />
                {updateAvailable ? (
                  <p className="text-caption text-muted">{t.labels.llmsUpdate}</p>
                ) : platform === 'wordpress' ? (
                  <p className="text-caption text-muted">{t.labels.llmsCopyWp}</p>
                ) : null}
              </div>
            )}
          </div>
        )
      case 'internal_link': {
        const i = p.sentence.toLowerCase().indexOf(p.anchor.toLowerCase())
        return (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-inset border border-line bg-sunk/60 p-4">
              <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.labels.linkWords}</p>
              <p className="mt-2 text-copy text-body text-pretty">
                {i >= 0 ? (
                  <>
                    {p.sentence.slice(0, i)}
                    <span className="font-medium text-action underline decoration-action/40 underline-offset-4">{p.sentence.slice(i, i + p.anchor.length)}</span>
                    {p.sentence.slice(i + p.anchor.length)}
                  </>
                ) : p.sentence}
              </p>
            </div>
            <div className="rounded-inset border border-line bg-sunk/60 p-4">
              <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t.labels.linkTarget}</p>
              <p className="mt-2 break-all text-copy text-body" dir="ltr">{pathLabel(p.target)}</p>
            </div>
          </div>
        )
      }
    }
  })()

  const result = phase.kind === 'done' ? (() => {
    const s = phase.job.status
    const key = s === 'applied' || s === 'sent' || s === 'manual' ? s : 'failed'
    const r = t.result[key]
    const Icon = key === 'applied' ? CircleCheck : key === 'sent' ? Send : key === 'manual' ? Clock : TriangleAlert
    const tone = key === 'applied' ? 'ok' : key === 'sent' ? 'info' : key === 'manual' ? 'warn' : 'bad'
    const err = phase.job.errorCode && phase.job.errorCode in a.errors ? a.errors[phase.job.errorCode as FixErrorCode] : null
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-inset border px-6 py-8 text-center motion-safe:animate-pop-in',
          tone === 'ok' ? 'border-ok/20 bg-ok-soft' : tone === 'info' ? 'border-info/20 bg-info-soft' : tone === 'warn' ? 'border-warn/20 bg-warn-soft' : 'border-bad/20 bg-bad-soft',
        )}
        data-fix-result={s}
      >
        <span className={cn('grid size-12 place-items-center rounded-full bg-surface shadow-card', tone === 'ok' ? 'text-ok' : tone === 'info' ? 'text-info' : tone === 'warn' ? 'text-warn' : 'text-bad')}>
          <Icon size={24} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-section font-semibold text-ink">{r.title}</p>
        <p className="max-w-md text-copy text-body">{r.body}</p>
        {err && key !== 'applied' && key !== 'sent' && <p className="max-w-md text-caption text-muted">{err}</p>}
        {phase.job.after && key !== 'failed' && <p className="max-w-md rounded-control bg-surface px-3 py-2 text-copy font-medium text-ink ring-1 ring-line" dir="auto">{phase.job.after}</p>}
      </div>
    )
  })() : null

  const footer = (() => {
    if (phase.kind === 'ready' && copyOnly) {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>{t.close}</Button>
          {platform === 'wordpress' && (
            <Button variant="secondary" onClick={() => { onClose(); onInstall() }} data-install-from-fix="">
              {updateAvailable ? a.connection.update.action : a.connection.install}
            </Button>
          )}
          <Button onClick={copyText} disabled={!value.trim()} aria-live="polite" data-llms-copy-button="">
            {copied ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <CopyIcon size={16} strokeWidth={2} aria-hidden="true" />}
            {copied ? t.labels.llmsCopied : t.labels.llmsCopy}
          </Button>
        </div>
      )
    }
    if (phase.kind === 'ready') {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t.cancel}</Button>
          <Button onClick={approve} loading={busy} disabled={!fix} data-approve-fix="">{t.button}</Button>
        </div>
      )
    }
    if (phase.kind === 'done') {
      const focusNext = onFocusNext && phase.job.status === 'applied' && phase.job.type === 'seo_title'
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {focusNext && <Button variant="ghost" onClick={onFocusNext} disabled={busy} data-focus-next="">{t.focusNext}</Button>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {phase.job.canUndo && (
              <Button variant="secondary" onClick={undo} loading={busy} data-undo-fix="">
                <Undo2 size={16} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
                {t.undo}
              </Button>
            )}
            <Button onClick={close} disabled={busy}>{t.close}</Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>{t.close}</Button>
        {phase.kind === 'error' && phase.code === 'needs_plugin' && (
          <Button onClick={() => { onClose(); onInstall() }} data-install-from-fix="">{a.connection.install}</Button>
        )}
        {phase.kind === 'error' && phase.code === 'needs_update' && (
          <Button onClick={() => { onClose(); onInstall() }} data-update-from-fix="">{a.connection.update.action}</Button>
        )}
      </div>
    )
  })()

  return (
    <Modal open onClose={busy ? () => {} : close} title={t.title[type]} size="lg">
      <div className="space-y-5" data-fix-phase={phase.kind} data-fix-type={type}>
        <div className="flex min-w-0 items-baseline gap-2 text-copy">
          <span className="shrink-0 font-semibold text-ink">{t.page}:</span>
          <span className="min-w-0 truncate text-body" dir="ltr" title={page.url}>
            {pathLabel(phase.kind === 'ready' && (phase.preview.type === 'broken_link' || phase.preview.type === 'internal_link') ? phase.preview.pageUrl : page.url)}
          </span>
        </div>

        {phase.kind === 'loading' && (
          <div role="status" aria-busy="true" className="space-y-3">
            <p className="text-copy text-muted">{t.loading}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-28 rounded-inset" />
              <Skeleton className="h-28 rounded-inset" />
            </div>
            <Skeleton className="h-20 rounded-inset" />
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="space-y-4">
            <Notice tone={phase.code === 'nothing_to_fix' ? 'ok' : 'warn'}>{phase.code === 'h1_not_safe' && phase.reason ? t.h1Reasons[phase.reason] : a.errors[phase.code]}</Notice>
            <GuideSteps steps={copy.guides[finding.guide][platform]} title={copy.stepsTitle} />
          </div>
        )}

        {phase.kind === 'ready' && (
          <>
            {editor}
            {viaNote}
            {!copyOnly && sentence}
            {formError && <Notice tone="warn">{a.errors[formError]}</Notice>}
          </>
        )}

        {result}
        {phase.kind === 'done' && undoError && <Notice tone="bad">{a.errors[undoError]}</Notice>}

        <div className="border-t border-line pt-4">{footer}</div>
      </div>
      {dialog}
    </Modal>
  )
}
