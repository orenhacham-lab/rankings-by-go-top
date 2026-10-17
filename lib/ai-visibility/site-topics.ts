/**
 * What a site is actually about, read from its own pages (w8-relevance).
 *
 * WHY. Two lists were judged against the site's broad field instead of its
 * content. The recommended AI questions counted any travel word as the
 * business's word, and a page "answered" a question when the two shared two
 * words, so "איזה אתר מומלץ לתכנון טיול לחו״ל?" scored 94 for a Japan site and
 * a "pocket wifi" question was sent to the weather page ("מזג אוויר"). The
 * keyword research counted a keyword as the site's when its words appeared
 * anywhere on the site, so "טיולים בדרום" (Israel's south) passed: one page
 * compares Japan with South Korea ("דרום קוריאה") and every page says "טיול".
 *
 * THE MODEL, from the page titles (the full-site mapping, else the content
 * index), the scan's niche, the business name and domain, and the owner's own
 * terms (tracked keywords, the scan's seed keywords and topics):
 *   core      the site's subject: a word most titles repeat ("יפן") or that the
 *             niche/name share with the titles, minus the field's own words.
 *             When that leaves nothing (a shop whose subject IS its field), the
 *             field's frequent words stay core.
 *   generic   the field's own words ("טיול", "טיסות", "מסלול" for travel): every
 *             business in the field says them, so they are never evidence.
 *   entities  the words of the titles' main parts (before ":" or "–") and of
 *             the owner's terms that are neither core nor generic ("טוקיו",
 *             "אונסן", "ביטוח"). A word that, on every title that has it, sits
 *             next to the same word is half of a name: "דרום" only in "דרום
 *             קוריאה", "אוויר" only in "מזג אוויר". It counts only with its
 *             partner, so "טיולים בדרום" does not name "דרום קוריאה".
 *   pages     per page, the entity words of its title's main part, in order. A
 *             text is about that page when it names the first of them and at
 *             least half of them.
 *
 * Pure and deterministic: no model, no request. Hebrew is compared by stem (one
 * or two prefix letters, plural and final-letter forms), English by lowercase word.
 */
import { categoryOfferings, type BusinessCategory } from './prompt-templates'

/** Fewer titled pages than this say too little about a site: callers keep their old rules. */
export const SITE_TOPICS_MIN_PAGES = 5
/** A word in at least this share of the titles (and at least 3) is the site's subject. */
export const CORE_SHARE = 0.35

export type SiteTopics = {
  /** Subject stems ("יפנ"). */
  core: string[]
  /** The field's own stems. */
  generic: string[]
  /** The niche's own words (not the subject): a page about them only is the site's general guide. */
  broad: string[]
  /** Stems that count on their own, with the word to show for each. `main`: from a title's main part or the owner's terms. */
  entities: Array<{ stem: string; word: string; main: boolean }>
  /** Stems that only count together, with the words to show. */
  phrases: Array<{ stems: [string, string]; words: string; main: boolean }>
  /** Per page: its title, url, the stems of its main part in order (the subject left out), and all its title's stems. */
  pages: Array<{ title: string; url: string; head: string[]; words: string[] }>
  /** The word shown for a stem. */
  display: Record<string, string>
}

export type SiteTopicsInput = {
  pages: ReadonlyArray<{ title: string | null | undefined; url?: string | null }>
  niche?: string | null
  businessName?: string | null
  domain?: string | null
  category?: BusinessCategory | null
  /** Tracked keywords, the scan's seed keywords and topics. */
  terms?: readonly (string | null | undefined)[]
}

