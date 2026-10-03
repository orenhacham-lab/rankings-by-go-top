'use client'

import { ImageIcon, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GbpCtaType } from '@/lib/gbp/validate'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/**
 * The post as a customer meets it on the business profile in Google Maps: the
 * business line on top, the 4:3 photo, the text cut after a few lines with
 * "more", and the one button. Drawn on our tokens, not a copy of Google's UI.
 * `imageSrc` is the live crop (an object URL) or the prepared image.
 */
export default function PostPreview({ businessName, summary, imageSrc, imageStyle, ctaType }: {
  businessName: string | null
  summary: string
  imageSrc: string | null
  imageStyle?: React.CSSProperties
  ctaType: GbpCtaType | null
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).mapsPosts
  const name = businessName || t.preview.businessFallback
  const initial = Array.from(name.trim())[0] ?? ''
  const long = Array.from(summary.trim()).length > 220

  return (
    <figure aria-label={t.preview.title} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-action-soft text-section font-semibold text-action">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-copy font-semibold text-ink">{name}</p>
          <p className="flex items-center gap-1 text-caption text-muted">
            <MapPin aria-hidden="true" className="size-3.5" />
            <span>{t.preview.kind} · {t.preview.justNow}</span>
          </p>
        </div>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden bg-sunk">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL / storage URL, cropped live
          <img src={imageSrc} alt={t.composer.imageAlt} className={cn('absolute max-w-none select-none', !imageStyle && 'inset-0 size-full object-cover')} style={imageStyle} draggable={false} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <ImageIcon aria-hidden="true" className="size-6" />
            <span className="text-caption">{t.preview.imagePlaceholder}</span>
          </div>
        )}
      </div>

      <figcaption className="space-y-3 px-4 py-4">
        {summary.trim() ? (
          <p className={cn('whitespace-pre-line text-copy text-body', long && 'line-clamp-4')}>{summary.trim()}</p>
        ) : (
          <p className="text-copy text-muted">{t.preview.empty}</p>
        )}
        {long && <p className="text-caption font-semibold text-action">{t.preview.more}</p>}
        {ctaType && (
          <span className="inline-flex h-9 items-center rounded-pill border border-line-strong px-4 text-caption font-semibold text-action">
            {t.composer.ctaTypes[ctaType]}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
