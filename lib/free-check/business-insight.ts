/**
 * The single model call the free check is allowed to make.
 *
 * Scope is deliberately narrow: interpretation only — what this business is,
 * who it sells to, which keywords are worth chasing, which articles to write,
 * and which competitor domains the page itself hints at. Every FINDING stays
 * deterministic (findings.ts), so a model outage degrades the check instead of
 * breaking it: the caller keeps the technical results and shows
 * `results.aiUnavailable`.
 *
 * Cost control lives in the caller (store.ts decides whether this runs at all).
 * What this module owns is keeping one call cheap: the flash-lite classifier
 * model, a capped slice of page text, and a bounded provider timeout.
 */
import { getGeminiClient, GEMINI_REQUEST_TIMEOUT_MS } from '@/lib/ai-visibility/gemini-semantic-classifier'
import type { SiteSignals } from './html-signals'
import type { FreeCheckBusiness } from './types'
import type { Locale } from '@/lib/i18n/locales'

/** How much page text the prompt carries. Enough to characterise, cheap to send. */
const TEXT_BUDGET = 6_000
const MAX_KEYWORDS = 5
const MAX_ARTICLES = 5
const MAX_AUDIENCES = 5
const MAX_COMPETITORS = 6

export type BusinessInsight = {
  business: FreeCheckBusiness
  keywords: string[]
  articles: string[]
  /** Competitor domains the model recognises in this niche and market. */
  competitors: string[]
}

export type InsightResult = { ok: true; insight: BusinessInsight } | { ok: false; reason: string }

function buildPrompt(signals: SiteSignals, locale: Locale): string {
  const language = locale === 'en' ? 'English' : 'Hebrew'
  return [
    'You are an SEO strategist reading one page of a real website.',
    `Answer in ${language}. Return JSON only, matching this shape exactly:`,
    '{"summary":string,"niche":string,"platform":string|null,"audiences":string[],"keywords":string[],"articles":string[],"competitors":string[]}',
    '',
    'Rules:',
    `- "summary": 2-3 sentences on what the business sells and how, grounded ONLY in the page text below. If the text does not say, say what is visible and no more. Never invent brands, locations, certifications or claims.`,
    `- "niche": a short label, at most 6 words.`,
    `- "platform": the CMS/e-commerce platform if the page reveals it (WordPress, Shopify, Wix...), else null.`,
    `- "audiences": up to ${MAX_AUDIENCES} concrete customer segments, one short line each.`,
    `- "keywords": exactly ${MAX_KEYWORDS} commercial search phrases this site should rank for, in the site's own language, buyer-intent first. No brand-only terms.`,
    `- "articles": ${MAX_ARTICLES} article titles worth writing, each a real title a reader would click.`,
    `- "competitors": up to ${MAX_COMPETITORS} bare domains (no scheme, no path) of real competing sites in the same market. Only domains you are confident exist. Never include the site itself.`,
    '',
    `SITE: ${signals.finalUrl}`,
    `TITLE: ${signals.title ?? '(none)'}`,
    `DESCRIPTION: ${signals.metaDescription ?? '(none)'}`,
    `HEADINGS: ${[...signals.h1, ...signals.h2].slice(0, 25).join(' | ')}`,
    `PAGE LANGUAGE: ${signals.htmlLang ?? 'unknown'}`,
    `OUTBOUND DOMAINS: ${signals.externalDomains.slice(0, 10).join(', ') || '(none)'}`,
    '',
    'PAGE TEXT:',
    signals.text.slice(0, TEXT_BUDGET),
  ].join('\n')
}

function cleanList(value: unknown, max: number, maxLen = 160): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const s = item.replace(/\s+/g, ' ').trim().slice(0, maxLen)
    if (s && !out.some((existing) => existing.toLowerCase() === s.toLowerCase())) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** Keep only plausible bare domains, and never the site's own. */
function cleanDomains(value: unknown, self: string): string[] {
  return cleanList(value, MAX_COMPETITORS, 80)
    .map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim())
    .filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) && d !== self && !d.endsWith(`.${self}`))
}

export async function fetchBusinessInsight(signals: SiteSignals, locale: Locale, selfDomain: string): Promise<InsightResult> {
  const client = getGeminiClient()
  if (!client) return { ok: false, reason: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }

  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    })
    const result = await model.generateContent(buildPrompt(signals, locale), { timeout: GEMINI_REQUEST_TIMEOUT_MS })
    const text = result.response.text()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { ok: false, reason: 'gemini_no_json' }
      parsed = JSON.parse(m[0]) as Record<string, unknown>
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.replace(/\s+/g, ' ').trim().slice(0, 900) : ''
    if (!summary) return { ok: false, reason: 'gemini_no_summary' }

    return {
      ok: true,
      insight: {
        business: {
          summary,
          audiences: cleanList(parsed.audiences, MAX_AUDIENCES),
          niche: typeof parsed.niche === 'string' ? parsed.niche.trim().slice(0, 80) || null : null,
          platform: typeof parsed.platform === 'string' ? parsed.platform.trim().slice(0, 40) || null : null,
        },
        keywords: cleanList(parsed.keywords, MAX_KEYWORDS),
        articles: cleanList(parsed.articles, MAX_ARTICLES, 200),
        competitors: cleanDomains(parsed.competitors, selfDomain),
      },
    }
  } catch (err) {
    // Never surface provider text to a merchant; log a message, return a code.
    console.error('[free-check] gemini error', { message: err instanceof Error ? err.message : String(err) })
    return { ok: false, reason: 'gemini_request_failed' }
  }
}

/** How many competitors the teaser shows before the signup gate. */
export const PUBLIC_COMPETITORS = 2
