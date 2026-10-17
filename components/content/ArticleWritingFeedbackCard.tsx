'use client'

/**
 * "What should change in the next articles?": a note the owner leaves while
 * reading an article, kept as a standing rule for every article the business
 * gets after it (lib/content/writing-guidance). This article is not rewritten.
 * The rules are listed, and can be deleted, in the settings' writing
 * guidelines, which the card links to.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Check, NotebookPen } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { addWritingRuleAction } from '@/app/(dashboard)/settings/writing-guidance-actions'
import { SECTION } from '@/components/settings/anchors'
import { bidiField } from '@/components/settings/copy'
import { GUIDANCE_LIMITS } from '@/lib/content/writing-guidance/guidance'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

export type WritingFeedbackDict = DashboardDictionary['contentHub']['editor']['writingFeedback']

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; duplicate: boolean } | { kind: 'error'; text: string }

export default function ArticleWritingFeedbackCard({ t, articleId, projectId }: { t: WritingFeedbackDict; articleId: string; projectId: string }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const saving = status.kind === 'saving'

  async function save() {
    if (saving || !text.trim()) return
    setStatus({ kind: 'saving' })
    try {
      const res = await addWritingRuleAction(articleId, text)
      if (res.ok) {
        setText('')
        setStatus({ kind: 'saved', duplicate: res.duplicate })
        return
      }
      setStatus({ kind: 'error', text: t.errors[res.code] ?? t.errors.save_failed })
    } catch {
      setStatus({ kind: 'error', text: t.errors.save_failed })
    }
  }

  return (
    <div data-writing-feedback="">
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <NotebookPen aria-hidden="true" className="size-4 shrink-0 text-action" />
          <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        </div>
        <p className="mb-3 text-caption text-muted">{t.body}</p>
        <label htmlFor={`writing-feedback-${articleId}`} className="sr-only">{t.label}</label>
        <textarea
          id={`writing-feedback-${articleId}`}
          rows={3}
          maxLength={GUIDANCE_LIMITS.rule}
          value={text}
          placeholder={t.placeholder}
          onChange={(e) => { setText(e.target.value); if (status.kind !== 'saving') setStatus({ kind: 'idle' }) }}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-copy text-ink shadow-control placeholder:text-muted focus:border-action focus:outline-none focus:ring-4 focus:ring-action/20"
          {...bidiField(text)}
        />
        <div className="mt-1 flex justify-end text-caption text-muted tabular-nums">
          {t.count.replace('{n}', String(text.length)).replace('{max}', String(GUIDANCE_LIMITS.rule))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/settings?projectId=${encodeURIComponent(projectId)}#${SECTION.writingGuidance}`}
            className="text-caption font-semibold text-action hover:underline"
          >
            {t.manage}
          </Link>
          <Button size="sm" onClick={() => void save()} disabled={!text.trim()} loading={saving} data-writing-feedback-save="">
            {saving ? t.saving : t.save}
          </Button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 text-caption">
          {status.kind === 'saved' && (
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Check aria-hidden className="size-4" />
              {status.duplicate ? t.duplicate : t.saved}
            </span>
          )}
          {status.kind === 'error' && <span role="alert" className="font-medium text-bad">{status.text}</span>}
        </p>
      </Card>
    </div>
  )
}
