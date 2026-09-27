/**
 * Source guards for the seeding scan: structural properties that a behavioural
 * test could only sample.
 *
 *   G1  every Supabase query in lib/seed-scan names its owner (user_id; runs,
 *       steps and the crawl index are also written by project_id) — the
 *       service-role client bypasses RLS. Two named exceptions: the global
 *       daily cap, a head-only count that returns a number and never a row;
 *       and the cron's listing of stalled runs, which returns their keys (ids,
 *       owner, stage) and nothing of their content. The crawl index is read
 *       and written by project AND owner, here and in lib/content/
 *       content-index.ts; tracking_targets is never written here (the
 *       keywords tab's own action adds keywords).
 *   G2  no log line and no response carries an error's text; every code a
 *       step, the API or tracking gives is a documented stable one.
 *   G3  every site request of a1 and b1 goes through hostPinnedFetch, and
 *       every read of b1 but robots.txt itself is refused by robots.txt.
 *   G4  the model is called once, after its `attempted` mark is saved; the
 *       searches likewise, at most MAX_SEARCHES (3) of them. Stage B: every
 *       paid or counted call (Google Ads, the content engine, the question
 *       model, the rank check) has one call site, behind its step's mark,
 *       within its cap; the crawl within its page and sitemap caps.
 *   G5  POST checks in the documented order, and redeems a claim token only
 *       after every refusal is behind it. `continue` checks the run, then each
 *       keyword against the run's own, moves the run to stage B, and only
 *       then adds the keywords and schedules the work.
 *   G6  the route wires the real dependencies: its own auth, the service-role
 *       client for the entitlement decision, after() for the work, the stage
 *       runner inside its work window, and the tabs' own action and routes.
 *   G7  the three-active competitor cap is the competitors route's.
 *   G8  the cron resumes stalled runs only behind its own auth, only after the
 *       automation runner has finished and logged, only inside the isolating
 *       wrapper, and never as the merchant (no content plan, no rank check).
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
import { SEED_API_ERROR_CODES, SEED_STEP_ERROR_CODES, SEED_TRACKING_CODES } from '../types'
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

/**
 * One query. `payload` is the object literal a named write payload was built
 * from (`.insert(indexRow)` → the `const indexRow = { … }` before it), so a row
 * built apart from its query is judged by what it carries.
 */
type Chain = { file: string; table: string; text: string; fn: string; payload: string }

function payloadOf(code: string, text: string, at: number): string {
  const named = /\.(?:insert|upsert|update)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(text)
  if (!named) return ''
  const decl = [...code.slice(0, at).matchAll(new RegExp(`(?:const|let)\\s+${named[1].replace(/\$/g, '\\$')}\\b[^=;]*=\\s*\\{`, 'g'))].pop()
  return decl ? chainFrom(code, (decl.index as number) + decl[0].length - 1) : ''
}

function queryChains(file: string, src: string): Chain[] {
  const code = stripComments(src)
  const out: Chain[] = []
  for (const m of code.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
    const at = m.index as number
    const text = chainFrom(code, at)
    out.push({ file, table: m[1], text, fn: enclosingFunction(code, at), payload: payloadOf(code, text, at) })
  }
  return out
}

const GLOBAL_COUNT = /\.select\(\s*'id'\s*,\s*\{\s*count:\s*'exact',\s*head:\s*true\s*\}\s*\)/
const STALLED_KEYS = /\.select\(\s*'id, project_id, user_id, stage'\s*\)/

