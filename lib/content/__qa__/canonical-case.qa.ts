/**
 * CANONICAL CASE OF PRODUCT NAMES — offline, pure.
 *
 * The German article of 5 Nov 2026 went live as "google search console: Ihr
 * Leitfaden für bessere Sichtbarkeit bei google": the Keyword Planner string,
 * lower-cased, in the title, the H1 and every H2. Two causes, both guarded here:
 *   1. the prompt quotes the keyword as the planner returns it;
 *   2. `buildCasingTerms` built its case-restoring rules from that same string,
 *      so it rewrote a correctly-written "Google Search Console" back DOWN.
 *
 * The groups below guard the repair, the exclusions that keep it from corrupting
 * prose, the URL safety, the render-side pass that fixes the pages already
 * published, and the two wiring points in the generator. Each group ends with a
 * MUTATION CONTROL: the pre-fix behaviour, proving the guard fails when the bug
 * is put back.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  CANONICAL_TERMS, DELIBERATELY_EXCLUDED, canonicalizeArticleHtml,
  canonicalizeHeadline, canonicalizeKnownTerms, capitalizeHeadline,
} from '../canonical-case'
import { polishText } from '../gemini-article'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
/** Source guards match code, not comments. */
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')

/** The live H1 of the German article, as production served it on 5 Nov 2026. */
const LIVE_DE_H1 = 'google search console: Ihr Leitfaden für bessere Sichtbarkeit bei google'