const STOP = new Set([
  // Hebrew function, question and filler words
  'איך', 'מה', 'מהו', 'מהי', 'מהם', 'מהן', 'מי', 'איפה', 'היכן', 'כמה', 'איזה', 'איזו', 'אילו', 'למה', 'מדוע', 'מתי', 'האם', 'הכי', 'יותר',
  'טוב', 'טובה', 'טובים', 'טובות', 'מומלץ', 'מומלצת', 'מומלצים', 'מומלצות', 'המומלצים', 'המומלצות', 'כדאי', 'חשוב', 'לפני', 'אחרי', 'עם', 'על', 'של',
  'את', 'או', 'גם', 'זה', 'זו', 'יש', 'אין', 'אפשר', 'ניתן', 'ביותר', 'בין', 'עבור', 'עבורך', 'עבורכם', 'לגבי', 'הם', 'היא', 'הוא', 'אני', 'אנחנו',
  'שלי', 'שלכם', 'לכם', 'אתם', 'כל', 'בכל', 'רק', 'עוד', 'ועוד', 'מאוד', 'לא', 'כן', 'אם', 'כי', 'אבל', 'דרך', 'סוג', 'סוגי', 'מול', 'הנה', 'שכדאי',
  'שלא', 'מבלי', 'לוותר', 'הכירו', 'חייבים', 'להתחיל', 'ומאיפה', 'מאיפה', 'לכל', 'לבחור', 'בוחרים', 'בחירה', 'לבחירת', 'עולה', 'עולים', 'מחיר',
  'מחירים', 'עלות', 'שווה', 'נחשב', 'מוביל', 'המוביל', 'חוות', 'דעת', 'מדריך', 'המדריך', 'מדריכים', 'מלא', 'המלא', 'המלאה', 'מלאה', 'טיפים', 'טיפ',
  'מושלם', 'המושלם', 'המושלמים', 'המושלמת', 'ישראל', 'ישראלים', 'ישראלי', 'ישראלית', 'בארץ', 'הארץ', 'חדש', 'חדשה', 'להכיר', 'ראשון', 'הראשון',
  'ראשוני', 'חברת', 'חברה', 'חברות', 'להזמין', 'להזמנה', 'הזמנת', 'למצוא', 'לקנות', 'לעשות', 'לראות', 'לדעת', 'להגיע', 'לתכנן', 'מעשי', 'בלתי',
  'נשכחת', 'מרתקת', 'עוצרי', 'נשימה', 'ואיפה', 'לאכול', 'חכמה', 'בעיר', 'היפה', 'היפים', 'חוויה', 'החוויה', 'חוויית', 'שלכם', 'אצלכם',
  'אתר', 'אתרים', 'האתר', 'באתר', 'מידע', 'שאלות', 'תשובות',
  // English
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'from', 'best', 'how', 'what', 'which', 'who', 'where', 'when', 'why', 'is', 'are',
  'do', 'does', 'can', 'should', 'with', 'and', 'or', 'my', 'your', 'our', 'much', 'cost', 'price', 'good', 'top', 'recommended', 'vs', 'about',
  'reviews', 'review', 'guide', 'complete', 'ultimate', 'tips', 'israel', 'israeli', 'near', 'me', 'new', 'first', 'company', 'site', 'website',
])

/**
 * The field's everyday words beyond its offerings (prompt-templates.ts): what
 * every business in the field writes. Only fields whose offerings leave such
 * words out are listed.
 */
const FIELD_WORDS: Partial<Record<BusinessCategory, readonly string[]>> = {
  travel: ['מטייל', 'מטיילים', 'למטייל', 'למטיילים', 'יעד', 'יעדים', 'מסלול', 'מסלולים', 'מסלולי', 'סיור', 'סיורים', 'נופש', 'אטרקציות',
    'אטרקציה', 'לינה', 'מלון', 'מלונות', 'טיסה', 'נסיעה', 'חו״ל', 'חול', 'trip', 'trips', 'tour', 'tours', 'destination', 'destinations', 'hotel', 'hotels'],
}

/** Pages that say nothing about the business (legal, contact, the blog index). */
const UTILITY_TITLE = /^(בלוג|יצירת קשר|צור קשר|אודות|אודותינו|מדיניות פרטיות|תנאי שימוש|תקנון|הצהרת נגישות|עגלת קניות|תשלום|החשבון שלי|blog|contact( us)?|about( us)?|privacy( policy)?|terms( of (use|service))?|accessibility( statement)?|cart|checkout|my account)$/i

/** A legal, contact or index page, which says nothing about what the business covers. */
export const isUtilityTitle = (title: string) => UTILITY_TITLE.test(title.trim())

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
const HE_PREFIX = /^[והבלמשכ]/

/** HTML entities WordPress leaves in titles ("&#8211;", "&amp;"). */
export function decodeTitle(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
}

