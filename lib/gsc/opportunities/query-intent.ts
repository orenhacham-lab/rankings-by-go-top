/**
 * Stage E2A — deterministic query-intent classification (pure).
 *
 * Uses GENERIC Hebrew + English cues only — no project/customer/industry/brand vocabulary.
 * Intent GUIDES the opportunity type; it is never a destructive admission gate and never
 * hard-rejects a query. A commercial or product query is classified, not removed.
 */
import { normalizeQuery } from './normalize'

export type QueryIntent = 'informational' | 'commercial' | 'product' | 'branded_or_service' | 'support' | 'unknown'

/** A cue matches when its normalized token/phrase appears as a whole word (or phrase). */
function hasCue(normalized: string, cues: string[]): boolean {
  for (const cue of cues) {
    if (cue.includes(' ')) { if (normalized.includes(cue)) return true }
    else if (new RegExp(`(^| )${cue}( |$)`).test(normalized)) return true
  }
  return false
}

// Ordered, generic cue sets. Support is checked first (a "how to fix" is support, not info).
const SUPPORT = ['help', 'support', 'contact', 'warranty', 'repair', 'fix', 'broken', 'problem', 'issue', 'troubleshoot', 'return policy', 'customer service',
  'תמיכה', 'עזרה', 'יצירת קשר', 'צור קשר', 'אחריות', 'תיקון', 'תקלה', 'בעיה', 'לתקן', 'שירות לקוחות', 'החזרה', 'החזר']
const PRODUCT = ['buy', 'order', 'purchase', 'shop', 'for sale', 'coupon', 'in stock',
  'לקנות', 'קנייה', 'קניה', 'לרכוש', 'רכישה', 'למכירה', 'הזמנה', 'להזמין', 'קופון', 'במלאי']
const COMMERCIAL = ['best', 'top', 'review', 'reviews', 'compare', 'comparison', 'vs', 'price', 'prices', 'cost', 'cheap', 'cheapest', 'affordable', 'recommended', 'deal', 'deals',
  'הכי טוב', 'הטוב ביותר', 'השוואה', 'להשוות', 'ביקורת', 'ביקורות', 'מחיר', 'מחירון', 'מחירים', 'עלות', 'כמה עולה', 'זול', 'מומלץ', 'מומלצים', 'מבצע', 'מבצעים']
const INFORMATIONAL = ['how', 'what', 'why', 'when', 'which', 'guide', 'tutorial', 'tips', 'meaning', 'ideas', 'examples', 'benefits', 'difference',
  'איך', 'כיצד', 'מה', 'מהו', 'מהי', 'למה', 'מדוע', 'מתי', 'מדריך', 'טיפים', 'רעיונות', 'דוגמאות', 'משמעות', 'פירוש', 'יתרונות', 'הבדל']
// Local/service signals (a generic proxy for branded/service intent, no brand vocabulary).
const BRANDED_OR_SERVICE = ['service', 'services', 'near me', 'opening hours', 'phone', 'address', 'location',
  'שירות', 'שירותים', 'ליד', 'קרוב', 'שעות פתיחה', 'טלפון', 'כתובת', 'סניף', 'סניפים']

/** Deterministic single-label intent. Precedence: support → product → commercial →
 *  informational → branded_or_service → unknown. Never rejects. */
export function classifyIntent(query: string): QueryIntent {
  const n = normalizeQuery(query)
  if (!n) return 'unknown'
  if (hasCue(n, SUPPORT)) return 'support'
  if (hasCue(n, PRODUCT)) return 'product'
  if (hasCue(n, COMMERCIAL)) return 'commercial'
  if (hasCue(n, INFORMATIONAL)) return 'informational'
  if (hasCue(n, BRANDED_OR_SERVICE)) return 'branded_or_service'
  return 'unknown'
}
