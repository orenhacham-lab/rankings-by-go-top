'use client'

/**
 * "+ Add a keyword" on the content strategy board: one field, and the keyword becomes an
 * approved topic in "planned" (useIdeaActions.addKeyword, through the bulk topics route
 * with its own `source: 'keyword'`, whose dedupe and keyword guard run on the server).
 * No model is asked, so it costs nothing. This is also where "new topic" from anywhere
 * in the workspace lands (the board with `?add=keyword`).
 *
 * Before adding, the cannibalization check asks whether the site already has a page
 * on the keyword; when it does, the form offers improving that page first, and
 * "create it anyway" adds it. A failed check never stops the add.
 */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { KEYWORD_MAX } from '@/lib/content/strategy/ideas'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import OverlapHint from '@/components/content/OverlapHint'
import { fetchOverlap, type OverlapPayload } from '@/lib/content/cannibalization/client'
import type { PublicLocale } from '@/lib/i18n/locales'

type Dict = ReturnType<typeof getDashboardDictionary>

export function AddKeywordButton({ dict, open, onOpen }: { dict: Dict; open: boolean; onOpen: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onOpen} aria-expanded={open} data-add-keyword-toggle>
      <Plus aria-hidden="true" className="size-4" /> {dict.contentStrategy.ideaActions.addKeyword}
    </Button>
  )
}

export default function AddKeywordForm({ dict, onAdd, onClose, projectId = null, uiLocale = 'he' }: {
  dict: Dict
  onAdd: (keyword: string) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
  /** The project the cannibalization check runs for; without it, no check. */
  projectId?: string | null
  uiLocale?: PublicLocale
}) {
  const a = dict.contentStrategy.ideaActions
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // What the check found, for which value (a changed value is checked again).
  const [overlap, setOverlap] = useState<{ value: string; found: OverlapPayload } | null>(null)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    ref.current?.querySelector('input')?.focus()
  }, [])

  async function add(anyway: boolean) {
    if (saving) return
    setSaving(true)
    setError(null)
    if (!anyway && projectId && value.trim()) {
      const found = await fetchOverlap(projectId, value.trim(), value.trim())
      if (found) { setOverlap({ value, found }); setSaving(false); return }
    }
    setOverlap(null)
    const r = await onAdd(value)
    setSaving(false)
    if (r.ok) { setValue(''); onClose() } else if (r.error) setError(r.error)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void add(false)
  }
  const shownOverlap = overlap && overlap.value === value ? overlap.found : null

  return (
    <form ref={ref} onSubmit={submit} data-add-keyword-form
      className="mb-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <Input
            id={`${id}-keyword`}
            label={a.keywordLabel}
            placeholder={a.keywordPlaceholder}
            value={value}
            maxLength={KEYWORD_MAX}
            onChange={(e) => { setValue(e.target.value); if (error) setError(null) }}
            error={error ?? undefined}
            hint={a.keywordHint}
            autoComplete="off"
          />
        </div>
        <div className="flex shrink-0 gap-2 md:pt-[1.625rem]">
          <Button type="submit" loading={saving} disabled={saving || value.trim().length === 0}>{a.keywordSubmit}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{a.keywordCancel}</Button>
        </div>
      </div>
      {shownOverlap && <OverlapHint className="mt-3" overlap={shownOverlap} uiLocale={uiLocale} busy={saving} onCreateAnyway={() => void add(true)} />}
    </form>
  )
}
