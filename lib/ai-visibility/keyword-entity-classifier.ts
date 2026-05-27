/**
 * Keyword Entity Classifier — Phase 1 Safety Filter
 *
 * Classifies keywords into 8 entity types and validates that generated questions
 * are semantically compatible with the entity they target.
 *
 * This is a pure filtering layer that prevents embarrassing or nonsensical questions
 * like "כמה עולה יפן?" (How much does Japan cost?) or "איך לבחור דלקת ריאות?"
 * (How to choose pneumonia?).
 *
 * Design principle: Safe-by-default. Unknown entities block risky templates;
 * prefer 0 questions over bad output.
 *
 * Phase 1: Classification + compatibility filter only.
 * Phase 2: Add allowedEntityTypes metadata to seed bank (future).
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type EntityType =
  | 'product'
  | 'service'
  | 'provider_or_professional'
  | 'location_or_destination'
  | 'medical_condition_or_problem'
  | 'brand'
  | 'category_or_topic'
  | 'unknown_or_ambiguous'

// ============================================================================
// KEYWORD PATTERNS & SETS
// ============================================================================

// LOCATION KEYWORDS (geographic/travel destinations)
const LOCATION_KEYWORDS_HE = new Set([
  'אמריקה', 'קנדה', 'בריטניה', 'אנגליה', 'צרפת', 'גרמניה', 'איטליה', 'ספרד', 'יוון',
  'יפן', 'סין', 'הודו', 'תאילנד', 'מלזיה', 'סינגפור', 'קוריאה', 'וייטנם',
  'ישראל', 'מצרים', 'דובאי', 'מרוקו', 'טורקיה', 'יוון', 'קרואטיה', 'פולין',
  'אוסטריה', 'שוויץ', 'אירלנד', 'פורטוגל', 'הולנד', 'בלגיה', 'דנמרק', 'שוודיה', 'נורווגיה',
  'פריז', 'ברלין', 'רומא', 'מדריד', 'אמסטרדם', 'ברוקסל', 'וינה', 'זיורך', 'דבלין', 'לכסמבורג',
  'טוקיו', 'בנגקוק', 'בנקוק', 'סינגפור', 'קואלה לומפור', 'בנגלור', 'דלהי',
  'קו סמוי', 'פוקט', 'בלי', 'הוואי', 'מיאמי', 'ניו יורק', 'לוס אנג\'לס', 'סיאטל',
  'מעיין', 'אילת', 'תל אביב', 'ירושלים', 'אנטליה', 'קפריסין', 'רודוס',
  'איים', 'אי', 'חוף', 'טיול', 'תיירות', 'עיר', 'מדינה', 'אזור',
])

const LOCATION_KEYWORDS_EN = new Set([
  'america', 'usa', 'canada', 'uk', 'britain', 'england', 'france', 'germany', 'italy', 'spain', 'greece',
  'japan', 'china', 'india', 'thailand', 'malaysia', 'singapore', 'korea', 'vietnam',
  'israel', 'egypt', 'dubai', 'morocco', 'turkey', 'croatia', 'poland',
  'austria', 'switzerland', 'ireland', 'portugal', 'netherlands', 'belgium', 'denmark', 'sweden', 'norway',
  'paris', 'berlin', 'rome', 'madrid', 'amsterdam', 'brussels', 'vienna', 'zurich', 'dublin', 'luxembourg',
  'tokyo', 'bangkok', 'singapore', 'kuala lumpur', 'bangalore', 'delhi',
  'samui', 'phuket', 'bali', 'hawaii', 'miami', 'new york', 'los angeles', 'seattle',
  'island', 'coast', 'beach', 'tour', 'tourism', 'destination', 'city', 'country', 'region',
])

// INSTITUTION KEYWORDS (NOT travel destinations)
const INSTITUTION_KEYWORDS_HE = new Set([
  'בית חולים', 'בית הספר', 'מרפאה', 'קליניקה', 'משרד', 'סוכנות', 'אוניברסיטה', 'ספרייה',
  'תחנת משטרה', 'תחנת אש', 'בנק', 'בנק', 'חברה', 'מפעל', 'משרד ממשלה',
  'בית אבות', 'מרכז מסחרי', 'מדרשה', 'יומון', 'גן ילדים',
])

const INSTITUTION_KEYWORDS_EN = new Set([
  'hospital', 'school', 'clinic', 'office', 'agency', 'university', 'library',
  'police station', 'fire station', 'bank', 'company', 'factory', 'government office',
  'nursing home', 'shopping center', 'daycare', 'kindergarten',
])

// MEDICAL KEYWORDS (diseases, health conditions)
const MEDICAL_KEYWORDS_HE = new Set([
  'כאב', 'כאבים', 'כאבי', 'דלקת', 'דיכאון', 'חרדה', 'בחילה', 'שיעול', 'ממחץ',
  'הפרעה', 'הפרעות', 'תסמין', 'תסמינים', 'מחלה', 'מחלות', 'בעיה', 'בעיות בריאות',
  'צינורית', 'מיגרנה', 'אסתמה', 'עודן', 'סכרת', 'ראומטיזם', 'הרצון', 'לחץ דם',
  'קוצר נשימה', 'ספסול', 'אלרגיה', 'טניה', 'גיפ',
])

const MEDICAL_KEYWORDS_EN = new Set([
  'pain', 'ache', 'ache', 'inflammation', 'depression', 'anxiety', 'nausea', 'cough', 'fracture',
  'disorder', 'disorder', 'symptom', 'symptoms', 'disease', 'disease', 'health issue', 'health problem',
  'migraine', 'asthma', 'obesity', 'diabetes', 'arthritis', 'fever', 'hypertension',
  'shortness of breath', 'seizure', 'allergy', 'flu', 'cold',
])

// PROFESSIONAL/PROVIDER KEYWORDS
const PROVIDER_KEYWORDS_HE = new Set([
  'עורך דין', 'עורכת דין', 'יועץ', 'יועצת', 'מהנדס', 'מהנדסת', 'אדריכל', 'אדריכלית',
  'רופא', 'רופאה', 'שיניים', 'פסיכולוג', 'טיפול', 'בטרינר', 'טכנאי', 'חשמלאי',
  'אינסטלטור', 'מנעל', 'מעצב', 'צלם', 'מורה', 'מרצה', 'יועץ ​​כלכלי',
  'חשבון', 'משכנתא', 'ביטוח', 'אנטיביוטיקה',
])

const PROVIDER_KEYWORDS_EN = new Set([
  'lawyer', 'attorney', 'consultant', 'engineer', 'architect',
  'doctor', 'physician', 'dentist', 'psychologist', 'therapist', 'vet', 'veterinarian', 'technician', 'electrician',
  'plumber', 'carpenter', 'designer', 'photographer', 'teacher', 'lecturer', 'financial advisor',
  'accountant', 'insurance agent', 'broker', 'advisor',
])

// BRAND KEYWORDS (all-caps, known brand patterns, company suffixes)
const BRAND_PATTERNS_HE = [
  /^[א-ת\s]+\s(בע"מ|חברה|קו\.|אפליקציה)$/i, // Company name + suffix
  /^[A-Z][A-Za-z0-9]*$/,  // CamelCase or ALL_CAPS English brands mentioned in Hebrew text
]

const BRAND_PATTERNS_EN = [
  /^[A-Z][A-Za-z0-9]*\s+(Inc|Ltd|LLC|Corp|Co|Group)$/,  // Brand + suffix
  /^[A-Z]{2,}$/,  // ALL_CAPS brands
  /^[A-Z][a-z]+[A-Z][a-z]+/, // CamelCase brands
]

const KNOWN_BRANDS = new Set([
  'apple', 'microsoft', 'google', 'amazon', 'facebook', 'meta', 'samsung', 'sony', 'nokia',
  'coca-cola', 'pepsi', 'nike', 'adidas', 'puma', 'volkswagen', 'bmw', 'mercedes', 'tesla',
  'ibm', 'intel', 'hp', 'dell', 'lenovo', 'canon', 'nikon', 'panasonic', 'lg', 'whirlpool',
  'ikea', 'h&m', 'zara', 'uniqlo', 'gucci', 'prada', 'chanel', 'dior', 'versace',
  'starbucks', 'mcdonald\'s', 'subway', 'kfc', 'pizza hut', 'domino\'s',
  'airbnb', 'uber', 'lyft', 'netflix', 'spotify', 'youtube', 'instagram', 'twitter', 'tiktok',
])

// BROAD TOPIC KEYWORDS
const TOPIC_KEYWORDS_HE = new Set([
  'חינוך', 'טכנולוגיה', 'מוזיקה', 'ספרות', 'אמנות', 'ריקוד', 'תרבות', 'קולנוע',
  'ספורט', 'בריאות', 'קוקינג', 'בישול', 'תיאום', 'עיצוב', 'צילום', 'וידיאו',
  'משחקים', 'קריאה', 'כתיבה', 'ציור', 'פסולת', 'טיולים', 'מטבח', 'בחוץ',
])

const TOPIC_KEYWORDS_EN = new Set([
  'education', 'technology', 'music', 'literature', 'art', 'dance', 'culture', 'film',
  'sports', 'health', 'cooking', 'design', 'photography', 'video', 'gaming',
  'reading', 'writing', 'painting', 'fitness', 'travel', 'outdoor', 'kitchen',
])

// SERVICE KEYWORDS
const SERVICE_KEYWORDS_HE = new Set([
  'ניקיון', 'תיקור', 'שיפוץ', 'בנייה', 'טיהור', 'כביסה', 'חשמל', 'אינסטלציה',
  'תחזוקה', 'טיפול', 'הדרכה', 'קידום', 'פרסום', 'עיצוב', 'פיתוח', 'אירוח',
  'ביטוח', 'חשבונאות', 'הנהלת ספרים', 'ייעוץ', 'טיפול בעיסוי', 'תמרור',
  'ביוטי', 'זוטי', 'טרימינג', 'חניה', 'דלק', 'טלטוף', 'משלוח',
])

const SERVICE_KEYWORDS_EN = new Set([
  'cleaning', 'repair', 'renovation', 'construction', 'waste management', 'laundry', 'plumbing', 'electrical',
  'maintenance', 'care', 'training', 'promotion', 'advertising', 'design', 'development', 'hosting',
  'insurance', 'accounting', 'bookkeeping', 'consulting', 'massage', 'catering',
  'beauty', 'grooming', 'trimming', 'parking', 'fuel', 'towing', 'delivery',
])

// PRODUCT KEYWORDS
const PRODUCT_KEYWORDS_HE = new Set([
  'טלפון', 'לפטופ', 'מחשב', 'מסך', 'עכבר', 'מקלדת', 'שרוול', 'מטען', 'כבל',
  'כיסא', 'שולחן', 'מיטה', 'ספה', 'שיחה', 'מזרן', 'כרית', 'שמיכה',
  'בגדים', 'נעליים', 'שמלה', 'חולצה', 'מכנסיים', 'מעיל', 'תיק', 'ארנק',
  'אוכל', 'משקה', 'קפה', 'תה', 'מיץ', 'בירה', 'יין', 'ויסקי',
  'דלק', 'סידור', 'חשמל', 'סוללה', 'מנורה', 'אריח', 'צבע', 'דבק',
  'ספר', 'עט', 'עיפרון', 'מחברת', 'גוזם', 'מגזיים', 'מברשת', 'סבון',
  'מצנחון', 'מחזור', 'מכונה', 'תנור', 'מקרר', 'מדיחה', 'מקלחת', 'אמבטיה',
  'הליכון', 'משקל', 'כדור', 'עמוד', 'דוג',
])

const PRODUCT_KEYWORDS_EN = new Set([
  'phone', 'laptop', 'computer', 'monitor', 'mouse', 'keyboard', 'case', 'charger', 'cable',
  'chair', 'table', 'bed', 'sofa', 'couch', 'mattress', 'pillow', 'blanket',
  'clothes', 'shoes', 'dress', 'shirt', 'pants', 'coat', 'bag', 'wallet',
  'food', 'drink', 'coffee', 'tea', 'juice', 'beer', 'wine', 'whiskey',
  'fuel', 'paint', 'battery', 'lamp', 'tile', 'adhesive',
  'book', 'pen', 'pencil', 'notebook', 'trimmer', 'scissors', 'brush', 'soap',
  'umbrella', 'recycled', 'machine', 'oven', 'refrigerator', 'dishwasher', 'shower', 'bathtub',
  'treadmill', 'scale', 'ball', 'pillar', 'fishing',
])

// ============================================================================
// DETECTION FUNCTION
// ============================================================================

/**
 * Detect the entity type of a keyword.
 *
 * Classification order:
 *   1. Check for medical terminology
 *   2. Check for institution names (exclude from location)
 *   3. Check for location/destination
 *   4. Check for provider/professional
 *   5. Check for brand patterns
 *   6. Check for service keywords
 *   7. Check for product keywords
 *   8. Check for category/topic keywords
 *   9. Default to unknown_or_ambiguous
 *
 * Safe-by-default: If uncertain, return unknown_or_ambiguous rather than force a category.
 */