/** A word reduced to a comparable stem. */
export function siteStem(word: string): string {
  let w = word.toLowerCase().replace(/[״"׳'`]/g, '')
  if (/^[a-z0-9-]+$/.test(w)) return w.length > 3 ? w.replace(/(ies|s)$/, (m) => (m === 'ies' ? 'y' : '')) : w
  w = w.replace(/[ךםןףץ]/g, (c) => FINALS[c])
  // Up to three joined letters ("ו", "ב", "ה": "ובהוקאידו"), always stripped the same way, so
  // "מעיינות" and "המעיינות", "ביטוח" and "לביטוח" meet on one stem.
  for (let i = 0; i < 3 && w.length >= 4 && HE_PREFIX.test(w); i++) w = w.slice(1)
  if (w.length >= 5 && /(ימ|ות)$/.test(w)) w = w.slice(0, -2)
  if (w.length >= 4 && /[הת]$/.test(w)) w = w.slice(0, -1)
  return w
}

/** The words of a text, in order: [stem, the word as written]. Stop words and numbers are left out. */
export function siteWords(text: string | null | undefined): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const raw of decodeTitle(String(text ?? '')).split(/[^\p{L}\p{N}״"׳'-]+/u)) {
    const w = raw.replace(/^[-'"״׳]+|[-'"״׳]+$/g, '')
    if (w.length < 2 || /^\d+$/.test(w) || STOP.has(w.toLowerCase())) continue
    const s = siteStem(w)
    if (s.length < 2 || STOP.has(s)) continue
    out.push([s, w])
  }
  return out
}

/** Same stem, allowing one letter of difference at the end ("יפנ" / "יפני"). */
export const sameStem = (a: string, b: string) =>
  a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 1)
const hasStem = (list: readonly string[], s: string) => list.some((x) => sameStem(x, s))

/** The title's main part: before the first ":" or a spaced dash. */
function mainPart(title: string): string {
  return title.split(/\s[–—-]\s|:/)[0] ?? title
}

export function buildSiteTopics(input: SiteTopicsInput): SiteTopics | null {
  const seen = new Set<string>()
  const titled: Array<{ title: string; url: string; words: Array<[string, string]> }> = []
  for (const p of input.pages) {
    const title = decodeTitle(String(p.title ?? '')).replace(/\s+/g, ' ').trim()
    if (!title || UTILITY_TITLE.test(title) || seen.has(title)) continue
    seen.add(title)
    const words = siteWords(title)
    if (words.length === 0) continue
    titled.push({ title, url: String(p.url ?? ''), words })
  }
  if (titled.length < SITE_TOPICS_MIN_PAGES) return null

  // One canonical stem per word family (the first spelling met stands for its variants).
  const canon: string[] = []
  const canonOf = (s: string) => canon.find((c) => sameStem(c, s)) ?? (canon.push(s), s)
  const df = new Map<string, number>()
  for (const t of titled) {
    for (const c of new Set(t.words.map(([s]) => canonOf(s)))) df.set(c, (df.get(c) ?? 0) + 1)
  }
  const n = titled.length
  const fieldStems = [
    ...(input.category && input.category !== 'generic' ? categoryOfferings(input.category) : []),
    ...(input.category ? FIELD_WORDS[input.category] ?? [] : []),
  ].flatMap((o) => siteWords(o).map(([s]) => s))
  const frequent = [...df.entries()].filter(([, d]) => d >= Math.max(3, Math.ceil(n * CORE_SHARE))).map(([c]) => c)
  const named = [...siteWords(input.niche), ...siteWords(input.businessName), ...siteWords(input.domain?.replace(/\.[a-z.]+$/i, ''))]
    .map(([s]) => s)
    .filter((s) => [...df.keys()].some((c) => sameStem(c, s)))
    .map(canonOf)
  let core = [...new Set([...frequent, ...named])].filter((c) => !hasStem(fieldStems, c))
  if (core.length === 0) core = [...new Set(frequent)]
  const generic = [...new Set(fieldStems.filter((s) => !hasStem(core, s)))]
  const isEntity = (s: string) => !hasStem(core, s) && !hasStem(generic, s)

  // Half of a name: on every title that has it, the same entity word sits beside it, and that word
  // only ever sits beside it too ("דרום קוריאה", "מזג אוויר").
  const partners = new Map<string, Set<string>>()
  for (const t of titled) {
    const cs = t.words.map(([s]) => canonOf(s))
    cs.forEach((c, i) => {
      if (!isEntity(c)) return
      const nb = new Set([cs[i - 1], cs[i + 1]].filter((x): x is string => !!x && x !== c && isEntity(x)))
      const prev = partners.get(c)
      partners.set(c, prev ? new Set([...prev].filter((x) => nb.has(x))) : nb)
    })
  }
  // The shortest spelling of each word family is the one shown ("טוקיו", not "בטוקיו").
  const display = new Map<string, string>()
  const spell = (s: string, written: string) => {
    const c = canonOf(s)
    // "ותרבות" is shown as "תרבות": a joined "and" is not part of the name.
    const w = written.length >= 5 && written.startsWith('ו') && !s.startsWith('ו') ? written.slice(1) : written
    const cur = display.get(c)
    if (!cur || w.length < cur.length) display.set(c, w)
  }
  for (const t of titled) for (const [s, w] of t.words) spell(s, w)
  for (const term of input.terms ?? []) for (const [s, w] of siteWords(term)) spell(s, w)
  const entities: SiteTopics['entities'] = []
  const phrases: SiteTopics['phrases'] = []
  const done = new Map<string, boolean>()
  const phraseKeys = new Map<string, SiteTopics['phrases'][number]>()
  const addWord = (s: string, main: boolean) => {
    const c = canonOf(s)
    if (!isEntity(c)) return
    if (done.has(c)) {
      // A word first met in a subtitle is promoted when a main part or a term names it too.
      if (main && !done.get(c)) {
        done.set(c, true)
        for (const e of entities) if (e.stem === c) e.main = true
        for (const p of phrases) if (p.stems.includes(c)) p.main = true
      }
      return
    }
    done.set(c, main)
    // Only a pair that never appears apart is one name; a word beside a word that also stands alone
    // ("רכבות" of "כרטיס רכבות", where "כרטיס" is on another page too) is a subject of its own.
    const bound = [...(partners.get(c) ?? [])].filter((p) => partners.get(p)?.has(c))
    if (bound.length === 0) { entities.push({ stem: c, word: display.get(c) ?? c, main }); return }
    for (const p of bound) {
      const key = [c, p].sort().join('|')
      const known = phraseKeys.get(key)
      if (known) { if (main) known.main = true; continue }
      const t = titled.find((x) => x.words.some(([ws]) => canonOf(ws) === c) && x.words.some(([ws]) => canonOf(ws) === p))
      const words = t ? t.words.filter(([ws]) => canonOf(ws) === c || canonOf(ws) === p).map(([ws]) => display.get(canonOf(ws)) ?? ws).join(' ') : display.get(c) ?? c
      const phrase = { stems: [c, p] as [string, string], words, main }
      phraseKeys.set(key, phrase)
      phrases.push(phrase)
    }
  }
  const pages = titled.map((t) => {
    const main = siteWords(mainPart(t.title))
    for (const [s] of main) addWord(s, true)
    return { title: t.title, url: t.url, head: [...new Set(main.map(([s]) => canonOf(s)).filter((c) => !hasStem(core, c)))], words: [...new Set(t.words.map(([s]) => canonOf(s)))] }
  })
  for (const term of input.terms ?? []) for (const [s] of siteWords(term)) addWord(s, true)
  // Words only a subtitle names count, a little less.
  for (const t of titled) for (const [s] of t.words) addWord(s, false)
  const broad = siteWords(input.niche).map(([s]) => s).filter((s) => !hasStem(core, s))
  return { core, generic, broad, entities, phrases, pages, display: Object.fromEntries(display) }
}

export type TopicTier = 'core' | 'head' | 'entity' | 'mention' | 'generic' | 'none'

export type TopicMatch = {
  tier: TopicTier
  /** 0-100 (TIER_SCORE). */
  score: number
  /** The site word(s) that tie the text to the site, as written on the site. */
  term: string | null
}

/**
 * The site's subject 100; a page's subject 90; another name from a title's main
 * part or the owner's terms 70; a name only a subtitle mentions 60; the field's
 * words only 20; nothing 0.
 */
export const TIER_SCORE: Record<TopicTier, number> = { core: 100, head: 90, entity: 70, mention: 60, generic: 20, none: 0 }
/** Below this a text is "less related to your site". */
export const RELATED_MIN = 50

function entityHit(stems: readonly string[], topics: SiteTopics): { word: string; main: boolean } | null {
  let weak: { word: string; main: boolean } | null = null
  for (const p of topics.phrases) {
    if (hasStem(stems, p.stems[0]) && hasStem(stems, p.stems[1])) {
      if (p.main) return { word: p.words, main: true }
      weak ??= { word: p.words, main: false }
    }
  }
  for (const e of topics.entities) {
    if (hasStem(stems, e.stem)) {
      if (e.main) return { word: e.word, main: true }
      weak ??= { word: e.word, main: false }
    }
  }
  return weak
}

/** A stem that on the site is only ever half of a two-word name. */
function halfName(stem: string, topics: SiteTopics): boolean {
  return !topics.entities.some((e) => sameStem(e.stem, stem)) && topics.phrases.some((p) => sameStem(p.stems[0], stem) || sameStem(p.stems[1], stem))
}

/**
 * The page whose subject the text names: the first word of its title's main
 * part, and at least half of them. A half-name opens a page only with its
 * partner. Ties go to the page whose whole title shares more words with the
 * text, then to the shorter title.
 */
export function pageFor(text: string, topics: SiteTopics): SiteTopics['pages'][number] | null {
  const stems = siteWords(text).map(([s]) => s)
  const namesCore = stems.some((s) => hasStem(topics.core, s))
  let best: { page: SiteTopics['pages'][number]; share: number; hits: number; overall: number } | null = null
  for (const page of topics.pages) {
    if (page.head.length === 0) continue
    // The page's own words, beside the field's ("בטוקיו" beside "מלונות"). A page about the
    // field's words only ("טיסה ליפן") needs the site's subject in the text, and one about the
    // niche itself ("מדריך טיולים ליפן", the site's general guide) answers nothing in particular.
    const own = page.head.filter((h) => !hasStem(topics.generic, h))
    if (own.length === 0 && (!namesCore || page.head.every((h) => hasStem(topics.broad, h)))) continue
    const key = own[0] ?? page.head[0]
    if (!hasStem(stems, key)) continue
    const hits = page.head.filter((h) => hasStem(stems, h)).length
    const ownHits = own.filter((h) => hasStem(stems, h)).length
    // A word several subjects start with ("כרטיס סים", "כרטיס רכבות") picks none of them alone.
    const shared = own.length > 1 && topics.pages.some((o) => {
      if (o === page) return false
      const oo = o.head.filter((h) => !hasStem(topics.generic, h))
      return oo.length > 1 && sameStem(oo[0], key) && !sameStem(oo[1], own[1])
    })
    if ((own.length > 0 && ownHits < (shared ? 2 : 1)) || hits < Math.ceil(page.head.length / 2)) continue
    // A page scoped to the site's subject ("ביטוח נסיעות ליפן") answers a text about that subject, not the field at large.
    if (!namesCore && page.words.some((w) => hasStem(topics.core, w))) continue
    // A half-name ("אוויר" of "מזג אוויר") opens its page only with its partner.
    if (halfName(key, topics) && !topics.phrases.some((p) => (sameStem(p.stems[0], key) || sameStem(p.stems[1], key)) && hasStem(stems, p.stems[0]) && hasStem(stems, p.stems[1]))) continue
    const share = hits / page.head.length
    const overall = page.words.filter((w) => hasStem(stems, w)).length
    const better = !best || share > best.share || (share === best.share && (overall > best.overall
      || (overall === best.overall && (hits > best.hits || (hits === best.hits && page.words.length < best.page.words.length))))
    )
    if (better) best = { page, share, hits, overall }
  }
  return best?.page ?? null
}

/** The site name (not its broad subject) a text mentions, as written on the site; null when none. */
export function entityOf(text: string, topics: SiteTopics): string | null {
  return entityHit(siteWords(text).map(([s]) => s), topics)?.word ?? null
}

/** How closely a text (a keyword, a question) belongs to the site's own subject. */
export function topicMatch(text: string, topics: SiteTopics): TopicMatch {
  const words = siteWords(text)
  const stems = words.map(([s]) => s)
  const coreWord = words.find(([s]) => hasStem(topics.core, s))
  if (coreWord) return { tier: 'core', score: TIER_SCORE.core, term: topics.display[topics.core.find((c) => sameStem(c, coreWord[0])) ?? ''] ?? coreWord[1] }
  const page = pageFor(text, topics)
  if (page) {
    const key = page.head.find((h) => !hasStem(topics.generic, h)) ?? page.head[0]
    return { tier: 'head', score: TIER_SCORE.head, term: topics.display[key] ?? key }
  }
  const ent = entityHit(stems, topics)
  if (ent) {
    const tier: TopicTier = ent.main ? 'entity' : 'mention'
    return { tier, score: TIER_SCORE[tier], term: ent.word }
  }
  if (stems.some((s) => hasStem(topics.generic, s))) return { tier: 'generic', score: TIER_SCORE.generic, term: null }
  return { tier: 'none', score: 0, term: null }
}

/** Direct address ("לכם", "שלכם", "you") reads as a message to the business, not a question people ask AI. */
const DIRECT_ADDRESS = /(^|[\s,.:;!?])(לכם|שלכם|אצלכם|אתם|עבורכם|עבורך|שלך|לך|you|your)(?=$|[\s,.:;!?])/i
/** The most questions the site's own titles add. */
export const MAX_TITLE_QUESTIONS = 6

/**
 * The questions the site's own pages already ask: a title that is a question
 * ("איך לבחור מלונות בטוקיו?") is exactly what someone asks an AI engine, and the
 * page is its answer. Whole titles only (a subtitle question has no subject of
 * its own), three words or more, none addressed to the reader.
 */
export function siteTitleQuestions(pages: ReadonlyArray<{ title: string | null | undefined }>, max = MAX_TITLE_QUESTIONS): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of pages) {
    const title = decodeTitle(String(p.title ?? '')).replace(/\s+/g, ' ').trim()
    if (!/[?؟]$/.test(title) || /[:–—]/.test(title) || DIRECT_ADDRESS.test(title)) continue
    if (title.split(' ').length < 3 || seen.has(title)) continue
    seen.add(title)
    out.push(title)
    if (out.length >= max) break
  }
  return out
}

const strs = (v: unknown, max = 5000): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string') ? (v as string[]) : null

/** A profile that came over the wire, checked field by field; null when any part is malformed. */
export function readSiteTopics(v: unknown): SiteTopics | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const core = strs(r.core), generic = strs(r.generic), broad = strs(r.broad)
  if (!core || !generic || !broad || !Array.isArray(r.entities) || !Array.isArray(r.phrases) || !Array.isArray(r.pages)) return null
  if (!r.display || typeof r.display !== 'object') return null
  const entities = (r.entities as unknown[]).filter((e): e is SiteTopics['entities'][number] => {
    const x = e as Record<string, unknown> | null
    return !!x && typeof x.stem === 'string' && typeof x.word === 'string' && typeof x.main === 'boolean'
  })
  const phrases = (r.phrases as unknown[]).filter((p): p is SiteTopics['phrases'][number] => {
    const x = p as Record<string, unknown> | null
    return !!x && Array.isArray(x.stems) && x.stems.length === 2 && x.stems.every((s) => typeof s === 'string') && typeof x.words === 'string' && typeof x.main === 'boolean'
  })
  const pages = (r.pages as unknown[]).filter((p): p is SiteTopics['pages'][number] => {
    const x = p as Record<string, unknown> | null
    return !!x && typeof x.title === 'string' && typeof x.url === 'string' && !!strs(x.head) && !!strs(x.words)
  })
  const display: Record<string, string> = {}
  for (const [k, w] of Object.entries(r.display as Record<string, unknown>)) if (typeof w === 'string') display[k] = w
  return { core, generic, broad, entities, phrases, pages, display }
}
