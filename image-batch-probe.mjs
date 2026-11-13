// Does Gemini's Batch API serve the image models we actually use?
// Reads the key from .env.batchprobe.local, which .gitignore's `.env.*.local`
// rule already covers, so the key cannot be committed by accident. Never printed.
// Costs one batch image request.
import { readFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'

let key = process.env.GEMINI_API_KEY || ''
try {
  const m = readFileSync('.env.batchprobe.local', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)
  if (m) key = m[1].trim().replace(/^['"]|['"]$/g, '')
} catch {}
if (!key) { console.log('NO KEY: write GEMINI_API_KEY=... into .env.batchprobe.local first'); process.exit(1) }

const ai = new GoogleGenAI({ apiKey: key })
const PROMPT = 'A bright, clean, photorealistic landscape photo of an empty running track at sunrise, no text, no people.'
const MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image-preview']

for (const model of MODELS) {
  let job
  try {
    job = await ai.batches.create({
      model,
      src: { inlinedRequests: [{
        contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
        config: { responseModalities: ['TEXT', 'IMAGE'] },
        metadata: { key: '0' },
      }] },
      config: { displayName: `image-batch-probe-${Date.now().toString(36)}` },
    })
  } catch (e) {
    console.log(`${model}: CREATE REFUSED -> ${String(e && e.message || e).slice(0, 300)}`)
    continue
  }
  console.log(`${model}: job accepted -> ${job.name}`)

  const deadline = Date.now() + 8 * 60 * 1000
  let state = String(job.state || '')
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15000))
    const now = await ai.batches.get({ name: job.name })
    state = String(now.state || '')
    if (['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(state)) {
      if (state !== 'JOB_STATE_SUCCEEDED') {
        console.log(`${model}: ${state} ${JSON.stringify(now.error || {}).slice(0, 300)}`)
        break
      }
      const entry = (now.dest?.inlinedResponses || [])[0]
      if (!entry) { console.log(`${model}: SUCCEEDED but no inlined response`); break }
      if (entry.error) { console.log(`${model}: per-request error ${JSON.stringify(entry.error).slice(0, 300)}`); break }
      const parts = entry.response?.candidates?.[0]?.content?.parts || []
      const img = parts.find((p) => p.inlineData?.data)
      console.log(img
        ? `${model}: IMAGE OK -> ${img.inlineData.mimeType}, ${Math.round(img.inlineData.data.length * 0.75 / 1024)} KB`
        : `${model}: SUCCEEDED but no image part -> ${JSON.stringify(parts).slice(0, 200)}`)
      break
    }
  }
  if (!['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(state)) {
    console.log(`${model}: still ${state} after 8 min -> job ${job.name} (fine, batch may take hours)`)
  }
  break
}
console.log('done')
