/**
 * GOOGLE MAPS: A TITLE WRITTEN "NAME - TAGLINE" IS STILL THAT NAME.
 *
 * MEASURED 2026-11-21 on production: a business called "Royal Barber Studio" came
 * back from Google as "Royal Barber Studio - רויאל מספרה", position 5 of 20, and
 * the scan said "not found" because findBusinessMatch needed the whole title to
 * be equal (or 90% similar). Titles with a tagline are common for Israeli
 * businesses, so every such customer saw "not found" in the first page.
 *
 * THE RULE: only when nothing else matched, the target name equals one WHOLE
 * segment of a title that has more than one (split on a spaced "-", "–", "—",
 * "|", "•", "·", ":"). It cannot change where a business that was found before
 * is found: it runs last. And it is equality of a whole segment, never a
 * substring or a similarity.
 *
 * Run: npx tsx lib/scanner/__qa__/maps-name-segment-match.qa.ts
 */
import { readFileSync } from 'fs'
import { findBusinessMatch, titleSegments } from '../google-maps'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Place = { title: string; position: number; website?: string }
const find = (places: Place[], name: string, domain?: string | null) =>
  findBusinessMatch(places as never, name, domain) as unknown as Place | null
const P = (...titles: string[]): Place[] => titles.map((title, i) => ({ title, position: i + 1 }))

console.log('A) the case that was measured')
{
  const places = P('The Barber BBC (TLV)', 'ARTISTO hair&barber studio Tal peretz', 'טקסטורה ברברס | מספרה לגברים בתל אביב',
    'couture hair barbershop NYC New York', 'Royal Barber Studio - רויאל מספרה', 'המספרה של ליטן - מספרה תל אביב')
  const hit = find(places, 'Royal Barber Studio')
  check('"Royal Barber Studio" is found in "Royal Barber Studio - רויאל מספרה", at its real position', hit?.position === 5)
  check('the Hebrew tagline side matches too', find(places, 'רויאל מספרה')?.position === 5)
  check('a pipe separates segments the same way', find(places, 'טקסטורה ברברס')?.position === 3)
  check('case and spacing do not matter', find(places, '  ROYAL  barber studio ')?.position === 5)
}

console.log('\nB) what must NOT change')
{
  check('an exact match elsewhere still wins over an earlier segment match, so a found business keeps its position',
    find(P('Royal Barber Studio - רויאל מספרה', 'x', 'Royal Barber Studio'), 'Royal Barber Studio')?.position === 3)
  check('a title with no separator behaves exactly as before: exact match', find(P('a', 'Royal Barber'), 'Royal Barber')?.position === 2)
  check('a substring inside a segment is NOT a match: "Royal Barber" is not "Royal Barber Shop of Haifa - x"',
    find(P('Royal Barber Shop of Haifa and Nahariya - x'), 'Royal Barber') === null)
  check('a longer first segment is NOT a match: "Royal Barber Studio Gold Collection Premium - x"',
    find(P('Royal Barber Studio Gold Collection Premium - x'), 'Royal Barber Studio') === null)
  check('a hyphen inside a word does not split a name', titleSegments('Coca-Cola Israel').length === 1 && find(P('Coca-Cola Israel'), 'Coca') === null)
  check('a name this short never matches a segment', find(P('בר - מספרה'), 'בר') === null)
  check('the stored name "GO TOP DIGITAL MARKETING" still matches none of the barbershops',
    find(P('Royal Barber Studio - רויאל מספרה', 'ARTISTO hair&barber studio Tal peretz'), 'GO TOP DIGITAL MARKETING') === null)
  check('the stored long name "Go Top - שיווק דיגיטלי, קידום אתרים, בניית אתרים" still matches no result',
    find(P('Seo Top - קידום אתרים אורגני בגוגל ובניית אתרים', 'קידום אתרים KD', 'SEO boost - קידום אתרים'),
      'Go Top - שיווק דיגיטלי, קידום אתרים, בניית אתרים') === null)
  check('the stored name "ניקיון משרדים" is not matched by a tagline that merely contains it',
    find(P('חברת ניקיון משרדים | סמרט קלין - SmartClean'), 'סמרט קלין') !== null && find(P('נ.ז אולטרה בע"מ - ניקיון משרדים, ניהול ואחזקת מבנים'), 'ניקיון משרדים') === null)
}

console.log('\nC) the rule is last, and whole-segment only (source guards)')
const SRC = readFileSync('lib/scanner/google-maps.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const body = SRC.slice(SRC.indexOf('export function findBusinessMatch'), SRC.indexOf('function computeResultSignature'))
const guardRunsLast = (src: string) => src.indexOf('SEGMENT MATCH') > src.indexOf('STRICT MATCH') && src.indexOf('SEGMENT MATCH') > src.indexOf('DOMAIN MATCH')
const guardWholeSegment = (src: string) => /titleSegments\(place\.title\)\.includes\(normalizedTarget\)/.test(src)
check('the segment pass comes after the exact, domain and strict passes', guardRunsLast(body))
check('it compares a whole segment for equality', guardWholeSegment(body))
check('it has a minimum length', /SEGMENT_MATCH_MIN_LENGTH = 4/.test(SRC))
check('every Maps scan mode uses this one function (no second matcher to drift)',
  (SRC.match(/findBusinessMatch\(/g) || []).length >= 5)

console.log('\nC-MUT) mutation controls')
check('the order guard fails if the segment pass came first',
  !guardRunsLast('SEGMENT MATCH ... STRICT MATCH ... DOMAIN MATCH'))
check('the equality guard fails on a substring test',
  !guardWholeSegment('titleSegments(place.title).some((s) => s.includes(normalizedTarget))'))
check('a substring rule WOULD have matched "The Royal Barber Studio" (so check B proves something)',
  'the royal barber studio'.includes('royal barber studio'))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
