/**
 * Tests for suggestion cache utilities
 * Covers: normalization, hashing, deduplication, semantic dedup gates
 */

import { computeContextHash, computeQuestionHash, normalizeQuestion, deduplicateSuggestions, areSemanticDuplicates } from '../suggestion-cache'

describe('Suggestion cache utilities', () => {
  describe('normalizeQuestion', () => {
    it('should lowercase and trim', () => {
      expect(normalizeQuestion('  Hello World  ')).toBe('hello world')
    })

    it('should handle Hebrew text', () => {
      const hebText = '  שלום עולם  '
      expect(normalizeQuestion(hebText)).toBe('שלום עולם')
    })

    it('should be idempotent', () => {
      const text = 'Some text?'
      const norm1 = normalizeQuestion(text)
      const norm2 = normalizeQuestion(norm1)
      expect(norm1).toBe(norm2)
    })
  })

  describe('computeQuestionHash', () => {
    it('should return same hash for same normalized question', () => {
      const q1 = 'כמה עולה מיקרוגל?'
      const q2 = '  כמה עולה מיקרוגל  '
      const hash1 = computeQuestionHash(q1)
      const hash2 = computeQuestionHash(q2)
      expect(hash1).toBe(hash2)
    })

    it('should return different hash for different questions', () => {
      const hash1 = computeQuestionHash('כמה עולה מיקרוגל?')
      const hash2 = computeQuestionHash('כמה עולה טוסטר?')
      expect(hash1).not.toBe(hash2)
    })

    it('should return consistent hash across calls', () => {
      const hash1 = computeQuestionHash('Test question')
      const hash2 = computeQuestionHash('Test question')
      expect(hash1).toBe(hash2)
    })

    it('should return 64-char SHA256 hash', () => {
      const hash = computeQuestionHash('test')
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true)
    })
  })

  describe('computeContextHash', () => {
    it('should normalize null values to empty string', () => {
      const hash1 = computeContextHash('project1', 'he', null, null, null)
      const hash2 = computeContextHash('project1', 'he', undefined, undefined, undefined)
      expect(hash1).toBe(hash2)
    })

    it('should produce consistent hash', () => {
      const params = {
        projectId: 'proj-123',
        language: 'he',
        country: 'IL',
        businessCategory: 'retail',
        keywordsHash: 'abc123'
      }
      const hash1 = computeContextHash(
        params.projectId,
        params.language,
        params.country,
        params.businessCategory,
        params.keywordsHash
      )
      const hash2 = computeContextHash(
        params.projectId,
        params.language,
        params.country,
        params.businessCategory,
        params.keywordsHash
      )
      expect(hash1).toBe(hash2)
    })

    it('should include all parts in hash', () => {
      const hash1 = computeContextHash('proj1', 'he', 'IL', 'retail', 'keywords1')
      const hash2 = computeContextHash('proj1', 'he', 'IL', 'retail', 'keywords2')
      expect(hash1).not.toBe(hash2)
    })

    it('should order parts consistently', () => {
      // Different order of context should produce different hashes
      const hash1 = computeContextHash('proj1', 'he', 'IL', 'retail', null)
      const hash2 = computeContextHash('proj1', 'en', 'IL', 'retail', null)
      expect(hash1).not.toBe(hash2)
    })

    it('should return 64-char SHA256 hash', () => {
      const hash = computeContextHash('proj', 'he')
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true)
    })
  })

  describe('deduplicateSuggestions', () => {
    it('should remove exact duplicates', () => {
      const newSuggestions = [
        { question: 'Q1?', intent: 'commercial' },
        { question: 'Q2?', intent: 'informational' }
      ]
      const vNext = [{ question: 'Q1?' }]
      const cached = []
      const saved = []

      const result = deduplicateSuggestions(newSuggestions, vNext, cached, saved)
      expect(result).toHaveLength(1)
      expect(result[0].question).toBe('Q2?')
    })

    it('should normalize before comparing', () => {
      const newSuggestions = [{ question: '  Q1  ?', intent: 'commercial' }]
      const vNext = [{ question: 'q1?' }]
      const cached = []
      const saved = []

      const result = deduplicateSuggestions(newSuggestions, vNext, cached, saved)
      expect(result).toHaveLength(0)
    })

    it('should deduplicate against all sources', () => {
      const newSuggestions = [
        { question: 'New Q1?', intent: 'commercial' },
        { question: 'New Q2?', intent: 'informational' }
      ]
      const vNext = [{ question: 'vNext Q1?' }]
      const cached = [{ question: 'cached Q1?', intent: 'commercial' }]
      const saved = [{ text: 'saved Q1?' }]

      const result = deduplicateSuggestions(newSuggestions, vNext, cached, saved)
      expect(result).toEqual([
        { question: 'New Q1?', intent: 'commercial' },
        { question: 'New Q2?', intent: 'informational' }
      ])
    })

    it('should return empty array when all duplicates', () => {
      const newSuggestions = [{ question: 'Q1?', intent: 'commercial' }]
      const vNext = [{ question: 'Q1?' }]
      const cached = []
      const saved = []

      const result = deduplicateSuggestions(newSuggestions, vNext, cached, saved)
      expect(result).toHaveLength(0)
    })

    it('should preserve intent from new suggestions', () => {
      const newSuggestions = [
        { question: 'Unique Q?', intent: 'commercial' }
      ]
      const vNext = []
      const cached = []
      const saved = []

      const result = deduplicateSuggestions(newSuggestions, vNext, cached, saved)
      expect(result[0].intent).toBe('commercial')
    })
  })

  describe('Cache stability', () => {
    it('should not break on empty inputs', () => {
      const hash = computeContextHash('proj', 'he')
      expect(hash).toHaveLength(64)
    })

    it('should handle special characters in text', () => {
      const q = 'כמה עולה "מיקרוגל"? (בערך)'
      const hash = computeQuestionHash(q)
      expect(hash).toHaveLength(64)
    })

    it('should be case-insensitive for dedup', () => {
      const q1 = { question: 'HELLO', intent: 'info' }
      const q2 = { question: 'hello', intent: 'info' }
      const result = deduplicateSuggestions([q1], [{ question: q2.question }], [], [])
      expect(result).toHaveLength(0)
    })
  })
})

