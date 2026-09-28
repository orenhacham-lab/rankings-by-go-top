'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { PromptRow, T } from './types'

/**
 * Manual "+ שאלת AI חדשה" modal. Supports both single and multi-question entry:
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
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('query_label')}</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('multi_query_placeholder')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
            rows={6}
            disabled={saving}
          />
          <p className="text-xs text-slate-500 mt-1">{t('multi_query_help')}</p>
          {countText && (
            <p className="text-xs text-indigo-600 mt-1 font-medium">
              {countText}
              {skippedDuplicates > 0 && (
                <span className="text-slate-500 font-normal">
                  {' '}
                  ({skippedDuplicates} {t('query_already_exists')})
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('target_domain_label')}</label>
          <Input
            type="text"
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder={domain || t('target_domain_label')}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('target_brand_label')}</label>
          <Input
            type="text"
            value={targetBrand}
            onChange={(e) => setTargetBrand(e.target.value)}
            placeholder={businessName || t('target_brand_label')}
            disabled={saving}
          />
        </div>

        <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={parsedQueries.length === 0 || saving}
            className="flex-1"
          >
            {t('create_query')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
