/**
 * Client-side deduplication for suggestions
 * Does NOT depend on server modules
 */

export function strongNormalize(text?: string | null): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[?!]+\s*$/, '')
      .replace(/[״"']/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export function extractTopicKeywords(question: string): Set<string> {
  if (!question) return new Set()

  const normalized = strongNormalize(question).toLowerCase()

  const hebrewStopWords = new Set([
    'את', 'או', 'אל', 'אלו', 'אם', 'אתה', 'אתן', 'אתכם',
    'את', 'אתך', 'אתה', 'בא', 'בד', 'בה', 'בהם', 'בהן',
    'בו', 'בי', 'בנו', 'בן', 'בעצם', 'בעל', 'בעלת',
    'בפני', 'בצורה', 'בשביל', 'בשם', 'בתא',
    'גם', 'גם',
    'ד', 'דבר',
    'ה', 'הוא', 'היא', 'היום', 'הם', 'הן', 'הערה',
    'כ', 'כאן', 'כאלו', 'כמו', 'כל', 'כלא', 'כן',
    'לא', 'לאן', 'לאור', 'לאחד', 'לאיזה', 'לבקש', 'לי', 'לנו', 'לעצמו',
    'מ', 'מה', 'מהן', 'מהו', 'מהיום', 'מו', 'מועד',
    'נ', 'נא', 'נעם', 'נתון',
    'ס', 'סוג', 'סימן',
    'ע', 'על', 'עלי', 'עליהם', 'עליה', 'עליך', 'עליכם', 'עלינו',
    'עצמו', 'עצמה', 'עצמם', 'עצמן',
    'פ', 'פה', 'פי',
    'ש', 'שאיזה', 'שאם', 'שבוע',
    'תא', 'תוך', 'תי', 'תיתן',
    'ו', 'ויש',
    'ז', 'זה', 'זו', 'זאת',
    'חוקי', 'חוקן',
    'י', 'יד', 'יום', 'יוש', 'יש',
  ])

  const englishStopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'can', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
    'with', 'from', 'as', 'by', 'about', 'what', 'which', 'who', 'how',
    'where', 'when', 'why', 'if', 'because', 'as', 'while', 'if'
  ])

  const keywords = new Set<string>()
  const words = normalized.split(/\s+/).filter(w => w && w.length > 2)

  words.forEach(word => {
    const clean = word.replace(/[?!.,;:-]+$/, '')
    if (clean.length > 2 && !hebrewStopWords.has(clean) && !englishStopWords.has(clean)) {
      keywords.add(clean)
    }
  })

  return keywords
}

export function generateSemanticSignature(question: string, intent?: string): {
  intent: string
  mainEntity: string
  actions: Set<string>
  occasion: string
  location: string
} {
  const lower = question.toLowerCase()

  const entityPatterns = [
    /זר\s+פרחים|פרחים|זר/i,
    /הליכון|אופני כושר|מכשיר כושר/i,
    /משפחה|בית|דירה/i,
  ]
  let mainEntity = 'unknown'
  for (const pattern of entityPatterns) {
    const match = lower.match(pattern)
    if (match) {
      mainEntity = match[0].toLowerCase()
      break
    }
  }

  const actions = new Set<string>()
  const actionPatterns: Record<string, string[]> = {
    משלוח: ['משלוח', 'דליברי', 'משלח'],
    קנייה: ['קונים', 'לקנות', 'קונה', 'קניה', 'קנה'],
    מחיר: ['עולה', 'כמה', 'מחיר', 'עלות'],
    בחירה: ['בוחרים', 'מתאים', 'בחירה', 'כיצד לבחור'],
  }

  for (const [action, keywords] of Object.entries(actionPatterns)) {
    if (keywords.some(kw => lower.includes(kw))) {
      actions.add(action)
    }
  }

  const occasionPatterns: Record<string, string[]> = {
    'יום הולדת': ['יום הולדת', 'יום יום'],
    'חתונה': ['חתונה', 'חתן', 'כלה'],
    'הנצחה': ['הנצחה', 'הנצחי', 'זיכרון'],
    'מתנה': ['מתנה', 'מתנות', 'מתנה'],
  }
  let occasion = ''
  for (const [occ, keywords] of Object.entries(occasionPatterns)) {
    if (keywords.some(kw => lower.includes(kw))) {
      occasion = occ
      break
    }
  }

  const locationPattern = /(ירושלים|תל אביב|הרצליה|פתח תקווה|בת ים|נתניה|ראשון לציון|גבעתיים|עמק רפאים)/
  const locationMatch = lower.match(locationPattern)
  const location = locationMatch ? locationMatch[0] : ''

  return {
    intent: intent || 'unknown',
    mainEntity,
    actions,
    occasion,
    location,
  }
}

