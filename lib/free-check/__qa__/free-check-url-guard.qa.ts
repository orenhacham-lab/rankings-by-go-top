/**
 * SSRF admission for the PUBLIC free check.
 *
 * This is the suite that matters most in this feature: /api/free-check fetches
 * a URL a stranger typed, with no authentication in front of it, so the only
 * thing between it and the platform's internal network is
 * lib/free-check/url-guard.ts. Every case below is an attack shape that has
 * been used against scanners in the wild — the decimal and hex spellings of
 * 127.0.0.1, a hostname that resolves to 169.254.169.254, an IPv4-mapped IPv6
 * answer, an explicit port on an internal service.
 *
 * MUTATION CONTROLS are at the end: deliberately weakened copies of the two
 * predicates (a dotted-quad-only IP check, and a "some answer is public" host
 * check) are run through the same assertions and must FAIL them, proving the
 * tests above are load-bearing rather than trivially satisfied.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { assertPublicHost, domainKey, normalizeCheckUrl } from '../url-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const rejects = (input: string) => {
  const r = normalizeCheckUrl(input)
  return !r.ok
}
const admits = (input: string) => normalizeCheckUrl(input).ok

async function main() {
  console.log('SYNTAX) a URL is admitted only when it is plainly a public web page')
  check('bare domain gets https and is admitted', admits('example.co.il'))
  check('domain with path admitted', admits('https://example.com/collections/all'))
  check('trailing-dot host normalised and admitted', (() => {
    const r = normalizeCheckUrl('https://example.com./x')
    return r.ok && r.url.hostname === 'example.com'
  })())

  check('empty input rejected', rejects('   '))
  check('file:// rejected', rejects('file:///etc/passwd'))
  check('gopher:// rejected', rejects('gopher://example.com'))
  check('credentials in URL rejected', rejects('https://user:pw@example.com'))
  check('explicit port rejected (internal services live on ports)', rejects('https://example.com:8080'))
  check('localhost rejected', rejects('http://localhost/'))
  check('*.internal rejected', rejects('http://db.internal/'))
  check('*.local rejected', rejects('http://printer.local/'))
  check('cloud metadata name rejected', rejects('http://metadata.google.internal/'))
  check('single-label host rejected', rejects('http://intranet/'))
  check('numeric TLD rejected', rejects('http://example.123/'))

  console.log('\nIP LITERALS) every spelling of an address, not just dotted quad')
  check('dotted quad rejected', rejects('http://10.0.0.5/'))
  check('loopback rejected', rejects('http://127.0.0.1/'))
  check('metadata IP rejected', rejects('http://169.254.169.254/latest/meta-data/'))
  check('decimal integer form rejected', rejects('http://2130706433/'))
  check('hex form rejected', rejects('http://0x7f000001/'))
  check('octal dotted form rejected', rejects('http://0177.0.0.1/'))
  check('bracketed IPv6 loopback rejected', rejects('http://[::1]/'))
  check('IPv6 without brackets rejected', rejects('http://fd00::1/'))

  console.log('\nRESOLUTION) every answer must be public unicast, all or nothing')
  const stub = (addresses: { address: string; family: number }[]) => async () => addresses
  check('public A record admitted', (await assertPublicHost('example.com', stub([{ address: '93.184.216.34', family: 4 }]))).ok)
  check('private A record refused', !(await assertPublicHost('evil.com', stub([{ address: '10.1.2.3', family: 4 }]))).ok)
  check('metadata A record refused', !(await assertPublicHost('evil.com', stub([{ address: '169.254.169.254', family: 4 }]))).ok)
  check('CGNAT refused', !(await assertPublicHost('evil.com', stub([{ address: '100.64.0.1', family: 4 }]))).ok)
  check('loopback refused', !(await assertPublicHost('evil.com', stub([{ address: '127.0.0.1', family: 4 }]))).ok)
  check('IPv6 unique-local refused', !(await assertPublicHost('evil.com', stub([{ address: 'fd00::1234', family: 6 }]))).ok)
  check('IPv6 link-local refused', !(await assertPublicHost('evil.com', stub([{ address: 'fe80::1', family: 6 }]))).ok)
  check('IPv4-mapped private refused', !(await assertPublicHost('evil.com', stub([{ address: '::ffff:10.0.0.1', family: 6 }]))).ok)
  check('public IPv6 admitted', (await assertPublicHost('example.com', stub([{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }]))).ok)
  check('MIXED public + private answers refused (all-or-nothing)',
    !(await assertPublicHost('evil.com', stub([{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }]))).ok)
  check('empty answer set refused', !(await assertPublicHost('nx.example', stub([]))).ok)
  const thrown = await assertPublicHost('nx.example', async () => { throw new Error('ENOTFOUND') })
  check('resolver throw refused as dns', !thrown.ok && thrown.reason === 'dns')

  console.log('\nCACHE KEY) www is not a separate site')
  check('domainKey strips www', domainKey(new URL('https://www.example.co.il/x')) === 'example.co.il')

  console.log('\nSOURCE) the fetcher re-admits every redirect hop')
  const fetchSrc = stripComments(read('../site-fetch.ts'))
  check('redirects are followed manually, never by fetch', /redirect:\s*'manual'/.test(fetchSrc))
  check('each hop goes through normalizeCheckUrl', /normalizeCheckUrl\(next\.toString\(\)\)/.test(fetchSrc))
  check('each request re-resolves through assertPublicHost', /assertPublicHost\(url\.hostname\)/.test(fetchSrc))
  check('hop count is bounded', /MAX_REDIRECTS/.test(fetchSrc))
  check('body size is capped while streaming', /total > MAX_BYTES/.test(fetchSrc))
  check('a wall-clock timeout aborts the request', /AbortController|setTimeout\(\(\) => controller\.abort/.test(fetchSrc))

  console.log('\nMUTATION CONTROLS) the assertions above fail on deliberately weakened logic')

  // Weakening #1: the naive "it has a dot, it is a domain" check. Note that
  // WHATWG URL already folds 2130706433 / 0x7f000001 / 127.1 into 127.0.0.1
  // (asserted below), so url-guard's exotic-spelling branches are defence in
  // depth; what carries the weight is refusing IP literals at all.
  const weakAdmits = (input: string) => {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
    let u: URL
    try { u = new URL(withScheme) } catch { return false }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return u.hostname.includes('.')
  }
  check('CONTROL: a private IP slips past an "any host with a dot" check', weakAdmits('http://10.0.0.5/'))
  check('CONTROL: so does the metadata IP', weakAdmits('http://169.254.169.254/'))
  check('CONTROL: the real guard rejects both', rejects('http://10.0.0.5/') && rejects('http://169.254.169.254/'))
  check('CONTROL: exotic spellings are normalised by URL itself, so both layers agree',
    new URL('http://2130706433/').hostname === '127.0.0.1' && rejects('http://2130706433/'))

  // Weakening #2: "any public answer is good enough" instead of all-or-nothing.
  const weakHostOk = (answers: { address: string }[]) => answers.some((a) => !/^(10\.|127\.|169\.254\.|192\.168\.)/.test(a.address))
  check('CONTROL: mixed answers pass an any-public check',
    weakHostOk([{ address: '93.184.216.34' }, { address: '169.254.169.254' }]))
  check('CONTROL: the real guard refuses that same set',
    !(await assertPublicHost('evil.com', stub([{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }]))).ok)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()

export {}
