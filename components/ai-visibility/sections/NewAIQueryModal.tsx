'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Notice from '@/components/ui/Notice'
import Textarea from '@/components/ui/Textarea'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { PromptRow, T } from './types'

/**
 * Manual "new AI query" modal. Supports both single and multi-question entry:
 * each non-empty line is sent as a separate query. Duplicates (within the input
 * or against existing prompts) are skipped client-side; the API also dedups.
 */
export function NewAIQueryModal({
  open,
  onClose,
  projectId,
  domain,
  businessName,
  country,
  language,
  existingPrompts,
  onAdded,
  t,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  domain: string | null
  businessName: string | null
  country: string | null
  language: string | null
  existingPrompts: PromptRow[]
  onAdded: () => void
  t: T
}) {
  const { language: dashboardLanguage } = useDashboardLanguage()
  const [prompt, setPrompt] = useState('')
  const [targetDomain, setTargetDomain] = useState(domain || '')
  const [targetBrand, setTargetBrand] = useState(businessName || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingSet = useMemo(
    () => new Set(existingPrompts.map((p) => (p.prompt || '').trim().toLowerCase())),
    [existingPrompts]
  )

  // Parse the textarea into deduplicated, trimmed lines.
  const parsedQueries = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of prompt.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const key = line.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(line)
    }
    return out
  }, [prompt])

  const newQueries = useMemo(
    () => parsedQueries.filter((q) => !existingSet.has(q.toLowerCase())),
    [parsedQueries, existingSet]
  )
  const skippedDuplicates = parsedQueries.length - newQueries.length

  const handleSubmit = async () => {
    if (parsedQueries.length === 0) {
      setError(t('multi_query_help'))
      return
    }

    setSaving(true)
    setError(null)
    let failures = 0
    try {
      for (const q of parsedQueries) {
        try {
          const res = await fetch('/api/ai-visibility/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt: q,
              country,
              language,
              targetDomain: targetDomain || null,
              targetBrandName: targetBrand || null,
            }),
          })
          if (!res.ok) failures++
        } catch {
          failures++
        }
      }
      setPrompt('')
      setTargetDomain(domain || '')
      setTargetBrand(businessName || '')
      onAdded()
      onClose()
      if (failures > 0) {
        setError(`${failures} ${t('error')}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isHebrew = dashboardLanguage === 'he'

  const countText =
    parsedQueries.length === 0
      ? ''
      : parsedQueries.length === 1
      ? t('will_create_one_query')
      : t('will_create_n_queries').replace('{count}', String(newQueries.length))

  return (
    <Modal open={open} onClose={onClose} title={t('new_ai_query_title')} size="md">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && <Notice tone="bad">{error}</Notice>}

        <div className="space-y-1.5">
          <Textarea
            id="ai-new-query-text"
            label={t('query_label')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('multi_query_placeholder')}
            rows={6}
            disabled={saving}
          />
          <p className="text-caption text-muted">{t('multi_query_help')}</p>
          {countText && (
            <p className="text-caption font-medium text-ink">
              {countText}
              {skippedDuplicates > 0 && (
                <span className="font-normal text-muted">
                  {' '}
                  ({skippedDuplicates} {t('query_already_exists')})
                </span>
              )}
            </p>
          )}
        </div>

        <Input
          id="ai-new-query-domain"
          label={t('target_domain_label')}
          type="text"
          value={targetDomain}
          onChange={(e) => setTargetDomain(e.target.value)}
          placeholder={domain || t('target_domain_label')}
          disabled={saving}
        />

        <Input
          id="ai-new-query-brand"
          label={t('target_brand_label')}
          type="text"
          value={targetBrand}
          onChange={(e) => setTargetBrand(e.target.value)}
          placeholder={businessName || t('target_brand_label')}
          disabled={saving}
        />

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={parsedQueries.length === 0 || saving}>
            {t('create_query')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
