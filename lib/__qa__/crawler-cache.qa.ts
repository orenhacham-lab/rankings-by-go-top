/**
 * QA — the crawler-only CDN copy (lib/crawler-cache.ts, wired in proxy.ts).
 *
 * Proved: which requests are eligible (and that every person, every cookie, every
 * query string, every non-GET and every private path is NOT), that the proxy
 * rewrites a crawler to its own cache key and sets the lifetime only there, and
 * that no crawler is refused. NOT proved here: that Vercel's CDN honours the
 * header and keys on the rewritten URL; that is measured on a preview deployment.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CRAWLER_CACHE_HEADER, CRAWLER_CDN_CACHE, CRAWLER_PARAM, isCacheableCrawlerRequest, isPublicMarketingPath,
  type CrawlerCacheInput,
} from '@/lib/crawler-cache'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const UA = {
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  gpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  claude: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  meta: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  unknownBot: 'Mozilla/5.0 (compatible; SomeNewCrawler/1.0; +https://example.com/bot)',
  curl: 'curl/8.4.0',
  python: 'python-requests/2.31',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

function req(over: Partial<{ method: string; pathname: string; search: string; ua: string | null; headers: Record<string, string> }> = {}): CrawlerCacheInput {
  const h = over.headers ?? {}
  return {
    method: over.method ?? 'GET', pathname: over.pathname ?? '/en/features/site-links', search: over.search ?? '',
    userAgent: over.ua === undefined ? UA.googlebot : over.ua, header: (n) => h[n] ?? null,
  }
}

const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

async function main() {
  console.log('A. Who is eligible')
  check('A1 Googlebot on a public page', isCacheableCrawlerRequest(req()))
  check('A2 GPTBot and ClaudeBot are served the cached copy, not refused', isCacheableCrawlerRequest(req({ ua: UA.gpt })) && isCacheableCrawlerRequest(req({ ua: UA.claude })))
  check('A3 the Meta link-preview agent', isCacheableCrawlerRequest(req({ ua: UA.meta })))
  check('A4 an unnamed agent that says it is a bot', isCacheableCrawlerRequest(req({ ua: UA.unknownBot })))
  check('A5 a person on Chrome is not', !isCacheableCrawlerRequest(req({ ua: UA.chrome })))
  check('A6 curl and python-requests are not (they do not say they are crawlers)', !isCacheableCrawlerRequest(req({ ua: UA.curl })) && !isCacheableCrawlerRequest(req({ ua: UA.python })))
  check('A7 no user agent at all is not', !isCacheableCrawlerRequest(req({ ua: null })))
  check('A8 a request with any cookie is not, even from a crawler', !isCacheableCrawlerRequest(req({ headers: { cookie: 'a=b' } })))
  check('A9 a query string is not', !isCacheableCrawlerRequest(req({ search: '?lang=en' })))
  check('A10 POST and HEAD are not', !isCacheableCrawlerRequest(req({ method: 'POST' })) && !isCacheableCrawlerRequest(req({ method: 'HEAD' })))
  check('A11 RSC and prefetch requests are not', !isCacheableCrawlerRequest(req({ headers: { rsc: '1' } })) && !isCacheableCrawlerRequest(req({ headers: { 'next-router-prefetch': '1' } })))

  console.log('B. Which paths')
  const yes = ['/', '/en', '/pricing', '/en/pricing', '/features/site-links', '/pt-BR/solutions/shopify', '/articles/x', '/de/articles/y', '/compare/yoast', '/ai-crawlers', '/privacy', '/ja/terms']
  const no = ['/dashboard', '/en/dashboard', '/login', '/signup', '/en/signup', '/billing', '/admin', '/api/version', '/r/abc', '/free-check', '/en/free-check', '/shopify/install', '/projects/1', '/setup', '/robots.txt', '/sitemap.xml']
  check('B1 public marketing paths', yes.every(isPublicMarketingPath), yes.filter((p) => !isPublicMarketingPath(p)).join(','))
  check('B2 private, auth, billing, affiliate-click and tool paths are out', no.every((p) => !isPublicMarketingPath(p)), no.filter(isPublicMarketingPath).join(','))

  console.log('C. The proxy')
  const proxy = strip(readFileSync('proxy.ts', 'utf8'))
  check('C1 it imports the module', /from '@\/lib\/crawler-cache'/.test(proxy))
  const at = proxy.indexOf('isCacheableCrawlerRequest({')
  check('C2 the crawler branch sits after the sanctions guard and the setup guard', at > proxy.indexOf('isRestrictedPath(pathname)') && at > proxy.indexOf('if (!isConfigured)'))
  check('C3 the crawler is rewritten to its own cache key', /searchParams\.set\(CRAWLER_PARAM, '1'\)[\s\S]{0,200}NextResponse\.rewrite\(target/.test(proxy))
  check('C4 the lifetime is set on that response only', (proxy.match(/CRAWLER_CACHE_HEADER/g) ?? []).length === 2 && /res\.headers\.set\(CRAWLER_CACHE_HEADER, CRAWLER_CDN_CACHE\)/.test(proxy))
  check('C5 the branch returns before the session client is built', at > 0 && at < proxy.indexOf('createServerClient(supabaseUrl'))
  check('C6 no crawler is refused: the module has no status code, redirect or block', !/status|redirect|403|429|451|blocked?/i.test(strip(readFileSync('lib/crawler-cache.ts', 'utf8')).replace(/never blocks?/gi, '')))
  check('C7 the constants are what the docs say', CRAWLER_PARAM === '__crawler' && CRAWLER_CACHE_HEADER === 'Vercel-CDN-Cache-Control' && /s-maxage=3600/.test(CRAWLER_CDN_CACHE))

  console.log('D. Mutation controls (the real source, broken on purpose, must fail the guard)')
  {
    const SRC = join(__dirname, '..', 'crawler-cache.ts')
    const source = readFileSync(SRC, 'utf8')
    let n = 0
    async function mutant(needle: string, repl: string) {
      const next = source.replace(needle, repl)
      if (next === source) throw new Error(`mutation did not apply: ${needle}`)
      const to = join(__dirname, '..', `crawler-cache.mut${++n}.ts`)
      writeFileSync(to, next)
      try { return (await import(to)) as typeof import('@/lib/crawler-cache') } finally { unlinkSync(to) }
    }
    const noCookie = await mutant("if (input.header('cookie')) return false", '')
    check('D1 dropping the cookie rule would cache a request that carries a session, which A8 catches', noCookie.isCacheableCrawlerRequest(req({ headers: { cookie: 'sb=1' } })))
    const noQuery = await mutant('if (input.search) return false', '')
    check('D2 dropping the query rule is caught by A9', noQuery.isCacheableCrawlerRequest(req({ search: '?lang=en' })))
    const anyPath = await mutant('if (!isPublicMarketingPath(input.pathname)) return false', '')
    check('D3 dropping the path allowlist would cache /dashboard, which B2 catches', anyPath.isCacheableCrawlerRequest(req({ pathname: '/en/dashboard' })))
    const everyone = await mutant("return cls === 'other-bot' && SELF_DECLARED_CRAWLER.test(input.userAgent ?? '')", 'return true')
    check('D4 treating every agent as a crawler would cache a person, which A5 catches', everyone.isCacheableCrawlerRequest(req({ ua: UA.chrome })))
    const loose = await mutant("PUBLIC_SECTIONS.includes(parts[0])", 'true')
    check('D5 an open allowlist is caught by B2', loose.isPublicMarketingPath('/billing'))
    const noRewrite = strip(readFileSync('proxy.ts', 'utf8')).replace("target.searchParams.set(CRAWLER_PARAM, '1')", '')
    check('D6 removing the rewrite (so a crawler shares a person\'s cache key) fails C3', !/searchParams\.set\(CRAWLER_PARAM, '1'\)[\s\S]{0,200}NextResponse\.rewrite\(target/.test(noRewrite))
    const late = strip(readFileSync('proxy.ts', 'utf8')).replace('isCacheableCrawlerRequest({', 'isCacheableCrawlerRequest2({')
    check('D7 moving the branch away fails C5', !(late.indexOf('isCacheableCrawlerRequest({') > 0))
  }
}

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}