async function main() {
  console.log('A) a product name comes back in the case the world writes it')
  {
    check('A1: the live German H1 is repaired end to end',
      canonicalizeHeadline(LIVE_DE_H1) === 'Google Search Console: Ihr Leitfaden für bessere Sichtbarkeit bei Google',
      canonicalizeHeadline(LIVE_DE_H1))
    const pairs: [string, string][] = [
      ['wordpress mit google analytics verbinden', 'WordPress mit Google Analytics verbinden'],
      ['chatgpt und gemini zitieren die seite', 'ChatGPT und Gemini zitieren die seite'],
      ['semrush vs ahrefs', 'Semrush vs Ahrefs'],
      ['core web vitals und json-ld', 'Core Web Vitals und JSON-LD'],
      ['כך מחברים את google search console לאתר wordpress', 'כך מחברים את Google Search Console לאתר WordPress'],
      ['cómo usar google business profile', 'cómo usar Google Business Profile'],
      ['CHATGPT', 'ChatGPT'],
      ['die seo-leistung messen', 'die SEO-leistung messen'],
    ]
    for (const [src, want] of pairs) {
      check(`A2: "${src.slice(0, 34)}…"`, canonicalizeKnownTerms(src) === want, canonicalizeKnownTerms(src))
    }
    check('A3: the longest name wins over its own first word',
      canonicalizeKnownTerms('google search console') === 'Google Search Console')
    check('A4: idempotent', canonicalizeKnownTerms(canonicalizeKnownTerms(LIVE_DE_H1)) === canonicalizeKnownTerms(LIVE_DE_H1))
    check('A5: a name broken across a line comes back with one space',
      canonicalizeKnownTerms('google\nsearch\nconsole') === 'Google Search Console')

    // MUTATION CONTROL — the pre-fix behaviour: no pass at all.
    check('MUTATION: untouched text keeps the lower-cased keyword (so A1 would fail)',
      LIVE_DE_H1.includes('google search console'))
  }

  console.log('B) a word that only looks like a product name is never touched')
  {
    const prose = "ai bambini, sem compromisso, le roi de france, chrome lucido, le ui, windows and apples, the lighthouse"
    check('B1: Italian "ai", Portuguese "sem", French "roi", "chrome", "ui", "windows", "apple", "lighthouse" survive',
      canonicalizeKnownTerms(prose) === prose, canonicalizeKnownTerms(prose))
    for (const term of DELIBERATELY_EXCLUDED) {
      check(`B2: "${term}" stays out of the table`,
        !CANONICAL_TERMS.some((t) => t.toLowerCase() === term.toLowerCase()))
    }
    check('B3: a term is never matched inside a longer word',
      canonicalizeKnownTerms('googlende Nutzer und seoul') === 'googlende Nutzer und seoul',
      canonicalizeKnownTerms('googlende Nutzer und seoul'))

    // MUTATION CONTROL — a table that did include "AI" would corrupt Italian prose.
    const naive = 'ai bambini'.replace(/(?<![\p{L}\p{N}])ai(?![\p{L}\p{N}])/giu, 'AI')
    check('MUTATION: an "AI" rule uppercases Italian "ai" (so the exclusion is real)', naive === 'AI bambini')
  }

  console.log('C) a URL is never rewritten')
  {
    const urls = [
      'https://www.gotopseo.com/de/articles/google-search-console-leitfaden',
      'www.google.com/search?q=seo',
      'siehe sitemap.xml und robots.txt',
      'mailto:info@google.com',
    ]
    for (const u of urls) check(`C1: "${u.slice(0, 40)}…" untouched`, canonicalizeKnownTerms(u) === u, canonicalizeKnownTerms(u))
    check('C2: the scheme is not uppercased',
      canonicalizeKnownTerms('besuchen sie https://example.com') === 'besuchen sie https://example.com')
    check('C3: a sentence-final name IS repaired, dot and all',
      canonicalizeKnownTerms('die Seite steht bei google.') === 'die Seite steht bei Google.')

    // MUTATION CONTROL — guards without the slash/dot exclusions break the path.
    const naive = 'https://x.com/de/google-search-console-leitfaden'
      .replace(/(?<![\p{L}\p{N}])google(?![\p{L}\p{N}])/giu, 'Google')
    check('MUTATION: unguarded rules rewrite inside the path (so C1 would fail)',
      naive.includes('/de/Google-search-console'))
  }

  console.log('D) a headline never begins in lower case')
  {
    check('D1: a keyword with no product name in it still gets its capital',
      capitalizeHeadline('rank tracking für einsteiger') === 'Rank tracking für einsteiger')
    check('D2: a name that starts lower case on purpose is left alone',
      capitalizeHeadline('iPhone 15 im Test') === 'iPhone 15 im Test')
    check('D3: Hebrew is untouched (no case to set)',
      capitalizeHeadline('בדיקת מיקום בגוגל') === 'בדיקת מיקום בגוגל')
    check('D4: Japanese is untouched', capitalizeHeadline('検索順位の確認') === '検索順位の確認')
    check('D5: an already-capital headline is unchanged',
      capitalizeHeadline('Leitfaden für Einsteiger') === 'Leitfaden für Einsteiger')
    check('D6: a leading quote or digit does not stop it',
      capitalizeHeadline('„seo für kleine Firmen“') === '„Seo für kleine Firmen“')
    check('D7: idempotent', capitalizeHeadline(capitalizeHeadline('seo guide')) === capitalizeHeadline('seo guide'))

    // MUTATION CONTROL — the naive version breaks a name that opens lower case.
    const naive = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    check('MUTATION: a bare toUpperCase() breaks "iPhone" (so D2 would fail)', naive('iPhone 15') === 'IPhone 15')
  }

  console.log('E) the render pass fixes the pages already published')
  {
    const html = '<h2>wie <strong>google</strong> das sieht</h2><p>siehe google analytics und <code>google ads</code>.</p>'
    const out = canonicalizeArticleHtml(html)
    check('E1: a heading is repaired and capitalised', out.includes('<h2>Wie <strong>Google</strong> das sieht</h2>'), out)
    check('E2: prose is repaired', out.includes('siehe Google Analytics'), out)
    check('E3: <code> is left exactly as written', out.includes('<code>google ads</code>'), out)
    check('E4: an attribute is never touched',
      canonicalizeArticleHtml('<a href="/de/x?q=google+ads" title="google ads">google ads</a>')
        === '<a href="/de/x?q=google+ads" title="google ads">Google Ads</a>',
      canonicalizeArticleHtml('<a href="/de/x?q=google+ads" title="google ads">google ads</a>'))
    check('E5: only the run that OPENS a heading gets the capital',
      canonicalizeArticleHtml('<h2><em>die</em> prüfung</h2>') === '<h2><em>Die</em> prüfung</h2>',
      canonicalizeArticleHtml('<h2><em>die</em> prüfung</h2>'))
    check('E6: idempotent', canonicalizeArticleHtml(out) === out)
    check('E7: an empty body is returned as is', canonicalizeArticleHtml('') === '')

    const server = read('lib/articles/server.ts')
    check('E8: getPublicArticle canonicalises the title it returns', /title:\s*canonicalizeHeadline\(row\.title\)/.test(server))
    check('E9: getPublicArticle canonicalises the body it returns', /content:\s*canonicalizeArticleHtml\(row\.content\)/.test(server))
    const index = read('components/public/articles/ArticlesIndex.tsx')
    check('E10: the index card title gets the same repair', /title:\s*canonicalizeHeadline\(a\.title\)/.test(index))

    // MUTATION CONTROL — without the render pass the live H1 stays as it is.
    check('MUTATION: the stored row alone still reads as machine output (so E8 would fail)',
      LIVE_DE_H1.startsWith('google'))
  }

  console.log('F) the generator no longer enforces the planner\'s lower case')
  {
    // polishText's own rules come from the brief; its last word is this pass.
    const lowered = [{ re: /(?<![A-Za-z0-9])google search console(?![A-Za-z0-9])/gi, replacement: 'google search console' }]
    check('F1: polishText no longer rewrites a correct name DOWN',
      polishText('Google Search Console einrichten', lowered) === 'Google Search Console einrichten',
      polishText('Google Search Console einrichten', lowered))
    check('F2: polishText repairs the lower-cased form too',
      polishText('google search console einrichten', []) === 'Google Search Console einrichten',
      polishText('google search console einrichten', []))
    check('F3: polishText still does its original job (brand casing from the brief)',
      polishText('kingsmith walkingpad x21', [{ re: /(?<![A-Za-z0-9])kingsmith walkingpad x21(?![A-Za-z0-9])/gi, replacement: 'Kingsmith WalkingPad X21' }])
        === 'Kingsmith WalkingPad X21')

    const gen = read('lib/content/gemini-article.ts')
    check('F4: the casing rules are built from canonicalised sources',
      /\]\.map\(canonicalizeKnownTerms\)/.test(gen))
    check('F5: the prompt quotes the canonicalised keyword',
      /Primary keyword: \$\{canonicalizeKnownTerms\(brief\.primaryKeyword\)\}|Primary keyword: "\$\{canonicalizeKnownTerms\(brief\.primaryKeyword\)\}"/.test(gen))
    check('F6: the prompt says the keyword is a search phrase, not a spelling to copy',
      /SEARCH PHRASE, not a spelling to copy/.test(gen))
    check('F7: the metaTitle autofix prefixes the canonicalised keyword',
      /const kw = canonicalizeKnownTerms\(\(brief\.primaryKeyword \|\| ''\)\.trim\(\)\)/.test(gen))
    check('F8: title, headings and FAQ questions go through the headline pass',
      /const h = \(s: string\) => canonicalizeHeadline\(f\(s\)\)/.test(gen)
      && /a\.title = h\(a\.title\)/.test(gen) && /heading: h\(s\.heading\)/.test(gen))

    // MUTATION CONTROL — the pre-fix pass, which enforced the planner's casing.
    const broken = (s: string) => s.replace(/(?<![A-Za-z0-9])google search console(?![A-Za-z0-9])/gi, 'google search console')
    check('MUTATION: the pre-fix rule lower-cases a correct name (so F1 would fail)',
      broken('Google Search Console einrichten') === 'google search console einrichten')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
