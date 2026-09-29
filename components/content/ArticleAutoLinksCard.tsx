'use client'

/**
 * The internal links the automatic step added to this article (wave 8,
 * lib/content/auto-internal-links): a short list beside the article, each
 * with the page it leads to, the words it sits on, and a remove button. No
 * separate approval: approving the article approves them; removing one takes
 * the link out (its words stay) right away, on the server and in the open
 * editor alike.
 *
 * Shown only while the article has automatic links still in its body.
 */
import { useState } from 'react'
import { Link2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { autoLinksShown, markAutoRemoved } from '@/lib/content/auto-internal-links/entries'
import { removeLink } from '@/lib/link-network/anchor'

export type AutoLinksDict = {
  title: string
  hint: string
  count: string
  anchor: string
  remove: string
  removeLabel: string
  removed: string
  removeFailed: string
  publishedNote: string
}

export default function ArticleAutoLinksCard({ t, articleId, linksJson, html, isPublished, onRemoved, onNotify }: {
  t: AutoLinksDict
  articleId: string
  linksJson: unknown
  html: string
  isPublished: boolean
  /** The body without the link and the stored entries after the removal. */
  onRemoved: (next: { html: string; linksJson: unknown }) => void
  onNotify: (text: string, ok: boolean) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const links = autoLinksShown(linksJson, html)
  if (links.length === 0) return null

  async function remove(url: string) {
    if (busy) return
    setBusy(url)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/internal-links?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
      if (!res.ok) { onNotify(t.removeFailed, false); return }
      onRemoved({ html: removeLink(html, url) ?? html, linksJson: markAutoRemoved(linksJson, url) })
      onNotify(t.removed, true)
    } catch {
      onNotify(t.removeFailed, false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-auto-links="">
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Link2 aria-hidden="true" className="size-4 shrink-0 text-action" />
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <span className="ms-auto text-caption text-muted">{t.count.replace('{n}', String(links.length))}</span>
      </div>
      <p className="mb-3 text-caption text-muted">{t.hint}</p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.url} data-auto-link={l.url} className="flex items-start gap-2 rounded-control border border-line bg-sunk/40 px-3 py-2">
            <div className="min-w-0 flex-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-copy font-medium text-ink hover:text-action hover:underline" title={l.title}>
                {l.title}
              </a>
              <p className="truncate text-caption text-muted">{t.anchor.replace('{anchor}', l.anchor)}</p>
            </div>
            <button
              type="button"
              onClick={() => void remove(l.url)}
              disabled={busy !== null}
              aria-label={t.removeLabel.replace('{title}', l.title)}
              data-auto-link-remove=""
              className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-caption font-semibold text-muted transition-colors duration-150 hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 disabled:opacity-50 motion-reduce:transition-none"
            >
              <X aria-hidden="true" className="size-3.5" />
              {t.remove}
            </button>
          </li>
        ))}
      </ul>
      {isPublished && <p className="mt-3 text-caption text-muted">{t.publishedNote}</p>}
    </Card>
    </div>
  )
}
