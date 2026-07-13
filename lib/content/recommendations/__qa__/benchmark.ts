/**
 * Recommendation model benchmark — apples-to-apples comparison of candidate
 * Gemini models on ONE fixed prompt. Real harness: it calls the live Gemini API,
 * so it requires GEMINI_API_KEY and outbound access (Preview/prod, NOT the
 * sandbox). Prints per-model, per-run metrics + a summary table.
 *
 * Run:  GEMINI_API_KEY=… npx tsx lib/content/recommendations/__qa__/benchmark.ts
 * Optional: RECO_BENCH_MODELS="gemini-2.5-pro,gemini-2.5-flash,gemini-3.1-pro-preview"
 *
 * It does NOT choose a model or write anything — measurement only.
 */
import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { recommendationGuidance, structuredOutputContract } from '../prompt-guidance'

const RUNS = 3
const REQUESTED = 20
const YEAR = 2026
const LANG = 'Hebrew'

// A fixed, representative Oligarch-style corpus (perfume store). Same input for
// every model so differences are the model's, not the prompt's.
const CORPUS = [
  'Tom Ford', 'Amouage', 'Gucci', 'Acqua di Parma', 'Guerlain', 'Nishane', 'Xerjoff',
  'Maison Francis Kurkdjian', 'Creed', 'בורוג׳ Borouj', 'Byredo', 'Le Labo', 'Ex Nihilo',
  "Andy Tauer L'Air du Desert Marocain", 'Andy Tauer Lonestar Memories',
]
const EXISTING = ['המסע של וניל ממדגסקר לבקבוק הבושם שלך', 'איך לאחסן בשמים בבית', 'איך לבחור בושם לפי עונה']

const PROMPT = [
  `You are an SEO content strategist for a Hebrew perfume store. Today's year is ${YEAR}.`,
  `Available brands/products (the ONLY supplied entities — use exact names, never invent a brand not listed): ${CORPUS.join(' ; ')}.`,
  `EXISTING article titles (do not paraphrase): ${EXISTING.map((t) => `"${t}"`).join(', ')}.`,
  recommendationGuidance(LANG, YEAR, REQUESTED),
  structuredOutputContract(LANG, REQUESTED),
].join('\n')

// Heuristic corruption probes (NOT used in production — benchmark scoring only).
const CORRUPT = [/דגים\s*בשמים/, /לפני\s*שוקינג/, /\bשוקינג\b/, /\bממואיר\b/]
const BRAND_COLON = /[A-Za-z֐-׿][\w֐-׿' ]{0,20}:\s/
const looksEnglish = (s: string) => !/[֐-׿]/.test(s) && /[A-Za-z]{3,}/.test(s)

interface RunMetric { ok: boolean; count: number; validJson: boolean; corrupted: number; brandColon: number; englishReasons: number; staleYear: number; internalLabels: number; latencyMs: number; inTok: number; outTok: number }

async function benchOne(client: ReturnType<typeof getGeminiClient>, modelId: string): Promise<RunMetric> {
  const t0 = Date.now()
  try {
    const model = client!.getGenerativeModel({ model: modelId, generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 8192 } })
    const res = await model.generateContent(PROMPT)
    const latencyMs = Date.now() - t0
    const text = res.response.text()
    const usage = res.response.usageMetadata
    let topics: { title?: string; reason?: string; evidenceSummary?: string }[] = []
    let validJson = true
    try { topics = (JSON.parse(text).topics ?? []) as typeof topics } catch { validJson = false }
    const titles = topics.map((t) => t.title || '')
    const reasons = topics.map((t) => t.evidenceSummary || t.reason || '')
    return {
      ok: true, count: topics.length, validJson,
      corrupted: titles.filter((t) => CORRUPT.some((re) => re.test(t))).length,
      brandColon: titles.filter((t) => BRAND_COLON.test(t)).length,
      englishReasons: reasons.filter(looksEnglish).length,
      staleYear: titles.filter((t) => /\b20(1\d|2[0-4])\b/.test(t)).length,
      internalLabels: reasons.filter((r) => /cluster\s*\d+/i.test(r)).length,
      latencyMs, inTok: usage?.promptTokenCount ?? 0, outTok: usage?.candidatesTokenCount ?? 0,
    }
  } catch (err) {
    console.error(`  [${modelId}] error:`, err instanceof Error ? err.message : String(err))
    return { ok: false, count: 0, validJson: false, corrupted: 0, brandColon: 0, englishReasons: 0, staleYear: 0, internalLabels: 0, latencyMs: Date.now() - t0, inTok: 0, outTok: 0 }
  }
}

async function main() {
  const client = getGeminiClient()
  if (!client) {
    console.log('GEMINI_API_KEY not set — cannot run the live model benchmark from this environment.')
    console.log('Run this in Preview/prod with a key. Candidate models default to gemini-2.5-pro + gemini-2.5-flash.')
    return
  }
  const models = (process.env.RECO_BENCH_MODELS || 'gemini-2.5-pro,gemini-2.5-flash').split(',').map((s) => s.trim()).filter(Boolean)
  const table: Record<string, RunMetric[]> = {}
  for (const m of models) {
    table[m] = []
    for (let i = 0; i < RUNS; i++) {
      const r = await benchOne(client, m)
      table[m].push(r)
      console.log(`  ${m} run ${i + 1}: count=${r.count} validJson=${r.validJson} corrupted=${r.corrupted} brandColon=${r.brandColon} enReasons=${r.englishReasons} stale=${r.staleYear} labels=${r.internalLabels} ${r.latencyMs}ms in=${r.inTok} out=${r.outTok}`)
    }
  }
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1))
  console.log('\n===== SUMMARY (avg of 3 runs) =====')
  console.log('model                         count  validJSON  corrupt  brandColon  enReasons  stale  labels  latency  outTok')
  for (const m of models) {
    const rs = table[m]
    console.log(`${m.padEnd(28)}  ${avg(rs.map((r) => r.count)).toFixed(1).padStart(5)}  ${(avg(rs.map((r) => (r.validJson ? 1 : 0))) * 100).toFixed(0).padStart(8)}%  ${avg(rs.map((r) => r.corrupted)).toFixed(1).padStart(7)}  ${avg(rs.map((r) => r.brandColon)).toFixed(1).padStart(10)}  ${avg(rs.map((r) => r.englishReasons)).toFixed(1).padStart(9)}  ${avg(rs.map((r) => r.staleYear)).toFixed(1).padStart(5)}  ${avg(rs.map((r) => r.internalLabels)).toFixed(1).padStart(6)}  ${avg(rs.map((r) => r.latencyMs)).toFixed(0).padStart(6)}ms  ${avg(rs.map((r) => r.outTok)).toFixed(0).padStart(6)}`)
  }
}
main()
