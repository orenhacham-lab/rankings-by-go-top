import type { GeoInsights } from '@/lib/ai-visibility/geo-signals'
import type { createI18n } from '@/lib/ai-visibility/i18n'

/** Shapes shared by the AI visibility tool and its sections (moved from AIVisibilitySection.tsx). */

export type ResultRow = {
  id: string
  runId: string
  promptId: string | null
  engine: string
  promptText: string
  // Raw DB values — never overwritten.
  mentioned: boolean
  targetCited: boolean
  citationCount: number
  status: string | null
  scannedAt: string | null
  citations: Array<{ domain: string; is_target_domain: boolean; url: string; title?: string | null }>
  responseText: string | null
  excludedFromScore: boolean
  // Server-computed display values — present from /api/ai-visibility/runs;
  // used everywhere the UI counts or labels mentions/citations.
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
  // Strict 4-signal model — distinguishes an answer-text mention from a
  // source/citation. citedAsSource is true ONLY when a project domain is in the
  // sources list (never when the domain merely appears in the answer body).
  mentionedInAnswer: boolean
  citedAsSource: boolean
  domainMentioned: boolean
  brandMentioned: boolean
  domainInAnswerLabel: string | null
  domainInSourceLabel: string | null
  // GEO Insights — server-computed, rule-based, read-only. Drawer-only UI.
  geoInsights: GeoInsights | null
}

export const EMPTY_GEO_INSIGHTS: GeoInsights = {
  queryIntents: [],
  citationTypes: [],
  contentSignals: {
    hasList: false,
    hasComparisonLanguage: false,
    hasPricingLanguage: false,
    hasReviewLanguage: false,
    hasLocalLanguage: false,
    hasRecommendationLanguage: false,
  },
}

export type PromptRow = {
  id: string
  prompt: string
  country: string | null
  language: string | null
  target_domain: string | null
  target_brand_name: string | null
  created_at: string
}

export type GlobalMetrics = {
  totalScans: number
  totalMentions: number
  totalCitations: number
  mentionRate: number
  citationRate: number
  enginesCovered: number
  enginesWithMentions: number
}

export type EngineMetrics = {
  engine: string
  scans: number
  mentions: number
  citations: number
  rate: number
}

export type TabType = 'results' | 'queries' | 'insights' | 'competitors'

export type CompetitorAnalysisData = {
  project: { name: string | null; mentionsCount: number; totalResults: number; mentionRate: number } | null
  competitors: Array<{ id: string; name: string; mentionsCount: number; mentionRate: number }>
}

export type PromptInsight = {
  totalEngines: number
  businessMentionEngines: number
  mentionRate: number
  targetCitedCount: number
  status: 'missing' | 'weak' | 'medium' | 'good'
}

/** The tool's word lookup (lib/ai-visibility/i18n.ts). */
export type T = ReturnType<typeof createI18n>
export type I18nKey = Parameters<T>[0]
