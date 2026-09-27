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
import type { CommerceType, FreeCheckBusiness } from './types'
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
    '{"summary":string,"niche":string,"companyName":string|null,"commerceType":"product"|"service"|"content"|"other",'
      + '"isLocal":boolean,"country":string|null,"platform":string|null,"audiences":string[],'
      + '"keywords":string[],"articles":string[],"competitors":string[]}',
    '',
    'Rules:',
    `- "summary": 2-3 sentences on what the business sells and how, grounded ONLY in the page text below. If the text does not say, say what is visible and no more. Never invent brands, locations, certifications or claims.`,
    `- "niche": a short label, at most 6 words.`,
    `- "companyName": the business's own name as the page presents it, without a tagline or a city. null if the page never states it.`,
    `- "commerceType": "product" when it sells goods, "service" when it sells work or appointments, "content" when it publishes rather than sells, "other" when none fits.`,
    `- "isLocal": true only when the business serves a specific place (a shop, a clinic, a tradesperson, a restaurant), false for a nationwide or online-only business.`,
    `- "country": ISO-3166-1 alpha-2, from an address, a currency, a phone prefix or a domain suffix on the page. null when the page gives no evidence. Never infer it from the language alone.`,
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
    `PLATFORM DETECTED FROM MARKUP: ${signals.platform ?? '(none)'}`,
    `CONTACT IN STRUCTURED DATA: ${[signals.contact.address, signals.contact.phone].filter(Boolean).join(' · ') || '(none)'}`,
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

const COMMERCE_TYPES = new Set<CommerceType>(['product', 'service', 'content', 'other'])

/**
 * Fold the model's answer together with what the page itself proved. The
 * deterministic facts WIN on every field they cover: the platform read off the
 * markup, the language from the `lang` attribute, the address and phone from
 * JSON-LD. The model only fills what markup cannot state.
 */
function buildBusiness(parsed: Record<string, unknown>, summary: string, signals: SiteSignals): FreeCheckBusiness {
  const commerce = typeof parsed.commerceType === 'string' ? parsed.commerceType.trim().toLowerCase() : ''
  const country = typeof parsed.country === 'string' ? parsed.country.trim().toUpperCase() : ''
  return {
    summary,
    audiences: cleanList(parsed.audiences, MAX_AUDIENCES),
    niche: typeof parsed.niche === 'string' ? parsed.niche.trim().slice(0, 80) || null : null,
    // Markup beats the model: a fingerprint is evidence, an answer is a guess.
    platform: signals.platform ?? (typeof parsed.platform === 'string' ? parsed.platform.trim().slice(0, 40) || null : null),
    companyName: typeof parsed.companyName === 'string' ? parsed.companyName.trim().slice(0, 120) || null : null,
    commerceType: COMMERCE_TYPES.has(commerce as CommerceType) ? (commerce as CommerceType) : 'other',
    isLocal: parsed.isLocal === true,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    language: signals.htmlLang,
    address: signals.contact.address,
    phone: signals.contact.phone,
  }
}

/** Keep only plausible bare domains, and never the site's own. */
function cleanDomains(value: unknown, self: string): string[] {
  return cleanList(value, MAX_COMPETITORS, 80)
    // slice at the first '/' rather than /\/.*$/, which backtracks quadratically
    // on a value holding a CR or U+2028. See stripLineComment in html-signals.
    .map((d) => {
      const bare = d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
      const at = bare.indexOf('/')
      return (at < 0 ? bare : bare.slice(0, at)).trim()
    })
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
        business: buildBusiness(parsed, summary, signals),
        keywords: cleanList(parsed.keywords, MAX_KEYWORDS),
        articles: cleanList(parsed.articles, MAX_ARTICLES, 200),
        competitors: cleanDomains(parsed.competitors, selfDomain),
      },
    }
  } catch (err) {
    // Neither the merchant NOR the logs get provider text. A provider's error
    // message is free-form and can carry back pieces of what we sent it —
    // page content, prompt text — into a log stream with a different audience
    // and a different retention. The error's class is enough to tell a timeout
    // from a rejection; anything more specific belongs in the provider's own
    // dashboard.
    console.error('[free-check] gemini error', {
      reason: 'gemini_request_failed',
      kind: err instanceof Error ? err.name : 'unknown',
    })
    return { ok: false, reason: 'gemini_request_failed' }
  }
}

/** How many competitors the teaser shows before the signup gate. */
export const PUBLIC_COMPETITORS = 2
