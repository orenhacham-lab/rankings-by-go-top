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
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
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
/** sharp's portable build, loaded only when no native binary matches — never on Vercel. */
const WASM = '@img/sharp-wasm32'

console.log('E) the musl pair never ships')
{
  const block = excludesBlock(config)
  check('E1: next.config.ts declares outputFileTracingExcludes', block.length > 0)
  check('E2: both musl packages are excluded', MUSL.every((p) => block.includes(`node_modules/${p}/`)),
    show(MUSL.filter((p) => !block.includes(`node_modules/${p}/`))))
  check('E3: each musl exclude is a recursive glob, so the .node binary inside is covered',
    MUSL.every((p) => new RegExp(`node_modules/${p.replace(/[/@]/g, (c) => `\\${c}`)}/\\*\\*`).test(block)), show(block))
}

console.log('W) the wasm fallback never ships either')
{
  // 13 Nov 2026, measured on a real build of main: 43 functions reach sharp and
  // each carried the 9.2 MB sharp-wasm32 .wasm, 400 MB of the 3.76 GB traced.
  const block = excludesBlock(config)
  check('W1: sharp-wasm32 is excluded', block.includes(`node_modules/${WASM}/`), show(block))
  check('W2: and recursively, so the .wasm inside is covered',
    new RegExp(`node_modules/${WASM.replace(/[/@]/g, (c) => `\\${c}`)}/\\*\\*`).test(block), show(block))
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

console.log('S) sharp stays where the pixels are')
{
  // sharp carries a prebuilt libvips of ~19 MB into EVERY function whose import
  // graph reaches it, so what matters is not how often it is imported but how
  // many routes can see it. Measured on 13 Nov 2026: 43 of 732 functions could.
  // Three modules encode images; everything else must not be able to reach them.
  const SHARP_MODULES = [
    'lib/content/author-box/photo-encode.ts',
    'lib/content/gemini-image.ts',
    'lib/gbp/image.ts',
  ]
  // Routes and modules that have no business opening an image. Each one used to
  // reach sharp: the GBP handlers through two of fifteen handlers, the rest
  // through a 24-character bucket name declared beside the image generator.
  const COLD = [
    'lib/gbp/http.ts',
    'lib/content/author-box/photo.ts',
    'lib/content/writing-guidance/data.ts',
    'lib/account/delete-account.ts',
    'lib/content/wordpress-publish.ts',
    'lib/content/wordpress-plugin-publish.ts',
    'lib/content/inline-images-wordpress.ts',
    'lib/site-platforms/http.ts',
    'lib/content/image-bucket.ts',
    'lib/content/automation/attempts.ts',
    'app/api/gbp/posts/route.ts',
    'app/api/gbp/reviews/route.ts',
    'app/api/account/delete/route.ts',
    'app/api/content/articles/[id]/wordpress/route.ts',
    'app/api/content/articles/[id]/site-platform/route.ts',
    'app/api/site-platforms/test/route.ts',
    'app/(dashboard)/content/articles/[id]/page.tsx',
  ]
  // And the two that must still find it, or a crop silently stops working.
  const HOT = ['app/api/gbp/image/route.ts', 'app/api/gbp/image/generate/route.ts']

  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  // `import type` is erased before tracing ever sees it; a value import is not.
  const valueImports = (src: string) => strip(src).replace(/^\s*import\s+type\s[^\n]*$/gm, '')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (f === 'node_modules' || f.startsWith('.') || f === '__qa__') continue
      const abs = join(dir, f)
      if (statSync(abs).isDirectory()) walk(abs)
      else if (/\.(ts|tsx)$/.test(f) && !/\.(qa|test)\.ts$/.test(f)) files.push(relative(ROOT, abs))
    }
  }
  for (const d of ['lib', 'app', 'components']) walk(join(ROOT, d))
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(ROOT, dirname(from), spec) : null
    if (!base) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c)
    }
    return null
  }
  const importsOf = (file: string, override?: Record<string, string>) =>
    [...valueImports(override?.[file] ?? read(file)).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
      .map((m) => resolve(file, m[1]!)).filter((x): x is string => !!x)
  const closure = (start: string, override?: Record<string, string>) => {
    const seen = new Set<string>([start]); const q = [start]
    while (q.length) { const f = q.pop()!; for (const n of importsOf(f, override)) if (!seen.has(n)) { seen.add(n); q.push(n) } }
    return seen
  }
  const importsSharp = (f: string, override?: Record<string, string>) =>
    /^import sharp from 'sharp'$/m.test(strip(override?.[f] ?? read(f)))
  const reaches = (start: string, override?: Record<string, string>) =>
    [...closure(start, override)].filter((f) => importsSharp(f, override))

  const found = files.filter((f) => importsSharp(f)).sort()
  check('S1: exactly three production modules import sharp, and they are the three expected ones',
    show(found) === show([...SHARP_MODULES].sort()), show(found))
  const warm = COLD.filter((f) => reaches(f).length > 0)
  check(`S2: none of the ${COLD.length} routes and modules that never open an image can reach sharp`,
    warm.length === 0, show(warm.map((f) => [f, reaches(f)])))
  const cold = HOT.filter((f) => reaches(f).length === 0)
  check('S3: the two routes that DO crop and generate still reach it', cold.length === 0, show(cold))

  // The invariant, rather than a list of sins: these are the only entry points
  // whose work is making an image. 43 of 732 functions could reach sharp when
  // this was measured on 13 November 2026; the point of the split is that a new
  // page or route cannot quietly join them.
  const MAY_REACH_SHARP = [
    'app/(dashboard)/settings/page.tsx',
    'app/api/blog/auto/cron/[locale]/route.ts',
    'app/api/blog/auto/cron/route.ts',
    'app/api/content/articles/[id]/image/route.ts',
    'app/api/content/articles/[id]/inline-images/[imageId]/route.ts',
    'app/api/content/articles/[id]/inline-images/route.ts',
    'app/api/content/articles/generate/route.ts',
    'app/api/content/automation/cron/route.ts',
    'app/api/content/automation/items/[itemId]/generate/route.ts',
    'app/api/content/automation/run/route.ts',
    'app/api/content/strategy/schedule/route.ts',
    'app/api/gbp/image/generate/route.ts',
    'app/api/gbp/image/route.ts',
  ]
  const entries = files.filter((f) => /^app\/(?:.*\/)?(?:route|page)\.tsx?$/.test(f))
  const warmEntries = entries.filter((f) => reaches(f).length > 0).sort()
  check(`S5: exactly the ${MAY_REACH_SHARP.length} image entry points of ${entries.length} can reach sharp`,
    show(warmEntries) === show([...MAY_REACH_SHARP].sort()),
    show({ unexpected: warmEntries.filter((f) => !MAY_REACH_SHARP.includes(f)), gone: MAY_REACH_SHARP.filter((f) => !warmEntries.includes(f)) }))
  check('S4: the bucket name is declared where nothing encodes an image',
    /^export const CONTENT_IMAGE_BUCKET = /m.test(read('lib/content/image-bucket.ts')) &&
    !/export const CONTENT_IMAGE_BUCKET/.test(read('lib/content/featured-image.ts')))

  const back = { 'lib/gbp/http.ts': `${read('lib/gbp/http.ts')}\nimport { preparePostImage } from './image'\n` }
  check('MUTATION CONTROL: the GBP handlers importing the cropper again fails S2',
    reaches('lib/gbp/http.ts', back).length > 0)
  const bucket = { 'lib/content/image-bucket.ts': `${read('lib/content/image-bucket.ts')}\nimport sharp from 'sharp'\n` }
  check('MUTATION CONTROL: a bucket module that imports sharp fails S2',
    COLD.some((f) => reaches(f, bucket).length > 0))
  const typeOnly = 'import type { GenerateTopicImage } from \'./topic-image\''
  check('MUTATION CONTROL: the same import as a value import is not erased, and is seen',
    valueImports(typeOnly) === '' && valueImports(typeOnly.replace('import type', 'import')) !== '')
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
  const noWasm = excludesBlock(config.replace(`      'node_modules/${WASM}/**/*',\n`, ''))
  check('MW1: dropping the wasm exclude fails W1', !noWasm.includes(`node_modules/${WASM}/`))
  const flatWasm = excludesBlock(config.replace(`'node_modules/${WASM}/**/*'`, `'node_modules/${WASM}'`))
  check('MW2: a non-recursive wasm glob fails W2',
    !new RegExp(`node_modules/${WASM.replace(/[/@]/g, (c) => `\\${c}`)}/\\*\\*`).test(flatWasm))
  const spread = "readFileSync(join(process.cwd(), ...rel.split('/')), 'utf8')"
  const back = /^.*readFileSync\(\s*join\(.*$/m.exec(spread)?.[0] ?? ''
  check('M6: putting the spread path back fails L1 and L2',
    !/'content'\s*,\s*'legal'/.test(back) && /\.\.\.\s*\w+\.split\(/.test(back))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
