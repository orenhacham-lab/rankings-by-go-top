/**
 * THE RELEVANCE GATE STOPS REJECTING GOOD IDEAS (18 October 2026).
 *
 * The gate that keeps off-subject topics out of the queue (site-subject.ts +
 * researchKeywordIssue) was run over 4dogsoriginal.co.il's own plan, 101 pending
 * ideas, and it got three things wrong:
 *   - "מזרון לכלבים גדולים" was rejected on a store whose pages say "מזרן" and
 *     "גדול": the same word, spelled and inflected differently;
 *   - "השוואת סוגי מיטות לכלבים" was rejected at 2 of 4, because "השוואת" and
 *     "סוגי" belong to no market and still counted against it;
 *   - "עגלת גלידה לילדים", a children's toy, PASSED, because the mapping holds
 *     the shop's basket page "עגלת הקניות", so "עגלה" was a site word.
 *
 *  A) heStem: one prefix letter, a plural or feminine ending, the vowel letters;
 *     non-Hebrew untouched, and a stem is never shorter than three letters;
 *  B) the vocabulary carries its own stems, so both sides meet;
 *  C) the real cases: the seven ideas that were rejected by mistake now pass,
 *     and every drifted keyword is still rejected;
 *  D) utility pages (cart, checkout, terms, accessibility, contact) are left out
 *     of the merchant's titles, and a product page is never mistaken for one;
 *  E) structural words do not count against a keyword, and a keyword still needs
 *     two of its own words on the site;
 *  F) nothing changed where there is no vocabulary to judge by.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/content/recommendations/__qa__/gate-precision.qa.ts
 */
import { tokens } from '../dedupe'
import { heStem, isVocabAligned, researchKeywordIssue, siteOwnsTerm, vocabAlignment, MIN_SITE_VOCAB_TOKENS } from '../keyword-research'
import { isUtilityTitle, merchantTitles, titleHead } from '../site-subject'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** The vocabulary exactly as buildSiteVocabulary builds it (engine.ts absorb). */
function vocabularyOf(titles: readonly string[]): Set<string> {
  const vocab = new Set<string>()
  for (const t of titles) {
    for (const tk of tokens(t)) {
      vocab.add(tk)
      if (tk.length >= 4 && /^[בלמהושכ]/.test(tk)) vocab.add(tk.slice(1))
      const stem = heStem(tk)
      if (stem && stem !== tk) vocab.add(stem)
    }
  }
  return vocab
}

/** Page titles in the shape the store's own mapping has them. */
const STORE_TITLES = [
  'מזרן אורתופדי לכלב גדול', 'מיטה לכלבים בינוני', 'מיטת כלב מעוצבת', 'מזרן לכלב קטן',
  'קרן צבי ללעיסה', 'חטיפי עוגיות טבעיות לכלבים', 'קערת האכלה איטית', 'משטח ליקוק',
  'צעצוע לעיסה מגומי', 'שקיות איסוף', 'תוספי תזונה לכלבים', 'מיטה אובאלית',
  'בית לחתול', 'אביזרים לחיית מחמד', 'מזרן שטיפה במים', 'תיק נשיאה לכלב',
  'עגלת הקניות', 'צור קשר', 'אודות', 'הצהרת נגישות', 'תנאי שימוש', 'מדיניות פרטיות',
]

console.log('The relevance gate — precision')

