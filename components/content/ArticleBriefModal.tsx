'use client'

/**
 * ArticleBriefModal — create/edit a manual Article Brief / Topic (Phase 2A UX).
 *
 * Simple-by-default: quick mode asks only for project + keyword + a topic.
 * "Suggest topics" calls Gemini (server) for SEO/GEO topic ideas; a template
 * fallback runs only if Gemini fails. Everything else has sensible defaults
 * under "Advanced settings". NO article generation.
 *
 * Multiple picked topics save as multiple article_topics (one POST each),
 * enriched per-topic from the Gemini suggestion when available.
 */

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Trash2, Plus, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SuggestionLanguage, SuggestionIntent } from '@/lib/content/topic-suggestions'
import type { GeminiTopicSuggestion } from '@/lib/content/gemini-topics'
import { encodeBriefNotes, decodeBriefNotes, encodeBriefSections, decodeBriefSections } from '@/lib/content/brief-notes'
import type { ArticleTopic, ArticleTopicAnchor } from '@/lib/supabase/types'

type ProjectOption = { id: string; name: string; language?: string | null; business_name?: string | null }

const INTENT_KEYS = ['informational', 'commercial', 'local', 'comparison', 'transactional', 'other'] as const
const TONE_KEYS = ['professional', 'marketing', 'casual', 'luxury', 'informative'] as const
const CTA_KEYS = ['gentle', 'none', 'contact', 'whatsapp', 'phone', 'marketing'] as const
// CTA types that let the user enter concrete contact details.
const CTA_WITH_DETAILS: readonly string[] = ['contact', 'whatsapp', 'phone', 'marketing']
const LENGTHS: { value: number; key: 'short' | 'standard' | 'deep' | 'guide' }[] = [
  { value: 500, key: 'short' },
  { value: 1000, key: 'standard' },
  { value: 1500, key: 'deep' },
  { value: 2000, key: 'guide' },
]

const DEFAULT_TONE = 'professional'
const DEFAULT_CTA = 'none'
const DEFAULT_INTENT: SuggestionIntent = 'informational'
const DEFAULT_WORD_COUNT = 1000

function normalizeLang(lang?: string | null): SuggestionLanguage {
  return (lang || '').toLowerCase().startsWith('en') ? 'en' : 'he'
}

