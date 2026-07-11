/**
 * Query Intelligence System
 *
 * Transforms generic prompts into intelligent, scored AI questions.
 * Analyzes intent, commercial potential, local relevance, AI-likelihood.
 *
 * NOT template-based. Uses business context to generate specific, premium questions.
 *
 * Scoring model:
 *   - recommendationScore (0-100): likelihood of being discussed in AI answers
 *   - commercialScore (0-100): transactional/commercial intent
 *   - localScore (0-100): location-specific relevance
 *   - aiLikelihoodScore (0-100): probability of AI engines having strong, diverse answers
 */

export type QueryIntent =
  | 'brand'
  | 'comparison'
  | 'commercial'
  | 'local'
  | 'informational'
  | 'transactional'
  | 'alternatives'
  | 'best-of'

export type QueryCategory =
  | 'agency'
  | 'ecommerce'
  | 'saas'
  | 'local_service'
  | 'florist'
  | 'restaurant'
  | 'healthcare'
  | 'legal'
  | 'real_estate'
  | 'fitness'
  | 'beauty'
  | 'education'
  | 'generic'

export type ScoredQuery = {
  id: string
  query: string
  intent: QueryIntent
  category: QueryCategory
  language: string

  // Scoring (0-100)
  recommendationScore: number
  commercialScore: number
  localScore: number
  aiLikelihoodScore: number

  // Composite score (0-100) — higher = better for AI Search Visibility
  overallScore: number
}

/**
 * Detect business category from signals.
 * Enhanced to recognize SEO/SEM/PPC/digital marketing as 'agency'.
 */
export function detectQueryCategory(
  businessName: string,
  domain: string,
  keywords: string[] = []
): QueryCategory {
  const text = `${businessName} ${domain} ${keywords.join(' ')}`.toLowerCase()

  if (/(seo|ppc|sem|google ads|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל|ppc|google ads|search engine|קידום)/.test(text))
    return 'agency'
  if (/(shop|store|ecommerce|חנות|קניות|אונליין|retail|buy|sell)/.test(text)) return 'ecommerce'
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai|טכנולוגיה)/.test(text)) return 'saas'
  if (/(flower|florist|פרחים|זרים|זר|flowers)/.test(text)) return 'florist'
  if (/(restaurant|cafe|food|bistro|מסעדה|קפה|אוכל|פיצה|ביסטרו|חלב וביצים)/.test(text)) return 'restaurant'
  if (/(clinic|hospital|medical|doctor|dental|מרפאה|רופא|רפואה|שיניים|health)/.test(text)) return 'healthcare'
  if (/(law|legal|attorney|lawyer|עורך דין|עורכי דין|משפט)/.test(text)) return 'legal'
  if (/(realty|real.estate|properties|נדל"ן|נדלן|דירות|real estate|realtor)/.test(text)) return 'real_estate'
  if (/(gym|fitness|yoga|crossfit|כושר|יוגה|sports)/.test(text)) return 'fitness'
  if (/(salon|spa|beauty|hair|nails|מספרה|ספא|יופי|cosmetics)/.test(text)) return 'beauty'
  if (/(school|academy|course|education|מכללה|בית ספר|קורס|training)/.test(text)) return 'education'
  if (/(electrician|plumber|cleaner|hvac|חשמלאי|אינסטלטור|ניקיון|contractor|repair)/.test(text))
    return 'local_service'

  return 'generic'
}

/**
 * Analyze query intent from text patterns.
 * Returns highest-confidence intent.
 */
export function analyzeQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase()

  // Best-of: "best X", "top X", "leading X"
  if (/(best|top|leading|greatest|finest|superior|premier)/.test(q)) return 'best-of'

  // Alternatives: "instead of", "alternative to", "like X but"
  if (/(alternative|instead|other than|compared to|vs|versus|rather than)/.test(q)) return 'alternatives'

  // Commercial: "buy", "price", "cost", "plan", "package"
  if (/(buy|purchase|price|cost|how much|package|plan|pricing|cheap|expensive|invest|hire)/.test(q))
    return 'commercial'

  // Transactional: "how to", "steps", "process", "choose", "select"
  if (/(how to|how do|steps|process|choose|select|decide|pick|find)/.test(q)) return 'transactional'

  // Local: contains city/location references
  if (/(in (il|israel|תל אביב|ירושלים|חיפה|בגבעתיים|בר|גרזה)|near|nearby|local|local)/.test(q))
    return 'local'

  // Comparison: "vs", "better than", "difference"
  if (/(vs|versus|compared to|difference between|better than|worse than|advantages)/.test(q)) return 'comparison'

  // Informational: "what", "who", "why"
  if (/(what|who|why|which|where|when|how|explain|tell|provide)/.test(q)) return 'informational'

  // Brand: mentions company/brand name
  if (/([A-Z][a-z]+ ?)/.test(query) || /([A-Z][a-z]+ [A-Z][a-z]+)/.test(query)) return 'brand'

  // Default to informational
  return 'informational'
}

/**
 * Score recommendation likelihood (0-100).
 * How likely is this query to be discussed with recommendations in AI answers?
 */
