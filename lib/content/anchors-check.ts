/**
 * Live anchor placement validation (content module, Phase 3A).
 *
 * Given a topic's anchors and an article's content HTML, determines which
 * anchors are actually present as links. Computed on demand (never persisted)
 * so it always reflects the current content. Required anchors that are missing
 * block "mark as ready".
 */

import type { ArticleTopicAnchor } from '@/lib/supabase/types'

export interface AnchorPlacement {
  anchorText: string
  targetUrl: string
  required: boolean
  type: 'internal' | 'external'
  placed: boolean
}

export interface AnchorValidation {
  anchorsPlaced: AnchorPlacement[]
  missingRequired: AnchorPlacement[]
  hasBlockingIssues: boolean
}

/** Normalize a URL for comparison: lowercase, drop protocol + trailing slash. */
function normUrl(url: string): string {
  return (url || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

/** Extract all href values from HTML. */
function extractHrefs(html: string): string[] {
  const out: string[] = []
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html || '')) !== null) out.push(m[1])
  return out
}

/**
 * Validate anchor placement of a topic's anchors against article content.
 * An anchor with an empty target_url is considered "placed" if its anchor_text
 * appears in the content (best-effort), otherwise placement is by href match.
 */
export function validateAnchorPlacement(
  anchors: ArticleTopicAnchor[] | null | undefined,
  contentHtml: string
): AnchorValidation {
  const list = Array.isArray(anchors) ? anchors : []
  const hrefs = extractHrefs(contentHtml).map(normUrl)
  const textLower = (contentHtml || '').toLowerCase()

  const anchorsPlaced: AnchorPlacement[] = list
    .filter((a) => a.anchor_text?.trim() || a.target_url?.trim())
    .map((a) => {
      const target = normUrl(a.target_url)
      let placed = false
      if (target) {
        placed = hrefs.some((h) => h === target || h.startsWith(target) || target.startsWith(h))
      } else if (a.anchor_text?.trim()) {
        placed = textLower.includes(a.anchor_text.trim().toLowerCase())
      }
      return {
        anchorText: a.anchor_text || '',
        targetUrl: a.target_url || '',
        required: a.required === true,
        type: a.type === 'external' ? 'external' : 'internal',
        placed,
      }
    })

  const missingRequired = anchorsPlaced.filter((a) => a.required && !a.placed)
  return {
    anchorsPlaced,
    missingRequired,
    hasBlockingIssues: missingRequired.length > 0,
  }
}
