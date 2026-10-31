/**
 * WORD SEGMENTATION for languages that are written without spaces.
 *
 * Every text measurement in this repository was built on `split(' ')`: a
 * keyword is "multi-word" when it has two space-separated parts, a title is
 * "malformed" past eight of them, cannibalization compares the word SETS of two
 * titles, an anchor is relevant when enough words overlap. That is true of
 * Hebrew, English, Spanish, Portuguese, French and Italian, and false of
 * Japanese: 「サイトの表示速度を改善する方法」 is one space-separated token, so
 * every one of those measurements reads it as a single generic word and quietly
 * degrades — the keyword guard returns '', long-tail salvage rejects it, the
 * cannibalization check finds no subject words to compare, internal-link
 * relevance scores zero.
 *
 * So the tokenizer moves HERE, once, and the measurements keep their shape.
 * `Intl.Segmenter` (ICU, in V8 — no dependency, and Node runs with full ICU) does
 * the dictionary segmentation; `segmentToSpaces` writes the result back as a
 * space-separated string, which is what lets the ~40 call sites downstream keep
 * reading `split(' ')` and be right in Japanese too. A text's script is read off
 * its own CHARACTERS, not off a `language` column or a prop — the same choice
 * `lib/content/site-language.ts` makes — because a Japanese keyword on a project
 * whose language column says English must still segment as Japanese, and because
 * threading a locale through every one of those call sites is the change that
 * does not land.
 *
 * `ja`, `zh`, `th` and `ko` are segmented. Korean does use spaces, but at the
 * phrase (eojeol) level, so its particles ride along on the word they follow and
 * the segmenter is strictly better there as well. Everything else is returned
 * untouched: for a Latin or Hebrew text every function here is the whitespace
 * split it replaces, down to the empty-token filtering.
 */

export type TextScript = 'spaced' | 'ja' | 'zh' | 'ko' | 'th'

/** Characters that belong to a script written without word spaces. */
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/
const HAN = /[㐀-䶿一-鿿豈-﫿]/u
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
const THAI = /[฀-๿]/
/** One class, for finding the RUNS of such characters inside a mixed text. */
const SCRIPTLESS_CHAR = /[฀-๿ᄀ-ᇿ々〆぀-ヿ㄰-㆏ㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]/

/**
 * WHICH script is this text written in, as far as word breaks are concerned?
 *
 * Han WITHOUT kana is ambiguous — 「表示速度」 is an ordinary Japanese keyword and
 * also valid Chinese — and it is answered 'ja' deliberately: Japanese is the
 * language we publish in, and the dictionary ICU uses for a CJK run is the same
 * one either way. A Chinese locale would have to pass its script in rather than
 * rely on the characters, which is what `TextScript` keeps a 'zh' value for.
 * A text with none of these characters is `spaced`, which is every language the
 * site publishes in today.
 */
export function textScript(text: string | null | undefined): TextScript {
  const s = String(text ?? '')
  if (!s) return 'spaced'
  if (KANA.test(s)) return 'ja'
  if (THAI.test(s)) return 'th'
  if (HANGUL.test(s)) return 'ko'
  if (HAN.test(s)) return 'ja'
  return 'spaced'
}

/** Is this text written without word spaces? */
export function isScriptless(text: string | null | undefined): boolean {
  return textScript(text) !== 'spaced'
}

type Segmenter = { segment: (s: string) => Iterable<{ segment: string; isWordLike?: boolean }> }
const segmenters = new Map<string, Segmenter | null>()

/**
 * The ICU word segmenter for a locale, or null where the runtime has no
 * segmentation data for it. Cached: constructing one is the expensive part, and
 * the content pipeline calls this per keyword.
 */
