'use client'

/**
 * The article as a reader sees it: the default view of /content/articles/[id].
 * Opening an article used to drop the owner straight into a form of inputs; the
 * form is still one click away ("edit article"), and the page keeps it mounted
 * so nothing it owns (inline images, link planning, unsaved edits) is lost.
 *
 * The body is the stored content_html, which is sanitized on every write, with
 * the inline-image figures composed into a COPY (the same composition
 * ArticleBodyPreview uses); content_html itself is never changed here.
 */

import { useMemo } from 'react'
import { Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { injectInlineImages, type ComposableInlineImage } from '@/lib/content/inline-images-compose'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type ReadDict = DashboardDictionary['contentHub']['editor']['readView']

export default function ArticleReadView({
  t, faqTitle, title, metaTitle, metaDescription, slug, publishedUrl, featuredImageUrl,
  html, images, faq, dir, onEdit,
}: {
  t: ReadDict
  faqTitle: string
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  publishedUrl: string | null
  featuredImageUrl: string | null
  html: string
  images: ComposableInlineImage[]
  faq: { question: string; answer: string }[]
  dir: 'rtl' | 'ltr'
  onEdit: () => void
}) {
  const composed = useMemo(() => injectInlineImages(html || '', images || [], 'preview'), [html, images])
  const answered = faq.filter((f) => f.question.trim())
  const snippetTitle = (metaTitle || title).trim()
  const snippetUrl = publishedUrl || (slug ? `/${slug}` : '')

  return (
    <Card className="mb-4">
      <section aria-labelledby="article-read-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="article-read-title" className="text-section font-semibold text-ink">{t.title}</h2>
          <p className="mt-0.5 text-caption text-muted">{t.subtitle}</p>
        </div>
        <Button onClick={onEdit} data-testid="article-edit">
          <Pencil aria-hidden="true" className="size-4" /> {t.edit}
        </Button>
      </div>

      {snippetTitle && (
        <section aria-label={t.googlePreview} className="mb-5 rounded-inset border border-line bg-sunk/40 p-4">
          <p className="text-overline font-semibold uppercase text-muted">{t.googlePreview}</p>
          <p className="mt-2 text-section font-medium text-action break-words">{snippetTitle}</p>
          {snippetUrl && <p dir="ltr" className="mt-0.5 truncate text-start text-caption text-ok">{snippetUrl}</p>}
          {metaDescription.trim() && <p className="mt-1 text-copy text-body">{metaDescription}</p>}
        </section>
      )}

      {featuredImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={featuredImageUrl} alt={title} className="mb-5 max-h-80 w-full rounded-inset border border-line object-cover" />
      )}

      {composed.trim() ? (
        <div dir={dir} className="article-content max-w-none text-ink" dangerouslySetInnerHTML={{ __html: composed }} />
      ) : (
        <p className="text-copy text-muted">{t.empty}</p>
      )}

      {answered.length > 0 && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="article-read-faq">
          <h3 id="article-read-faq" className="mb-3 text-section font-semibold text-ink">{faqTitle}</h3>
          <dl className="list-enter space-y-3">
            {answered.map((f, i) => (
              <div key={i} className="rounded-inset border border-line bg-sunk/40 p-4">
                <dt className="text-copy font-semibold text-ink">{f.question}</dt>
                {f.answer.trim() && <dd className="mt-1 text-copy text-body">{f.answer}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}
      </section>
    </Card>
  )
}
