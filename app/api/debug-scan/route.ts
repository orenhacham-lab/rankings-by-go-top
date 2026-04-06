/**
 * GET /api/debug-scan?q=KEYWORD&domain=TARGET_DOMAIN&gl=IL&hl=he
 *
 * Public debug endpoint — NO AUTH required.
 * Opens directly in a browser and shows the full raw Serper response,
 * all organic URLs, and match analysis.
 *
 * Remove this file from production once debugging is complete.
 */

export const runtime = 'edge'

function normalizeDomain(input: string): string {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '').toLowerCase().replace(/\.$/, '')
  } catch {
    return input
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0].split('?')[0].split('#')[0]
      .toLowerCase().trim()
  }
}

function matchType(resultNorm: string, targetNorm: string): string | null {
  if (!resultNorm || !targetNorm) return null
  if (resultNorm === targetNorm) return 'exact'
  if (resultNorm.endsWith('.' + targetNorm)) return 'subdomain'
  if (resultNorm.includes(targetNorm)) return 'includes'
  return null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const keyword = url.searchParams.get('q') || 'קידום אתרים בפתח תקווה'
  const domain = url.searchParams.get('domain') || 'www.gotop.co.il'
  const gl = url.searchParams.get('gl') || 'il'
  const hl = url.searchParams.get('hl') || 'he'
  const num = parseInt(url.searchParams.get('num') || '100', 10)

  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'SERPER_API_KEY not configured' }, { status: 500 })
  }

  const body = { q: keyword, gl, hl, num }
  const normalizedTarget = normalizeDomain(domain)

  let serperData: Record<string, unknown> | null = null
  let serperError: string | null = null
  let httpStatus: number | null = null

  const t0 = Date.now()
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    httpStatus = res.status
    const text = await res.text()
    try {
      serperData = JSON.parse(text)
    } catch {
      serperError = `Non-JSON response (${res.status}): ${text.slice(0, 500)}`
    }
  } catch (e) {
    serperError = (e as Error).message
  }
  const elapsed = Date.now() - t0

  const organic: Array<{ title: string; link: string; position: number }> =
    (serperData?.organic as Array<{ title: string; link: string; position: number }>) ?? []

  const analyzed = organic.map((r, i) => {
    const norm = normalizeDomain(r.link)
    const match = matchType(norm, normalizedTarget)
    return {
      index: i + 1,
      serperPosition: r.position,
      link: r.link,
      normalized: norm,
      match: match ?? null,
      title: r.title,
    }
  })

  const matchedResult = analyzed.find((r) => r.match !== null)
  const rawContainsTarget = JSON.stringify(serperData ?? '').toLowerCase().includes(normalizedTarget.split('.')[0])

  return Response.json({
    request: { keyword, domain, gl, hl, num },
    normalizedTarget,
    serperHttpStatus: httpStatus,
    elapsedMs: elapsed,
    serperError,
    organicCount: organic.length,
    topLevelKeys: serperData ? Object.keys(serperData) : [],
    result: matchedResult
      ? { found: true, position: matchedResult.index, url: matchedResult.link, matchType: matchedResult.match }
      : { found: false },
    rawResponseContainsTargetDomain: rawContainsTarget,
    allOrganicResults: analyzed,
    rawSerperResponse: serperData,
  }, {
    headers: { 'Content-Type': 'application/json' },
  })
}
