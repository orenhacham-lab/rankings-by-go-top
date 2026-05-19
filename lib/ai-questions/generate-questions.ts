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

/**
 * Generate natural language questions from English keywords
 */
function generateEnglishQuestions(keyword: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []

  // Price pattern
  if (/\b(price|cost|how much|expensive|cheap)\b/i.test(keyword)) {
    questions.push({
      question: `How much does ${keyword} cost?`,
      sourceKeyword: keyword,
      type: 'price',
    })
    questions.push({
      question: `What affects the price of ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
  }

  // Comparison pattern
  if (/\b(vs|versus|vs\.|difference|compare)\b/i.test(keyword)) {
    questions.push({
      question: `What is the difference between ${keyword}?`,
      sourceKeyword: keyword,
      type: 'comparison',
    })
  }

  // Generic safe templates that don't require knowing singular/plural form
  questions.push({
    question: `What should I check before buying ${keyword}?`,
    sourceKeyword: keyword,
    type: 'info',
  })
  questions.push({
    question: `Is it worth buying ${keyword}?`,
    sourceKeyword: keyword,
    type: 'recommendation',
  })
  questions.push({
    question: `What are the pros and cons of ${keyword}?`,
    sourceKeyword: keyword,
    type: 'info',
  })
  questions.push({
    question: `How to choose ${keyword} the right way?`,
    sourceKeyword: keyword,
    type: 'info',
  })

  return questions
}

/**
 * Generate natural language questions from Hebrew keywords.
 *
 * Templates are deliberately written so they remain grammatical regardless of
 * whether the keyword is singular/plural or masculine/feminine. Avoid templates
 * like "איזה X מתאים..." which require agreement we cannot reliably infer.
 */
function generateHebrewQuestions(keyword: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []

  // Price-aware templates
  if (/(מחיר|כמה עולה|עלות)/i.test(keyword)) {
    questions.push({
      question: `מה משפיע על המחיר של ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
    questions.push({
      question: `מה כדאי לדעת על העלות של ${keyword}?`,
      sourceKeyword: keyword,
      type: 'price',
    })
  }

  // Comparison-aware templates
  if (/(הבדל|השוואה|מול|vs)/i.test(keyword)) {
    questions.push({
      question: `מה ההבדל בין ${keyword}?`,
      sourceKeyword: keyword,
      type: 'comparison',
    })
  }

  // Generic safe templates — neutral phrasing that works for any keyword form.
  questions.push({
    question: `מה חשוב לבדוק לפני שקונים ${keyword}?`,
    sourceKeyword: keyword,
    type: 'info',
  })
  questions.push({
    question: `האם כדאי לקנות ${keyword}?`,
    sourceKeyword: keyword,
    type: 'recommendation',
  })
  questions.push({
    question: `מה היתרונות והחסרונות של ${keyword}?`,
    sourceKeyword: keyword,
    type: 'info',
  })
  questions.push({
    question: `איך לבחור ${keyword} בצורה נכונה?`,
    sourceKeyword: keyword,
    type: 'info',
  })
  questions.push({
    question: `מה כדאי לדעת לפני שקונים ${keyword}?`,
    sourceKeyword: keyword,
    type: 'info',
  })

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
  const seen = new Set<string>()

  for (const keyword of keywords) {
    const isHebrew = language === 'he' || (!language && hasHebrewCharacters(keyword))

    const generated = isHebrew
      ? generateHebrewQuestions(keyword)
      : generateEnglishQuestions(keyword)

    for (const q of generated) {
      const key = q.question.trim().toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        allQuestions.push(q)
      }
    }
  }

  return allQuestions
}
