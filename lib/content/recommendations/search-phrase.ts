/**
 * PRIMARY-KEYWORD → clean SEARCH PHRASE normalization (P0-3), pure + domain-neutral.
 *
 * Live-proven defect: Gemini Pro returned HEADLINE-shaped primary keywords —
 * "מהי הרמה המומלצת של ויטמין D בדם ואיך מגיעים אליה?", "מחפשים חנות פרחים
 * בירושלים? כך תמצאו את הזר המושלם" — i.e. the article TITLE, not a target
 * query. A primary keyword must be a concise phrase a user would actually type.
 *
 * This strips headline openers/suffixes and second clauses to the target query,
 * rewrites "כמה עולה X" → "מחיר X" (price intent), and — when the residue is
 * still headline-shaped — prefers the brief's exact aligned demand query, else a
 * concise subject derived from the brief. It NEVER truncates mid-clause.
 * isSearchPhraseQuality is the acceptance gate over the FINAL keyword.
 */

import { normalizePhrase } from './keyword-guard'
import { distinctiveTokensOf, canonicalVariants } from './semantic-dup'

// Function-word OPENERS a search query does not start with (question headline
// frames). Domain-neutral grammar, not industry content.
const OPENERS_RE = /^\s*(?:מהי|מהו|מהם|מהן|מה\s+(?:זה|היא|הוא|הם|הן)|כיצד|איך|למה|מדוע|האם|מחפשים|מחפש|רוצים|רוצה|צריכים|צריך|מתלבטים)\s+/
// GUIDE openers ("המדריך המלא ל…", "מדריך ל…", "כל מה שצריך לדעת על…") — the
// object that follows is the real subject; a leading ל proclitic is stripped.
const GUIDE_OPENER_RE = /^\s*(?:ה?מדריך\s+(?:ה?מלא|ה?שלם|ה?מקיף)|ה?מדריך|כל\s+מה\s+ש\S+\s+לדעת(?:\s+על)?)\s+/
// ACTION openers — INFINITIVE VERBS only ("לבחור/לרכוש/לקנות/להקים/לפתוח X" →
// the object X). Construct-state NOUN forms (בחירת/רכישת/הקמת) are kept — they
// ARE the subject ("בחירת ויטמין D").
const ACTION_OPENER_RE = /^\s*(?:לבחור|לרכוש|לקנות|להקים|לפתוח|למצוא)\s+/
// "כמה עולה X" / "כמה עולה ל־X" → price intent → "מחיר X".
const HOW_MUCH_RE = /^\s*כמה\s+עולה\s+(?:ל)?/
// HEADLINE second-clause / suffix markers: everything from here on is title fluff.
// No \b — JS word boundaries do not apply around Hebrew letters; anchor on space.
const SECOND_CLAUSE_RE = /\s*(?:[?!]|:|\s[—–|]\s|\s-\s)\s*.*$/
// A mid/tail "המדריך ל…" / "מדריך ל…" guide clause is headline framing that
// describes the subject — "ויטמין D המדריך להשוואת סוגים ומינונים" → "ויטמין D".
const HEADLINE_TAIL_RE = /\s+(?:ו?איך\s.*|ו?כיצד\s.*|כך\s+ת.*|פירוט\s.*|וגורמי.*|וכל\s+מה.*|טיפים\s.*|ומה\s+עוד.*|ה?מדריך\s+(?:ה?מלא|ה?שלם|ה?מקיף|ל\S).*|מדריך\s+מלא.*|ש(?:כדאי|חשוב|מומלץ|צריך|רצוי|יכול)\s.*|לחיסכון.*|למשלוח\s.*|ה?מושלם(?:\s.*)?|ה?מצליח(?:ה|ות)?(?:\s.*)?)$/
// A trailing dangling connective left after stripping.
const DANGLING_TAIL_RE = /\s+(?:של|עם|או|ו|כי|עבור|לפי|על|אל|את|כדי|and|or|of|for|with|to)\s*$/i

const MAX_SEARCH_TOKENS = 7

export interface SearchPhraseResult {
  keyword: string
  changed: boolean
  method: 'unchanged' | 'stripped_headline' | 'price_rewrite' | 'aligned_query' | 'brief_subject'
}

/** Strip one layer of headline framing from a phrase (openers, second clause,
 *  tail fluff, dangling connective). Pure string surgery — never mid-clause. */
// "X המדריך ל Y" — a GUIDE about X whose object Y IS the differentiated search
// intent (a comparison, a dosage, a how-to). Collapsing to the head X alone
// ("ויטמין D") is over-broad and loses intent; keep the object by reordering to
// "Y X" ("השוואת סוגים ומינונים ויטמין D"). Requires a real head before the guide
// (a LEADING "המדריך ל…" is a GUIDE_OPENER, handled separately — no head here).
const GUIDE_ABOUT_RE = /^(.*?\S)\s+ה?מדריך\s+ל(?![א-ת]*\s*$)(\S.*)$/

