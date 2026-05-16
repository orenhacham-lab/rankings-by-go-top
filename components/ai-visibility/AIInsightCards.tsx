'use client'

/**
 * AI Insight Cards — visual intelligence extraction from AI scan results.
 *
 * Moves the product feel from "raw response viewer" to "intelligence dashboard"
 * by surfacing extracted signals as scannable cards: brand mentions, competitor
 * detection, citation sources, recommendation presence, engine performance.
 */

import { useMemo } from 'react'
import { Users, Link2, Lightbulb, CheckCircle2, Circle } from 'lucide-react'
import { ENGINE_META } from './EngineIcon'

export type Citation = {
  id: string
  url: string
  domain: string
  title: string | null
  snippet: string | null
  citation_position: number | null
  is_target_domain: boolean
}

export type InsightInput = {
  responseText: string | null
  mentioned: boolean
  targetCited: boolean
  citations: Citation[]
  engine: string
  targetDomain: string | null
  targetBrand: string | null
}

/**
 * Extract candidate competitor/brand names from response text.
 * Looks for capitalized multi-word phrases (likely brand names) and known patterns.
 */
function extractBrandsFromText(text: string, ownBrand: string | null): string[] {
  if (!text) return []

  const ownLower = (ownBrand || '').toLowerCase()
  const candidates = new Set<string>()

  // Capitalized brand patterns: "Studio X", "ABC Marketing", "BrandName Pro"
  const brandPattern = /\b([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|&|and|of)\b){0,3})\b/g
  let m: RegExpExecArray | null
  while ((m = brandPattern.exec(text)) !== null) {
    const name = m[1].trim()
    // Filter noise: too short, common words, contains own brand
    if (name.length < 3) continue
    if (/^(The|And|But|For|With|This|That|Here|There|When|Where|How|Why)/.test(name)) continue
    if (ownLower && name.toLowerCase().includes(ownLower)) continue
    candidates.add(name)
  }

  // Hebrew brand patterns (consecutive Hebrew words, 2-4 words)
  const hebrewBrandPattern = /([֐-׿]{2,}(?:\s+[֐-׿]{2,}){1,3})/g
  while ((m = hebrewBrandPattern.exec(text)) !== null) {
    const name = m[1].trim()
    if (name.length < 4) continue
    if (ownLower && name.toLowerCase().includes(ownLower)) continue
    // Skip very common Hebrew phrases
    if (/^(של ה|של|את ה|את|כל ה|כל|כי|אבל|כדי)/.test(name)) continue
    candidates.add(name)
  }

  return Array.from(candidates).slice(0, 6)
}

/**
 * Detect recommendation/positive sentiment about target brand in answer text.
 */
function detectRecommendation(text: string, targetBrand: string | null): boolean {
  if (!text || !targetBrand) return false
  const lower = text.toLowerCase()
  const brandLower = targetBrand.toLowerCase()

  if (!lower.includes(brandLower)) return false

  // Recommendation markers around brand mention
  const recommendMarkers = [
    'recommend', 'best', 'top', 'leading', 'preferred', 'choice', 'excellent',
    'מומלץ', 'מומלצת', 'מומלצות', 'הטוב', 'הטובה', 'מוביל', 'מובילה', 'מובילות', 'מצוין', 'מצוינת',
  ]

  const brandIdx = lower.indexOf(brandLower)
  const window = lower.substring(Math.max(0, brandIdx - 100), Math.min(lower.length, brandIdx + 100))
  return recommendMarkers.some((m) => window.includes(m))
}

/**
 * Group citations by domain frequency, ranked by mention count.
 */
