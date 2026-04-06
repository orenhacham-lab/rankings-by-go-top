/**
 * POST /api/setup/test-scan
 *
 * Public — no auth required. Used by the setup wizard to verify
 * the Serper API key works with a real query.
 */

import { runScan } from '@/lib/scanner'

export async function POST(request: Request) {
  let body: {
    keyword?: string
    engine?: string
    targetDomain?: string
    targetBusinessName?: string
    country?: string
    language?: string
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'גוף הבקשה אינו תקין' }, { status: 400 })
  }

  const keyword = body.keyword?.trim()
  if (!keyword) {
    return Response.json({ error: 'יש להזין מילת מפתח' }, { status: 400 })
  }

  const engine = body.engine || 'google_search'

  if (engine === 'google_search' && !body.targetDomain?.trim()) {
    return Response.json({ error: 'יש להזין דומיין יעד לחיפוש אורגני' }, { status: 400 })
  }
  if (engine === 'google_maps' && !body.targetBusinessName?.trim()) {
    return Response.json({ error: 'יש להזין שם עסק לבדיקת גוגל מפות' }, { status: 400 })
  }

  const startedAt = new Date().toISOString()

  // Capture raw Serper response alongside our parsed output
  // We call the scanner but also intercept the raw fetch via a wrapper
  let rawResponse: unknown = null
  const originalFetch = global.fetch

  // Temporarily wrap fetch to capture the raw API response
  global.fetch = async (input, init) => {
    const res = await originalFetch(input, init)
    if (
      typeof input === 'string' &&
      (input.includes('serper.dev/search') || input.includes('serper.dev/maps'))
    ) {
      // Clone so scanner can still read the body
      const cloned = res.clone()
      try {
        rawResponse = await cloned.json()
      } catch {
        rawResponse = null
      }
    }
    return res
  }

  let scanResult
  try {
    scanResult = await runScan(engine, {
      keyword,
      targetDomain: body.targetDomain?.trim() || null,
      targetBusinessName: body.targetBusinessName?.trim() || null,
      country: body.country || 'IL',
      language: body.language || 'he',
    })
  } finally {
    global.fetch = originalFetch
  }

  const completedAt = new Date().toISOString()

  return Response.json({
    input: { keyword, engine, targetDomain: body.targetDomain, targetBusinessName: body.targetBusinessName },
    parsed: scanResult,
    raw: rawResponse,
    timing: { startedAt, completedAt },
  })
}
