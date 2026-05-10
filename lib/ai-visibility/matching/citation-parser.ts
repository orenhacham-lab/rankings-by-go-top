/**
 * Parse citations/sources from provider raw response
 * ScrapeLLM returns engine-specific citation field shapes:
 *   chatgpt:        links: [{text, url}]
 *   perplexity:     sources: [{title, url, snippet}]
 *   gemini:         citations: [{title, url, snippet, website_name, favicon, highlights}]
 *   copilot:        citations + links (links may be string[] of URLs)
 *   grok:           web_sources + x_results: [{title, url, preview}]
 *   google_ai_mode: citations + search_results: [{title, url, snippet, website_name}]
 */

import { AICitation } from '../providers/types'

/**
 * Extract domain from URL (handles malformed URLs gracefully)
 */
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname || url
  } catch {
    const match = url.match(/^https?:\/\/([^/?#]+)/)
    return match ? match[1] : url
  }
}

/**
 * Build a single AICitation from common fields
 */
function buildCitation(opts: {
  url: string
  title?: string
  snippet?: string
  position: number
}): AICitation | null {
  if (!opts.url || typeof opts.url !== 'string') return null
  const domain = extractDomainFromUrl(opts.url)
  return {
    url: opts.url,
    domain,
    title: opts.title || undefined,
    snippet: opts.snippet || undefined,
    position: opts.position,
  }
}

/**
 * Normalize chatgpt `links` shape: [{text, url}]
 */
function fromChatGPTLinks(links: unknown): AICitation[] {
  if (!Array.isArray(links)) return []
  const results: AICitation[] = []
  links.forEach((item, idx) => {
    if (!item) return
    if (typeof item === 'string') {
      const c = buildCitation({ url: item, position: idx + 1 })
      if (c) results.push(c)
      return
    }
    if (typeof item === 'object') {
      const obj = item as { text?: string; url?: string }
      if (!obj.url) return
      const c = buildCitation({ url: obj.url, title: obj.text, position: idx + 1 })
      if (c) results.push(c)
    }
  })
  return results
}

/**
 * Normalize perplexity `sources` shape: [{title, url, snippet}]
 */
function fromPerplexitySources(sources: unknown): AICitation[] {
  if (!Array.isArray(sources)) return []
  const results: AICitation[] = []
  sources.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return
    const obj = item as { title?: string; url?: string; snippet?: string }
    if (!obj.url) return
    const c = buildCitation({ url: obj.url, title: obj.title, snippet: obj.snippet, position: idx + 1 })
    if (c) results.push(c)
  })
  return results
}

/**
 * Normalize gemini `citations` shape: [{title, url, snippet, website_name, favicon, highlights}]
 */
function fromGeminiCitations(citations: unknown): AICitation[] {
  if (!Array.isArray(citations)) return []
  const results: AICitation[] = []
  citations.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return
    const obj = item as {
      title?: string
      url?: string
      snippet?: string
      website_name?: string
      highlights?: string[]
    }
    if (!obj.url) return
    const title = obj.title || obj.website_name
    const snippet = obj.snippet || (Array.isArray(obj.highlights) ? obj.highlights.join(' ') : undefined)
    const c = buildCitation({ url: obj.url, title, snippet, position: idx + 1 })
    if (c) results.push(c)
  })
  return results
}

/**
 * Normalize copilot `links` shape (may be string[] OR [{text, url}])
 */
function fromCopilotLinks(links: unknown, offset: number): AICitation[] {
  if (!Array.isArray(links)) return []
  const results: AICitation[] = []
  links.forEach((item, idx) => {
    if (!item) return
    if (typeof item === 'string') {
      const c = buildCitation({ url: item, position: offset + idx + 1 })
      if (c) results.push(c)
      return
    }
    if (typeof item === 'object') {
      const obj = item as { text?: string; url?: string }
      if (!obj.url) return
      const c = buildCitation({ url: obj.url, title: obj.text, position: offset + idx + 1 })
      if (c) results.push(c)
    }
  })
  return results
}

/**
 * Normalize grok `web_sources` / `x_results` shape: [{title, url, preview}]
 */
function fromGrokSources(items: unknown, offset: number): AICitation[] {
  if (!Array.isArray(items)) return []
  const results: AICitation[] = []
  items.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return
    const obj = item as { title?: string; url?: string; preview?: string }
    if (!obj.url) return
    const c = buildCitation({ url: obj.url, title: obj.title, snippet: obj.preview, position: offset + idx + 1 })
    if (c) results.push(c)
  })
  return results
}

/**
 * Normalize google_ai_mode `search_results` shape: [{title, url, snippet, website_name}]
 */
function fromGoogleSearchResults(items: unknown, offset: number): AICitation[] {
  if (!Array.isArray(items)) return []
  const results: AICitation[] = []
  items.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return
    const obj = item as { title?: string; url?: string; snippet?: string; website_name?: string }
    if (!obj.url) return
    const title = obj.title || obj.website_name
    const c = buildCitation({ url: obj.url, title, snippet: obj.snippet, position: offset + idx + 1 })
    if (c) results.push(c)
  })
  return results
}

/**
 * Deduplicate citations by URL while preserving the earliest position
 */
function dedupeCitations(citations: AICitation[]): AICitation[] {
  const seen = new Map<string, AICitation>()
  for (const c of citations) {
    if (!seen.has(c.url)) {
      seen.set(c.url, c)
    }
  }
  return Array.from(seen.values())
}

/**
 * Parse ScrapeLLM citations based on the engine.
 * Returns a unified AICitation[] regardless of source engine.
 */
export function parseScrapeLLMCitations(engine: string, rawResponse: unknown): AICitation[] {
  if (!rawResponse || typeof rawResponse !== 'object') return []
  const r = rawResponse as Record<string, unknown>
  const normalized = engine.toLowerCase()

  let citations: AICitation[] = []

  switch (normalized) {
    case 'chatgpt':
      citations = fromChatGPTLinks(r.links)
      break

    case 'perplexity':
      citations = fromPerplexitySources(r.sources)
      break

    case 'gemini':
      citations = fromGeminiCitations(r.citations)
      break

    case 'copilot': {
      const c1 = fromGeminiCitations(r.citations) // same shape as gemini
      const c2 = fromCopilotLinks(r.links, c1.length)
      citations = [...c1, ...c2]
      break
    }

    case 'grok': {
      const c1 = fromGrokSources(r.web_sources, 0)
      const c2 = fromGrokSources(r.x_results, c1.length)
      citations = [...c1, ...c2]
      break
    }

    case 'google_ai_mode':
    case 'google_ai_overview': {
      const c1 = fromGeminiCitations(r.citations) // same nested shape
      const c2 = fromGoogleSearchResults(r.search_results, c1.length)
      citations = [...c1, ...c2]
      break
    }

    default:
      citations = []
  }

  return dedupeCitations(citations)
}
