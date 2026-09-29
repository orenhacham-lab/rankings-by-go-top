'use client'

/**
 * The article body as it will look on the site: the project's article design
 * (lib/content/article-style) applied to a COPY of the composed body, by the
 * same function WordPress and webhook publishing use. A Shopify or Wix project
 * shows the minimal design, because that is what its store receives.
 *
 * Until the settings answer (or when they cannot be read), the body shows as
 * it always did; content_html itself is never changed here.
 */
import { useEffect, useMemo, useState } from 'react'
import { loadArticleStyleAction } from '@/app/(dashboard)/settings/article-style-actions'
import { styleArticleHtml } from '@/lib/content/article-style/html'
import { effectiveDesign, type ArticleDesign } from '@/lib/content/article-style/types'
import { cn } from '@/lib/utils'

type Design = { design: ArticleDesign; colors: string[] }

/** One read per project per tab: the view re-renders on every edit. */
const cache = new Map<string, Promise<Design | null>>()

function loadDesign(projectId: string): Promise<Design | null> {
  let hit = cache.get(projectId)
  if (!hit) {
    hit = loadArticleStyleAction(projectId)
      .then((res) => (res.ok ? { design: effectiveDesign(res.data.style, res.data.platform), colors: res.data.style.brandColors } : null))
      .catch(() => null)
    cache.set(projectId, hit)
  }
  return hit
}

export default function StyledArticleBody({
  projectId,
  html,
  dir,
  className,
}: {
  projectId: string | null | undefined
  html: string
  dir: 'rtl' | 'ltr'
  className?: string
}) {
  const [design, setDesign] = useState<Design | null>(null)
  useEffect(() => {
    let live = true
    if (projectId) void loadDesign(projectId).then((d) => { if (live) setDesign(d) })
    return () => { live = false }
  }, [projectId])

  const body = useMemo(
    () => (design?.design === 'formatted' ? styleArticleHtml(html, { design: 'formatted', colors: design.colors, language: dir === 'rtl' ? 'he' : 'en' }) : html),
    [html, design, dir],
  )

  return (
    <div
      dir={dir}
      data-article-design={design?.design ?? 'minimal'}
      className={cn('article-content max-w-none text-ink', className)}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}
