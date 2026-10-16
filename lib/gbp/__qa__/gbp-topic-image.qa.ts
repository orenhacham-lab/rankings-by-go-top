/**
 * AN AI PHOTO FOR A TOPIC POST (POST /api/gbp/image/generate, PostComposer).
 *
 *   A) the handler: owner-only (another user's project is refused before the
 *      generator runs), schema missing = not_available, the topic is required
 *      (trimmed, at most 300 characters);
 *   B) success answers the JPEG bytes themselves (image/jpeg), and those bytes go
 *      through the same 4:3 1200×900 crop the upload path uses; nothing is
 *      written to the database or to storage;
 *   C) a failed generation answers one stable code, never the provider's words,
 *      and logs OUR classification (free text is logged as "unclassified");
 *      the real generator with no key fails the same way, without a network call;
 *   D) the route is a 404 while GBP_POSTS_ENABLED is off, and runs on the real
 *      owner check (authContentProject);
 *   E) the composer offers the button ONLY when the source is "topic", says the
 *      photo is AI-made, and every new string exists in all four dictionaries.
 *
 * Every guard has a MUTATION CONTROL: the same check run against a deliberately
 * broken copy (a temp module in this directory, deleted on exit) or a broken
 * string must fail. In addition, these were run by hand against the real files
 * (backed up to /tmp first, restored by copying the backup back):
 *   - PostComposer.tsx with `source === 'topic' && ` removed from the button →
 *     "the generate button is rendered only inside the topic branch" failed;
 *   - http.ts answering `err('image_generation_failed', …, { reason })` →
 *     "a provider failure answers image_generation_failed and nothing else" failed.
 *
 * Run: npx tsx lib/gbp/__qa__/gbp-topic-image.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { FakeAdmin } from '../../__qa__/_fake-admin'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const H = require('../http') as typeof import('../http')
const S = require('../store') as typeof import('../store')
const E = require('../errors') as typeof import('../errors')
const I = require('../image') as typeof import('../image')
const TI = require('../topic-image') as typeof import('../topic-image')
const { dashboardHe } = require('../../i18n/dashboard/he')
const { dashboardEn } = require('../../i18n/dashboard/en')
const { dashboardEs } = require('../../i18n/dashboard/es')
const { dashboardPtBR } = require('../../i18n/dashboard/pt-BR')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const MUTANTS: string[] = []
process.on('exit', () => { for (const f of MUTANTS) { try { unlinkSync(f) } catch { /* gone */ } } })
/** A broken copy of a lib/gbp module (or a route with only '@/' imports), written next to this suite. */
function mutant<T>(rel: string, from: string | RegExp, to: string): T {
  const src = read(rel)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${rel}`)
  const moved = out.replace(/(\sfrom\s*|\brequire\()'\.\//g, "$1'../")
  const file = join(__dirname, `.mut-${crypto.randomUUID()}.ts`)
  writeFileSync(file, moved)
  MUTANTS.push(file)
  return require(file) as T
}

// ── fixtures ────────────────────────────────────────────────────────────────
const OWNER = 'user-owner', OTHER = 'user-other'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '22222222-2222-4222-8222-222222222222'
function world(opts: { missing?: boolean } = {}) {
  const hooks = opts.missing ? Object.fromEntries(S.GBP_TABLES.map((t) => [t, { select: () => ({ code: '42P01', message: 'relation does not exist' }) }])) : {}
  const admin: any = new FakeAdmin({
    projects: [
      { id: PROJECT, user_id: OWNER, target_domain: 'dana-bakery.co.il', business_name: 'המאפייה של דנה', name: 'דנה' },
      { id: FOREIGN, user_id: OTHER, target_domain: 'other.example.com', business_name: 'עסק אחר', name: 'אחר' },
    ],
    gbp_connections: [], gbp_oauth_states: [], project_gbp_locations: [], gbp_posts: [],
  }, hooks as any)
  admin.uploads = 0
  admin.storage = { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.test/${p}` } }), upload: async () => { admin.uploads++; return { error: null } } }) }
  return admin
}
/** The owner check as authContentProject does it: the project row's user_id must be the caller. */
function deps(admin: any, over: Partial<import('../http').GbpRouteDeps> = {}, as = OWNER): import('../http').GbpRouteDeps {
  return {
    auth: async (pid) => {
      if (!pid) return { error: 'projectId is required', status: 400 }
      const row = admin.tables.projects.find((p: any) => p.id === pid)
      if (!row) return { error: 'not found', status: 404 }
      if (row.user_id !== as) return { error: 'forbidden', status: 403 }
      return { user: { id: as }, admin, project: { id: row.id, user_id: row.user_id } } as any
    },
    ...over,
  }
}
const post = (body: unknown) => new Request('https://app.test/api/gbp/image/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
/** A 16:9 JPEG like the real generator returns (normalizeFeaturedImage → 1600×900), with some detail so it is not tiny. */
async function fakePhoto(): Promise<Buffer> {
  const noise = Buffer.alloc(160 * 90 * 3)
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 37 + (i >> 5) * 11) % 256
  return sharp(noise, { raw: { width: 160, height: 90, channels: 3 } }).resize(1600, 900).jpeg({ quality: 85 }).toBuffer()
}
/** Run fn with console.error captured; returns what was logged. */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ out: T; logged: string }> {
  const orig = console.error
  const lines: string[] = []
  console.error = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  try { return { out: await fn(), logged: lines.join('\n') } } finally { console.error = orig }
}