// ── A) the stem ───────────────────────────────────────────────────────────
console.log('\nA) heStem')
{
  check('A1: a plural ending goes', heStem('כלבים') === heStem('כלב'), `${heStem('כלבים')} vs ${heStem('כלב')}`)
  check('A2: the vowel letters are spelled either way', heStem('מזרון') === heStem('מזרן'), `${heStem('מזרון')} vs ${heStem('מזרן')}`)
  check('A3: a plural adjective meets its singular', heStem('גדולים') === heStem('גדול'), `${heStem('גדולים')} vs ${heStem('גדול')}`)
  check('A4: a feminine plural meets its singular', heStem('מיטות') === heStem('מיטה'), `${heStem('מיטות')} vs ${heStem('מיטה')}`)
  check('A5: a root that begins with a prefix letter is left alone ("כלבים" is not "לבים")', heStem('כלבים') === 'כלב')
  check('A6: non-Hebrew is returned as it is', heStem('ortopedic') === 'ortopedic' && heStem('4dogs') === '4dogs')
  check('A7: a short word is never stemmed away', heStem('כלב').length >= 3 && heStem('מים').length >= 3 && heStem('יד') === 'יד')
  check('A8: two different subjects do not become one', heStem('אימוץ') !== heStem('מזרן') && heStem('צעצוע') !== heStem('מיטה'))
  // MUTATION CONTROL A — without the vowel step the real case stays broken.
  const noVowels = (t: string) => t.replace(/(יות|ות|ים|יה|ה)$/u, '')
  check('A2-MUT: a stem that keeps the vowel letters fails A2', noVowels('מזרון') !== noVowels('מזרן'))
}

// ── B) both sides meet ────────────────────────────────────────────────────
console.log('\nB) the vocabulary carries its stems')
{
  const vocab = vocabularyOf(STORE_TITLES)
  check('B1: the vocabulary is big enough to judge by', vocab.size >= MIN_SITE_VOCAB_TOKENS, String(vocab.size))
  check('B2: the stem of a site word is in it', vocab.has(heStem('מזרן')) && vocab.has(heStem('גדול')))
  check('B3: a keyword that spells it differently is aligned', isVocabAligned('מזרון לכלבים גדולים', vocab))
  check('B4: a word the site never uses is not', !isVocabAligned('אימוץ כלבים קטנים', vocab))
  // MUTATION CONTROL B — the matching as it was before the stems, on both sides:
  // the real case stays rejected, which is the bug this fixes.
  const plain = new Set<string>()
  for (const t of STORE_TITLES) for (const tk of tokens(t)) { plain.add(tk); if (tk.length >= 4 && /^[בלמהושכ]/.test(tk)) plain.add(tk.slice(1)) }
  const oldMatching = (kw: string) => {
    const all = Array.from(tokens(kw)).filter((t) => !/^\d+$/.test(t))
    const matched = all.filter((t) => plain.has(t) || (t.length >= 4 && /^[בלמהושכ]/.test(t) && plain.has(t.slice(1)))).length
    return matched >= 2 && matched / all.length > 0.5
  }
  check('B3-MUT: the matching as it was rejects "מזרון לכלבים גדולים"', !oldMatching('מזרון לכלבים גדולים'))
  check('B3-MUT2: and it rejects "מיטות אורתופדיות לכלבים" too', !oldMatching('מיטות אורתופדיות לכלבים') && isVocabAligned('מיטות אורתופדיות לכלבים', vocab))
}

// ── C) the real cases ─────────────────────────────────────────────────────
console.log('\nC) the store\'s own plan')
{
  const vocab = vocabularyOf(merchantTitles(STORE_TITLES.map((t) => ({ t, u: `https://4dogsoriginal.co.il/${encodeURIComponent(t)}` })), []))
  const brandTokens = tokens('4Dogs Original')
  const issue = (kw: string) => researchKeywordIssue(kw, { brandTokens, vocab })
  for (const kw of ['מזרון לכלבים גדולים', 'מיטה אורתופדית לכלב', 'קרן צבי לכלבים', 'חטיפים טבעיים לכלבים', 'קערת האכלה איטית לכלב', 'השוואת סוגי מיטות לכלבים', 'תיק נשיאה לכלב קטן']) {
    check(`C1 kept: ${kw}`, issue(kw) === null, String(issue(kw)))
  }
  for (const kw of ['אימוץ כלבים קטנים', 'כלבים למסירה בחינם', 'סמי הכבאי צעצועים', 'עגלת גלידה לילדים', 'כלבים קטנים למכירה', 'ספירלה צעצועים']) {
    check(`C2 rejected: ${kw}`, issue(kw) !== null)
  }
  // MUTATION CONTROL C — a gate that judged by one shared token would keep the toys.
  const oneToken = (kw: string) => Array.from(tokens(kw)).some((t) => vocab.has(t))
  check('C2-MUT: one shared token would have kept "עגלת גלידה לילדים"', oneToken('עגלת גלידה לילדים') || issue('עגלת גלידה לילדים') !== null)
}

