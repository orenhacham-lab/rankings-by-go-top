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
import { subjectTokensOf, sharesSubjectHead } from './link-relevance'

// TEMPORAL / numeric-only residue words — a year, date or number can never be
// the ONLY meaningful token of a search phrase ("שנת 2026"). Domain-neutral.
const TEMPORAL_RE = /^(?:שנת|שנה|שנים|השנה|החודש|חודש|חודשים|יום|היום|שבוע|שבועות|רבעון|עונה|(?:19|20)\d\d|q[1-4]|year|month|day|week)$/i

/** The DISTINCTIVE, non-temporal, non-numeric subject tokens of a phrase — the
 *  tokens that carry a real subject/entity ("ויטמין", "D"), excluding a bare
 *  year/number/temporal word ("שנת", "2026"). */
function realSubjectTokens(s: string): string[] {
  return subjectTokensOf(s).filter((t) => !/^\d+$/.test(t) && !TEMPORAL_RE.test(t))
}

/** Does the keyword carry at least one REAL subject/entity token (not merely a
 *  year/number/temporal/generic residue)? "שנת 2026" → false; "ויטמין D" → true. */
export function keywordHasRealSubject(keyword: string): boolean {
  return realSubjectTokens(keyword).length > 0
}

/** INVARIANT: the final keyword must preserve at least one real subject/entity
 *  token from the brief subject or the aligned demand query — never collapse to a
 *  year/adjective/guide-word residue. When the reference itself has no real
 *  subject to compare, fall back to requiring the keyword to carry SOME real
 *  subject token of its own. */
export function keywordPreservesSubject(keyword: string, subject: string, alignedQuery?: string | null): boolean {
  if (!keywordHasRealSubject(keyword)) return false
  const refHasReal = realSubjectTokens(subject).length > 0 || realSubjectTokens(alignedQuery || '').length > 0
  if (!refHasReal) return true
  return sharesSubjectHead(keyword, subject) || (!!alignedQuery && sharesSubjectHead(keyword, alignedQuery))
}

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
//
// The `ו?(?:איך|כיצד)` branch closes a gap between this rule and HEADLINE_TAIL_RE.
// HEADLINE_TAIL_RE catches a coordinating question clause only MID-phrase (its
// `ו?איך\s.*` / `ו?כיצד\s.*` branches require whitespace AND more text after the
// question word), so a phrase whose LAST token is that word matched neither rule.
// Live consequence: a headline was stripped to "נשים בוחרות בשמים מתוקים ואיך",
// which passed isSearchPhraseQuality (5 tokens, opener removed) and was ACCEPTED as a
// primary keyword — a mid-clause fragment nobody searches, so the article targeted
// nothing. The repair produced garbage to satisfy the very gate it was repairing for.
//
// The list is deliberately TWO words, not the full question set. Measured against 1,068
// real Hebrew phrases from the project corpora: `איך` occurs terminally twice (both
// fragments) and `כיצד`/`מה`/`למה`/`מדוע`/`האם` occur terminally ZERO times, so the
// other four would be dead weight rather than protection. `כיצד` is retained as the
// formal register of the same construction. Terminal `מה`/`למה`/`מדוע`/`האם` are NOT
// matched — that omission is measured, not an oversight (see the QA, which asserts it).
//
// Word-boundary safe: the leading `\s+` means only a standalone `מה`-class token could
// ever match, so `כמה`/`במה`/`דמה` are unaffected, and an OPENER-led phrase
// ("איך לשמור על זר פרחים") is untouched because the word is not at the end.
const DANGLING_TAIL_RE = /\s+(?:של|עם|או|ו|כי|עבור|לפי|על|אל|את|כדי|and|or|of|for|with|to|ו?(?:איך|כיצד)[?!]?)\s*$/i

/** Longest a target search phrase should be. NOTE: the acceptance gate below admits
 *  MAX_SEARCH_TOKENS + 1 (a deliberate tolerance for the phrase a model actually
 *  wrote). A DERIVED value — one the pipeline manufactured rather than received —
 *  is held to this constant itself; see isAdoptableTitleRepair. */
export const MAX_SEARCH_TOKENS = 7

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
  // A clean residue is acceptable ONLY when it still preserves a real subject
  // token from the brief — stripping a "המדריך לשנת 2026" tail down to the year
  // "שנת 2026" passes shape/length yet LOST the subject and must fall back.
  const strippedOk = stripped.length > 0 && isSearchPhraseQuality(stripped) && keywordPreservesSubject(stripped, brief.subject, brief.alignedQuery)

  const aligned = (brief.alignedQuery || '').trim()

  if (strippedOk) {
    if (normalizePhrase(stripped) === normalizePhrase(raw)) return { keyword: stripped, changed: false, method: 'unchanged' }
    return { keyword: stripped, changed: true, method: /^מחיר\s/.test(stripped) && !/^מחיר\s/.test(raw) ? 'price_rewrite' : 'stripped_headline' }
  }
  // Headline-shaped OR subject-losing residue → prefer a phrase that PRESERVES the
  // need: the aligned demand query, then a concise brief subject.
  if (aligned && isSearchPhraseQuality(aligned) && keywordPreservesSubject(aligned, brief.subject, brief.alignedQuery)) return { keyword: aligned, changed: true, method: 'aligned_query' }

  // Fall back to a concise subject from the brief (a supported real phrase).
  const subj = conciseSubject(brief.subject)
  if (subj && keywordHasRealSubject(subj)) return { keyword: subj, changed: true, method: 'brief_subject' }
  // Last resort: the best clean residue we have (still preferring a real subject).
  const best = keywordHasRealSubject(stripped) ? stripped : (keywordHasRealSubject(raw) ? raw : (subj || stripped || raw))
  return { keyword: best, changed: normalizePhrase(best) !== normalizePhrase(raw), method: 'stripped_headline' }
}

/** A concise subject from a (possibly long) subject/title — strip framing, cap. */
export function conciseSubject(subject: string): string {
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
