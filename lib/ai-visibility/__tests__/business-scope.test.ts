/**
 * Tests for business scope validation
 */

import {
  extractBusinessScope,
  containsExcludedBusinessTerm,
  isWithinBusinessScope,
  filterSuggestionsByBusinessScope,
  BusinessScope,
} from '../suggestion-cache'

describe('Business Scope Validation', () => {
  describe('extractBusinessScope', () => {
    it('extracts allowed topics and excluded terms from ai_business_profile', () => {
      const projectData = {
        business_name: 'Test Business',
        ai_business_profile: {
          mode: 'manual',
          primaryCategory: 'florist',
          secondaryCategories: ['flower_gifts', 'plants'],
          excludedTopics: ['gifts', 'decorations'],
        },
      }

      const scope = extractBusinessScope(projectData)

      expect(scope.allowedTopics).toContain('florist')
      expect(scope.allowedTopics).toContain('flower_gifts')
      expect(scope.allowedTopics).toContain('plants')
      expect(scope.excludedTerms).toContain('gifts')
      expect(scope.excludedTerms).toContain('decorations')
      expect(scope.businessCategory).toBe('florist')
    })

    it('returns business_name when no profile defined', () => {
      const projectData = {
        business_name: 'Flower Shop',
      }

      const scope = extractBusinessScope(projectData)

      expect(scope.allowedTopics).toContain('Flower Shop')
    })

    it('handles null or missing ai_business_profile', () => {
      const projectData = {
        business_name: 'Test Business',
        ai_business_profile: null,
      }

      const scope = extractBusinessScope(projectData)

      expect(scope.allowedTopics).toContain('Test Business')
      expect(scope.excludedTerms.length).toBe(0)
    })
  })

  describe('containsExcludedBusinessTerm', () => {
    it('detects exact excluded terms in questions', () => {
      const excludedTerms = ['נעליים', 'נעלי']

      expect(
        containsExcludedBusinessTerm('אילו נעלי ריצה מומלצים?', excludedTerms)
      ).toBe(true)

      expect(
        containsExcludedBusinessTerm('איפה אפשר לקנות נעליים?', excludedTerms)
      ).toBe(true)
    })

    it('rejects questions with excluded terms in different positions', () => {
      const excludedTerms = ['נעלי', 'נעליים']

      expect(
        containsExcludedBusinessTerm('נעלי ריצה לנשים', excludedTerms)
      ).toBe(true)

      expect(
        containsExcludedBusinessTerm('אני מחפש נעליים טובות', excludedTerms)
      ).toBe(true)
    })

    it('accepts questions without excluded terms', () => {
      const excludedTerms = ['נעליים', 'נעלי']

      expect(
        containsExcludedBusinessTerm('כמה עולה זר פרחים?', excludedTerms)
      ).toBe(false)

      expect(
        containsExcludedBusinessTerm('איזה פרח מתאים לחתונה?', excludedTerms)
      ).toBe(false)
    })

    it('returns false when no excluded terms', () => {
      const excludedTerms: string[] = []

      expect(
        containsExcludedBusinessTerm('כמה עולה זר פרחים?', excludedTerms)
      ).toBe(false)
    })
  })

  describe('isWithinBusinessScope', () => {
    it('accepts questions mentioning allowed topics', () => {
      const scope: BusinessScope = {
        allowedTopics: ['florist', 'flowers', 'bouquets'],
        excludedTerms: [],
        businessCategory: 'florist',
      }

      expect(
        isWithinBusinessScope('כמה עולה זר flowers?', scope)
      ).toBe(true)

      expect(
        isWithinBusinessScope('איזה bouquets טובים?', scope)
      ).toBe(true)
    })

    it('accepts generic questions as safe', () => {
      const scope: BusinessScope = {
        allowedTopics: ['flowers', 'florist'],
        excludedTerms: [],
        businessCategory: 'florist',
      }

      // Generic questions that could apply to many businesses
      expect(isWithinBusinessScope('כמה עולה?', scope)).toBe(true)
      expect(isWithinBusinessScope('איך לבחור?', scope)).toBe(true)
      expect(isWithinBusinessScope('מה חשוב?', scope)).toBe(true)
    })

    it('rejects specific questions outside scope', () => {
      const scope: BusinessScope = {
        allowedTopics: ['flowers', 'florist', 'arrangements'],
        excludedTerms: [],
        businessCategory: 'florist',
      }

      // Questions about unrelated specific items
      expect(
        isWithinBusinessScope('אילו נעלי ריצה מומלצות?', scope)
      ).toBe(false)

      expect(
        isWithinBusinessScope('איזה כדורגל הטוב ביותר?', scope)
      ).toBe(false)
    })

    it('accepts when no allowed topics defined', () => {
      const scope: BusinessScope = {
        allowedTopics: [],
        excludedTerms: [],
        businessCategory: null,
      }

      expect(
        isWithinBusinessScope('כל שאלה אפשרית', scope)
      ).toBe(true)
    })
  })

  describe('filterSuggestionsByBusinessScope', () => {
    it('filters out suggestions with excluded terms', () => {
      const scope: BusinessScope = {
        allowedTopics: ['flowers'],
        excludedTerms: ['shoes', 'נעלי'],
        businessCategory: 'florist',
      }

      const suggestions = [
        { question: 'כמה עולה זר פרחים?', intent: 'commercial' },
        { question: 'איזו נעלי ריצה מומלצות?', intent: 'commercial' },
        { question: 'איפה קונים פרחים טריים?', intent: 'informational' },
      ]

      const filtered = filterSuggestionsByBusinessScope(suggestions, scope)

      expect(filtered.length).toBe(2)
      expect(filtered[0].question).toContain('פרחים')
      expect(filtered[1].question).toContain('פרחים')
    })

    it('filters out suggestions outside business scope', () => {
      const scope: BusinessScope = {
        allowedTopics: ['fitness equipment', 'gym'],
        excludedTerms: [],
        businessCategory: 'gym',
      }

      const suggestions = [
        { question: 'כמה עולה חברות בחדר כושר?', intent: 'commercial' },
        { question: 'אילו נעלי ריצה טובות?', intent: 'commercial' },
        { question: 'איזה מכשיר כושר לבית?', intent: 'informational' },
      ]

      const filtered = filterSuggestionsByBusinessScope(suggestions, scope)

      expect(filtered.length).toBe(2)
      expect(filtered.some(s => s.question.includes('חדר כושר'))).toBe(true)
      expect(filtered.some(s => s.question.includes('מכשיר כושר'))).toBe(true)
    })

    it('calls onFilteredOut callback for rejected suggestions', () => {
      const scope: BusinessScope = {
        allowedTopics: ['flowers'],
        excludedTerms: ['shoes'],
        businessCategory: 'florist',
      }

      const suggestions = [
        { question: 'איזו נעל ריצה?', intent: 'commercial' },
      ]

      const filtered: Array<{ question: string; reason: string }> = []
      filterSuggestionsByBusinessScope(suggestions, scope, (q, reason) => {
        filtered.push({ question: q, reason })
      })

      expect(filtered.length).toBe(1)
      expect(filtered[0].question).toContain('נעל')
    })
  })
})
