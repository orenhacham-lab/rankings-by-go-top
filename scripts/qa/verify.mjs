#!/usr/bin/env node
/**
 * One-command verification with a SHORT report.
 *
 *   node scripts/qa/verify.mjs            # tsc + lint-on-touched-lines + every *.qa.ts
 *   node scripts/qa/verify.mjs --quick    # tsc + lint only
 *   node scripts/qa/verify.mjs --only lib/shopify   # QA suites under a path
 *
 * Why it exists: running the same checks by hand printed thousands of lines per
 * run (every suite's full output), and every failure then had to be re-checked
 * against origin/main by hand. This prints only what needs attention:
 *   - tsc error count (+ the first few outside the baseline)
 *   - ESLint findings on lines this branch touches vs origin/main
 *   - QA suites that fail, each classified PRE-EXISTING (same result on
 *     origin/main, run automatically in a cached worktree) or NEW
 * Full per-suite logs go to $QA_LOG_DIR (default /tmp/qa-logs); the report
 * prints the path so a failure can be read on demand.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readdirSync, symlinkSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const args = process.argv.slice(2)
const QUICK = args.includes('--quick')
const onlyIdx = args.indexOf('--only')
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null
const LOG_DIR = process.env.QA_LOG_DIR || '/tmp/qa-logs'
const CONCURRENCY = Number(process.env.QA_CONCURRENCY || 4)
const SUITE_TIMEOUT_MS = 180_000
mkdirSync(LOG_DIR, { recursive: true })

const sh = (cmd, a, opts = {}) => {
  try { return { code: 0, out: execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts }) } }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } }
}
const lines = []
const say = (s) => { lines.push(s); console.log(s) }

// ── 1. TypeScript ────────────────────────────────────────────────────────────
{
  const r = sh('npx', ['tsc', '--noEmit'])
  const errs = r.out.split('\n').filter((l) => /error TS\d+/.test(l))
  writeFileSync(join(LOG_DIR, 'tsc.log'), r.out)
  say(`tsc: ${errs.length} error(s)${errs.length ? ` — first: ${errs.slice(0, 3).join(' | ')}` : ''}`)
}

// ── 2. ESLint, only on lines this branch touches ─────────────────────────────
{
  sh('git', ['fetch', '-q', 'origin', 'main'])
  const tracked = sh('git', ['diff', '--name-only', 'origin/main', '--', '*.ts', '*.tsx', '*.js', '*.mjs']).out.split('\n')
  const untracked = sh('git', ['ls-files', '--others', '--exclude-standard', '--', '*.ts', '*.tsx', '*.js', '*.mjs']).out.split('\n')
  const files = [...new Set([...tracked, ...untracked])].filter((f) => f && existsSync(join(ROOT, f)))
  if (files.length === 0) {
    say('eslint (touched lines): no changed JS/TS files')
  } else {
    const diff = sh('git', ['diff', '-U0', 'origin/main', '--', ...files]).out
    const ranges = {}
    // An untracked file is new in its entirety.
    for (const f of untracked) if (f && existsSync(join(ROOT, f))) ranges[f] = [[1, Number.MAX_SAFE_INTEGER]]
    let cur = null
    for (const l of diff.split('\n')) {
      if (l.startsWith('+++ b/')) cur = l.slice(6)
      else if (l.startsWith('@@') && cur) {
        const m = /\+(\d+)(?:,(\d+))?/.exec(l)
        const s = +m[1], n = m[2] === undefined ? 1 : +m[2]
        ;(ranges[cur] ||= []).push([s, s + n - 1])
      }
    }
    const r = sh('npx', ['eslint', '-f', 'json', ...files])
    let hits = []
    try {
      for (const f of JSON.parse(r.out)) {
        const rel = relative(ROOT, f.filePath)
        for (const m of f.messages) {
          if ((ranges[rel] || []).some(([a, b]) => m.line >= a && m.line <= b)) hits.push(`${rel}:${m.line} ${m.ruleId} ${m.message.slice(0, 80)}`)
        }
      }
    } catch { hits = [`could not parse eslint output — see ${LOG_DIR}/eslint.log`]; writeFileSync(join(LOG_DIR, 'eslint.log'), r.out) }
    say(`eslint (touched lines, ${files.length} files): ${hits.length} finding(s)`)
    hits.slice(0, 15).forEach((h) => say(`  ${h}`))
  }
}

if (QUICK) process.exit(0)

// ── 3. QA suites ─────────────────────────────────────────────────────────────
function findSuites(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.git')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) findSuites(p, acc)
    else if (e.name.endsWith('.qa.ts')) acc.push(relative(ROOT, p))
  }
  return acc
}
function runSuite(cwd, suite) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', suite], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    const t = setTimeout(() => child.kill('SIGKILL'), SUITE_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(t)
      const m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop()
      resolve({ suite, code, summary: m ? `${m[1]} passed, ${m[2]} failed` : 'NO_SUMMARY', out })
    })
  })
}
async function runAll(cwd, suites) {
  const results = []
  let i = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < suites.length) {
      const s = suites[i++]
      results.push(await runSuite(cwd, s))
    }
  }))
  return results
}
const failed = (r) => r.code !== 0 || /[1-9]\d* failed/.test(r.summary) || r.summary === 'NO_SUMMARY'

const suites = findSuites(ROOT).filter((s) => !ONLY || s.startsWith(ONLY)).sort()
const t0 = Date.now()
const results = await runAll(ROOT, suites)
for (const r of results) writeFileSync(join(LOG_DIR, r.suite.replace(/\//g, '__') + '.log'), r.out)
const bad = results.filter(failed)
const passedCount = results.filter((r) => !failed(r)).length
say(`qa suites: ${passedCount}/${results.length} clean in ${Math.round((Date.now() - t0) / 1000)}s`)

// ── 4. Classify failures against origin/main (cached worktree) ──────────────
if (bad.length) {
  const mainSha = sh('git', ['rev-parse', 'origin/main']).out.trim()
  const WT = process.env.QA_MAIN_WORKTREE || '/tmp/qa-main-worktree'
  const stamp = join(WT, '.qa-sha')
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== mainSha) {
    sh('git', ['worktree', 'remove', '--force', WT])
    sh('git', ['worktree', 'prune'])
    sh('git', ['worktree', 'add', '-q', '--detach', WT, mainSha])
    // Reuse this checkout's node_modules when the lockfile is identical;
    // otherwise install (slow, but only when dependencies changed).
    const sameLock = sh('git', ['diff', '--quiet', mainSha, '--', 'package-lock.json']).code === 0
    if (sameLock) symlinkSync(join(ROOT, 'node_modules'), join(WT, 'node_modules'))
    else sh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: WT })
    writeFileSync(stamp, mainSha)
  }
  const onMain = await runAll(WT, bad.filter((r) => existsSync(join(WT, r.suite))).map((r) => r.suite))
  const mainBy = Object.fromEntries(onMain.map((r) => [r.suite, r]))
  for (const r of bad) {
    const m = mainBy[r.suite]
    r.isNew = !m || m.summary !== r.summary
    const verdict = !m ? 'NEW (suite not on main)' : (m.summary === r.summary ? 'PRE-EXISTING (identical on main)' : `NEW (main: ${m.summary})`)
    say(`  ✗ ${r.suite} — ${r.summary} — ${verdict}`)
  }
}
say(`logs: ${LOG_DIR}`)
writeFileSync(join(LOG_DIR, 'SUMMARY.txt'), lines.join('\n') + '\n')
// Non-zero only for failures that are NOT identical on origin/main.
process.exit(bad.some((r) => r.isNew) ? 1 : 0)