function segmenterFor(locale: string): Segmenter | null {
  if (!segmenters.has(locale)) {
    let seg: Segmenter | null = null
    try {
      // `Intl.Segmenter` is ES2022 and present in V8; a runtime built with
      // small-icu answers without Japanese dictionary data rather than throwing,
      // which the caller cannot detect — so a failure here means no segmenter and
      // the whitespace behaviour we had before, never a crash in a cron.
      if (typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function') {
        seg = new Intl.Segmenter(locale, { granularity: 'word' }) as unknown as Segmenter
      }
    } catch {
      seg = null
    }
    segmenters.set(locale, seg)
  }
  return segmenters.get(locale) ?? null
}

/** The word-like tokens of a run of scriptless text. */
function segmentRun(run: string, script: TextScript): string[] {
  const seg = segmenterFor(script === 'spaced' ? 'en' : script)
  if (!seg) return [run]
  const out: string[] = []
  for (const piece of seg.segment(run)) {
    if (piece.isWordLike && piece.segment.trim()) out.push(piece.segment)
  }
  return out.length ? out : [run]
}

/**
 * The text with its scriptless runs broken into space-separated words.
 *
 * THE SEAM. A normalizer that passes its text through this keeps every
 * `split(' ')` downstream correct, in every language: a Latin or Hebrew text is
 * returned with its whitespace collapsed and nothing else, and
 * 「サイトの表示速度」 comes back as 「サイト の 表示 速度」. Mixed text is
 * handled run by run, so "Core Web Vitals の改善方法" keeps its Latin words whole.
 */
