/**
 * What a deployment spends on Vercel function storage (next.config.ts).
 *
 * Every route that reaches sharp carries a prebuilt libvips with it, and npm
 * installs two x64 Linux pairs, glibc and musl. Only the glibc pair can ever
 * load on Vercel (Amazon Linux), so the musl pair is dead weight copied into
 * each of those functions — 585 MB per deployment when this guard was written,
 * 24% of the traced bytes.
 *
 *  E) the musl pair is excluded from the traced file list of every route;
 *  G) the glibc pair is NOT excluded, and nothing excludes sharp itself —
 *     a function that resizes an image must still find its binary;
 *  K) the exclude key reaches every route and the shared next-server trace,
 *     which is what `*` does and what a single-segment key like '/*' would not;
 *  L) the legal pages read their markdown through a statically scoped path, so
 *     Turbopack bounds the trace instead of copying the whole project — public/
 *     and wordpress-plugin/ included — into each of the ten of them.
 * Every guard has a mutation control.
 *
 * Run: npx tsx lib/__qa__/function-storage.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
// next/dist/compiled/picomatch ships no type declaration. It is imported
// anyway because it is the very matcher collect-build-traces.js runs the
// exclude keys through, so K2 and K3 below check the real behaviour rather
// than a second implementation of it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picomatch = require('next/dist/compiled/picomatch') as
  (glob: string | string[], options?: { dot?: boolean; contains?: boolean }) => (input: string) => boolean

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// NOT comment-stripped on purpose: the exclude globs contain `/**/*`, whose
// `/*` and `*/` a comment stripper eats. The block is found by name instead,
// so the prose above it cannot be mistaken for configuration.
const config = read('next.config.ts')

/** The `outputFileTracingExcludes` object literal, as written in the config. */
function excludesBlock(source: string): string {
  const at = source.indexOf('outputFileTracingExcludes')
  if (at < 0) return ''
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  return ''
}

const MUSL = ['@img/sharp-libvips-linuxmusl-x64', '@img/sharp-linuxmusl-x64']
const GLIBC = ['@img/sharp-libvips-linux-x64', '@img/sharp-linux-x64']

console.log('E) the musl pair never ships')
{
  const block = excludesBlock(config)
  check('E1: next.config.ts declares outputFileTracingExcludes', block.length > 0)
  check('E2: both musl packages are excluded', MUSL.every((p) => block.includes(`node_modules/${p}/`)),
    show(MUSL.filter((p) => !block.includes(`node_modules/${p}/`))))
  check('E3: each musl exclude is a recursive glob, so the .node binary inside is covered',
    MUSL.every((p) => new RegExp(`node_modules/${p.replace(/[/@]/g, (c) => `\\${c}`)}/\\*\\*`).test(block)), show(block))
}

console.log('G) the binary a resize actually needs is untouched')
{
  const block = excludesBlock(config)
  check('G1: neither glibc package is excluded', GLIBC.every((p) => !block.includes(p)),
    show(GLIBC.filter((p) => block.includes(p))))
  check('G2: nothing excludes sharp itself', !/node_modules\/sharp\//.test(block), show(block))
  check('G3: the two modules that import sharp still do so at module scope, so tracing keeps finding the glibc pair',
    [/^import sharp from 'sharp'$/m.test(read('lib/content/gemini-image.ts')),
      /^import sharp from 'sharp'$/m.test(read('lib/gbp/image.ts'))].every(Boolean))
}

console.log('K) the key reaches every route and the shared server trace')
{
  const block = excludesBlock(config)
  const keys = [...block.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1])
  check('K1: there is exactly one exclude key', keys.length === 1, show(keys))
  const key = keys[0] ?? ''
  // collect-build-traces.js matches routes with { contains: true } and the
  // shared next-server entry with a plain picomatch(glob)('next-server').
  const routes = ['/api/content/automation/cron', '/api/content/articles/generate', '/(dashboard)/settings', '/']
  check('K2: the key matches deeply nested routes, not just one segment',
    routes.every((r) => picomatch(key, { dot: true, contains: true })(r)),
    show(routes.filter((r) => !picomatch(key, { dot: true, contains: true })(r))))
  check('K3: the key also matches the shared next-server trace', picomatch(key)('next-server'), show(key))
}

console.log('L) the legal pages do not drag the project behind them')
{
  const md = read('lib/legal/markdown.ts')
  // The whole readFileSync line: `[^)]*` would stop inside process.cwd().
  const call = /^.*readFileSync\(\s*join\(.*$/m.exec(md)?.[0] ?? ''
  check('L1: the read names its folders as literals', /'content'\s*,\s*'legal'/.test(call), show(call))
  check('L2: no spread of a split path, which is the access Turbopack cannot bound',
    !/\.\.\.\s*\w+\.split\(/.test(call), show(call))
  check('L3: the markdown is still supplied to the trace by config',
    ['/es/*', '/pt-BR/*'].every((k) => new RegExp(`'${k.replace(/[/*]/g, (c) => `\\${c}`)}'\\s*:\\s*\\['\\./content/legal/`).test(config)), show(config.slice(0, 0)))
}

console.log('M) mutation controls')
{
  const dropped = config.replace(/outputFileTracingExcludes/, 'tracingExcludesRenamed')
  check('M1: removing the option fails E1', excludesBlock(dropped) === '')
  const musl = excludesBlock(config.replace('@img/sharp-libvips-linuxmusl-x64', '@img/sharp-libvips-linux-x64'))
  check('M2: excluding the glibc libvips instead of the musl one fails E2 and G1',
    !MUSL.every((p) => musl.includes(`node_modules/${p}/`)) && !GLIBC.every((p) => !musl.includes(p)))
  const flat = excludesBlock(config.replace(/'node_modules\/@img\/sharp-libvips-linuxmusl-x64\/\*\*\/\*'/, "'node_modules/@img/sharp-libvips-linuxmusl-x64'"))
  check('M3: a non-recursive musl glob fails E3',
    !MUSL.every((p) => new RegExp(`node_modules/${p.replace(/[/@]/g, (c) => `\\${c}`)}/\\*\\*`).test(flat)))
  check('M4: a key scoped to one route group fails K2',
    !['/api/content/automation/cron', '/'].every((r) => picomatch('/es/*', { dot: true, contains: true })(r)))
  check('M5: a key that misses the shared trace fails K3', !picomatch('/*')('next-server'))
  const spread = "readFileSync(join(process.cwd(), ...rel.split('/')), 'utf8')"
  const back = /^.*readFileSync\(\s*join\(.*$/m.exec(spread)?.[0] ?? ''
  check('M6: putting the spread path back fails L1 and L2',
    !/'content'\s*,\s*'legal'/.test(back) && /\.\.\.\s*\w+\.split\(/.test(back))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
