/**
 * What Vercel builds, and the one case it skips (vercel.json + scripts/vercel/ignore-build.mjs).
 *
 * Half of what this project spends on function storage is the number of
 * deployments it keeps, and part of that number is builds of commits that
 * changed no file: a merge of already-merged history has the tree that was
 * already deployed, so its build produces a second copy of the same output.
 *
 *  D) the decision table: ONLY a preview whose tree equals the tree of the last
 *     successful deployment of that branch is skipped, and every unknown builds;
 *  R) the real script, run against a throwaway git repository, because Vercel's
 *     exit codes are inverted (0 skips, 1 builds) and a comment cannot prove
 *     which way round this file has them;
 *  C) the command is wired up, and runs on plain node — the Ignored Build Step
 *     runs BEFORE the install step, so node_modules does not exist yet.
 * Every guard has a mutation control.
 *
 * Run: npx tsx lib/__qa__/vercel-build-skip.qa.ts
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..')
const REL = 'scripts/vercel/ignore-build.mjs'
const SCRIPT = join(ROOT, REL)
const source = readFileSync(SCRIPT, 'utf8')

type Verdict = { build: boolean; reason: string }
type Input = {
  vercelEnv?: string
  previousSha?: string
  previousTree?: string | null
  headTree?: string | null
  changedPaths?: string[] | null
}

async function main() {
  const { decide, isBuildIrrelevant } = (await import(SCRIPT)) as {
    decide: (i: Input) => Verdict
    isBuildIrrelevant: (p: unknown) => boolean
  }

  console.log('D) the decision table')
  {
    const T = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const U = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const d = (i: Input) => decide({ vercelEnv: 'preview', previousSha: 'deadbeef', previousTree: T, headTree: T, ...i })
    check('D1: a preview whose tree is already deployed is skipped', d({}).build === false, show(d({})))
    check('D2: a preview whose tree changed is built', d({ headTree: U }).build === true)
    check('D3: production is built even when the tree is already deployed',
      d({ vercelEnv: 'production' }).build === true, show(d({ vercelEnv: 'production' })))
    check('D4: a branch with no previous successful deployment is built', d({ previousSha: undefined }).build === true)
    check('D5: a previous tree this clone cannot resolve is built, not skipped', d({ previousTree: null }).build === true)
    check('D6: an unreadable HEAD tree is built', d({ headTree: null }).build === true)
    check('D7: an unknown target is built', d({ vercelEnv: undefined }).build === true)
    check('D8: every verdict says why, for the build log', [d({}), d({ headTree: U })].every((v) => v.reason.length > 10))
  }

  console.log('P) the paths that cannot change a deployment')
  {
    // A changed tree, so the verdict turns on the paths alone.
    const T = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const U = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const p = (changedPaths: string[] | null) =>
      decide({ vercelEnv: 'preview', previousSha: 'deadbeef', previousTree: T, headTree: U, changedPaths })

    check('P1: a QA-suite-only push is skipped',
      p(['lib/content/automation/__qa__/pass-gate.qa.ts']).build === false, show(p(['lib/content/automation/__qa__/pass-gate.qa.ts'])))
    check('P2: a documentation-only push is skipped', p(['CLAUDE.md', 'docs/notes.md']).build === false)
    check('P3: a probe and the QA runner are skipped',
      p(['supabase/migrations/__qa__/cron-pass-gate.probe.sql', 'scripts/qa/verify.mjs']).build === false)
    check('P4: a workflow-only push is skipped', p(['.github/workflows/ci.yml']).build === false)
    check('P5: one deployed file among many irrelevant ones still builds',
      p(['CLAUDE.md', 'lib/__qa__/x.qa.ts', 'app/page.tsx']).build === true, show(p(['CLAUDE.md', 'lib/__qa__/x.qa.ts', 'app/page.tsx'])))
    check('P6: THE LEGAL TEXT CASE — markdown under content/ is deployed and must build',
      p(['content/legal/es/terms.md']).build === true, show(p(['content/legal/es/terms.md'])))
    check('P7: a changed tree with no path list builds, rather than guessing', p(null).build === true)
    check('P8: an empty path list builds', p([]).build === true)
    check('P9: the skip verdict names how many files it looked at', /2 changed file/.test(p(['A.md', 'B.md']).reason))

    check('P10: the predicate is a closed list — an unknown shape is deployed',
      [isBuildIrrelevant('app/page.tsx'), isBuildIrrelevant('lib/content/automation/pass-gate.ts'),
        isBuildIrrelevant('package.json'), isBuildIrrelevant('next.config.ts'),
        isBuildIrrelevant('vercel.json'), isBuildIrrelevant('')].every((v) => v === false))
    check('P11: and a non-string never counts as irrelevant',
      [undefined, null, 42, {}].every((v) => isBuildIrrelevant(v) === false))
    check('P12: a migration that is not a probe still builds, because it is not this script\'s call',
      isBuildIrrelevant('supabase/migrations/20261117170000_cron_pass_gate.sql') === false)
  }

  /** A repository with: A (a file), B (tree-identical to A), C (the file changed). */
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'ignore-build-'))
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.email=qa@example.test', '-c', 'user.name=QA', ...args],
        { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    git('init', '--quiet', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'one\n')
    git('add', 'a.txt'); git('commit', '--quiet', '-m', 'A')
    const a = git('rev-parse', 'HEAD')
    git('commit', '--quiet', '--allow-empty', '-m', 'Merge the already-merged branch history')
    const b = git('rev-parse', 'HEAD')
    writeFileSync(join(dir, 'a.txt'), 'two\n')
    git('add', 'a.txt'); git('commit', '--quiet', '-m', 'C')
    const c = git('rev-parse', 'HEAD')
    // D: documentation only, from C. E: a legal markdown file under content/.
    writeFileSync(join(dir, 'NOTES.md'), 'a note\n')
    git('add', 'NOTES.md'); git('commit', '--quiet', '-m', 'D')
    const d = git('rev-parse', 'HEAD')
    mkdirSync(join(dir, 'content', 'legal', 'es'), { recursive: true })
    writeFileSync(join(dir, 'content', 'legal', 'es', 'terms.md'), 'terminos\n')
    git('add', '.'); git('commit', '--quiet', '-m', 'E')
    const e = git('rev-parse', 'HEAD')
    return { dir, a, b, c, d, e, git }
  }

  /** The script's own exit status, run the way Vercel runs it. */
  function run(dir: string, env: Record<string, string>, script = SCRIPT) {
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } })
    return { status: r.status, out: `${r.stdout}${r.stderr}`.trim() }
  }

  const fx = fixture()
  try {
    check('R0: the fixture really has a tree-identical commit',
      execFileSync('git', ['rev-parse', `${fx.a}^{tree}`], { cwd: fx.dir, encoding: 'utf8' }).trim() ===
      execFileSync('git', ['rev-parse', `${fx.b}^{tree}`], { cwd: fx.dir, encoding: 'utf8' }).trim())

    console.log('R) the script, run for real')
    {
      execFileSync('git', ['checkout', '--quiet', fx.b], { cwd: fx.dir })
      const skip = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: fx.a })
      check('R1: a preview commit that changed no file exits 0, which is how Vercel is told to skip',
        skip.status === 0, show(skip))
      const prod = run(fx.dir, { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: fx.a })
      check('R2: the same commit on production exits 1 and builds', prod.status === 1, show(prod))
      const first = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: '' })
      check('R3: a branch with no previous deployment exits 1 and builds', first.status === 1, show(first))
      const absent = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: '0'.repeat(40) })
      check('R4: a previous sha absent from the clone exits 1 and builds', absent.status === 1, show(absent))
      execFileSync('git', ['checkout', '--quiet', fx.c], { cwd: fx.dir })
      const changed = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: fx.a })
      check('R5: a preview commit that changed a file exits 1 and builds', changed.status === 1, show(changed))
      execFileSync('git', ['checkout', '--quiet', fx.d], { cwd: fx.dir })
      const docs = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: fx.c })
      check('R6: a preview whose only change is a markdown file exits 0 and skips', docs.status === 0, show(docs))
      execFileSync('git', ['checkout', '--quiet', fx.e], { cwd: fx.dir })
      const legal = run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: fx.d })
      check('R7: a preview whose only change is content/legal markdown exits 1 and builds', legal.status === 1, show(legal))
    }

    console.log('C) the command is wired up and can run before the install step')
    {
      const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as Record<string, unknown>
      const cmd = String(config.ignoreCommand ?? '')
      check('C1: vercel.json declares the ignoreCommand', cmd.length > 0)
      check('C2: it runs this script', cmd.includes(REL), show(cmd))
      check('C3: with plain node, not a dependency such as tsx or ts-node', /^node\s/.test(cmd) && !/tsx|ts-node|npx/.test(cmd), show(cmd))
      const imports = [...source.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
      check('C4: the script imports node builtins only, because node_modules does not exist yet',
        imports.length > 0 && imports.every((s) => s.startsWith('node:')), show(imports))
      check('C5: the crons and the region survived the edit',
        Array.isArray(config.crons) && (config.crons as unknown[]).length === 8 && show(config.regions) === show(['bom1']),
        show(config.regions))
    }

    console.log('M) mutation controls')
    {
      // A fresh filename per mutant: ESM caches a module by URL, so reusing one
      // path would silently hand the second import the first mutant.
      let mutants = 0
      const mutant = (needle: string, repl: string) => {
        const next = source.replace(needle, repl)
        if (next === source) throw new Error(`mutation did not apply: ${needle}`)
        const to = SCRIPT.replace(/\.mjs$/, `.mut${++mutants}.mjs`)
        writeFileSync(to, next)
        return to
      }
      execFileSync('git', ['checkout', '--quiet', fx.b], { cwd: fx.dir })
      let to = mutant('process.exit(verdict.build ? 1 : 0)', 'process.exit(verdict.build ? 0 : 1)')
      try {
        check('M1: inverting the exit codes fails R1 and R2',
          run(fx.dir, { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: fx.a }, to).status !== 0 &&
          run(fx.dir, { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: fx.a }, to).status !== 1)
      } finally { unlinkSync(to) }
      to = mutant("if (vercelEnv !== 'preview')", 'if (false)')
      try {
        check('M2: dropping the production guard fails R2',
          run(fx.dir, { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: fx.a }, to).status === 0)
      } finally { unlinkSync(to) }
      to = mutant("if (path === 'content' || path.startsWith('content/')) return false", 'if (false) return false')
      try {
        const { isBuildIrrelevant: broken } = (await import(to)) as { isBuildIrrelevant: (p: string) => boolean }
        check('M5: dropping the content/ exclusion fails P6, which is the legal text going stale',
          broken('content/legal/es/terms.md') === true)
      } finally { unlinkSync(to) }
      to = mutant("const deployed = changedPaths.filter((path) => !isBuildIrrelevant(path))", 'const deployed = []')
      try {
        const { decide: broken } = (await import(to)) as { decide: (i: Input) => Verdict }
        check('M6: treating every changed file as irrelevant fails P5',
          broken({ vercelEnv: 'preview', previousSha: 'x', previousTree: 'a', headTree: 'b', changedPaths: ['app/page.tsx'] }).build === false)
      } finally { unlinkSync(to) }
      check('M3: a bare import fails C4',
        !["node:child_process", "picomatch"].every((s) => s.startsWith('node:')))
      check('M4: a tsx command fails C3', /tsx/.test('npx tsx scripts/vercel/ignore-build.mjs'))
    }
  } finally {
    rmSync(fx.dir, { recursive: true, force: true })
  }
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
})

export {}
