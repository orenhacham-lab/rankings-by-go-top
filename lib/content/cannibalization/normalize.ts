/**
 * Text normalization for the cannibalization check (lib/content/cannibalization).
 *
 * PURE. It turns a title, a keyword, a Search Console query or a URL slug into the
 * set of words that carry its subject, so two phrasings of one subject compare equal:
 *
 *   niqqud and cantillation      removed          "טִיּוּל" = "טיול"
 *   Hebrew final letters         folded           "ילדים" = "ילדימ" (internally)
 *   HTML entities (WordPress)    decoded          "&#8211;" = "–"
 *   punctuation, maqaf, slugs    word breaks      "japan-street-food" = "japan street food"
 *   stop words, generic words    dropped          "המדריך המלא ל…", "איך", "best", "guide"
 *   years                        dropped          "יפן 2025" = "יפן"
 *
 * Two WORDS then match when one of their forms matches (tokenForms):
 *   a Hebrew one-letter prefix   ו ה ב ל מ ש כ, and the common pairs (וה, וב, של, …),
 *                                stripped only when at least three letters remain
 *   a light plural               ים / ות (also read as ת) / ה at the end, s / es / ies
 *                                in English, stripped only when three letters remain
 *
 * "Light" is deliberate: this never stems a word to a root, so "הזמנה" and "להזמין"
 * stay different words; it only folds the forms a writer uses for the same word.
 */

const NIQQUD = /[֑-ֽֿ-ׇ]/g
const MAQAF = /־/g
const HE_FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

/** WordPress titles arrive with entities ("&#8211;"); decode the common ones. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,6});/g, (_, d: string) => { const n = Number(d); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => { const n = parseInt(h, 16); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' })
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/**
 * Words that say nothing about the subject. Stored in folded form (see fold), so the
 * lookup is on the folded word. A word here is dropped before any comparison.
 */
const STOP_RAW = [
  // Hebrew function words
  'של', 'על', 'את', 'עם', 'או', 'גם', 'כל', 'מה', 'איך', 'למה', 'מתי', 'איפה', 'היכן', 'כמה', 'זה', 'זו', 'זאת', 'הם', 'הן', 'הוא', 'היא',
  'אני', 'אנחנו', 'אתם', 'יש', 'אין', 'לא', 'כן', 'אם', 'כי', 'רק', 'עוד', 'יותר', 'פחות', 'הכי', 'מאוד', 'בין', 'לבין', 'אל', 'אצל', 'לפני',
  'אחרי', 'תוך', 'עד', 'מול', 'לעומת', 'שלכם', 'שלך', 'שלנו', 'לכם', 'לך', 'לנו', 'אותו', 'אותה', 'כדי', 'האם', 'מהם', 'מהן', 'מהו', 'מהי',
  'ומה', 'ואיך', 'ואיפה', 'בו', 'בה', 'להם', 'עבורך', 'עבורכם', 'בכל',
  // Hebrew generic modifiers: they frame an article, they do not name its subject
  'מדריך', 'המדריך', 'מלא', 'המלא', 'מקיף', 'המקיף', 'טיפים', 'טיפ', 'מומלץ', 'מומלצת', 'מומלצים', 'מומלצות', 'הטוב', 'הטובה', 'הטובים', 'הטובות',
  'ביותר', 'טוב', 'טובה', 'טובים', 'טובות', 'חשוב', 'לדעת', 'צריך', 'צריכים', 'כדאי', 'חייבים', 'לראות', 'לעשות', 'לבקר', 'הכל', 'הכול',
  'סקירה', 'השוואה', 'הבדל', 'הבדלים', 'ההבדל', 'ההבדלים', 'ההבדלים', 'שאלות', 'תשובות', 'נפוצות', 'למתחילים', 'מתחילים', 'עכשיו', 'השנה',
  'אונליין', 'זול', 'זולה', 'מחיר', 'מחירים', 'לקנות', 'קנייה', 'קניה',
  // English
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'with', 'how', 'what', 'why', 'when', 'where', 'which', 'who', 'is', 'are', 'do',
  'does', 'can', 'your', 'you', 'our', 'my', 'at', 'by', 'from', 'about', 'vs', 'versus', 'best', 'top', 'guide', 'complete', 'ultimate', 'tips',
  'tip', 'review', 'reviews', 'things', 'thing', 'know', 'need', 'should', 'must', 'see', 'visit', 'beginners', 'beginner', 'cheap', 'price',
  'prices', 'buy', 'online', 'difference', 'differences', 'between', 'comparison', 'compare', 'recommended', 'full', 'everything',
]

/** Lowercase, niqqud off, final letters folded. The form every comparison uses. */
export function fold(word: string): string {
  const w = word.normalize('NFKC').toLowerCase().replace(NIQQUD, '')
  return Array.from(w, (c) => HE_FINALS[c] ?? c).join('')
}

const STOP = new Set(STOP_RAW.map(fold))

