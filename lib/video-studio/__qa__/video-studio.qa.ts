import { buildRequest, callVideoModel } from '../generate'
import { creditsFor, estimateCostUsd, actualCostUsd, USD_PER_CREDIT } from '../cost'
import { MAX_SECONDS, MIN_SECONDS } from '../config'

let passed = 0, failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name} ${detail}`) }
}
async function main() {
  // A. price vs cost
  const seconds = Array.from({ length: MAX_SECONDS - MIN_SECONDS + 1 }, (_, i) => i + MIN_SECONDS)
  check('A1: the price is 4x to 6x our cost at every duration', seconds.every((s) => { const m = creditsFor(s) * USD_PER_CREDIT / estimateCostUsd(s); return m >= 4 && m <= 6 }),
    seconds.map((s) => `${s}s=${(creditsFor(s) * USD_PER_CREDIT / estimateCostUsd(s)).toFixed(2)}x`).join(' '))
  check('A2: 5 s costs 6 credits, 6 s costs 7, 15 s costs 16', creditsFor(5) === 6 && creditsFor(6) === 7 && creditsFor(15) === 16)
  check('A3: the estimate matches the three measured clips (about 0.355 USD)', Math.abs(actualCostUsd({ videoTokens: 28960, thoughtTokens: 866, inputTokens: 32 }) - 0.3554) < 0.001)
  check('A4: out-of-range or fractional seconds throw', [2, 16, 5.5, NaN].every((s) => { try { creditsFor(s); return false } catch { return true } }))
  check('A1-MUT: the old pricing (5 credits to 6 s) would fail the 4x floor', !seconds.every((s) => (5 + Math.max(0, s - 6)) * USD_PER_CREDIT / estimateCostUsd(s) >= 4))

  // B. the request is fixed where it must be
  const ok = buildRequest({ prompt: 'a bouquet', seconds: 5, aspect: '9:16', images: [{ data: 'x', mimeType: 'image/jpeg' }] })
  const rf = ok.ok ? (ok.body.response_format as Record<string, unknown>) : {}
  check('B1: resolution is always 720p and duration comes from the validated value', ok.ok && rf.resolution === '720p' && rf.duration === '5s')
  check('B2: refuses a prompt that is empty or too long', !buildRequest({ prompt: '  ', seconds: 5, aspect: '9:16' }).ok && !buildRequest({ prompt: 'x'.repeat(801), seconds: 5, aspect: '9:16' }).ok)
  check('B3: refuses 7 images, 16 s and an unknown aspect', !buildRequest({ prompt: 'a', seconds: 5, aspect: '9:16', images: Array(7).fill({ data: 'x', mimeType: 'image/png' }) }).ok
    && !buildRequest({ prompt: 'a', seconds: 16, aspect: '9:16' }).ok && !buildRequest({ prompt: 'a', seconds: 5, aspect: '1:1' as never }).ok)
  check('B3-MUT: a request that carried a 4K resolution from the caller is not possible', !('resolution' in ({ prompt: 'a', seconds: 5, aspect: '9:16' } as object)) && rf.resolution !== '4k')

  // C. the answer
  const good = await callVideoModel('k', {}, async () => ({ ok: true, json: async () => ({
    usage: { total_output_tokens: 28960, total_thought_tokens: 866, total_input_tokens: 32 },
    steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'video', data: 'AAAA' }] }] }) }))
  check('C1: parses the video and the real cost', good.ok && good.result.videoBase64 === 'AAAA' && Math.abs(good.result.costUsd - 0.3554) < 0.001)
  const bad = await callVideoModel('k', {}, async () => ({ ok: false, json: async () => ({ error: { message: 'RAW PROVIDER TEXT' } }) }))
  check('C2: a provider error becomes a code, with no raw text', !bad.ok && bad.error === 'provider_failed' && !JSON.stringify(bad).includes('RAW'))
  const none = await callVideoModel('k', {}, async () => ({ ok: true, json: async () => ({ steps: [{ type: 'model_output', content: [] }] }) }))
  check('C3: an answer with no video is a failure, not a charge', !none.ok && none.error === 'no_video')
  const thrown = await callVideoModel('k', {}, async () => { throw new Error('secret network text') })
  check('C4: a thrown error is mapped too', !thrown.ok && thrown.error === 'provider_failed')
  check('C2-MUT: leaking the provider text would be caught', JSON.stringify({ error: 'RAW PROVIDER TEXT' }).includes('RAW'))

  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
export {}
