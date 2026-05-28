/**
 * Gemini-powered semantic keyword classifier for Keyword Research
 *
 * Classifies keywords by semantic meaning (not just patterns/lists)
 * to prevent bad questions like "כמה עולה מנעולן?" (price a locksmith?)
 *
 * Uses Gemini API for unseen/low-confidence keywords
 * Falls back to safe unknown_or_ambiguous if API unavailable
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export type EntityType =
  | 'product'
  | 'service'
  | 'provider_or_professional'
  | 'location_or_destination'
  | 'medical_condition_or_problem'
  | 'brand'
  | 'category_or_topic'
  | 'unknown_or_ambiguous'

export type Confidence = 'high' | 'medium' | 'low'

export type QuestionFamily =
  | 'product_price'
  | 'product_buy'
  | 'product_choice'
  | 'service_price'
  | 'provider_selection'
  | 'review'
  | 'comparison'
  | 'travel_info'
  | 'medical_info'
  | 'neutral_info'

export interface SemanticClassification {
  entityType: EntityType
  confidence: Confidence
  isDirectlyPriceable: boolean
  isDirectlyBuyable: boolean
  isDirectlyChoosable: boolean
  safePriceSubject: string | null
  allowedQuestionFamilies: QuestionFamily[]
  blockedQuestionFamilies: string[]
  reason: string
}

// Initialize Gemini client
let geminiClient: GoogleGenerativeAI | null = null
let initError: string | null = null

function getGeminiClient(): GoogleGenerativeAI | null {
  if (initError) return null

  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      initError = 'GEMINI_API_KEY not set'
      return null
    }
    try {
      geminiClient = new GoogleGenerativeAI(apiKey)
    } catch (err) {
      initError = `Failed to initialize Gemini: ${err instanceof Error ? err.message : String(err)}`
      return null
    }
  }
  return geminiClient
}

/**
 * Classify a batch of keywords using Gemini API
 *
 * @param keywords - Array of keywords to classify
 * @param language - Language of keywords ('he' or 'en')
 * @returns Map of keyword → SemanticClassification
 */
export async function classifyKeywordsWithGemini(
  keywords: string[],
  language: 'he' | 'en',
): Promise<Map<string, SemanticClassification>> {
  const client = getGeminiClient()
  if (!client) {
    console.warn('Gemini API unavailable, using safe fallback')
    return createSafeFallbackClassifications(keywords)
  }

  const model = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'

  const prompt = buildClassificationPrompt(keywords, language)

  try {
    const genAI = client
    const modelInstance = genAI.getGenerativeModel({ model })

    const result = await modelInstance.generateContent(prompt)
    const responseText = result.response.text()

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('Gemini response did not contain valid JSON')
      return createSafeFallbackClassifications(keywords)
    }

    const parsed = JSON.parse(jsonMatch[0])
    const classifications = new Map<string, SemanticClassification>()

    // Process each keyword classification
    for (const keyword of keywords) {
      const classification = parsed[keyword] || createSafeFallback(keyword)
      classifications.set(keyword, classification)
    }

    // Log safely
    console.log(`[Gemini] Classified ${keywords.length} keywords with model ${model}`)

    return classifications
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn(`Gemini classification failed: ${errorMsg}, using fallback`)
    return createSafeFallbackClassifications(keywords)
  }
}

/**
 * Build Gemini prompt for semantic keyword classification
 */
