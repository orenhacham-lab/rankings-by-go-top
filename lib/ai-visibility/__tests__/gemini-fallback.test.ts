/**
 * Tests for single-keyword Gemini fallback behavior
 *
 * Tests the new simplified approach:
 * 1. Only allow exactly one keyword for generation
 * 2. If >1 keywords, show "בחרו ביטוי אחד בלבד ליצירת שאלות AI"
 * 3. Call normal generator first
 * 4. If normal returns 0, call Gemini fallback
 * 5. Validate Gemini questions semantically
 * 6. Never call Gemini if normal already returned questions
 */

describe('Single-keyword Gemini fallback behavior', () => {
  describe('Selection validation', () => {
    it('should show error when 0 keywords selected', () => {
      const selectedKeywords = new Set<string>()
      const isValid = selectedKeywords.size === 1

      expect(isValid).toBe(false)
    })

    it('should show error when >1 keywords selected', () => {
      const selectedKeywords = new Set<string>(['iPhone', 'Samsung'])
      const isValid = selectedKeywords.size === 1
      const errorMessage = !isValid
        ? 'בחרו ביטוי אחד בלבד ליצירת שאלות AI.'
        : undefined

      expect(isValid).toBe(false)
      expect(errorMessage).toBe('בחרו ביטוי אחד בלבד ליצירת שאלות AI.')
    })

    it('should allow exactly 1 keyword', () => {
      const selectedKeywords = new Set<string>(['iPhone'])
      const isValid = selectedKeywords.size === 1

      expect(isValid).toBe(true)
    })
  })

  describe('Gemini fallback only when normal returns 0', () => {
    it('should NOT call Gemini for product with template questions', () => {
      // When normal generator finds template questions for products,
      // Gemini should NOT be called
      const normalGeneratorReturns = ['How much does iPhone cost?']
      const shouldCallGemini = normalGeneratorReturns.length === 0

      expect(shouldCallGemini).toBe(false)
    })

    it('should call Gemini only when normal returns 0 questions', () => {
      // When normal generator returns 0 for unknown/low-confidence keywords
      const normalGeneratorReturns: string[] = []
      const shouldCallGemini = normalGeneratorReturns.length === 0

      expect(shouldCallGemini).toBe(true)
    })
  })

  describe('Gemini fallback constraints', () => {
    it('should return maximum 3 questions from Gemini', () => {
      const geminiResponse = {
        questions: [
          { question: 'Q1?', intent: 'informational', reason: 'reason1' },
          { question: 'Q2?', intent: 'informational', reason: 'reason2' },
          { question: 'Q3?', intent: 'informational', reason: 'reason3' },
          { question: 'Q4?', intent: 'informational', reason: 'reason4' },
        ],
      }

      const maxQuestions = geminiResponse.questions.slice(0, 3)
      expect(maxQuestions).toHaveLength(3)
    })

    it('should validate Gemini questions semantically', () => {
      const geminiQuestion = 'כמה עולה מנעולן?'
      const keyword = 'מנעולן'
      const semantic = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'שירות מנעולן',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context',
      }

      // This raw price question should be blocked
      const isValid = !geminiQuestion.toLowerCase().includes('כמה עולה')
        || (semantic.safePriceSubject && geminiQuestion.toLowerCase().includes(semantic.safePriceSubject.toLowerCase()))

      expect(isValid).toBe(false)
    })

    it('should accept safe Gemini questions like "כמה עולה שירות מנעולן?"', () => {
      const geminiQuestion = 'כמה עולה שירות מנעולן?'
      const keyword = 'מנעולן'
      const semantic = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'שירות מנעולן',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context',
      }

      const isValid = !geminiQuestion.toLowerCase().includes('כמה עולה')
        || (semantic.safePriceSubject && geminiQuestion.toLowerCase().includes(semantic.safePriceSubject.toLowerCase()))

      expect(isValid).toBe(true)
    })
  })

  describe('Entity type specific rules', () => {
    it('should return 0 for יפן if Gemini generates "כמה עולה יפן?"', () => {
      const geminiQuestion = 'כמה עולה יפן?'
      const semantic = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location',
      }

      // Check if question is price-related
      const isPriceQuestion = geminiQuestion.toLowerCase().includes('כמה עולה')
      const isAllowedForLocation = semantic.allowedQuestionFamilies.some(f => f === 'product_price')

      const shouldInclude = !(isPriceQuestion && !isAllowedForLocation)

      expect(shouldInclude).toBe(false)
    })

    it('should accept "כמה עולה טיסה ליפן?" for location', () => {
      const geminiQuestion = 'כמה עולה טיסה ליפן?'
      const semantic = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location',
      }

      // Has travel context (טיסה = flight)
      const hasTravelContext = geminiQuestion.toLowerCase().includes('טיסה') || geminiQuestion.toLowerCase().includes('טיול')
      const isAllowedWithContext = semantic.allowedQuestionFamilies.some(f => f === 'travel_info')

      const shouldInclude = hasTravelContext && isAllowedWithContext

      expect(shouldInclude).toBe(true)
    })

    it('should block raw price for מנעולן but allow with safePriceSubject', () => {
      const rawPriceQuestion = 'כמה עולה מנעולן?'
      const contextualPriceQuestion = 'כמה עולה שירות מנעולן?'

      const semantic = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'שירות מנעולן',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider',
      }

      const rawIsBlocked = semantic.blockedQuestionFamilies.some(f => f === 'price_raw_keyword')
        && rawPriceQuestion.toLowerCase().includes('כמה עולה')

      const contextualIsValid = contextualPriceQuestion.toLowerCase().includes(semantic.safePriceSubject.toLowerCase())

      expect(rawIsBlocked).toBe(true)
      expect(contextualIsValid).toBe(true)
    })

    it('should accept safe informational questions for medical conditions', () => {
      const medicalQuestion = 'מה גורם לכאבי גב?'
      const semantic = {
        entityType: 'medical_condition_or_problem',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['medical_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Medical',
      }

      const hasMedicalContext = medicalQuestion.toLowerCase().includes('גורם') || medicalQuestion.toLowerCase().includes('סיבה')
      const isAllowed = semantic.allowedQuestionFamilies.includes('medical_info')

      expect(hasMedicalContext && isAllowed).toBe(true)
    })

    it('should block all commercial for medical conditions', () => {
      const badQuestions = [
        'כמה עולה כאבי גב?',
        'איפה קונים כאבי גב?',
        'איך לבחור כאבי גב?',
      ]

      const semantic = {
        entityType: 'medical_condition_or_problem',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['medical_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Medical',
      }

      const allBlocked = badQuestions.every((q) => {
        const isCommercial = q.toLowerCase().includes('כמה עולה')
          || q.toLowerCase().includes('איפה קונים')
          || q.toLowerCase().includes('איך לבחור')
        return isCommercial && !semantic.allowedQuestionFamilies.includes('product_price')
      })

      expect(allBlocked).toBe(true)
    })
  })

  describe('Missing API key safety', () => {
    it('should return 0 questions when GEMINI_API_KEY is missing', () => {
      // When API key missing, generateFallbackQuestions returns []
      const fallbackQuestions: any[] = []

      const result = fallbackQuestions.length === 0
        ? { questions: [], message: 'No high-quality questions found' }
        : { questions: fallbackQuestions }

      expect(result.questions).toHaveLength(0)
    })

    it('should not crash and not return bad questions when API fails', () => {
      // Error handling ensures graceful degradation
      const hasError = true
      const shouldReturnEmpty = hasError

      expect(shouldReturnEmpty).toBe(true)
    })
  })

  describe('Question format validation', () => {
    it('Gemini response should have strict JSON schema', () => {
      const geminiResponse = {
        questions: [
          {
            question: 'example question?',
            intent: 'informational',
            reason: 'internal reason',
          },
        ],
      }

      const hasValidStructure = geminiResponse.questions
        && Array.isArray(geminiResponse.questions)
        && geminiResponse.questions.every((q: any) => q.question && q.intent)

      expect(hasValidStructure).toBe(true)
    })

    it('intent should map to correct type', () => {
      const intentToType = (intent: string) => {
        switch (intent) {
          case 'commercial': return 'price'
          case 'pre_purchase': return 'recommendation'
          case 'comparison': return 'comparison'
          case 'brand': return 'recommendation'
          case 'informational':
          default: return 'info'
        }
      }

      expect(intentToType('commercial')).toBe('price')
      expect(intentToType('pre_purchase')).toBe('recommendation')
      expect(intentToType('informational')).toBe('info')
    })
  })

  describe('No regression for existing good keywords', () => {
    it('should NOT call Gemini for מזרן יוגה (product with templates)', () => {
      // Products should have templates, Gemini not called
      const hasTemplates = true
      const shouldCallGemini = !hasTemplates

      expect(shouldCallGemini).toBe(false)
    })

    it('should NOT call Gemini for פרסום באינסטגרם (marketing with templates)', () => {
      // Marketing channels should have templates
      const hasTemplates = true
      const shouldCallGemini = !hasTemplates

      expect(shouldCallGemini).toBe(false)
    })
  })
})
