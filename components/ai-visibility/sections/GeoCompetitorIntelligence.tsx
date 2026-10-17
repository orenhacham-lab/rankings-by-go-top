'use client'

import React from 'react'
import { Globe, Layers, Cpu, TrendingDown } from 'lucide-react'
import { ENGINE_META } from '../EngineIcon'
import { InsightCard } from './InsightCard'
import type { GeoCompetitorIntelligence, CompetitorCategory } from '@/lib/ai-visibility/geo-competitor-intelligence'
import type { BusinessMentionIntelligence } from '@/lib/ai-visibility/geo-business-mentions'
import type { ResultRow, T } from './types'

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * GEO Competitor Intelligence — Phase 2C
 *
 * AI search market intelligence section. Surfaces which sources AI engines
 * trust, what content patterns repeatedly win visibility, how different
 * engines differ, and what tends to replace the project when it loses
 * visibility.
 *
 * Framing: executive intelligence (not analytics dump). Insights first,
 * supporting domain pills are visual texture only. Max 1 percentage per
 * card. Authority scores never exposed in UI.
 */
export function GeoCompetitorIntelligenceSection({
  intelligence,
  businessMentions,
  results,
  isHebrew,
  t,
}: {
  intelligence: GeoCompetitorIntelligence | null
  businessMentions: BusinessMentionIntelligence | null
  results: ResultRow[]
  isHebrew: boolean
  t: T
}) {
  if (!intelligence) return null

  const hasAnyData =
    intelligence.trustedDomains.length > 0 ||
    intelligence.enginePreferences.length > 0 ||
    intelligence.visibilityLossPatterns.dominantDomains.length > 0 ||
    (businessMentions?.mentionedBusinesses.length ?? 0) > 0

  if (!hasAnyData) return null

  // Never expose 'unknown' to users. Returns null to signal "skip this".
  const categoryLabel = (cat: CompetitorCategory): string | null => {
    switch (cat) {
      case 'review': return t('geo_comp_cat_review')
      case 'marketplace': return t('geo_comp_cat_marketplace')
      case 'forum': return t('geo_comp_cat_forum')
      case 'brand': return t('geo_comp_cat_brand')
      case 'editorial': return t('geo_comp_cat_editorial')
      case 'directory': return t('geo_comp_cat_directory')
      default: return null // 'unknown' or any other → hide entirely
    }
  }

  const engineDisplayName = (engine: string): string => {
    const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
    return meta?.name || engine
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1: Recurring websites — focus on specific domains by name.
  // Answers "Who keeps showing up?". No category language (that's Card 3).
  // ─────────────────────────────────────────────────────────────────────
  const trustedSourcesCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const domains = intelligence.trustedDomains
    const topDomain = domains[0]
    const secondDomain = domains[1]

    if (topDomain) {
      // Lead: name the most dominant domain directly
      if (topDomain.uniqueEngineCount >= 3) {
        lines.push({
          text: isHebrew
            ? `${topDomain.domain} הופיע ב-${topDomain.uniqueEngineCount} מנועים שונים.`
            : `${topDomain.domain} recurred across ${topDomain.uniqueEngineCount} different AI engines.`,
          isFirst: true,
        })
      } else {
        lines.push({
          text: isHebrew
            ? `${topDomain.domain} הופיע בעקביות בתוצאות AI.`
            : `${topDomain.domain} stood out with consistent presence across AI answers.`,
          isFirst: true,
        })
      }
    }

    if (secondDomain) {
      lines.push({
        text: isHebrew
          ? `${secondDomain.domain} הופיע גם הוא במספר תוצאות שונות.`
          : `${secondDomain.domain} also appeared in multiple results.`,
        isFirst: false,
      })
    }

    // Closing context line — only if we have 3+ recurring sites
    if (domains.length >= 3) {
      lines.push({
        text: isHebrew
          ? `סך הכל ${domains.length} אתרים חזרו על עצמם בסריקות.`
          : `In total, ${domains.length} websites recurred across scans.`,
        isFirst: false,
      })
    }

    const pills = domains.slice(0, 3).map((d) => d.domain)
    return { lines, pills }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 2: Content patterns — REAL signals about what content appears.
  // Uses only contentSignals (hasList, hasReviewLanguage, etc) from actual
  // geoInsights. Does NOT use citationTypes / URL taxonomy.
  // Answers: "What KIND OF INFORMATION helped the business appear?"
  // Not: "What kind of URL got cited?"
  // DYNAMIC: Shows only insights for signals that are actually strong in this project.
  // ─────────────────────────────────────────────────────────────────────
  const contentStructureCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    // Aggregate content signals from all results with geoInsights
    interface ContentSignalCount {
      hasReviewLanguage: number
      hasPricingLanguage: number
      hasComparisonLanguage: number
      hasRecommendationLanguage: number
      hasList: number
      hasLocalLanguage: number
    }

    const signals: ContentSignalCount = {
      hasReviewLanguage: 0,
      hasPricingLanguage: 0,
      hasComparisonLanguage: 0,
      hasRecommendationLanguage: 0,
      hasList: 0,
      hasLocalLanguage: 0,
    }

    let totalResultsWithSignals = 0
    for (const result of results) {
      if (!result.geoInsights?.contentSignals) continue
      totalResultsWithSignals++
      const cs = result.geoInsights.contentSignals
      if (cs.hasReviewLanguage) signals.hasReviewLanguage++
      if (cs.hasPricingLanguage) signals.hasPricingLanguage++
      if (cs.hasComparisonLanguage) signals.hasComparisonLanguage++
      if (cs.hasRecommendationLanguage) signals.hasRecommendationLanguage++
      if (cs.hasList) signals.hasList++
      if (cs.hasLocalLanguage) signals.hasLocalLanguage++
    }

    // Not enough data — fallback
    if (totalResultsWithSignals === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
      return { lines, pills: [] }
    }

    // Rank signals by frequency
    const rankedSignals = Object.entries(signals)
      .map(([key, count]) => ({
        key,
        count,
        percentage: (count / totalResultsWithSignals) * 100,
      }))
      .filter((s) => s.count > 0) // Only include signals that appeared at least once
      .sort((a, b) => b.count - a.count)

    // If no signals appeared at all, fallback
    if (rankedSignals.length === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
      return { lines, pills: [] }
    }

    // Define signal groups — signals that share similar meaning get one message.
    // A group is shown only if at least one signal in it is STRONG.
    interface SignalGroup {
      signalKeys: string[]
      heMessage: string
      enMessage: string
    }

    const signalGroups: SignalGroup[] = [
      {
        signalKeys: ['hasList', 'hasComparisonLanguage'],
        heMessage: 'רשימות, השוואות ו-FAQ הופיעו יותר בתוצאות מוצלחות.',
        enMessage:
          'List-formatted, comparison, or FAQ content appeared more than generic content.',
      },
      {
        signalKeys: ['hasPricingLanguage'],
        heMessage:
          'בשאלות בנושאי קנייה או בחירת ספק, הופיעו יותר תשובות עם מחיר, יתרונות ופרטי רכישה.',
        enMessage:
          'In purchase or vendor-selection queries, answers with pricing, benefits, and purchase details appeared more often.',
      },
      {
        signalKeys: ['hasReviewLanguage', 'hasRecommendationLanguage'],
        heMessage: 'ביקורות, דירוגים והמלצות חזרו בתשובות שבהן העסק קיבל חשיפה.',
        enMessage:
          'Reviews, ratings, and recommendations recurred in answers where the business appeared.',
      },
      {
        signalKeys: ['hasLocalLanguage'],
        heMessage:
          'בשאלות מקומיות, הופיעו יותר תשובות שכללו אזורי שירות, מיקום או זמינות.',
        enMessage:
          'In local queries, answers that included service areas, location, or availability appeared more often.',
      },
    ]

    // Determine which groups to show: a group is "strong" if at least one signal
    // in it is strong. A signal is strong if: count >= 3, OR in top 3, OR percentage >= 25%.
    const groupsToShow: SignalGroup[] = []

    for (const group of signalGroups) {
      const hasStrongSignal = group.signalKeys.some((signalKey) => {
        const rankedPos = rankedSignals.findIndex((s) => s.key === signalKey)
        if (rankedPos === -1) return false // Signal didn't appear

        const signal = rankedSignals[rankedPos]
        // Strong if: count >= 3, OR in top 3, OR percentage >= 25%
        const isStrong =
          signal.count >= 3 || rankedPos < 3 || signal.percentage >= 25

        return isStrong
      })

      if (hasStrongSignal) {
        groupsToShow.push(group)
      }
    }

    // Display insights for strong groups (max 3)
    const maxInsights = 3
    for (let i = 0; i < groupsToShow.length && i < maxInsights; i++) {
      const group = groupsToShow[i]
      lines.push({
        text: isHebrew ? group.heMessage : group.enMessage,
        isFirst: i === 0,
      })
    }

    // If no groups are strong enough to show, fallback
    if (lines.length === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
    }

    return { lines, pills: [] }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 3: Per-engine source preferences — pure category language, no
  // domain names (avoids overlap with Card 1). Skip engines where no
  // clear category emerges (no generic fallback).
  // ─────────────────────────────────────────────────────────────────────
  const enginePatternsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    const templates = isHebrew
      ? {
          one: (name: string, c1: string) => `${name} הציג בעיקר ${c1}.`,
          two: (name: string, c1: string, c2: string) => `${name} הציג בעיקר ${c1} ו${c2}.`,
        }
      : {
          one: (name: string, c1: string) => `${capitalize(name)} mostly surfaced ${c1}.`,
          two: (name: string, c1: string, c2: string) => `${capitalize(name)} mostly surfaced ${c1} and ${c2}.`,
        }

    let firstLineSet = false
    for (const ep of intelligence.enginePreferences.slice(0, 4)) {
      const name = engineDisplayName(ep.engine)
      if (ep.topCompetitors.length === 0) continue

      // Aggregate categories across this engine's top competitors. Use
      // trustedDomains as the lookup source. Skip 'unknown' categories
      // (categoryLabel returns null) so we never surface debug values.
      const catCount = new Map<CompetitorCategory, number>()
      for (const tc of ep.topCompetitors) {
        const td = intelligence.trustedDomains.find((d) => d.domain === tc.domain)
        if (!td) continue
        if (categoryLabel(td.category) === null) continue // hide 'unknown'
        catCount.set(td.category, (catCount.get(td.category) || 0) + 1)
      }

      const sortedCats = Array.from(catCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c)

      // No identifiable category → skip this engine line entirely.
      // Avoid generic "recurring sources" fallback.
      if (sortedCats.length === 0) continue

      const cat1 = categoryLabel(sortedCats[0])
      const cat2 = sortedCats.length >= 2 ? categoryLabel(sortedCats[1]) : null
      if (!cat1) continue // double-safety

      const text = cat2
        ? templates.two(name, cat1, cat2)
        : templates.one(name, cat1)

      lines.push({ text, isFirst: !firstLineSet })
      firstLineSet = true
    }

    return { lines, pills: [] }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 4: Business mentions only — competitors detected in response text.
  // NO citation domains here. If no business mentions, show a clear fallback
  // (never fall back to domain pills, which would mix sources with
  // competitors).
  // ─────────────────────────────────────────────────────────────────────
  const visibilityLossCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const mentioned = businessMentions?.mentionedBusinesses ?? []

    if (mentioned.length === 0) {
      return { lines, pills: [] }
    }

    // Lead: name the most-mentioned competitor by name.
    const top = mentioned[0]
    if (top.engines.length >= 2) {
      lines.push({
        text: isHebrew
          ? `${top.name} הוזכר ב-${top.mentionCount} תשובות, על פני ${top.engines.length} מנועי AI.`
          : `${top.name} was mentioned in ${top.mentionCount} answers across ${top.engines.length} AI engines.`,
        isFirst: true,
      })
    } else {
      lines.push({
        text: isHebrew
          ? `${top.name} הוזכר ב-${top.mentionCount} תשובות בתוכן של מנועי AI.`
          : `${top.name} was mentioned in ${top.mentionCount} AI answers.`,
        isFirst: true,
      })
    }

    // Secondary: second competitor by name.
    if (mentioned[1]) {
      const second = mentioned[1]
      lines.push({
        text: isHebrew
          ? `${second.name} גם הוא הוזכר במספר תשובות שונות.`
          : `${second.name} was also mentioned in multiple answers.`,
        isFirst: false,
      })
    }

    // Tertiary: total competitors detected
    if (mentioned.length >= 3) {
      lines.push({
        text: isHebrew
          ? `סך הכל ${mentioned.length} מתחרים מהרשימה הוזכרו בתשובות.`
          : `In total, ${mentioned.length} listed competitors were mentioned in answers.`,
        isFirst: false,
      })
    }

    const pills = mentioned.slice(0, 3).map((b) => b.name)
    return { lines, pills }
  })()

  const pillsFooter = (pills: string[], label?: string) =>
    pills.length > 0 ? (
      <p className="text-caption text-muted">
        {label && <span className="font-medium">{label}: </span>}
        <span className="text-body">{pills.join(' · ')}</span>
      </p>
    ) : undefined

  return (
    <section className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div>
        <h3 className="text-section font-semibold text-ink">{t('geo_comp_title')}</h3>
        <p className="mt-0.5 text-caption text-muted">{t('geo_comp_subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InsightCard
          title={t('geo_comp_card_sources')}
          icon={<Globe />}
          lines={trustedSourcesCard.lines}
          footer={pillsFooter(trustedSourcesCard.pills, t('geo_comp_pills_label'))}
          emptyText={t('geo_comp_no_data_sources')}
          t={t}
        />
        <InsightCard
          title={t('geo_comp_card_content')}
          icon={<Layers />}
          lines={contentStructureCard.lines}
          footer={pillsFooter(contentStructureCard.pills)}
          emptyText={t('geo_comp_no_data_content')}
          t={t}
        />
        <InsightCard
          title={t('geo_comp_card_engines')}
          icon={<Cpu />}
          lines={enginePatternsCard.lines}
          footer={pillsFooter(enginePatternsCard.pills)}
          emptyText={t('geo_comp_no_data_engines')}
          t={t}
        />
        <InsightCard
          title={t('geo_comp_card_loss')}
          icon={<TrendingDown />}
          lines={visibilityLossCard.lines}
          badge={visibilityLossCard.lines.length > 0 ? t('geo_comp_loss_badge') : undefined}
          footer={pillsFooter(visibilityLossCard.pills, t('geo_comp_pills_label_competitors'))}
          emptyText={t('geo_comp_no_data_loss')}
          t={t}
        />
      </div>
    </section>
  )
}
