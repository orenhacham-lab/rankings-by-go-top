/**
 * Tests for keyword entity classifier and compatibility filter
 *
 * Validates that:
 * 1. Entity types are correctly detected
 * 2. Incompatible questions are blocked
 * 3. Compatible questions are allowed
 * 4. Unknown entities use safe-by-default logic
 * 5. Products/services/marketing questions still work
 */

import {
  detectEntityType,
  isQuestionCompatibleWithEntityType,
  type EntityType,
} from '../keyword-entity-classifier'

describe('detectEntityType', () => {
  describe('LOCATION detection', () => {
    it('should detect countries as location', () => {
      expect(detectEntityType('יפן', 'he')).toBe('location_or_destination')
      expect(detectEntityType('אוסטריה', 'he')).toBe('location_or_destination')
      expect(detectEntityType('japan', 'en')).toBe('location_or_destination')
      expect(detectEntityType('france', 'en')).toBe('location_or_destination')
    })

    it('should detect cities as location', () => {
      expect(detectEntityType('פריז', 'he')).toBe('location_or_destination')
      expect(detectEntityType('ברלין', 'he')).toBe('location_or_destination')
      expect(detectEntityType('paris', 'en')).toBe('location_or_destination')
      expect(detectEntityType('tokyo', 'en')).toBe('location_or_destination')
    })

    it('should NOT treat institutions as locations', () => {
      // Hospital should be provider, not location
      expect(detectEntityType('בית חולים', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('hospital', 'en')).toBe('provider_or_professional')

      // School should be provider, not location
      expect(detectEntityType('בית הספר', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('school', 'en')).toBe('provider_or_professional')
    })
  })

  describe('MEDICAL detection', () => {
    it('should detect medical conditions', () => {
      expect(detectEntityType('דלקת ריאות', 'he')).toBe('medical_condition_or_problem')
      expect(detectEntityType('כאבי גב', 'he')).toBe('medical_condition_or_problem')
      expect(detectEntityType('מיגרנה', 'he')).toBe('medical_condition_or_problem')
      expect(detectEntityType('pneumonia', 'en')).toBe('medical_condition_or_problem')
      expect(detectEntityType('back pain', 'en')).toBe('medical_condition_or_problem')
      expect(detectEntityType('migraine', 'en')).toBe('medical_condition_or_problem')
    })
  })

  describe('PROVIDER detection', () => {
    it('should detect professional roles', () => {
      expect(detectEntityType('עורך דין', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('רופא', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('חשבון', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('lawyer', 'en')).toBe('provider_or_professional')
      expect(detectEntityType('doctor', 'en')).toBe('provider_or_professional')
      expect(detectEntityType('accountant', 'en')).toBe('provider_or_professional')
    })

    it('should detect institutions as provider', () => {
      expect(detectEntityType('בית חולים', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('מרפאה', 'he')).toBe('provider_or_professional')
      expect(detectEntityType('clinic', 'en')).toBe('provider_or_professional')
    })
  })

  describe('BRAND detection', () => {
    it('should detect known brands', () => {
      expect(detectEntityType('Apple', 'en')).toBe('brand')
      expect(detectEntityType('Samsung', 'en')).toBe('brand')
      expect(detectEntityType('Google', 'en')).toBe('brand')
    })
  })

  describe('PRODUCT detection', () => {
    it('should detect physical products', () => {
      expect(detectEntityType('iPhone', 'en')).toBe('product')
      expect(detectEntityType('טלפון', 'he')).toBe('product')
      expect(detectEntityType('laptop', 'en')).toBe('product')
      expect(detectEntityType('מחשב', 'he')).toBe('product')
      expect(detectEntityType('shoes', 'en')).toBe('product')
      expect(detectEntityType('נעליים', 'he')).toBe('product')
    })
  })

  describe('SERVICE detection', () => {
    it('should detect services', () => {
      expect(detectEntityType('ניקיון משרדים', 'he')).toBe('service')
      expect(detectEntityType('קידום אתרים', 'he')).toBe('service')
      expect(detectEntityType('cleaning', 'en')).toBe('service')
      expect(detectEntityType('web design', 'en')).toBe('service')
    })
  })

  describe('CATEGORY_OR_TOPIC detection', () => {
    it('should detect broad topics', () => {
      expect(detectEntityType('חינוך', 'he')).toBe('category_or_topic')
      expect(detectEntityType('טכנולוגיה', 'he')).toBe('category_or_topic')
      expect(detectEntityType('education', 'en')).toBe('category_or_topic')
      expect(detectEntityType('technology', 'en')).toBe('category_or_topic')
    })
  })

  describe('UNKNOWN_OR_AMBIGUOUS fallback', () => {
    it('should classify uncertain keywords as unknown', () => {
      expect(detectEntityType('XYZ123', 'he')).toBe('unknown_or_ambiguous')
      expect(detectEntityType('XYZ123', 'en')).toBe('unknown_or_ambiguous')
      expect(detectEntityType('ABC456', 'he')).toBe('unknown_or_ambiguous')
      expect(detectEntityType('ABC456', 'en')).toBe('unknown_or_ambiguous')
    })
  })
})

describe('isQuestionCompatibleWithEntityType', () => {
  describe('LOCATION compatibility', () => {
    it('should block pricing questions for locations', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה יפן?', 'יפן', 'location_or_destination', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('מה המחיר של פריז?', 'פריז', 'location_or_destination', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How much does Japan cost?', 'Japan', 'location_or_destination', 'en'),
      ).toBe(false)
    })

    it('should block buy questions for locations', () => {
      expect(
        isQuestionCompatibleWithEntityType('איפה כדאי לקנות יפן?', 'יפן', 'location_or_destination', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('Where to buy Paris?', 'Paris', 'location_or_destination', 'en'),
      ).toBe(false)
    })

    it('should block choose questions for locations', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור יפן?', 'יפן', 'location_or_destination', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How to choose France?', 'France', 'location_or_destination', 'en'),
      ).toBe(false)
    })

    it('should allow travel/tourism questions for locations', () => {
      expect(
        isQuestionCompatibleWithEntityType('מה לעשות ביפן?', 'יפן', 'location_or_destination', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('What to do in Paris?', 'Paris', 'location_or_destination', 'en'),
      ).toBe(true)
    })
  })

  describe('MEDICAL compatibility', () => {
    it('should block pricing questions for medical conditions', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה דלקת ריאות?', 'דלקת ריאות', 'medical_condition_or_problem', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How much does pneumonia cost?', 'pneumonia', 'medical_condition_or_problem', 'en'),
      ).toBe(false)
    })

    it('should block buy questions for medical conditions', () => {
      expect(
        isQuestionCompatibleWithEntityType('איפה קונים דלקת ריאות?', 'דלקת ריאות', 'medical_condition_or_problem', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('Where to buy pneumonia?', 'pneumonia', 'medical_condition_or_problem', 'en'),
      ).toBe(false)
    })

    it('should block choose questions for medical conditions', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור דלקת ריאות?', 'דלקת ריאות', 'medical_condition_or_problem', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How to choose pneumonia?', 'pneumonia', 'medical_condition_or_problem', 'en'),
      ).toBe(false)
    })

    it('should allow treatment/information questions for medical conditions', () => {
      expect(
        isQuestionCompatibleWithEntityType('מה גורם לדלקת ריאות?', 'דלקת ריאות', 'medical_condition_or_problem', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('What causes pneumonia?', 'pneumonia', 'medical_condition_or_problem', 'en'),
      ).toBe(true)
    })
  })

  describe('PROVIDER compatibility', () => {
    it('should block pricing questions for providers', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה עורך דין?', 'עורך דין', 'provider_or_professional', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How much does a lawyer cost?', 'lawyer', 'provider_or_professional', 'en'),
      ).toBe(false)
    })

    it('should allow how-to-find and choice questions for providers', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור עורך דין מוטב?', 'עורך דין', 'provider_or_professional', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('How to find a good lawyer?', 'lawyer', 'provider_or_professional', 'en'),
      ).toBe(true)
    })
  })

  describe('UNKNOWN_OR_AMBIGUOUS safe-by-default', () => {
    it('should block price templates for unknown entities', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה XYZ123?', 'XYZ123', 'unknown_or_ambiguous', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How much does XYZ123 cost?', 'XYZ123', 'unknown_or_ambiguous', 'en'),
      ).toBe(false)
    })

    it('should block buy templates for unknown entities', () => {
      expect(
        isQuestionCompatibleWithEntityType('איפה כדאי לקנות ABC456?', 'ABC456', 'unknown_or_ambiguous', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('Where to buy ABC456?', 'ABC456', 'unknown_or_ambiguous', 'en'),
      ).toBe(false)
    })

    it('should block choose templates for unknown entities', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור DEF789?', 'DEF789', 'unknown_or_ambiguous', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How to choose DEF789?', 'DEF789', 'unknown_or_ambiguous', 'en'),
      ).toBe(false)
    })

    it('should block all buy-related patterns for unknown entities', () => {
      expect(
        isQuestionCompatibleWithEntityType('איפה קונים XYZ?', 'XYZ', 'unknown_or_ambiguous', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How to buy ABC?', 'ABC', 'unknown_or_ambiguous', 'en'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('האם כדאי לקנות GHI?', 'GHI', 'unknown_or_ambiguous', 'he'),
      ).toBe(false)
    })

    it('should allow neutral informational questions for unknown entities', () => {
      expect(
        isQuestionCompatibleWithEntityType('מה זה XYZ?', 'XYZ', 'unknown_or_ambiguous', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('What is ABC?', 'ABC', 'unknown_or_ambiguous', 'en'),
      ).toBe(true)
    })
  })

  describe('PRODUCT compatibility (regression)', () => {
    it('should allow price questions for products', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה iPhone?', 'iPhone', 'product', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('How much does an iPhone cost?', 'iPhone', 'product', 'en'),
      ).toBe(true)
    })

    it('should allow buy questions for products', () => {
      expect(
        isQuestionCompatibleWithEntityType('איפה לקנות iPhone?', 'iPhone', 'product', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('Where to buy an iPhone?', 'iPhone', 'product', 'en'),
      ).toBe(true)
    })

    it('should allow choice questions for products', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור iPhone?', 'iPhone', 'product', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('How to choose an iPhone?', 'iPhone', 'product', 'en'),
      ).toBe(true)
    })
  })

  describe('SERVICE compatibility (regression)', () => {
    it('should allow price questions for services', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה ניקיון משרדים?', 'ניקיון משרדים', 'service', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('How much does office cleaning cost?', 'office cleaning', 'service', 'en'),
      ).toBe(true)
    })

    it('should allow choice questions for services', () => {
      expect(
        isQuestionCompatibleWithEntityType('איך לבחור חברת ניקיון?', 'חברת ניקיון', 'service', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('How to choose a cleaning company?', 'cleaning company', 'service', 'en'),
      ).toBe(true)
    })
  })

  describe('CATEGORY_OR_TOPIC compatibility', () => {
    it('should allow informational questions for topics', () => {
      expect(
        isQuestionCompatibleWithEntityType('מה זה טכנולוגיה?', 'טכנולוגיה', 'category_or_topic', 'he'),
      ).toBe(true)
      expect(
        isQuestionCompatibleWithEntityType('What is technology?', 'technology', 'category_or_topic', 'en'),
      ).toBe(true)
    })

    it('should block price questions for abstract topics', () => {
      expect(
        isQuestionCompatibleWithEntityType('כמה עולה חינוך?', 'חינוך', 'category_or_topic', 'he'),
      ).toBe(false)
      expect(
        isQuestionCompatibleWithEntityType('How much does education cost?', 'education', 'category_or_topic', 'en'),
      ).toBe(false)
    })
  })
})