function buildClassificationPrompt(keywords: string[], language: 'he' | 'en'): string {
  const keywordsList = keywords.map(k => `"${k}"`).join(', ')

  const systemPrompt =
    language === 'he'
      ? `אתה מחליף משמעות מילים בעברית לבחירת שאלות AI איכותיות.

סווג כל מילה-מפתח לפי סוג הישות שלה וכללים סמנטיים.

סוגי ישויות:

product: פריט פיזי או דיגיטלי שאנשים קונים (כמו iPhone, ספה, בושם)
service: שירות שאנשים משלמים עבור (כמו ניקיון משרדים, תיקון דלתות)
provider_or_professional: אדם, חברה, סוכנות, קליניקה, חנות (כמו מנעולן, עורך דין)
location_or_destination: מדינה, עיר, יעד תיירות (כמו יפן, פריז)
medical_condition_or_problem: מחלה, תסמין, בעיה בריאות (כמו דלקת גרון, כאבי גב)
brand: שם מותג או חברה (כמו Apple, Nike)
category_or_topic: נושא רחב, תחום, קטגוריה (כמו יוגה, שיווק)
unknown_or_ambiguous: לא ברור

כללים:

PRODUCT / SERVICE: אפשר לשאול כמה עולה, איפה לקנות, איך לבחור.

PROVIDER/PROFESSIONAL (מנעולן, עורך דין, חברת ניקיון):
- אל תשאל כמה עולה [המילה-מפתח ישירות]
- בדור safePriceSubject (למשל: מנעולן → "שירות מנעולן")
- אפשר לשאול: "איך לבחור מנעולן?", "כמה עולה שירות מנעולן?"

LOCATION: אל תשאל כמה עולה יפן, איך לבחור יפן.
אפשר רק אם תיירות טבעית: "כמה עולה טיסה ליפן?"

MEDICAL: אל תשאול כמה עולה כאבי גב, איך לבחור דלקת גרון.
אפשר רק מידע בטוח.

BRAND: אל תשאול כמה עולה Apple ישירות.
אפשר: חוות דעת, השוואה.

CATEGORY/TOPIC: אל תשאול כמה עולה יוגה.
אפשר רק מידע טבעי.

UNKNOWN: אל תשאול מחיר, קנייה, בחירה.
העדף 0 שאלות על שאלה גרועה.`
      : `You are a semantic keyword classifier for English keywords to select quality AI questions.

Classify each keyword by its entity type and semantic rules.

Entity types:

product: Physical or digital item people buy (like iPhone, chair, perfume)
service: Service people pay for (like office cleaning, door repair)
provider_or_professional: Person, company, agency, clinic, store (like locksmith, lawyer)
location_or_destination: Country, city, tourist destination (like Japan, Paris)
medical_condition_or_problem: Disease, symptom, health issue (like pneumonia, back pain)
brand: Brand or company name (like Apple, Nike)
category_or_topic: Broad topic, field, concept (like yoga, marketing)
unknown_or_ambiguous: Unclear

Rules:

PRODUCT / SERVICE: Can ask price, where to buy, how to choose.

PROVIDER/PROFESSIONAL (locksmith, lawyer, cleaning company):
- Do NOT ask "How much does [raw keyword]?"
- Generate safePriceSubject (e.g., locksmith → "locksmith service")
- Can ask: "How to choose a locksmith?", "How much does locksmith service cost?"

LOCATION: Do NOT ask "How much does Japan cost?", "How to choose Japan?"
Only if natural travel context: "How much does a flight to Japan cost?"

MEDICAL: Do NOT ask "How much does back pain cost?", "How to choose pneumonia?"
Only safe informational questions.

BRAND: Do NOT ask "How much does Apple cost?" directly.
Can ask: reviews, comparisons.

CATEGORY/TOPIC: Do NOT ask "How much does yoga cost?"
Only natural informational.

UNKNOWN: Do NOT ask price, buy, choose.
Prefer 0 questions over bad questions.`

  const userPrompt = `Classify these keywords: ${keywordsList}

Return ONLY valid JSON (no other text). Each keyword maps to a classification object.

{
  "keyword1": {
    "entityType": "product|service|provider_or_professional|location_or_destination|medical_condition_or_problem|brand|category_or_topic|unknown_or_ambiguous",
    "confidence": "high|medium|low",
    "isDirectlyPriceable": true|false,
    "isDirectlyBuyable": true|false,
    "isDirectlyChoosable": true|false,
    "safePriceSubject": "string or null",
    "allowedQuestionFamilies": ["product_price", "service_price", "provider_selection", "review", "comparison", "travel_info", "medical_info", "neutral_info"],
    "blockedQuestionFamilies": ["price_raw_keyword", "buy_raw_keyword", "choose_raw_keyword"],
    "reason": "brief reason"
  }
}

Be strict. Prefer unknown_or_ambiguous + low confidence if uncertain.
For providers like locksmith/lawyer: set safePriceSubject to the service (e.g., "locksmith service").
For unknown: block commercial templates.`

  return `${systemPrompt}\n\n${userPrompt}`
}

/**
 * Create safe fallback classification for single keyword
 */
function createSafeFallback(keyword: string): SemanticClassification {
  return {
    entityType: 'unknown_or_ambiguous',
    confidence: 'low',
    isDirectlyPriceable: false,
    isDirectlyBuyable: false,
    isDirectlyChoosable: false,
    safePriceSubject: null,
    allowedQuestionFamilies: ['neutral_info'],
    blockedQuestionFamilies: ['price_raw_keyword', 'buy_raw_keyword', 'choose_raw_keyword'],
    reason: 'Gemini unavailable, safe fallback',
  }
}

