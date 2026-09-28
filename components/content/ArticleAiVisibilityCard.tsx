'use client'

/**
 * AI visibility of a published article (content review C9, tiers 1 and 2).
 *
 *   1. "Cited in ChatGPT": shown ONLY for a citation row the project's own AI
 *      checks stored whose URL is this article's live URL. With none, the card
 *      says so plainly ("not found yet"), it never guesses.
 *   2. The article's question, from a template. Generating the article already
 *      tracks it (lib/ai-visibility/article-question.ts), so the card usually says
 *      "tracked"; when it is not tracked, "track" posts to the EXISTING prompt
 *      route. Running a check on it stays the existing, quota-checked action on
 *      the AI visibility screen.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, Plus, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { CitationMatch } from '@/lib/content/citation-match'

type AiDict = DashboardDictionary['contentHub']['editor']['aiVisibility']

export interface ArticleVisibilityData {
  publishedUrl: string | null
  citations: CitationMatch[]
  citationsAvailable: boolean
  aiVisibilityEnabled: boolean
  suggestion: null | {
    prompt: string
    tracked: boolean
    track: { country: string | null; language: string; targetDomain: string | null; targetBrandName: string | null }
  }
}

export const engineName = (t: AiDict, engine: string): string => t.engines[engine] ?? t.unknownEngine

/** The "cited" badge: one engine by name, several by count. Nothing without a stored citation. */
export function CitedBadge({ t, engines }: { t: AiDict; engines: string[] }) {
  const unique = [...new Set(engines)]
  if (unique.length === 0) return null
  const text = unique.length === 1 ? t.citedBadge.replace('{engine}', engineName(t, unique[0])) : t.citedManyBadge.replace('{n}', String(unique.length))
  return (
    <Badge variant="info" dot className="max-w-full" >
      <span data-testid="cited-badge" className="truncate" title={unique.map((e) => engineName(t, e)).join(', ')}>{text}</span>
    </Badge>
  )
}

export default function ArticleAiVisibilityCard({ t, language, projectId, data, onNotify, onTracked }: {
  t: AiDict
  language: 'he' | 'en'
  projectId: string | null
  data: ArticleVisibilityData
  onNotify: (text: string, ok: boolean) => void
  onTracked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const s = data.suggestion

  async function track() {
    if (!s || !projectId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: s.prompt,
          country: s.track.country,
          language: s.track.language,
          targetDomain: s.track.targetDomain,
          targetBrandName: s.track.targetBrandName,
        }),
      })
      if (res.ok) { onNotify(t.trackedToast, true); onTracked(); return }
      onNotify(t.trackFailed, false)
    } catch {
      onNotify(t.trackFailed, false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-action" />
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
      </div>

      {data.citations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-copy text-body">{t.citedIntro}</p>
          <ul className="space-y-2">
            {data.citations.map((c, i) => (
              <li key={`${c.engine}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-line bg-sunk/40 px-3 py-2">
                <Badge variant="info">{engineName(t, c.engine)}</Badge>
                <span className="min-w-0 flex-1 text-copy text-ink">
                  <span className="text-muted">{t.questionLabel}: </span>
                  {c.question ?? <span className="text-muted">{t.noQuestion}</span>}
                </span>
                {c.lastSeenAt && <span className="text-caption text-muted">{t.lastSeen} {formatDate(c.lastSeenAt, language)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-copy text-muted">{data.citationsAvailable ? t.notCitedYet : t.citationsUnavailable}</p>
      )}

      {s && data.aiVisibilityEnabled && (
        <div className="mt-4 rounded-inset border border-line bg-surface p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">{s.tracked ? t.trackedTitle : t.suggestionTitle}</p>
          <p className="mt-1 text-copy font-semibold text-ink" data-testid="ai-suggestion">{s.prompt}</p>
          <p className="mt-1 text-caption text-muted">{s.tracked ? t.trackedHint : t.suggestionHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {s.tracked ? (
              <Badge variant="success"><Check aria-hidden="true" className="size-3.5" /> {t.tracked}</Badge>
            ) : (
              <Button size="sm" onClick={() => void track()} loading={busy} disabled={busy || !projectId} data-testid="ai-suggestion-track">
                {!busy && <Plus aria-hidden="true" className="size-4" />} {busy ? t.tracking : t.track}
              </Button>
            )}
            {projectId && (
              <Link href={`/ai-visibility?projectId=${encodeURIComponent(projectId)}`} className="text-caption font-semibold text-action hover:underline">
                {t.openAiVisibility}
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
