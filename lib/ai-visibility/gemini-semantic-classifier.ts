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

/**
 * Generate fallback questions for a keyword when normal templates don't work
 *
 * Called only when normal generator returns 0 questions.
 * Returns maximum 3 raw questions that must pass semantic validation.
 */
export interface FallbackQuestionResponse {
  question: string
  intent: string
  reason: string
}

/**
 * Generate fallback questions based on project profile (not keyword-specific)
 * Used by enrichment layer when generating diverse suggestions
 */
export async function generateProjectEnrichmentQuestions(
  projectName: string,
  domain: string,
  language: 'he' | 'en',
  countryDisplay?: string, // Display name (e.g., "ישראל"), NOT ISO code (e.g., "IL")
  allowedLocations?: string[],
  businessScope?: { allowedTopics: string[]; excludedTerms: string[]; businessCategory: string | null },
  candidateCount: number = 5, // How many candidate questions to generate (scales based on need)
): Promise<FallbackQuestionResponse[]> {
  const client = getGeminiClient()
  if (!client) {
    console.warn('[Gemini Enrichment] API unavailable, returning empty')
    return []
  }

  const model = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'

  try {
    // Build location constraint for the prompt
    const locationConstraint = (allowedLocations && allowedLocations.length > 0)
      ? (language === 'he'
        ? `מיקומים מותרים: ${allowedLocations.join(', ')}`
        : `Allowed locations: ${allowedLocations.join(', ')}`)
      : (language === 'he'
        ? 'אם אין מיקום ברור בנתוני הפרויקט, אל תזכיר בכלל עיר, שכונה או אזור.'
        : 'If no location is specified in the project data, do not mention any city, neighborhood, or region.')

    // Build business scope constraint for the prompt
    const scopeConstraint = (businessScope && (businessScope.allowedTopics.length > 0 || businessScope.excludedTerms.length > 0))
      ? (language === 'he'
        ? `עיסוק מותר: ${businessScope.allowedTopics.join(', ') || '(כללי)'}
נושאים/מוצרים שלא מותרים: ${businessScope.excludedTerms.join(', ') || '(אף אחד)'}
אסור לייצר שאלות על נושאים שלא ברשימת המותרים או המופקדים בנושאים המחוסרים.
אם אתה לא בטוח, בחר שאלות פחות מדי מאשר יותר מדי.`
        : `Allowed business topics: ${businessScope.allowedTopics.join(', ') || '(general)'}
Blocked/excluded topics: ${businessScope.excludedTerms.join(', ') || '(none)'}
Do NOT generate questions about blocked/excluded topics.
Never infer additional product categories beyond what is listed in allowed topics.
If unsure, return fewer questions rather than more.`)
      : ''

    const systemPrompt =
      language === 'he'
        ? `אתה יוצר שאלות חיפוש בעברית לאנשים המחפשים עיסוקים, שירותים או מוצרים.
השאלות צריכות להיות אמיתיות — משהו שאדם באמת היה שואל ב־ChatGPT או מנוע חיפוש לפני שהוא קונה, בוחר, או מנהל עסק.

שם העסק/הביטוי: "${projectName}"
התחום או URL: ${domain || 'כללי'}
${countryDisplay ? `מדינה: ${countryDisplay}` : ''}

חשוב: אל תשתמש בקודי ISO ארצות (IL, US, GB, וכו').
אם אתה זקוק לאזכור מדינה, השתמש בשם הטבעי של המדינה.

${scopeConstraint}

חשוב: אל תנסח כל שאלה עם "כיצד ניתן", "מהן האפשרויות", "איפה ניתן למצוא".
הנסח טבעי בעברית: "איזה", "כמה", "איפה אפשר", "מה חשוב", "למי כדאי".

חשוב מאוד: אל תפנה ישירות לעסק. אסור להשתמש ב"שלכם", "אצלכם", "אתם", "יש לכם", "תוכלו".
השאלה צריכה להיות שאלה כללית למנוע חיפוש/AI בגוף שלישי, לא פנייה אל בית העסק.
דוגמה רעה: "מה מדיניות ההחזרות שלכם?" — דוגמה טובה: "איך עובדת מדיניות החזרות בחנות פרחים?"

סוגי שאלות שיוצרות ערך:
1. מקוריות + מסחרי: "איזה זר מתאים ליום הולדת רומנטי?" or "כמה עולה משלוח באותו יום?"
2. בעיה שצריך לפתור: "איפה אפשר לקבל עצה מהיום למחר?"
3. השוואה של ספקים: "מי עושה משלוח במהירות?"
4. מאפיינים של מוצר/שירות: "איזו חנות מומלצת לקנות פרחים טריים?"
5. מחירים ותנאים: "כמה עולה זר פרחים גדול עם משלוח?"

תוצאה צריכה להיות:
- אדם אמיתי שואל אותה
- יש כוונה מסחרית או בחירה
- הניסוח טבעי בעברית
- לא תבנית סטריאוטיפית`
        : `You write real search questions that people ask in ChatGPT or search engines before buying, choosing, or hiring.

Business/Product: "${projectName}"
Domain or URL: ${domain || 'General'}
${countryDisplay ? `Country: ${countryDisplay}` : ''}

IMPORTANT: Never use ISO country codes (IL, US, GB, etc.) in questions.
If you need to mention a country, use its full natural name.

${scopeConstraint}

IMPORTANT: Avoid "How can one", "What are the options", "Where can one find".
Use natural English: "What is", "How much", "Which", "Is there a", "Should I".

IMPORTANT: Do NOT address the business directly ("your", "do you", "your store").
Write general third-person questions for a search engine/AI, not messages to the business.
Bad: "What is your return policy?" — Good: "How do return policies work at flower shops?"

Value-creating question types:
1. Purchase intent + specificity: "What flowers are best for a romantic birthday?" or "How much does same-day delivery cost?"
2. Problem solving: "Where can I get emergency delivery today?"
3. Provider comparison: "Which florist has the fastest delivery?"
4. Product features: "What makes a good bouquet for a hospital visit?"
5. Pricing & terms: "How much does a large flower arrangement cost with delivery?"

Result should be:
- Something a real person would ask
- Has commercial or decision intent
- Natural phrasing
- Not a template`

    const locationRules = (allowedLocations && allowedLocations.length > 0)
      ? (language === 'he'
        ? `הוראות מיקום: מותר לך להזכיר רק את המיקומים הבאים: ${allowedLocations.join(', ')}.
אסור להמציא מיקומים.
אסור להשתמש בעיות שאינן ברשימה זו.`
        : `Location rules: You may ONLY mention these locations: ${allowedLocations.join(', ')}.
Do not invent locations.
Do not mention any city, neighborhood, or region that is not in this list.`)
      : (language === 'he'
        ? `הוראות מיקום: אם אין מיקום ברור בנתוני הפרויקט, אל תזכיר בכלל עיר, שכונה, אזור או אזור שירות.
אסור להמציא מיקומים.
אסור להשתמש בדוגמאות מתוך הוראות אלו.`
        : `Location rules: Do not mention any city, neighborhood, region, or service area.
Do not invent locations.
Do not use example locations from instructions.`)

    const userPrompt =
      language === 'he'
        ? `בנה עבור "${projectName}" בדיוק ${candidateCount} שאלות בעברית טבעית.

בחר מגוון:
• ${Math.ceil(candidateCount * 0.4)} שאלות עם כוונה מסחרית (מחיר, משלוח, הזמנה, זמינות)
• ${Math.ceil(candidateCount * 0.2)} שאלות "איזה" או "מה" (בחירה / התאמה אישית)
• ${Math.ceil(candidateCount * 0.2)} שאלות השוואה או המלצה ("מי הטוב", "מומלץ")
• ${Math.floor(candidateCount * 0.2)} שאלות על בעיה או צורך ("איפה", "האם אפשר")

${locationRules}

חזור ONLY JSON (ללא טקסט אחר):

{
  "questions": [
    {
      "question": "שאלה בעברית טבעית",
      "intent": "commercial|pre_purchase|informational",
      "reason": "why this is valuable"
    }
  ]
}`
        : `Create exactly ${candidateCount} natural English questions for "${projectName}".

Choose variety:
• ${Math.ceil(candidateCount * 0.4)} questions with commercial intent (price, delivery, ordering, availability)
• ${Math.ceil(candidateCount * 0.2)} "which" or "what" questions (choice / personalization)
• ${Math.ceil(candidateCount * 0.2)} comparison or recommendation questions ("which is best", "recommended")
• ${Math.floor(candidateCount * 0.2)} problem or need questions ("where", "can I")

${locationRules}

Return ONLY JSON (no other text):

{
  "questions": [
    {
      "question": "natural question in English",
      "intent": "commercial|pre_purchase|informational",
      "reason": "why this is valuable"
    }
  ]
}`

    console.log('[Gemini Enrichment] Generating project-based suggestions', {
      projectName,
      domain: domain || '(empty)',
      language,
      countryDisplay: countryDisplay || '(not specified)',
      candidateCount,
      allowedLocations: allowedLocations && allowedLocations.length > 0 ? allowedLocations : '(none)',
      allowedTopics: businessScope?.allowedTopics.length ? businessScope.allowedTopics : '(none)',
      excludedTerms: businessScope?.excludedTerms.length ? businessScope.excludedTerms : '(none)',
    })

    const genAI = client
    const modelInstance = genAI.getGenerativeModel({ model })

    const result = await modelInstance.generateContent(`${systemPrompt}\n\n${userPrompt}`)
    const responseText = result.response.text()

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[Gemini Enrichment] Response did not contain valid JSON')
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      console.warn('[Gemini Enrichment] Response missing questions array')
      return []
    }

    const questions = parsed.questions.slice(0, candidateCount) as FallbackQuestionResponse[]

    console.log(
      `[Gemini Enrichment] Generated ${questions.length} enrichment questions for "${projectName}" (model: ${model})`
    )

    return questions
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[Gemini Enrichment] Generation failed: ${errorMsg}`)
    return []
  }
}

/**
 * Build Gemini prompt for fallback question generation
 */
function buildFallbackPrompt(
  keyword: string,
  semantic: SemanticClassification,
  language: 'he' | 'en',
  country?: string,
): string {
  const entityTypeText = semantic.entityType.replace(/_/g, ' ')

  const systemPrompt =
    language === 'he'
      ? `אתה יוצר שאלות חיפוש איכותיות לכמנוע חיפוש.

המילה-מפתח: "${keyword}"
סוג הישות: ${entityTypeText}

רשימת הכללים:

PRODUCT / SERVICE: אפשר לשאול כמה עולה, איפה לקנות, איך לבחור.

PROVIDER/PROFESSIONAL:
- אל תשאל כמה עולה [המילה-מפתח ישירות]
- אם צריך שאלה על מחיר, השתמש ב"שירות" בהקשר. למשל:
  - מנעולן → "כמה עולה שירות מנעולן?"
  - עורך דין → "כמה עולה ייעוץ משפטי?"

LOCATION: אל תשאל כמה עולה הערים או מדינות ישירות.
רק שאלות תיירות טבעיות:
- "כמה עולה טיסה ליפן?"
- "מה כדאי לבקר בו בפריז?"

MEDICAL: אל תשאל כמה עולות מחלות.
רק שאלות בטוח מדעיות:
- "מה גורם לכאבי גב?"
- "מתי כדאי לראות רופא?"

BRAND: אל תשאל כמה עולה Apple.
אפשר חוות דעת והשוואה.

CATEGORY/TOPIC: אל תשאל כמה עולה יוגה.
רק שאלות מידע טבעיות:
- "איך מתחילים ביוגה?"
- "מה ההבדל בין יוגה לפילאטיס?"

צור 2-3 שאלות טבעיות באנגלית בלבד אם אין כללים מיוחדים.`
      : `You are a quality search question generator for search engines.

Keyword: "${keyword}"
Entity type: ${entityTypeText}

Rules:

PRODUCT / SERVICE: Can ask price, where to buy, how to choose.

PROVIDER/PROFESSIONAL:
- Do NOT ask "How much does [raw keyword]?"
- If asking about price, use service context:
  - locksmith → "How much does locksmith service cost?"
  - lawyer → "How much does legal consultation cost?"

LOCATION: Do NOT ask "How much does Japan cost?"
Only natural travel questions:
- "How much does a flight to Japan cost?"
- "What should I visit in Paris?"

MEDICAL: Do NOT ask "How much does back pain cost?"
Only safe science-based questions:
- "What causes back pain?"
- "When should I see a doctor for back pain?"

BRAND: Do NOT ask "How much does Apple cost?"
Allow reviews and comparisons.

CATEGORY/TOPIC: Do NOT ask "How much does yoga cost?"
Only natural informational questions:
- "How to start yoga?"
- "What is the difference between yoga and Pilates?"

Generate 2-3 natural questions in English only unless special rules apply.`

  const userPrompt = `Generate 2-3 high-quality search questions for the keyword "${keyword}" (${entityTypeText}).

${semantic.allowedQuestionFamilies.length > 0 ? `Allowed question types: ${semantic.allowedQuestionFamilies.join(', ')}` : ''}
${semantic.safePriceSubject ? `If price question is needed, use this context: "${semantic.safePriceSubject}"` : ''}
${country ? `Country context: ${country}` : ''}

Return ONLY valid JSON (no other text):

{
  "questions": [
    {
      "question": "natural question in ${language === 'he' ? 'Hebrew' : 'English'}",
      "intent": "commercial|pre_purchase|informational|comparison|recommendation|brand",
      "reason": "brief reason"
    }
  ]
}

Be strict. Avoid embarrassing questions. Maximum 3 questions.`

  return `${systemPrompt}\n\n${userPrompt}`
}

/**
 * Review and repair candidate questions using Gemini semantic review
 *
 * Sends all normal generator candidates to Gemini for semantic review.
 * Gemini can accept valid candidates, repair bad ones, or generate replacements.
 * Returns up to 3 final questions.
 */
export interface NormalCandidate {
  question: string
  intent: string
  source: 'normal_generator'
}

export interface FinalQuestionResponse {
  question: string
  intent: string
  reason: string
}

export async function reviewAndRepairQuestions(
  keyword: string,
  semantic: SemanticClassification,
  normalCandidates: NormalCandidate[],
  language: 'he' | 'en',
  country?: string,
): Promise<FinalQuestionResponse[]> {
  const client = getGeminiClient()
  if (!client) {
    console.warn('[Gemini Review] API unavailable, returning empty')
    return []
  }

  const model = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  const prompt = buildReviewPrompt(keyword, semantic, normalCandidates, language, country)

  try {
    const genAI = client
    const modelInstance = genAI.getGenerativeModel({ model })

    const result = await modelInstance.generateContent(prompt)
    const responseText = result.response.text()

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[Gemini Review] Response did not contain valid JSON')
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.finalQuestions || !Array.isArray(parsed.finalQuestions)) {
      console.warn('[Gemini Review] Response missing finalQuestions array')
      return []
    }

    // Return final questions (max 3)
    const finalQuestions = parsed.finalQuestions.slice(0, 3) as FinalQuestionResponse[]

    console.log(
      `[Gemini Review] Reviewed ${normalCandidates.length} candidates for "${keyword}", returned ${finalQuestions.length} final questions`
    )

    return finalQuestions
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[Gemini Review] Failed: ${errorMsg}`)
    return []
  }
}

