/**
 * Shared offline harness for the recommendation-engine E2E suites — a fixture
 * Gemini server (the SDK's real REST surface over the RECO_GENAI_BASE_URL seam)
 * and a contract-faithful in-memory Supabase admin that filters by project_id
 * (structural tenant isolation). NOT a test file (no `.qa` suffix) — imported by
 * the *.qa.ts suites.
 */
import { createServer, type Server } from 'http'

export interface GenaiServerConfig {
  models: string[]
  respond: (briefs: { id: string; subject: string; aligned_query?: string }[]) => unknown[]
  alwaysFail?: boolean
  respondRaw?: (briefs: { id: string; subject: string; aligned_query?: string }[]) => string
  respondDiscovery?: (anchors: string[]) => unknown
}

export function startFakeGenai(cfg: GenaiServerConfig): Promise<{ server: Server; port: number; calls: { model: string; briefCount: number; thinkingBudget: number | null }[] }> {
  const calls: { model: string; briefCount: number; thinkingBudget: number | null }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.method === 'GET' && (req.url ?? '').includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: cfg.models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) }))
        return
      }
      if ((req.url ?? '').includes(':generateContent')) {
        const model = ((req.url ?? '').match(/models\/([^:]+):generateContent/) ?? [])[1] ?? 'unknown'
        const budgetMatch = body.match(/"thinkingBudget"\s*:\s*(\d+)/)
        const thinkingBudget = budgetMatch ? Number(budgetMatch[1]) : null
        if (cfg.alwaysFail) {
          calls.push({ model, briefCount: 0, thinkingBudget })
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        if (model.includes('pro') && thinkingBudget === 0) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        if (model.includes('pro') && (thinkingBudget === null || thinkingBudget < 128 || thinkingBudget > 32768)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: `Budget ${thinkingBudget} is invalid. Valid range is 128-32768.`, status: 'INVALID_ARGUMENT' } }))
          return
        }
        if (!body.includes('"responseSchema"')) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Missing responseSchema: structured output is required by this contract.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        const prompt: string = (() => { try { const j = JSON.parse(body); return JSON.stringify(j) } catch { return body } })()
        if (prompt.includes('OWNED ANCHORS')) {
          const am = prompt.match(/OWNED ANCHORS[^\[]*?(\[[\s\S]*?\])/)
          let anchors: string[] = []
          if (am) { try { anchors = JSON.parse(am[1].replace(/\\"/g, '"')) } catch { anchors = [] } }
          calls.push({ model, briefCount: -1, thinkingBudget })
          const needs = cfg.respondDiscovery
            ? cfg.respondDiscovery(anchors)
            : anchors.slice(0, 6).map((a, i) => ({ subject: i % 2 === 0 ? `יתרונות ${a} בשימוש יומיומי` : `טעויות נפוצות עם ${a}`, anchor: a, need: i % 2 === 0 ? 'explanation' : 'checklist', intent: 'informational' }))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 300, totalTokenCount: 1100 } }))
          return
        }
        const m = prompt.match(/BRIEFS:\\n(\[.*?\])\\n\\nOUTPUT/) ?? prompt.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
        let briefs: { id: string; subject: string; aligned_query?: string }[] = []
        if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
        calls.push({ model, briefCount: briefs.length, thinkingBudget })
        const textOut = cfg.respondRaw ? cfg.respondRaw(briefs) : JSON.stringify({ topics: cfg.respond(briefs) })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: textOut }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, totalTokenCount: 1400 },
        }))
        return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, calls })))
}

/** Contract-faithful in-memory Supabase admin — filters every query by its
 *  project_id (and other eq() filters), the structural tenant boundary. */
export function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const st: { filters: Record<string, unknown>; single: boolean } = { filters: {}, single: false }
    const exec = () => {
      const rows = (tables[table] ?? []).filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))
      return { data: st.single ? (rows[0] ?? null) : rows, error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select() { return b },
      eq(col: string, val: unknown) { st.filters[col] = val; return b },
      order() { return b }, limit() { return b },
      maybeSingle() { st.single = true; return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from } as never
}

/** A structurally-varied title frame (subject-led, keeps keyword alignment). */
export const genTitle = (subject: string, i: number): string => {
  const frames = [(s: string) => s, (s: string) => `${s}: מה חשוב לדעת`, (s: string) => `${s} — מדריך מעשי`, (s: string) => `כל מה שצריך לדעת על ${s}`]
  return frames[i % frames.length](subject)
}