describe('Integration: entity detection + compatibility', () => {
  it('should block bad location question', () => {
    const entityType = detectEntityType('יפן', 'he')
    expect(entityType).toBe('location_or_destination')

    const isCompatible = isQuestionCompatibleWithEntityType(
      'כמה עולה יפן?',
      'יפן',
      entityType,
      'he',
    )
    expect(isCompatible).toBe(false)
  })

  it('should block bad medical question', () => {
    const entityType = detectEntityType('דלקת ריאות', 'he')
    expect(entityType).toBe('medical_condition_or_problem')

    const isCompatible = isQuestionCompatibleWithEntityType(
      'איך לבחור דלקת ריאות?',
      'דלקת ריאות',
      entityType,
      'he',
    )
    expect(isCompatible).toBe(false)
  })

  it('should block bad unknown question', () => {
    const entityType = detectEntityType('XYZ123', 'he')
    expect(entityType).toBe('unknown_or_ambiguous')

    const isCompatible = isQuestionCompatibleWithEntityType(
      'כמה עולה XYZ123?',
      'XYZ123',
      entityType,
      'he',
    )
    expect(isCompatible).toBe(false)
  })

  it('should allow good product question', () => {
    const entityType = detectEntityType('iPhone', 'en')
    expect(entityType).toBe('product')

    const isCompatible = isQuestionCompatibleWithEntityType(
      'How much does an iPhone cost?',
      'iPhone',
      entityType,
      'en',
    )
    expect(isCompatible).toBe(true)
  })

  it('should allow good service question', () => {
    const entityType = detectEntityType('ניקיון משרדים', 'he')
    expect(entityType).toBe('service')

    const isCompatible = isQuestionCompatibleWithEntityType(
      'כמה עולה ניקיון משרדים?',
      'ניקיון משרדים',
      entityType,
      'he',
    )
    expect(isCompatible).toBe(true)
  })
})

