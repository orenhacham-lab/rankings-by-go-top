/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * THE LANGUAGE CONTRACT, proved at the SERVER boundary.
 *
 * A previous pass called this PASS on the strength of a useEffect that set
 * document.documentElement after hydration. That is not the contract: the
 * INITIAL server response is what a crawler, a screen reader and the first
 * paint actually get, and it was hard-coded to lang="he" dir="rtl" for every
 * route, English ones included.
 *
 * Sections 1-3 start a REAL production server and read the RAW HTML off the
 * wire — no browser, no JavaScript executed, so anything asserted there is true
 * before the client boots. Sections 4-6 exercise the pure precedence and
 * migration rules that the middleware, the server layouts and the client
 * provider all share.
 *
 * Requires a production build (`npx next build`). Without .next/ the server
 * sections report BLOCKED rather than passing vacuously.
 *
 * Run: npx tsx lib/i18n/__qa__/server-language-contract.qa.ts
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import {
  resolveRequestLocale, migrateLocalePreference, languageCookieString, readCookie,
  isEnglishPath, LANGUAGE_COOKIE, LOCALE_HEADER, REQUEST_FALLBACK_LOCALE,
  routeContentLocale, publicMarketingSegments,
} from '../request-locale'
import { documentLocaleAttributes } from '../document-locale'
import { resolveDashboardLocale } from '../dashboard/locale'
import { parseAcceptLanguage, localeFromAcceptLanguage } from '../accept-language'
import { getSiteMetadata } from '../site-metadata'
import { readdirSync } from 'fs'

let pass = 0, fail = 0, blocked = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function block(name: string, why: string) { blocked++; console.log(`  ⊘ BLOCKED ${name} — ${why}`) }

const ROOT = join(__dirname, '..', '..', '..')
const PORT = 3997
const BASE = `http://127.0.0.1:${PORT}`

/** The raw server response body — no browser, no JavaScript executed. */
async function rawBody(path: string, opts: { cookie?: string; acceptLanguage?: string; follow?: boolean } = {}): Promise<string> {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  // Node's fetch sends NO Accept-Language of its own, so omitting this is a
  // faithful "missing header" case rather than an accidental default.
  if (opts.acceptLanguage !== undefined) headers['accept-language'] = opts.acceptLanguage
  // `follow` is for a protected route: unauthenticated /dashboard 302s to
  // /login, and the document we want to inspect is the one actually served.
  const res = await fetch(`${BASE}${path}`, { headers, redirect: opts.follow ? 'follow' : 'manual' })
  return await res.text()
}

/** The <html …> tag exactly as the server wrote it. */
async function htmlTag(path: string, cookie?: string, acceptLanguage?: string, follow?: boolean): Promise<string> {
  const body = await rawBody(path, { cookie, acceptLanguage, follow })
  return (body.match(/<html[^>]*>/) || [''])[0]
}

/** The <title> exactly as the server wrote it. */
async function titleTag(path: string, opts: { cookie?: string; acceptLanguage?: string } = {}): Promise<string> {
  const body = await rawBody(path, opts)
  return (body.match(/<title[^>]*>([\s\S]*?)<\/title>/) || ['', ''])[1].trim()
}

