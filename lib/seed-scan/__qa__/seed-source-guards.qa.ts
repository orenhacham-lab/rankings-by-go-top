/**
 * Source guards for the seeding scan: structural properties that a behavioural
 * test could only sample.
 *
 *   G1  every Supabase query in lib/seed-scan names its owner (user_id; runs and
 *       steps are also written by project_id) — the service-role client
 *       bypasses RLS. One exception, the global daily cap: a head-only count
 *       that returns a number and never a row.
 *   G2  no log line and no response carries an error's text.
 *   G3  every site request of a1 goes through hostPinnedFetch.
 *   G4  the model is called once, after its `attempted` mark is saved; the
 *       searches likewise, at most MAX_SEARCHES (3) of them.
 *   G5  POST checks in the documented order, and redeems a claim token only
 *       after every refusal is behind it.
 *   G6  the route wires the real dependencies: its own auth, the service-role
 *       client for the entitlement decision, after() for the work.
 *   G7  the three-active competitor cap is the competitors route's.
 *
 * Comments are stripped before matching (a lexer that keeps strings, template
 * literals and regular expressions intact). Every guard has a MUTATION
 * CONTROL: the same predicate applied to a deliberately broken copy of the
 * real source must fail, or the guard proves nothing.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-source-guards.qa.ts
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'
import { SEED_API_ERROR_CODES, SEED_STEP_ERROR_CODES } from '../types'
import { makeChecker } from './_fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── A comment stripper that respects strings, templates and regexes ─────────

export function stripComments(src: string): string {
  let out = ''
  let i = 0
  // A stack of lexical modes: code (with its open-brace count) or a template.
  const stack: ({ kind: 'code'; braces: number } | { kind: 'tpl' })[] = [{ kind: 'code', braces: 0 }]
  let lastSig = ''
  const regexMayStart = () => {
    if (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig)) return true
    return /(^|[^\w$])(return|typeof|case|in|of|delete|void|throw|new|await|yield)$/.test(out.trimEnd())
  }
  while (i < src.length) {
    const top = stack[stack.length - 1]
    const c = src[i]
    const n = src[i + 1]
    if (top.kind === 'tpl') {
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
      if (c === '`') { stack.pop(); out += c; i++; lastSig = 'a'; continue }
      if (c === '$' && n === '{') { stack.push({ kind: 'code', braces: 0 }); out += '${'; i += 2; lastSig = '{'; continue }
      out += c; i++; continue
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; out += ' '; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1); i = j + 1; lastSig = 'a'; continue
    }
    if (c === '`') { stack.push({ kind: 'tpl' }); out += c; i++; continue }
    if (c === '/' && regexMayStart()) {
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      j++
      while (j < src.length && /[a-z]/i.test(src[j])) j++
      out += src.slice(i, j); i = j; lastSig = 'a'; continue
    }
    if (c === '{') top.braces++
    if (c === '}') {
      if (top.braces === 0 && stack.length > 1) { stack.pop(); out += c; i++; continue }
      top.braces--
    }
    out += c
    if (!/\s/.test(c)) lastSig = c
    i++
  }
  return out
}

/**
 * The TypeScript parser's view of a source: the text of every token, and how
 * many comments sit in the trivia between them (same-line and leading ones).
 */
function parsedTokens(src: string): { texts: string[]; comments: number } {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const texts: string[] = []
  const seen = new Set<number>()
  let comments = 0
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
    const kids = node.getChildren(sf)
    if (kids.length > 0) {
      kids.forEach(visit)
      return
    }
    const start = node.getFullStart()
    if (!seen.has(start)) {
      seen.add(start)
      comments += (ts.getLeadingCommentRanges(src, start) ?? []).length + (ts.getTrailingCommentRanges(src, start) ?? []).length
    }
    const text = node.getText(sf)
    if (text) texts.push(text)
  }
  visit(sf)
  return { texts, comments }
}

/** From `start`, the text up to the end of the balanced call chain. */
function chainFrom(src: string, start: number): string {
  let depth = 0
  let i = start
  let quote: string | null = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) {
      depth--
      if (depth < 0) break
      if (depth === 0) {
        let j = i + 1
        while (j < src.length && /\s/.test(src[j])) j++
        if (src[j] !== '.') { i++; break }
      }
    }
  }
  return src.slice(start, i)
}

