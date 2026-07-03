'use client'

/**
 * ArticleBriefModal — create/edit a manual Article Brief / Topic (Phase 2A).
 *
 * NO generation. Persists to article_topics via /api/content/topics. Kept
 * prop-driven and routing-agnostic so the same form body can later be lifted
 * onto a full page (e.g. /content/topics/new) without a rewrite.
 */

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Trash2, Plus } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { ArticleTopic, ArticleTopicAnchor } from '@/lib/supabase/types'

type ProjectOption = { id: string; name: string }

const INTENT_KEYS = ['informational', 'commercial', 'local', 'comparison', 'transactional', 'other'] as const

function emptyAnchor(): ArticleTopicAnchor {
  return { anchor_text: '', target_url: '', required: false, type: 'internal', note: '' }
}

export default function ArticleBriefModal({
  open,
  onClose,
  projects,
  defaultProjectId,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  projects: ProjectOption[]
  defaultProjectId: string
  editing?: ArticleTopic | null
  onSaved: () => void
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).contentHub.brief
  const isHebrew = language === 'he'

  const [projectId, setProjectId] = useState(defaultProjectId)
  const [topic, setTopic] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [secondaryText, setSecondaryText] = useState('')
  const [searchIntent, setSearchIntent] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [briefLanguage, setBriefLanguage] = useState('')
  const [toneOfVoice, setToneOfVoice] = useState('')
  const [wordCount, setWordCount] = useState('')
  const [ctaPreference, setCtaPreference] = useState('')
  const [briefNotes, setBriefNotes] = useState('')
  const [anchors, setAnchors] = useState<ArticleTopicAnchor[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // (Re)initialize when the modal opens or the edited topic changes.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setProjectId(editing.project_id)
      setTopic(editing.topic ?? '')
      setPrimaryKeyword(editing.primary_keyword ?? '')
      setSecondaryText((editing.secondary_keywords ?? []).join('\n'))
      setSearchIntent(editing.search_intent ?? '')
      setTargetAudience(editing.target_audience ?? '')
      setBriefLanguage(editing.language ?? '')
      setToneOfVoice(editing.tone_of_voice ?? '')
      setWordCount(editing.desired_word_count ? String(editing.desired_word_count) : '')
      setCtaPreference(editing.cta_preference ?? '')
      setBriefNotes(editing.brief_notes ?? '')
      setAnchors(Array.isArray(editing.anchors_json) ? editing.anchors_json.map((a) => ({ ...emptyAnchor(), ...a })) : [])
    } else {
      setProjectId(defaultProjectId)
      setTopic(''); setPrimaryKeyword(''); setSecondaryText(''); setSearchIntent('')
      setTargetAudience(''); setBriefLanguage(''); setToneOfVoice(''); setWordCount('')
      setCtaPreference(''); setBriefNotes(''); setAnchors([])
    }
    setError(null)
  }, [open, editing, defaultProjectId])

  function updateAnchor(i: number, patch: Partial<ArticleTopicAnchor>) {
    setAnchors((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }

  async function handleSave() {
    if (!projectId) { setError(t.projectRequired); return }
    if (!topic.trim()) { setError(t.topicRequired); return }
    setSaving(true)
    setError(null)

    const secondary_keywords = secondaryText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)

    const payload = {
      projectId,
      topic: topic.trim(),
      primary_keyword: primaryKeyword,
      secondary_keywords,
      search_intent: searchIntent || null,
      target_audience: targetAudience,
      language: briefLanguage,
      tone_of_voice: toneOfVoice,
      desired_word_count: wordCount ? Number(wordCount) : null,
      cta_preference: ctaPreference,
      brief_notes: briefNotes,
      // Drop fully-empty anchor rows client-side too.
      anchors: anchors.filter((a) => a.anchor_text.trim() || a.target_url.trim()),
    }

    try {
      const res = editing
        ? await fetch(`/api/content/topics/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/content/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || t.genericError)
        return
      }
      onSaved()
      onClose()
    } catch {
      setError(t.genericError)
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <Modal open={open} onClose={onClose} title={editing ? t.editTitle : t.newTitle} size="xl">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.project}</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
              <option value="">{t.selectProject}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.searchIntent}</label>
            <select value={searchIntent} onChange={(e) => setSearchIntent(e.target.value)} className={inputCls}>
              <option value="">{t.selectIntent}</option>
              {INTENT_KEYS.map((k) => <option key={k} value={k}>{t.intents[k]}</option>)}
            </select>
          </div>
        </div>

        <Input label={t.topic} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPlaceholder} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t.primaryKeyword} value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} />
          <Input label={t.targetAudience} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.secondaryKeywords}</label>
          <textarea
            value={secondaryText}
            onChange={(e) => setSecondaryText(e.target.value)}
            rows={2}
            className={inputCls}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.secondaryHint}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label={t.language} value={briefLanguage} onChange={(e) => setBriefLanguage(e.target.value)} />
          <Input label={t.toneOfVoice} value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)} />
          <Input label={t.desiredWordCount} type="number" value={wordCount} onChange={(e) => setWordCount(e.target.value)} />
        </div>

        <Input label={t.ctaPreference} value={ctaPreference} onChange={(e) => setCtaPreference(e.target.value)} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.briefNotes}</label>
          <textarea
            value={briefNotes}
            onChange={(e) => setBriefNotes(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder={t.briefNotesPlaceholder}
          />
        </div>

        {/* Anchors editor */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.anchorsTitle}</h4>
            <Button size="sm" variant="outline" onClick={() => setAnchors((p) => [...p, emptyAnchor()])}>
              <Plus size={14} /> {t.addAnchor}
            </Button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t.anchorsHint}</p>

          <div className="space-y-3">
            {anchors.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input label={t.anchorText} value={a.anchor_text} onChange={(e) => updateAnchor(i, { anchor_text: e.target.value })} />
                  <Input label={t.targetUrl} type="url" value={a.target_url} onChange={(e) => updateAnchor(i, { target_url: e.target.value })} placeholder="https://" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select value={a.type} onChange={(e) => updateAnchor(i, { type: e.target.value as 'internal' | 'external' })} className={inputCls + ' max-w-[9rem]'}>
                    <option value="internal">{t.internal}</option>
                    <option value="external">{t.external}</option>
                  </select>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={a.required} onChange={(e) => updateAnchor(i, { required: e.target.checked })} />
                    {t.required}
                  </label>
                  <input
                    type="text"
                    value={a.note}
                    onChange={(e) => updateAnchor(i, { note: e.target.value })}
                    placeholder={t.note}
                    className={inputCls + ' flex-1 min-w-[8rem]'}
                  />
                  <button
                    type="button"
                    onClick={() => setAnchors((p) => p.filter((_, idx) => idx !== i))}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                    title={t.removeAnchor}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button onClick={handleSave} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
        </div>
      </div>
    </Modal>
  )
}