// ============================================================
// Semantic dedup gate tests
// These verify the occasion + location hard gates added to
// areSemanticDuplicates so that distinct questions are preserved
// even when they share broad topic keywords.
// ============================================================
describe('areSemanticDuplicates — occasion and location hard gates', () => {
  // ── Should NOT be duplicates ─────────────────────────────
  it('price vs delivery-time: "כמה עולה" vs "כמה זמן לוקח" same-day delivery', () => {
    // Before fix: both triggered מחיר action via shared 'כמה' → incorrectly deduped
    const q1 = { question: 'כמה עולה משלוח פרחים לירושלים באותו היום?', intent: 'commercial' }
    const q2 = { question: 'כמה זמן לוקח משלוח פרחים לבית?', intent: 'commercial' }
    expect(areSemanticDuplicates(q1, q2)).toBe(false)
  })

  it('price vs delivery-time: Jerusalem price vs home delivery time', () => {
    const q1 = { question: 'כמה עולה משלוח פרחים לירושלים?', intent: 'commercial' }
    const q2 = { question: 'כמה זמן לוקח משלוח פרחים לבית?', intent: 'commercial' }
    expect(areSemanticDuplicates(q1, q2)).toBe(false)
  })

  it('price+occasion vs delivery-time+home: occasion-based price vs time', () => {
    const q1 = { question: 'כמה עולה משלוח פרחים ליום נישואין?', intent: 'commercial' }
    const q2 = { question: 'כמה זמן לוקח משלוח פרחים לבית?', intent: 'commercial' }
    expect(areSemanticDuplicates(q1, q2)).toBe(false)
  })

  it('birth vs wedding occasion: "ללידה" vs "לחתונת שישי"', () => {
    // Before fix: occasion field existed but was never checked → incorrectly deduped
    const q1 = { question: 'איזה פרחים מתאימים ללידה?', intent: 'pre_purchase' }
    const q2 = { question: 'איזה פרחים מתאימים לחתונת שישי?', intent: 'pre_purchase' }
    expect(areSemanticDuplicates(q1, q2)).toBe(false)
  })

  it('anniversary vs birthday: "ליום נישואין" vs "ליום הולדת 50"', () => {
    const q1 = { question: 'איזה סוג זר פרחים מתאים ליום נישואין?', intent: 'pre_purchase' }
    const q2 = { question: 'איזה זר פרחים מתאים ליום הולדת 50?', intent: 'pre_purchase' }
    expect(areSemanticDuplicates(q1, q2)).toBe(false)
  })

  // ── Should be duplicates ─────────────────────────────────
  it('same price+location different phrasing: "כמה עולה" vs "מה המחיר" same city', () => {
    const q1 = { question: 'כמה עולה משלוח פרחים לירושלים?', intent: 'commercial' }
    const q2 = { question: 'מה המחיר של משלוח פרחים בירושלים?', intent: 'commercial' }
    expect(areSemanticDuplicates(q1, q2)).toBe(true)
  })

  it('same anniversary occasion, "סוג" vs no "סוג": near-identical', () => {
    const q1 = { question: 'איזה זר פרחים מתאים ליום נישואין?', intent: 'pre_purchase' }
    const q2 = { question: 'איזה סוג זר פרחים מתאים ליום נישואין?', intent: 'pre_purchase' }
    expect(areSemanticDuplicates(q1, q2)).toBe(true)
  })

  it('same price intent, same product: "כמה עולה זר ורדים" vs "מה המחיר של זר ורדים"', () => {
    const q1 = { question: 'כמה עולה זר ורדים?', intent: 'commercial' }
    const q2 = { question: 'מה המחיר של זר ורדים?', intent: 'commercial' }
    expect(areSemanticDuplicates(q1, q2)).toBe(true)
  })
})
