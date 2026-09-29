'use client'

import Link from 'next/link'
import { Check, FileText, PenLine, Plus, Quote, Send, Wrench } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button, { buttonClasses } from '@/components/ui/Button'
import type { PromptSuggestion } from '@/lib/ai-visibility/prompt-templates'
import type { QuestionWorth } from '@/lib/ai-visibility/question-worth'
import type { QuestionArticleStatus } from '@/lib/ai-visibility/question-article'
import type { I18nKey, PromptRow, T } from './types'
import OverlapHint from '@/components/content/OverlapHint'
import type { OverlapPayload } from '@/lib/content/cannibalization/client'
import type { Locale } from '@/lib/i18n/locales'

/** The article action on a suggested question (content module on); null hides it. */
export type QuestionArticleAction = {
  status: QuestionArticleStatus
  busy: boolean
  failed: boolean
  onWrite: () => void
  /** The content strategy's topic list. */
  topicHref: string
  /** The article itself, once one was written. */
  articleHref: string | null
  /** The existing-content screen, for a page that already answers the question. */
  existingHref: string
  /**
   * What "write an article" found the site already covers (the cannibalization
   * check): the card offers improving that page, or writing the article anyway.
   */
  overlap?: { found: OverlapPayload; language: Locale; onWriteAnyway: () => void } | null
}

/** Why this question, in one plain line: what ties it to the business, and what the asker is about to do. */
export function worthReason(worth: QuestionWorth, t: T): string {
  const r = worth.why.relevance
  const first = r.kind === 'brand'
    ? t('worth_rel_brand')
    : r.kind === 'keyword'
      ? t('worth_rel_keyword').replace('{term}', r.term)
      : r.kind === 'gap'
        ? t('worth_rel_gap').replace('{term}', r.term)
        : t('worth_rel_business')
  const second = t(`worth_value_${worth.why.value}` as I18nKey)
  return `${first} · ${second}`
}

const STATUS_ICON = { topic: FileText, written: PenLine, published: Send, cited: Quote } as const

export function SmartQuestionCard({
  question,
  onAdd,
  t,
  isAlreadyTracked,
  article = null,
}: {
  question: PromptSuggestion
  onAdd: () => void
  t: T
  /** Unused by the card; kept so the caller's props stay as they were. */
  allPrompts?: PromptRow[]
  isAlreadyTracked?: boolean
  article?: QuestionArticleAction | null
}) {
  // Why this question, said once: the worth scorer's sentence when the question was
  // ranked, else the scorer's own sentence, else the template's reason.
  const chipLabel = (chip: string): string => t(chip as I18nKey) || chip
  const reasonLine = question.worth
    ? worthReason(question.worth, t)
    : ('valueReason' in question && question.valueReason) ||
      question.reason ||
      ('chips' in question && question.chips && question.chips.length > 0 ? question.chips.map(chipLabel).join(' · ') : '')
  const page = question.worth?.answeringPage ?? null
  const status = article?.status ?? 'none'
  const StatusIcon = status !== 'none' ? STATUS_ICON[status] : null

  return (
    <div className="flex flex-col gap-3 rounded-inset border border-line bg-surface p-4 transition-colors duration-150 ease-snappy hover:border-line-strong" data-question-card="">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 text-copy font-medium text-ink">{question.prompt}</p>
          {reasonLine && <p className="line-clamp-2 text-caption text-muted" data-question-reason="">{reasonLine}</p>}
        </div>
        {isAlreadyTracked ? (
          <Badge variant="success" className="shrink-0">
            <Check aria-hidden="true" className="size-3.5" />
            {t('already_tracked')}
          </Badge>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAdd}
            className="size-8 shrink-0 px-0"
            aria-label={t('add_question_label')}
            title={t('add_question_label')}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>

      {article && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3" data-question-article={status}>
          {StatusIcon ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ok">
                <StatusIcon aria-hidden="true" className="size-4" />
                {t(`qa_status_${status}` as I18nKey)}
              </span>
              <Link
                href={article.articleHref ?? article.topicHref}
                className="text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 rounded-control"
              >
                {article.articleHref ? t('qa_open_article') : t('qa_open_topic')}
              </Link>
            </>
          ) : page ? (
            <>
              <span className="min-w-0 flex-1 basis-40 truncate text-caption text-body" title={page.title}>
                {t('qa_page_answers').replace('{title}', page.title)}
              </span>
              <Link href={article.existingHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                <Wrench aria-hidden="true" className="size-4" />
                {t('qa_improve_page')}
              </Link>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={article.onWrite} loading={article.busy} disabled={article.busy}>
              {!article.busy && <PenLine aria-hidden="true" className="size-4" />}
              {t('qa_write_article')}
            </Button>
          )}
          {article.failed && <span role="alert" className="text-caption text-bad">{t('qa_write_failed')}</span>}
        </div>
      )}
      {article?.overlap && status === 'none' && !page && (
        <OverlapHint overlap={article.overlap.found} language={article.overlap.language} busy={article.busy} onCreateAnyway={article.overlap.onWriteAnyway} />
      )}
    </div>
  )
}