/** What a query says about its owner, and which of G1's two exceptions it is, if any. */
function ownerCheck(c: Chain) {
  const insertLike = /\.(insert|upsert)\(/.test(c.text)
  const mutation = insertLike || /\.(update|delete)\(/.test(c.text)
  const written = `${c.text}\n${c.payload}`
  const namesUser = insertLike ? /\buser_id\s*:/.test(written) : /\.eq\(\s*'user_id'\s*,/.test(c.text)
  const namesProject = insertLike ? /\bproject_id\s*:/.test(written) : /\.eq\(\s*'project_id'\s*,/.test(c.text)
  const exception: 'global_count' | 'stalled_keys' | null = mutation
    ? null
    : c.fn === 'countAllSeedRunsSince' && GLOBAL_COUNT.test(c.text)
      ? 'global_count'
      : c.fn === 'listStalledSeedRuns' && c.table === 'project_seed_runs' && STALLED_KEYS.test(c.text)
        ? 'stalled_keys'
        : null
  return { insertLike, mutation, namesUser, namesProject, exception }
}

/** G1 as a predicate over chains: the offenders. */
function ownerOffenders(chains: Chain[]): string[] {
  const offenders: string[] = []
  for (const c of chains) {
    const o = ownerCheck(c)
    if (o.exception) continue
    if (!o.namesUser) offenders.push(`${c.file}:${c.fn} ${c.table} — no user_id`)
    else if (o.mutation && ['project_seed_runs', 'project_seed_steps', 'site_crawl_index'].includes(c.table) && !o.namesProject) offenders.push(`${c.file}:${c.fn} ${c.table} — no project_id`)
  }
  return offenders
}

/** Every .ts/.tsx source under `dir`, suites and fixtures aside. */
function sourcesUnder(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) {
      if (e.name !== '__qa__' && e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...sourcesUnder(p))
    } else if (/\.tsx?$/.test(e.name) && !/\.qa\.ts$/.test(e.name)) out.push(p)
  }
  return out
}

/** The files whose code names `ident` (to call it, a file must name it). */
function namers(ident: string, files: Map<string, string>): string[] {
  const re = new RegExp(`\\b${ident}\\b`)
  return [...files].filter(([, code]) => re.test(code)).map(([f]) => f).sort()
}

const LIB_FILES = readdirSync(join(ROOT, 'lib/seed-scan')).filter((f) => f.endsWith('.ts')).map((f) => `lib/seed-scan/${f}`)
const ROUTE = 'app/api/projects/[id]/seed/route.ts'
const CRON = 'app/api/content/automation/cron/route.ts'
const CONTENT_INDEX = 'lib/content/content-index.ts'

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
    for (const f of [...LIB_FILES, ROUTE, CRON, CONTENT_INDEX]) {
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
  check(`found the queries (${chains.length} across ${LIB_FILES.length} files)`, chains.length >= 35, String(chains.length))
  const offenders = ownerOffenders(chains)
  check('each filters or writes user_id; runs, steps and the crawl index are also written by project_id', offenders.length === 0, offenders.join(' ; '))
  const ownerless = chains.filter((c) => !ownerCheck(c).namesUser).map((c) => `${c.fn}:${ownerCheck(c).exception ?? 'none'}`).sort()
  check('exactly two owner-less queries: the head-only global count and the keys-only listing of stalled runs',
    ownerless.join(',') === 'countAllSeedRunsSince:global_count,listStalledSeedRuns:stalled_keys', ownerless.join(','))
  check('lib/seed-scan never builds a service-role client itself (the route and the cron inject it)', LIB_FILES.every((f) => !/createAdminClient\(/.test(stripComments(read(f)))))
  const crawlChainsOf = (files: [string, string][]) => files.flatMap(([f, src]) => queryChains(f, src)).filter((c) => c.table === 'site_crawl_index')
  const crawlProblems = (list: Chain[]) => list.filter((c) => { const o = ownerCheck(c); return !o.namesUser || !o.namesProject }).map((c) => `${c.file}:${c.fn}`)
  const crawlSources: [string, string][] = [...LIB_FILES, CONTENT_INDEX].map((f) => [f, read(f)])
  const crawlChains = crawlChainsOf(crawlSources)
  check(`the crawl index is read and written by project AND owner (${crawlChains.length} queries, here and in the content index)`,
    crawlChains.length >= 3 && crawlProblems(crawlChains).length === 0, crawlProblems(crawlChains).join(' ; '))
  const trackingOffenders = (list: Chain[], trackingSrc: string): string[] => {
    const out = list.filter((c) => c.table === 'tracking_targets' && ownerCheck(c).mutation).map((c) => `${c.file}:${c.fn} writes tracking_targets`)
    if (!list.some((c) => c.table === 'tracking_targets')) out.push('no tracking_targets read (the added rows are not read back)')
    if (!/\bawait action\(form\)/.test(stripComments(trackingSrc))) out.push("the keywords tab's action is not what adds the keywords")
    return out
  }
  const trackingSrc = read('lib/seed-scan/tracking.ts')
  const tracked = trackingOffenders(chains, trackingSrc)
  check("tracking_targets is only read here; keywords are added by the keywords tab's own action", tracked.length === 0, tracked.join(' ; '))
  {
    const store = read('lib/seed-scan/store.ts')
    const broken = store.replace(/(export async function getSeedRun[\s\S]*?)\.eq\('user_id', scope\.userId\)/, '$1')
    check('MUTATION CONTROL: getSeedRun without its user_id filter is caught', broken !== store && ownerOffenders(queryChains('store.ts', broken)).some((o) => o.includes('getSeedRun')))
    const leaky = `${store}\nexport async function countAllSeedRunsSinceRows(admin: ServiceRoleClient) { return admin.from('project_seed_runs').select('id, summary') }\n`
    check('MUTATION CONTROL: a second owner-less query (returning rows) is caught', ownerOffenders(queryChains('store.ts', leaky)).length === 1)
    const wideListing = store.replace("    .select('id, project_id, user_id, stage')\n", "    .select('id, project_id, user_id, stage, summary')\n")
    check('MUTATION CONTROL: the stalled-run listing returning a run\'s content (summary) is caught',
      wideListing !== store && ownerOffenders(queryChains('store.ts', wideListing)).some((o) => o.includes('listStalledSeedRuns')))
    const otherListing = `${store}\nexport async function listLiveRunKeys(admin: ServiceRoleClient) { return admin.from('project_seed_runs').select('id, project_id, user_id, stage') }\n`
    check('MUTATION CONTROL: a keys-only listing anywhere but listStalledSeedRuns is caught', ownerOffenders(queryChains('store.ts', otherListing)).some((o) => o.includes('listLiveRunKeys')))
    const settings = read('lib/seed-scan/settings.ts')
    const brokenInsert = settings.replace(/user_id: scope\.userId,\n\s*project_id: scope\.projectId,\n\s*name: domain,/, 'project_id: scope.projectId,\n      name: domain,')
    check('MUTATION CONTROL: a competitor insert without user_id is caught', brokenInsert !== settings && ownerOffenders(queryChains('settings.ts', brokenInsert)).length === 1)
    const brokenStep = store.replace(/(export async function updateSeedStep[\s\S]*?)\.eq\('project_id', scope\.projectId\)/, '$1')
    check('MUTATION CONTROL: a step write without project_id is caught', brokenStep !== store && ownerOffenders(queryChains('store.ts', brokenStep)).some((o) => o.includes('no project_id')))
    const stepsB = read('lib/seed-scan/steps-b.ts')
    const ownerlessRow = stepsB.replace('    user_id: ctx.scope.userId,\n    site_url: origin.toString(),', '    site_url: origin.toString(),')
    const ownerlessChains = crawlChainsOf(crawlSources.map(([f, src]) => [f, f === 'lib/seed-scan/steps-b.ts' ? ownerlessRow : src]))
    check('MUTATION CONTROL: a crawl-index row written without user_id (its payload built apart) is caught',
      ownerlessRow !== stepsB && ownerOffenders(queryChains('steps-b.ts', ownerlessRow)).length === 1 && crawlProblems(ownerlessChains).length === 1)
    const contentIndex = read(CONTENT_INDEX)
    const foreignRead = contentIndex.replace("      .eq('user_id', userId)\n", '')
    check('MUTATION CONTROL: the content index reading the crawl by project alone is caught',
      foreignRead !== contentIndex && crawlProblems(crawlChainsOf(crawlSources.map(([f, src]) => [f, f === CONTENT_INDEX ? foreignRead : src]))).length === 1)
    const directInsert = trackingSrc.replace('    await action(form)\n', "    await admin.from('tracking_targets').insert(fresh.map((keyword) => ({ project_id: scope.projectId, user_id: scope.userId, keyword })))\n")
    check('MUTATION CONTROL: tracking keywords by inserting them directly (not through the tab\'s action) is caught',
      directInsert !== trackingSrc && trackingOffenders(queryChains('tracking.ts', directInsert), directInsert).length === 2)
  }

  console.log('\nG2) no error text in a log line or a response; every code a documented one')
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
  const logs = [...LIB_FILES, ROUTE, CONTENT_INDEX].flatMap((f) => logOffenders(f, read(f)))
  check('no console call in lib/seed-scan, the route or the content index carries an error or its text', logs.length === 0, logs.join(' ; '))
  check('MUTATION CONTROL: `{ message: err.message }` in a log is caught', logOffenders('x', "console.error('[seed-scan] x', { runId, message: err.message })").length === 1)
  check('MUTATION CONTROL: logging the raw error object is caught', logOffenders('x', "console.error('[seed-scan] x', err)").length === 1)
  check('MUTATION CONTROL: `String(err)` as a resume outcome in the tick line is caught',
    logOffenders('resume.ts', read('lib/seed-scan/resume.ts').replace("console.log('[seed-resume] tick', { found: stalled.length, runs: runs.map(brief), deferred })", "console.log('[seed-resume] tick', { found: stalled.length, runs: runs.map(brief), deferred, last: String(runs[0]) })")).length === 1)
  const http = stripComments(read('lib/seed-scan/http.ts'))
  const codes = [...http.matchAll(/refuse\(\s*\d{3}\s*,\s*'([a-z_]+)'/g)].map((m) => m[1])
  check('every refusal the API gives is a documented stable code', codes.length >= 10 && codes.every((c) => (SEED_API_ERROR_CODES as readonly string[]).includes(c)), codes.filter((c) => !(SEED_API_ERROR_CODES as readonly string[]).includes(c)).join(','))
  const responses = [...http.matchAll(/Response\.json\(/g)].map((m) => chainFrom(http, (m.index as number) + 'Response.json'.length))
  check('no response body is built from an error', responses.length >= 3 && responses.every((r) => !/\.message\b|String\(|\berr\b/.test(r)))
  check('MUTATION CONTROL: a response built from an error is caught', /\.message\b|String\(|\berr\b/.test("({ ok: false, code: 'internal', detail: err.message })"))
  // A step's code, wherever it is written: finished(…, 'x'), fail('x'), a
  // `code:` or `errorCode:` literal, or a mapping function's `return 'x_y'`.
  const stepCodesOf = (src: string): string[] => {
    const code = stripComments(src)
    const patterns = [
      /finished\('(?:failed|skipped)',\s*'([a-z_]+)'/g,
      /\bfail\('([a-z_]+)'\)/g,
      /\bcode:\s*'([a-z_]+)'/g,
      /\berrorCode:\s*'([a-z_]+)'/g,
      /\breturn\s+'([a-z]+_[a-z_]+)'/g,
    ]
    return patterns.flatMap((re) => [...code.matchAll(re)].map((m) => m[1]))
  }
  const STEP_SOURCES = ['lib/seed-scan/steps.ts', 'lib/seed-scan/steps-b.ts', 'lib/seed-scan/runner.ts']
  const undocumented = (list: string[], documented: readonly string[]) => [...new Set(list)].filter((c) => !documented.includes(c))
  const stepCodes = STEP_SOURCES.flatMap((f) => stepCodesOf(read(f)))
  const distinctStepCodes = new Set(stepCodes).size
  check(`every code a step or the runner writes is a documented stable code (${stepCodes.length} sites, ${distinctStepCodes} codes)`,
    distinctStepCodes >= 50 && undocumented(stepCodes, SEED_STEP_ERROR_CODES).length === 0, undocumented(stepCodes, SEED_STEP_ERROR_CODES).join(','))
  const renamed = STEP_SOURCES.flatMap((f) => stepCodesOf(f.endsWith('steps-b.ts') ? read(f).replace("fail('crawl_interrupted')", "fail('crawl_restarted')") : read(f)))
  check('MUTATION CONTROL: a step code missing from the list is caught', undocumented(renamed, SEED_STEP_ERROR_CODES).join(',') === 'crawl_restarted')
  const trackingCodesOf = (src: string): string[] => {
    const code = stripComments(src)
    return [
      ...[...code.matchAll(/\boutcome\(\s*[^,()]+\s*,\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bcode:\s*'((?:keyword|no_keywords)[a-z_]*)'/g)].map((m) => m[1]),
    ]
  }
  const trackingCodes = ['lib/seed-scan/tracking.ts', 'lib/seed-scan/http.ts'].flatMap((f) => trackingCodesOf(read(f)))
  check(`every tracking outcome is a documented stable code (${new Set(trackingCodes).size} codes)`,
    new Set(trackingCodes).size === SEED_TRACKING_CODES.length && undocumented(trackingCodes, SEED_TRACKING_CODES).length === 0, undocumented(trackingCodes, SEED_TRACKING_CODES).join(','))
  check('MUTATION CONTROL: a tracking code missing from the list is caught',
    undocumented(trackingCodesOf(trackingSrc.replace("'keywords_already_tracked'", "'keywords_tracked_before'")), SEED_TRACKING_CODES).join(',') === 'keywords_tracked_before')

  console.log('\nG3) every site request of a1 and b1 is pinned to the project host; b1 asks robots.txt first')
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
  check('a1: every fetchHtml/fetchText/sitemap read is given a hostPinnedFetch, and the raw network is only ever its base', pins.length === 0, pins.join(' ; '))
  check('MUTATION CONTROL: handing the raw network to a companion fetch is caught',
    pinOffenders(steps.replace('{ fetchImpl: companionFetch }', '{ fetchImpl: deps.fetchImpl }')).length > 0)
  check('MUTATION CONTROL: a fetch call with no fetchImpl (global fetch) is caught',
    pinOffenders(steps.replace('deps.fetchText(url, { fetchImpl: sitemapFetch })', 'deps.fetchText(url)')).length > 0)
  check("MUTATION CONTROL: the sitemap walk left on the engine's own reader is caught",
    pinOffenders(steps.replace('{ fetchText: readSitemapText }', '{}')).length > 0)
  check('MUTATION CONTROL: a pinned fetch built over the global network is caught',
    pinOffenders(steps.replace('base: deps.fetchImpl, deadline: pageClock.signal', 'base: fetch, deadline: pageClock.signal')).length > 0)
  // b1: robots.txt is read first, through its own pinned fetch and for nothing
  // else; every other pinned fetch refuses what robots.txt disallows (redirect
  // hops included, inside hostPinnedFetch), and the key pages are chosen under it.
  const robotsOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const b1 = code.slice(code.indexOf('async function b1('), code.indexOf('export function ideasMarket('))
    if (b1.length < 200) return ['b1 not found']
    const out: string[] = []
    const pinned = [...b1.matchAll(/const\s+(\w+)\s*=\s*hostPinnedFetch\(/g)].map((m) => ({ name: m[1], args: chainFrom(b1, (m.index as number) + m[0].length - 1) }))
    if (pinned.length < 3 || !pinned.some((p) => p.name === 'robotsFetch')) out.push(`pinned fetches: ${pinned.map((p) => p.name).join(',')}`)
    for (const p of pinned) {
      if (p.name !== 'robotsFetch' && !/[{,]\s*allow\s*(?:[,}]|:\s*allow\b)/.test(p.args)) out.push(`${p.name} is not refused by robots.txt (no allow)`)
    }
    if ([...b1.matchAll(/\brobotsFetch\b/g)].length !== 2 || !/deps\.fetchText\(new URL\('\/robots\.txt', \w+\), \{ fetchImpl: robotsFetch \}\)/.test(b1)) out.push('robotsFetch reads something other than robots.txt')
    if (!/const allow = \(url: URL\) => robotsAllows\(rules, url\)/.test(b1)) out.push('allow is not the parsed robots.txt')
    if (!/if \(!allow\(homeUrl\)\) return finished\('skipped', 'crawl_disallowed'/.test(b1)) out.push('the home page is not checked against robots.txt')
    if (!/selectKeyPages\(\{[^}]*\brobots: rules\b/.test(b1)) out.push('the key pages are not chosen under robots.txt')
    return out
  }
  const stepsB = read('lib/seed-scan/steps-b.ts')
  const pinsB = pinOffenders(stepsB)
  check('b1: every page, robots.txt and sitemap read is given a hostPinnedFetch over the raw network', pinsB.length === 0, pinsB.join(' ; '))
  const robots = robotsOffenders(stepsB)
  check('b1: robots.txt first; every other read refused by it; the key pages chosen under it', robots.length === 0, robots.join(' ; '))
  check('MUTATION CONTROL: a page read not refused by robots.txt is caught',
    robotsOffenders(stepsB.replace('      offHost: { hit: false },\n      allow,\n    })', '      offHost: { hit: false },\n    })')).some((o) => o.startsWith('pageFetch')))
  check('MUTATION CONTROL: a sitemap read not refused by robots.txt is caught',
    robotsOffenders(stepsB.replace('offHost: { hit: false }, allow })', 'offHost: { hit: false } })')).some((o) => o.startsWith('sitemapFetch')))
  check('MUTATION CONTROL: allow that lets everything through is caught',
    robotsOffenders(stepsB.replace('const allow = (url: URL) => robotsAllows(rules, url)', "const allow = (url: URL) => url.protocol !== ''")).length === 1)
  check('MUTATION CONTROL: key pages chosen without robots.txt are caught', robotsOffenders(stepsB.replace('    robots: rules,\n', '')).length === 1)
  check('MUTATION CONTROL: robots.txt read over the raw network is caught',
    pinOffenders(stepsB.replace('{ fetchImpl: robotsFetch }', '{ fetchImpl: deps.fetchImpl }')).length > 0 && robotsOffenders(stepsB.replace('{ fetchImpl: robotsFetch }', '{ fetchImpl: deps.fetchImpl }')).length > 0)

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

  console.log('\nG4b) stage B: every paid or counted call has one call site, behind its mark, within its cap')
  const spendOffendersB = (src: string, crawlSrc: string): string[] => {
    const code = stripComments(src)
    const out: string[] = []
    const slice = (from: string, to: string) => {
      const a = code.indexOf(from)
      const b = code.indexOf(to, a + 1)
      return a >= 0 && b > a ? code.slice(a, b) : ''
    }
    // Each mark in `marks` appears in `body`, in this order.
    const inOrder = (where: string, body: string, marks: string[]) => {
      let at = -1
      for (const m of marks) {
        const next = body.indexOf(m, at + 1)
        if (next < 0) {
          out.push(`${where}: ${m} missing or out of order`)
          return
        }
        at = next
      }
    }
    for (const [what, re] of [
      ['Google Ads', /\.keywordIdeas!?\s*\(/g],
      ['the question model', /\.questions!?\s*\(/g],
      ['the content engine', /\bcontentPlan!?\s*\(/g],
      ['the rank check', /\brankCheck!?\s*\(/g],
    ] as const) {
      const n = [...code.matchAll(re)].length
      if (n !== 1) out.push(`${what}: ${n} call sites`)
    }
    if (code.split('ideasOnce(').length - 1 !== 2) out.push('ideasOnce is called from more than runIdeas')
    // b1: the page reads are spent once the mark is saved; nothing is read before it.
    const b1 = slice('async function b1(', 'export function ideasMarket(')
    inOrder('b1', b1, ['own.attempted === true', 'ctx.save({ attempted: true })', 'hostPinnedFetch(', 'readRobots(homeUrl)', 'readPage(homeUrl', 'deps.discoverSitemap('])
    const firstRead = Math.min(...['deps.fetchText(', 'deps.fetchHtml(', 'deps.discoverSitemap(', 'hostPinnedFetch('].map((s) => b1.indexOf(s)).filter((p) => p >= 0))
    if (!(b1.indexOf('ctx.save({ attempted: true })') >= 0 && b1.indexOf('ctx.save({ attempted: true })') < firstRead)) out.push('b1: a site read before the mark')
    // b2 and b3: at most MAX_IDEA_CALLS seeds each; the mark before the calls.
    const ideas = slice('async function runIdeas(', 'function dedupeIdeas(')
    inOrder('runIdeas', ideas, ['planned.slice(0, MAX_IDEA_CALLS)', 'own.attempted === true', 'ctx.save({ attempted: true, market, planned:', 'ideasOnce(deps, seeds[i].input)'])
    if (!/export const MAX_IDEA_CALLS = 3\b/.test(code)) out.push('MAX_IDEA_CALLS is not 3 (six Google Ads calls per run at most)')
    if (!/export const MAX_COMPETITOR_SEEDS = 3\b/.test(code) || !/\.filter\(\(c\) => c\.validated\)\.slice\(0, MAX_COMPETITOR_SEEDS\)/.test(slice('async function b3(', 'type ContentVerdict'))) out.push('b3: competitors are not capped')
    inOrder('b4', slice('async function b4(', 'type QuestionProject'), ['own.attempted === true', 'ctx.save({ attempted: true })', 'contentPlan({'])
    inOrder('b5', slice('async function b5(', 'type RankFailure'), ['own.attempted === true', 'ctx.save({ attempted: true })', 'deps.questions({'])
    inOrder('b6', slice('async function b6(', 'export const STAGE_B_EXECUTORS'), ['own.attempted === true', 'ctx.save({ ...base, attempted: true, checks })', 'rankCheck({'])
    // The crawl's caps: sitemap documents counted before each read; key pages
    // chosen within MAX_KEY_PAGES, the home page's read counted in.
    inOrder('sitemap', slice('const readSitemapText', 'deps.discoverSitemap('), ['if (counts.sitemapDocs >= MAX_SITEMAP_DOCS) return', 'counts.sitemapDocs++', 'deps.fetchText(url, { fetchImpl: sitemapFetch })'])
    if (!/export const MAX_SITEMAP_DOCS = 6\b/.test(code)) out.push('MAX_SITEMAP_DOCS is not 6')
    if (!/limit: MAX_KEY_PAGES - counts\.pagesRead\b/.test(b1)) out.push('b1: key pages are not chosen within MAX_KEY_PAGES')
    if (!/export const MAX_KEY_PAGES = 25\b/.test(stripComments(crawlSrc))) out.push('MAX_KEY_PAGES is not 25')
    return out
  }
  const crawlSrc = read('lib/seed-scan/crawl.ts')
  const spendB = spendOffendersB(stepsB, crawlSrc)
  check('b1-b6: one call site each, each behind its step\'s mark; ≤3 Ads calls per step; ≤25 pages, ≤6 sitemap documents', spendB.length === 0, spendB.join(' ; '))
  check('MUTATION CONTROL: asking the content engine before the mark is saved is caught',
    spendOffendersB(stepsB.replace('  if (!(await ctx.save({ attempted: true }))) return ABORT\n\n  const answer = await settleWithin(() => contentPlan(', '  const answer = await settleWithin(() => contentPlan('), crawlSrc).some((o) => o.startsWith('b4')))
  check('MUTATION CONTROL: resuming b2/b3 without the spent-calls check is caught',
    spendOffendersB(stepsB.replace('if (own.attempted === true) {\n      // Resumed after the calls were sent', "if (own.attempted === 'never') {\n      // Resumed after the calls were sent"), crawlSrc).some((o) => o.startsWith('runIdeas')))
  check('MUTATION CONTROL: a fourth Google Ads call per step is caught', spendOffendersB(stepsB.replace('export const MAX_IDEA_CALLS = 3', 'export const MAX_IDEA_CALLS = 4'), crawlSrc).length === 1)
  check('MUTATION CONTROL: a second question-model call site is caught',
    spendOffendersB(`${stepsB}\nconst again = (deps: StageBDeps) => deps.questions({} as QuestionsInput)\n`, crawlSrc).some((o) => o.startsWith('the question model')))
  check('MUTATION CONTROL: an uncapped sitemap walk is caught',
    spendOffendersB(stepsB.replace("    if (counts.sitemapDocs >= MAX_SITEMAP_DOCS) return { ok: false as const, reason: 'network' as const }\n", ''), crawlSrc).some((o) => o.startsWith('sitemap')))
  check('MUTATION CONTROL: a 26th key page is caught', spendOffendersB(stepsB, crawlSrc.replace('export const MAX_KEY_PAGES = 25', 'export const MAX_KEY_PAGES = 26')).length === 1)

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
  // `continue`: after the same gate and entitlement, before the caps (it
  // starts no new run); then the run, the keywords, the move, the add.
  const continueOffenders = (src: string): string[] => {
    const code = stripComments(src)
    const out: string[] = []
    const post = code.slice(code.indexOf('export async function handleSeedPost('), code.indexOf('export function seedRunView('))
    const route = ['deps.access(', "if (body.action === 'continue') return handleSeedContinue(", 'checkSeedCaps('].map((s) => post.indexOf(s))
    if (route.some((p, i) => p < 0 || (i > 0 && p < route[i - 1]))) out.push(`continue is not reached after the entitlement and before the caps: ${route.join(',')}`)
    const cont = code.slice(Math.max(0, code.indexOf('async function handleSeedContinue(')))
    const steps = ['getLatestSeedRun(admin, scope)', "refuse(409, 'not_continuable')", "refuse(409, 'stage_b_started')", "refuse(400, 'invalid_request')", 'startSeedStageB(', 'deps.addKeywords(', "updateSeedStep(admin, scope, runId, 'b6'", 'deps.schedule(']
    const positions = steps.map((s) => cont.indexOf(s))
    if (positions.some((p) => p < 0)) out.push(`missing: ${steps.filter((_, i) => positions[i] < 0).join(', ')}`)
    else if (positions.some((p, i) => i > 0 && p < positions[i - 1])) out.push(`out of order: ${positions.join(',')}`)
    for (const once of ['startSeedStageB(', 'deps.addKeywords(', 'deps.schedule(']) {
      const n = cont.split(once).length - 1
      if (n !== 1) out.push(`${once}…) appears ${n} times`)
    }
    if (!/new Map\(\(readSummary\(run\.summary\)\?\.seedKeywords \?\? \[\]\)/.test(cont)) out.push("the keywords are not checked against the run's own seed keywords")
    if (!/const seed = seeds\.get\(keywordKey\(k\)\)\s*if \(!seed\) return refuse\(400, 'invalid_request'\)\s*keywords\.push\(seed\)/.test(cont)) out.push('a keyword that is not a seed keyword gets through')
    if (!/deps\.addKeywords\(\{ admin, scope, keywords, targetDomain: ctx\.targetDomain \}\)/.test(cont)) out.push('addKeywords is not given the checked keywords')
    if (!/v\.length > MAX_CONTINUE_KEYWORDS\) return null/.test(code)) out.push('more than MAX_CONTINUE_KEYWORDS keywords are read')
    return out
  }
  const cont = continueOffenders(httpSrc)
  check('continue: gate → entitlement → run (409s) → own seed keywords (400) → move to stage B → add → b6 targets → after()', cont.length === 0, cont.join(' ; '))
  check('MUTATION CONTROL: adding the keywords before the run is moved to stage B is caught',
    continueOffenders(httpSrc.replace('  const now = deps.now()\n  const started = await startSeedStageB(admin, scope, run, now)', '  const early = await deps.addKeywords({ admin, scope, keywords, targetDomain: ctx.targetDomain })\n  const now = deps.now()\n  const started = await startSeedStageB(admin, scope, run, now)')).length > 0)
  check('MUTATION CONTROL: tracking the keyword as sent (not the seed keyword it matched) is caught',
    continueOffenders(httpSrc.replace('keywords.push(seed)', 'keywords.push(k)')).length === 1)
  check('MUTATION CONTROL: continue behind the caps (a finished stage A would be "too soon") is caught',
    continueOffenders(httpSrc.replace("    if (body.action === 'continue') return handleSeedContinue(body, { admin, scope, targetDomain: project.target_domain }, deps)\n", '').replace('    const caps = await checkSeedCaps(admin, scope, now, deps.env)\n', "    const caps = await checkSeedCaps(admin, scope, now, deps.env)\n    if (body.action === 'continue') return handleSeedContinue(body, { admin, scope, targetDomain: project.target_domain }, deps)\n")).length === 1)

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
      ['the stage runner as the work, inside the work window', /runStage:\s*\(args\)\s*=>\s*runSeedStage\(\{\s*\.\.\.args,\s*deadlineAt:\s*requestStartedAt \+ WORK_WINDOW_MS,/],
      ["b4: the content tab's own route, in-process", /contentPlan:\s*\(input\)\s*=>\s*callRouteInProcess\(recommendationsPost, '\/api\/content\/automation\/recommendations',/],
      ["b6: the keywords tab's own scan route, in-process", /rankCheck:\s*\(input\)\s*=>\s*callRouteInProcess\(scanPost, '\/api\/scan',/],
      ["continue: the keywords tab's own action", /addKeywords:\s*\([^)]*\)\s*=>\s*addSeedKeywords\(admin, scope, \{ keywords, targetDomain \}, createBulkTrackingTargetsAction\)/],
      ['those routes and that action, imported', /import \{ createBulkTrackingTargetsAction \} from '@\/app\/actions\/tracking-targets'[\s\S]*import \{ POST as recommendationsPost \} from '@\/app\/api\/content\/automation\/recommendations\/route'[\s\S]*import \{ POST as scanPost \} from '@\/app\/api\/scan\/route'/],
      ['claims through the engine', /consumeClaimToken\(token, admin, now\)/],
      ['POST → handleSeedPost', /export async function POST[\s\S]*?handleSeedPost\(request, id, liveDeps\(\)\)/],
      ['GET → handleSeedGet', /export async function GET[\s\S]*?handleSeedGet\(id, liveDeps\(\)\)/],
    ]
    const out = need.filter(([, re]) => !re.test(code)).map(([name]) => name)
    if (/explainAccess\(\s*userId\s*,\s*(supabase|db|client|userClient|sessionClient)\b/.test(code)) out.push('entitlement asked with a request-scoped client')
    const windowMs = Number(code.match(/const WORK_WINDOW_MS = ([\d_]+)/)?.[1].replace(/_/g, ''))
    if (!(windowMs > 0 && windowMs < 300_000)) out.push('the work window is not inside maxDuration')
    return out
  }
  const route = read(ROUTE)
  const routeProblems = routeOffenders(route)
  check("runtime, maxDuration, auth, entitlement, admin role, after(), the stage runner, the tabs' own action and routes, claims — all wired", routeProblems.length === 0, routeProblems.join(' ; '))
  check('MUTATION CONTROL: doing the work inside the request (no after) is caught', routeOffenders(route.replace('schedule: (task) => after(task)', 'schedule: (task) => { void task() }')).length > 0)
  check('MUTATION CONTROL: the entitlement asked with the session client is caught', routeOffenders(route.replace('explainAccess(userId, admin)', 'explainAccess(userId, db as never)')).length > 0)
  check('MUTATION CONTROL: a rank check that is not the scan route is caught',
    routeOffenders(route.replace("rankCheck: (input) => callRouteInProcess(scanPost, '/api/scan', { projectId: input.projectId, targetId: input.targetId }),", 'rankCheck: async () => ({ status: 200, body: {} }),')).length === 1)

  console.log('\nG7) the competitor cap is the competitors route\'s')
  const capOf = (src: string) => Number(stripComments(src).match(/const MAX_ACTIVE_COMPETITORS = (\d+)/)?.[1])
  const routeCap = capOf(read('app/api/projects/[id]/ai-visibility/competitors/route.ts'))
  const ourCap = capOf(read('lib/seed-scan/settings.ts'))
  check(`MAX_ACTIVE_COMPETITORS matches (${ourCap} = ${routeCap})`, Number.isFinite(routeCap) && ourCap === routeCap)
  check('MUTATION CONTROL: a drifted cap is caught', capOf(read('lib/seed-scan/settings.ts').replace('MAX_ACTIVE_COMPETITORS = 3', 'MAX_ACTIVE_COMPETITORS = 5')) !== routeCap)

  console.log('\nG8) the cron resumes stalled runs behind its auth, after the runner, isolated, never as the merchant')
  const cronOffenders = (cronSrc: string, resumeSrc: string): string[] => {
    const code = stripComments(cronSrc)
    const out: string[] = []
    const handle = code.slice(Math.max(0, code.indexOf('async function handle(')))
    const auth = handle.indexOf("const denied = authorizeCronRequest(request, 'automation-cron')")
    const refused = handle.indexOf('if (denied) return denied')
    const afterAt = handle.indexOf('after(async () => {')
    if (!(auth >= 0 && refused > auth && afterAt > refused)) out.push('the work is scheduled before the cron secret is checked')
    const body = afterAt >= 0 ? chainFrom(handle, afterAt + 'after'.length) : ''
    const tryAt = body.indexOf('try {')
    const runAt = body.indexOf('await runAutomation(')
    const logAt = body.indexOf("console.log('[automation-cron] run complete', { startedAt, poolsChecked: summary.poolsChecked, published: summary.published, generated: summary.generated, staleRecovered: summary.staleRecovered, failures: summary.failures, durationMs: summary.durationMs })")
    const catchAt = body.indexOf('} catch (e) {')
    if (!(tryAt >= 0 && runAt > tryAt && logAt > runAt && catchAt > logAt)) out.push("the runner's try, run and log line are not as before")
    const catchEnd = catchAt >= 0 ? catchAt + '} catch (e) '.length + chainFrom(body, catchAt + '} catch (e) '.length).length : -1
    const resumeAt = body.indexOf('await startIsolatedSeedResume(')
    if (!(resumeAt > catchEnd && catchEnd > 0)) out.push('the resume does not start after the runner has finished and logged')
    const wrapper = resumeAt >= 0 ? chainFrom(body, resumeAt + 'await startIsolatedSeedResume'.length) : ''
    if (code.split('resumeStalledSeedRuns(').length - 1 !== 1 || !wrapper.includes('resumeStalledSeedRuns(createAdminClient(), { env: process.env, deadlineAt })')) out.push('resumeStalledSeedRuns is called outside the isolating wrapper')
    if (!/\{ startedAtMs: Date\.parse\(startedAt\), maxDurationMs: maxDuration \* 1000 \}/.test(wrapper)) out.push("the resume's window is not the cron's own maxDuration")
    const resume = stripComments(resumeSrc)
    const fn = resume.slice(Math.max(0, resume.indexOf('export async function resumeStalledSeedRuns(')))
    const flagAt = fn.indexOf("if (options.env.ENABLE_SEED_SCAN !== 'true') return { state: 'disabled' }")
    if (!(flagAt >= 0 && fn.indexOf('listStalledSeedRuns(') > flagAt)) out.push('the resume reads runs while the seeding scan is off')
    if (!fn.includes('stageB: { ...options.stageB, now, contentPlan: null, rankCheck: null }')) out.push('the resume may act as the merchant (content plan, rank check)')
    if (!/\bquiet: true\b/.test(fn)) out.push('the resume logs per step')
    if (!/export const MAX_RUNS_PER_TICK = 2\b/.test(resume) || !fn.includes('Math.min(options.maxRuns ?? MAX_RUNS_PER_TICK, MAX_RUNS_PER_TICK)')) out.push('more than two runs a tick')
    return out
  }
  const cronSrc = read(CRON)
  const resumeSrc = read('lib/seed-scan/resume.ts')
  const cron = cronOffenders(cronSrc, resumeSrc)
  check('auth → after() → runner (try, run, log, catch) → then the isolated resume; flag first; b4 and b6 off; ≤2 runs', cron.length === 0, cron.join(' ; '))
  const RESUME_BLOCK = "    // After the runner, never before or around it; resolves whatever the resume does.\n    await startIsolatedSeedResume(\n      (deadlineAt) => resumeStalledSeedRuns(createAdminClient(), { env: process.env, deadlineAt }),\n      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },\n    )\n"
  const withoutResume = cronSrc.replace(RESUME_BLOCK, '')
  check('MUTATION CONTROL: the resume before the runner is caught',
    withoutResume !== cronSrc && cronOffenders(withoutResume.replace('  after(async () => {\n', `  after(async () => {\n${RESUME_BLOCK}`), resumeSrc).length === 1)
  check('MUTATION CONTROL: the resume inside the runner\'s try, before its log line, is caught',
    cronOffenders(withoutResume.replace('      const summary = await runAutomation(createAdminClient(), {})\n', `      const summary = await runAutomation(createAdminClient(), {})\n${RESUME_BLOCK}`), resumeSrc).length === 1)
  check('MUTATION CONTROL: the resume called directly, without the isolating wrapper, is caught',
    cronOffenders(cronSrc.replace(RESUME_BLOCK, '    await resumeStalledSeedRuns(createAdminClient(), { env: process.env })\n'), resumeSrc).length > 0)
  check('MUTATION CONTROL: the work scheduled without the cron secret is caught',
    cronOffenders(cronSrc.replace("  const denied = authorizeCronRequest(request, 'automation-cron')\n  if (denied) return denied\n", ''), resumeSrc).length === 1)
  check('MUTATION CONTROL: a resume that may ask the content engine as the merchant is caught',
    cronOffenders(cronSrc, resumeSrc.replace('now, contentPlan: null, rankCheck: null }', 'now, rankCheck: null }')).length === 1)
  check('MUTATION CONTROL: a resume that runs with the seeding scan off is caught',
    cronOffenders(cronSrc, resumeSrc.replace("  if (options.env.ENABLE_SEED_SCAN !== 'true') return { state: 'disabled' }\n", '')).length === 1)
  // Nothing else continues runs: the cron is the only caller of the resume,
  // and the resume the only caller of the runner's resume entry point.
  const everything = new Map([...sourcesUnder('app'), ...sourcesUnder('lib')].map((f) => [f, stripComments(read(f))] as [string, string]))
  const resumers = namers('resumeStalledSeedRuns', everything)
  const runResumers = namers('resumeSeedRun', everything)
  check(`only the cron resumes runs (${everything.size} sources)`,
    resumers.join(',') === `${CRON},lib/seed-scan/resume.ts` && runResumers.join(',') === 'lib/seed-scan/resume.ts,lib/seed-scan/runner.ts', `${resumers.join(',')} | ${runResumers.join(',')}`)
  const withOther = new Map(everything).set('app/api/other/route.ts', "import { resumeStalledSeedRuns } from '@/lib/seed-scan/resume'\nresumeStalledSeedRuns(admin, { env })")
  check('MUTATION CONTROL: another route resuming runs is caught', namers('resumeStalledSeedRuns', withOther).length === 3)

  finish()
}

main()
export {}