// ── A) gate + input ─────────────────────────────────────────────────────────
type Mod = typeof H
async function gateFailures(mod: Mod): Promise<string[]> {
  const bad: string[] = []
  let calls = 0
  const gen = async () => { calls++; return { ok: true as const, bytes: await fakePhoto() } }
  const admin = world()
  const foreign = await mod.handleGenerateImage(post({ projectId: FOREIGN, topic: 'מבצע סוף שבוע' }), deps(admin, { generateImage: gen }))
  if (foreign.status !== 403) bad.push(`another user's project → ${foreign.status}`)
  const unknown = await mod.handleGenerateImage(post({ projectId: '33333333-3333-4333-8333-333333333333', topic: 'מבצע' }), deps(admin, { generateImage: gen }))
  if (unknown.status !== 404) bad.push(`unknown project → ${unknown.status}`)
  const noId = await mod.handleGenerateImage(post({ topic: 'מבצע' }), deps(admin, { generateImage: gen }))
  if (noId.status !== 400) bad.push(`no projectId → ${noId.status}`)
  if (calls !== 0) bad.push(`the generator ran ${calls}× for a caller who is not the owner`)
  return bad
}
async function topicFailures(mod: Mod): Promise<string[]> {
  const bad: string[] = []
  let calls = 0
  const gen = async () => { calls++; return { ok: true as const, bytes: await fakePhoto() } }
  const admin = world()
  for (const [label, topic] of [['missing', undefined], ['empty', ''], ['whitespace', '   \n '], ['not a string', 42], ['301 characters', 'א'.repeat(301)]] as const) {
    const r = await mod.handleGenerateImage(post({ projectId: PROJECT, topic }), deps(admin, { generateImage: gen }))
    const b = await r.json().catch(() => ({}))
    if (r.status !== 400 || b.error !== 'invalid_request') bad.push(`${label} topic → ${r.status} ${b.error}`)
  }
  const notJson = await mod.handleGenerateImage(new Request('https://app.test/x', { method: 'POST', body: 'nope' }), deps(admin, { generateImage: gen }))
  if (notJson.status !== 400) bad.push(`a body that is not JSON → ${notJson.status}`)
  if (calls !== 0) bad.push(`the generator ran ${calls}× without a valid topic`)
  let seen = ''
  const ok = await mod.handleGenerateImage(post({ projectId: PROJECT, topic: `  ${'א'.repeat(300)}  ` }), deps(admin, { generateImage: async ({ topic }) => { seen = topic; return { ok: true, bytes: await fakePhoto() } } }))
  if (ok.status !== 200 || seen !== 'א'.repeat(300)) bad.push(`a 300-character topic (padded) → ${ok.status}, generator got ${seen.length} chars`)
  return bad
}