function getTopCitedDomains(citations: Citation[]): Array<{ domain: string; count: number; isTarget: boolean }> {
  const map = new Map<string, { count: number; isTarget: boolean }>()
  for (const c of citations) {
    const existing = map.get(c.domain)
    map.set(c.domain, {
      count: (existing?.count || 0) + 1,
      isTarget: existing?.isTarget || c.is_target_domain,
    })
  }
  return Array.from(map.entries())
    .map(([domain, info]) => ({ domain, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

/**
 * Compute extracted intelligence from response text + citations.
 */
function computeInsights(input: InsightInput) {
  const text = input.responseText || ''
  const competitors = extractBrandsFromText(text, input.targetBrand)
  const topDomains = getTopCitedDomains(input.citations)
  const hasRecommendation = detectRecommendation(text, input.targetBrand)
  const responseWordCount = text.split(/\s+/).filter(Boolean).length

  return {
    competitors,
    topDomains,
    hasRecommendation,
    responseWordCount,
    sourceCount: input.citations.length,
    targetCitationCount: input.citations.filter((c) => c.is_target_domain).length,
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Insight Cards Grid
 * ─────────────────────────────────────────────────────────────────────────── */

type AIInsightCardsProps = {
  input: InsightInput
  isHebrew: boolean
}

export default function AIInsightCards({ input, isHebrew }: AIInsightCardsProps) {
  const insights = useMemo(() => computeInsights(input), [input])
  const engineMeta = ENGINE_META[input.engine]

  const L = isHebrew
    ? {
        brand_mention: 'הזכרת מותג',
        domain_cite: 'ציטוט דומיין',
        competitors: 'מתחרים שזוהו',
        sources: 'מקורות מובילים',
        recommendation: 'המלצה זוהתה',
        engine: 'מנוע סורק',
        mentioned: 'הוזכר בתשובה',
        not_mentioned: 'לא הוזכר',
        cited: 'מצוטט כמקור',
        not_cited: 'לא צוטט',
        recommended: 'המותג שלך מומלץ',
        not_recommended: 'ללא המלצה ברורה',
        no_competitors: 'לא זוהו מתחרים',
        no_sources: 'אין מקורות מצוטטים',
        your_domain: 'הדומיין שלך',
        times: 'פעמים',
      }
    : {
        brand_mention: 'Brand Mention',
        domain_cite: 'Domain Cited',
        competitors: 'Competitors Detected',
        sources: 'Top Sources',
        recommendation: 'Recommendation',
        engine: 'Engine',
        mentioned: 'Mentioned in answer',
        not_mentioned: 'Not mentioned',
        cited: 'Cited as source',
        not_cited: 'Not cited',
        recommended: 'Your brand is recommended',
        not_recommended: 'No clear recommendation',
        no_competitors: 'No competitors detected',
        no_sources: 'No sources cited',
        your_domain: 'Your domain',
        times: 'mentions',
      }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <div className="flex items-center gap-1.5">
          <Lightbulb size={14} className="text-slate-400" strokeWidth={2} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {isHebrew ? 'תובנות AI' : 'AI Insights'}
          </span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* Row 1: Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InsightCard
          label={L.brand_mention}
          status={input.mentioned ? 'positive' : 'neutral'}
          headline={input.mentioned ? L.mentioned : L.not_mentioned}
          icon={input.mentioned ? CheckCircle2 : Circle}
        />
        <InsightCard
          label={L.domain_cite}
          status={input.targetCited ? 'positive' : 'neutral'}
          headline={input.targetCited ? L.cited : L.not_cited}
          icon={input.targetCited ? CheckCircle2 : Circle}
          subtext={
            insights.targetCitationCount > 0 ? `${insights.targetCitationCount} ${L.times}` : undefined
          }
        />
        <InsightCard
          label={L.recommendation}
          status={insights.hasRecommendation ? 'positive' : 'neutral'}
          headline={insights.hasRecommendation ? L.recommended : L.not_recommended}
          icon={insights.hasRecommendation ? CheckCircle2 : Circle}
        />
      </div>

      {/* Row 2: Competitors + Top Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ListCard
          label={L.competitors}
          icon={Users}
          isEmpty={insights.competitors.length === 0}
          emptyText={L.no_competitors}
        >
          <div className="flex flex-wrap gap-1.5 mt-2">
            {insights.competitors.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
              >
                {c}
              </span>
            ))}
          </div>
        </ListCard>

        <ListCard
          label={L.sources}
          icon={Link2}
          isEmpty={insights.topDomains.length === 0}
          emptyText={L.no_sources}
        >
          <div className="space-y-1.5 mt-2">
            {insights.topDomains.map((d) => (
              <div
                key={d.domain}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs ${
                  d.isTarget
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border border-slate-200 text-slate-700'
                }`}
              >
                <span className="font-mono truncate flex-1">{d.domain}</span>
                {d.isTarget && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-semibold whitespace-nowrap">
                    {L.your_domain}
                  </span>
                )}
                <span className="font-bold text-[11px] tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </ListCard>
      </div>

      {/* Engine performance row */}
      {engineMeta && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-white border border-slate-200">
          <engineMeta.Icon size={20} />
          <div className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {L.engine}
            </div>
            <div className="text-sm font-semibold text-slate-900">{engineMeta.name}</div>
          </div>
          <div className="text-[11px] text-slate-500">
            {insights.responseWordCount} {isHebrew ? 'מילים בתשובה' : 'words in answer'}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * Subcomponents
 * ─────────────────────────────────────────────────────────────────────────── */

function InsightCard({
  label,
  status,
  headline,
  icon: IconComponent,
  subtext,
}: {
  label: string
  status: 'positive' | 'neutral'
  headline: string
  icon: React.ComponentType<{ size: number; strokeWidth: number }>
  subtext?: string
}) {
  const styles =
    status === 'positive'
      ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white'
      : 'border-slate-200 bg-gradient-to-br from-slate-50/40 to-white'

  const iconStyles =
    status === 'positive'
      ? 'text-emerald-600'
      : 'text-slate-400'

  return (
    <div className={`relative overflow-hidden rounded-xl border p-3.5 shadow-sm hover:shadow-md transition ${styles}`}>
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 flex items-center justify-center ${iconStyles}`}>
          <IconComponent size={18} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
            {label}
          </div>
          <div className="text-sm font-semibold text-slate-900 leading-tight">{headline}</div>
          {subtext && <div className="text-[11px] text-slate-500 mt-0.5">{subtext}</div>}
        </div>
      </div>
    </div>
  )
}

function ListCard({
  label,
  icon: IconComponent,
  isEmpty,
  emptyText,
  children,
}: {
  label: string
  icon: React.ComponentType<{ size: number; strokeWidth: number }>
  isEmpty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center gap-2 mb-1 text-slate-500">
        <IconComponent size={16} strokeWidth={2} />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      {isEmpty ? (
        <div className="text-xs text-slate-400 italic mt-2 py-2">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  )
}
