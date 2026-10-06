'use client'

import { useId, useMemo, useState } from 'react'
import { Check, LayoutTemplate, Megaphone, Palette, Plus, RectangleHorizontal, RefreshCw, Square, Star, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notice from '@/components/ui/Notice'
import Segmented from '@/components/ui/Segmented'
import Switch from '@/components/ui/Switch'
import { saveArticleStyleAction } from '@/app/(dashboard)/settings/article-style-actions'
import type { ArticleStyleView } from '@/lib/content/article-style/data'
import { CTA_LIMITS, isCompleteCta, sameArticleCta, suggestArticleCta, type ArticleCta, type CtaField } from '@/lib/content/article-style/cta'
import {
  ARTICLE_DESIGNS,
  IMAGE_STYLES,
  MAX_BRAND_COLORS,
  MAX_INLINE_IMAGES,
  normalizeHex,
  sameArticleStyle,
  type ArticleDesign,
  type ArticleStyle,
  type HeroRatio,
} from '@/lib/content/article-style/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { fill } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import ArticleStylePreview, { type PreviewSubject } from './ArticleStylePreview'
import ImageStyleArt from './ImageStyleArt'
import SaveBar, { showSaveBar, type SaveState } from './SaveBar'
import SettingsCard, { fieldClass } from './SettingsCard'
import { SECTION } from './anchors'
import { useDraft } from './useDraft'
import type { SiteSignals } from './useArticleSettings'

type Copy = DashboardDictionary['projectSettings']

/** A choice tile's frame: the chosen one carries the action colour, the rest a quiet line. */
const TILE =
  'group relative w-full rounded-inset border bg-surface text-start transition-[border-color,box-shadow,background-color] duration-150 ease-snappy ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 disabled:cursor-not-allowed disabled:opacity-60'
const tileState = (on: boolean) => (on ? 'border-action ring-1 ring-action shadow-control' : 'border-line hover:border-line-strong')

function Chosen({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute end-2 top-2 z-10 grid size-5 place-items-center rounded-pill bg-action text-action-ink shadow-control transition-opacity duration-150',
        on ? 'opacity-100' : 'opacity-0',
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  )
}

/** A two-line sketch of each layout, drawn in the brand colour for "designed". */
function DesignThumb({ design, color }: { design: ArticleDesign; color: string }) {
  const formatted = design === 'formatted'
  return (
    <svg viewBox="0 0 120 64" aria-hidden className="block h-auto w-full rounded-inset bg-sunk rtl:-scale-x-100">
      <rect x="10" y="8" width="70" height="5" rx="2.5" fill="currentColor" className="text-line-strong" />
      {formatted ? (
        <>
          <rect x="10" y="18" width="100" height="14" rx="3" fill={color} opacity="0.14" />
          <rect x="10" y="18" width="3" height="14" rx="1.5" fill={color} />
          <rect x="17" y="23" width="60" height="4" rx="2" fill={color} opacity="0.7" />
          <rect x="10" y="37" width="100" height="4" rx="2" fill="currentColor" className="text-line-strong" />
          <rect x="10" y="46" width="100" height="12" rx="3" fill={color} />
          <rect x="17" y="50" width="40" height="4" rx="2" fill="#ffffff" />
        </>
      ) : (
        <>
          <rect x="10" y="20" width="100" height="4" rx="2" fill="currentColor" className="text-line-strong" />
          <rect x="10" y="29" width="92" height="4" rx="2" fill="currentColor" className="text-line-strong" />
          <rect x="10" y="38" width="100" height="4" rx="2" fill="currentColor" className="text-line-strong" />
          <rect x="10" y="47" width="70" height="4" rx="2" fill="currentColor" className="text-line-strong" />
        </>
      )}
    </svg>
  )
}

/**
 * "Article design": the brand colours, the formatted or minimal layout (with a
 * live preview drawn by the same function that styles published articles), the
 * image style, the hero's shape, how many images go inside an article, and
 * "no AI images". Its own save. Read-only (with a notice) until the settings
 * table exists, and the defaults it shows then are exactly today's behaviour.
 */
export default function ArticleStyleCard({
  view,
  signals,
  onReadSite,
  onData,
  t,
  locale,
  projectId,
  subject,
}: {
  view: ArticleStyleView
  signals: SiteSignals
  onReadSite: () => void
  onData: (data: ArticleStyleView) => void
  t: Copy
  locale: Locale
  projectId: string
  /** What the preview article is about: the project's line of business and name. */
  subject?: PreviewSubject | null
}) {
  const a = t.articleStyle
  const ids = useId()
  const style = useDraft<ArticleStyle>(view.style, sameArticleStyle)
  const { draft, setDraft } = style
  // The call to action: the saved one, or (never saved) a suggestion from the business details, off.
  const suggestion = useMemo(
    () => suggestArticleCta({ business: subject?.business, niche: subject?.niche, domain: view.domain, contactUrl: view.contactUrl }, a.cta.suggestion),
    [subject?.business, subject?.niche, view.domain, view.contactUrl, a.cta.suggestion],
  )
  const ctaBase = view.ctaSaved ? view.cta : suggestion
  const ctaDraft = useDraft<ArticleCta>(ctaBase, sameArticleCta)
  const cta = ctaDraft.draft
  const [ctaErrors, setCtaErrors] = useState<CtaField[]>([])
  const ctaLocked = !view.ctaEditable
  const dirty = style.dirty || (!ctaLocked && ctaDraft.dirty)
  const discard = () => { style.discard(); ctaDraft.discard(); setCtaErrors([]) }
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [hexInput, setHexInput] = useState('')
  const [hexError, setHexError] = useState<string | null>(null)
  const locked = !view.editable
  const imagesOff = draft.ownImagesOnly

  const edit = (update: Partial<ArticleStyle>) => {
    setDraft((d) => ({ ...d, ...update }))
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }
  const editCta = (update: Partial<ArticleCta>) => {
    ctaDraft.setDraft((d) => ({ ...d, ...update }))
    setCtaErrors((e) => e.filter((f) => !(f in update)))
    if (state.kind !== 'saving') setState({ kind: 'idle' })
  }

  function addColor(value: string) {
    const hex = normalizeHex(value)
    if (!hex) { setHexError(a.colors.invalid); return }
    if (draft.brandColors.length >= MAX_BRAND_COLORS) { setHexError(a.colors.full); return }
    setHexError(null)
    if (!draft.brandColors.includes(hex)) edit({ brandColors: [...draft.brandColors, hex] })
    setHexInput('')
  }
  const removeColor = (hex: string) => edit({ brandColors: draft.brandColors.filter((c) => c !== hex) })
  const makeMain = (hex: string) => edit({ brandColors: [hex, ...draft.brandColors.filter((c) => c !== hex)] })

  async function save() {
    setState({ kind: 'saving' })
    const res = await saveArticleStyleAction(projectId, ctaLocked ? draft : { ...draft, cta }).catch(() => null)
    if (!res || !res.ok) {
      if (res && !res.ok && res.code === 'invalid_cta' && 'invalid' in res) {
        setCtaErrors(res.invalid)
        setState({ kind: 'error', code: 'invalid_request' })
        return
      }
      setState({ kind: 'error', code: res && !res.ok ? res.code : 'save_failed' })
      return
    }
    style.commit(res.data.style)
    if (res.data.ctaSaved) ctaDraft.commit(res.data.cta)
    setCtaErrors([])
    onData(res.data)
    setState({ kind: 'saved' })
  }

  const platformNote = view.platform === 'wix' ? a.wixNote : null
  const sampled = signals.status === 'ready' ? signals.colors : []

  return (
    <SettingsCard
      id={SECTION.articleDesign}
      icon={Palette}
      title={a.title}
      description={a.body}
      footer={!locked && showSaveBar(dirty, state) ? (
        <SaveBar dirty={dirty} state={state} onSave={() => void save()} onDiscard={() => { discard(); setState({ kind: 'idle' }) }} t={t} note={ctaErrors.length ? a.cta.errors[ctaErrors[0]!] : null} />
      ) : undefined}
    >
      <div className="space-y-5">
        {locked && <Notice tone="info">{a.readOnly}</Notice>}
        {platformNote && <Notice tone="info">{platformNote}</Notice>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-8">
          <fieldset disabled={locked} className="min-w-0 space-y-7">
            {/* Brand colours */}
            <section aria-labelledby={`${ids}-colors`} className="space-y-3">
              <div>
                <h3 id={`${ids}-colors`} className="text-copy font-semibold text-ink">{a.colors.label}</h3>
                <p className="mt-0.5 text-caption text-muted">{a.colors.hint}</p>
              </div>
              {draft.brandColors.length ? (
                <ul className="flex flex-wrap gap-2" data-brand-colors="">
                  {draft.brandColors.map((hex, i) => (
                    <li key={hex} className="inline-flex h-10 items-center gap-2 rounded-pill border border-line bg-surface ps-1 pe-1.5 shadow-control">
                      <span aria-hidden className="size-8 rounded-pill ring-1 ring-inset ring-ink/10" style={{ backgroundColor: hex }} />
                      <span dir="ltr" className="text-caption font-semibold tabular-nums text-ink">{hex.toUpperCase()}</span>
                      {i === 0 ? (
                        <span className="rounded-pill bg-action-soft px-2 py-0.5 text-caption font-semibold text-action">{a.colors.main}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makeMain(hex)}
                          aria-label={fill(a.colors.makeMain, { hex })}
                          title={fill(a.colors.makeMain, { hex })}
                          className="grid size-7 place-items-center rounded-pill text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                        >
                          <Star aria-hidden className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeColor(hex)}
                        aria-label={fill(a.colors.remove, { hex })}
                        title={fill(a.colors.remove, { hex })}
                        className="grid size-7 place-items-center rounded-pill text-muted transition-colors duration-150 ease-snappy hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted">{a.colors.empty}</p>
              )}

              <div className="flex flex-wrap items-start gap-2">
                <label className="relative grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-control border border-line bg-surface shadow-control hover:border-line-strong">
                  <span className="sr-only">{a.colors.pick}</span>
                  <span aria-hidden className="size-6 rounded-pill ring-1 ring-inset ring-ink/10" style={{ backgroundColor: normalizeHex(hexInput) ?? draft.brandColors[0] ?? '#2f5bd3' }} />
                  <input
                    type="color"
                    value={normalizeHex(hexInput) ?? draft.brandColors[0] ?? '#2f5bd3'}
                    onChange={(e) => { setHexInput(e.target.value); setHexError(null) }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                <div className="min-w-0 flex-1 basis-40">
                  <label htmlFor={`${ids}-hex`} className="sr-only">{a.colors.addLabel}</label>
                  <input
                    id={`${ids}-hex`}
                    dir="ltr"
                    value={hexInput}
                    onChange={(e) => { setHexInput(e.target.value); setHexError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(hexInput) } }}
                    placeholder={a.colors.placeholder}
                    maxLength={7}
                    aria-invalid={!!hexError}
                    aria-describedby={hexError ? `${ids}-hex-error` : undefined}
                    className={cn(fieldClass, 'h-10 text-left! [direction:ltr]! tabular-nums', hexError && 'border-bad')}
                  />
                  {hexError && <p id={`${ids}-hex-error`} role="alert" className="mt-1 text-caption text-bad">{hexError}</p>}
                </div>
                <Button type="button" variant="secondary" className="h-10" onClick={() => addColor(hexInput)} disabled={!hexInput.trim() || draft.brandColors.length >= MAX_BRAND_COLORS}>
                  <Plus aria-hidden className="size-4" /> {a.colors.add}
                </Button>
              </div>

              {view.domain && (
                <div className="rounded-inset border border-line bg-sunk/50 p-3 sm:p-4" data-site-colors={signals.status}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-caption font-semibold text-ink">{a.colors.fromSite}</p>
                      {sampled.length > 0 && <p className="text-caption text-muted">{a.colors.fromSiteHint}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={onReadSite} loading={signals.status === 'reading'}>
                      <RefreshCw aria-hidden className="size-4" /> {signals.status === 'reading' ? a.colors.sampling : a.colors.sample}
                    </Button>
                  </div>
                  {sampled.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {sampled.map((c) => {
                        const added = draft.brandColors.includes(c.hex)
                        return (
                          <li key={c.hex}>
                            <button
                              type="button"
                              onClick={() => addColor(c.hex)}
                              disabled={added || draft.brandColors.length >= MAX_BRAND_COLORS}
                              aria-pressed={added}
                              className="inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-surface ps-1 pe-3 text-caption font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 disabled:cursor-default disabled:opacity-70"
                            >
                              <span aria-hidden className="size-7 rounded-pill ring-1 ring-inset ring-ink/10" style={{ backgroundColor: c.hex }} />
                              <span dir="ltr" className="tabular-nums">{c.hex.toUpperCase()}</span>
                              {added ? <Check aria-hidden className="size-4 text-ok" /> : <Plus aria-hidden className="size-4 text-muted" />}
                              {added && <span className="sr-only">{a.colors.added}</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {signals.status === 'ready' && sampled.length === 0 && <p className="mt-2 text-caption text-muted">{a.colors.sampledNone}</p>}
                  {signals.status === 'failed' && <p className="mt-2 text-caption text-muted">{a.colors.sampleFailed}</p>}
                </div>
              )}
            </section>

            {/* Layout */}
            <section aria-labelledby={`${ids}-design`} className="space-y-3">
              <h3 id={`${ids}-design`} className="text-copy font-semibold text-ink">{a.design.label}</h3>
              <div role="radiogroup" aria-labelledby={`${ids}-design`} className="grid grid-cols-2 gap-3">
                {ARTICLE_DESIGNS.map((d) => {
                  const on = draft.design === d
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-design={d}
                      onClick={() => edit({ design: d })}
                      className={cn(TILE, tileState(on), 'p-3')}
                    >
                      <Chosen on={on} />
                      <DesignThumb design={d} color={draft.brandColors[0] ?? '#2f5bd3'} />
                      <span className="mt-2.5 flex items-center gap-1.5 text-copy font-semibold text-ink">
                        <LayoutTemplate aria-hidden className="size-4 text-muted" /> {a.design[d].label}
                      </span>
                      <span className="mt-0.5 block text-caption text-muted">{a.design[d].hint}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Images */}
            <section aria-labelledby={`${ids}-images`} className="space-y-3">
              <div>
                <h3 id={`${ids}-images`} className="text-copy font-semibold text-ink">{a.images.label}</h3>
                <p className="mt-0.5 text-caption text-muted">{a.images.hint}</p>
              </div>
              <div role="radiogroup" aria-labelledby={`${ids}-images`} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {IMAGE_STYLES.map((s) => {
                  const on = draft.imageStyle === s
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-image-style={s}
                      disabled={imagesOff}
                      onClick={() => edit({ imageStyle: s })}
                      className={cn(TILE, tileState(on && !imagesOff), 'overflow-hidden')}
                    >
                      <Chosen on={on && !imagesOff} />
                      <ImageStyleArt style={s} colors={draft.brandColors} className="block aspect-video w-full" />
                      <span className="block px-3 pb-2.5 pt-2">
                        <span className="block text-caption font-semibold text-ink">{a.images.styles[s].label}</span>
                        <span className="line-clamp-2 min-h-[2lh] text-caption text-muted">{a.images.styles[s].hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p id={`${ids}-hero`} className="text-caption font-semibold text-ink">{a.hero.label}</p>
                  <Segmented<HeroRatio>
                    ariaLabel={a.hero.label}
                    fill
                    value={draft.heroRatio}
                    onChange={(v) => edit({ heroRatio: v })}
                    options={[
                      { value: '16:9', label: a.hero.wide, icon: RectangleHorizontal, disabled: imagesOff || locked },
                      { value: '1:1', label: a.hero.square, icon: Square, disabled: imagesOff || locked },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold text-ink">{a.inline.label}</p>
                  <Segmented<string>
                    ariaLabel={a.inline.label}
                    fill
                    value={String(imagesOff ? 0 : draft.inlineImages)}
                    onChange={(v) => edit({ inlineImages: Number(v) })}
                    options={Array.from({ length: MAX_INLINE_IMAGES + 1 }, (_, n) => ({
                      value: String(n),
                      label: n === 0 ? a.inline.none : String(n),
                      disabled: imagesOff || locked,
                    }))}
                  />
                </div>
              </div>
              <p className="text-caption text-muted">{a.inline.hint}</p>

              <div className="rounded-inset border border-line p-3 sm:p-4">
                <Switch
                  checked={draft.ownImagesOnly}
                  onChange={(v) => edit({ ownImagesOnly: v })}
                  disabled={locked}
                  label={a.own.label}
                  description={a.own.hint}
                />
              </div>
            </section>

            {/* The project's own call to action (off until turned on) */}
            <section aria-labelledby={`${ids}-cta`} className="space-y-3" data-cta-section={cta.enabled ? 'on' : 'off'}>
              <div className="flex items-start gap-2">
                <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <h3 id={`${ids}-cta`} className="text-copy font-semibold text-ink">{a.cta.label}</h3>
                  {/* "Off until you turn it on" only while it is off: once on, the sentence would contradict the switch. */}
                  <p className="mt-0.5 text-caption text-muted">{cta.enabled ? a.cta.hint : `${a.cta.hint} ${a.cta.hintOff}`}</p>
                </div>
              </div>
              {ctaLocked && !locked && <Notice tone="info">{a.cta.readOnly}</Notice>}
              {view.platform === 'wix' && <Notice tone="info">{a.cta.platformNote}</Notice>}
              <div className="rounded-inset border border-line p-3 sm:p-4">
                <Switch
                  checked={cta.enabled}
                  onChange={(v) => editCta({ enabled: v })}
                  disabled={locked || ctaLocked}
                  label={a.cta.toggle}
                  description={a.cta.toggleHint}
                  data-cta-toggle=""
                />
              </div>
              <fieldset disabled={locked || ctaLocked} className="grid gap-3 sm:grid-cols-2" data-cta-fields="">
                {!view.ctaSaved && !ctaLocked && <p className="text-caption text-muted sm:col-span-2">{a.cta.suggested}</p>}
                <div className="sm:col-span-2">
                  <Input
                    id={`${ids}-cta-heading`}
                    label={a.cta.heading}
                    value={cta.heading}
                    maxLength={CTA_LIMITS.heading}
                    onChange={(e) => editCta({ heading: e.target.value })}
                    error={ctaErrors.includes('heading') ? a.cta.errors.heading : undefined}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id={`${ids}-cta-text`}
                    label={a.cta.text}
                    value={cta.text}
                    maxLength={CTA_LIMITS.text}
                    onChange={(e) => editCta({ text: e.target.value })}
                    error={ctaErrors.includes('text') ? a.cta.errors.text : undefined}
                  />
                </div>
                <Input
                  id={`${ids}-cta-label`}
                  label={a.cta.buttonLabel}
                  value={cta.buttonLabel}
                  maxLength={CTA_LIMITS.buttonLabel}
                  onChange={(e) => editCta({ buttonLabel: e.target.value })}
                  error={ctaErrors.includes('buttonLabel') ? a.cta.errors.buttonLabel : undefined}
                />
                <Input
                  id={`${ids}-cta-url`}
                  type="url"
                  label={a.cta.buttonUrl}
                  value={cta.buttonUrl}
                  inputMode="url"
                  maxLength={CTA_LIMITS.buttonUrl}
                 
                  onChange={(e) => editCta({ buttonUrl: e.target.value })}
                  hint={a.cta.urlHint}
                  error={ctaErrors.includes('buttonUrl') ? a.cta.errors.buttonUrl : undefined}
                />
              </fieldset>
            </section>
          </fieldset>

          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-overline font-semibold uppercase tracking-wide text-muted">{a.preview.label}</p>
            <ArticleStylePreview style={draft} cta={isCompleteCta(cta) ? cta : null} platform={view.platform} domain={view.domain} t={a} locale={locale} subject={subject} />
            <p className="mt-2 text-caption text-muted">{a.preview.caption}</p>
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}