/** Is this (folded) word a year, a bare number, or a stop/generic word? */
function isNoise(w: string): boolean {
  if (w.length === 0) return true
  if (/^\d+$/.test(w)) return true
  if (STOP.has(w)) return true
  // A stop word behind a one-letter prefix ("והמדריך", "למתחילים", "בכל").
  if (w.length > 2 && /^[והבלמשכ]/.test(w) && STOP.has(w.slice(1))) return true
  return false
}

/** Words of a text, before noise removal: decoded, split on anything that is not a letter or digit. */
export function rawWords(text: string | null | undefined): string[] {
  const s = decodeEntities(String(text ?? ''))
    .replace(MAQAF, ' ')
    .replace(/["'“”‘’׳״`]/g, '')
  return s.split(/[^\p{L}\p{N}]+/u).map(fold).filter(Boolean)
}

/** The subject words of a text: raw words without noise. Order kept, duplicates removed. */
export function subjectWords(text: string | null | undefined): string[] {
  const out: string[] = []
  for (const w of rawWords(text)) {
    if (w.length < 2 || isNoise(w)) continue
    if (!out.includes(w)) out.push(w)
  }
  return out
}

const HE_PREFIX_1 = /^[והבלמשכ]/
const HE_PREFIX_2 = /^(וה|וב|ול|ומ|וש|שה|שב|של|מה|לה|בה|כש|מש|לכ)/
const MIN_STEM = 3

/**
 * The forms a word may take for comparison. Two words match when their forms share
 * one. Hebrew: the word, without a one- or two-letter prefix, and without a plural or
 * feminine ending, each only while three letters remain. English: s / es / ies.
 */
export function tokenForms(word: string): string[] {
  const forms = new Set<string>([word])
  const isHebrew = /[א-ת]/.test(word)
  const bases = [word]
  if (isHebrew) {
    if (HE_PREFIX_2.test(word) && word.length - 2 >= MIN_STEM) bases.push(word.slice(2))
    if (HE_PREFIX_1.test(word) && word.length - 1 >= MIN_STEM) bases.push(word.slice(1))
    for (const b of bases) {
      forms.add(b)
      // Plural: "טיולים" → "טיול"; "מנורות" → "מנור" (as "מנורה" → "מנור"); "רכבות" → "רכבת".
      if (/ימ$/.test(b) && b.length - 2 >= MIN_STEM) forms.add(b.slice(0, -2))
      if (/ות$/.test(b) && b.length - 2 >= MIN_STEM) { forms.add(b.slice(0, -2)); forms.add(`${b.slice(0, -2)}ת`) }
      // Feminine singular: "מנורה" → "מנור".
      if (/ה$/.test(b) && b.length - 1 >= MIN_STEM) forms.add(b.slice(0, -1))
      // Construct plural: "כרטיסי רכבת" → "כרטיס".
      if (/י$/.test(b) && b.length - 1 >= MIN_STEM + 1) forms.add(b.slice(0, -1))
    }
  } else {
    if (/ies$/.test(word) && word.length - 3 >= MIN_STEM) forms.add(`${word.slice(0, -3)}y`)
    if (/es$/.test(word) && word.length - 2 >= MIN_STEM) forms.add(word.slice(0, -2))
    if (/s$/.test(word) && !/ss$/.test(word) && word.length - 1 >= MIN_STEM) forms.add(word.slice(0, -1))
  }
  return [...forms]
}

export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  const fa = tokenForms(a)
  const fb = new Set(tokenForms(b))
  return fa.some((f) => fb.has(f))
}

/**
 * How alike two subject-word lists are: matched words over the union (a Jaccard on
 * words that match by form). 1 means the same subject words, in any order.
 */
export function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const used = new Set<number>()
  let matched = 0
  for (const x of a) {
    const j = b.findIndex((y, i) => !used.has(i) && wordsMatch(x, y))
    if (j >= 0) { used.add(j); matched++ }
  }
  return matched / (a.length + b.length - matched)
}

/** Segment separators of a title: " – ", " | ", ": ", " - ". */
const SEGMENT_SPLIT = /\s+[–—-]\s+|\s*\|\s*|:\s+|\s*[–—]\s*/

/** The title's main phrase: what comes before its first separator. */
export function mainPhrase(title: string | null | undefined): string {
  const decoded = decodeEntities(String(title ?? ''))
  return (decoded.split(SEGMENT_SPLIT)[0] ?? '').trim()
}

/** The readable words of a URL's last path segment ("/japan-street-food-guide/" → "japan street food guide"). */
export function slugPhrase(url: string | null | undefined): string {
  const raw = String(url ?? '').replace(/[?#].*$/, '').replace(/\/+$/, '')
  const last = raw.split('/').pop() ?? ''
  let decoded = last
  try { decoded = decodeURIComponent(last) } catch { /* keep it encoded */ }
  if (!decoded || /^[\w.-]+\.[a-z]{2,}$/i.test(decoded)) return '' // a bare host is no slug
  return decoded.replace(/[-_+.]+/g, ' ').trim()
}
