'use client'

/**
 * Phase 4D — read-only article body PREVIEW with inline images composed in.
 *
 * The editable TipTap surface (ArticleContentEditor) has no image node and must
 * stay image-free so stored content_html is never mutated. This component shows,
 * beside it, what the published body will look like: it composes the inline-image
 * <figure>s into a COPY of the current body via injectInlineImages(..., 'preview')
 * and renders it read-only. content_html itself is untouched; composition is
 * idempotent, so re-rendering on any image change never duplicates a figure.
 *
 * Uses the pure client-safe compose module (no server deps). The body HTML is
 * already sanitized on save and the figure markup is escaped in figureHtml, so
 * no re-sanitization is needed here.
 */

import { useMemo } from 'react'
import { injectInlineImages, type ComposableInlineImage } from '@/lib/content/inline-images-compose'

export default function ArticleBodyPreview({
  html,
  images,
  dir = 'rtl',
  label,
  emptyHint,
}: {
  html: string
  images: ComposableInlineImage[]
  dir?: 'rtl' | 'ltr'
  label: string
  emptyHint?: string
}) {
  // 'preview' mode: uses the WordPress URL when present, else the temporary
  // storage URL — so a freshly generated/replaced image shows before publish.
  const composed = useMemo(() => injectInlineImages(html || '', images || [], 'preview'), [html, images])

  return (
    <div>
      <div className="text-caption font-medium text-muted mb-2">{label}</div>
      {composed.trim() ? (
        <div
          dir={dir}
          className="article-content max-w-none rounded-control border border-line bg-surface px-3 py-2 text-ink max-h-[70vh] overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: composed }}
        />
      ) : (
        <p className="text-caption text-muted">{emptyHint || '—'}</p>
      )}
    </div>
  )
}
