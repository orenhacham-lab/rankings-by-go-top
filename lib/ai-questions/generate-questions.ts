/**
 * Generate natural language AI questions from keywords
 * Supports both English and Hebrew
 */

export interface GeneratedQuestion {
  question: string
  sourceKeyword: string
  type: 'recommendation' | 'price' | 'comparison' | 'info'
}

function hasHebrewCharacters(text: string): boolean {
  return /[֐-׿]/.test(text)
}

function removeModifier(keyword: string, modifier: string): string {
  // Simple removal of modifier from keyword, handling RTL text
  const regex = new RegExp(`\\s*${modifier}\\s*`, 'gi')
  return keyword.replace(regex, '').trim()
}

/**
 * Generate natural language questions from English keywords
 */
function generateEnglishQuestions(keyword: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []
  const lower = keyword.toLowerCase()

  // Recommendation pattern: contains "best", "recommended", "top", "recommended for"
  if (/\b(best|recommended|top|recommended for)\b/i.test(keyword)) {
    const cleaned = removeModifier(keyword, '(best|recommended|top|recommended for)')
    questions.push({
      question: `Which ${cleaned} is recommended?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
    questions.push({
      question: `What is the best ${cleaned}?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
  }

  // Price pattern: contains "price", "cost", "how much", "expensive"
  if (/\b(price|cost|how much|expensive|cheap)\b/i.test(keyword)) {
    questions.push({
      question: `How much does ${keyword} cost?`,
      sourceKeyword: keyword,
      type: 'price',
    })
    questions.push({
      question: `What factors affect the price of ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
  }

  // Comparison pattern: contains "vs", "vs.", "versus", "difference", "vs", "or"
  if (/\b(vs|versus|vs\.|difference|compare)\b/i.test(keyword)) {
    questions.push({
      question: `What is the difference between ${keyword}?`,
      sourceKeyword: keyword,
      type: 'comparison',
    })
  }

  // If no specific pattern matched, generate general info questions
  if (questions.length === 0) {
    questions.push({
      question: `What should I know about ${keyword}?`,
      sourceKeyword: keyword,
      type: 'info',
    })
    questions.push({
      question: `What is the best ${keyword}?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
    questions.push({
      question: `Is ${keyword} worth buying?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
  }

  return questions
}

/**
 * Generate natural language questions from Hebrew keywords
 */
function generateHebrewQuestions(keyword: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []

  // Recommendation pattern
  if (/(מומלץ|טוב|הטוב|ההטוב)/i.test(keyword)) {
    const cleaned = removeModifier(keyword, '(מומלץ|טוב|הטוב|ההטוב)')
    questions.push({
      question: `איזה ${cleaned} מומלץ לקנות?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
    questions.push({
      question: `מה החשוב לבדוק לפני קניית ${cleaned}?`,
      sourceKeyword: keyword,
      type: 'info',
    })
  }

  // Price pattern
  if (/(מחיר|כמה עולה|עלות|חסכון)/i.test(keyword)) {
    questions.push({
      question: `כמה עולה ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
    questions.push({
      question: `מה משפיע על מחיר ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
  }

  // Comparison pattern
  if (/(הבדל|השוואה|או|vs)/i.test(keyword)) {
    questions.push({
      question: `מה ההבדל בין ${keyword}?`,
      sourceKeyword: keyword,
      type: 'comparison',
    })
  }

  // Home/personal use pattern
  if (/(לבית|ביתי|אישי)/i.test(keyword)) {
    questions.push({
      question: `איזה ${keyword} מתאים לשימוש ביתי?`,
      sourceKeyword: keyword,
      type: 'info',
    })
  }

  // If no specific pattern matched, generate general info questions
  if (questions.length === 0) {
    questions.push({
      question: `מה חשוב לדעת על ${keyword}?`,
      sourceKeyword: keyword,
      type: 'info',
    })
    questions.push({
      question: `איזה ${keyword} מומלץ?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
    questions.push({
      question: `האם ${keyword} שווה קנייה?`,
      sourceKeyword: keyword,
      type: 'recommendation',
    })
  }

  return questions
}

/**
 * Generate AI questions from a list of keywords
 * Automatically detects language (Hebrew/English)
 */
export function generateQuestionsFromKeywords(
  keywords: string[],
  language?: 'he' | 'en'
): GeneratedQuestion[] {
  const allQuestions: GeneratedQuestion[] = []

  for (const keyword of keywords) {
    // Auto-detect language if not specified
    const isHebrew = language === 'he' || (!language && hasHebrewCharacters(keyword))

    let generated: GeneratedQuestion[]
    if (isHebrew) {
      generated = generateHebrewQuestions(keyword)
    } else {
      generated = generateEnglishQuestions(keyword)
    }

    allQuestions.push(...generated)
  }

  return allQuestions
}