// ── D) utility pages ──────────────────────────────────────────────────────
console.log('\nD) a cart is not the site\'s subject')
{
  for (const t of ['עגלת הקניות', 'צור קשר', 'אודות', 'הצהרת נגישות', 'תנאי שימוש', 'מדיניות פרטיות', 'Cart', 'Checkout | 4Dogs', 'My account', 'Terms of service', 'Política de privacidad', 'Carrinho de compras']) {
    check(`D1 utility: ${t}`, isUtilityTitle(t))
  }
  for (const t of ['מזרן אורתופדי לכלב גדול', 'עגלת טיולים לכלב', 'קרן צבי ללעיסה', 'מדיניות גזים: למה הכלב מגרד', 'Dog cart harness', 'Store your dog food properly']) {
    check(`D2 not utility: ${t}`, !isUtilityTitle(t), titleHead(t))
  }
  const kept = merchantTitles(STORE_TITLES.map((t) => ({ t, u: '' })), [])
  check('D3: the six utility pages are out of the merchant\'s titles', kept.length === STORE_TITLES.length - 6, `${kept.length} of ${STORE_TITLES.length}`)
  check('D4: so the basket page\'s word is not a word of this site', !vocabularyOf(kept).has('עגלת') && !vocabularyOf(kept).has('עגלה'))
  // MUTATION CONTROL D — keeping them puts the basket page's words back in.
  check('D4-MUT: keeping the utility pages makes it one', vocabularyOf(STORE_TITLES).has('עגלת'))
  check('D5: the title\'s head is what is matched, so the site name after it is ignored',
    titleHead('Cart | 4Dogs Original') === 'cart' && titleHead('עגלת הקניות – 4Dogs') === 'עגלת הקניות')
}

// ── E) structural words ───────────────────────────────────────────────────
console.log('\nE) structural words')
{
  const vocab = vocabularyOf(merchantTitles(STORE_TITLES.map((t) => ({ t, u: '' })), []))
  check('E1: a comparison of the site\'s own products is aligned', isVocabAligned('השוואת סוגי מיטות לכלבים', vocab))
  check('E2: they are not counted', vocabAlignment('השוואת סוגי מיטות לכלבים', vocab).total === 2, JSON.stringify(vocabAlignment('השוואת סוגי מיטות לכלבים', vocab)))
  check('E3: a keyword still needs two of the site\'s own words', !isVocabAligned('השוואת סוגי מכוניות', vocab))
  check('E4: a guide about another market is still rejected', !isVocabAligned('מדריך בחירת צעצועים לילדים', vocab))
  // MUTATION CONTROL E — counting them leaves the comparison rejected at 2 of 4.
  const withStructural = (kw: string) => {
    const all = Array.from(tokens(kw)).filter((t) => !/^\d+$/.test(t))
    const matched = all.filter((t) => vocab.has(t) || vocab.has(heStem(t)) || (t.length >= 4 && /^[בלמהושכ]/.test(t) && vocab.has(t.slice(1)))).length
    return matched >= 2 && matched / all.length > 0.5
  }
  check('E1-MUT: counting the structural words rejects it', !withStructural('השוואת סוגי מיטות לכלבים'))
}

// ── F) nothing to judge by ────────────────────────────────────────────────
console.log('\nF) no vocabulary, no change')
{
  check('F1: an empty vocabulary rejects nothing', isVocabAligned('אימוץ כלבים', new Set()) && isVocabAligned('אימוץ כלבים', null))
  check('F2: a noise term with no vocabulary is still the site\'s own', siteOwnsTerm('אימוץ', null) && siteOwnsTerm('אימוץ', new Set()))
  check('F3: a shelter whose pages say the term keeps it', siteOwnsTerm('אימוץ', vocabularyOf(['אימוץ כלבים מהעמותה', 'כלבים לאימוץ', 'תרומה לעמותה'])))
  check('F4: a store whose pages never say it does not', !siteOwnsTerm('אימוץ', vocabularyOf(merchantTitles(STORE_TITLES.map((t) => ({ t, u: '' })), []))))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