async function waitForServer(proc: ChildProcess, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) return false
    try {
      const r = await fetch(BASE, { redirect: 'manual' })
      if (r.status > 0) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  console.log('Server language contract\n')

  let server: ChildProcess | null = null
  const built = existsSync(join(ROOT, '.next', 'BUILD_ID'))
  // A SERVER THIS SUITE DID NOT START IS NOT EVIDENCE. A `next start` left over
  // from an earlier run keeps the port, so the spawn below silently loses the
  // bind, waitForServer succeeds against the STRANGER, and every assertion is
  // measured against whatever build that process is holding — which is how a
  // corrected contract can report as still broken (or, far worse, a broken one
  // report as green). Refuse to run rather than measure the wrong process.
  const portBusy = await (async () => {
    try { const r = await fetch(BASE, { redirect: 'manual' }); return r.status > 0 } catch { return false }
  })()
  if (portBusy) {
    block('1-3: server-rendered HTML',
      `port ${PORT} is already serving — a stray next start would be measured instead of this build. Kill it and re-run.`)
  } else if (!built) {
    block('1-3: server-rendered HTML', 'no production build present — run `npx next build` first')
  } else {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: ROOT,
      // Own process group, so the kill below takes next-server with it instead
      // of orphaning the listener for the next run to trip over.
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: 'https://qa.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'qa-svc',
      },
      stdio: 'ignore',
    })
    if (!(await waitForServer(server, 60_000))) {
      block('1-3: server-rendered HTML', 'the production server did not start in time')
      try { if (server.pid) process.kill(-server.pid, 'SIGKILL') } catch { try { server.kill('SIGKILL') } catch { /* ignore */ } }
      server = null
    }
  }

  if (server) {
    try {
      console.log('1) THE INITIAL SERVER RESPONSE — raw HTML, no JavaScript executed')
      {
        const heDefault = await htmlTag('/')
        check('1a: the Hebrew marketing root with no preference → lang="he" dir="rtl"',
          /lang="he"/.test(heDefault) && /dir="rtl"/.test(heDefault), heDefault)

        // The preference decides on a BILINGUAL surface. (It used to decide on
        // the Hebrew marketing tree too, which labelled Hebrew copy lang="en".)
        const enCookie = await htmlTag('/login', `${LANGUAGE_COOKIE}=en`)
        check('1b: an EN preference on a bilingual route → lang="en" dir="ltr" IN THE FIRST RESPONSE',
          /lang="en"/.test(enCookie) && /dir="ltr"/.test(enCookie), enCookie)
        check('1c: and it carries no Hebrew/RTL at all', !/lang="he"/.test(enCookie) && !/dir="rtl"/.test(enCookie), enCookie)

        const heCookie = await htmlTag('/login', `${LANGUAGE_COOKIE}=he`)
        check('1d: an explicit HE preference → lang="he" dir="rtl"',
          /lang="he"/.test(heCookie) && /dir="rtl"/.test(heCookie), heCookie)
      }

      console.log('\n2) PUBLIC /en ROUTES — English on the initial response, whatever the cookie says')
      {
        const noCookie = await htmlTag('/en')
        check('2a: /en with no cookie → lang="en" dir="ltr"',
          /lang="en"/.test(noCookie) && /dir="ltr"/.test(noCookie), noCookie)
        const heCookieOnEn = await htmlTag('/en', `${LANGUAGE_COOKIE}=he`)
        check('2b: /en with an HE cookie → still English (the URL is the route)',
          /lang="en"/.test(heCookieOnEn) && /dir="ltr"/.test(heCookieOnEn), heCookieOnEn)
      }

      console.log('\n3) APP ROUTES — the preference survives the request, and garbage does not')
      {
        const appEn = await htmlTag('/login', `${LANGUAGE_COOKIE}=en`)
        check('3a: an authenticated-app route carrying the EN preference renders EN/LTR initially',
          /lang="en"/.test(appEn) && /dir="ltr"/.test(appEn), appEn)
        const appHe = await htmlTag('/login', `${LANGUAGE_COOKIE}=he`)
        check('3b: …and HE/RTL for the HE preference', /lang="he"/.test(appHe) && /dir="rtl"/.test(appHe), appHe)
        const junk = await htmlTag('/login', `${LANGUAGE_COOKIE}=zz`)
        check('3c: an unrecognised cookie never yields a broken value',
          /lang="en"/.test(junk) || /lang="he"/.test(junk), junk)
        const other = await htmlTag('/', 'some-other-cookie=en')
        check('3d: an unrelated cookie is ignored', /lang="he"/.test(other), other)
      }
      console.log('\n3B) FIRST VISIT, RAW SERVER RESPONSE — no cookie, no stored preference')
      {
        // The reported defect: a reviewer with an English browser and nothing
        // stored opened the full dashboard in Hebrew RTL. /login is the app
        // surface an unauthenticated reviewer actually lands on, and it is
        // bilingual, so the browser's own header decides.
        const enBrowser = await htmlTag('/login', undefined, 'en-US,en;q=0.9')
        check('3B-a: no cookie + Accept-Language en-US,en;q=0.9 → lang="en" dir="ltr"',
          /lang="en"/.test(enBrowser) && /dir="ltr"/.test(enBrowser), enBrowser)
        check('3B-b: …and the response carries no Hebrew/RTL at all',
          !/lang="he"/.test(enBrowser) && !/dir="rtl"/.test(enBrowser), enBrowser)

        const heBrowser = await htmlTag('/login', undefined, 'he-IL,he;q=0.9,en;q=0.8')
        check('3B-c: no cookie + Accept-Language he-IL,he;q=0.9,en;q=0.8 → lang="he" dir="rtl"',
          /lang="he"/.test(heBrowser) && /dir="rtl"/.test(heBrowser), heBrowser)

        const noHeader = await htmlTag('/login')
        check('3B-d: a MISSING Accept-Language → lang="en" dir="ltr"',
          /lang="en"/.test(noHeader) && /dir="ltr"/.test(noHeader), noHeader)
        const junkHeader = await htmlTag('/login', undefined, ';;;q=abc,,,')
        check('3B-e: an INVALID Accept-Language → lang="en" dir="ltr"',
          /lang="en"/.test(junkHeader) && /dir="ltr"/.test(junkHeader), junkHeader)

        // A q-weighted header that a substring test would get wrong.
        const weighted = await htmlTag('/login', undefined, 'he;q=0.1,en;q=0.9')
        check('3B-f: q-values are honoured on the wire (he;q=0.1,en;q=0.9 → English)',
          /lang="en"/.test(weighted), weighted)

        // Cookies still win over the browser, in both directions.
        const enCookieHeBrowser = await htmlTag('/login', `${LANGUAGE_COOKIE}=en`, 'he-IL,he;q=0.9')
        check('3B-g: an EN cookie overrides a Hebrew browser',
          /lang="en"/.test(enCookieHeBrowser) && /dir="ltr"/.test(enCookieHeBrowser), enCookieHeBrowser)
        const heCookieEnBrowser = await htmlTag('/login', `${LANGUAGE_COOKIE}=he`, 'en-US,en;q=0.9')
        check('3B-h: an HE cookie overrides an English browser',
          /lang="he"/.test(heCookieEnBrowser) && /dir="rtl"/.test(heCookieEnBrowser), heCookieEnBrowser)

        // /en still wins over everything, and the Hebrew marketing tree is never
        // relabelled by a browser header.
        const enPathHeBrowser = await htmlTag('/en', `${LANGUAGE_COOKIE}=he`, 'he-IL,he;q=0.9')
        check('3B-i: /en outranks both an HE cookie and a Hebrew browser',
          /lang="en"/.test(enPathHeBrowser) && /dir="ltr"/.test(enPathHeBrowser), enPathHeBrowser)
        const heMarketingEnBrowser = await htmlTag('/', undefined, 'en-US,en;q=0.9')
        check('3B-j: the Hebrew marketing root is NOT relabelled English by an English browser',
          /lang="he"/.test(heMarketingEnBrowser) && /dir="rtl"/.test(heMarketingEnBrowser), heMarketingEnBrowser)

        // The Shopify embedded entry point shares the resolver.
        const shopifyEn = await htmlTag('/shopify/app', undefined, 'en-US,en;q=0.9')
        check('3B-k: the Shopify embedded entry point uses the SAME resolver (English browser → en/ltr)',
          /lang="en"/.test(shopifyEn) && /dir="ltr"/.test(shopifyEn), shopifyEn)
        const shopifyHe = await htmlTag('/shopify/app', `${LANGUAGE_COOKIE}=he`)
        check('3B-l: …and an HE cookie moves it too',
          /lang="he"/.test(shopifyHe) && /dir="rtl"/.test(shopifyHe), shopifyHe)
      }

      console.log('\n3D) FIXED-LANGUAGE PUBLIC ROUTES — no preference may relabel their copy')
      {
        // The defect this replaces: the cookie was consulted BEFORE the route, so
        // a reviewer who switched the dashboard to English then received every
        // Hebrew legal and marketing page labelled lang="en".
        const privacyEn = await htmlTag('/privacy', `${LANGUAGE_COOKIE}=en`, 'en-US,en;q=0.9')
        check('3D-a: /privacy + EN cookie + English browser → lang="he" dir="rtl"',
          /lang="he"/.test(privacyEn) && /dir="rtl"/.test(privacyEn), privacyEn)
        // The legal pages carry their OWN metadata export, so this asserts the
        // pairing that matters: the Hebrew URL yields Hebrew metadata and the
        // English URL yields English metadata (3D-e), whatever the cookie says.
        const privacyTitle = await titleTag('/privacy', { cookie: `${LANGUAGE_COOKIE}=en`, acceptLanguage: 'en-US,en;q=0.9' })
        check('3D-b: …and an EN cookie does not give the Hebrew page English metadata',
          /[\u0590-\u05FF]/.test(privacyTitle), privacyTitle)

        const termsEn = await htmlTag('/terms', `${LANGUAGE_COOKIE}=en`)
        check('3D-c: /terms + EN cookie → lang="he" dir="rtl"',
          /lang="he"/.test(termsEn) && /dir="rtl"/.test(termsEn), termsEn)

        const enPrivacyHe = await htmlTag('/en/privacy', `${LANGUAGE_COOKIE}=he`, 'he-IL,he;q=0.9')
        check('3D-d: /en/privacy + HE cookie → lang="en" dir="ltr"',
          /lang="en"/.test(enPrivacyHe) && /dir="ltr"/.test(enPrivacyHe), enPrivacyHe)
        const enPrivacyTitle = await titleTag('/en/privacy', { cookie: `${LANGUAGE_COOKIE}=he` })
        check('3D-e: …and its metadata is English',
          enPrivacyTitle.length > 0 && !/[\u0590-\u05FF]/.test(enPrivacyTitle), enPrivacyTitle)

        // The bilingual surfaces still follow the reader, in both directions.
        // Unauthenticated /dashboard 302s to /login; follow it, because the
        // document the reviewer actually receives is the one that must be right.
        const dashEn = await htmlTag('/dashboard', `${LANGUAGE_COOKIE}=en`, undefined, true)
        check('3D-f: /dashboard + EN cookie → lang="en" dir="ltr"',
          /lang="en"/.test(dashEn) && /dir="ltr"/.test(dashEn), dashEn)
        const dashHe = await htmlTag('/dashboard', `${LANGUAGE_COOKIE}=he`, undefined, true)
        check('3D-g: /dashboard + HE cookie → lang="he" dir="rtl"',
          /lang="he"/.test(dashHe) && /dir="rtl"/.test(dashHe), dashHe)

        // Other Hebrew public routes, same rule.
        for (const path of ['/pricing', '/about', '/accessibility']) {
          const html = await htmlTag(path, `${LANGUAGE_COOKIE}=en`, 'en-US,en;q=0.9')
          check(`3D-h: ${path} + EN cookie + English browser stays Hebrew`,
            /lang="he"/.test(html) && /dir="rtl"/.test(html), html)
        }
      }

      console.log('\n3C) METADATA FOLLOWS THE DOCUMENT — raw <title> off the wire')
      {
        const enTitle = await titleTag('/login', { acceptLanguage: 'en-US,en;q=0.9' })
        const heTitle = await titleTag('/login', { acceptLanguage: 'he-IL,he;q=0.9' })
        check('3C-a: an English document has a non-Hebrew <title>',
          enTitle.length > 0 && !/[\u0590-\u05FF]/.test(enTitle), enTitle)
        check('3C-b: a Hebrew document keeps its Hebrew <title>',
          /[\u0590-\u05FF]/.test(heTitle), heTitle)
        check('3C-c: the two are genuinely different', enTitle !== heTitle, `${enTitle} / ${heTitle}`)
        const enCookieTitle = await titleTag('/login', { cookie: `${LANGUAGE_COOKIE}=en` })
        check('3C-d: the cookie moves the title as well as the document',
          !/[\u0590-\u05FF]/.test(enCookieTitle), enCookieTitle)
        const enBody = await rawBody('/login', { acceptLanguage: 'en-US,en;q=0.9' })
        check('3C-e: og:locale on an English document is en_US, not he_IL',
          enBody.includes('en_US') && !enBody.includes('he_IL'))
      }

    } finally {
      try { if (server.pid) process.kill(-server.pid, 'SIGKILL') } catch { try { server.kill('SIGKILL') } catch { /* ignore */ } }
    }
  }

  console.log('\n4) PRECEDENCE — one rule, shared by middleware, server layouts and client')
  {
    check('4a: an /en path wins over an HE cookie',
      resolveRequestLocale({ pathname: '/en/pricing', cookieValue: 'he' }) === 'en')
    check('4b: the cookie decides a BILINGUAL path',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'en' }) === 'en'
      && resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he' }) === 'he')
    check('4c: the seed is used only when there is no cookie',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: null, seed: 'en' }) === 'en'
      && resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he', seed: 'en' }) === 'he')
    check('4d: with NO signal of any kind the fallback is English, not Hebrew',
      resolveRequestLocale({}) === REQUEST_FALLBACK_LOCALE && REQUEST_FALLBACK_LOCALE === 'en')
    // THE CORRECTED PRECEDENCE: the route outranks EVERY preference, not just
    // the browser. A cookie, an auth seed and a header are all preferences about
    // which language to READ; none of them changes which language a page is
    // WRITTEN in.
    check('4d2: a fixed-language route outranks the cookie, the seed AND the browser',
      resolveRequestLocale({ pathname: '/privacy', cookieValue: 'en', seed: 'en', acceptLanguage: 'en-US,en;q=0.9' }) === 'he'
      && resolveRequestLocale({ pathname: '/terms', cookieValue: 'en' }) === 'he'
      && resolveRequestLocale({ pathname: '/pricing', cookieValue: 'en', acceptLanguage: 'en-US' }) === 'he'
      && resolveRequestLocale({ pathname: '/', cookieValue: 'en', seed: 'en' }) === 'he'
      && resolveRequestLocale({ pathname: '/en/privacy', cookieValue: 'he', seed: 'he', acceptLanguage: 'he-IL' }) === 'en')
    check('4d3: a bilingual app route falls through to the browser',
      resolveRequestLocale({ pathname: '/dashboard', acceptLanguage: 'en-US,en;q=0.9' }) === 'en'
      && resolveRequestLocale({ pathname: '/dashboard', acceptLanguage: 'he-IL,he;q=0.9,en;q=0.8' }) === 'he')
    check('4e: /english is NOT an English route (prefix must be a segment)', isEnglishPath('/english') === false)
    check('4f: /en and /en/… are', isEnglishPath('/en') && isEnglishPath('/en/terms'))

    check('4g: EN maps to lang=en dir=ltr', JSON.stringify(documentLocaleAttributes('en')) === JSON.stringify({ lang: 'en', dir: 'ltr' }))
    check('4h: HE maps to lang=he dir=rtl', JSON.stringify(documentLocaleAttributes('he')) === JSON.stringify({ lang: 'he', dir: 'rtl' }))
  }

  console.log('\n5) NO SERVER/CLIENT DISAGREEMENT')
  {
    // The server renders <html> from resolveRequestLocale; the provider's FIRST
    // render comes from resolveDashboardLocale(null, initialLocale), and
    // initialLocale is that same server value. Same input, same answer, so the
    // first client render cannot differ from the server's.
    for (const cookieValue of ['en', 'he', null, 'zz']) {
      const serverLocale = resolveRequestLocale({ pathname: '/dashboard', cookieValue })
      const clientFirstRender = resolveDashboardLocale(null, serverLocale)
      check(`5a: cookie=${JSON.stringify(cookieValue)} — client's first render matches the server (${serverLocale})`,
        clientFirstRender === serverLocale)
    }
    check('5b: and the same locale yields the same document attributes on both sides',
      JSON.stringify(documentLocaleAttributes(resolveRequestLocale({ cookieValue: 'en' })))
      === JSON.stringify(documentLocaleAttributes(resolveDashboardLocale(null, 'en'))))

    const proxySrc = require('fs').readFileSync(join(ROOT, 'proxy.ts'), 'utf8')
    check('5c: SOURCE — the proxy hands the locale forward on a request header, and ONLY when this request decides it',
      proxySrc.includes('LOCALE_HEADER')
      && /if \(explicitLocale\) requestHeaders\.set\(LOCALE_HEADER, explicitLocale\)/.test(proxySrc))
    const rootLayout = require('fs').readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
    check('5d: SOURCE — the root layout renders that locale, not a hard-coded one',
      /<html lang=\{lang\} dir=\{dir\}/.test(rootLayout) && !/<html lang="he" dir="rtl"/.test(rootLayout))
    // The seed read moved into the request-cached context so generateMetadata and
    // the render share ONE resolution; the seed itself is unchanged.
    const rootReqSrc = require('fs').readFileSync(join(ROOT, 'lib', 'i18n', 'root-request.ts'), 'utf8')
    check('5e: SOURCE — the root layout resolves the locale server-side, seed included',
      /const \{ isAuthenticated, locale \} = await getRootRequestContext\(\)/.test(rootLayout)
      && /user\?\.user_metadata\?\.locale/.test(rootReqSrc)
      && /getServerLocale\(seed\)/.test(rootReqSrc))
    check('5g: the SEED survives — an English signup on a cookie-less device still gets English',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: null, seed: 'en' }) === 'en')
    check('5h: …while an explicit cookie still outranks it',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he', seed: 'en' }) === 'he')
    const dashLayout = require('fs').readFileSync(join(ROOT, 'app', '(dashboard)', 'layout.tsx'), 'utf8')
    check('5f: SOURCE — the dashboard seeds the provider from the SAME server locale',
      /getServerLocale\(/.test(dashLayout))
  }

  console.log('\n7) ACCEPT-LANGUAGE — parsed, with q-values; never a substring test')
  {
    check('7a: q-values decide, not order — he;q=0.1,en;q=0.9 is ENGLISH',
      localeFromAcceptLanguage('he;q=0.1,en;q=0.9') === 'en')
    check('7b: …and en;q=0.1,he;q=0.9 is HEBREW',
      localeFromAcceptLanguage('en;q=0.1,he;q=0.9') === 'he')
    check('7c: equal q keeps the sender\'s own order',
      localeFromAcceptLanguage('he,en') === 'he' && localeFromAcceptLanguage('en,he') === 'en')
    check('7d: an absent q means 1 and outranks an explicit lower one',
      localeFromAcceptLanguage('en,he;q=0.9') === 'en')
    check('7e: q=0 means NOT acceptable and is skipped',
      localeFromAcceptLanguage('he;q=0,en;q=0.5') === 'en')
    check('7f: region subtags are matched on the primary subtag',
      localeFromAcceptLanguage('en-GB') === 'en' && localeFromAcceptLanguage('he-IL') === 'he'
      && localeFromAcceptLanguage('EN-us') === 'en')
    check('7g: the legacy Hebrew code iw is recognised', localeFromAcceptLanguage('iw-IL') === 'he')
    // The exact failure a substring test produces: "he" inside another tag.
    check('7h: NOT a substring test — zh-Hant contains "he" and is not Hebrew',
      localeFromAcceptLanguage('zh-Hant,zh;q=0.9') === null)
    check('7i: unsupported languages yield null so the caller\'s own fallback applies',
      localeFromAcceptLanguage('fr-FR,de;q=0.8') === null)
    check('7j: the wildcard is not a preference for either language',
      localeFromAcceptLanguage('*') === null)
    check('7k: missing / empty / junk headers never throw and yield null',
      localeFromAcceptLanguage(null) === null && localeFromAcceptLanguage('') === null
      && localeFromAcceptLanguage(';;;,,,') === null && localeFromAcceptLanguage('   ') === null)
    check('7l: a malformed q drops that entry rather than promoting it',
      localeFromAcceptLanguage('he;q=abc,en;q=0.4') === 'en'
      && localeFromAcceptLanguage('he;q=7,en') === 'en')
    check('7m: the parser reports the ordered entries it used',
      JSON.stringify(parseAcceptLanguage('en;q=0.8,he;q=0.9')) === JSON.stringify([{ tag: 'he', q: 0.9 }, { tag: 'en', q: 0.8 }]))
    check('7n: whitespace around parameters is tolerated',
      localeFromAcceptLanguage(' he-IL ; q=0.2 , en-US ; q=0.7 ') === 'en')
  }

  console.log('\n8) THE ROUTE\'S OWN LANGUAGE — a fixed-content page is never mislabelled')
  {
    check('8a: the Hebrew marketing tree states Hebrew',
      routeContentLocale('/') === 'he' && routeContentLocale('/pricing') === 'he'
      && routeContentLocale('/about') === 'he' && routeContentLocale('/articles/x') === 'he')
    check('8b: the English tree states English', routeContentLocale('/en') === 'en' && routeContentLocale('/en/pricing') === 'en')
    check('8c: bilingual surfaces state nothing and defer to the user',
      routeContentLocale('/dashboard') === null && routeContentLocale('/login') === null
      && routeContentLocale('/shopify/app') === null && routeContentLocale('/content') === null)
    check('8c2: the legal pages are fixed-language too',
      routeContentLocale('/privacy') === 'he' && routeContentLocale('/terms') === 'he'
      && routeContentLocale('/accessibility') === 'he'
      && routeContentLocale('/en/privacy') === 'en' && routeContentLocale('/en/accessibility') === 'en')
    check('8d: /english is not the English tree', routeContentLocale('/english') === null)
    // DRIFT GUARD: a new marketing section that is not in the list would be
    // labelled by the browser header instead of by its own Hebrew content.
    // BOTH Hebrew public groups — /privacy and /accessibility live in (legal),
    // which an earlier version of this guard did not scan at all.
    const publicDirs = ['(public)', '(legal)'].flatMap((group) =>
      readdirSync(join(ROOT, 'app', group), { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name !== 'en')
        .map((d) => d.name))
    const missing = publicDirs.filter((d) => routeContentLocale(`/${d}`) !== 'he')
    check('8e: every directory in app/(public) AND app/(legal) is covered',
      publicDirs.length >= 8 && missing.length === 0,
      `scanned: ${JSON.stringify(publicDirs)} missing: ${JSON.stringify(missing)} — known: ${JSON.stringify(publicMarketingSegments())}`)
    // The switch on a fixed-language page must NAVIGATE, not relabel.
    const switcher = require('fs').readFileSync(join(ROOT, 'components', 'LanguageSwitcher.tsx'), 'utf8')
    check('8f: the public language switch links to the counterpart URL',
      /getCounterpartPath\(pathname, locale\)/.test(switcher) && /<Link/.test(switcher)
      && /return `\/en\$\{pathname\.startsWith\('\/'\) \? pathname : `\/\$\{pathname\}`\}`/.test(switcher))
    check('8g: …and it does not write the language cookie (that would relabel, not navigate)',
      !/languageCookieString|document\.cookie/.test(switcher))
  }

  console.log('\n9) LOCALIZED DOCUMENT METADATA')
  {
    const he = getSiteMetadata('he')
    const en = getSiteMetadata('en')
    check('9a: the two locales have genuinely different titles', he.title !== en.title)
    check('9b: the English title carries no Hebrew characters', !/[\u0590-\u05FF]/.test(en.title), en.title)
    check('9c: the Hebrew title is unchanged from the previous constant',
      he.title === 'יצירה, תזמון ופרסום תוכן SEO ו-GEO | Go Top')
    check('9d: og:locale follows the document locale', he.ogLocale === 'he_IL' && en.ogLocale === 'en_US')
    check('9e: description and keywords are localized too',
      he.description !== en.description && he.keywords !== en.keywords
      && !/[\u0590-\u05FF]/.test(en.description) && !/[\u0590-\u05FF]/.test(en.keywords))
    const rootLayout = require('fs').readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
    check('9f: SOURCE — metadata is generated per request from the resolved locale',
      /export async function generateMetadata\(\)/.test(rootLayout)
      && /getSiteMetadata\(locale\)/.test(rootLayout))
    check('9g: SOURCE — no hard-coded Hebrew title object survives in the layout',
      !/^\s*export const metadata: Metadata = \{/m.test(rootLayout))
    check('9h: SOURCE — metadata and <html> share ONE request-cached resolution',
      /getRootRequestContext\(\)/.test(rootLayout)
      && (rootLayout.match(/getRootRequestContext\(\)/g) ?? []).length === 2)
    const rootReq = require('fs').readFileSync(join(ROOT, 'lib', 'i18n', 'root-request.ts'), 'utf8')
    check('9i: SOURCE — that resolution is React-cached, so it runs once per request',
      /cache\(async \(\)/.test(rootReq) && /from 'react'/.test(rootReq))
  }

  console.log('\n6) SWITCHING AND MIGRATION — deterministic, cookie-first')
  {
    // The switcher must make the preference SERVER-READABLE, not just visible.
    const provider = require('fs').readFileSync(join(ROOT, 'lib', 'i18n', 'dashboard', 'useDashboardLanguage.tsx'), 'utf8')
    check('6a: SOURCE — setDashboardLanguage writes the cookie AND localStorage',
      /const setDashboardLanguage[\s\S]{0,400}writeLanguageCookie\(lang\)[\s\S]{0,200}localStorage\.setItem\(STORAGE_KEY, lang\)/.test(provider))

    const cookie = languageCookieString('en', true)
    check('6b: the cookie is path-wide', /Path=\//.test(cookie))
    check('6c: SameSite=Lax, so a normal navigation carries it', /SameSite=Lax/.test(cookie))
    check('6d: persistent, not a session cookie', /Max-Age=\d{6,}/.test(cookie))
    check('6e: Secure on https', /Secure/.test(cookie) && !/Secure/.test(languageCookieString('en', false)))
    check('6f: readCookie round-trips the value it wrote',
      readCookie(`a=1; ${LANGUAGE_COOKIE}=en; b=2`, LANGUAGE_COOKIE) === 'en')
    check('6g: readCookie does not match a similarly-named cookie',
      readCookie('not-dashboard-language=en', LANGUAGE_COOKIE) === null)

    // MIGRATION — the same inputs must always give the same answer.
    const m1 = migrateLocalePreference({ cookieValue: 'he', storedValue: 'en', serverLocale: 'he' })
    check('6h: an explicit cookie WINS over a stale localStorage value', m1.locale === 'he' && m1.reason === 'cookie')
    check('6i: …and localStorage is corrected to match it', m1.writeStorage === true)

    const m2 = migrateLocalePreference({ cookieValue: null, storedValue: 'en', serverLocale: 'he' })
    check('6j: with no cookie, a real stored choice is adopted', m2.locale === 'en' && m2.reason === 'migrated_from_storage')
    check('6k: …and written to the cookie so the NEXT request is decided server-side', m2.writeCookie === true)

    const m3 = migrateLocalePreference({ cookieValue: null, storedValue: null, serverLocale: 'en' })
    check('6l: with neither, the server\'s locale is kept and persisted', m3.locale === 'en' && m3.reason === 'server_default' && m3.writeCookie === true)

    const m4 = migrateLocalePreference({ cookieValue: 'zz', storedValue: 'nonsense', serverLocale: 'he' })
    check('6m: unrecognised values are ignored, never adopted', m4.locale === 'he' && m4.reason === 'server_default')

    for (let i = 0; i < 3; i++) {
      check(`6n[${i}]: migration is deterministic — identical inputs, identical result`,
        JSON.stringify(migrateLocalePreference({ cookieValue: null, storedValue: 'en', serverLocale: 'he' })) === JSON.stringify(m2))
    }
    // Idempotent: re-running after the cookie exists must not flip anything back.
    const after = migrateLocalePreference({ cookieValue: m2.locale, storedValue: 'en', serverLocale: 'he' })
    check('6o: re-running after migration is stable (no flip-flop, no reload loop)',
      after.locale === m2.locale && after.reason === 'cookie')

    check('6p: the header name is not a cookie name (no collision)', String(LOCALE_HEADER) !== String(LANGUAGE_COOKIE))
  }

  console.log(`\n${pass} passed, ${fail} failed${blocked ? `, ${blocked} blocked` : ''}`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
