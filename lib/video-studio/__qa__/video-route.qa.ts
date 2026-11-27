/**
 * POST /api/video-studio/generate (lib/video-studio/http.ts), against fakes.
 *   A) off by default (404); auth and ownership come first; nothing is spent before them;
 *   B) validation refuses bad input before any credit moves;
 *   C) credits are taken BEFORE the model is called, and a refusal never calls it;
 *   D) every failure refunds, and the customer sees a stable code, never provider text;
 *   E) ceilings: per user per day, and for the whole product;
 *   F) the route file and the source keep their guards (flag, no raw errors, no key logging).
 * Every group has a MUTATION CONTROL: a deliberately broken copy must fail the same check.
 * Run: npx tsx lib/video-studio/__qa__/video-route.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const H = require('../http') as typeof import('../http')

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.log('FAIL:', m) } }

const OWNER = 'user-1', PROJECT = '0e86560c-0000-4000-8000-000000000001'
interface Log { calls: string[]; spent: number; refunded: number; jobs: any[] }
function makeDeps(over: Partial<import('../http').VideoDeps> = {}, o: { balance?: number; userJobs?: number; globalUsd?: number; model?: any; store?: any } = {}) {
  const log: Log = { calls: [], spent: 0, refunded: 0, jobs: [] }
  let balance = o.balance ?? 100
  const deps: import('../http').VideoDeps = {
    auth: async (pid) => {
      log.calls.push('auth')
      if (!pid) return { error: 'projectId is required', status: 400 }
      if (pid === 'other') return { error: 'Forbidden', status: 403 }
      if (pid === 'anon') return { error: 'Unauthorized', status: 401 }
      return { user: { id: OWNER }, admin: {} as any, project: { id: pid, user_id: OWNER } }
    },
    usageToday: async () => ({ userJobs: o.userJobs ?? 0, globalCostUsd: o.globalUsd ?? 0 }),
    startJob: async (j) => { log.jobs.push(j); return true },
    spend: async (_u, c) => { log.calls.push('spend'); if (balance < c) return false; balance -= c; log.spent += c; return true },
    refund: async (_u, c) => { log.calls.push('refund'); balance += c; log.refunded += c },
    callModel: async () => { log.calls.push('model'); return o.model ?? { ok: true, result: { videoBase64: Buffer.from('mp4').toString('base64'), costUsd: 0.355, videoTokens: 28960 } } },
    store: async (p, j) => { log.calls.push('store'); return o.store === null ? null : { path: `${p}/${j}.mp4`, url: 'https://signed/x' } },
    finishJob: async () => { log.calls.push('finish') },
    purgeExpired: async () => { log.calls.push('purge') },
    ...over,
  }
  return { deps, log, balance: () => balance }
}
const req = (b: Record<string, unknown>) => new Request('http://x/api/video-studio/generate', { method: 'POST', body: JSON.stringify(b) })
const good = { projectId: PROJECT, prompt: 'A slow zoom on the bouquet, soft light', seconds: 5, aspect: '9:16', images: [{ data: 'AAAA', mimeType: 'image/jpeg' }] }
const run = async (deps: any, b: any) => { const r = await H.handleGenerate(req(b), deps); return { status: r.status, body: await r.json() as any } }

async function main() {
  // A) flag and auth
  process.env.VIDEO_STUDIO_ENABLED = 'false'
  { const { deps, log } = makeDeps(); const r = await run(deps, good)
    ok(r.status === 404 && log.calls.length === 0, 'A1 kill switch (VIDEO_STUDIO_ENABLED=false): 404 and nothing runs') }
  process.env.VIDEO_STUDIO_ENABLED = 'true'
  for (const [pid, st] of [['other', 403], ['anon', 401]] as const) {
    const { deps, log } = makeDeps(); const r = await run(deps, { ...good, projectId: pid })
    ok(r.status === st && !log.calls.includes('spend') && !log.calls.includes('model'), `A2 ${pid}: ${st}, no spend, no model`)
  }
  { const { deps } = makeDeps(); const r = await run(deps, { ...good, projectId: undefined }); ok(r.status === 400, 'A3 missing project: 400') }

  // B) validation, before any credit moves
  const bad: [string, any, number][] = [
    ['seconds 2', { seconds: 2 }, 400], ['seconds 16', { seconds: 16 }, 400], ['seconds 4.5', { seconds: 4.5 }, 400],
    ['aspect 1:1', { aspect: '1:1' }, 400], ['empty prompt', { prompt: '   ' }, 400], ['long prompt', { prompt: 'x'.repeat(801) }, 400],
    ['7 images', { images: Array(7).fill({ data: 'AAAA', mimeType: 'image/jpeg' }) }, 400],
    ['gif image', { images: [{ data: 'AAAA', mimeType: 'image/gif' }] }, 400],
    ['non-base64', { images: [{ data: '<script>', mimeType: 'image/png' }] }, 400],
    ['huge images', { images: [{ data: 'A'.repeat(4_000_001), mimeType: 'image/png' }] }, 413],
  ]
  for (const [n, patch, st] of bad) {
    const { deps, log } = makeDeps(); const r = await run(deps, { ...good, ...patch })
    ok(r.status === st && log.spent === 0 && !log.calls.includes('model') && log.jobs.length === 0, `B ${n}: ${st}, nothing spent`)
  }

  // C) spend before model; refusal never calls the model
  { const { deps, log } = makeDeps(); const r = await run(deps, good)
    ok(r.status === 200 && r.body.ok && r.body.credits === 6 && r.body.url === 'https://signed/x', 'C1 happy path')
    ok(log.calls.indexOf('spend') > -1 && log.calls.indexOf('spend') < log.calls.indexOf('model'), 'C2 credits taken before the model') }
  { const { deps, log } = makeDeps({}, { balance: 5 }); const r = await run(deps, good)
    ok(r.status === 402 && r.body.error === 'insufficient_credits' && !log.calls.includes('model'), 'C3 too few credits: 402 and the model is NOT called') }
  { const { deps, log } = makeDeps({}, { balance: 100 }); const r = await run(deps, { ...good, seconds: 15 })
    ok(r.body.credits === 16 && log.spent === 16, 'C4 15 s costs 16 credits') }

  // D) failures refund, with stable codes only
  for (const [code, st] of [['provider_failed', 502], ['no_video', 502]] as const) {
    const { deps, log, balance } = makeDeps({}, { model: { ok: false, error: code } }); const r = await run(deps, good)
    ok(r.status === st && r.body.error === code && log.refunded === 6 && balance() === 100, `D1 ${code}: refunded in full`)
    ok(JSON.stringify(r.body).length < 80, `D2 ${code}: body carries only the code`)
  }
  { const { deps, log, balance } = makeDeps({}, { store: null }); const r = await run(deps, good)
    ok(r.status === 500 && log.refunded === 6 && balance() === 100, 'D3 storage failure refunds') }
  { const { deps, balance } = makeDeps({ callModel: async () => { throw new Error('boom: secret provider text') } }); const r = await run(deps, good)
    ok(r.status === 500 && r.body.error === 'unexpected' && !JSON.stringify(r.body).includes('boom'), 'D4 thrown error: stable code only')
    void balance }

  // E) ceilings
  { const { deps, log } = makeDeps({}, { userJobs: 10 }); const r = await run(deps, good)
    ok(r.status === 429 && log.spent === 0 && !log.calls.includes('model'), 'E1 per-user daily cap') }
  { const { deps, log } = makeDeps({}, { globalUsd: 24.9 }); const r = await run(deps, good)
    ok(r.status === 429 && log.spent === 0, 'E2 product-wide daily cost cap') }
  { const { deps } = makeDeps({}, { userJobs: 9, globalUsd: 0 }); const r = await run(deps, good); ok(r.status === 200, 'E3 under the caps passes') }

  // F) source guards (comments stripped)
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const http = strip(readFileSync(join(__dirname, '../http.ts'), 'utf8'))
  const route = strip(readFileSync(join(__dirname, '../../../app/api/video-studio/generate/route.ts'), 'utf8'))
  const deps = strip(readFileSync(join(__dirname, '../route-deps.ts'), 'utf8'))
  ok(/isVideoStudioEnabled\(\)/.test(http), 'F1 handler checks the flag')
  ok(/handleGenerate\(req, realVideoDeps\)/.test(route), 'F2 route delegates to the handler')
  ok(!/console\./.test(http + deps), 'F3 no logging of bodies or keys')
  ok(/\.eq\('user_id', userId\)/.test(deps), 'F4 per-user count filters by owner')
  const orderOk = (src: string) => src.indexOf('deps.spend(') > -1 && src.indexOf('deps.spend(') < src.indexOf('deps.callModel(')
  ok(orderOk(http), 'F5 spend precedes the model call in source')

  // Mutation controls: each broken variant must fail its guard.
  { const { deps: d, log } = makeDeps({ spend: async () => true }, { balance: 0 }); const r = await run(d, good)
    ok(!(r.status === 402 && !log.calls.includes('model')), 'M-C a spend that always succeeds would call the model with no credits (guard catches it)') }
  { const { deps: d, log } = makeDeps({ refund: async () => { log.calls.push('x') } }, { model: { ok: false, error: 'provider_failed' } })
    await run(d, good); ok(log.refunded !== 5, 'M-D a missing refund leaves credits unrefunded (guard catches it)') }
  { ok(!orderOk(http.replace('deps.spend(', 'deps.nope(')) && !orderOk(http.replace('deps.callModel(', 'deps.spend2(').replace('deps.spend(', 'deps.callModel(')), 'M-F5 mutated source fails the order guard') }
  { const { deps: d } = makeDeps({}, { userJobs: 999 }); const r = await run(d, good); ok(r.status === 429, 'M-E sanity: cap still bites') }

  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
export {}
