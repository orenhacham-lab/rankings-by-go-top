'use client'

/**
 * "Write the first article": the research summary's one way to a first
 * article, and never an automatic one.
 *
 * It goes through the content module's own path, unchanged: the brief modal
 * in its reviewed-topic mode (one topic, this project, every field editable,
 * saved by POST /api/content/topics), then the one generate endpoint, which
 * applies the plan's article allowance and the billing rules exactly as the
 * Content tab does. The answer is read by its stable reason only
 * (firstArticleError); the route's own text is never shown.
 */
import { useRef, useState } from 'react'
import { Check, LoaderCircle, PenLine } from 'lucide-react'
import ArticleBriefModal from '@/components/content/ArticleBriefModal'
import Button from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { articleHref, BILLING_HREF } from '@/lib/onboarding/links'
import { firstArticleError, RETRYABLE_ARTICLE_ERRORS, type FirstArticleError } from '@/lib/onboarding/notices'
import { ActionLink } from './parts'

/** A generation that has not answered in three minutes is left to finish on its own, as the Content tab does. */
const GENERATE_TIMEOUT_MS = 180_000

type State = { kind: 'idle' } | { kind: 'writing' } | { kind: 'ready'; articleId: string } | { kind: 'error'; error: FirstArticleError }

export default function FirstArticleButton({
  projectId,
  projectName,
  businessName,
  articleLanguage,
  topic,
  primaryKeyword,
}: {
  projectId: string
  projectName: string
  businessName: string | null
  /** The site's own language, so the brief opens in it. */
  articleLanguage: string
  topic: string
  primaryKeyword: string | null
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).seedOnboarding.firstArticle
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [topicId, setTopicId] = useState<string | null>(null)
  const running = useRef(false)

  async function generate(id: string) {
    if (running.current) return
    running.current = true
    setState({ kind: 'writing' })
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    try {
      const res = await fetch('/api/content/articles/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topicId: id }),
        signal: controller.signal,
      })
      const body = (await res.json().catch(() => null)) as { articleId?: unknown } | null
      if (res.ok && typeof body?.articleId === 'string') setState({ kind: 'ready', articleId: body.articleId })
      else setState({ kind: 'error', error: firstArticleError(res.status, body) })
    } catch {
      setState({ kind: 'error', error: controller.signal.aborted ? 'timeout' : 'generic' })
    } finally {
      window.clearTimeout(timer)
      running.current = false
    }
  }

  const retryable = state.kind === 'error' && RETRYABLE_ARTICLE_ERRORS.includes(state.error)
  const needsPlan = state.kind === 'error' && (state.error === 'quota' || state.error === 'billing')

  return (
    <div className="mt-5 rounded-control border border-dashed border-line-strong p-4 sm:p-5" data-first-article={state.kind}>
      {state.kind === 'idle' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{t.hint}</p>
          <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
            <PenLine className="h-4 w-4" aria-hidden />
            {t.button}
          </Button>
        </div>
      )}

      {state.kind === 'writing' && (
        <div className="flex items-start gap-3" role="status">
          <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-action motion-reduce:animate-none" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">{t.writing}</p>
            <p className="mt-0.5 text-sm text-muted">{t.writingHint}</p>
          </div>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="animate-pop-in flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-ok">
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
            {t.ready}
          </p>
          <ActionLink href={articleHref(state.articleId)} className="shrink-0">
            {t.open}
          </ActionLink>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="animate-pop-in flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="alert" data-article-error={state.error}>
          <p className="text-sm leading-6 text-body">{t.errors[state.error]}</p>
          {retryable && topicId && (
            <Button variant="secondary" onClick={() => void generate(topicId)} className="shrink-0">
              {t.retry}
            </Button>
          )}
          {needsPlan && (
            <ActionLink href={BILLING_HREF} className="shrink-0">
              {getDashboardDictionary(language).seedOnboarding.actions.billing}
            </ActionLink>
          )}
        </div>
      )}

      <ArticleBriefModal
        open={open}
        onClose={() => setOpen(false)}
        projects={[{ id: projectId, name: projectName, language: articleLanguage, business_name: businessName }]}
        defaultProjectId={projectId}
        mode="gsc_reviewed_topic"
        prefill={{ topic, primaryKeyword: primaryKeyword ?? undefined }}
        onSaved={() => {}}
        onTopicsCreated={(topics) => {
          const id = topics[0]?.id
          if (!id) return
          setTopicId(id)
          // Not awaited: the modal closes now, and the writing shows here.
          void generate(id)
        }}
      />
    </div>
  )
}
