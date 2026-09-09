/**
 * THE SHOPIFY REVIEWER'S JOURNEY KEEPS ITS LANGUAGE.
 *
 * WHAT PRODUCTION DID. The reviewer clicks "Open dashboard" in the embedded
 * Shopify app — an English page — and lands on
 * `/login?next=%2Fprojects%2F<id>` in Hebrew, then on a Hebrew dashboard.
 *
 * WHY, measured against the real build before any change:
 *
 *   * the handoff URL carried NO language at all. It was the bare project path,
 *     so the moment the merchant left the embedded app the journey was decided
 *     by whatever `dashboard-language` cookie was on the browser;
 *   * that cookie is written durably by DashboardLanguageProvider on its first
 *     mount, from whatever the request resolved then — for an account created
 *     through the Hebrew signup, the auth-metadata seed, i.e. `he`. Measured:
 *     `/login` with `Accept-Language: en-US` and NO cookie already answered
 *     `lang="en" dir="ltr"`; with `dashboard-language=he` it answered
 *     `lang="he" dir="rtl"` regardless of the header;
 *   * and `?lang=` — the parameter that was supposed to be the escape hatch —
 *     was honoured only by resolveAuthLocale, in the CLIENT. The server never
 *     saw it, so `/login?lang=en` returned English COPY inside a document
 *     declaring `lang="he" dir="rtl"`. Measured on the real build. Correct
 *     attributes on the wrong copy is the worse half of that failure: it tells
 *     a screen reader to pronounce Hebrew as English.
 *
 * THE FIX USES THE CONTRACT THAT EXISTS. The embedded Shopify pages contain
 * zero Hebrew characters, so they are declared an English ROUTE — the same
 * mechanism that makes `/en/*` English and `/privacy` Hebrew. The handoff asks
 * the contract for that surface's locale and carries it as `?lang=`; the proxy
 * ranks `?lang=` above the cookie, hands it to the server render, persists it
 * so it survives the login redirect and a refresh, and carries it onto the
 * `/login?next=` redirect it builds. No reviewer, project, shop or plan is
 * named anywhere.
 *
 * Run: npx tsx lib/i18n/__qa__/shopify-english-journey.qa.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import {
  LANGUAGE_COOKIE, LANGUAGE_PARAM, LOCALE_HEADER,
  resolveRequestLocale, explicitRequestLocale, routeContentLocale,
  sanitizeNextPath, englishOnlySegments,
} from '../request-locale'
import { resolveAuthLocale } from '../auth-locale'
import { externalUrlWithLocale, authUrlWithLocale } from '../../shopify/handoff-url'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/**
 * Comments are stripped before a source scan. Both banned patterns below are
 * QUOTED in comments that explain why they are banned — an incident narrative
 * naming the account it happened to, and this change's own note about the bare
 * `/login?next=` it replaced. Counting those would make the guard fail on its
 * own documentation, and would push the next author to delete the explanation
 * rather than the behaviour.
 */
const readCode = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** A project id is only reproduction context — this suite must never depend on
 *  one, so it uses an obviously arbitrary value. */
const SOME_PROJECT = '00000000-1111-2222-3333-444444444444'