export function areSemanticDuplicates(
  q1: { question: string; intent?: string },
  q2: { question: string; intent?: string },
  similarityThreshold: number = 0.6
): boolean {
  if (!q1.intent || !q2.intent || q1.intent !== q2.intent) {
    return false
  }

  const sig1 = generateSemanticSignature(q1.question, q1.intent)
  const sig2 = generateSemanticSignature(q2.question, q2.intent)

  if (sig1.intent !== sig2.intent) {
    return false
  }

  if (sig1.mainEntity !== sig2.mainEntity && sig1.mainEntity !== 'unknown' && sig2.mainEntity !== 'unknown') {
    return false
  }

  const actionIntersection = new Set([...sig1.actions].filter(a => sig2.actions.has(a)))
  const actionUnion = new Set([...sig1.actions, ...sig2.actions])
  const actionSimilarity = actionUnion.size === 0 ? 1 : actionIntersection.size / actionUnion.size

  const topics1 = extractTopicKeywords(q1.question)
  const topics2 = extractTopicKeywords(q2.question)

  if (topics1.size < 2 || topics2.size < 2) {
    return false
  }

  const topicIntersection = new Set([...topics1].filter(x => topics2.has(x)))
  const topicUnion = new Set([...topics1, ...topics2])
  const topicSimilarity = topicUnion.size === 0 ? 0 : topicIntersection.size / topicUnion.size

  const isSemanticallyDuplicate =
    actionSimilarity >= similarityThreshold || topicSimilarity >= similarityThreshold

  return isSemanticallyDuplicate
}