export function stripHeadlineFraming(raw: string): string {
  let s = (raw || '').trim()
  const guide = s.match(GUIDE_ABOUT_RE)
  if (guide) {
    const head = guide[1].trim()
    const object = guide[2].trim()
    if (head && object) s = `${object} ${head}`
  }
  const priced = HOW_MUCH_RE.test(s)
  s = s.replace(SECOND_CLAUSE_RE, '')       // drop everything after ? ! : — | -
  s = s.replace(HEADLINE_TAIL_RE, '')       // drop appended headline tails
  s = s.replace(OPENERS_RE, '')             // drop leading question opener
  s = s.replace(HOW_MUCH_RE, '')            // drop "כמה עולה"
  // Guide/action openers → strip the frame and de-proclitic the object (a
  // leading ל on the next word: "לבחירת" → "בחירת").
  if (GUIDE_OPENER_RE.test(s)) { s = s.replace(GUIDE_OPENER_RE, '').replace(/^ל(?=[א-ת])/, '') }
  s = s.replace(ACTION_OPENER_RE, '')
  s = s.replace(DANGLING_TAIL_RE, '')       // drop a dangling connective
  s = s.replace(/\s{2,}/g, ' ').replace(/[?!.,:;"'“”׳״]+$/g, '').trim()
  // Price intent: prefix "מחיר" when the query was a "how much does X cost" form
  // and does not already carry a price word.
  if (priced && s && !/\b(?:מחיר|עלות|כמה\s+עולה)\b/.test(s)) s = `מחיר ${s}`
  return s
}

/**
 * Normalize a model keyword to a clean search phrase. Order: strip framing → if
 * still headline-shaped, prefer the brief's aligned query (when it shares the
 * subject), else the brief subject. Never returns a two-clause / opener phrase.
 */
export function normalizeToSearchPhrase(
  rawKeyword: string,
  brief: { subject: string; alignedQuery?: string | null },
): SearchPhraseResult {
  const raw = (rawKeyword || '').trim()
  const stripped = stripHeadlineFraming(raw)
  const strippedOk = stripped.length > 0 && isSearchPhraseQuality(stripped)

  // Prefer the brief's aligned query when it is a clean phrase AND shares the
  // stripped subject (so we keep demand alignment, not a foreign query).
  const aligned = (brief.alignedQuery || '').trim()
  const strippedToks = new Set(distinctiveTokensOf(stripped).flatMap((t) => canonicalVariants(t)))
  const alignedShares = aligned && distinctiveTokensOf(aligned).some((t) => canonicalVariants(t).some((v) => strippedToks.has(v)))

  if (strippedOk) {
    if (normalizePhrase(stripped) === normalizePhrase(raw)) return { keyword: stripped, changed: false, method: 'unchanged' }
    return { keyword: stripped, changed: true, method: /^מחיר\s/.test(stripped) && !/^מחיר\s/.test(raw) ? 'price_rewrite' : 'stripped_headline' }
  }
  if (aligned && alignedShares && isSearchPhraseQuality(aligned)) return { keyword: aligned, changed: true, method: 'aligned_query' }

  // Fall back to a concise subject from the brief (a supported real phrase).
  const subj = conciseSubject(brief.subject)
  if (subj) return { keyword: subj, changed: true, method: 'brief_subject' }
  // Last resort: the best clean residue we have.
  return { keyword: stripped || raw, changed: stripped !== raw, method: 'stripped_headline' }
}

/** A concise subject from a (possibly long) brief subject — strip framing, cap. */
function conciseSubject(subject: string): string {
  const s = stripHeadlineFraming(subject)
  const toks = s.split(/\s+/).filter(Boolean)
  return toks.length <= MAX_SEARCH_TOKENS ? s : ''
}

/**
 * Acceptance gate: is this a clean target search phrase (not a headline)?
 * Rejects: two clauses joined by ?/!/:/dash, appended headline tails, a leading
 * question opener with a long tail, dangling connectives, or an over-long phrase.
 */
export function isSearchPhraseQuality(keyword: string): boolean {
  const k = (keyword || '').trim()
  if (!k) return false
  // Two clauses (a ?/!/:/— separator followed by MORE text) — a headline.
  if (/[?!](?:\s*\S)|(?::|\s[—–|]\s|\s-\s)\s*\S/.test(k)) return false
  if (HEADLINE_TAIL_RE.test(k)) return false
  if (DANGLING_TAIL_RE.test(k)) return false
  // A leading opener is allowed ONLY for a short, self-contained question query.
  const toks = k.split(/\s+/).filter(Boolean)
  if (toks.length > MAX_SEARCH_TOKENS + 1) return false
  if (OPENERS_RE.test(k)) {
    // e.g. "איך לשמור על ורדים" is fine (short); a long opener phrase is not.
    if (toks.length > 5) return false
  }
  if (HOW_MUCH_RE.test(k)) return false // "כמה עולה …" is a headline form → "מחיר …"
  return true
}