export function segmentToSpaces(text: string | null | undefined): string {
  const s = String(text ?? '')
  if (!s || !SCRIPTLESS_CHAR.test(s)) return s.replace(/\s+/g, ' ').trim()
  const script = textScript(s)
  const out: string[] = []
  let run = ''
  let plain = ''
  const flushRun = () => { if (run) { out.push(...segmentRun(run, script)); run = '' } }
  const flushPlain = () => { if (plain) { out.push(plain); plain = '' } }
  for (const ch of s) {
    if (SCRIPTLESS_CHAR.test(ch)) { flushPlain(); run += ch; continue }
    flushRun()
    plain += ch
  }
  flushRun()
  flushPlain()
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * The words of a text, in order. The whitespace split for a spaced language, the
 * ICU segmentation for Japanese, Chinese, Thai and Korean.
 */
export function segmentWords(text: string | null | undefined): string[] {
  return segmentToSpaces(text).split(' ').filter(Boolean)
}

/** How many words a text has. One number, so no call site counts spaces itself. */
export function wordCount(text: string | null | undefined): number {
  return segmentWords(text).length
}

/**
 * JAPANESE words that say nothing about a subject: the grammatical particles and
 * auxiliaries, and the generic words that frame an article the way "המדריך המלא"
 * and "best … guide" do in the two lists `lib/content/cannibalization/normalize.ts`
 * already holds. Kept here, beside the tokenizer, because a token list is only
 * meaningful against the tokenizer that produced it.
 */
export const JA_NOISE: ReadonlySet<string> = new Set([
  // particles and copulas
  'の', 'を', 'に', 'は', 'が', 'で', 'と', 'へ', 'や', 'も', 'か', 'ね', 'よ', 'な', 'だ', 'から', 'まで', 'より', 'など', 'ため', 'こと', 'もの',
  'です', 'ます', 'である', 'する', 'した', 'して', 'される', 'られる', 'いる', 'ある', 'なる', 'できる', 'そして', 'また', 'ついて', 'における', 'に関する',
  // generic article framing
  'ガイド', '完全ガイド', '方法', 'やり方', 'おすすめ', 'オススメ', 'まとめ', '比較', '違い', '一覧', '徹底', '解説', '入門', '初心者', '最新', '最適',
  'ポイント', 'コツ', 'ヒント', 'メリット', 'デメリット', 'レビュー', '口コミ', '評判', '選び方', '基本', '基礎', '必見', '必要', '無料', '価格', '料金',
  '安い', '購入', '今', '年', '月', '日',
])

/**
 * Is this scriptless token noise? Its particles and article-framing words, and
 * also a LONE hiragana character: ICU breaks an inflected verb into its stem and
 * its ending (「速くする」 → 速 く する), and that stray 「く」 is a fragment of a
 * word rather than a word. A lone kanji or a lone katakana word is kept, because
 * 店 and 鍵 are nouns.
 */
export function isScriptlessNoise(token: string): boolean {
  if (JA_NOISE.has(token)) return true
  return token.length === 1 && /[\u3040-\u309f]/.test(token)
}

/**
 * IS THIS TOKEN TOO SHORT to carry a subject? The script-aware form of the
 * `w.length < 3` test that guards a dozen token filters in this repository.
 *
 * A one- or two-letter Hebrew or English word says nothing about a subject, so
 * the length floor is right there and stays exactly as it was. It is wrong in
 * Japanese, where 店 (shop), 車 (car) and 鍵 (key) are ordinary nouns and the
 * words that say nothing are the particles — so for a scriptless token the noise
 * list answers instead of the length. Every other property of the caller's
 * filter (a stop-word set, a digit test) is left to the caller, so swapping a
 * length test for this one cannot change what a non-Japanese text produces.
 */
export function isShortToken(word: string, minSpacedLength: number): boolean {
  if (isScriptless(word)) return isScriptlessNoise(word)
  return word.length < minSpacedLength
}

/**
 * Is this token noise — a stop word, a bare number, a year? Script-aware, which
 * is the part a length test cannot be: the spaced languages drop their short
 * tokens because a one- or two-letter Hebrew or English word carries no subject,
 * while 店, 車 and 鍵 are ordinary Japanese nouns and 「の」 is not. So length
 * decides for a spaced script and the list decides for a scriptless one.
 */
export function isNoiseToken(token: string, minSpacedLength = 2): boolean {
  const t = token.trim()
  if (!t) return true
  if (/^\d+$/.test(t)) return true
  if (isScriptless(t)) return isScriptlessNoise(t)
  return t.length < minSpacedLength
}

/** The subject-bearing tokens of a text: its words without the noise. */
export function contentWords(text: string | null | undefined, minSpacedLength = 2): string[] {
  return segmentWords(text).filter((w) => !isNoiseToken(w, minSpacedLength))
}

/**
 * HOW MUCH FINER a scriptless text segments than a spaced one says the same
 * thing. Two independent measurements of ICU's own output agree on it:
 *
 *   「サイトの表示速度を改善する方法」 → 8 tokens, where "how to improve site speed"
 *   is 5 (1.6×); and a 145-character Japanese paragraph → 85 tokens, 1.71
 *   characters per token, against the ~5.5 characters of an English word.
 *
 * So every budget written in spaced words — a keyword's maximum length, a
 * paragraph's, a sentence's — has to be multiplied by this before it is applied
 * to Japanese, or it rejects ordinary Japanese text. It is a measured ratio of
 * OUR OWN copy, not a published constant.
 */
export const UNSPACED_TOKEN_FACTOR = 1.7

/**
 * A word budget written for a spaced language, in the units THIS text is
 * measured in: unchanged for Hebrew, Latin and the rest, multiplied for a text
 * written without spaces.
 */
export function maxPhraseWords(text: string | null | undefined, spacedMax: number): number {
  return isScriptless(text) ? Math.round(spacedMax * UNSPACED_TOKEN_FACTOR) : spacedMax
}

/**
 * How the words of THIS text are written back as a phrase: with spaces in a
 * spaced language, with nothing between them in Japanese, Chinese or Thai, where
 * a space inside a phrase is a visible error. Korean keeps its spaces.
 */
export function joinWords(words: readonly string[], likeText: string | null | undefined): string {
  const script = textScript(likeText)
  return words.join(script === 'spaced' || script === 'ko' ? ' ' : '')
}