export function dedupClientSide(
  previousQuestions: Array<{ prompt: string; intent?: string }>,
  newQuestions: Array<{ question: string; intent?: string }>
): { deduped: typeof previousQuestions; removed: number } {
  const seen = new Map<string, { prompt: string; source: string; intent?: string }>()
  let removedCount = 0

  const normalize = (text?: string | null): string => {
    if (!text || typeof text !== 'string') return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
  }

  // Add previous questions to seen
  previousQuestions.forEach((q) => {
    const norm = normalize(q.prompt)
    if (norm) {
      seen.set(norm, { prompt: q.prompt, source: 'previous', intent: q.intent })
    }
  })

  // Add new questions, checking for duplicates
  newQuestions.forEach((q) => {
    if (!q.question) return
    const norm = normalize(q.question)
    if (!norm) return

    // Check exact match
    if (seen.has(norm)) {
      removedCount++
      return
    }

    // Check semantic duplicate
    const newEntry = { prompt: q.question, source: 'new', intent: q.intent }
    let isSemanticDuplicate = false

    for (const [_, existing] of seen) {
      if (areSemanticDuplicates(
        { question: newEntry.prompt, intent: newEntry.intent },
        { question: existing.prompt, intent: existing.intent }
      )) {
        removedCount++
        isSemanticDuplicate = true
        break
      }
    }

    if (!isSemanticDuplicate) {
      seen.set(norm, newEntry)
    }
  })

  const deduped = Array.from(seen.values()).map((v) => ({
    prompt: v.prompt,
    intent: v.intent,
  }))

  return { deduped, removed: removedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIVERSITY FILTER
// Limits how many questions from the same narrow theme appear in the final pool.
// Operates on Hebrew keyword signals; questions in other languages fall into
// the 'other' bucket which has a generous cap.
// ─────────────────────────────────────────────────────────────────────────────

type DiversityBucket =
  | 'price_delivery_location'
  | 'occasion_bouquet'
  | 'woman_mom'
  | 'review_trust'
  | 'delivery_location'
  | 'other'

const DIVERSITY_CAPS: Record<DiversityBucket, number> = {
  price_delivery_location: 3,
  occasion_bouquet: 3,
  woman_mom: 2,
  review_trust: 2,
  delivery_location: 2,
  other: 999,
}

function classifyIntoDiversityBucket(question: string): DiversityBucket {
  const lower = question.toLowerCase()
  const hasPriceWord = /כמה|מחיר|עולה|עלות/.test(lower)
  const hasDelivery = /משלוח/.test(lower)
  const hasCity = /ירושלים|תל\s*אביב|הרצלי|פתח\s*תקו|בת\s*ים|נתניה|חיפה|ראשון|גבעת|אשדוד/.test(lower)
  const hasOccasion = /חתונה|יום\s*הולדת|בר\s*מצווה|בת\s*מצווה|חגיגה|הנצחה|שבעה|אזכרה|נישואין/.test(lower)
  const hasWomanMom = /\bאישה\b|\bאמא\b/.test(lower)
  const hasReview = /חוות\s*דעת|ביקורות|מוניטין|מהימן|אמין/.test(lower)

  if (hasPriceWord && (hasDelivery || hasCity)) return 'price_delivery_location'
  if (hasDelivery && hasCity) return 'delivery_location'
  if (hasOccasion) return 'occasion_bouquet'
  if (hasWomanMom) return 'woman_mom'
  if (hasReview) return 'review_trust'
  return 'other'
}

const OCCASION_WORDS = ['חתונה', 'יום הולדת', 'בר מצווה', 'בת מצווה', 'נישואין', 'הנצחה', 'שבעה'] as const

/**
 * Filters suggestions to enforce per-theme diversity caps.
 * Pass `existing` to pre-load bucket counts from already-shown suggestions.
 * Only `suggestions` are filtered; `existing` are never removed.
 */
export function applyDiversityFilter(
  suggestions: Array<{ prompt: string; intent?: string }>,
  existing: Array<{ prompt: string; intent?: string }> = []
): { filtered: Array<{ prompt: string; intent?: string }>; removedCount: number } {
  const bucketCounts: Record<DiversityBucket, number> = {
    price_delivery_location: 0,
    occasion_bouquet: 0,
    woman_mom: 0,
    review_trust: 0,
    delivery_location: 0,
    other: 0,
  }

  // Pre-load bucket counts from already-shown suggestions
  const occasionIntentSeen = new Set<string>()
  for (const s of existing) {
    const bucket = classifyIntoDiversityBucket(s.prompt)
    bucketCounts[bucket]++
    if (bucket === 'occasion_bouquet' && s.intent) {
      const lower = s.prompt.toLowerCase()
      const matched = OCCASION_WORDS.find((w) => lower.includes(w))
      if (matched) occasionIntentSeen.add(`${matched}:${s.intent}`)
    }
  }

  const filtered: Array<{ prompt: string; intent?: string }> = []
  let removedCount = 0

  for (const suggestion of suggestions) {
    const bucket = classifyIntoDiversityBucket(suggestion.prompt)
    const cap = DIVERSITY_CAPS[bucket]

    if (bucketCounts[bucket] >= cap) {
      removedCount++
      continue
    }

    // Enforce max 1 per exact occasion+intent combination
    if (bucket === 'occasion_bouquet' && suggestion.intent) {
      const lower = suggestion.prompt.toLowerCase()
      const matched = OCCASION_WORDS.find((w) => lower.includes(w))
      if (matched) {
        const key = `${matched}:${suggestion.intent}`
        if (occasionIntentSeen.has(key)) {
          removedCount++
          continue
        }
        occasionIntentSeen.add(key)
      }
    }

    bucketCounts[bucket]++
    filtered.push(suggestion)
  }

  return { filtered, removedCount }
}