function main() {
  console.log('The Shopify reviewer journey keeps its language\n')

  // ── 1) the handoff carries safe English context ──────────────────────────
  console.log('1) English Shopify entry -> a handoff URL that carries it')
  {
    const surface = routeContentLocale('/shopify/app')
    check('1a: the embedded Shopify surface is declared English by the ROUTE contract',
      surface === 'en', String(surface))
    check('1b: and so is the link page', routeContentLocale('/shopify/link') === 'en')
    check('1c: the segment list is exposed so the QA can hold it to the real tree',
      englishOnlySegments().includes('shopify'))
    const url = externalUrlWithLocale('https://www.gotopseo.com', `/projects/${SOME_PROJECT}`, 'en')
    check('1d: the dashboard handoff carries ?lang=en',
      url === `https://www.gotopseo.com/projects/${SOME_PROJECT}?lang=en`, url)
    check('1e: it stays on the app origin', new URL(url).origin === 'https://www.gotopseo.com')
    // A caller cannot build a cross-origin handoff even by accident.
    const hostile = externalUrlWithLocale('https://www.gotopseo.com', 'https://evil.com/steal', 'en')
    check('1f: a non-internal path is replaced by a safe internal default',
      new URL(hostile).origin === 'https://www.gotopseo.com' && !hostile.includes('evil.com'), hostile)
    const auth = authUrlWithLocale('/login', '/shopify/link', 'en')
    check('1g: the Shopify auth links carry it too',
      auth.includes(`${LANGUAGE_PARAM}=en`) && auth.includes('next=%2Fshopify%2Flink'), auth)
  }

  // ── 2-4) the language survives login, the destination and a refresh ──────
  console.log('\n2-4) the carried language outranks a stale cookie, and persists')
  {
    // The exact production shape: a Hebrew cookie left behind by an earlier
    // dashboard visit, and an English journey starting from Shopify.
    const stale = { cookieValue: 'he' as string | null }
    check('2a: WITHOUT the carried language the stale cookie decides (the defect)',
      resolveRequestLocale({ pathname: '/login', ...stale }) === 'he')
    check('2b: WITH it, the journey is English on the server',
      resolveRequestLocale({ pathname: '/login', langParam: 'en', ...stale }) === 'en')
    check('2c: the proxy computes the same explicit answer, so the header matches',
      explicitRequestLocale({ pathname: '/login', langParam: 'en', ...stale }) === 'en')
    check('3a: the destination resolves English the same way',
      resolveRequestLocale({ pathname: `/projects/${SOME_PROJECT}`, langParam: 'en', ...stale }) === 'en')
    // 4 — a refresh has no ?lang; only a persisted cookie can carry it.
    check('4a: after the proxy persists it, a refresh with no parameter stays English',
      resolveRequestLocale({ pathname: `/projects/${SOME_PROJECT}`, cookieValue: 'en' }) === 'en')
    const proxySrc = read('proxy.ts')
    check('4b: the proxy actually writes the cookie for a ?lang it resolved',
      /set-cookie/.test(proxySrc) && /languageCookieString\(localeToPersist/.test(proxySrc))
    check('4c: and only for a ?lang, never for a route-fixed locale',
      /const localeToPersist = normalizedLangParam\(langParam\)/.test(proxySrc))
    check('4d: the login redirect it builds carries the language',
      /loginUrl\.searchParams\.set\(LANGUAGE_PARAM, localeToPersist\)/.test(proxySrc))
  }

  // ── 5) an auth error keeps the language and a safe next ─────────────────
  console.log('\n5) an auth failure keeps the language and the safe destination')
  {
    // The login page is a client component; it re-renders in place on a failed
    // sign-in, so the language and `next` it already resolved still apply.
    check('5a: the auth surface answers English for an English request',
      resolveAuthLocale({ pathname: '/login', langParam: 'en', serverLocale: 'he' }) === 'en')
    check('5b: server and client agree, so a failed attempt cannot flip the language',
      resolveAuthLocale({ pathname: '/login', langParam: 'en', serverLocale: 'en' })
        === resolveRequestLocale({ pathname: '/login', langParam: 'en', cookieValue: 'he' }))
    const login = read('app/(auth)/login/page.tsx')
    check('5c: the destination survives a failed attempt because it is derived once',
      /const nextPath = sanitizeNextPath\(searchParams\.get\('next'\), '\/dashboard'\)/.test(login))
  }

  // ── 6-7) an explicit Hebrew preference still wins where it should ────────
  console.log('\n6-7) Hebrew remains available and authoritative')
  {
    check('6a: a Hebrew handoff produces a Hebrew journey — nothing is pinned to English',
      resolveRequestLocale({ pathname: '/login', langParam: 'he', cookieValue: 'en' }) === 'he'
      && resolveRequestLocale({ pathname: `/projects/${SOME_PROJECT}`, langParam: 'he', cookieValue: 'en' }) === 'he')
    check('6b: the handoff builder carries whatever locale it is given',
      externalUrlWithLocale('https://x.test', '/dashboard', 'he').endsWith('lang=he'))
    check('7a: an explicit dashboard preference decides when no journey is carrying one',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he' }) === 'he')
    check('7b: and it outranks the signup seed and the browser header, as before',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he', seed: 'en', acceptLanguage: 'en-US' }) === 'he')
  }

  // ── 8-9) route-fixed languages are untouchable ──────────────────────────
  console.log('\n8-9) a route that owns its language cannot be relabelled')
  {
    check('8a: /privacy stays Hebrew with an English cookie',
      resolveRequestLocale({ pathname: '/privacy', cookieValue: 'en' }) === 'he')
    check('8b: and with an explicit ?lang=en, which must not relabel copy it did not write',
      resolveRequestLocale({ pathname: '/privacy', langParam: 'en', cookieValue: 'en' }) === 'he')
    check('9a: /en/privacy stays English with a Hebrew cookie',
      resolveRequestLocale({ pathname: '/en/privacy', cookieValue: 'he' }) === 'en')
    check('9b: and with an explicit ?lang=he',
      resolveRequestLocale({ pathname: '/en/privacy', langParam: 'he', cookieValue: 'he' }) === 'en')
    check('9c: the Shopify surface likewise ignores a Hebrew cookie',
      resolveRequestLocale({ pathname: '/shopify/app', cookieValue: 'he' }) === 'en')
    // The English-only list must match the real tree.
    const dirs = readdirSync(join(ROOT, 'app', 'shopify'))
      .filter((d) => statSync(join(ROOT, 'app', 'shopify', d)).isDirectory())
    check('9d: every directory under app/shopify is covered by the English-only rule',
      dirs.length > 0 && dirs.every((d) => routeContentLocale(`/shopify/${d}`) === 'en'), JSON.stringify(dirs))
  }

  // ── 10) open redirect ───────────────────────────────────────────────────
  console.log('\n10) a hostile `next` can never leave the origin')
  {
    const hostile = [
      'https://evil.com', 'http://evil.com', '//evil.com', '/\\evil.com',
      'javascript:alert(1)', '\\\\evil.com', ' https://evil.com',
    ]
    for (const value of hostile) {
      check(`10-${JSON.stringify(value)}: rejected`, sanitizeNextPath(value) === '/dashboard', sanitizeNextPath(value))
    }
    check('10a: a legitimate internal path survives untouched',
      sanitizeNextPath(`/projects/${SOME_PROJECT}`) === `/projects/${SOME_PROJECT}`)
    check('10b: a double-encoded external URL is still rejected',
      sanitizeNextPath('%2F%2Fevil.com') === '/dashboard', sanitizeNextPath('%2F%2Fevil.com'))
    check('10c: the proxy builds `next` from the request path, never from a parameter',
      /loginUrl\.searchParams\.set\('next', sanitizeNextPath\(pathname\)\)/.test(read('proxy.ts')))
  }

  // ── 11) nothing identifies the reviewer ─────────────────────────────────
  console.log('\n11) no reviewer, project, shop or plan is named')
  {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (['node_modules', '.next', '__tests__', '__qa__', '.git'].includes(e)) continue
        const full = join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(e)) files.push(relative(ROOT, full))
      }
    }
    for (const top of ['app', 'lib', 'components']) walk(join(ROOT, top))
    files.push('proxy.ts')
    const BANNED = [
      /99560b55-3c90-4b9b-807c-b84101080909/,          // the reproduction project id
      /go-top-seo-test\.myshopify\.com/,               // the reviewer's shop
      /shopify@gotop\.co\.il/,                         // the reviewer's account
    ]
    const offenders = files.filter((rel) => BANNED.some((re) => re.test(readCode(rel))))
    check('11a: no reviewer identity or reproduction id is used by application code',
      offenders.length === 0, JSON.stringify(offenders))
    check('11b: the handoff decides language by ROUTE, never by shop, plan or account',
      !/shop_domain|plan|email|user_id/.test(read('lib/shopify/handoff-url.ts')))
  }

  // ── 12) one mechanism, no hydration correction ──────────────────────────
  console.log('\n12) one locale source, decided before the first byte')
  {
    const authLocale = read('lib/i18n/auth-locale.ts')
    check('12a: the auth surface still derives from route -> ?lang -> server locale',
      /isEnglishPath\(input\.pathname\)/.test(authLocale) && /input\.langParam/.test(authLocale))
    // Server and client must answer identically for every combination.
    let agree = true
    const disagreements: string[] = []
    for (const pathname of ['/login', '/signup', '/dashboard', `/projects/${SOME_PROJECT}`]) {
      for (const langParam of [null, 'en', 'he']) {
        for (const cookieValue of [null, 'en', 'he']) {
          const server = resolveRequestLocale({ pathname, langParam, cookieValue })
          const client = resolveAuthLocale({ pathname, langParam, serverLocale: server })
          if (server !== client) { agree = false; disagreements.push(`${pathname} lang=${langParam} cookie=${cookieValue}: ${server} vs ${client}`) }
        }
      }
    }
    check('12b: the client resolver never disagrees with the server for any combination',
      agree, disagreements.slice(0, 3).join(' ;; '))
    check('12c: no new locale mechanism — the parameter name lives in the contract module',
      /export const LANGUAGE_PARAM = 'lang'/.test(read('lib/i18n/request-locale.ts')))
    for (const rel of ['app/api/shopify/app-home/route.ts', 'app/shopify/link/page.tsx']) {
      const src = readCode(rel)
      check(`12d: ${rel} asks the contract for the surface locale rather than hard-coding one`,
        /routeContentLocale\('\/shopify/.test(src))
      check(`12e: ${rel} builds no bare auth or dashboard URL of its own`,
        !/["'`]\/login\?next=/.test(src) && !/appUrl\}\/projects\//.test(src))
    }
    check('12f: the cookie and header names are still the single shared pair',
      LANGUAGE_COOKIE === 'dashboard-language' && LOCALE_HEADER === 'x-gotop-locale')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