// Map Gemini's English "angle" labels to Hebrew for the Hebrew UI. Anything
// unmapped that still contains Latin letters is hidden rather than shown in
// English inside a Hebrew interface.
const ANGLE_MAP_HE: Record<string, string> = {
  'buying guide': 'מדריך בחירה',
  'price/cost analysis': 'מחיר ועלויות',
  'price analysis': 'מחיר ועלויות',
  'cost analysis': 'מחיר ועלויות',
  'common mistakes': 'טעויות נפוצות',
  'comparison': 'השוואה',
  'how-to/setup guide': 'מדריך מעשי',
  'how-to': 'מדריך מעשי',
  'setup guide': 'מדריך מעשי',
  'faq': 'שאלות נפוצות',
}
function localizeAngle(angle: string | undefined, uiLang: 'he' | 'en'): string {
  const a = (angle || '').trim()
  if (!a) return ''
  if (uiLang === 'en') return a
  const mapped = ANGLE_MAP_HE[a.toLowerCase()]
  if (mapped) return mapped
  // Unmapped English text in a Hebrew UI → hide it.
  if (/[A-Za-z]/.test(a)) return ''
  return a
}
function emptyAnchor(): ArticleTopicAnchor {
  // Required by default — most anchors the user adds are meant to appear.
  return { anchor_text: '', target_url: '', required: true, type: 'internal', note: '' }
}
function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
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
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [suggestions, setSuggestions] = useState<GeminiTopicSuggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualTopic, setManualTopic] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [source, setSource] = useState<'gemini' | 'fallback' | null>(null)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)

  const [briefLang, setBriefLang] = useState<SuggestionLanguage>('he')
  const [tone, setTone] = useState<string>(DEFAULT_TONE)
  const [wordCount, setWordCount] = useState<number>(DEFAULT_WORD_COUNT)
  const [cta, setCta] = useState<string>(DEFAULT_CTA)
  const [searchIntent, setSearchIntent] = useState<SuggestionIntent>(DEFAULT_INTENT)
  const [secondaryText, setSecondaryText] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [mustInclude, setMustInclude] = useState('')
  const [mustAvoid, setMustAvoid] = useState('')
  const [includeBrandName, setIncludeBrandName] = useState(false)
  const [brandNameToInclude, setBrandNameToInclude] = useState('')
  const [includeManualToc, setIncludeManualToc] = useState(false)
  const [ctaText, setCtaText] = useState('')
  const [ctaPhone, setCtaPhone] = useState('')
  const [ctaWhatsapp, setCtaWhatsapp] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [anchors, setAnchors] = useState<ArticleTopicAnchor[]>([])
  const [keywordFit, setKeywordFit] = useState<'aligned' | 'weak' | 'unrelated' | null>(null)

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projectLang = projects.find((p) => p.id === projectId)?.language

  useEffect(() => {
    if (!open) return
    if (editing) {
      setProjectId(editing.project_id)
      setPrimaryKeyword(editing.primary_keyword ?? '')
      setSuggestions([]); setSelected(new Set()); setSuggestError(null); setSource(null); setFallbackReason(null)
      setManualTopic(editing.topic ?? '')
      setBriefLang(normalizeLang(editing.language))
      setTone(oneOf(editing.tone_of_voice, TONE_KEYS, DEFAULT_TONE))
      setWordCount(LENGTHS.some((l) => l.value === editing.desired_word_count) ? (editing.desired_word_count as number) : DEFAULT_WORD_COUNT)
      setCta(oneOf(editing.cta_preference, CTA_KEYS, DEFAULT_CTA))
      setSearchIntent(oneOf(editing.search_intent, INTENT_KEYS, DEFAULT_INTENT))
      setSecondaryText((editing.secondary_keywords ?? []).join('\n'))
      setTargetAudience(editing.target_audience ?? '')
      { const dec = decodeBriefNotes(editing.brief_notes); const sec = decodeBriefSections(dec.notes); setMustInclude(sec.mustInclude); setMustAvoid(sec.mustAvoid); setIncludeBrandName(dec.flags.includeBrandName); setBrandNameToInclude(dec.flags.brandNameToInclude); setIncludeManualToc(dec.flags.includeManualToc); setCtaText(dec.flags.cta.text); setCtaPhone(dec.flags.cta.phone); setCtaWhatsapp(dec.flags.cta.whatsapp); setCtaUrl(dec.flags.cta.url) }
      setAnchors(Array.isArray(editing.anchors_json) ? editing.anchors_json.map((a) => ({ ...emptyAnchor(), ...a })) : [])
      setAdvancedOpen(true)
      setKeywordFit(null)
    } else {
      setProjectId(defaultProjectId)
      setPrimaryKeyword(''); setSuggestions([]); setSelected(new Set()); setManualTopic(''); setSuggestError(null); setSource(null); setFallbackReason(null)
      setBriefLang(normalizeLang(projects.find((p) => p.id === defaultProjectId)?.language))
      setTone(DEFAULT_TONE); setWordCount(DEFAULT_WORD_COUNT); setCta(DEFAULT_CTA); setSearchIntent(DEFAULT_INTENT)
      setSecondaryText(''); setTargetAudience(''); setMustInclude(''); setMustAvoid(''); setIncludeBrandName(false); setBrandNameToInclude(''); setIncludeManualToc(false); setCtaText(''); setCtaPhone(''); setCtaWhatsapp(''); setCtaUrl(''); setAnchors([])
      setAdvancedOpen(false)
      setKeywordFit(null)
    }
    setError(null)
  }, [open, editing, defaultProjectId, projects])

  useEffect(() => {
    if (open && !editing) setBriefLang(normalizeLang(projectLang))
  }, [open, editing, projectLang])

  function toggleSuggestion(title: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  async function handleSuggest() {
    if (!projectId || !primaryKeyword.trim()) return
    setSuggesting(true)
    setSuggestError(null)
    setSource(null); setFallbackReason(null)
    setKeywordFit(null)
    try {
      // Do NOT send secondary keywords from the form as project context — the
      // primary keyword drives suggestions; secondary stay user-controlled.
      const res = await fetch('/api/content/topic-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          primaryKeyword: primaryKeyword.trim(),
          language: briefLang,
          searchIntent,
          count: 8,
          targetAudience,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.topics)) {
        setSuggestError(data.error || t.suggestFailed)
        return
      }
      const topics = data.topics as GeminiTopicSuggestion[]
      setSuggestions(topics)
      setSource(data.source === 'gemini' ? 'gemini' : 'fallback')
      setFallbackReason(typeof data.fallbackReason === 'string' ? data.fallbackReason : null)
      setKeywordFit(data.projectKeywordFit ?? null)
      // No auto-fill of length/secondary from suggestions — defaults stay put;
      // per-topic secondary keywords are merged from the CHOSEN suggestion only,
      // at save time (see buildPayload).
    } catch {
      setSuggestError(t.suggestFailed)
    } finally {
      setSuggesting(false)
    }
  }

  function updateAnchor(i: number, patch: Partial<ArticleTopicAnchor>) {
    setAnchors((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }
  function addAnchor() {
    setAnchors((prev) => [...prev, emptyAnchor()])
    setAdvancedOpen(true)
  }

  // Build the POST/PATCH payload for one topic, enriched from its suggestion.
  function buildPayload(topicTitle: string) {
    const sug = suggestions.find((s) => s.title === topicTitle)
    const formSecondary = secondaryText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    let secondary = formSecondary
    let intent: SuggestionIntent = searchIntent
    if (sug) {
      // Secondary keywords may be enriched ONLY from the chosen suggestion.
      if (sug.suggestedSecondaryKeywords.length) {
        secondary = Array.from(new Set([...formSecondary, ...sug.suggestedSecondaryKeywords]))
      }
      if ((INTENT_KEYS as readonly string[]).includes(sug.searchIntent)) intent = sug.searchIntent as SuggestionIntent
    }
    return {
      projectId,
      topic: topicTitle,
      primary_keyword: primaryKeyword,
      secondary_keywords: secondary,
      search_intent: intent,
      target_audience: targetAudience,
      language: briefLang,
      tone_of_voice: tone,
      desired_word_count: wordCount, // always the user's choice (default 1000)
      cta_preference: cta,
      brief_notes: encodeBriefNotes(encodeBriefSections({ mustInclude, mustAvoid }), {
        includeBrandName, brandNameToInclude, includeManualToc,
        cta: cta === 'none'
          ? { text: '', phone: '', whatsapp: '', url: '' }
          : { text: ctaText, phone: ctaPhone, whatsapp: ctaWhatsapp, url: ctaUrl },
      }),
      anchors: anchors.filter((a) => a.anchor_text.trim() || a.target_url.trim()),
    }
  }

  async function handleSave() {
    if (!projectId) { setError(t.projectRequired); return }

    const topics = new Set<string>()
    selected.forEach((s) => topics.add(s))
    if (manualTopic.trim()) topics.add(manualTopic.trim())
    const topicList = Array.from(topics)
    if (topicList.length === 0) { setError(t.noTopicSelected); return }

    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const res = await fetch(`/api/content/topics/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(topicList[0])),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error || t.genericError)
          return
        }
      } else {
        const results = await Promise.all(
          topicList.map((topic) =>
            fetch('/api/content/topics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildPayload(topic)),
            }).then(async (r) => ({ ok: r.ok, err: r.ok ? null : (await r.json().catch(() => ({}))).error }))
          )
        )
        const failed = results.find((r) => !r.ok)
        if (failed) {
          onSaved() // refresh whatever did save
          setError(failed.err || t.genericError)
          return
        }
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
  const selectedCount = selected.size + (manualTopic.trim() ? 1 : 0)

  return (
    <Modal open={open} onClose={onClose} title={editing ? t.editTitle : t.newTitle} size="xl">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.project}</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            <option value="">{t.selectProject}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {!editing && (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label={t.primaryKeyword} value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder={t.primaryKeywordPlaceholder} />
              </div>
              <Button variant="outline" onClick={handleSuggest} loading={suggesting} disabled={suggesting || !primaryKeyword.trim() || !projectId} className="shrink-0">
                <Sparkles size={16} /> {suggesting ? t.suggesting : t.suggestTopics}
              </Button>
            </div>

            {suggestError && (
              <div className="text-sm text-amber-700 dark:text-amber-400">{suggestError}</div>
            )}

            {suggestions.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.suggestionsHeading}</div>
                  {source && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        source === 'gemini'
                          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {source === 'gemini' ? t.sourceGemini : t.sourceFallback}
                    </span>
                  )}
                </div>

                {source === 'fallback' && (
                  <div className="mb-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5">
                    {/* Only claim "check GEMINI_API_KEY" when that's actually the reason. */}
                    {fallbackReason === 'missing_gemini_api_key' ? t.fallbackWarning : t.fallbackGeneric}
                  </div>
                )}

                {keywordFit === 'unrelated' && (
                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5">
                    {t.keywordMismatch}
                  </div>
                )}

                <div className="space-y-2">
                  {suggestions.map((s) => {
                    const angle = localizeAngle(s.angle, isHebrew ? 'he' : 'en')
                    return (
                      <label key={s.title} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={selected.has(s.title)} onChange={() => toggleSuggestion(s.title)} />
                        <span>
                          {s.title}
                          {angle && <span className="block text-xs text-slate-400 dark:text-slate-500">{angle}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {selectedCount > 1 && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">{t.poolHint}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {editing ? t.topic : t.manualTopicLabel}
          </label>
          <input type="text" value={manualTopic} onChange={(e) => setManualTopic(e.target.value)} placeholder={t.topicPlaceholder} className={inputCls} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.language}</label>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
              {(['he', 'en'] as const).map((l) => (
                <button key={l} type="button" onClick={() => setBriefLang(l)} className={`px-4 py-2 text-sm transition ${briefLang === l ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>
                  {l === 'he' ? t.languageHe : t.languageEn}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.searchIntent}</label>
            <select value={searchIntent} onChange={(e) => setSearchIntent(e.target.value as SuggestionIntent)} className={inputCls}>
              {INTENT_KEYS.map((k) => <option key={k} value={k}>{t.intents[k]}</option>)}
            </select>
          </div>
        </div>

        <button type="button" onClick={() => setAdvancedOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {t.advancedToggle}
        </button>

        {advancedOpen && (
          <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.toneOfVoice}</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className={inputCls}>
                  {TONE_KEYS.map((k) => <option key={k} value={k}>{t.tones[k]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.ctaPreference}</label>
                <select value={cta} onChange={(e) => setCta(e.target.value)} className={inputCls}>
                  {CTA_KEYS.map((k) => <option key={k} value={k}>{t.ctas[k]}</option>)}
                </select>
              </div>
            </div>

            {CTA_WITH_DETAILS.includes(cta) && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.ctaDetailsHint}</p>
                <Input label={t.ctaTextLabel} value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={t.ctaTextPlaceholder} />
                {cta === 'whatsapp' && (
                  <Input label={t.ctaWhatsappLabel} value={ctaWhatsapp} onChange={(e) => setCtaWhatsapp(e.target.value)} placeholder={t.ctaWhatsappPlaceholder} />
                )}
                {cta === 'phone' && (
                  <Input label={t.ctaPhoneLabel} value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} placeholder={t.ctaPhonePlaceholder} />
                )}
                <Input label={t.ctaUrlLabel} type="url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t.ctaUrlPlaceholder} />
                {(cta === 'whatsapp' || cta === 'phone' || cta === 'contact') && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{t.ctaDetailsRequired}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.desiredWordCount}</label>
              <div className="flex flex-wrap gap-2">
                {LENGTHS.map((l) => (
                  <button key={l.value} type="button" onClick={() => setWordCount(l.value)} className={`px-3 py-1.5 text-sm rounded-lg border transition ${wordCount === l.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                    {t.lengths[l.key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.secondaryKeywords}</label>
              <textarea value={secondaryText} onChange={(e) => setSecondaryText(e.target.value)} rows={2} className={inputCls} />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.secondaryHint}</p>
            </div>

            <Input label={t.targetAudience} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.mustInclude}</label>
              <textarea value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} rows={3} className={inputCls} placeholder={t.mustIncludePlaceholder} />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.mustIncludeHelp}</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.mustAvoid}</label>
              <textarea value={mustAvoid} onChange={(e) => setMustAvoid(e.target.value)} rows={3} className={inputCls} placeholder={t.mustAvoidPlaceholder} />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.mustAvoidHelp}</p>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeBrandName}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setIncludeBrandName(checked)
                    if (checked && !brandNameToInclude.trim()) {
                      const proj = projects.find((p) => p.id === projectId)
                      setBrandNameToInclude((proj?.business_name || proj?.name || '').trim())
                    }
                  }}
                  className="mt-0.5"
                />
                <span>
                  {t.includeBrandName}
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t.includeBrandNameHint}</span>
                </span>
              </label>
              {includeBrandName && (
                <Input
                  label={t.brandNameToInclude}
                  value={brandNameToInclude}
                  onChange={(e) => setBrandNameToInclude(e.target.value)}
                  placeholder={t.brandNamePlaceholder}
                />
              )}
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeManualToc}
                  onChange={(e) => setIncludeManualToc(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {t.includeManualToc}
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t.includeManualTocHint}</span>
                </span>
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.anchorsTitle}</h4>
                <Button size="sm" variant="outline" onClick={addAnchor}>
                  <Plus size={14} /> {t.addAnchor}
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t.anchorsHint}</p>
              <div className="space-y-3">
                {anchors.map((a, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input label={t.anchorText} value={a.anchor_text} onChange={(e) => updateAnchor(i, { anchor_text: e.target.value })} placeholder={t.anchorTextPlaceholder} />
                      <Input label={t.targetUrl} type="url" value={a.target_url} onChange={(e) => updateAnchor(i, { target_url: e.target.value })} placeholder={t.targetUrlPlaceholder} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <select value={a.type} onChange={(e) => updateAnchor(i, { type: e.target.value as 'internal' | 'external' })} className={inputCls + ' max-w-[9rem]'}>
                        <option value="internal">{t.internal}</option>
                        <option value="external">{t.external}</option>
                      </select>
                      <input type="text" value={a.note} onChange={(e) => updateAnchor(i, { note: e.target.value })} placeholder={t.notePlaceholder} className={inputCls + ' flex-1 min-w-[8rem]'} />
                      <button type="button" onClick={() => setAnchors((p) => p.filter((_, idx) => idx !== i))} className="text-red-600 dark:text-red-400 hover:text-red-700 p-1" title={t.removeAnchor}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={a.required} onChange={(e) => updateAnchor(i, { required: e.target.checked })} className="mt-0.5" />
                      <span>
                        {t.required}
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{t.requiredHelp}</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button onClick={handleSave} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
        </div>
      </div>
    </Modal>
  )
}
