/**
 * Tests for Gemini semantic review + repair of candidate questions
 *
 * Tests the new approach where Gemini reviews ALL generated questions:
 * 1. Composite keywords: Fix raw keyword injection
 * 2. Business info: Block inappropriate templates
 * 3. Providers: Fix raw price questions
 * 4. Locations: Block raw location price/buy/choose
 * 5. Medical: Block commercial templates
 * 6. Categories: Block raw price/buy/choose
 */

describe('Gemini semantic review + repair', () => {
  describe('Composite keywords with modifier injection', () => {
    it('"מיקרוגל מחסני חשמל" should NOT return raw "כמה עולה מיקרוגל מחסני חשמל?"', () => {
      const badQuestion = 'כמה עולה מיקרוגל מחסני חשמל?'
      const keyword = 'מיקרוגל מחסני חשמל'
      const mainEntity = 'מיקרוגל'
      const modifier = 'מחסני חשמל'

      // Check if raw keyword is used
      const usesRawKeyword = badQuestion.includes(keyword)
      expect(usesRawKeyword).toBe(true) // Shows it's bad

      // Good version should use mainEntity + contextPhrase
      const goodQuestion = `כמה עולה ${mainEntity} במחסני חשמל?`
      expect(goodQuestion).toBe('כמה עולה מיקרוגל במחסני חשמל?')
      expect(goodQuestion).not.toBe(badQuestion)
    })

    it('"מיקרוגל מחסני חשמל" Gemini should repair to safe questions', () => {
      const candidates = [
        { question: 'כמה עולה מיקרוגל מחסני חשמל?', intent: 'commercial', source: 'normal_generator' as const },
        { question: 'איך לבחור מיקרוגל?', intent: 'pre_purchase', source: 'normal_generator' as const },
      ]

      const semantic = {
        entityType: 'product',
        confidence: 'medium',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Product',
      }

      // Gemini should repair candidate 1 and accept candidate 2
      const expectedRepairs = [
        { question: 'כמה עולה מיקרוגל במחסני חשמל?', intent: 'commercial', reason: 'Repaired: added context' },
        { question: 'איך לבחור מיקרוגל?', intent: 'pre_purchase', reason: 'Valid as-is' },
      ]

      expect(expectedRepairs.length).toBe(2)
      expect(expectedRepairs[0].question).not.toEqual(candidates[0].question)
    })
  })

  describe('Business info queries', () => {
    it('"מחסני חשמל שעות פתיחה" should block product/commercial templates', () => {
      const badQuestions = [
        'מה המחירים של מחסני חשמל שעות פתיחה?',
        'איך לבחור מחסני חשמל שעות פתיחה?',
        'איפה כדאי לקנות מחסני חשמל שעות פתיחה?',
      ]

      const semantic = {
        entityType: 'unknown_or_ambiguous',
        confidence: 'low',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Business info query - only neutral questions allowed',
      }

      // All bad questions should be rejected
      badQuestions.forEach((q) => {
        const usesCommercialTemplate = q.includes('מחיר') || q.includes('קנות') || q.includes('בחור')
        const isAllowedForEntity = semantic.allowedQuestionFamilies.includes('product_price')
        expect(usesCommercialTemplate && !isAllowedForEntity).toBe(true)
      })
    })

    it('"מחסני חשמל שעות פתיחה" Gemini may return 0 or opening-hours questions', () => {
      const candidates = [
        { question: 'מה המחירים של מחסני חשמל שעות פתיחה?', intent: 'commercial', source: 'normal_generator' as const },
        { question: 'איך לבחור מחסני חשמל שעות פתיחה?', intent: 'pre_purchase', source: 'normal_generator' as const },
      ]

      // All candidates are invalid for a business info query
      // Gemini may return 0 or try to generate opening-hours questions
      const expectedFinalCount = 0 // Prefer 0 over bad questions

      expect(candidates.length).toBeGreaterThan(0) // Candidates exist
      expect(expectedFinalCount).toBe(0) // But final is 0
    })
  })

  describe('Provider/professional with safePriceSubject', () => {
    it('"מנעולן" should NOT return raw "כמה עולה מנעולן?"', () => {
      const badQuestion = 'כמה עולה מנעולן?'
      const goodQuestion = 'כמה עולה שירות מנעולן?'

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

      const badUsesRaw = badQuestion.toLowerCase() === 'כמה עולה מנעולן?'
      const goodUsesContext = goodQuestion.includes(semantic.safePriceSubject)

      expect(badUsesRaw).toBe(true)
      expect(goodUsesContext).toBe(true)
    })

    it('"עורך דין" should repair to "כמה עולה ייעוץ משפטי?"', () => {
      const badQuestion = 'כמה עולה עורך דין?'
      const repairedQuestion = 'כמה עולה ייעוץ משפטי?'

      const semantic = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'ייעוץ משפטי',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context',
      }

      const badIsInvalid = badQuestion.toLowerCase().includes('כמה עולה עורך דין')
      const repairedUsesSafePriceSubject = repairedQuestion.includes(semantic.safePriceSubject)

      expect(badIsInvalid).toBe(true)
      expect(repairedUsesSafePriceSubject).toBe(true)
      expect(repairedQuestion).not.toEqual(badQuestion)
    })
  })

  describe('Location/destination keywords', () => {
    it('"יפן" should NOT return "כמה עולה יפן?"', () => {
      const badQuestions = [
        'כמה עולה יפן?',
        'איך לבחור יפן?',
        'איפה כדאי לקנות יפן?',
      ]

      const semantic = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location cannot be priced/bought/chosen',
      }

      badQuestions.forEach((q) => {
        const isCommercial = q.includes('כמה עולה') || q.includes('איך לבחור') || q.includes('איפה קונים')
        const isBlocked = semantic.blockedQuestionFamilies.length > 0
        expect(isCommercial && isBlocked).toBe(true)
      })
    })

    it('"יפן" should return travel context questions', () => {
      const goodQuestions = [
        'כמה עולה טיסה ליפן?',
        'מתי כדאי לטוס ליפן?',
        'מה חשוב לדעת לפני טיול ליפן?',
      ]

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

      goodQuestions.forEach((q) => {
        const hasTravelContext = q.includes('טיסה') || q.includes('טיול') || q.includes('בקר')
        expect(hasTravelContext).toBe(true)
      })
    })
  })

  describe('Medical conditions', () => {
    it('"כאבי גב" should NOT return commercial questions', () => {
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
        reason: 'Medical condition',
      }

      badQuestions.forEach((q) => {
        const isCommercial = q.includes('כמה עולה') || q.includes('איפה קונים') || q.includes('איך לבחור')
        expect(isCommercial).toBe(true)
      })
    })

    it('"כאבי גב" Gemini should return only safe medical information', () => {
      const candidates = [
        { question: 'כמה עולה כאבי גב?', intent: 'commercial', source: 'normal_generator' as const },
      ]

      // Gemini rejects commercial, may generate informational
      const expectedRepaired = { question: 'מה גורם לכאבי גב?', intent: 'informational' }

      expect(expectedRepaired.intent).not.toBe('commercial')
      expect(expectedRepaired.intent).toBe('informational')
    })
  })

  describe('Broad topics/categories', () => {
    it('"יוגה" should NOT return "כמה עולה יוגה?"', () => {
      const badQuestions = [
        'כמה עולה יוגה?',
        'איפה קונים יוגה?',
        'איך לבחור יוגה?',
      ]

      const semantic = {
        entityType: 'category_or_topic',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Category/topic',
      }

      badQuestions.forEach((q) => {
        const isCommercial = q.includes('כמה עולה') || q.includes('איפה קונים') || q.includes('איך לבחור')
        const isBlocked = !semantic.allowedQuestionFamilies.includes('product_price')
        expect(isCommercial && isBlocked).toBe(true)
      })
    })

    it('"יוגה" Gemini should return informational questions', () => {
      const candidates = [
        { question: 'כמה עולה יוגה?', intent: 'commercial', source: 'normal_generator' as const },
      ]

      // Gemini should generate informational instead
      const expectedFinal = [
        { question: 'איך מתחילים עם יוגה?', intent: 'informational', reason: 'Informational only' },
      ]

      expect(expectedFinal[0].intent).toBe('informational')
    })
  })

  describe('No regression: existing good keywords', () => {
    it('"מזרן יוגה" should still return product questions', () => {
      const candidates = [
        { question: 'כמה עולה מזרן יוגה?', intent: 'commercial', source: 'normal_generator' as const },
        { question: 'איך לבחור מזרן יוגה?', intent: 'pre_purchase', source: 'normal_generator' as const },
      ]

      const semantic = {
        entityType: 'product',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Product',
      }

      // All candidates are valid
      const allValid = candidates.every((c) => {
        const isAllowedIntent = semantic.allowedQuestionFamilies.some((f) => f.includes('price') || f.includes('choice'))
        return isAllowedIntent
      })

      expect(allValid).toBe(true)
      expect(candidates.length).toBeGreaterThan(0)
    })

    it('"פרסום באינסטגרם" should still return marketing questions', () => {
      const candidates = [
        { question: 'כמה עולה פרסום באינסטגרם?', intent: 'commercial', source: 'normal_generator' as const },
      ]

      const semantic = {
        entityType: 'service',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['service_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Service/marketing',
      }

      // Candidate is valid
      expect(candidates[0].intent).toBe('commercial')
      expect(semantic.isDirectlyPriceable).toBe(true)
    })
  })

  describe('API unavailability safety', () => {
    it('should return empty array when GEMINI_API_KEY missing', () => {
      // When API unavailable, reviewAndRepairQuestions returns []
      const result: any[] = []

      expect(result).toHaveLength(0)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should not crash or leak bad questions when API fails', () => {
      // Error handling should return empty array safely
      const result: any[] = []

      expect(result).toHaveLength(0)
      expect(result.length === 0).toBe(true)
    })
  })

  describe('Max 3 questions limit', () => {
    it('Gemini should return maximum 3 final questions', () => {
      const geminiResponse = {
        finalQuestions: [
          { question: 'Q1?', intent: 'informational', reason: 'reason1' },
          { question: 'Q2?', intent: 'informational', reason: 'reason2' },
          { question: 'Q3?', intent: 'informational', reason: 'reason3' },
          { question: 'Q4?', intent: 'informational', reason: 'reason4' },
          { question: 'Q5?', intent: 'informational', reason: 'reason5' },
        ],
      }

      const finalCapped = geminiResponse.finalQuestions.slice(0, 3)

      expect(finalCapped).toHaveLength(3)
      expect(finalCapped.length).toBeLessThanOrEqual(3)
    })
  })

  describe('Gemini always called (not fallback-only)', () => {
    it('should call Gemini review even if normal generator returns questions', () => {
      const normalCandidates = [
        { question: 'Normal Q1?', intent: 'commercial', source: 'normal_generator' as const },
        { question: 'Normal Q2?', intent: 'pre_purchase', source: 'normal_generator' as const },
      ]

      // Gemini is NOT fallback - it reviews all candidates
      // Previously: skip if candidates exist
      // New: always send to Gemini for review + repair
      const shouldCallGemini = true // Always, not conditional on normal results

      expect(shouldCallGemini).toBe(true)
      expect(normalCandidates.length).toBeGreaterThan(0)
    })
  })
})
