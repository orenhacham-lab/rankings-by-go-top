'use client'

/**
 * PromptSuggestions modal — smart suggested prompts with multi-select,
 * edit-before-save, and one-click add. Uses local templates (no LLM API).
 */

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { generatePromptSuggestions, PromptSuggestion } from '@/lib/ai-visibility/prompt-templates'

const INTENT_LABELS: Record<string, string> = {
  brand: 'Brand',
  comparison: 'Comparison',
  local: 'Local',
  transactional: 'Transactional',
  recommendation: 'Recommendation',
  informational: 'Informational',
}

const INTENT_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  brand: 'info',
  comparison: 'warning',
  local: 'success',
  transactional: 'warning',
  recommendation: 'info',
  informational: 'neutral',
}

export default function PromptSuggestions({
  open,
  onClose,
  projectId,
  businessName,
  domain,
  city,
  country,
  language,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  businessName: string | null
  domain: string | null
  city: string | null
  country: string | null
  language: string | null
  onAdded: () => void
}) {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>(() =>
    generatePromptSuggestions({ businessName, domain, city, country, language })
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCount = selectedIds.size

  const isHebrew = useMemo(() => (language || 'en').toLowerCase() === 'he', [language])

  function regenerate() {
    setSuggestions(generatePromptSuggestions({ businessName, domain, city, country, language }))
    setSelectedIds(new Set())
    setError(null)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEdit(id: string, current: string) {
    setEditingId(id)
    setEditValue(current)
  }

  function commitEdit() {
    if (!editingId) return
    setSuggestions((prev) =>
      prev.map((s) => (s.id === editingId ? { ...s, prompt: editValue.trim() || s.prompt } : s))
    )
    setEditingId(null)
    setEditValue('')
  }

  async function addOne(suggestion: PromptSuggestion) {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: suggestion.prompt,
          country,
          language,
          targetDomain: domain,
          targetBrandName: businessName,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // remove from list after add
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(suggestion.id)
        return next
      })
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add prompt')
    } finally {
      setSaving(false)
    }
  }

  async function addSelected() {
    setError(null)
    setSaving(true)
    const targets = suggestions.filter((s) => selectedIds.has(s.id))
    try {
      for (const s of targets) {
        const res = await fetch('/api/ai-visibility/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            prompt: s.prompt,
            country,
            language,
            targetDomain: domain,
            targetBrandName: businessName,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
      }
      // remove added ones
      setSuggestions((prev) => prev.filter((s) => !selectedIds.has(s.id)))
      setSelectedIds(new Set())
      onAdded()
      // close if all added
      if (suggestions.length === targets.length) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add selected prompts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="AI Prompt Suggestions" size="lg">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600">
            Smart suggestions tailored to your business. Select multiple, edit, or add one-by-one.
          </p>
          <button
            onClick={regenerate}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            type="button"
          >
            ↻ Regenerate
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {suggestions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="mb-3">All suggestions added.</div>
            <Button size="sm" variant="outline" onClick={regenerate}>
              Generate again
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {suggestions.map((s) => {
              const checked = selectedIds.has(s.id)
              const isEditing = editingId === s.id
              return (
                <div
                  key={s.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                    checked
                      ? 'border-blue-300 bg-blue-50/60'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(s.id)}
                    className="mt-1.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditValue('')
                          }
                        }}
                        autoFocus
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="text-sm font-medium text-slate-900 leading-snug">
                        {s.prompt}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant={INTENT_TONE[s.intent] || 'neutral'}>
                        {INTENT_LABELS[s.intent] || s.intent}
                      </Badge>
                      <button
                        onClick={() => startEdit(s.id, s.prompt)}
                        className="text-xs text-slate-500 hover:text-slate-700"
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addOne(s)}
                    disabled={saving}
                  >
                    Add
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-500">
            {selectedCount} selected{selectedCount > 0 ? ` of ${suggestions.length}` : ''}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button
              disabled={selectedCount === 0 || saving}
              loading={saving}
              onClick={addSelected}
            >
              Add {selectedCount > 0 ? `${selectedCount} selected` : 'selected'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
