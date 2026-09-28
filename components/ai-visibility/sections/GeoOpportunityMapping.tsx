'use client'

import React from 'react'
import { BarChart3, AlertTriangle, Cpu, TrendingDown, SearchX } from 'lucide-react'
import { ENGINE_META } from '../EngineIcon'
import type { ContentSignalKey, GeoOpportunityMapping } from '@/lib/ai-visibility/geo-opportunity-mapping'
import type { ResultRow, T } from './types'

/**
 * GEO Opportunity Mapping — actionable recommendations panel.
 *
 * Answers: "What should I improve on my website so AI engines show me more?"
 *
 * Dynamic card count: each card renders ONLY if it has a real opportunity.
 * If no card has data, a single fallback message is shown.
 *
 * Possible cards (deterministic, data-driven, no inventions):
 *   1. תוכן שכדאי לחזק — weak content signals to strengthen
 *   2. שאלות שבהן העסק חלש — specific prompts where business is missing/weak
 *   3. מנועים שכדאי לחזק — engines with significantly low visibility
 *   4. מה חסר כשהעסק לא מופיע — content patterns missing from failed results
 */
export function GeoOpportunityMappingSection({
  mapping,
  results,
  isHebrew,
  t,
}: {
  mapping: GeoOpportunityMapping | null
  results: ResultRow[]
  isHebrew: boolean
  t: T
}) {
  if (!mapping || mapping.totalResults === 0) {
    return null
  }

  const engineDisplayName = (engine: string): string => {
    const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
    return meta?.name || engine
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1 templates: actionable instruction per weak content signal.
  // Each phrase is the full sentence (no trailing fragment), so they
  // read naturally on their own.
  // ─────────────────────────────────────────────────────────────────────
  const weakSignalRecommendation = (
    signal: ContentSignalKey,
    lang: 'he' | 'en',
  ): string => {
    if (lang === 'he') {
      switch (signal) {
        case 'pricing':
          return 'להוסיף באתר מידע ברור על מחירים, טווחי מחיר ומה כלול בשירות.'
        case 'reviews':
          return 'להציג ביקורות, דירוגים ועדויות לקוחות באזורים בולטים באתר.'
        case 'comparison':
          return 'להוסיף עמודי השוואה שיעזרו ללקוח לבחור בין מוצרים, שירותים או אפשרויות.'
        case 'list':
          return 'להוסיף שאלות נפוצות, רשימות ותשובות קצרות לשאלות שחוזרות אצל לקוחות.'
        case 'recommendation':
          return 'להוסיף תוכן המלצה שמסביר ללקוח כיצד לבחור את הפתרון המתאים לו.'
        case 'local':
          return 'להבליט אזורי שירות, כתובת, זמינות ומידע מקומי רלוונטי.'
      }
    }
    switch (signal) {
      case 'pricing':
        return 'Add clear pricing information, price ranges, and what is included.'
      case 'reviews':
        return 'Display reviews, ratings, and customer testimonials in prominent areas of the site.'
      case 'comparison':
        return 'Add comparison pages that help customers choose between products, services, or options.'
      case 'list':
        return 'Add FAQs, lists, and concise answers to recurring customer questions.'
      case 'recommendation':
        return 'Add recommendation content explaining how to choose the right solution.'
      case 'local':
        return 'Highlight service areas, address, availability, and relevant local information.'
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 4 templates: structured as "X appeared less when business
  // didn't appear. Worth doing Y."
  // ─────────────────────────────────────────────────────────────────────
  const missingSignalRecommendation = (
    signal: ContentSignalKey,
    lang: 'he' | 'en',
  ): string => {
    if (lang === 'he') {
      switch (signal) {
        case 'pricing':
          return 'בשאלות שבהן העסק לא הופיע, היה פחות מידע מסחרי. כדאי להציג טווחי מחיר, מה כלול בשירות ותנאי רכישה.'
        case 'reviews':
          return 'בשאלות שבהן העסק לא הופיע, חסרו הוכחות אמון. כדאי להבליט ביקורות, דירוגים ועדויות לקוחות.'
        case 'comparison':
          return 'בשאלות שבהן העסק לא הופיע, חסרו השוואות ברורות. כדאי להוסיף עמודים שיעזרו ללקוח לבחור בין אפשרויות.'
        case 'list':
          return 'בשאלות שבהן העסק לא הופיע, חסרו תשובות מסודרות. כדאי להוסיף שאלות נפוצות ותשובות קצרות לשאלות מרכזיות.'
        case 'recommendation':
          return 'בשאלות שבהן העסק לא הופיע, חסר תוכן המלצה. כדאי להוסיף תוכן שמכוון את הלקוח לבחירה הנכונה עבורו.'
        case 'local':
          return 'בשאלות שבהן העסק לא הופיע, חסר מידע מקומי. כדאי להבליט אזורי שירות, כתובת וזמינות.'
      }
    }
    switch (signal) {
      case 'pricing':
        return 'Pricing information appeared less when the business did not appear. Worth displaying price ranges, what is included, and purchase terms.'
      case 'reviews':
        return 'Reviews and ratings appeared less when the business did not appear. Worth highlighting customer testimonials and trust signals.'
      case 'comparison':
        return 'Comparison content appeared less when the business did not appear. Worth adding pages that compare services, products, or options.'
      case 'list':
        return 'FAQ and structured content appeared less when the business did not appear. Worth adding clear answers to key recurring questions.'
      case 'recommendation':
        return 'Recommendation content appeared less when the business did not appear. Worth adding guidance that helps customers choose.'
      case 'local':
        return 'Local information appeared less when the business did not appear. Worth highlighting service areas, address, and availability.'
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1: Content to strengthen — weak content signals only.
  // A signal is "weak" if its visibilityRate is below 60% (genuinely
  // underperforming in the project's successful answers).
  // ─────────────────────────────────────────────────────────────────────
  const contentStrengthCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const weak = mapping.contentSignals
      .filter((s) => s.visibilityRate < 60)
      .sort((a, b) => a.visibilityRate - b.visibilityRate)
      .slice(0, 3)

    if (weak.length === 0) return []

    weak.forEach((signal, idx) => {
      lines.push({
        text: weakSignalRecommendation(signal.signal, isHebrew ? 'he' : 'en'),
        isFirst: idx === 0,
      })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 2: Specific prompts where business is missing or nearly missing.
  // For each prompt, count how many engines featured the business vs.
  // total engines scanned. Only show prompts where the business is in
  // 0 engines OR at most 1 out of 3+ engines.
  // ─────────────────────────────────────────────────────────────────────
  const weakPromptsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    // Group results by prompt text (fallback to promptId if no text).
    const byPrompt = new Map<string, { promptText: string; total: number; success: number }>()
    for (const r of results) {
      const key = r.promptText?.trim() || r.promptId || ''
      if (!key) continue
      const isSuccess = r.displayMentioned || r.displayCited
      const entry = byPrompt.get(key) || { promptText: r.promptText || '', total: 0, success: 0 }
      entry.total += 1
      if (isSuccess) entry.success += 1
      byPrompt.set(key, entry)
    }

    // Only count prompts with enough engine coverage (at least 2 scans),
    // so single-engine prompts don't pollute the list.
    const weakPrompts = Array.from(byPrompt.values())
      .filter((p) => p.total >= 2 && p.promptText)
      .map((p) => ({
        ...p,
        rate: Math.round((p.success / p.total) * 100),
      }))
      .filter((p) => p.rate <= 25) // missing or near-missing
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)

    if (weakPrompts.length === 0) return []

    weakPrompts.forEach((p, idx) => {
      // Truncate long prompts so the card stays scannable.
      const promptDisplay = p.promptText.length > 90
        ? p.promptText.slice(0, 90).trim() + '…'
        : p.promptText
      const actionText = isHebrew
        ? 'צרו עמוד תוכן או FAQ שעונה לשאלה הזו.'
        : 'Consider creating a content page or FAQ section that directly answers this question.'
      const text = isHebrew
        ? `בשאלה "${promptDisplay}" העסק לא הופיע. מומלץ ליצור עמוד תוכן או FAQ שעונה לה ישירות.`
        : `The business did not appear for: "${promptDisplay}"\n${actionText}`
      lines.push({ text, isFirst: idx === 0 })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 3: Engines worth strengthening — engines where visibility is
  // significantly low (rate < 50% AND clearly below the overall average).
  // ─────────────────────────────────────────────────────────────────────
  const weakEnginesCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    const avgRate = mapping.totalResults > 0
      ? Math.round((mapping.totalSuccess / mapping.totalResults) * 100)
      : 0

    const underperforming = mapping.enginePatterns
      .map((e) => ({
        engine: e.engine,
        rate: e.totalScans > 0 ? Math.round((e.totalSuccess / e.totalScans) * 100) : 0,
      }))
      // Threshold: must be both <50% AND at least 10 points below average.
      .filter((e) => e.rate < 50 && e.rate <= avgRate - 10)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)

    if (underperforming.length === 0) return []

    underperforming.forEach((e, idx) => {
      const name = engineDisplayName(e.engine)
      const text = isHebrew
        ? `${name}: העסק מופיע רק ב-${e.rate}% מהשאלות. חזקו את התוכן שמתאים למנוע הזה.`
        : `On ${name}, the business appears in only ${e.rate}% of questions. Worth investing in strengthening relevant content for this engine.`
      lines.push({ text, isFirst: idx === 0 })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 4: What's missing when the business doesn't appear.
  // Uses mapping.missingOpportunities. Dedupes by signal — each content
  // signal yields a unique sentence, so no repetition.
  // ─────────────────────────────────────────────────────────────────────
  const missingGapsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const seen = new Set<string>()

    const impactful = mapping.missingOpportunities
      .filter((m) => m.category === 'content' && m.failureRate >= 50)

    for (const miss of impactful) {
      const key = String(miss.signal)
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({
        text: missingSignalRecommendation(miss.signal as ContentSignalKey, isHebrew ? 'he' : 'en'),
        isFirst: lines.length === 0,
      })
      if (lines.length >= 3) break
    }
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Build the visible card list. Only cards with real opportunities
  // are rendered; otherwise the section shows a single fallback.
  // ─────────────────────────────────────────────────────────────────────
  type CardSpec = {
    title: string
    tone: 'emerald' | 'blue' | 'indigo' | 'amber'
    icon: React.ReactNode
    sentences: Array<{ text: string; isFirst?: boolean }>
  }
  const cards: CardSpec[] = []
  if (contentStrengthCard.length > 0) {
    cards.push({
      title: isHebrew ? 'תוכן שכדאי לחזק' : 'Content to strengthen',
      tone: 'emerald',
      icon: <BarChart3 className="w-5 h-5" />,
      sentences: contentStrengthCard,
    })
  }
  if (weakPromptsCard.length > 0) {
    cards.push({
      title: isHebrew ? 'שאלות שבהן העסק לא הופיע' : 'Questions where the business is weak',
      tone: 'blue',
      icon: <TrendingDown className="w-5 h-5" />,
      sentences: weakPromptsCard,
    })
  }
  if (weakEnginesCard.length > 0) {
    cards.push({
      title: isHebrew ? 'מנועים שכדאי לחזק' : 'Engines worth strengthening',
      tone: 'indigo',
      icon: <Cpu className="w-5 h-5" />,
      sentences: weakEnginesCard,
    })
  }
  if (missingGapsCard.length > 0) {
    cards.push({
      title: isHebrew ? 'מה חסר כשהעסק לא מופיע' : 'What is missing when the business does not appear',
      tone: 'amber',
      icon: <SearchX className="w-5 h-5" />,
      sentences: missingGapsCard,
    })
  }

  const fallbackText = isHebrew
    ? 'כרגע לא זוהתה חולשה ברורה. כדי לקבל המלצות מדויקות יותר, מומלץ להריץ עוד שאלות ומנועים.'
    : 'No clear weakness detected at the moment. To get more accurate recommendations, it is recommended to run more questions and engines.'

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('geo_opp_title')}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {t('geo_opp_subtitle')}
          </p>
        </div>
        <span className="text-[11px] text-muted whitespace-nowrap">
          {mapping.totalSuccess}/{mapping.totalResults}
        </span>
      </div>

      {mapping.totalResults < 20 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {t('geo_opp_small_sample_warning')}
          </p>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-xs text-muted italic">{fallbackText}</p>
      ) : (
        <div className={`grid grid-cols-1 ${cards.length > 1 ? 'md:grid-cols-2' : ''} gap-3`}>
          {cards.map((card, i) => (
            <OpportunityCard
              key={i}
              title={card.title}
              tone={card.tone}
              icon={card.icon}
              sentences={card.sentences}
              emptyText=""
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OpportunityCard({
  title,
  tone,
  icon,
  sentences,
  emptyText,
}: {
  title: string
  tone: 'emerald' | 'blue' | 'indigo' | 'amber'
  icon: React.ReactNode
  sentences: Array<{ text: string; isFirst?: boolean; isPrelim?: boolean; isEmpty?: boolean }>
  emptyText: string
}) {
  const accent =
    tone === 'emerald'
      ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-900/10'
      : tone === 'blue'
      ? 'border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10'
      : tone === 'indigo'
      ? 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-900/10'
      : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-900/10'

  const iconTone =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'blue'
      ? 'text-blue-600 dark:text-blue-400'
      : tone === 'indigo'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-amber-600 dark:text-amber-400'

  return (
    <div className={`rounded-xl border ${accent} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`${iconTone}`} aria-hidden="true">{icon}</div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      </div>
      {sentences.length > 0 ? (
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {sentences.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-muted flex-shrink-0">•</span>
              <span className={item.isFirst ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted italic">{emptyText}</p>
      )}
    </div>
  )
}