export function scoreRecommendation(intent: QueryIntent, category: QueryCategory): number {
  const intentBoost: Record<QueryIntent, number> = {
    'best-of': 95,
    comparison: 85,
    alternatives: 90,
    brand: 70,
    commercial: 60,
    transactional: 65,
    local: 55,
    informational: 40,
  }

  const categoryBoost: Record<QueryCategory, number> = {
    agency: 90,
    local_service: 85,
    saas: 75,
    fitness: 75,
    beauty: 80,
    healthcare: 70,
    legal: 75,
    restaurant: 60,
    real_estate: 70,
    education: 65,
    ecommerce: 55,
    florist: 50,
    generic: 40,
  }

  return Math.min(100, Math.round((intentBoost[intent] + categoryBoost[category]) / 2))
}

/**
 * Score commercial/transactional likelihood (0-100).
 * How likely to surface buying intent and commercial entities?
 */
export function scoreCommercial(intent: QueryIntent, category: QueryCategory): number {
  const intentBoost: Record<QueryIntent, number> = {
    commercial: 95,
    transactional: 85,
    'best-of': 75,
    alternatives: 70,
    comparison: 65,
    local: 50,
    brand: 60,
    informational: 30,
  }

  const categoryBoost: Record<QueryCategory, number> = {
    ecommerce: 90,
    agency: 85,
    local_service: 75,
    saas: 70,
    real_estate: 80,
    legal: 70,
    healthcare: 65,
    restaurant: 70,
    fitness: 60,
    beauty: 65,
    education: 50,
    florist: 60,
    generic: 30,
  }

  return Math.min(100, Math.round((intentBoost[intent] + categoryBoost[category]) / 2))
}

/**
 * Score local relevance (0-100).
 * How location-specific is this query?
 */
export function scoreLocal(intent: QueryIntent, query: string): number {
  const baseScore = intent === 'local' ? 80 : 20

  // Location indicators
  if (
    /(בתל אביב|בירושלים|בחיפה|בבאר שבע|בגבעתיים|בהרצליה|בגדרה|בתל אביב|בראשון לציון|בפתח תקוה|in tel aviv|in jerusalem|in haifa|in israel|near|local|location-based)/i.test(
      query
    )
  ) {
    return Math.min(100, baseScore + 30)
  }

  return baseScore
}

/**
 * Score AI-likelihood (0-100).
 * How likely are AI engines to have strong, diverse answers?
 * Higher = more likely to have good citations, recommendations, competitive landscape coverage.
 */
export function scoreAILikelihood(intent: QueryIntent, category: QueryCategory, query: string): number {
  const intentBoost: Record<QueryIntent, number> = {
    'best-of': 95,
    comparison: 90,
    alternatives: 85,
    commercial: 80,
    brand: 75,
    transactional: 70,
    informational: 85,
    local: 60,
  }

  const categoryBoost: Record<QueryCategory, number> = {
    agency: 90,
    saas: 85,
    ecommerce: 75,
    legal: 80,
    healthcare: 75,
    real_estate: 70,
    local_service: 65,
    fitness: 65,
    beauty: 60,
    restaurant: 60,
    education: 70,
    florist: 40,
    generic: 50,
  }

  let score = Math.round((intentBoost[intent] + categoryBoost[category]) / 2)

  // Boost for well-formed, long questions (indicate thoughtful search)
  if (query.length > 50) score += 10
  if (query.length > 80) score += 5

  return Math.min(100, score)
}

/**
 * Compute overall composite score (0-100).
 * Weights: Recommendation (40%), AI Likelihood (30%), Commercial (20%), Local (10%)
 * Higher overall score = better query for AI Search Visibility tracking.
 */
export function scoreOverall(
  recommendationScore: number,
  commercialScore: number,
  localScore: number,
  aiLikelihoodScore: number
): number {
  return Math.round(
    recommendationScore * 0.4 + aiLikelihoodScore * 0.3 + commercialScore * 0.2 + localScore * 0.1
  )
}

/**
 * Analyze and score a single query.
 */
export function analyzeQuery(
  query: string,
  businessName: string,
  domain: string,
  language: string = 'en',
  keywords: string[] = []
): ScoredQuery {
  const category = detectQueryCategory(businessName, domain, keywords)
  const intent = analyzeQueryIntent(query)

  const recommendationScore = scoreRecommendation(intent, category)
  const commercialScore = scoreCommercial(intent, category)
  const localScore = scoreLocal(intent, query)
  const aiLikelihoodScore = scoreAILikelihood(intent, category, query)

  const overallScore = scoreOverall(recommendationScore, commercialScore, localScore, aiLikelihoodScore)

  return {
    id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    intent,
    category,
    language,
    recommendationScore,
    commercialScore,
    localScore,
    aiLikelihoodScore,
    overallScore,
  }
}

/**
 * Batch analyze multiple queries and sort by overall score (descending).
 */
export function analyzeQueries(
  queries: string[],
  businessName: string,
  domain: string,
  language: string = 'en',
  keywords: string[] = []
): ScoredQuery[] {
  return queries
    .map((q) => analyzeQuery(q, businessName, domain, language, keywords))
    .sort((a, b) => b.overallScore - a.overallScore)
}