describe('Category/Topic tightened compatibility', () => {
  it('should block price questions for topics', () => {
    const entityType = detectEntityType('יוגה', 'he')
    expect(entityType).toBe('category_or_topic')

    expect(
      isQuestionCompatibleWithEntityType('כמה עולה יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)

    expect(
      isQuestionCompatibleWithEntityType('מה המחיר של יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)
  })

  it('should block buy questions for topics', () => {
    const entityType = detectEntityType('יוגה', 'he')
    expect(entityType).toBe('category_or_topic')

    expect(
      isQuestionCompatibleWithEntityType('איפה כדאי לקנות יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)

    expect(
      isQuestionCompatibleWithEntityType('איפה קונים יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)
  })

  it('should block choose questions for topics', () => {
    const entityType = detectEntityType('יוגה', 'he')
    expect(entityType).toBe('category_or_topic')

    expect(
      isQuestionCompatibleWithEntityType('איך לבחור יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)

    expect(
      isQuestionCompatibleWithEntityType('האם כדאי לקנות יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(false)
  })

  it('should allow natural informational questions for topics', () => {
    const entityType = detectEntityType('יוגה', 'he')
    expect(entityType).toBe('category_or_topic')

    expect(
      isQuestionCompatibleWithEntityType('מה חשוב לדעת על יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(true)

    expect(
      isQuestionCompatibleWithEntityType('איך מתחילים עם יוגה?', 'יוגה', entityType, 'he'),
    ).toBe(true)

    expect(
      isQuestionCompatibleWithEntityType('אילו טעויות נפוצות יש ביוגה?', 'יוגה', entityType, 'he'),
    ).toBe(true)
  })
})

describe('Brand tightened compatibility', () => {
  it('should block price questions for brands', () => {
    const entityType = detectEntityType('Apple', 'en')
    expect(entityType).toBe('brand')

    expect(
      isQuestionCompatibleWithEntityType('How much does Apple cost?', 'Apple', entityType, 'en'),
    ).toBe(false)

    expect(
      isQuestionCompatibleWithEntityType('What does Apple cost?', 'Apple', entityType, 'en'),
    ).toBe(false)
  })

  it('should block buy questions for brands', () => {
    const entityType = detectEntityType('Nike', 'en')
    expect(entityType).toBe('brand')

    expect(
      isQuestionCompatibleWithEntityType('Where to buy Nike?', 'Nike', entityType, 'en'),
    ).toBe(false)

    expect(
      isQuestionCompatibleWithEntityType('How to buy Nike?', 'Nike', entityType, 'en'),
    ).toBe(false)
  })

  it('should block choose questions for brands', () => {
    const entityType = detectEntityType('Samsung', 'en')
    expect(entityType).toBe('brand')

    expect(
      isQuestionCompatibleWithEntityType('How to choose Samsung?', 'Samsung', entityType, 'en'),
    ).toBe(false)
  })

  it('should allow review/comparison questions for brands', () => {
    const entityType = detectEntityType('Apple', 'en')
    expect(entityType).toBe('brand')

    expect(
      isQuestionCompatibleWithEntityType('Is Apple recommended?', 'Apple', entityType, 'en'),
    ).toBe(true)

    expect(
      isQuestionCompatibleWithEntityType('What is the difference between Apple and other brands?', 'Apple', entityType, 'en'),
    ).toBe(true)
  })
})
