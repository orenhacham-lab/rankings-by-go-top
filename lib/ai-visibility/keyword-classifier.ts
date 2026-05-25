/**
 * Keyword Mode Classifier
 *
 * Classifies keywords into semantic categories that determine:
 * 1. Whether generation should happen at all
 * 2. Which user intents are realistic for this keyword
 * 3. Whether to wrap or leave the keyword as-is
 *
 * The fundamental principle:
 * NEVER transform a keyword into a different semantic domain.
 * If "כמה מרוויחים מיוטיוב" is the keyword, asking "כמה עולה כמה מרוויחים מיוטיוב?"
 * is WRONG. That keyword is already a complete search intent.
 */

export type KeywordMode =
  | 'complete_query'           // Already a complete search phrase - minimal/no generation
  | 'provider_selection'        // Service/provider - recommendation, comparison, evaluation
  | 'product_interest'          // Product or tool - reviews, pricing, comparison
  | 'informational_topic'       // Information/knowledge - guides, explanations only

export interface KeywordClassification {
  mode: KeywordMode
  confidence: number            // 0-1, how confident in this classification
  isAlreadyQuestion: boolean    // True if keyword contains a question mark or reads like one
  isServiceKeyword: boolean     // True if keyword is about a service/provider
  isProductKeyword: boolean     // True if keyword is about a product
  allowedIntents: Set<string>   // Which intents are realistic for this keyword
  shouldSkip: boolean           // True if generation should be disabled entirely
}

/**
 * Classify a keyword into its semantic mode.
 *
 * Rules:
 * 1. If keyword already reads like a complete search → complete_query
 * 2. If keyword is about choosing/finding a provider → provider_selection
 * 3. If keyword is about a product or tool → product_interest
 * 4. If keyword is asking for information → informational_topic
 */
export function classifyKeywordMode(
  keyword: string,
  businessName: string | null,
  businessCategory: string
): KeywordClassification {
  const kwLower = keyword.toLowerCase()
  const kwTrimmed = keyword.trim()

  // ========================================================================
  // 1. DETECT COMPLETE QUERIES
  // ========================================================================
  // These keywords already ARE search intents. Don't wrap them.

  const isAlreadyQuestion =
    /^(כמה|מה|איך|למה|איפה|מי|הגם|או|אם|האם)\b/.test(kwTrimmed)

  const hasSearchIntent =
    /(כמה עול|מחיר|עלות|בחיר|בחירת|מומלץ|הצעה|הצעות|מתי|לפי|בהשוואה|משכנתא|הלוואה|עלויות|משכנתא|ריבית|מס|ביטוח|פוליסה)/i.test(
      kwLower
    )

  const isCompleteQuery = isAlreadyQuestion || hasSearchIntent

  // ========================================================================
  // 2. DETECT SERVICE/PROVIDER KEYWORDS
  // ========================================================================

  const serviceIndicators =
    /(קידום|פרסום ממומן|בנייה של|בנייה ל|שיפוץ|טיפול|התקנה|תיקון|ניקיון|ייעוץ|הדרכה|שיעורים|קורס|תרגול|בדיקה|בדיקת|עבודות|עבודה|שרות|שירות|ספק|יועץ|מאמן|מדריך|ליווי|עיצוב|תכנון|קידום אתר)/i.test(
      kwLower
    )

  // ========================================================================
  // 3. DETECT PRODUCT KEYWORDS
  // ========================================================================

  const productIndicators =
    /(מוצר|מוצרי|צעצוע|ציוד|כלים|כלי|ריהוט|חפץ|עצם|ספר|ספרים|אלבום|נעלי|בגד|בגדים|משקפי|שעון|תכשיט|גבינה|שוקולד|בדיקה|שקית|תיק|בקבוק|כוס|צלחת)/i.test(
      kwLower
    )

  // ========================================================================
  // 4. DETECT INFORMATIONAL KEYWORDS
  // ========================================================================
  // These are asking for knowledge, not looking to buy or get a service.

  const informationalIndicators =
    /(איך ל|איך ל|לומדים|חינוך|ספר|סיפור|היסטוריה|מדע|טכנולוגיה|מחשבים|דמוקרטיה|פוליטיקה|ספורט|בריאות|תזונה|ח|יומנל|עקרונות|כללים|שלבים|שלב|תהליך|בדיקה|בחינה|הסבר|מה זה|למה|למה זה|איך זה|כיצד|הוראה|עדות|חוק|חוקים|זכות|זכויות)/i.test(
      kwLower
    )

  // ========================================================================
  // DETERMINE MODE
  // ========================================================================

  let mode: KeywordMode = 'product_interest'
  let confidence = 0.5
  let shouldSkip = false
  let allowedIntents = new Set<string>()

  // Priority 1: Complete queries should not be wrapped
  if (isCompleteQuery) {
    mode = 'complete_query'
    confidence = 0.9
    shouldSkip = true // Disable generation for complete queries
    allowedIntents = new Set() // No intents
  }
  // Priority 2: Service keywords
  else if (serviceIndicators) {
    mode = 'provider_selection'
    confidence = 0.85
    allowedIntents = new Set(['recommendation', 'pre_purchase', 'commercial', 'local'])
  }
  // Priority 3: Informational keywords
  else if (informationalIndicators) {
    mode = 'informational_topic'
    confidence = 0.75
    allowedIntents = new Set(['informational']) // Only guides/explanations
  }
  // Default: Product
  else {
    mode = 'product_interest'
    confidence = 0.7
    allowedIntents = new Set(['pre_purchase', 'commercial', 'comparison'])
  }

  return {
    mode,
    confidence,
    isAlreadyQuestion,
    isServiceKeyword: serviceIndicators,
    isProductKeyword: productIndicators,
    allowedIntents,
    shouldSkip,
  }
}