/**
 * Build prompt for Gemini semantic review of candidate questions
 */
function buildReviewPrompt(
  keyword: string,
  semantic: SemanticClassification,
  normalCandidates: NormalCandidate[],
  language: 'he' | 'en',
  country?: string,
): string {
  const entityTypeText = semantic.entityType.replace(/_/g, ' ')
  const candidatesJson = JSON.stringify(normalCandidates, null, 2)

  const systemPrompt =
    language === 'he'
      ? `אתה סוקר משמעות שאלות חיפוש.

המילה-מפתח: "${keyword}"
סוג הישות: ${entityTypeText}
בטוח: ${semantic.confidence}
${semantic.safePriceSubject ? `נושא מחיר בטוח: "${semantic.safePriceSubject}"` : ''}

משימה: בדוק את השאלות המועמדות שהוצרו מהמחולל הרגיל.

עבור כל שאלה:
- האם היא טבעית?
- האם היא תואמת את סוג הישות?
- האם היא משתמשת בהקשר בטוח כאשר נדרש (למשל "שירות מנעולן" ולא רק "מנעולן")?
- האם היא עשויה להיות מעביט ההשקעה בעיני לקוח?

כללי:

PROVIDER: בדוק את safePriceSubject. מחיר גולמי של המילה-מפתח אסור. דרוש הקשר ("שירות מנעולן").

LOCATION: אם המילה-מפתח היא מדינה/עיר, בדוק שאין שאלות על "כמה עולה [מדינה]?". דרוש הקשר בטיול ("טיסה ליפן").

MEDICAL: אם המילה-מפתח היא מצב רפואי, בדוק שאין שאלות מסחריות. רק מידע בטוח.

COMPOSITE: אם המילה-מפתח מורכבת (קטגוריה + משנה כמו "מיקרוגל מחסני חשמל"), בדוק שהשאלה לא משתמשת בגרסה הגולמית.
דוגמה גרועה: "כמה עולה מיקרוגל מחסני חשמל?"
דוגמה טובה: "כמה עולה מיקרוגל במחסני חשמל?"

BUSINESS INFO: אם המילה-מפתח היא שאילתת מידע עסקי (שעות פתיחה וכו'), בדוק שאין שאלות על מחיר/קנייה/בחירה.
אם אין שאלות טבעיות, החזר 0.

אפשרויות:
1. קבל שאלה תקינה כמו שהיא.
2. תקן שאלה רעה לגרסה טובה.
3. הפק שאלה חדשה אם נדרש.`
      : `You are a semantic question reviewer for search questions.

Keyword: "${keyword}"
Entity type: ${entityTypeText}
Confidence: ${semantic.confidence}
${semantic.safePriceSubject ? `Safe price subject: "${semantic.safePriceSubject}"` : ''}

Task: Review candidate questions generated by the normal generator.

For each question:
- Is it natural?
- Does it match the entity type?
- Does it use safe context when required (e.g., "locksmith service" not just "locksmith")?
- Would it look foolish to a real customer?

Rules:

PROVIDER: Check safePriceSubject. Raw keyword price forbidden. Requires context ("locksmith service").

LOCATION: If keyword is country/city, check for "How much does [country]?" Don't allow. Requires travel context ("How much does a flight to Japan cost?").

MEDICAL: If keyword is medical condition, no commercial questions. Only safe information.

COMPOSITE: If keyword is composite (category + modifier like "microwave retail stores"), check raw question doesn't inject the raw keyword.
Bad example: "How much does microwave retail stores cost?"
Good example: "How much does a microwave cost at retail stores?"

BUSINESS INFO: If keyword is business info query (opening hours, etc.), no price/buy/choose questions.
If no natural questions exist, return 0.

Options:
1. Accept valid question as-is.
2. Repair bad question to good version.
3. Generate new question if needed.`

  const candidatesText = normalCandidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.question}" (intent: ${c.intent}, source: ${c.source})`
    )
    .join('\n')

  const userPrompt = `Review these ${normalCandidates.length} candidate questions:

${candidatesText}

${country ? `Country context: ${country}` : ''}

Decide:
- Which candidates are valid (keep as-is)
- Which candidates are invalid (fix or discard)
- Whether to generate new questions if needed

Return ONLY valid JSON (no other text):

{
  "keywordUnderstanding": {
    "mainEntity": "core entity or null",
    "modifier": "modifier or null",
    "searchIntent": "commercial|pre_purchase|navigational|informational|local|comparison|brand",
    "isRawKeywordUsable": true|false
  },
  "candidateReviews": [
    {
      "question": "original question",
      "valid": true|false,
      "reason": "brief reason"
    }
  ],
  "finalQuestions": [
    {
      "question": "final question in ${language === 'he' ? 'Hebrew' : 'English'}",
      "intent": "commercial|pre_purchase|informational|comparison|recommendation|brand|local",
      "reason": "brief reason"
    }
  ]
}

Maximum 3 questions in finalQuestions.
Be strict. Prefer 0 questions over bad ones.`

  return `${systemPrompt}\n\n${userPrompt}`
}