function enclosingFunction(src: string, at: number): string {
  const before = src.slice(0, at)
  const matches = [...before.matchAll(/(?:function\s+([A-Za-z0-9_$]+)\s*\(|(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\()/g)]
  const last = matches[matches.length - 1]
  return last ? (last[1] ?? last[2]) : '(top level)'
}

type Chain = { file: string; table: string; text: string; fn: string }

function queryChains(file: string, src: string): Chain[] {
  const code = stripComments(src)
  const out: Chain[] = []
  for (const m of code.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
    out.push({ file, table: m[1], text: chainFrom(code, m.index as number), fn: enclosingFunction(code, m.index as number) })
  }
  return out
}

/** G1 as a predicate over chains: the offenders. */
function ownerOffenders(chains: Chain[]): string[] {
  const offenders: string[] = []
  for (const c of chains) {
    const insertLike = /\.(insert|upsert)\(/.test(c.text)
    const mutation = insertLike || /\.(update|delete)\(/.test(c.text)
    const namesUser = insertLike ? /\buser_id\s*:/.test(c.text) : /\.eq\(\s*'user_id'\s*,/.test(c.text)
    const namesProject = insertLike ? /\bproject_id\s*:/.test(c.text) : /\.eq\(\s*'project_id'\s*,/.test(c.text)
    const isGlobalCount = c.fn === 'countAllSeedRunsSince' && /\.select\(\s*'id'\s*,\s*\{\s*count:\s*'exact',\s*head:\s*true\s*\}\s*\)/.test(c.text) && !mutation
    if (isGlobalCount) continue
    if (!namesUser) offenders.push(`${c.file}:${c.fn} ${c.table} — no user_id`)
    else if (mutation && ['project_seed_runs', 'project_seed_steps'].includes(c.table) && !namesProject) offenders.push(`${c.file}:${c.fn} ${c.table} — no project_id`)
  }
  return offenders
}

const LIB_FILES = readdirSync(join(ROOT, 'lib/seed-scan')).filter((f) => f.endsWith('.ts')).map((f) => `lib/seed-scan/${f}`)
const ROUTE = 'app/api/projects/[id]/seed/route.ts'

function main() {
  console.log('LEXER) comments go, code stays')
  {
    const sample = "const a = 'x // not a comment' // gone\nconst r = /^https?:\\/\\//.test(u) /* gone */\nconst t = `${b /* in code */}//kept`\n"
    const s = stripComments(sample)
    check('strings, regexes and templates survive; comments do not',
      s.includes("'x // not a comment'") && s.includes('/^https?:\\/\\//') && s.includes('`${b  }//kept`') && !s.includes('gone') && !s.includes('in code'), JSON.stringify(s))
    // Oracle: the TypeScript parser. Stripped, each real source must keep
    // exactly the tokens it had and have no comment left anywhere.
    const drift: string[] = []
    let tokenCount = 0
    for (const f of [...LIB_FILES, ROUTE]) {
      const before = parsedTokens(read(f))
      const after = parsedTokens(stripComments(read(f)))
      tokenCount += before.texts.length
      if (before.comments === 0) drift.push(`${f}: no comment to strip`)
      if (after.comments !== 0) drift.push(`${f}: ${after.comments} comment(s) left`)
      if (before.texts.join('\u0000') !== after.texts.join('\u0000')) drift.push(`${f}: tokens changed`)
    }
    check(`the real sources lose every comment and keep every token (TypeScript parser, ${tokenCount} tokens)`, drift.length === 0, drift.join(' ; '))
    const eaten = stripComments(read('lib/seed-scan/store.ts').replace(".eq('user_id', scope.userId)", "/* .eq('user_id', scope.userId) */"))
    check('MUTATION CONTROL: a filter hidden in a comment is not counted as code',
      parsedTokens(eaten).texts.join(' ') !== parsedTokens(stripComments(read('lib/seed-scan/store.ts'))).texts.join(' ') &&
      ownerOffenders(queryChains('store.ts', eaten)).length > 0)
  }

  console.log("\nG1) every query in lib/seed-scan names its owner")
  const chains = LIB_FILES.flatMap((f) => queryChains(f, read(f)))
  check(`found the queries (${chains.length} across ${LIB_FILES.length} files)`, chains.length >= 25, String(chains.length))
  const offenders = ownerOffenders(chains)
  check('each filters or writes user_id; runs and steps are also written by project_id', offenders.length === 0, offenders.join(' ; '))
  const exceptions = chains.filter((c) => !/\buser_id\b/.test(c.text))
  check('exactly one owner-less query: the head-only global count', exceptions.length === 1 && exceptions[0].fn === 'countAllSeedRunsSince', exceptions.map((e) => e.fn).join(','))
  check('lib/seed-scan never builds a service-role client itself (the route injects it)', LIB_FILES.every((f) => !/createAdminClient\(/.test(stripComments(read(f)))))
  {
    const store = read('lib/seed-scan/store.ts')
    const broken = store.replace(/(export async function getSeedRun[\s\S]*?)\.eq\('user_id', scope\.userId\)/, '$1')
    check('MUTATION CONTROL: getSeedRun without its user_id filter is caught', broken !== store && ownerOffenders(queryChains('store.ts', broken)).some((o) => o.includes('getSeedRun')))
    const leaky = store.replace("{ count: 'exact', head: true })\n    .gt('created_at', since.toISOString())\n  if (error) return 'error'\n  return count ?? 0\n}\n", "{ count: 'exact', head: true })\n    .gt('created_at', since.toISOString())\n  if (error) return 'error'\n  return count ?? 0\n}\n") + "\nexport async function countAllSeedRunsSinceRows(admin: ServiceRoleClient) { return admin.from('project_seed_runs').select('id, summary') }\n"
    check('MUTATION CONTROL: a second owner-less query (returning rows) is caught', ownerOffenders(queryChains('store.ts', leaky)).length === 1)
    const settings = read('lib/seed-scan/settings.ts')
    const brokenInsert = settings.replace(/user_id: scope\.userId,\n\s*project_id: scope\.projectId,\n\s*name: domain,/, 'project_id: scope.projectId,\n      name: domain,')
    check('MUTATION CONTROL: a competitor insert without user_id is caught', brokenInsert !== settings && ownerOffenders(queryChains('settings.ts', brokenInsert)).length === 1)
    const brokenStep = store.replace(/(export async function updateSeedStep[\s\S]*?)\.eq\('project_id', scope\.projectId\)/, '$1')
    check('MUTATION CONTROL: a step write without project_id is caught', brokenStep !== store && ownerOffenders(queryChains('store.ts', brokenStep)).some((o) => o.includes('no project_id')))
  }

  console.log('\nG2) no error text in a log line or a response')
  const logOffenders = (file: string, src: string): string[] => {
    const code = stripComments(src)
    const out: string[] = []
    for (const m of code.matchAll(/console\.(log|warn|error|info|debug)\(/g)) {
      const args = chainFrom(code, (m.index as number) + m[0].length - 1).replace(/errorName\(\w+\)/g, 'NAME')
      if (/\.message\b|\.stack\b|String\(|\bmessage\s*:|JSON\.stringify\(|\$\{\s*(err|e|error)\b/.test(args) || /[(,:]\s*(err|e|error|cause)\s*[,)}]/.test(args)) {
        out.push(`${file}: ${args.slice(0, 80)}`)
      }
    }
    return out
  }
  const logs = [...LIB_FILES, ROUTE].flatMap((f) => logOffenders(f, read(f)))
  check('no console call in lib/seed-scan or the route carries an error or its text', logs.length === 0, logs.join(' ; '))
  check('MUTATION CONTROL: `{ message: err.message }` in a log is caught', logOffenders('x', "console.error('[seed-scan] x', { runId, message: err.message })").length === 1)
  check('MUTATION CONTROL: logging the raw error object is caught', logOffenders('x', "console.error('[seed-scan] x', err)").length === 1)
  const http = stripComments(read('lib/seed-scan/http.ts'))
  const codes = [...http.matchAll(/refuse\(\s*\d{3}\s*,\s*'([a-z_]+)'/g)].map((m) => m[1])
  check('every refusal the API gives is a documented stable code', codes.length >= 10 && codes.every((c) => (SEED_API_ERROR_CODES as readonly string[]).includes(c)), codes.filter((c) => !(SEED_API_ERROR_CODES as readonly string[]).includes(c)).join(','))
  const responses = [...http.matchAll(/Response\.json\(/g)].map((m) => chainFrom(http, (m.index as number) + 'Response.json'.length))
  check('no response body is built from an error', responses.length >= 3 && responses.every((r) => !/\.message\b|String\(|\berr\b/.test(r)))
  check('MUTATION CONTROL: a response built from an error is caught', /\.message\b|String\(|\berr\b/.test("({ ok: false, code: 'internal', detail: err.message })"))
  const stepsCode = stripComments(read('lib/seed-scan/steps.ts'))
  const stepCodes = [...stepsCode.matchAll(/finished\('(?:failed|skipped)',\s*'([a-z_]+)'/g), ...stepsCode.matchAll(/fail\('([a-z_]+)'\)/g)].map((m) => m[1])
  check('every step failure is a documented stable code', stepCodes.length >= 15 && stepCodes.every((c) => (SEED_STEP_ERROR_CODES as readonly string[]).includes(c)), stepCodes.join(','))

  console.log('\nG3) every site request of a1 is pinned to the project host')
  const pinOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const out: string[] = []
    // The injected network is only ever the base of a pinned fetch, and every
    // pinned fetch is built over it.
    const rawUses = [...code.matchAll(/\bdeps\.fetchImpl\b/g)].length
    const asBase = [...code.matchAll(/hostPinnedFetch\(\{[^{}]*\bbase:\s*deps\.fetchImpl\b/g)].length
    const pinCalls = [...code.matchAll(/hostPinnedFetch\(\{/g)].length
    if (asBase === 0) out.push('no hostPinnedFetch over deps.fetchImpl')
    if (rawUses !== asBase) out.push(`deps.fetchImpl used ${rawUses - asBase} time(s) outside hostPinnedFetch`)
    if (pinCalls !== asBase) out.push(`${pinCalls - asBase} hostPinnedFetch(es) over another network`)
    // Every page and text read is handed a pinned fetch (none means global fetch).
    const pinned = new Set([...code.matchAll(/const\s+(\w+)\s*=\s*hostPinnedFetch\(/g)].map((m) => m[1]))
    for (const call of ['deps.fetchHtml(', 'deps.fetchText(']) {
      for (const m of code.matchAll(new RegExp(call.replace(/[.(]/g, '\\$&'), 'g'))) {
        const args = chainFrom(code, (m.index as number) + call.length - 1)
        const impl = args.match(/\bfetchImpl:\s*([\w$]+\(?)/)?.[1]
        if (!impl || !(impl === 'hostPinnedFetch(' || pinned.has(impl))) out.push(`${call}…) given ${impl ?? 'no fetchImpl (global fetch)'}`)
      }
    }
    // The sitemap walk reads through a local reader built on those reads.
    for (const m of code.matchAll(/deps\.discoverSitemap\(/g)) {
      const args = chainFrom(code, (m.index as number) + 'deps.discoverSitemap'.length)
      const reader = args.match(/\bfetchText:\s*([\w$]+)/)?.[1]
      const def = reader ? new RegExp(`const\\s+${reader}\\b[^=]*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`).exec(code) : null
      const body = def ? chainFrom(code, def.index + def[0].length - 1) : ''
      if (!reader || !/deps\.fetchText\(/.test(body)) out.push(`deps.discoverSitemap(…) given ${reader ?? "the engine's own reader"}`)
    }
    if (/(^|[^\w$.])fetch\(/.test(code)) out.push('a bare fetch( call')
    return out
  }
  const steps = read('lib/seed-scan/steps.ts')
  const pins = pinOffenders(steps)
  check('every fetchHtml/fetchText/sitemap read is given a hostPinnedFetch, and the raw network is only ever its base', pins.length === 0, pins.join(' ; '))
  check('MUTATION CONTROL: handing the raw network to a companion fetch is caught',
    pinOffenders(steps.replace('{ fetchImpl: companionFetch }', '{ fetchImpl: deps.fetchImpl }')).length > 0)
  check('MUTATION CONTROL: a fetch call with no fetchImpl (global fetch) is caught',
    pinOffenders(steps.replace('deps.fetchText(url, { fetchImpl: sitemapFetch })', 'deps.fetchText(url)')).length > 0)
  check("MUTATION CONTROL: the sitemap walk left on the engine's own reader is caught",
    pinOffenders(steps.replace('{ fetchText: readSitemapText }', '{}')).length > 0)
  check('MUTATION CONTROL: a pinned fetch built over the global network is caught',
    pinOffenders(steps.replace('base: deps.fetchImpl, deadline: pageClock.signal', 'base: fetch, deadline: pageClock.signal')).length > 0)

  console.log('\nG4) one model call and three searches per run, each marked before it is made')
  const spendOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const out: string[] = []
    const modelCalls = [...code.matchAll(/\.insight\(/g)]
    if (modelCalls.length !== 1) out.push(`${modelCalls.length} model call sites`)
    const a2 = code.slice(code.indexOf('async function a2Live('), code.indexOf('async function a2Claim('))
    const mark = a2.indexOf('ctx.save({ attempted: true })')
    const guard = a2.indexOf('own.attempted === true')
    const callAt = a2.indexOf('ctx.deps.insight(')
    if (!(guard >= 0 && mark > guard && callAt > mark)) out.push('a2: the attempted mark is not saved (and checked) before the model call')
    const searchCalls = [...code.matchAll(/deps\.search\(/g)]
    if (searchCalls.length !== 1) out.push(`${searchCalls.length} search call sites`)
    const a4 = code.slice(code.indexOf('async function a4('))
    const sMark = a4.indexOf('ctx.save({ attempted: true, queries, market })')
    const sGuard = a4.indexOf('own.attempted === true')
    const sCall = a4.indexOf('Promise.all(queries.map(')
    if (!(sGuard >= 0 && sMark > sGuard && sCall > sMark)) out.push('a4: the attempted mark is not saved (and checked) before searching')
    if (!/\.slice\(0, MAX_SEARCHES\)/.test(a4) || !/export const MAX_SEARCHES = 3\b/.test(code)) out.push('a4: queries are not capped at three')
    return out
  }
  const spend = spendOffenders(steps)
  check('a2 checks, then saves, its mark before the one model call; a4 likewise before its ≤3 searches', spend.length === 0, spend.join(' ; '))
  check('MUTATION CONTROL: saving the mark after the model call is caught',
    spendOffenders(steps.replace('if (!(await ctx.save({ attempted: true }))) return ABORT\n', '').replace("if (answer.kind === 'timeout')", "if (!(await ctx.save({ attempted: true }))) return ABORT\n    if (answer.kind === 'timeout')")).length > 0)
  check('MUTATION CONTROL: a fourth search is caught', spendOffenders(steps.replace('export const MAX_SEARCHES = 3', 'export const MAX_SEARCHES = 4')).length > 0)
  check('MUTATION CONTROL: a second model call site is caught', spendOffenders(`${steps}\nconst again = () => ctx.deps.insight(signals, 'he', 'x')`).length > 0)

  console.log('\nG5) POST checks in order; a claim token is redeemed last')
  const orderOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const post = code.slice(code.indexOf('export async function handleSeedPost('), code.indexOf('export function seedRunView('))
    const at = (s: string) => post.indexOf(s)
    // First occurrences: a call made early anywhere in POST puts it out of order.
    const order = ['gate(', 'readBody(', 'deps.access(', 'checkSeedCaps(', 'deps.consumeClaim(', 'createSeedRun(', 'deps.schedule(']
    const positions = order.map(at)
    const out: string[] = []
    if (positions.some((p) => p < 0)) out.push(`missing: ${order.filter((_, i) => positions[i] < 0).join(', ')}`)
    else if (positions.some((p, i) => i > 0 && p < positions[i - 1])) out.push(`out of order: ${positions.join(',')}`)
    for (const once of ['deps.consumeClaim(', 'createSeedRun(', 'deps.schedule(']) {
      const n = post.split(once).length - 1
      if (n !== 1) out.push(`${once}…) appears ${n} times`)
    }
    const g = code.slice(code.indexOf('async function gate('), code.indexOf('type PostBody'))
    const gOrder = ['deps.session()', "refuse(401, 'unauthorized')", 'readOwnProject(session.db', 'ENABLE_SEED_SCAN', 'deps.isAdmin(']
    const gPos = gOrder.map((s) => g.indexOf(s))
    if (gPos.some((p, i) => p < 0 || (i > 0 && p < gPos[i - 1]))) out.push(`gate out of order: ${gPos.join(',')}`)
    if (!/readOwnProject\(session\.db,/.test(g)) out.push('the project is not read through the session client')
    return out
  }
  const httpSrc = read('lib/seed-scan/http.ts')
  const order = orderOffenders(httpSrc)
  check('auth → own project (session client) → flag → body → entitlement → caps → claim → create → after()', order.length === 0, order.join(' ; '))
  check('MUTATION CONTROL: redeeming the token before the caps is caught',
    orderOffenders(httpSrc.replace('const caps = await checkSeedCaps(admin, scope, now, deps.env)', 'const early = await deps.consumeClaim(admin, "", now)\n    const caps = await checkSeedCaps(admin, scope, now, deps.env)')).length > 0)
  check('MUTATION CONTROL: reading the project with the service role is caught',
    orderOffenders(httpSrc.replace('readOwnProject(session.db, projectId, session.userId)', 'readOwnProject(deps.admin(), projectId, session.userId)')).length > 0)

  console.log('\nG6) the route wires the real dependencies')
  const routeOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const need: [string, RegExp][] = [
      ["runtime 'nodejs'", /export const runtime = 'nodejs'/],
      ["dynamic 'force-dynamic'", /export const dynamic = 'force-dynamic'/],
      ['maxDuration 300', /export const maxDuration = 300\b/],
      ['the session from the request cookies', /await createClient\(\)[\s\S]*?\.auth\.getUser\(\)/],
      ['the entitlement decision on the service role', /access:\s*\(admin, userId\)\s*=>\s*explainAccess\(userId, admin\)/],
      ['the admin role on the service role', /isAdmin:\s*\(admin, userId\)\s*=>\s*isAdminUser\(admin, userId\)/],
      ['the work in after()', /schedule:\s*\(task\)\s*=>\s*after\(task\)/],
      ['stage A as the work', /runStage:\s*\(args\)\s*=>\s*runStageA\(args\)/],
      ['claims through the engine', /consumeClaimToken\(token, admin, now\)/],
      ['POST → handleSeedPost', /export async function POST[\s\S]*?handleSeedPost\(request, id, liveDeps\(\)\)/],
      ['GET → handleSeedGet', /export async function GET[\s\S]*?handleSeedGet\(id, liveDeps\(\)\)/],
    ]
    const out = need.filter(([, re]) => !re.test(code)).map(([name]) => name)
    if (/explainAccess\(\s*userId\s*,\s*(supabase|db|client|userClient|sessionClient)\b/.test(code)) out.push('entitlement asked with a request-scoped client')
    return out
  }
  const route = read(ROUTE)
  const routeProblems = routeOffenders(route)
  check('runtime, maxDuration, auth, entitlement, admin role, after(), stage A, claims — all wired', routeProblems.length === 0, routeProblems.join(' ; '))
  check('MUTATION CONTROL: doing the work inside the request (no after) is caught', routeOffenders(route.replace('schedule: (task) => after(task)', 'schedule: (task) => { void task() }')).length > 0)
  check('MUTATION CONTROL: the entitlement asked with the session client is caught', routeOffenders(route.replace('explainAccess(userId, admin)', 'explainAccess(userId, db as never)')).length > 0)

  console.log('\nG7) the competitor cap is the competitors route\'s')
  const capOf = (src: string) => Number(stripComments(src).match(/const MAX_ACTIVE_COMPETITORS = (\d+)/)?.[1])
  const routeCap = capOf(read('app/api/projects/[id]/ai-visibility/competitors/route.ts'))
  const ourCap = capOf(read('lib/seed-scan/settings.ts'))
  check(`MAX_ACTIVE_COMPETITORS matches (${ourCap} = ${routeCap})`, Number.isFinite(routeCap) && ourCap === routeCap)
  check('MUTATION CONTROL: a drifted cap is caught', capOf(read('lib/seed-scan/settings.ts').replace('MAX_ACTIVE_COMPETITORS = 3', 'MAX_ACTIVE_COMPETITORS = 5')) !== routeCap)

  finish()
}

main()
export {}
