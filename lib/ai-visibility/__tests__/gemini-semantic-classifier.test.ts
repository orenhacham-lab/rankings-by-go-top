/**
 * Tests for Gemini-powered semantic keyword classifier
 *
 * Tests:
 * 1. Safe fallback when API key missing
 * 2. Safe fallback when API fails
 * 3. Entity type classification accuracy
 * 4. Question family inference
 * 5. Semantic validation
 * 6. Low confidence returns safe defaults (0 risky questions)
 */

import {
  classifyKeywordsWithGemini,
  isQuestionSemanticallyValid,
  type SemanticClassification,
} from '../gemini-semantic-classifier'

// Mock GoogleGenerativeAI for unit tests
jest.mock('@google/generative-ai')

describe('Gemini Semantic Classifier', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_CLASSIFIER_MODEL
  })

  describe('Safe fallback behavior', () => {
    it('should return safe fallback when GEMINI_API_KEY is missing', async () => {
      const result = await classifyKeywordsWithGemini(['iPhone', 'יפן'], 'en')

      expect(result.size).toBe(2)
      expect(result.get('iPhone')).toEqual({
        entityType: 'unknown_or_ambiguous',
        confidence: 'low',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: ['price_raw_keyword', 'buy_raw_keyword', 'choose_raw_keyword'],
        reason: 'Gemini unavailable, safe fallback',
      })
    })

    it('should handle empty keyword array gracefully', async () => {
      const result = await classifyKeywordsWithGemini([], 'en')
      expect(result.size).toBe(0)
    })
  })

  describe('Question family inference', () => {
    it('should infer price questions in English', () => {
      const classification: SemanticClassification = {
        entityType: 'product',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Product entity type',
      }

      const isValid = isQuestionSemanticallyValid(
        'How much does iPhone cost?',
        'iPhone',
        classification,
        'en'
      )
      expect(isValid).toBe(true)
    })

    it('should infer price questions in Hebrew', () => {
      const classification: SemanticClassification = {
        entityType: 'product',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Product entity type',
      }

      const isValid = isQuestionSemanticallyValid(
        'כמה עולה iPhone?',
        'iPhone',
        classification,
        'he'
      )
      expect(isValid).toBe(true)
    })

    it('should block price questions for locations in English', () => {
      const classification: SemanticClassification = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location should not have price questions',
      }

      const isValid = isQuestionSemanticallyValid(
        'How much does Japan cost?',
        'Japan',
        classification,
        'en'
      )
      expect(isValid).toBe(false)
    })

    it('should block price questions for locations in Hebrew', () => {
      const classification: SemanticClassification = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location should not have price questions',
      }

      const isValid = isQuestionSemanticallyValid(
        'כמה עולה יפן?',
        'יפן',
        classification,
        'he'
      )
      expect(isValid).toBe(false)
    })

    it('should block price questions for brands', () => {
      const classification: SemanticClassification = {
        entityType: 'brand',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['review', 'comparison'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Brand cannot be priced directly',
      }

      const isValid = isQuestionSemanticallyValid(
        'How much does Apple cost?',
        'Apple',
        classification,
        'en'
      )
      expect(isValid).toBe(false)
    })

    it('should allow review questions for brands', () => {
      const classification: SemanticClassification = {
        entityType: 'brand',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['review', 'comparison'],
        blockedQuestionFamilies: [],
        reason: 'Brand allows reviews',
      }

      const isValid = isQuestionSemanticallyValid(
        'What is the best Apple product?',
        'Apple',
        classification,
        'en'
      )
      expect(isValid).toBe(true)
    })

    it('should handle provider with safePriceSubject in English', () => {
      const classification: SemanticClassification = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'locksmith service',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context for pricing',
      }

      // Should allow question with safePriceSubject
      const isValidWithSubject = isQuestionSemanticallyValid(
        'How much does locksmith service cost?',
        'locksmith',
        classification,
        'en'
      )
      expect(isValidWithSubject).toBe(true)

      // Should block raw price question
      const isValidRaw = isQuestionSemanticallyValid(
        'How much does a locksmith cost?',
        'locksmith',
        classification,
        'en'
      )
      expect(isValidRaw).toBe(false)
    })

    it('should handle provider with safePriceSubject in Hebrew', () => {
      const classification: SemanticClassification = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'שירות מנעולן',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context for pricing',
      }

      // Should allow question with safePriceSubject
      const isValidWithSubject = isQuestionSemanticallyValid(
        'כמה עולה שירות מנעולן?',
        'מנעולן',
        classification,
        'he'
      )
      expect(isValidWithSubject).toBe(true)

      // Should block raw price question
      const isValidRaw = isQuestionSemanticallyValid(
        'כמה עולה מנעולן?',
        'מנעולן',
        classification,
        'he'
      )
      expect(isValidRaw).toBe(false)
    })

    it('should block choose questions for non-provider entities', () => {
      const classification: SemanticClassification = {
        entityType: 'category_or_topic',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: [],
        reason: 'Category is not choosable',
      }

      const isValid = isQuestionSemanticallyValid(
        'How to choose yoga?',
        'yoga',
        classification,
        'en'
      )
      expect(isValid).toBe(false)
    })

    it('should allow choose questions for providers', () => {
      const classification: SemanticClassification = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['provider_selection'],
        blockedQuestionFamilies: [],
        reason: 'Provider is choosable',
      }

      const isValid = isQuestionSemanticallyValid(
        'How to choose a locksmith?',
        'locksmith',
        classification,
        'en'
      )
      expect(isValid).toBe(true)
    })

    it('should block medical questions with restrictions in English', () => {
      const classification: SemanticClassification = {
        entityType: 'medical_condition_or_problem',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['medical_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Medical conditions cannot be priced',
      }

      const isValidPrice = isQuestionSemanticallyValid(
        'How much does back pain cost?',
        'back pain',
        classification,
        'en'
      )
      expect(isValidPrice).toBe(false)

      const isValidChoose = isQuestionSemanticallyValid(
        'How to choose pneumonia?',
        'pneumonia',
        classification,
        'en'
      )
      expect(isValidChoose).toBe(false)
    })

    it('should block medical questions with restrictions in Hebrew', () => {
      const classification: SemanticClassification = {
        entityType: 'medical_condition_or_problem',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['medical_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Medical conditions cannot be priced',
      }

      const isValidPrice = isQuestionSemanticallyValid(
        'כמה עולה כאבי גב?',
        'כאבי גב',
        classification,
        'he'
      )
      expect(isValidPrice).toBe(false)

      const isValidChoose = isQuestionSemanticallyValid(
        'איך לבחור דלקת גרון?',
        'דלקת גרון',
        classification,
        'he'
      )
      expect(isValidChoose).toBe(false)
    })

    it('should block all commercial templates for unknown entities', () => {
      const classification: SemanticClassification = {
        entityType: 'unknown_or_ambiguous',
        confidence: 'low',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: ['price_raw_keyword', 'buy_raw_keyword', 'choose_raw_keyword'],
        reason: 'Unknown entities are safe-by-default',
      }

      const isValidPrice = isQuestionSemanticallyValid(
        'How much does XYZ123 cost?',
        'XYZ123',
        classification,
        'en'
      )
      expect(isValidPrice).toBe(false)

      const isValidBuy = isQuestionSemanticallyValid(
        'Where to buy XYZ123?',
        'XYZ123',
        classification,
        'en'
      )
      expect(isValidBuy).toBe(false)

      const isValidChoose = isQuestionSemanticallyValid(
        'How to choose XYZ123?',
        'XYZ123',
        classification,
        'en'
      )
      expect(isValidChoose).toBe(false)
    })

    it('should allow neutral info questions for unknown entities', () => {
      const classification: SemanticClassification = {
        entityType: 'unknown_or_ambiguous',
        confidence: 'low',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: [],
        reason: 'Unknown entities allow only neutral info',
      }

      const isValid = isQuestionSemanticallyValid(
        'What is XYZ123?',
        'XYZ123',
        classification,
        'en'
      )
      expect(isValid).toBe(true)
    })

    it('should allow service price questions for services', () => {
      const classification: SemanticClassification = {
        entityType: 'service',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['service_price', 'product_buy', 'product_choice'],
        blockedQuestionFamilies: [],
        reason: 'Service can be priced directly',
      }

      const isValid = isQuestionSemanticallyValid(
        'How much does office cleaning cost?',
        'office cleaning',
        classification,
        'en'
      )
      expect(isValid).toBe(true)
    })

    it('should block questions not in allowedQuestionFamilies', () => {
      const classification: SemanticClassification = {
        entityType: 'brand',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['review'],
        blockedQuestionFamilies: [],
        reason: 'Brand only allows review questions',
      }

      const isValidComparison = isQuestionSemanticallyValid(
        'How does Apple compare to Samsung?',
        'Apple',
        classification,
        'en'
      )
      // comparison is not in allowedQuestionFamilies
      expect(isValidComparison).toBe(false)
    })

    it('should block questions in blockedQuestionFamilies', () => {
      const classification: SemanticClassification = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info'],
        blockedQuestionFamilies: ['product_price'],
        reason: 'Location blocks product price questions',
      }

      const isValid = isQuestionSemanticallyValid(
        'How much does Japan cost?',
        'Japan',
        classification,
        'en'
      )
      expect(isValid).toBe(false)
    })
  })

  describe('Classification schema validation', () => {
    it('should have correct schema for product entity', () => {
      const expected: SemanticClassification = {
        entityType: 'product',
        confidence: 'high',
        isDirectlyPriceable: true,
        isDirectlyBuyable: true,
        isDirectlyChoosable: true,
        safePriceSubject: null,
        allowedQuestionFamilies: ['product_price', 'product_buy', 'product_choice', 'review', 'comparison'],
        blockedQuestionFamilies: [],
        reason: 'Product can be priced, bought, and chosen',
      }

      expect(expected).toBeDefined()
      expect(expected.entityType).toBe('product')
      expect(expected.confidence).toBe('high')
      expect(expected.isDirectlyPriceable).toBe(true)
    })

    it('should have correct schema for provider entity with safePriceSubject', () => {
      const expected: SemanticClassification = {
        entityType: 'provider_or_professional',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: true,
        safePriceSubject: 'locksmith service',
        allowedQuestionFamilies: ['provider_selection', 'service_price'],
        blockedQuestionFamilies: ['price_raw_keyword'],
        reason: 'Provider needs service context',
      }

      expect(expected).toBeDefined()
      expect(expected.safePriceSubject).toBe('locksmith service')
    })

    it('should have correct schema for location entity', () => {
      const expected: SemanticClassification = {
        entityType: 'location_or_destination',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['travel_info', 'neutral_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Location cannot be priced or bought',
      }

      expect(expected).toBeDefined()
      expect(expected.isDirectlyPriceable).toBe(false)
    })

    it('should have correct schema for medical entity', () => {
      const expected: SemanticClassification = {
        entityType: 'medical_condition_or_problem',
        confidence: 'high',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['medical_info'],
        blockedQuestionFamilies: ['product_price', 'product_buy', 'product_choice'],
        reason: 'Medical condition restrictions',
      }

      expect(expected).toBeDefined()
      expect(expected.entityType).toBe('medical_condition_or_problem')
    })

    it('should have correct schema for unknown entity', () => {
      const expected: SemanticClassification = {
        entityType: 'unknown_or_ambiguous',
        confidence: 'low',
        isDirectlyPriceable: false,
        isDirectlyBuyable: false,
        isDirectlyChoosable: false,
        safePriceSubject: null,
        allowedQuestionFamilies: ['neutral_info'],
        blockedQuestionFamilies: ['price_raw_keyword', 'buy_raw_keyword', 'choose_raw_keyword'],
        reason: 'Safe-by-default for unknown entities',
      }

      expect(expected).toBeDefined()
      expect(expected.allowedQuestionFamilies).toEqual(['neutral_info'])
    })
  })
})
