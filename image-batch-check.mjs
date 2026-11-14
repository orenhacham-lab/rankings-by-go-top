// Check ONE batch job by name, without creating anything.
//   node image-batch-check.mjs batches/xxxxxxxx
// Reads the key from .env.batchprobe.local (gitignored, never printed).
import { readFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'

const name = process.argv[2]
if (!name) { console.log('USAGE: node image-batch-check.mjs batches/xxxx'); process.exit(1) }

let key = process.env.GEMINI_API_KEY || ''
try {
  const m = readFileSync('.env.batchprobe.local', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)
  if (m) key = m[1].trim().replace(/^['"]|['"]$/g, '')
} catch {}
if (!key) { console.log('NO KEY: write GEMINI_API_KEY=... into .env.batchprobe.local first'); process.exit(1) }

const ai = new GoogleGenAI({ apiKey: key })
let job
try {
  job = await ai.batches.get({ name })
} catch (e) {
  console.log(`READ FAILED -> ${String(e && e.message || e).slice(0, 400)}`)
  process.exit(1)
}

console.log('state:', job.state)
if (job.error) console.log('error:', JSON.stringify(job.error).slice(0, 400))
if (job.batchStats) console.log('stats:', JSON.stringify(job.batchStats).slice(0, 300))

const entry = (job.dest?.inlinedResponses || [])[0]
if (!entry) { console.log('no inlined response yet'); process.exit(0) }
if (entry.error) { console.log('per-request error:', JSON.stringify(entry.error).slice(0, 400)); process.exit(0) }
const parts = entry.response?.candidates?.[0]?.content?.parts || []
const img = parts.find((p) => p.inlineData?.data)
if (img) {
  console.log(`IMAGE OK -> ${img.inlineData.mimeType}, ${Math.round(img.inlineData.data.length * 0.75 / 1024)} KB`)
} else {
  console.log('no image part. parts:', JSON.stringify(parts.map((p) => Object.keys(p))).slice(0, 300))
  const txt = parts.map((p) => p.text || '').join(' ').slice(0, 300)
  if (txt) console.log('text returned instead:', txt)
}