async function gateChecks() {
  console.log('A) owner gate and input')
  const g = await gateFailures(H)
  check('another user\'s project is refused (403), an unknown one is 404, and the generator never runs', g.length === 0, g.join(' | '))
  const noGate = mutant<Mod>('lib/gbp/http.ts',
    /(export async function handleGenerateImage[\s\S]*?)const g = await gate\(deps, typeof body\.projectId === 'string' \? body\.projectId : null\)\n\s*if \(g instanceof Response\) return g/,
    "$1const g = { project: { id: String(body.projectId) } } as any")
  check('MUTATION: a handler that skips the owner gate is caught', (await gateFailures(noGate)).length > 0)

  const m = await H.handleGenerateImage(post({ projectId: PROJECT, topic: 'מבצע' }), deps(world({ missing: true }), { generateImage: async () => ({ ok: true, bytes: await fakePhoto() }) }))
  check('tables not applied → 409 not_available', m.status === 409 && (await m.json()).error === 'not_available')

  const t = await topicFailures(H)
  check('the topic is required: missing, empty, whitespace, non-string or over 300 characters → 400 invalid_request', t.length === 0, t.join(' | '))
  const noTopic = mutant<Mod>('lib/gbp/http.ts', "if (!topic || topic.length > GBP_TOPIC_MAX) return err('invalid_request', 400)", "if (topic.length > GBP_TOPIC_MAX) return err('invalid_request', 400)")
  check('MUTATION: a handler that lets an empty topic through is caught', (await topicFailures(noTopic)).length > 0)
  const noLimit = mutant<Mod>('lib/gbp/http.ts', "if (!topic || topic.length > GBP_TOPIC_MAX) return err('invalid_request', 400)", "if (!topic) return err('invalid_request', 400)")
  check('MUTATION: a handler without the 300-character limit is caught', (await topicFailures(noLimit)).length > 0)
  check('the limit is the composer\'s own 300', TI.GBP_TOPIC_MAX === 300 && /id="gbp-topic"[^\n]*maxLength=\{300\}/.test(read('components/maps-posts/PostComposer.tsx')))
}

