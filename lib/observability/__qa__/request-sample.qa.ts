/**
 * QA — the one-in-ten request sample (lib/observability/request-sample.ts).
 *
 * What is proved: the classes, that a person's browser is never named, that the
 * sample really is one in ten, that nothing but the class reaches the log line
 * (no path, no query, no agent string), that it never throws, and that the
 * proxy calls it before the first thing that can return.
 *
 * What is NOT proved: that Vercel keeps the line, or its real volume. That is
 * what the first day in production is for.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyUserAgent, requestSampleLine, logRequestSample, REQUEST_SAMPLE_ONE_IN,
} from '@/lib/observability/request-sample'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const UA = {
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bing: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  gpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  claude: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  perplexity: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  semrush: 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  meta: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  curl: 'curl/8.4.0',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

async function main() {
  console.log('A. Classes')
  check('A1 Googlebot', classifyUserAgent(UA.googlebot) === 'googlebot')
  check('A2 Bing', classifyUserAgent(UA.bing) === 'bingbot')
  check('A3 GPTBot', classifyUserAgent(UA.gpt) === 'gptbot')
  check('A4 ClaudeBot', classifyUserAgent(UA.claude) === 'claudebot')
  check('A5 Perplexity', classifyUserAgent(UA.perplexity) === 'perplexitybot')
  check('A6 Ahrefs and Semrush', classifyUserAgent(UA.ahrefs) === 'ahrefsbot' && classifyUserAgent(UA.semrush) === 'semrushbot')
  check('A7 Meta link preview', classifyUserAgent(UA.meta) === 'metabot')
  check('A8 an unnamed machine is other-bot', classifyUserAgent(UA.curl) === 'other-bot' && classifyUserAgent('python-requests/2.31') === 'other-bot')
  check('A9 a person on desktop or phone is a browser', classifyUserAgent(UA.chrome) === 'browser' && classifyUserAgent(UA.safariIphone) === 'browser')
  check('A10 a missing or blank agent is none', classifyUserAgent(null) === 'none' && classifyUserAgent(undefined) === 'none' && classifyUserAgent('   ') === 'none')
  check('A11 a named crawler wins over the Mozilla it also says', classifyUserAgent(UA.googlebot) !== 'browser' && classifyUserAgent(UA.gpt) !== 'browser')

  console.log('B. One in ten')
  {
    const hits = Array.from({ length: 1000 }, (_, i) =>
      requestSampleLine({ pathname: '/en', userAgent: UA.chrome }, i / 1000)).filter(Boolean).length
    check('B1 exactly one in ten of an even spread is logged', hits === 100, String(hits))
    check('B2 the rate constant is ten', REQUEST_SAMPLE_ONE_IN === 10)
    check('B3 the boundary is exclusive', requestSampleLine({ pathname: '/', userAgent: null }, 0.1) === null && requestSampleLine({ pathname: '/', userAgent: null }, 0.0999) !== null)
    check('B4 a NaN draw logs nothing rather than everything', requestSampleLine({ pathname: '/', userAgent: null }, Number.NaN) === null)
  }

  console.log('C. What reaches the log')
  {
    const line = requestSampleLine({ pathname: '/dashboard/secret-id?token=abc', userAgent: UA.chrome }, 0) ?? ''
    check('C1 the line carries the class and the rate', /class=browser/.test(line) && /oneIn=10/.test(line), line)
    check('C2 it carries no path, no query and no agent string',
      !/secret-id|token|abc|Macintosh|Chrome|Mozilla|dashboard/.test(line), line)
  }

  console.log('D. It never breaks a request')
  {
    const logged: unknown[] = []
    let swallowed = true
    const orig = console.log
    console.log = (...a: unknown[]) => { logged.push(a.join(' ')) }
    try {
      logRequestSample({ nextUrl: { pathname: '/en' }, headers: { get: () => UA.gpt } }, 0)
      logRequestSample({ nextUrl: { pathname: '/en' }, headers: { get: () => UA.gpt } }, 0.9)
      try {
        logRequestSample({ nextUrl: { pathname: '/en' }, headers: { get() { throw new Error('boom') } } }, 0)
        logRequestSample({} as never, 0)
      } catch { swallowed = false }
    } finally { console.log = orig }
    check('D1 a sampled request logs once, an unsampled one logs nothing', logged.length === 1 && /class=gptbot/.test(String(logged[0])), JSON.stringify(logged))
    check('D2 a throwing header read and a malformed request are swallowed, not raised', swallowed)
  }

  console.log('E. The proxy calls it, first')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const proxy = strip(readFileSync('proxy.ts', 'utf8'))
    check('E1 the proxy imports it', /from '@\/lib\/observability\/request-sample'/.test(proxy))
    const callAt = proxy.indexOf('logRequestSample(request)')
    const guardAt = proxy.indexOf('isRestrictedPath(pathname)')
    check('E2 it is called before the first thing that can refuse a request', callAt > 0 && guardAt > 0 && callAt < guardAt, `call ${callAt}, guard ${guardAt}`)
    const apiAt = proxy.indexOf("pathname.startsWith('/api/')")
    check('E4 /api is answered at once, after the sample and before any guard', apiAt > callAt && apiAt < guardAt && /startsWith\('\/api\/'\)\) return NextResponse\.next\(\)/.test(proxy), `api ${apiAt}`)
    check('E5 the matcher lets /api through so it can be counted, and still skips static assets', !/api\//.test(proxy.slice(proxy.indexOf('matcher'))) && /_next\/static/.test(proxy))
    const mod = strip(readFileSync('lib/observability/request-sample.ts', 'utf8'))
    check('E3 it never reads a cookie, a query string or an address', !/cookies|searchParams|\.search\b|x-forwarded|x-real-ip|ip\b/.test(mod))
  }

  console.log('F. Mutation controls (the real source, broken on purpose, must fail the guard)')
  {
    const SRC = join(__dirname, '..', 'request-sample.ts')
    const source = readFileSync(SRC, 'utf8')
    let n = 0
    async function mutant(needle: string, repl: string) {
      const next = source.replace(needle, repl)
      if (next === source) throw new Error(`mutation did not apply: ${needle}`)
      const to = join(__dirname, '..', `request-sample.mut${++n}.ts`)
      writeFileSync(to, next)
      try { return (await import(to)) as typeof import('@/lib/observability/request-sample') } finally { unlinkSync(to) }
    }

    const noSample = await mutant('if (!(random < 1 / REQUEST_SAMPLE_ONE_IN)) return null', 'if (false) return null')
    const everyHit = Array.from({ length: 1000 }, (_, i) => noSample.requestSampleLine({ pathname: '/', userAgent: null }, i / 1000)).filter(Boolean).length
    check('F1 dropping the sample logs every request, which B1 catches', everyHit === 1000 && everyHit > 100, String(everyHit))

    const leaky = await mutant("`[req-sample] class=${classifyUserAgent(input.userAgent)} oneIn=${REQUEST_SAMPLE_ONE_IN}`",
      "`[req-sample] path=${input.pathname} ua=${input.userAgent} class=${classifyUserAgent(input.userAgent)}`")
    const leakLine = leaky.requestSampleLine({ pathname: '/dashboard/secret-id?token=abc', userAgent: UA.chrome }, 0) ?? ''
    check('F2 a line that carried the path and agent string fails C2', /secret-id|Macintosh/.test(leakLine), leakLine)

    const unnamed = await mutant('for (const [name, pattern] of NAMED) if (pattern.test(ua)) return name', '')
    check('F3 dropping the named crawlers collapses GPTBot into a generic bot, which A3 catches',
      unnamed.classifyUserAgent(UA.gpt) !== 'gptbot' && unnamed.classifyUserAgent(UA.ahrefs) !== 'ahrefsbot')

    const raising = await mutant('  } catch {\n    // A measurement must never be the reason a page does not answer.\n  }', '  } finally {}')
    let raised = false
    try { raising.logRequestSample({ nextUrl: { pathname: '/' }, headers: { get() { throw new Error('boom') } } }, 0) } catch { raised = true }
    check('F4 removing the catch lets a header error escape, which D2 catches', raised)

    const late = strip2(readFileSync('proxy.ts', 'utf8')).replace('logRequestSample(request)', '').replace('isRestrictedPath(pathname)', 'isRestrictedPath(pathname) /*x*/ && logRequestSample(request)')
    const noApiExit = strip2(readFileSync('proxy.ts', 'utf8')).replace("if (pathname.startsWith('/api/')) return NextResponse.next()", '')
    check('F6 removing the /api early exit fails E4', !/startsWith\('\/api\/'\)\) return NextResponse\.next\(\)/.test(noApiExit))
    const oldMatcher = strip2(readFileSync('proxy.ts', 'utf8')).replace('favicon\\\\.ico|', 'favicon\\\\.ico|api/|')
    check('F7 restoring the api/ exclusion fails E5', /api\//.test(oldMatcher.slice(oldMatcher.indexOf('matcher'))), oldMatcher.slice(oldMatcher.indexOf('matcher'), oldMatcher.indexOf('matcher')+120))
    check('F5 calling it after the guard fails E2', !(late.indexOf('logRequestSample(request)') < late.indexOf('isRestrictedPath(pathname)')))
  }
}

function strip2(s: string) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}