export function detectEntityType(keyword: string, language: 'he' | 'en'): EntityType {
  const lower = keyword.toLowerCase().trim()
  const words = lower.split(/\s+/)

  // Check if keyword contains institutional indicators
  const hasInstitution = language === 'he'
    ? [...INSTITUTION_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))
    : [...INSTITUTION_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))

  // MEDICAL: High priority (specific terminology)
  if (language === 'he') {
    if ([...MEDICAL_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'medical_condition_or_problem'
    }
  } else {
    if ([...MEDICAL_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'medical_condition_or_problem'
    }
  }

  // INSTITUTION: Check before location to exclude institutions from location
  if (hasInstitution) {
    return 'provider_or_professional'
  }

  // LOCATION: Only if not an institution
  if (language === 'he') {
    if ([...LOCATION_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'location_or_destination'
    }
  } else {
    if ([...LOCATION_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'location_or_destination'
    }
  }

  // PROVIDER: Check before other categories
  if (language === 'he') {
    if ([...PROVIDER_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'provider_or_professional'
    }
  } else {
    if ([...PROVIDER_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'provider_or_professional'
    }
  }

  // BRAND: Check pattern + known brands
  const brandPatterns = language === 'he' ? BRAND_PATTERNS_HE : BRAND_PATTERNS_EN
  if (brandPatterns.some(p => p.test(keyword)) || [...KNOWN_BRANDS].some(b => lower.includes(b))) {
    return 'brand'
  }

  // SERVICE: Check keywords
  if (language === 'he') {
    if ([...SERVICE_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'service'
    }
  } else {
    if ([...SERVICE_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'service'
    }
  }

  // PRODUCT: Check keywords
  if (language === 'he') {
    if ([...PRODUCT_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'product'
    }
  } else {
    if ([...PRODUCT_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'product'
    }
  }

  // CATEGORY/TOPIC: Check keywords
  if (language === 'he') {
    if ([...TOPIC_KEYWORDS_HE].some(w => lower.includes(w.toLowerCase()))) {
      return 'category_or_topic'
    }
  } else {
    if ([...TOPIC_KEYWORDS_EN].some(w => lower.includes(w.toLowerCase()))) {
      return 'category_or_topic'
    }
  }

  // DEFAULT: Unknown or ambiguous
  return 'unknown_or_ambiguous'
}

// ============================================================================
// COMPATIBILITY FILTER
// ============================================================================

/**
 * Check if a rendered question is semantically compatible with its entity type.
 *
 * For unknown_or_ambiguous entities, this uses SAFE-BY-DEFAULT logic:
 *   - Blocks all price/buy/choose questions
 *   - Allows only clearly neutral informational questions
 *   - If in doubt, returns false (prefer 0 questions)
 *
 * For other entity types, validates the question matches semantic intent.
 */
export function isQuestionCompatibleWithEntityType(
  question: string,
  keyword: string,
  entityType: EntityType,
  language: 'he' | 'en',
): boolean {
  const lower = question.toLowerCase()

  // Hebrew patterns to block for unknown entities
  const hebrewBlockPatterns = [
    'כמה עולה',
    'מה המחיר',
    'איפה כדאי לקנות',
    'איפה קונים',
    'איך לבחור',
    'האם כדאי לקנות',
  ]

  // English patterns to block for unknown entities
  const englishBlockPatterns = [
    'how much does',
    'what does it cost',
    'where to buy',
    'how to buy',
    'how to choose',
    'should i buy',
  ]

  // =========================================================================
  // UNKNOWN_OR_AMBIGUOUS: SAFE-BY-DEFAULT
  // =========================================================================
  if (entityType === 'unknown_or_ambiguous') {
    // Block all price/buy/choose patterns
    const blockPatterns = language === 'he' ? hebrewBlockPatterns : englishBlockPatterns
    for (const pattern of blockPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return false
      }
    }
    // Allow only if it's clearly neutral informational
    // For now, if it passes the block patterns, allow it
    // (future: could add more sophisticated neutral detection)
    return true
  }

  // =========================================================================
  // PRODUCT
  // =========================================================================
  if (entityType === 'product') {
    // Products support price, recommendation, comparison, choice
    // Generally permissive for products
    return true
  }

  // =========================================================================
  // SERVICE
  // =========================================================================
  if (entityType === 'service') {
    // Services support price, recommendation, choice
    // Generally permissive for services
    return true
  }

  // =========================================================================
  // PROVIDER_OR_PROFESSIONAL
  // =========================================================================
  if (entityType === 'provider_or_professional') {
    // Block direct pricing of the provider themselves
    if (language === 'he') {
      if (lower.includes('כמה עולה') || lower.includes('מה המחיר')) {
        return false
      }
    } else {
      if (lower.includes('how much') || lower.includes('what does it cost')) {
        return false
      }
    }
    // Allow how to choose, find, reviews
    return true
  }

  // =========================================================================
  // LOCATION_OR_DESTINATION
  // =========================================================================
  if (entityType === 'location_or_destination') {
    // Block pricing/buying/choosing of the location itself
    if (language === 'he') {
      const blockedPatterns = [
        'כמה עולה',
        'מה המחיר',
        'איך לבחור',
        'איפה כדאי לקנות',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    } else {
      const blockedPatterns = [
        'how much does',
        'what does it cost',
        'how to choose',
        'where to buy',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    }
    // Allow travel/tourism questions
    return true
  }

  // =========================================================================
  // MEDICAL_CONDITION_OR_PROBLEM
  // =========================================================================
  if (entityType === 'medical_condition_or_problem') {
    // Block pricing/buying/choosing of the condition itself
    if (language === 'he') {
      const blockedPatterns = [
        'כמה עולה',
        'מה המחיר',
        'איך לבחור',
        'איפה כדאי לקנות',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    } else {
      const blockedPatterns = [
        'how much does',
        'what does it cost',
        'how to choose',
        'where to buy',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    }
    // Allow treatment/symptom/information questions
    return true
  }

  // =========================================================================
  // BRAND
  // =========================================================================
  if (entityType === 'brand') {
    // Brands support reviews, comparison, recommendation
    // Block direct pricing unless it's a product brand with clear context
    // For now, generally permissive
    return true
  }

  // =========================================================================
  // CATEGORY_OR_TOPIC
  // =========================================================================
  if (entityType === 'category_or_topic') {
    // Block direct pricing/buying of abstract topics
    if (language === 'he') {
      const blockedPatterns = [
        'כמה עולה',
        'מה המחיר',
        'איך לבחור',
        'איפה כדאי לקנות',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    } else {
      const blockedPatterns = [
        'how much does',
        'what does it cost',
        'how to choose',
        'where to buy',
      ]
      if (blockedPatterns.some(p => lower.includes(p.toLowerCase()))) {
        return false
      }
    }
    // Allow informational questions
    return true
  }

  // Default: Allow (should not reach here)
  return true
}