/**
 * Create safe fallback classifications for batch of keywords
 */
function createSafeFallbackClassifications(
  keywords: string[],
): Map<string, SemanticClassification> {
  const result = new Map<string, SemanticClassification>()
  for (const keyword of keywords) {
    result.set(keyword, createSafeFallback(keyword))
  }
  return result
}

/**
 * Validate that a question is semantically valid given the classification
 */
export function isQuestionSemanticallyValid(
  question: string,
  keyword: string,
  semantic: SemanticClassification,
  language: 'he' | 'en',
): boolean {
  const lower = question.toLowerCase()

  // Infer question family from content
  const questionFamily = inferQuestionFamily(question, language)

  // Check if this question family is allowed
  if (!semantic.allowedQuestionFamilies.includes(questionFamily)) {
    return false
  }

  // Check blocked families
  if (semantic.blockedQuestionFamilies.includes(questionFamily)) {
    return false
  }

  // Price validation
  if (language === 'he') {
    if (lower.includes('כמה עולה') || lower.includes('מה המחיר')) {
      if (!semantic.isDirectlyPriceable) {
        // Must use safePriceSubject
        if (!semantic.safePriceSubject || !lower.includes(semantic.safePriceSubject.toLowerCase())) {
          return false
        }
      }
    }
  } else {
    if (
      lower.includes('how much') ||
      lower.includes('what does it cost') ||
      lower.includes('what is the price')
    ) {
      if (!semantic.isDirectlyPriceable) {
        if (!semantic.safePriceSubject || !lower.includes(semantic.safePriceSubject.toLowerCase())) {
          return false
        }
      }
    }
  }

  // Buy validation
  if (language === 'he') {
    if (lower.includes('איפה קונים') || lower.includes('איפה כדאי לקנות')) {
      if (!semantic.isDirectlyBuyable) {
        return false
      }
    }
  } else {
    if (lower.includes('where to buy') || lower.includes('how to buy')) {
      if (!semantic.isDirectlyBuyable) {
        return false
      }
    }
  }

  // Choose validation
  if (language === 'he') {
    if (lower.includes('איך לבחור')) {
      if (!semantic.isDirectlyChoosable) {
        // Allow for providers (how to choose a provider is OK)
        if (semantic.entityType !== 'provider_or_professional') {
          return false
        }
      }
    }
  } else {
    if (lower.includes('how to choose')) {
      if (!semantic.isDirectlyChoosable) {
        if (semantic.entityType !== 'provider_or_professional') {
          return false
        }
      }
    }
  }

  return true
}

/**
 * Infer question family from question text
 */
function inferQuestionFamily(question: string, language: 'he' | 'en'): QuestionFamily {
  const lower = question.toLowerCase()

  if (language === 'he') {
    if (lower.includes('כמה עולה') || lower.includes('מה המחיר')) {
      return 'product_price' // Generic, will be refined by caller
    }
    if (lower.includes('איפה קונים') || lower.includes('איפה כדאי לקנות')) {
      return 'product_buy'
    }
    if (lower.includes('איך לבחור')) {
      return 'product_choice'
    }
    if (lower.includes('חוות דעת') || lower.includes('מומלץ')) {
      return 'review'
    }
    if (lower.includes('השוואה') || lower.includes('הבדל')) {
      return 'comparison'
    }
    if (lower.includes('טיסה') || lower.includes('טיול') || lower.includes('מתי לבקר')) {
      return 'travel_info'
    }
    if (lower.includes('טיפול') || lower.includes('סימן') || lower.includes('גורם')) {
      return 'medical_info'
    }
  } else {
    if (lower.includes('how much') || lower.includes('what does it cost')) {
      return 'product_price'
    }
    if (lower.includes('where to buy') || lower.includes('how to buy')) {
      return 'product_buy'
    }
    if (lower.includes('how to choose')) {
      return 'product_choice'
    }
    if (lower.includes('review') || lower.includes('recommend')) {
      return 'review'
    }
    if (lower.includes('comparison') || lower.includes('difference')) {
      return 'comparison'
    }
    if (lower.includes('flight') || lower.includes('trip') || lower.includes('visit')) {
      return 'travel_info'
    }
    if (lower.includes('treatment') || lower.includes('symptom') || lower.includes('cause')) {
      return 'medical_info'
    }
  }

  return 'neutral_info'
}
