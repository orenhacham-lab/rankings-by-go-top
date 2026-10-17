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

import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input, { FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Checkbox from '@/components/ui/Checkbox'
import Segmented from '@/components/ui/Segmented'
import Notice from '@/components/ui/Notice'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Trash2, Plus, Sparkles, ChevronDown } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SuggestionLanguage, SuggestionIntent } from '@/lib/content/topic-suggestions'
import type { GeminiTopicSuggestion } from '@/lib/content/gemini-topics'
import { encodeBriefNotes, decodeBriefNotes, encodeBriefSections, decodeBriefSections, type PlannedInternalLink } from '@/lib/content/brief-notes'
import { ARTICLE_DEPTHS, type ArticleDepth } from '@/lib/content/article-depth'
import type { InternalLinkCandidate } from '@/lib/content/internal-link-candidates'
import type { ArticleTopic, ArticleTopicAnchor } from '@/lib/supabase/types'
import OverlapHint from '@/components/content/OverlapHint'
import { fetchOverlap, type OverlapPayload } from '@/lib/content/cannibalization/client'

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
  prefill,
  mode = 'default',
  onSaved,
  onToast,
  onTopicsCreated,
  exampleTerm,
}: {
  open: boolean
  onClose: () => void
  projects: ProjectOption[]
  defaultProjectId: string
  editing?: ArticleTopic | null
  // Stage E2B — STRICT reviewed-topic mode for the GSC "create reviewed topic" flow. In
  // 'gsc_reviewed_topic' the Gemini "Suggest topics" flow is fully hidden/disabled (no
  // /api/content/topic-suggestions call), exactly ONE manually reviewed topic is submitted,
  // and the project is locked to the supplied one. Every other field stays editable. Default
  // 'default' preserves the existing create/edit behavior unchanged.
  mode?: 'default' | 'gsc_reviewed_topic'
  // Stage E2B — CREATE-mode prefill (reused by the GSC "create reviewed topic" flow). Seeds
  // topic/primary keyword/secondary keywords/search intent; every field stays fully editable
  // and the create still goes through the normal POST /api/content/topics (source='manual').
  // Ignored when `editing` is set. Never triggers any save on its own.
  prefill?: { topic?: string; primaryKeyword?: string; secondaryKeywords?: string[]; searchIntent?: string } | null
  onSaved: () => void
  onToast?: (kind: 'success' | 'error', text: string) => void
  // Phase 2F.1 — fires with the newly-created topics (create flow only) so the hub can offer
  // an internal-link planning step. Never fires when editing. May be async (the GSC flow
  // persists a created_topic decision here) — handleSave awaits it before closing.
  onTopicsCreated?: (topics: { id: string; topic: string; primary_keyword: string | null }[]) => void | Promise<void>
  // R29 — a term from the project itself (e.g. the keyword of an existing topic) used in
  // the example placeholders. Without it the placeholders stay neutral examples, so a
  // project never sees another business's niche as its example.
  exampleTerm?: string | null
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).contentHub.brief
  const isHebrew = language === 'he'
  // Stage E2B strict reviewed-topic mode: no Gemini suggestions, one manual topic, locked project.
  const gscMode = mode === 'gsc_reviewed_topic'

  const [projectId, setProjectId] = useState(defaultProjectId)
  const depthOptions = ARTICLE_DEPTHS.map((d) => ({ value: d, label: (t.articleDepths as Record<string, string>)[d] }))
  // The term belongs to the workspace's project: another project picked here gets the neutral example.
  const term = projectId === defaultProjectId ? (exampleTerm ?? '').trim().slice(0, 60) : ''
  const topicPlaceholder = term ? t.topicPlaceholderWithTerm.replace('{term}', term) : t.topicPlaceholder
  const keywordPlaceholder = term ? t.keywordPlaceholderWithTerm.replace('{term}', term) : t.primaryKeywordPlaceholder
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
  const [articleAngle, setArticleAngle] = useState('')
  const [mustInclude, setMustInclude] = useState('')
  const [mustAvoid, setMustAvoid] = useState('')
  const [includeBrandName, setIncludeBrandName] = useState(false)
  const [brandNameToInclude, setBrandNameToInclude] = useState('')
  const [includeManualToc, setIncludeManualToc] = useState(false)
  const [articleDepth, setArticleDepth] = useState<ArticleDepth>('auto')
  const [ctaText, setCtaText] = useState('')
  const [ctaPhone, setCtaPhone] = useState('')
  const [ctaWhatsapp, setCtaWhatsapp] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [anchors, setAnchors] = useState<ArticleTopicAnchor[]>([])
  const [keywordFit, setKeywordFit] = useState<'aligned' | 'weak' | 'unrelated' | null>(null)
  // Internal-link planning: approved links + candidates + per-target UI choices.
  const [internalLinks, setInternalLinks] = useState<PlannedInternalLink[]>([])
  const [linkCandidates, setLinkCandidates] = useState<InternalLinkCandidate[]>([])
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({})
  const [linkManual, setLinkManual] = useState<Record<string, string>>({})
  const [linksExpanded, setLinksExpanded] = useState(false)

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Field-level validation + a bottom (near-button) error so it's noticed even
  // when scrolled down.
  const [formError, setFormError] = useState<string | null>(null)
  const [errProject, setErrProject] = useState(false)
  const [errTopic, setErrTopic] = useState(false)
  const [badAnchors, setBadAnchors] = useState<Set<number>>(new Set())
  // The cannibalization check before a new topic is saved: what it found, for which
  // inputs, and the inputs the merchant chose to create anyway. A change to the
  // project, keyword or topics makes the warning stale, and the next save checks again.
  const [overlaps, setOverlaps] = useState<{ key: string; found: { topic: string; overlap: OverlapPayload }[] } | null>(null)
  const [overlapAck, setOverlapAck] = useState<string | null>(null)
  const overlapRef = useRef<HTMLDivElement | null>(null)
  const projectRef = useRef<HTMLSelectElement>(null)
  const topicRef = useRef<HTMLInputElement>(null)
  const anchorsRef = useRef<HTMLDivElement>(null)
  // Guards the one-time init so re-renders (e.g. a new `projects` array identity
  // or candidate fetch) never re-reset local state — advanced options stay open.
  const initKeyRef = useRef<string | null>(null)

  const projectLang = projects.find((p) => p.id === projectId)?.language

  useEffect(() => {
    if (!open) { initKeyRef.current = null; return }
    // Only initialize once per open session (or when switching which topic is
    // being edited) — NOT on every parent re-render / prop identity change.
    const initKey = editing ? `edit:${editing.id}` : (prefill ? `new:${prefill.topic ?? ''}|${prefill.primaryKeyword ?? ''}` : 'new')
    if (initKeyRef.current === initKey) return
    initKeyRef.current = initKey
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
      { const dec = decodeBriefNotes(editing.brief_notes); const sec = decodeBriefSections(dec.notes); setArticleAngle(sec.articleAngle); setMustInclude(sec.mustInclude); setMustAvoid(sec.mustAvoid); setIncludeBrandName(dec.flags.includeBrandName); setBrandNameToInclude(dec.flags.brandNameToInclude); setIncludeManualToc(dec.flags.includeManualToc); setArticleDepth(dec.flags.articleDepth ?? 'auto'); setCtaText(dec.flags.cta.text); setCtaPhone(dec.flags.cta.phone); setCtaWhatsapp(dec.flags.cta.whatsapp); setCtaUrl(dec.flags.cta.url) }
      setAnchors(Array.isArray(editing.anchors_json) ? editing.anchors_json.map((a) => ({ ...emptyAnchor(), ...a })) : [])
      { const planned = decodeBriefNotes(editing.brief_notes).flags.internalLinks; setInternalLinks(planned); const ch: Record<string, string> = {}, mn: Record<string, string> = {}; for (const l of planned) { if (l.source === 'manual') mn[l.targetId] = l.anchorText; else ch[l.targetId] = l.anchorText } setLinkChoice(ch); setLinkManual(mn) }
      setAdvancedOpen(true)
      setKeywordFit(null)
    } else {
      setProjectId(defaultProjectId)
      setPrimaryKeyword(''); setSuggestions([]); setSelected(new Set()); setManualTopic(''); setSuggestError(null); setSource(null); setFallbackReason(null)
      setBriefLang(normalizeLang(projects.find((p) => p.id === defaultProjectId)?.language))
      setTone(DEFAULT_TONE); setWordCount(DEFAULT_WORD_COUNT); setCta(DEFAULT_CTA); setSearchIntent(DEFAULT_INTENT)
      setSecondaryText(''); setTargetAudience(''); setArticleAngle(''); setMustInclude(''); setMustAvoid(''); setIncludeBrandName(false); setBrandNameToInclude(''); setIncludeManualToc(false); setArticleDepth('auto'); setCtaText(''); setCtaPhone(''); setCtaWhatsapp(''); setCtaUrl(''); setAnchors([])
      setInternalLinks([]); setLinkChoice({}); setLinkManual({})
      setAdvancedOpen(false)
      setKeywordFit(null)
      // Stage E2B create-mode prefill (reviewable + editable; no auto-save).
      if (prefill) {
        if (prefill.topic) setManualTopic(prefill.topic)
        if (prefill.primaryKeyword) setPrimaryKeyword(prefill.primaryKeyword)
        if (prefill.secondaryKeywords && prefill.secondaryKeywords.length) setSecondaryText(prefill.secondaryKeywords.join('\n'))
        if (prefill.searchIntent) setSearchIntent(oneOf(prefill.searchIntent, INTENT_KEYS, DEFAULT_INTENT))
      }
    }
    setError(null); setFormError(null); setErrProject(false); setErrTopic(false); setBadAnchors(new Set()); setLinksExpanded(false)
    // initKeyRef guards against re-init on identity changes; prefill only seeds create-mode once.
  }, [open, editing, defaultProjectId, projects, prefill])

  useEffect(() => {
    if (open && !editing) setBriefLang(normalizeLang(projectLang))
  }, [open, editing, projectLang])

  // Load internal-link candidates for the planning section when a project is set.
  useEffect(() => {
    if (!open || !projectId) { setLinkCandidates([]); return }
    let cancelled = false
    fetch(`/api/content/internal-link-candidates?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d) => { if (!cancelled) setLinkCandidates(Array.isArray(d.candidates) ? d.candidates : []) })
      .catch(() => { if (!cancelled) setLinkCandidates([]) })
    return () => { cancelled = true }
  }, [open, projectId])

  // ---- Internal-link planning helpers -------------------------------------
  type LinkOpt = { text: string; source: PlannedInternalLink['source']; weak: boolean; label: string }
  function linkOptionsFor(cand: InternalLinkCandidate): LinkOpt[] {
    const isWeak = (s: string) => s.trim().split(/\s+/).filter(Boolean).length === 1
    const opts: LinkOpt[] = []
    if (cand.keyword?.trim()) opts.push({ text: cand.keyword.trim(), source: 'primary_keyword', weak: false, label: t.planLabelKeyword })
    for (const a of cand.historicalAnchors ?? []) {
      const text = a.trim()
      if (text) opts.push({ text, source: 'historical_anchor', weak: isWeak(text), label: isWeak(text) ? t.planLabelHistoricGeneric : t.planLabelHistoric })
    }
    for (const s of cand.secondaryKeywords ?? []) if (s.trim()) opts.push({ text: s.trim(), source: 'secondary_keyword', weak: false, label: t.planLabelSecondary })
    const seen = new Set<string>()
    return opts.filter((o) => { const k = o.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  }
  function linkSourceOf(cand: InternalLinkCandidate, text: string): PlannedInternalLink['source'] {
    const found = linkOptionsFor(cand).find((o) => o.text.toLowerCase() === text.toLowerCase())
    return found ? found.source : 'manual'
  }
  function chosenLinkFor(cand: InternalLinkCandidate): { text: string; source: PlannedInternalLink['source'] } {
    const manual = (linkManual[cand.id] ?? '').trim()
    if (manual) return { text: manual, source: 'manual' }
    const opts = linkOptionsFor(cand)
    const picked = linkChoice[cand.id]
    if (picked) return { text: picked, source: linkSourceOf(cand, picked) }
    // Default: first non-weak option; only fall back to a weak (single-word) one.
    const def = opts.find((o) => !o.weak) ?? opts[0]
    return def ? { text: def.text, source: def.source } : { text: '', source: 'manual' }
  }
  const isLinkApproved = (id: string) => internalLinks.some((l) => l.targetId === id)
  function upsertLink(cand: InternalLinkCandidate) {
    const ch = chosenLinkFor(cand)
    if (!ch.text) return
    setInternalLinks((prev) => [
      ...prev.filter((l) => l.targetId !== cand.id),
      { targetId: cand.id, targetUrl: cand.url, targetTitle: cand.title, anchorText: ch.text, source: ch.source },
    ])
  }
  function toggleLink(cand: InternalLinkCandidate) {
    if (isLinkApproved(cand.id)) setInternalLinks((prev) => prev.filter((l) => l.targetId !== cand.id))
    else upsertLink(cand)
  }

  // Keep approved links' anchor in sync with the dropdown / manual controls.
  useEffect(() => {
    setInternalLinks((prev) => prev.map((l) => {
      const cand = linkCandidates.find((c) => c.id === l.targetId)
      if (!cand) return l
      const ch = chosenLinkFor(cand)
      return ch.text ? { ...l, anchorText: ch.text, source: ch.source } : l
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkChoice, linkManual, linkCandidates])

  function toggleSuggestion(title: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  async function handleSuggest() {
    if (gscMode) return // strict reviewed-topic mode never calls Gemini/topic-suggestions
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
      brief_notes: encodeBriefNotes(encodeBriefSections({ articleAngle, mustInclude, mustAvoid }), {
        includeBrandName, brandNameToInclude, includeManualToc,
        cta: cta === 'none'
          ? { text: '', phone: '', whatsapp: '', url: '' }
          : { text: ctaText, phone: ctaPhone, whatsapp: ctaWhatsapp, url: ctaUrl },
        internalLinks,
        articleDepth,
      }),
      anchors: anchors.filter((a) => a.anchor_text.trim() || a.target_url.trim()),
    }
  }

  function isBadAnchorUrl(url: string): boolean {
    const u = (url || '').trim()
    if (!u) return false // empty is fine (optional)
    if (/\s/.test(u)) return true
    try { const p = new URL(u); return p.protocol !== 'http:' && p.protocol !== 'https:' } catch { return true }
  }

  async function handleSave(overlapAcknowledged = false) {
    // Reset validation state.
    setError(null); setFormError(null); setErrProject(false); setErrTopic(false); setBadAnchors(new Set())

    if (!projectId) {
      setErrProject(true); setFormError(t.fixErrors)
      projectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); projectRef.current?.focus()
      return
    }

    const topics = new Set<string>()
    // Strict GSC mode: exactly ONE manually reviewed topic — never any selected suggestions.
    if (!gscMode) selected.forEach((s) => topics.add(s))
    if (manualTopic.trim()) topics.add(manualTopic.trim())
    const topicList = gscMode ? (manualTopic.trim() ? [manualTopic.trim()] : []) : Array.from(topics)
    if (topicList.length === 0) {
      setErrTopic(true); setFormError(t.fixErrors)
      topicRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); topicRef.current?.focus()
      return
    }

    // Client-side anchor URL validation (server also validates).
    const bad = new Set<number>()
    anchors.forEach((a, i) => { if (isBadAnchorUrl(a.target_url)) bad.add(i) })
    if (bad.size > 0) {
      setBadAnchors(bad); setFormError(t.fixErrors); setAdvancedOpen(true)
      setTimeout(() => anchorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }

    // A new topic the site already covers: offer improving the existing page first.
    // Never a block: "create it anyway" saves it, and a failed check is no match.
    if (!editing) {
      const key = overlapKey(projectId, topicList)
      if (!overlapAcknowledged && overlapAck !== key) {
        setSaving(true)
        const found = (await Promise.all(topicList.map(async (topic) => ({ topic, overlap: await fetchOverlap(projectId, topic, primaryKeyword.trim() || topic) }))))
          .filter((r): r is { topic: string; overlap: OverlapPayload } => !!r.overlap)
        setSaving(false)
        if (found.length > 0) {
          setOverlaps({ key, found })
          setTimeout(() => overlapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
          return
        }
      }
      setOverlapAck(key)
    }

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
          console.warn('[brief-modal] update failed', { error: d?.error })
          setError(t.genericError); setFormError(t.genericError)
          return
        }
      } else {
        const results = await Promise.all(
          topicList.map((topic) =>
            fetch('/api/content/topics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildPayload(topic)),
            }).then(async (r) => {
              const d = await r.json().catch(() => ({}))
              return { ok: r.ok, err: r.ok ? null : d?.error, topic: r.ok ? d?.topic : null }
            })
          )
        )
        const failed = results.find((r) => !r.ok)
        if (failed) {
          onSaved() // refresh whatever did save
          console.warn('[brief-modal] create failed', { error: failed.err })
          setError(t.genericError); setFormError(t.genericError)
          return
        }
        // Surface the newly-created topics for the internal-link planning step.
        const created = results
          .map((r) => r.topic as { id?: string; topic?: string; primary_keyword?: string | null } | null)
          .filter((tp): tp is { id: string; topic: string; primary_keyword: string | null } => !!tp && typeof tp.id === 'string')
          .map((tp) => ({ id: tp.id, topic: tp.topic ?? '', primary_keyword: tp.primary_keyword ?? null }))
        // Await the callback so an async consumer (the GSC created_topic decision write) can
        // finish before we close and report a result. It never rejects (the consumer catches).
        if (created.length) await onTopicsCreated?.(created)
      }
      onSaved() // the single topic-list refresh path (both modes)
      // In strict GSC mode the onTopicsCreated callback is authoritative for the final result
      // (full / partial success) — the modal must NOT show the generic "topic saved" toast.
      if (!gscMode) onToast?.('success', editing ? t.toasts.topicUpdated : t.toasts.topicSaved)
      onClose()
    } catch {
      setError(t.genericError); setFormError(t.genericError)
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selected.size + (manualTopic.trim() ? 1 : 0)

  function overlapKey(project: string, topicList: string[]): string {
    return JSON.stringify([project, primaryKeyword.trim(), [...topicList].sort()])
  }
  const currentTopics = gscMode ? (manualTopic.trim() ? [manualTopic.trim()] : []) : Array.from(new Set([...Array.from(selected), ...(manualTopic.trim() ? [manualTopic.trim()] : [])]))
  const overlapShown = !editing && overlaps && overlaps.key === overlapKey(projectId, currentTopics) ? overlaps.found : null

  return (
    <Modal open={open} onClose={onClose} title={editing ? t.editTitle : t.newTitle} size="xl">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && <Notice tone="bad">{error}</Notice>}

        {/* Strict GSC mode locks the project to the one supplied by the opportunity. */}
        <Select
          ref={projectRef}
          id="brief-project"
          label={t.project}
          value={projectId}
          disabled={gscMode}
          onChange={(e) => { setProjectId(e.target.value); setErrProject(false) }}
          error={errProject ? t.projectRequired : undefined}
          options={[{ value: '', label: t.selectProject }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />

        {/* Strict GSC mode keeps the primary keyword editable but WITHOUT the Gemini suggest flow. */}
        {gscMode && (
          <Input label={t.primaryKeyword} value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder={keywordPlaceholder} />
        )}

        {/* Strict GSC reviewed-topic mode hides the whole Gemini "Suggest topics" flow. */}
        {!editing && !gscMode && (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input label={t.primaryKeyword} value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder={keywordPlaceholder} />
              </div>
              <Button variant="secondary" onClick={handleSuggest} loading={suggesting} disabled={suggesting || !primaryKeyword.trim() || !projectId} className="shrink-0">
                {!suggesting && <Sparkles aria-hidden="true" className="size-4" />}
                {suggesting ? t.suggesting : t.suggestTopics}
              </Button>
            </div>

            {suggestError && <Notice tone="warn">{suggestError}</Notice>}

            {suggestions.length > 0 && (
              <div className="rounded-inset border border-line p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-copy font-semibold text-ink">{t.suggestionsHeading}</div>
                  {source && (
                    <Badge variant={source === 'gemini' ? 'info' : 'warning'}>
                      {source === 'gemini' ? t.sourceGemini : t.sourceFallback}
                    </Badge>
                  )}
                </div>

                {source === 'fallback' && (
                  <Notice tone="warn" className="mb-3">
                    {/* Only claim "check GEMINI_API_KEY" when that's actually the reason. */}
                    {fallbackReason === 'missing_gemini_api_key' ? t.fallbackWarning : t.fallbackGeneric}
                  </Notice>
                )}

                {keywordFit === 'unrelated' && (
                  <Notice tone="info" className="mb-3">{t.keywordMismatch}</Notice>
                )}

                <div className="space-y-2">
                  {suggestions.map((s) => {
                    const angle = localizeAngle(s.angle, isHebrew ? 'he' : 'en')
                    return (
                      <Checkbox
                        key={s.title}
                        checked={selected.has(s.title)}
                        onChange={() => toggleSuggestion(s.title)}
                        label={s.title}
                        description={angle || undefined}
                      />
                    )
                  })}
                </div>
                {selectedCount > 1 && (
                  <p className="mt-3 text-caption text-muted">{t.poolHint}</p>
                )}
              </div>
            )}
          </div>
        )}

        <Input
          ref={topicRef}
          id="brief-topic"
          type="text"
          label={editing ? t.topic : t.manualTopicLabel}
          value={manualTopic}
          onChange={(e) => { setManualTopic(e.target.value); setErrTopic(false) }}
          placeholder={topicPlaceholder}
          error={errTopic ? t.noTopicSelected : undefined}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span id="brief-lang-label" className={FIELD_LABEL_CLASSES}>{t.language}</span>
            <Segmented<SuggestionLanguage>
              ariaLabel={t.language}
              value={briefLang}
              onChange={(l) => setBriefLang(l)}
              options={[{ value: 'he', label: t.languageHe }, { value: 'en', label: t.languageEn }, { value: 'es', label: t.languageEs }]}
              className="w-fit"
            />
          </div>
          <Select
            id="brief-intent"
            label={t.searchIntent}
            value={searchIntent}
            onChange={(e) => setSearchIntent(e.target.value as SuggestionIntent)}
            options={INTENT_KEYS.map((k) => ({ value: k, label: t.intents[k] }))}
          />
        </div>

        <button type="button" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen} className="inline-flex items-center gap-1.5 rounded-control text-copy font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
          <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ease-snappy ${advancedOpen ? 'rotate-180' : ''}`} />
          {t.advancedToggle}
        </button>

        {advancedOpen && (
          <div className="space-y-4 rounded-inset border border-line p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select id="brief-tone" label={t.toneOfVoice} value={tone} onChange={(e) => setTone(e.target.value)} options={TONE_KEYS.map((k) => ({ value: k, label: t.tones[k] }))} />
              <Select id="brief-cta" label={t.ctaPreference} value={cta} onChange={(e) => setCta(e.target.value)} options={CTA_KEYS.map((k) => ({ value: k, label: t.ctas[k] }))} />
            </div>

            {CTA_WITH_DETAILS.includes(cta) && (
              <div className="space-y-4 rounded-inset bg-sunk/60 p-4">
                <p className="max-w-prose text-caption text-muted">{t.ctaDetailsHint}</p>
                <Input label={t.ctaTextLabel} value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={t.ctaTextPlaceholder} />
                {cta === 'whatsapp' && (
                  <Input label={t.ctaWhatsappLabel} value={ctaWhatsapp} onChange={(e) => setCtaWhatsapp(e.target.value)} placeholder={t.ctaWhatsappPlaceholder} />
                )}
                {cta === 'phone' && (
                  <Input label={t.ctaPhoneLabel} value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} placeholder={t.ctaPhonePlaceholder} />
                )}
                <Input label={t.ctaUrlLabel} type="url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t.ctaUrlPlaceholder} />
                {(cta === 'whatsapp' || cta === 'phone' || cta === 'contact') && (
                  <p className="text-caption text-muted">{t.ctaDetailsRequired}</p>
                )}
              </div>
            )}

            {/* Phase 3D — article depth / length by topic type. "אוטומטי" lets the
                system pick the range from the topic; others force a depth. */}
            <div className="flex flex-col gap-1.5">
              {/* R29 — five options do not fit a phone: below sm the same choice is a
                  Select (full width), from sm up the Segmented. Same state, same values. */}
              <span id="brief-depth-label" className={FIELD_LABEL_CLASSES}>{t.articleDepthLabel}</span>
              <div className="sm:hidden" data-depth-select="">
                <Select
                  id="brief-depth"
                  aria-labelledby="brief-depth-label"
                  value={articleDepth}
                  onChange={(e) => setArticleDepth(e.target.value as ArticleDepth)}
                  options={depthOptions}
                />
              </div>
              <div className="hidden sm:block" data-depth-segmented="">
                <Segmented<ArticleDepth>
                  ariaLabel={t.articleDepthLabel}
                  value={articleDepth}
                  onChange={(d) => setArticleDepth(d)}
                  options={depthOptions}
                  className="max-w-full"
                />
              </div>
              <p className="max-w-prose text-caption text-muted">{t.articleDepthHint}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Textarea id="brief-secondary" label={t.secondaryKeywords} value={secondaryText} onChange={(e) => setSecondaryText(e.target.value)} rows={2} />
              <p className="text-caption text-muted">{t.secondaryHint}</p>
            </div>

            <Input label={t.targetAudience} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />

            <div className="flex flex-col gap-1.5">
              <Textarea id="brief-angle" label={t.articleAngle} value={articleAngle} onChange={(e) => setArticleAngle(e.target.value)} rows={2} placeholder={t.articleAnglePlaceholder} />
              <p className="text-caption text-muted">{t.articleAngleHelp}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Textarea id="brief-must-include" label={t.mustInclude} value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} rows={3} placeholder={t.mustIncludePlaceholder} />
              <p className="text-caption text-muted">{t.mustIncludeHelp}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Textarea id="brief-must-avoid" label={t.mustAvoid} value={mustAvoid} onChange={(e) => setMustAvoid(e.target.value)} rows={3} placeholder={t.mustAvoidPlaceholder} />
              <p className="text-caption text-muted">{t.mustAvoidHelp}</p>
            </div>

            <div className="space-y-3">
              <Checkbox
                checked={includeBrandName}
                onChange={(checked) => {
                  setIncludeBrandName(checked)
                  if (checked && !brandNameToInclude.trim()) {
                    const proj = projects.find((p) => p.id === projectId)
                    setBrandNameToInclude((proj?.business_name || proj?.name || '').trim())
                  }
                }}
                label={t.includeBrandName}
                description={t.includeBrandNameHint}
              />
              {includeBrandName && (
                <Input
                  label={t.brandNameToInclude}
                  value={brandNameToInclude}
                  onChange={(e) => setBrandNameToInclude(e.target.value)}
                  placeholder={t.brandNamePlaceholder}
                />
              )}
              <Checkbox
                checked={includeManualToc}
                onChange={(checked) => setIncludeManualToc(checked)}
                label={t.includeManualToc}
                description={t.includeManualTocHint}
              />
            </div>

            <div ref={anchorsRef} className="rounded-inset border border-line p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="text-copy font-semibold text-ink">{t.anchorsTitle}</h4>
                <Button size="sm" variant="secondary" onClick={addAnchor}>
                  <Plus aria-hidden="true" className="size-4" />{t.addAnchor}
                </Button>
              </div>
              <p className="mb-3 max-w-prose text-caption text-muted">{t.anchorsHint}</p>
              {badAnchors.size > 0 && <Notice tone="bad" className="mb-3">{t.anchorUrlInvalid}</Notice>}
              <div className="space-y-3">
                {anchors.map((a, i) => (
                  <div key={i} className={`space-y-3 rounded-inset border p-4 ${badAnchors.has(i) ? 'border-bad/40' : 'border-line bg-sunk/60'}`}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label={t.anchorText} value={a.anchor_text} onChange={(e) => updateAnchor(i, { anchor_text: e.target.value })} placeholder={term ? keywordPlaceholder : t.anchorTextPlaceholder} />
                      <Input label={t.targetUrl} type="url" value={a.target_url} onChange={(e) => { updateAnchor(i, { target_url: e.target.value }); if (badAnchors.has(i)) setBadAnchors((p) => { const n = new Set(p); n.delete(i); return n }) }} placeholder={t.targetUrlPlaceholder} error={badAnchors.has(i) ? t.anchorUrlInvalid : undefined} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        aria-label={t.anchorsTitle}
                        value={a.type}
                        onChange={(e) => updateAnchor(i, { type: e.target.value as 'internal' | 'external' })}
                        className="h-10 w-36"
                        options={[{ value: 'internal', label: t.internal }, { value: 'external', label: t.external }]}
                      />
                      <div className="min-w-32 flex-1">
                        <Input type="text" aria-label={t.notePlaceholder} value={a.note} onChange={(e) => updateAnchor(i, { note: e.target.value })} placeholder={t.notePlaceholder} className="h-10" />
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setAnchors((p) => p.filter((_, idx) => idx !== i))} title={t.removeAnchor} aria-label={t.removeAnchor} className="text-bad hover:bg-bad-soft hover:text-bad">
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                    <Checkbox
                      checked={a.required}
                      onChange={(checked) => updateAnchor(i, { required: checked })}
                      label={t.required}
                      description={t.requiredHelp}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Internal-link planning — chosen now, woven into the body at
                generation, then validated + inserted in the editor. */}
            <div className="rounded-inset border border-line p-4">
              <h4 className="mb-1 text-copy font-semibold text-ink">{t.planTitle}</h4>
              <p className="mb-3 max-w-prose text-caption text-muted">{t.planHint}</p>
              {linkCandidates.length === 0 ? (
                <p className="text-caption text-muted">{t.planNone}</p>
              ) : (
                <div className="space-y-3">
                  {(linksExpanded ? linkCandidates : linkCandidates.slice(0, 2)).map((cand) => {
                    const opts = linkOptionsFor(cand)
                    const approved = isLinkApproved(cand.id)
                    const manualVal = linkManual[cand.id] ?? ''
                    const defaultOpt = opts.find((o) => !o.weak) ?? opts[0]
                    const selectVal = linkChoice[cand.id] ?? (defaultOpt?.text ?? '')
                    const selectExtra = selectVal && !opts.some((o) => o.text === selectVal) ? [selectVal] : []
                    const isUrlTarget = cand.kind === 'internal_url'
                    const selectOptions = [
                      ...selectExtra.map((txt) => ({ value: txt, label: txt })),
                      ...opts.map((o) => ({ value: o.text, label: `${o.text} · ${o.label}` })),
                      ...(opts.length === 0 && selectExtra.length === 0 ? [{ value: '', label: '—' }] : []),
                    ]
                    return (
                      <div key={cand.id} className="space-y-2 rounded-inset bg-sunk/60 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-6 items-center">
                            <Checkbox checked={approved} onChange={() => toggleLink(cand)} aria-label={cand.title || t.planInternalTargetFallback} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-copy text-ink">{cand.title || t.planInternalTargetFallback}</span>
                            <a href={cand.url} target="_blank" rel="noopener noreferrer" dir="ltr" title={cand.url} className="block max-w-64 truncate text-caption text-muted hover:text-action hover:underline">{cand.url}</a>
                            {isUrlTarget ? (
                              <Badge variant="neutral" className="mt-1">{t.planInternalTargetBadge}</Badge>
                            ) : (
                              <span className="block text-caption text-muted">{t.planKeyword}: {cand.keyword || '—'}</span>
                            )}
                            {(cand.historicalAnchors?.length ?? 0) > 0 && (
                              <span className="block text-caption text-muted">{t.planHistory}: {cand.historicalAnchors.join(' · ')}</span>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 ps-7">
                          <Select
                            aria-label={t.planTitle}
                            value={selectVal}
                            onChange={(e) => { setLinkManual((p) => ({ ...p, [cand.id]: '' })); setLinkChoice((p) => ({ ...p, [cand.id]: e.target.value })) }}
                            className="h-10 max-w-72"
                            options={selectOptions}
                          />
                          <div className="min-w-40 flex-1">
                            <Input
                              type="text"
                              aria-label={t.planManualPlaceholder}
                              value={manualVal}
                              onChange={(e) => setLinkManual((p) => ({ ...p, [cand.id]: e.target.value }))}
                              placeholder={t.planManualPlaceholder}
                              className="h-10"
                            />
                          </div>
                        </div>
                        <p className="ps-7 text-caption text-muted">{t.planNote}</p>
                      </div>
                    )
                  })}
                  {linkCandidates.length > 2 && (
                    <button type="button" onClick={() => setLinksExpanded((v) => !v)} aria-expanded={linksExpanded} className="inline-flex items-center gap-1 rounded-control text-caption font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                      {linksExpanded ? t.planShowLess : t.planShowMore}
                      <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ease-snappy ${linksExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-2">
          {formError && <Notice tone="bad" className="mb-3">{formError}</Notice>}
          {overlapShown && (
            <div ref={overlapRef} className="mb-3 space-y-2" data-brief-overlap>
              {overlapShown.map(({ topic, overlap }, i) => (
                <div key={topic} className="space-y-1">
                  {overlapShown.length > 1 && <p className="text-caption font-semibold text-muted">{topic}</p>}
                  <OverlapHint
                    overlap={overlap}
                    uiLocale={uiLocale}
                    busy={saving}
                    onCreateAnyway={i === overlapShown.length - 1 ? () => { setOverlaps(null); void handleSave(true) } : undefined}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>{t.cancel}</Button>
            <Button onClick={() => void handleSave()} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
