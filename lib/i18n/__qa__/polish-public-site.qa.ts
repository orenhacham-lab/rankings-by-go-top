/**
 * THE POLISH PUBLIC SITE.
 *
 * Polish is the tenth language. The compiler finds most of a missing language on
 * its own, because the gate is one function and every `Record<PublicLocale, …>`
 * stops compiling without the new key. What it cannot find is a language merely
 * ABSENT from a hand-written list — which is exactly what `routePublicLocale`
 * and `resolveAuthLocale` are — or a translation that is the language it was
 * copied FROM wearing a new name.
 *
 * THE LANGUAGE THIS TREE WAS COPIED FROM IS DUTCH, so Dutch is what a
 * half-finished copy leaves behind, and Dutch is what sections D and E hunt
 * for: in the dictionaries, in the page files, in the shape of a word (ij and
 * uu belong to no Polish word) and in the Dutch-only function words.
 *
 * Polish is Latin-script, so the script test the Japanese suite leans on is not
 * available here. The replacement is a POSITIVE test, as in German and Dutch,
 * and Polish gives it two independent halves:
 *
 *   · its own letters. ą ć ę ł ń ś ź ż exist in no Dutch word. ó is NOT among
 *     them, because Dutch writes ó in loanwords (coördinaten carries a
 *     diaeresis, but hóe and other emphatic spellings exist), so including it
 *     would let a Dutch sentence pass as Polish.
 *   · a closed list of Polish function words that no Dutch sentence contains.
 *     The traps are the words the two languages SHARE and the ones that look
 *     shared: Polish `u` ("u nas") is also the Dutch formal pronoun, Polish
 *     `we` is a variant of `w` and also the Dutch `we`, and `i` and `na` exist
 *     in neither direction. So `u` and `we` are in NEITHER list.
 *
 * The sections are the same as every other language's:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/pl, and the same for the auth tree — load-bearing, because
 *      lib/seo/hreflang.ts DERIVES the Polish URL from the Spanish one, so a
 *      Spanish page with no Polish twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language.
 *   D) THE COPY is Polish: written in Polish, in the Państwo register, with no
 *      promise the owner has not made and no złoty or euro price.
 *   E) THE READER NEVER CHANGES LANGUAGE, and Polish adds EXACTLY ONE page the
 *      Spanish tree does not have: /pl/dane-firmy. It is NOT an impressum —
 *      that is a German word for a German statute — and it does not claim the
 *      Polish e-services act binds this seller, because art. 3a of that act
 *      writes its conflict rule around providers established in the EU or EEA
 *      and this company is established in Israel. What it does rest on is the
 *      pre-contractual information duty of art. 12 ust. 1 ustawy o prawach
 *      konsumenta, which Rome I art. 6 carries to a Polish consumer whatever
 *      the seller's seat.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/polish-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { polishSiteEnabled } from '../polish-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingPl } from '../public/landing-pl'
import { pricingPl } from '../public/pricing-pl'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isPolishPath, routePublicLocale } from '../request-locale'
import { resolveAuthLocale } from '../auth-locale'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every route file under a tree, as a path relative to that tree. */
function routes(dir: string): string[] {
  const base = join(ROOT, dir)
  if (!existsSync(base)) return []
  const walk = (rel: string): string[] =>
    readdirSync(join(base, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(rel ? `${rel}/${e.name}` : e.name)
        : e.name === 'page.tsx' || e.name === 'layout.tsx' ? [rel ? `${rel}/${e.name}` : e.name] : [])
  return walk('').sort()
}

/** Every string in a dictionary, with the path that leads to it. */
const strings = (value: unknown, path = ''): { path: string; text: string }[] => {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

/*
 * IS THERE ANY POLISH IN THIS STRING?
 *
 * Two independent signals, either of which is enough.
 *
 * The letters first, because they catch a two-word label that carries no
 * function word at all. ó is deliberately absent, and so is the bare `u`.
 *
 * Then a closed list of function words. Every one is a word no DUTCH sentence
 * contains — which is the leak that matters, because /pl was copied from /nl —
 * and the words that look shared are left out: `u`, `we`, `i`, `na`, `do`,
 * `to`, `po`, `pod` are each either a Dutch word too or close enough to one
 * that a Dutch sentence could trip them. The English words a copied English
 * paragraph would supply are absent too, so untranslated English fails this.
 *
 * \b is no use here: JavaScript's word boundary counts only [A-Za-z0-9_], so an
 * accented letter is a boundary. Hence the Unicode lookarounds and the u flag.
 */
const POLISH_LETTER = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/
/*
 * A THIRD SIGNAL: a Polish inflectional or derivational ending on a word long
 * enough not to be a coincidence. This is what carries a sentence with no
 * diacritic and no function word in it — "Go Top – agencja marketingu
 * cyfrowego" has neither, and `cyfrowego` is unmistakably Polish.
 *
 * -ach is deliberately NOT in the list: English "approach" would match it. The
 * endings here have no English or Dutch counterpart of the same spelling
 * (Dutch forms the same borrowings with -atie, English with -ation).
 */
const POLISH_SUFFIX = /(?<!\p{L})\p{L}{4,}(?:ami|ów|ego|emu|ych|ymi|ość|ości|anie|enie|aniu|eniu|uje|ujemy|ują|ować|ności|acja|acji|ację)(?!\p{L})/u
/*
 * A FOURTH SIGNAL: the Polish consonant digraphs. rz, sz, cz, dz and śc carry
 * an enormous share of Polish words — trzech, odpowiedzi, Państwa — and no
 * Dutch or English word is spelled with any of them. This is what catches a
 * label with no diacritic, no function word and no inflectional ending.
 */
const POLISH_DIGRAPH = /(?:rz|sz|cz|dz|śc)/i
const POLISH_WORD = /(?<!\p{L})(?:jest|są|nie|się|że|który|która|które|którego|której|przez|dla|przy|oraz|albo|ale|jak|gdy|już|tylko|także|każdy|każda|każde|wszystkie|bez|nad|między|może|można|trzeba|prosimy|nasz|nasza|nasze|naszych|jego|tego|tym|tylu|ich|wtedy|potem|zawsze|nigdy|czyli|dlatego|ponieważ|jeśli|jeżeli|żeby|wszystko|coś|nic|dużo|mało|dobrze|nowy|nowa|nowe|własny|własna|razem|strona|strony|witryna|witryny|miesiąc|miesiącu|miesięcznie|pozycja|pozycje|pozycji|słowo|słowa|słów|kluczowe|kluczowych|raport|raporty|artykuł|artykuły|wyszukiwania|wyszukiwarce|Państwo|Państwa|Państwu)(?!\p{L})/iu
const HAS_POLISH = (t: string) => POLISH_LETTER.test(t) || POLISH_WORD.test(t) || POLISH_SUFFIX.test(t) || POLISH_DIGRAPH.test(t)

/*
 * AND THE OTHER DIRECTION: a word that can only be Dutch. Used in D as a
 * second, independent reading of the same question, because a Dutch sentence
 * with a single Polish-looking token in it would otherwise pass HAS_POLISH.
 *
 * `u` and `uw` are NOT here. `u` is a Polish preposition ("zakupów u nas") and
 * `uw` is only a letter away from it; the Dutch pronoun is caught by the dozens
 * of other words any Dutch sentence of real length carries.
 */
const DUTCH_ONLY = /(?<!\p{L})(?:de|het|een|en|niet|is|zijn|wordt|worden|werd|voor|van|met|op|uit|aan|zich|ook|maar|dat|naar|bij|geen|meer|nog|alleen|hoe|hoeveel|waarom|wat|welk|welke|wij|ons|onze|elke|iedere|beide|zowel|want|dus|door|onder|zonder|tegen|tussen|boven|achter|naast|binnen|buiten|vanaf|vanuit|tijdens|volgens|zoals|behalve|zodat|omdat|zodra|sinds|terwijl|totdat|voordat|nadat|tenzij|deze|dit|hebben|heeft|kunnen|moeten|moet|mogen|om|nu|wel|toch|zelf|nooit|vaak|soms|meestal|zeer|altijd|mijn|maandelijks|wanneer|waar|iets|niets|veel|weinig|goed|goede|nieuwe|eigen|samen|daarna|daarom|hierboven|hieronder|zoekwoorden|posities)(?!\p{L})/iu
/*
 * THERE IS NO ORTHOGRAPHIC DUTCH-ONLY SIGNAL FOR POLISH, and the attempt is
 * recorded here so nobody adds it back. `ij` is the Polish imperative ending
 * (Zacznij, Zamknij). `aa` appears wherever the prefix za- meets a vowel
 * (Zaakceptuj). `ee` appears in loanwords (Freelancerzy). `oo` is zoo. So the
 * Dutch leak is read by the WORD LIST below and by the absence of any Polish
 * signal — both of which section D applies to every sentence — and not by
 * letter shapes.
 */

console.log('A) the trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const pl = routes(`app/${group}/pl`)
    check(`A1 app/${group}: the Polish tree has every Spanish route`,
      es.every((r) => pl.includes(r)), es.filter((r) => !pl.includes(r)).join(' '))
    /*
     * A2 allows EXACTLY ONE extra route, and names it: dane-firmy, the identity
     * page, the Polish counterpart of /nl/bedrijfsgegevens, /de/impressum and
     * /ja/tokusho. Anything else in the Polish tree that the Spanish tree does
     * not have is a page copied from another locale by reflex, which is what
     * this check is for — and the page must NOT be called impressum (E9a).
     */
    const ALLOWED_EXTRA = group === '(public)' ? ['dane-firmy/page.tsx'] : []
    const extras = pl.filter((r) => !es.includes(r) && !ALLOWED_EXTRA.includes(r))
    check(`A2 app/${group}: and no route beyond the Spanish tree except ${ALLOWED_EXTRA.join(', ') || 'none'}`,
      extras.length === 0, extras.join(' '))
    if (ALLOWED_EXTRA.length) {
      check(`A2a app/${group}: the identity page is there`,
        ALLOWED_EXTRA.every((r) => pl.includes(r)), ALLOWED_EXTRA.filter((r) => !pl.includes(r)).join(' '))
    }
    check(`A3 app/${group}: and it is not empty`, pl.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no Polish twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/pl').includes(r)))
  check('A2-MUT: an impressum copied into the Polish tree fails A2',
    ['impressum/page.tsx'].filter((r) => !es.includes(r) && r !== 'dane-firmy/page.tsx').length === 1)
  check('A2a-MUT: a Polish tree without the identity page fails A2a',
    !['dane-firmy/page.tsx'].every((r) => es.includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/pl/layout.tsx'))
  const auth = strip(read('app/(auth)/pl/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!polishSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!polishSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document Polish and left-to-right',
    /lang="pl"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="pl"/.test(pub))
  const pages = routes('app/(public)/pl').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/polishSiteEnabled/.test(read(`app/(public)/pl/${r}`))),
    pages.filter((r) => /polishSiteEnabled/.test(read(`app/(public)/pl/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!polishSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!polishSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  // The no-argument call reads process.env, so the unset case is checked with
  // the variable actually cleared.
  const ambient = process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED
  delete process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED
  const unsetIsOff = !polishSiteEnabled(undefined) && !polishSiteEnabled()
  if (ambient !== undefined) process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = ambient
  check('C1: "true" and nothing else turns it on',
    polishSiteEnabled('true') && !polishSiteEnabled('TRUE') && !polishSiteEnabled('1')
    && !polishSiteEnabled('') && !polishSiteEnabled('yes') && unsetIsOff)

  const was = process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived Polish URL is announced',
      on.pl === 'https://www.gotopseo.com/pl/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/pl/"',
      home.pl === 'https://www.gotopseo.com/pl', home.pl)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/plugin-guide', '/en/plugin-guide', '/plugin-guide').pl === 'https://www.gotopseo.com/plugin-guide')
    check('C5: the switcher offers it', availableLocales({ es: true, pl: true }).includes('pl'))
    // art. 399 ust. 1 pkt 1 lit. b PKE: besides the purpose, the reader must be
    // told they can set the conditions of storage and access through their own
    // device's software settings or the configuration of the service. The
    // banner said only where to change OUR choice, which answered lit. a and
    // left lit. b unanswered — a real gap, not a wording preference.
    check('C5a: the Polish cookie notice says the reader can set the conditions in their own browser',
      /ustawieni\p{L}+ (?:swojej )?przegl\p{L}+/iu.test(getPublicDictionary('pl').cookie.withdrawHint))
    check('C5a-MUT: a notice that only names our own settings link is caught',
      !/ustawieni\p{L}+ (?:swojej )?przegl\p{L}+/iu.test('Aby zmienić zgodę, na dole strony jest link „Ustawienia plików cookie”.'))
    /* Art. 399 ust. 2 PKE lets device settings express CONSENT in Poland, which
     * no other locale of ours has. It says nothing about taking consent back:
     * our marketing gate and the Meta server-side report read our own consent
     * record, so a browser block stops nothing we decide. The banner must name
     * the browser as control over storage and say so in the same breath. */
    check('C5b: the Polish notice says a browser block does not replace withdrawing consent with us',
      /blokada w przegl\p{L}+ nie zast\p{L}+ jednak wycofania zgody u nas/u
        .test(getPublicDictionary('pl').cookie.withdrawHint))
    check('C5b-MUT: a notice that offers the browser as a route out is caught',
      !/blokada w przegl\p{L}+ nie zast\p{L}+ jednak wycofania zgody u nas/u
        .test('Zgodę mogą Państwo wycofać także w ustawieniach swojej przeglądarki.'))
    check('C6: a Polish path is a Polish document',
      isPolishPath('/pl/pricing') && routePublicLocale('/pl/pricing') === 'pl'
      && resolveAuthLocale({ pathname: '/pl/login' }) === 'pl')
    check('C7: a stored Polish preference is honoured', normalizeStoredLocale('pl') === 'pl')

    process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('pl' in off) && !availableLocales({ es: true, pl: false }).includes('pl')
      && !enabledPublicLocales({ pl: false }).includes('pl'))
    check('C9: and a Polish URL is not even a locale, so nothing labels a 404 "pl"',
      !isPolishPath('/pl/pricing') && routePublicLocale('/pl/pricing') !== 'pl')
    check('C10: and a hand-edited cookie cannot select it', normalizeStoredLocale('pl') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('pl'))
  } finally {
    process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /** C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT. */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const srcText = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french|italian|japanese|german|dutch|polish)SiteEnabled\s*\(/.test(srcText), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french|italian|japanese|german|dutch|polish)SiteEnabled\s*\(/.test('const x = polishSiteEnabled()'))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true, it: true, ja: true, de: true, nl: true, pl: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.pl === '/pl' && LOCALE_CONFIG.pl.dir === 'ltr'
    && LOCALE_CONFIG.pl.lang === 'pl' && LOCALE_CONFIG.pl.ogLocale === 'pl_PL'
    && INTL_LOCALE.pl === 'pl-PL' && PAYPAL_LOCALE.pl === 'pl_PL' && localeHomeHref('pl') === '/pl')

  const all = [
    ...strings(getPublicDictionary('pl'), 'public'),
    ...strings(landingPl, 'landing'),
    ...strings(pricingPl, 'pricing'),
    ...strings(AFFILIATES_COPY.pl, 'affiliates'),
    ...strings(ARTICLES_COPY.pl, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))
  const cjk = all.filter((s) => /[぀-ヿ㐀-䶿一-鿿]/.test(s.text) && notSwitcher(s.path))
  check('D3a: and no Japanese left in', cjk.length === 0, cjk.slice(0, 3).map((s) => s.path).join(' '))
  check('D3a-MUT: a Japanese string is caught',
    /[぀-ヿ㐀-䶿一-鿿]/.test('検索順位の計測'))

  /*
   * D3b: THE POLISH SIGNAL IS REAL, AND THE DUTCH ONE IS CAUGHT.
   *
   * /pl was copied from /nl, so the leak this section hunts is a Dutch
   * sentence. There is no letter shape to read it by (see the note on the
   * detectors above), so this check proves the two detectors D4 relies on
   * actually separate the two languages on sentences of each, before D4 applies
   * them to the whole dictionary.
   */
  check('D3b: the Polish detector fires on Polish of every shape, and on no Dutch',
    HAS_POLISH('Mierzymy Państwa pozycje raz w miesiącu')
    && HAS_POLISH('Go Top – agencja marketingu cyfrowego')
    && HAS_POLISH('Od danych do raportu w trzech krokach')
    && HAS_POLISH('Zacznij bezpłatnie')
    && !HAS_POLISH('Maandelijkse rapporten voor uw klanten')
    && !HAS_POLISH('Track your rankings in Google every month'))
  check('D3b-MUT: and the Dutch detector fires on Dutch and not on Polish',
    DUTCH_ONLY.test('Wij meten uw posities in Google elke maand')
    && DUTCH_ONLY.test('De gegevens komen uit de API van Google Ads')
    && !DUTCH_ONLY.test('Prawie żadna firma nie wie, gdzie w tym stoi')
    && !DUTCH_ONLY.test('Te same słowa kluczowe mierzymy także w Mapach Google'))

  /*
   * D4: EVERY SENTENCE IS WRITTEN IN POLISH.
   *
   * Only PROSE is asked: a string long enough and with enough words to be a
   * sentence. Everything shorter is a label, a brand, a number or a path, and
   * Polish shares its alphabet with the language this tree was copied from, so
   * there is no script to fall back on.
   */
  const IS_PATH = (t: string) => /^(?:\/|https?:|mailto:|tel:|#|data:)/.test(t)
  const NO_LETTERS = (t: string) => /^[\s\p{P}\p{S}\d]*$/u.test(t)
  const CLASS_LIST = (t: string) => /^[a-z0-9\-:[\]./ %_,()&>#+*='"]+$/.test(t)
  const words = (t: string) => t.split(/\s+/).filter(Boolean)
  // Both shapes the site uses: "Page | Go Top SEO" and "Page - Go Top SEO".
  const META_TITLE = (t: string) => t.includes(' | ') || / [|-] Go Top SEO$/.test(t)
  const IS_PROSE = (t: string) =>
    !IS_PATH(t) && !NO_LETTERS(t) && !CLASS_LIST(t) && !META_TITLE(t)
    && t.length >= 35 && words(t).length >= 5
  const ENGLISH_BY_DESIGN = [
    'public.footer.copyright',
    // A list of the AI products themselves. Every token is a product name, so
    // there is no Polish in it and there should not be.
    'landing.outcomes.stats[0].detail',
    'landing.features.ai.points[0]',
  ]
  const notPolish = all.filter((s) =>
    notSwitcher(s.path) && !ENGLISH_BY_DESIGN.includes(s.path)
    && IS_PROSE(s.text) && (!HAS_POLISH(s.text) || DUTCH_ONLY.test(s.text)))
  check('D4: every sentence of the Polish copy is written in Polish, and in no Dutch',
    notPolish.length === 0, notPolish.slice(0, 4).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D4-MUT: a Dutch or English sentence left behind is caught, and a brand or a path is not',
    DUTCH_ONLY.test('Wij meten uw posities in Google elke maand automatisch')
    && !HAS_POLISH('Track your rankings in Google and in the AI engines every month')
    && !DUTCH_ONLY.test('Mierzymy Państwa pozycje w Google raz w miesiącu automatycznie')
    && HAS_POLISH('Mierzymy Państwa pozycje w Google raz w miesiącu automatycznie')
    && !IS_PROSE('/pricing') && !IS_PROSE('Go Top SEO') && !IS_PROSE('WCAG 2.1')
    && IS_PROSE('Wij meten uw posities in Google elke maand automatisch'))

  /*
   * D5: NO PROMISE THE OWNER HAS NOT MADE, in a language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. In
   * Polish the shapes that break it are gwarantujemy / gwarancja /
   * gwarantowany, and a first page or a number-one position offered TO THE
   * READER. "Pozycja 1" on its own is a report column, so the test is who the
   * sentence is about, and landing.demo is the made-up business inside the
   * product illustration.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  const GUARANTEE = /(?<!\p{L})(?:gwarantuj\w*|gwarancj\w*|gwarantowan\w*)(?!\p{L})/iu
  const FIRST_PLACE = /(?<!\p{L})(?:pozycj[aęi]\s*1|pierwsz[aąe]\s+stron\w*|pierwsze\s+miejsce|pierwszym\s+miejscu|numer\s*1|miejsce\s*1)(?!\p{L})/iu
  const READER = /(?<!\p{L})(?:Państwo|Państwa|Państwu)(?!\p{L})/u
  const PROMISE = (t: string) => GUARANTEE.test(t) || (FIRST_PLACE.test(t) && READER.test(t))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D5: no Polish page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D5-MUT: a ranking promise is caught, and a report label is not',
    PROMISE('Gwarantujemy Państwu pierwszą stronę w Google.')
    && PROMISE('Wprowadzamy Państwa na pierwsze miejsce w wynikach wyszukiwania.')
    && PROMISE('Gwarancja na miejsce 1.')
    && !PROMISE('Słowa kluczowe na pozycji 1')
    && !PROMISE('Ruch z pozycji 1 w tym miesiącu'))

  /*
   * D6: THE REGISTER. Państwo throughout, never the ty form — the same contract
   * the Polish legal documents and the Polish dashboard dictionary are held to,
   * and for the same reason: a marketing page that switches into ty mid-section
   * reads as two different writers, and the legal documents cannot switch at
   * all without changing who the contract is with.
   *
   * THE BARE DATIVE `ci` IS NOT A FORBIDDEN FORM, because it is spelled exactly
   * like the masculine personal plural demonstrative ("ci dostawcy"), which is
   * correct Państwo prose. The unambiguous oblique forms are cię, ciebie,
   * tobie, tobą.
   *
   * THE IMPERATIVE IS NOT ASKED HERE. A BUTTON LABEL is written in the bare
   * imperative ("Wypróbuj 7 dni bezpłatnie") in every Polish interface, and the
   * prose around it keeps Państwo. So this looks for the ty PRONOUN and the ty
   * second-person INDICATIVE, which no button label needs.
   */
  const INFORMAL = /(?<!\p{L})(?:ty|cię|ciebie|tobie|tobą|twój|twoj(?:a|e|ego|emu|ej|ich|im|ą|ym)|możesz|musisz|masz|chcesz|twoim)(?!\p{L})/iu
  const informal = all.filter((s) => INFORMAL.test(s.text))
  check('D6: the whole Polish public copy keeps the formal Państwo register',
    informal.length === 0, informal.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D6-MUT: an informal sentence is caught, and formal Polish — including a button label and the demonstrative ci — is not',
    INFORMAL.test('Podłącz swoją witrynę i możesz od razu zobaczyć pozycje')
    && INFORMAL.test('To jest twoje konto')
    && !INFORMAL.test('Prosimy podłączyć witrynę, a my mierzymy pozycje raz w miesiącu')
    && !INFORMAL.test('Wypróbuj 7 dni bezpłatnie, bez karty kredytowej')
    && !INFORMAL.test('standardowe klauzule, które ci dostawcy zawierają w umowach'))

  /*
   * D7: THE PRICE IS IN DOLLARS. Abroad is USD through Creem, and no złoty and
   * no euro figure has ever been set. A zł on a Polish page would be the
   * currency a Polish reader would most expect, which is the worst place to
   * invent one — and art. 4 ust. 1 ustawy o informowaniu o cenach towarów i
   * usług is precisely about the stated price being the total payable.
   */
  const LOCAL_CURRENCY = /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})euro(?!\p{L})|(?<!\p{L})PLN(?!\p{L})|(?<!\p{L})z[łl](?!\p{L})|(?<!\p{L})z[łl]ot\w*(?!\p{L})/iu
  const currency = all.filter((s) => LOCAL_CURRENCY.test(s.text))
  check('D7: no złoty and no euro price anywhere in the Polish copy',
    currency.length === 0, currency.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D7-MUT: a złoty and a euro price are both caught, and the dollar price is not',
    LOCAL_CURRENCY.test('od 299 zł miesięcznie') && LOCAL_CURRENCY.test('od 79 € miesięcznie')
    && LOCAL_CURRENCY.test('299 złotych miesięcznie')
    && !LOCAL_CURRENCY.test('od 79 dolarów amerykańskich miesięcznie'))

  check('D8: the affiliate page states the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.pl).includes('30') && JSON.stringify(AFFILIATES_COPY.pl).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)

  /*
   * D10: THE PAGE FILES THEMSELVES, NOT ONLY THE DICTIONARIES.
   *
   * D4 reads the dictionaries. On 2026-10-31 the equivalent guard was green
   * while ten pages of the LIVE Japanese site were showing ITALIAN: route files
   * that carried their copy inline, had been copied from another tree, and were
   * never translated. No dictionary was involved, so no dictionary guard could
   * see it. The /pl tree was created the same way — copied from /nl — so this is
   * the guard that matters most here.
   */
  const pageStrings = (source: string): string[] => {
    const body = strip(source)
    const out: string[] = []
    for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push((m[1] ?? m[2] ?? '').trim())
    for (const m of body.matchAll(/>([^<>{}]+)</g)) out.push(m[1].trim())
    return out.filter(Boolean)
  }
  const REGISTERED = [
    'Oren Hacham',
    'HaRechasim 24/2',
    'Ramat Gan 5235524',
    'Izrael',
    'GO TOP DIGITAL MARKETING AND ADVERTISING LTD',
    // The register's own name, in the language the register itself uses. It is
    // English on the Polish page for the same reason the company name is: it
    // identifies a thing, and translating it would name a register that does
    // not exist.
    'Rejestr: Registrar of Companies, Izrael',
    // The author of the articles, as the Person their JSON-LD points at. It is
    // the same Hebrew string in every tree, because it is his name.
    'אורן חכם',
  ]
  const NOT_COPY = (t: string) =>
    /^[@.][\w@./-]*$/.test(t)
    || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)
  const CJK = /[぀-ヿ㐀-䶿一-鿿]/
  const HEBREW_TEXT = /[֐-׿]/
  const WRONG_SCRIPT = (t: string) => CJK.test(t) || HEBREW_TEXT.test(t)
  const foreignOnPage = (text: string) =>
    !REGISTERED.includes(text) && !NOT_COPY(text)
    && (WRONG_SCRIPT(text) || (IS_PROSE(text) && (!HAS_POLISH(text) || DUTCH_ONLY.test(text))))
  const pageLeaks = routes('app/(public)/pl').flatMap((r) =>
    pageStrings(read(`app/(public)/pl/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 50)}`))
  check('D10: every sentence the Polish PAGE FILES print is written in Polish',
    pageLeaks.length === 0, `${pageLeaks.length}: ${pageLeaks.slice(0, 5).join(' | ')}`)
  const authLeaks = routes('app/(auth)/pl').flatMap((r) =>
    pageStrings(read(`app/(auth)/pl/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 50)}`))
  check('D10a: and so is every sentence the Polish AUTH page files print',
    authLeaks.length === 0, `${authLeaks.length}: ${authLeaks.slice(0, 5).join(' | ')}`)

  const MUT_DUTCH = `const COPY = {
    title: 'Elf jaar SEO, in een automatisch systeem',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>De gegevens komen uit de API van Google Ads.</p> }`
  const MUT_POLISH = `const COPY = {
    title: 'Jedenaście lat SEO w jednym automatycznym systemie',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>Dane pochodzą z API Google Ads i są szacunkami Google.</p> }`
  check('D10-MUT: a Dutch headline and a Dutch JSX line are both caught, and the Polish page and its class lists are not',
    pageStrings(MUT_DUTCH).filter(foreignOnPage).length === 2
    && pageStrings(MUT_POLISH).filter(foreignOnPage).length === 0
    && !foreignOnPage('Go Top SEO') && !foreignOnPage('flex min-h-screen flex-col bg-canvas')
    && !foreignOnPage('@/components/public/FeaturePage') && !foreignOnPage('contact@gotopseo.com')
    && foreignOnPage('Write to contact@gotopseo.com and we will answer you shortly')
    // The script half: a Japanese label is caught even though it is one "word".
    && foreignOnPage('Googleでの検索順位の計測')
    && 'Googleでの検索順位の計測'.split(/\s+/).filter(Boolean).length === 1
    && !foreignOnPage('אורן חכם'),
    `${pageStrings(MUT_DUTCH).filter(foreignOnPage).join(' | ')} / ${pageStrings(MUT_POLISH).filter(foreignOnPage).join(' | ')}`)
}

console.log('\nE) the reader never changes language, and Polish adds exactly one page')
{
  const all = [
    ...strings(getPublicDictionary('pl'), 'public'),
    ...strings(pricingPl, 'pricing'),
    ...strings(AFFILIATES_COPY.pl, 'affiliates'),
    ...strings(ARTICLES_COPY.pl, 'articles'),
  ]
  const OTHER_TREE = /^\/(en|es|pt-BR|fr|it|ja|de|nl)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no Polish string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the Dutch privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/nl/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /pl', articlesIndexHref('pl') === '/pl/articles')

  const landingPaths = strings(landingPl, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/pl'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /pl/pl',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/pl/pricing' }].filter((s) => s.text.startsWith('/pl')).length === 1)

  const wasPl = process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = 'true'
    check('E4: switching to Polish keeps the page', counterpartPath('/pricing', 'he', 'pl') === '/pl/pricing'
      && counterpartPath('/es/pricing', 'es', 'pl') === '/pl/pricing'
      && counterpartPath('/nl/about', 'nl', 'pl') === '/pl/about')
    check('E5: and the Polish home page is the bare prefix', counterpartPath('/', 'he', 'pl') === '/pl')
    check('E6: a single article switches to the Polish INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'pl') === '/pl/articles')
    check('E7: and switching away from Polish works the same way',
      counterpartPath('/pl/pricing', 'pl', 'he') === '/pricing' && counterpartPath('/pl', 'pl', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = wasPl
  }

  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/pl${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has a Polish page', missing.length === 0, missing.join(' '))

  /*
   * E9: THE IDENTITY PAGE EXISTS, IS POLISH, AND IS NOT CALLED IMPRESSUM.
   *
   * WHAT IT RESTS ON, and the correction to the reading the Dutch twin would
   * suggest: artikel 3:15d lid 1 BW carries no establishment qualifier, but the
   * Polish e-services act is NOT the same instrument. Art. 5 ustawy o
   * świadczeniu usług drogą elektroniczną does list the identity data an
   * e-service provider makes available, but art. 3a of the same act writes the
   * conflict rule around providers established in an EU or EEA state, and a
   * company established in Israel sits outside it. So this page claims no duty
   * under that act, and this suite checks that it does not.
   *
   * The duty that DOES reach us is art. 12 ust. 1 ustawy o prawach konsumenta:
   * before a distance contract with a consumer, the trader gives their
   * identifying details (pkt 2), the business address, the e-mail and the
   * TELEPHONE NUMBER (pkt 3) and the total price with taxes (pkt 5). Rome I
   * art. 6 points a consumer contract at the law of the consumer's habitual
   * residence whatever the trader's seat.
   *
   * What the page must NOT be is a copy of the German one. Two things are
   * checked for that: its slug is Polish (impressum is a German word for a
   * German statute, and Polish law prescribes no title at all), and the German
   * MStV line naming a person responsible for journalistic-editorial content is
   * absent, because Poland has no MStV analogue and presenting one as required
   * would be a false claim about the law.
   */
  const INFO = 'app/(public)/pl/dane-firmy/page.tsx'
  check('E9: the Polish tree carries the identity page', existsSync(join(ROOT, INFO)))
  check('E9a: and it is not called impressum', !existsSync(join(ROOT, 'app/(public)/pl/impressum/page.tsx')))
  const info = existsSync(join(ROOT, INFO)) ? read(INFO) : ''
  check('E9b: it names the register, not only the number',
    /Registrar of Companies/.test(info) && /517274346/.test(info))
  check('E9c: it says we have no Polish tax identification number, and who the seller of record is',
    /nie mamy polskiego numeru identyfikacji podatkowej/.test(info) && /merchant of record/.test(info))
  check('E9d: it carries the identity, the address, the e-mail AND the telephone number art. 12 ust. 1 pkt 3 asks for',
    /GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(info)
    && /HaRechasim 24\/2/.test(info) && /contact@gotopseo\.com/.test(info)
    && /\+972-54-9489377/.test(info))
  check('E9e: and the comment records the article it answers, and leaves art. 5 uśude unclaimed',
    /art\. 12 ust\. 1/i.test(info) && /art\. 3a/i.test(info)
    && !/ustawy o świadczeniu usług drogą elektroniczną wymaga/.test(strip(info)))
  check('E9f: it does NOT claim a Polish duty to name someone responsible for editorial content',
    !/Medienstaatsvertrag|MStV|odpowiedzialny za treści redakcyjne/i.test(strip(info)))
  check('E9f-MUT: the German line is what that check rejects',
    /Medienstaatsvertrag|MStV|odpowiedzialny za treści redakcyjne/i.test('Verantwortlich nach § 18 Absatz 2 des Medienstaatsvertrags (MStV)'))
  // The same detectors section D uses, applied to this one page: the copy is
  // Polish, it keeps Państwo, and it names no złoty and no euro price.
  const TY_FORM = /(?<!\p{L})(?:ty|cię|ciebie|tobie|twój|twoja|twoje|możesz|musisz)(?!\p{L})/iu
  const LOCAL_PRICE = /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})PLN(?!\p{L})|\d+(?:[.,]\d+)?\s*z[łl](?!\p{L})/iu
  check('E9g: the copy is Polish, in the Państwo register, and names no złoty or euro price',
    HAS_POLISH(info) && !TY_FORM.test(info) && !LOCAL_PRICE.test(info))
  check('E9g-MUT: the detectors fire on the ty form and on a złoty price',
    TY_FORM.test('Oto twoje dane') && LOCAL_PRICE.test('299 zł miesięcznie') && LOCAL_PRICE.test('79 € miesięcznie'))

  /*
   * E9h: NO POLISH DOCUMENT SENDS THE READER INTO ANOTHER TREE'S IDENTITY PAGE.
   * The five Polish documents were translated from the Dutch ones, which point
   * at /nl/bedrijfsgegevens, and those from the German ones, which point at
   * /de/impressum. A surviving href either way is a live defect.
   */
  const FOREIGN_INFO_LINK = /\]\(\s*\/[a-z-]{2,5}\/(?:impressum|bedrijfsgegevens|tokusho)|href=["']\/[a-z-]{2,5}\/(?:impressum|bedrijfsgegevens|tokusho)/i
  const LEGAL_DOCS = ['terms', 'privacy', 'refund-policy', 'affiliate-terms', 'accessibility']
  const pointing = LEGAL_DOCS.filter((d) => FOREIGN_INFO_LINK.test(read(`content/legal/pl/${d}.md`)))
  check('E9h: no Polish legal document links another tree\'s identity page', pointing.length === 0, pointing.join(' '))
  check('E9h-MUT: a document that still linked the Dutch page would be caught, and the Polish pointer would not',
    FOREIGN_INFO_LINK.test('Alle gegevens staan op de pagina [Bedrijfsgegevens](/nl/bedrijfsgegevens).')
    && FOREIGN_INFO_LINK.test('Die vollständigen Angaben stehen im [Impressum](/de/impressum).')
    && !FOREIGN_INFO_LINK.test('Wszystkie dane stoją na stronie [Dane firmy](/pl/dane-firmy).'))
  check('E9i: and the terms and the privacy statement point at the Polish page instead',
    ['terms', 'privacy'].every((d) => /\]\(\/pl\/dane-firmy\)/.test(read(`content/legal/pl/${d}.md`))))

  check('E10: the sitemap does not advertise an impressum for Polish',
    !/pl\/impressum/.test(read('app/sitemap.xml/route.ts')))
  check('E11: the footer links the Polish identity page for Polish readers, and not the German or Dutch one',
    /locale === 'pl' &&[\s\S]{0,200}POLISH_COMPANY_INFO_LINK\.href/.test(strip(read('components/Footer.tsx')))
    && !/locale === 'pl' &&[\s\S]{0,200}(?:GERMAN_IMPRESSUM|DUTCH_COMPANY_INFO)/i.test(strip(read('components/Footer.tsx'))))
  check('E11-MUT: a Polish footer that linked the DUTCH page is caught',
    /locale === 'pl' &&[\s\S]{0,200}(?:GERMAN_IMPRESSUM|DUTCH_COMPANY_INFO)/i.test("{locale === 'pl' && <Link href={DUTCH_COMPANY_INFO_LINK.href}/>}"))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
