'use client'

import { useMemo } from 'react'
import { ImageOff } from 'lucide-react'
import type { ArticleCta } from '@/lib/content/article-style/cta'
import { designForSite } from '@/lib/content/article-style/render'
import { effectiveDesign, type ArticleStyle, type DesignPlatform } from '@/lib/content/article-style/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { fill } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import ImageStyleArt from './ImageStyleArt'

type Copy = DashboardDictionary['projectSettings']['articleStyle']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** What the sample is about: the project's own line of business and name, when known. */
export type PreviewSubject = { niche: string | null; business: string | null }

type SampleKey = 'title' | 'lead' | 'intro' | 'h1' | 'p1' | 'h2' | 'p2' | 'th1' | 'th2' | 'r1a' | 'r1b' | 'r2a' | 'r2b' | 'h3' | 'p3'
  | 'cta' | 'ctaLink' | 'faqTitle' | 'faqQ' | 'faqA'
/** The words the sample article is made of. */
export type SampleWords = Record<SampleKey, string>

/**
 * The sample's words: about the project's own line of business when it is known (review P2-4: a
 * plumber was shown an article about mattresses), the neutral sample otherwise.
 */
export function sampleCopy(p: Copy['preview'], subject?: PreviewSubject | null): SampleWords {
  const niche = subject?.niche?.trim().slice(0, 60) || ''
  if (!niche) return p
  const business = subject?.business?.trim().slice(0, 60) || ''
  const n = p.forNiche
  const put = (s: string) => fill(s, { niche, business })
  return {
    ...p,
    title: put(n.title), lead: put(n.lead), intro: n.intro, h1: n.h1, p1: n.p1, h2: n.h2, p2: n.p2,
    th1: n.th1, th2: n.th2, r1a: n.r1a, r1b: n.r1b, r2a: n.r2a, r2b: n.r2b, h3: n.h3,
    // The business is named in the text itself (the sample no longer closes on a linked call to action).
    p3: business ? put(n.p3Business) : n.p3,
    cta: business ? put(n.cta) : n.ctaGeneric, faqQ: put(n.faqQ), faqA: n.faqA,
  }
}

/**
 * A short sample article in the dashboard's language, shaped the way the generator writes one.
 * It ends without a link, like a generated article: the sample used to close on "want help?
 * talk to us" with a link, which the design turns into a call-to-action box, so the preview
 * showed a box that published articles did not have (wave 8). The box now comes only from
 * the project's own call to action, drawn the same way here and on the site.
 */
export function sampleArticleHtml(p: SampleWords): string {
  return [
    `<p><strong>${esc(p.lead)}</strong></p>`,
    `<p>${esc(p.intro)}</p>`,
    `<h2 id="pv-s1">${esc(p.h1)}</h2><p>${esc(p.p1)}</p>`,
    `<h2 id="pv-s2">${esc(p.h2)}</h2><p>${esc(p.p2)}</p>`,
    `<table><thead><tr><th>${esc(p.th1)}</th><th>${esc(p.th2)}</th></tr></thead><tbody>`,
    `<tr><td>${esc(p.r1a)}</td><td>${esc(p.r1b)}</td></tr><tr><td>${esc(p.r2a)}</td><td>${esc(p.r2b)}</td></tr></tbody></table>`,
    `<h2 id="pv-s3">${esc(p.h3)}</h2><p>${esc(p.p3)}</p>`,
    `<h2 id="faq">${esc(p.faqTitle)}</h2><h3 id="faq-q-1">${esc(p.faqQ)}</h3><p>${esc(p.faqA)}</p>`,
  ].join('')
}

/**
 * The live preview beside the card's choices: a sample article drawn by the
 * same function that styles real articles on their way to the site
 * (designForSite, lib/content/article-style/render.ts), inside a neutral "site" frame, with the chosen image
 * style in the hero and the inline-image slots. What the owner sees here is
 * what the formatted design produces, not a mock-up of it.
 */
export default function ArticleStylePreview({
  style,
  platform,
  domain,
  t,
  locale,
  subject,
  cta,
}: {
  style: ArticleStyle
  /** The call to action as the owner is editing it; drawn only when it is on and complete. */
  cta?: ArticleCta | null
  platform: DesignPlatform
  domain: string | null
  t: Copy
  locale: Locale
  subject?: PreviewSubject | null
}) {
  const language = locale === 'he' ? 'he' : 'en'
  const design = effectiveDesign(style, platform)
  const words = useMemo(() => sampleCopy(t.preview, subject), [t.preview, subject])
  const html = useMemo(
    () => designForSite(sampleArticleHtml(words), { style, cta, platform, language }),
    [words, style, cta, platform, language],
  )

  // The inline images sit after the first paragraph of a section, like the real composer.
  const images = style.ownImagesOnly ? 0 : style.inlineImages
  const shown = Math.min(images, 2)
  const parts = useMemo(() => {
    const cuts: number[] = []
    for (const id of ['pv-s2', 'pv-s3'].slice(0, shown)) {
      const at = html.indexOf(`id="${id}"`)
      const end = at >= 0 ? html.indexOf('</p>', at) : -1
      if (end >= 0) cuts.push(end + 4)
    }
    const out: string[] = []
    let from = 0
    for (const c of cuts) { out.push(html.slice(from, c)); from = c }
    out.push(html.slice(from))
    return out
  }, [html, shown])

  const heroSquare = style.heroRatio === '1:1'
  const art = (label: string, square: boolean, className?: string) => (
    <figure className={cn('m-0', className)} aria-label={label}>
      <ImageStyleArt style={style.imageStyle} colors={style.brandColors} className={cn('block w-full rounded-inset', square ? 'aspect-square' : 'aspect-video')} />
    </figure>
  )

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card" data-article-preview={design}>
      <div className="flex items-center gap-2 border-b border-line bg-sunk px-3 py-2">
        <span aria-hidden className="flex gap-1">
          <span className="size-2 rounded-pill bg-line-strong" />
          <span className="size-2 rounded-pill bg-line-strong" />
          <span className="size-2 rounded-pill bg-line-strong" />
        </span>
        <span dir="ltr" className="min-w-0 flex-1 truncate rounded-pill bg-surface px-3 py-0.5 text-center text-caption text-muted">
          {domain || t.preview.domain}
        </span>
      </div>
      <div dir={locale === 'he' ? 'rtl' : 'ltr'} className="max-h-[36rem] overflow-y-auto px-4 py-5 sm:px-5">
        <h3 className="mb-3 text-section font-bold leading-snug text-ink">{words.title}</h3>
        {style.ownImagesOnly ? (
          <div className="mb-4 flex aspect-video items-center justify-center gap-2 rounded-inset border border-dashed border-line-strong bg-sunk text-caption text-muted">
            <ImageOff aria-hidden className="size-4" /> {t.preview.noImages}
          </div>
        ) : (
          art(t.preview.hero, heroSquare, cn('mb-4', heroSquare && 'mx-auto max-w-[60%]'))
        )}
        {parts.map((part, i) => (
          <div key={i}>
            <div className="article-content text-copy" dangerouslySetInnerHTML={{ __html: part }} />
            {i < parts.length - 1 && art(t.preview.inline, false, 'my-4')}
          </div>
        ))}
        {images > shown && (
          <p className="mt-2 text-caption text-muted">{fill(t.preview.more, { n: images - shown })}</p>
        )}
      </div>
    </div>
  )
}
