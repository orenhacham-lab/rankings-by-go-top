'use client'

/**
 * The AI questions generated for one keyword: review, edit and choose which ones
 * go to the project's AI visibility tracking.
 *
 * The shared modal and primitives: the project named as a plain read-only line (it
 * is the one the top bar names), a select-all checkbox that also reads "some",
 * a count in words ("3 of 4 selected", never "selected 4 / 0"), one checkbox and
 * one single-line field per question that grows only as the text wraps, and one
 * primary action. Every word comes from the dictionary.
 */
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { GeneratedQuestion } from '@/lib/ai-questions/generate-questions'
import type { PublicLocale } from '@/lib/i18n/locales'

interface AIQuestionsModalProps {
  open: boolean
  onClose: () => void
  questions: GeneratedQuestion[]
  selectedProject: string
  projects: Array<{ id: string; name?: string | null }>
  uiLocale: PublicLocale
  isRTL: boolean
  onAddQuestions: (questions: GeneratedQuestion[]) => Promise<void>
  loading?: boolean
  successMessage?: string
}

export default function AIQuestionsModal({
  open,
  onClose,
  questions,
  selectedProject,
  projects,
  uiLocale,
  isRTL,
  onAddQuestions,
  loading = false,
  successMessage,
}: AIQuestionsModalProps) {
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set())
  const [editedQuestions, setEditedQuestions] = useState<Map<string, string>>(new Map())
  const t = getDashboardDictionary(uiLocale).keywordResearch.aiQuestions
  const n = (v: number) => formatCount(v, uiLocale)

  const toggleQuestion = (id: string) => {
    const next = new Set(selectedQuestions)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedQuestions(next)
  }

  const updateQuestion = (id: string, text: string) => {
    const next = new Map(editedQuestions)
    next.set(id, text)
    setEditedQuestions(next)
  }

  const allSelected = questions.length > 0 && selectedQuestions.size === questions.length
  const someSelected = selectedQuestions.size > 0 && !allSelected
  const setAll = (on: boolean) => setSelectedQuestions(on ? new Set(questions.map((_, i) => String(i))) : new Set())

  const getDisplayQuestion = (index: number, original: GeneratedQuestion) =>
    editedQuestions.has(String(index)) ? editedQuestions.get(String(index))! : original.question

  const handleAdd = async () => {
    if (!selectedProject || selectedQuestions.size === 0) return
    const toAdd = questions.filter((_, i) => selectedQuestions.has(String(i)))
    await onAddQuestions(toAdd)
  }

  if (!open) return null
  const projectName = projects.find((p) => p.id === selectedProject)?.name || ''

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="lg">
      <div data-ai-questions-modal="" className={cn('space-y-4', isRTL ? 'rtl' : 'ltr')}>
        <p className="max-w-prose text-copy text-muted">{t.subtitle}</p>

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASSES}>{t.project}</span>
          <p className="truncate rounded-control border border-line bg-sunk px-3 py-2 text-copy text-ink">{projectName}</p>
        </div>

        {successMessage && <Notice tone="ok">{successMessage}</Notice>}

        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={() => setAll(!allSelected)}
            label={t.selectAll}
            disabled={loading || questions.length === 0}
          />
          <span className="shrink-0 text-caption text-muted tabular-nums" aria-live="polite">
            {t.selectedCount(n(selectedQuestions.size), n(questions.length))}
          </span>
        </div>

        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {questions.map((question, idx) => {
            const id = String(idx)
            const on = selectedQuestions.has(id)
            return (
              <li
                key={idx}
                data-ai-question={idx}
                className={cn(
                  'flex items-start gap-3 rounded-inset border p-3 transition-colors duration-150 ease-snappy',
                  on ? 'border-action/30 bg-action-soft' : 'border-line bg-surface',
                )}
              >
                <span className="flex h-9 items-center">
                  <Checkbox checked={on} onChange={() => toggleQuestion(id)} aria-label={t.selectQuestion(idx + 1)} disabled={loading} />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <textarea
                    value={getDisplayQuestion(idx, question)}
                    onChange={(e) => updateQuestion(id, e.target.value)}
                    aria-label={t.question(idx + 1)}
                    rows={1}
                    disabled={loading}
                    className={cn(FIELD_CLASSES, 'block min-h-9 resize-none py-1.5 leading-6 [field-sizing:content]')}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{t.types[question.type] ?? question.type}</Badge>
                    <span className="min-w-0 truncate text-caption text-muted">{t.sourceKeyword(question.sourceKeyword)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
          {selectedQuestions.size === 0 && !successMessage && (
            <p className="text-caption text-muted sm:me-auto">{t.pickOne}</p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading}>{t.cancel}</Button>
          <Button onClick={handleAdd} loading={loading} disabled={!selectedProject || selectedQuestions.size === 0}>
            {selectedQuestions.size > 0 ? t.addCount(n(selectedQuestions.size)) : t.add}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