// ── B) success ──────────────────────────────────────────────────────────────
async function successFailures(mod: Mod): Promise<string[]> {
  const bad: string[] = []
  const admin = world()
  const before = JSON.stringify(admin.tables)
  const photo = await fakePhoto()
  const r = await mod.handleGenerateImage(post({ projectId: PROJECT, topic: 'לחם מחמצת טרי', language: 'he' }), deps(admin, { generateImage: async () => ({ ok: true, bytes: photo }) }))
  if (r.status !== 200) bad.push(`status ${r.status}`)
  if (r.headers.get('content-type') !== 'image/jpeg') bad.push(`content-type ${r.headers.get('content-type')}`)
  const got = Buffer.from(await r.arrayBuffer())
  if (!got.equals(photo)) bad.push(`body is not the generated bytes (${got.length} vs ${photo.length})`)
  if (JSON.stringify(admin.tables) !== before) bad.push('the database changed')
  if (admin.uploads !== 0) bad.push(`${admin.uploads} storage upload(s)`)
  return bad
}
async function successChecks() {
  console.log('B) success: the JPEG itself, nothing stored')
  const s = await successFailures(H)
  check('the generated photo comes back as image/jpeg bytes, and no table or bucket is touched', s.length === 0, s.join(' | '))
  const asJson = mutant<Mod>('lib/gbp/http.ts', /return new Response\(new Uint8Array\(out\.bytes\), \{[^\n]*\}\)/, "return json({ ok: true, image: out.bytes.toString('base64') })")
  check('MUTATION: answering JSON instead of the image is caught', (await successFailures(asJson)).length > 0)
  const stores = mutant<Mod>('lib/gbp/http.ts', /if \(out\.ok\) \{\n/, "if (out.ok) {\n      await g.admin.storage.from('x').upload('p', out.bytes, {})\n")
  check('MUTATION: a handler that stores the photo is caught', (await successFailures(stores)).length > 0)

  // The 16:9 photo goes through the composer's normal crop step unchanged.
  const prepared = await I.preparePostImage(await fakePhoto(), null)
  check('the photo passes the existing 4:3 crop to the 1200×900 JPEG Google needs', prepared.ok && prepared.width === 1200 && prepared.height === 900 && (await sharp(prepared.bytes).metadata()).format === 'jpeg')
  const ti = strip(read('lib/gbp/topic-image.ts'))
  check('the real generator asks for 16:9 and normalizes to a 16:9 JPEG (wide enough for the 480-px crop)', /aspectRatio: '16:9'/.test(ti) && /normalizeFeaturedImage\(out\.data, '16:9'\)/.test(ti))
  check('…and goes through the commercial-safe image prompt (no text, no logos, unbranded), with no text model pinned by name', /generateArticleImage\(/.test(ti) && !/writeCommercialSafeConcept\(/.test(ti) && !/gemini-\d/.test(ti) && !/businessName/.test(ti))
  // Legal review 16 Oct 2026: the photo must never pass for one of the business itself.
  // MUTATION CONTROL, run by hand: putting "A real-looking photo" back fails this check.
  check('…and asks for a generic illustration, never a real-looking photo of the business', !/real-looking/i.test(ti) && /Not a photo of any specific business, its premises, its staff or its products/.test(ti) && /no identifiable people/.test(ti))
  check('MUTATION: a square request is caught', !/aspectRatio: '16:9'/.test(ti.replace("aspectRatio: '16:9'", "aspectRatio: '1:1'")))
}

// ── C) failure ──────────────────────────────────────────────────────────────
const RAW = 'Gemini 429 RESOURCE_EXHAUSTED: quota exceeded for key AIzaSyRAWSECRET'
async function failureFailures(mod: Mod): Promise<string[]> {
  const bad: string[] = []
  const admin = world()
  const cases: [string, import('../topic-image').GenerateTopicImage, string][] = [
    ['raw provider text as the reason', async () => ({ ok: false, reason: RAW }), 'unclassified'],
    ['a classified reason', async () => ({ ok: false, reason: 'image_model_unavailable' }), 'image_model_unavailable'],
    ['a generator that throws', async () => { throw new Error(RAW) }, 'generator_threw'],
  ]
  for (const [label, gen, want] of cases) {
    const { out: r, logged } = await captureErrors(() => mod.handleGenerateImage(post({ projectId: PROJECT, topic: 'מבצע' }), deps(admin, { generateImage: gen })))
    const text = await r.text()
    let b: any = {}
    try { b = JSON.parse(text) } catch { /* not json */ }
    if (r.status !== 502) bad.push(`${label} → ${r.status}`)
    if (b.error !== 'image_generation_failed' || Object.keys(b).sort().join(',') !== 'error,ok') bad.push(`${label} → body ${text.slice(0, 120)}`)
    if (/Gemini|AIza|quota|RESOURCE/i.test(text)) bad.push(`${label} leaks provider text to the merchant`)
    if (!logged.includes('[gbp-topic-image]') || !logged.includes(want)) bad.push(`${label} logged "${logged.slice(0, 120)}", want reason ${want}`)
    if (/AIza|quota exceeded/.test(logged)) bad.push(`${label} logs the provider's words`)
  }
  return bad
}
async function failureChecks() {
  console.log('C) failure: a stable code, a classified log, no provider text')
  const f = await failureFailures(H)
  check('a provider failure answers image_generation_failed and nothing else, and logs our reason', f.length === 0, f.join(' | '))
  const leaks = mutant<Mod>('lib/gbp/http.ts', "return err('image_generation_failed', imageGenerationHttpStatus(classified))", "return err('image_generation_failed', 502, { reason })")
  check('MUTATION: answering the provider\'s reason is caught', (await failureFailures(leaks)).length > 0)
  const rawLog = mutant<Mod>('lib/gbp/http.ts', "{ reason: classified, projectId", "{ reason, projectId")
  check('MUTATION: logging the raw reason is caught', (await failureFailures(rawLog)).length > 0)
  const silent = mutant<Mod>('lib/gbp/http.ts', /\s*console\.error\('\[gbp-topic-image\] generation failed'[^\n]*/, '')
  check('MUTATION: swallowing the failure without a log is caught', (await failureFailures(silent)).length > 0)
  check('the new code is a known error code', (E.GBP_ERROR_CODES as readonly string[]).includes('image_generation_failed'))

  // The real generator without a key: a classified failure, no network call.
  const key = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  const orig = console.warn
  console.warn = () => {}
  try {
    const real = await TI.generateTopicImage({ topic: 'לחם מחמצת' })
    check('the real generator without GEMINI_API_KEY fails with a classified reason', !real.ok && real.reason === 'missing_gemini_api_key')
    const { out: r, logged } = await captureErrors(() => H.handleGenerateImage(post({ projectId: PROJECT, topic: 'לחם מחמצת' }), deps(world())))
    check('…and through the handler that is image_generation_failed, logged as missing_gemini_api_key', r.status === 502 && (await r.json()).error === 'image_generation_failed' && logged.includes('missing_gemini_api_key'))
  } finally {
    console.warn = orig
    if (key !== undefined) process.env.GEMINI_API_KEY = key
  }
}

// ── D) route ────────────────────────────────────────────────────────────────
type Route = { POST: (req: Request) => Promise<Response> }
async function flagOff(route: Route): Promise<boolean> {
  const before = process.env.GBP_POSTS_ENABLED
  delete process.env.GBP_POSTS_ENABLED
  try {
    const r = await route.POST(post({ projectId: PROJECT, topic: 'מבצע' })).catch(() => null)
    return !!r && r.status === 404
  } finally { if (before !== undefined) process.env.GBP_POSTS_ENABLED = before }
}
async function routeChecks() {
  console.log('D) the route')
  const ROUTE = 'app/api/gbp/image/generate/route.ts'
  const route = require(join(ROOT, ROUTE)) as Route
  check('POST answers 404 while GBP_POSTS_ENABLED is off', await flagOff(route))
  const open = mutant<Route>(ROUTE, "if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })", '')
  check('MUTATION: a route without the flag check is caught', !(await flagOff(open)))
  const src = strip(read(ROUTE))
  const real = (s: string) => /handleGenerateImage\(req, realGbpDeps\)/.test(s) && /auth: \(projectId\) => authContentProject\(projectId\)/.test(strip(read('lib/gbp/route-deps.ts')))
  check('the route runs the handler on the real owner check (authContentProject)', real(src) && /export const runtime = 'nodejs'/.test(src))
  check('MUTATION: a route on hand-made deps is caught', !real(src.replace('realGbpDeps)', '{ auth: async () => ({}) } as any)')))
}

// ── E) composer + dictionaries ──────────────────────────────────────────────
function composerFailures(src: string): string[] {
  const s = strip(src)
  const bad: string[] = []
  const calls = s.match(/generateImage\(\)/g) ?? []
  if (calls.length !== 1) bad.push(`generateImage() is called ${calls.length}× in the markup, want 1`)
  if (!/\{source === 'topic' && \(\s*<Button[^>]*onClick=\{\(\) => void generateImage\(\)\}/.test(s)) bad.push('the generate button is not inside the topic branch')
  if (!/disabled=\{!topic\.trim\(\) \|\| generating\}/.test(s)) bad.push('the button is not disabled for an empty topic or while generating')
  if (!/\{generating \? c\.imageGenerating : c\.imageGenerate\}/.test(s)) bad.push('no loading label')
  const fn = /const generateImage = async \(\) => \{[\s\S]*?\n {2}\}\n/.exec(s)?.[0] ?? ''
  if (!/if \(source !== 'topic' \|\| !topic\.trim\(\)\) return/.test(fn)) bad.push('generateImage does not refuse a non-topic source itself')
  if (!/fetch\('\/api\/gbp\/image\/generate'/.test(fn) || (s.match(/\/api\/gbp\/image\/generate/g) ?? []).length !== 1) bad.push('the generate endpoint is called from somewhere else')
  if (!/gbpErrorText\(t, body\.error \?\? 'image_generation_failed'\)/.test(fn)) bad.push('a failure is not shown through gbpErrorText')
  if (!/await choose\(blob, true\)/.test(fn)) bad.push('the photo does not go through choose()')
  if (!/\{picked\?\.ai && <p[^>]*>\{c\.imageGeneratedHint\}<\/p>\}/.test(s)) bad.push('no AI hint on a generated photo')
  return bad
}
function composerChecks() {
  console.log('E) the composer and the words')
  const src = read('components/maps-posts/PostComposer.tsx')
  const f = composerFailures(src)
  check('the generate button is rendered only inside the topic branch, wired to choose() and gbpErrorText', f.length === 0, f.join(' | '))
  check('MUTATION: a button outside the topic branch is caught', composerFailures(src.replace("{source === 'topic' && (\n                  <Button variant=\"secondary\" size=\"sm\" onClick={() => void generateImage()}", "{(\n                  <Button variant=\"secondary\" size=\"sm\" onClick={() => void generateImage()}")).length > 0)
  check('MUTATION: the button in the article branch is caught', composerFailures(src.replace("{source === 'topic' && (\n                  <Button variant=\"secondary\" size=\"sm\" onClick={() => void generateImage()}", "{source === 'article' && (\n                  <Button variant=\"secondary\" size=\"sm\" onClick={() => void generateImage()}")).length > 0)
  check('MUTATION: a comment cannot satisfy the guard', composerFailures(src.replace(/\{source === 'topic' && \(\n(\s*<Button variant="secondary" size="sm" onClick=\{\(\) => void generateImage\(\)\})/, "{/* {source === 'topic' && ( */}{(\n$1")).length > 0)
  check('MUTATION: a generated photo without the AI hint is caught', composerFailures(src.replace('{picked?.ai && ', '{false && ')).length > 0)

  const KEYS = ['imageGenerate', 'imageGenerating', 'imageGeneratedHint'] as const
  const dicts: [string, any][] = [['he', dashboardHe], ['en', dashboardEn], ['es', dashboardEs], ['pt-BR', dashboardPtBR]]
  const missing = (ds: [string, any][]) => ds.flatMap(([n, d]) => [
    ...KEYS.filter((k) => typeof d?.mapsPosts?.composer?.[k] !== 'string' || !d.mapsPosts.composer[k].trim()).map((k) => `${n}.composer.${k}`),
    ...(typeof d?.mapsPosts?.errors?.image_generation_failed === 'string' ? [] : [`${n}.errors.image_generation_failed`]),
  ])
  const m = missing(dicts)
  check('every new string is in all four dictionaries (he, en, es, pt-BR), not left to the English fallback', m.length === 0, m.join(', '))
  const noPt = JSON.parse(JSON.stringify(dashboardPtBR))
  delete noPt.mapsPosts.composer.imageGeneratedHint
  check('MUTATION: a dictionary without one of them is caught', missing([...dicts.slice(0, 3), ['pt-BR', noPt]]).length > 0)
  check('the Hebrew hint says the photo is AI-made and that Google shows it under the business name',
    /בינה מלאכותית/.test(dashboardHe.mapsPosts.composer.imageGeneratedHint) && /גוגל/.test(dashboardHe.mapsPosts.composer.imageGeneratedHint)
    && /\bAI\b/.test(dashboardEn.mapsPosts.composer.imageGeneratedHint) && /\bIA\b/.test(dashboardEs.mapsPosts.composer.imageGeneratedHint) && /\bIA\b/.test(dashboardPtBR.mapsPosts.composer.imageGeneratedHint))
  check('the Hebrew words are Hebrew', [...KEYS.map((k) => dashboardHe.mapsPosts.composer[k]), dashboardHe.mapsPosts.errors.image_generation_failed].every((v: string) => /[֐-׿]/.test(v) && !/[A-Za-z]{3,}/.test(v)))
}

async function main() {
  await gateChecks()
  await successChecks()
  await failureChecks()
  await routeChecks()
  composerChecks()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })

export {}
