/**
 * Brief-notes encoding (content module, Phase 3A).
 *
 * Phase 3A avoids new columns, so a couple of structured brief flags ride along
 * inside article_topics.brief_notes as an invisible trailing marker. The marker
 * is stripped before the notes are shown to the user and parsed at generation
 * time. Carries: includeBrandName + the exact brandNameToInclude to weave in.
 */

const MARKER_RE = /\n*\[\[brief:([^\]]*)\]\]\s*$/

export interface CtaDetails {
  text: string
  phone: string
  whatsapp: string
  url: string
}

/**
 * A planned internal link chosen at the topic/planning stage. Phrase-only: the
 * generator is asked to weave `anchorText` naturally into the body (no link),
 * and the editor validates + inserts the actual <a> afterward. Stored inside the
 * brief_notes marker (no new column). `source` records where the anchor came
 * from so we never invent one.
 */
export interface PlannedInternalLink {
  targetId: string
  targetUrl: string
  targetTitle: string
  anchorText: string
  source: 'primary_keyword' | 'historical_anchor' | 'secondary_keyword' | 'manual'
}

export interface BriefFlags {
  includeBrandName: boolean
  brandNameToInclude: string
  // Whether to inject a manual <nav> table of contents into the article HTML.
  // Default false: most WordPress sites have a TOC plugin/theme that builds it.
  includeManualToc: boolean
  // Concrete CTA contact details (only used when cta_preference !== 'none').
  // Stored here (not a column) so Gemini can use the REAL number/link and never
  // invents one. base64-encoded JSON so user text can't break the marker.
  cta: CtaDetails
  // Approved internal links to weave into the article (phrase-only at generation).
  internalLinks: PlannedInternalLink[]
}

export const EMPTY_CTA: CtaDetails = { text: '', phone: '', whatsapp: '', url: '' }
export function hasCtaDetails(c: CtaDetails | null | undefined): boolean {
  return !!c && !!(c.text.trim() || c.phone.trim() || c.whatsapp.trim() || c.url.trim())
}

function b64(s: string): string {
  try { return Buffer.from(s, 'utf8').toString('base64') } catch { return '' }
}
function unb64(s: string): string {
  try { return Buffer.from(s, 'base64').toString('utf8') } catch { return '' }
}

/** Append the flags marker to the user's free-text notes. */
export function encodeBriefNotes(notes: string, flags: BriefFlags): string {
  const clean = stripBriefMarker(notes)
  const parts = [`includeBrandName=${flags.includeBrandName ? '1' : '0'}`]
  // Base64 the brand name so it can't break the marker syntax or leak oddly.
  if (flags.includeBrandName && flags.brandNameToInclude.trim()) {
    parts.push(`brand=${b64(flags.brandNameToInclude.trim())}`)
  }
  if (flags.includeManualToc) parts.push('toc=1')
  if (hasCtaDetails(flags.cta)) {
    const c = flags.cta
    const trimmed: CtaDetails = { text: c.text.trim(), phone: c.phone.trim(), whatsapp: c.whatsapp.trim(), url: c.url.trim() }
    parts.push(`cta=${b64(JSON.stringify(trimmed))}`)
  }
  // Approved internal links (phrase-only). base64 JSON so text can't break the marker.
  const links = (flags.internalLinks || []).filter((l) => l.anchorText.trim() && l.targetUrl.trim())
  if (links.length) parts.push(`links=${b64(JSON.stringify(links))}`)
  const marker = `[[brief:${parts.join(';')}]]`
  return clean ? `${clean}\n\n${marker}` : marker
}

/** Remove the trailing marker so only human notes remain. */
export function stripBriefMarker(raw: string | null | undefined): string {
  return (raw || '').replace(MARKER_RE, '').trim()
}

// ---------------------------------------------------------------------------
// Human notes are split into two readable sections inside the SAME brief_notes
// text (no new column, no change to the hidden [[brief:…]] marker). Structural
// headers are fixed ASCII so parsing is language-independent and round-trips.
// ---------------------------------------------------------------------------

const SECTION_ANGLE = '[ARTICLE ANGLE]'
const SECTION_INCLUDE = '[MUST INCLUDE]'
const SECTION_AVOID = '[MUST AVOID]'

export interface BriefSections {
  articleAngle: string
  mustInclude: string
  mustAvoid: string
}

/** Compose the sections into a single plain-text notes string. */
export function encodeBriefSections(s: BriefSections): string {
  const angle = (s.articleAngle || '').trim()
  const inc = (s.mustInclude || '').trim()
  const avoid = (s.mustAvoid || '').trim()
  const parts: string[] = []
  if (angle) parts.push(`${SECTION_ANGLE}\n${angle}`)
  if (inc) parts.push(`${SECTION_INCLUDE}\n${inc}`)
  if (avoid) parts.push(`${SECTION_AVOID}\n${avoid}`)
  return parts.join('\n\n')
}

/**
 * Split notes back into sections. Legacy free-text notes (no headers) go into
 * mustInclude so nothing is lost. Order-agnostic across any header set.
 */
export function decodeBriefSections(notes: string | null | undefined): BriefSections {
  const empty: BriefSections = { articleAngle: '', mustInclude: '', mustAvoid: '' }
  const text = (notes || '').trim()
  if (!text) return empty
  const headers: { key: keyof BriefSections; tag: string }[] = [
    { key: 'articleAngle', tag: SECTION_ANGLE },
    { key: 'mustInclude', tag: SECTION_INCLUDE },
    { key: 'mustAvoid', tag: SECTION_AVOID },
  ]
  const found = headers
    .map((h) => ({ ...h, idx: text.indexOf(h.tag) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
  if (!found.length) return { ...empty, mustInclude: text } // legacy free text
  const res: BriefSections = { ...empty }
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx + found[i].tag.length
    const end = i + 1 < found.length ? found[i + 1].idx : text.length
    res[found[i].key] = text.slice(start, end).trim()
  }
  return res
}

/** Parse the flags (and clean notes) from a stored brief_notes value. */
export function decodeBriefNotes(raw: string | null | undefined): { notes: string; flags: BriefFlags } {
  const text = raw || ''
  const m = text.match(MARKER_RE)
  const flags: BriefFlags = { includeBrandName: false, brandNameToInclude: '', includeManualToc: false, cta: { ...EMPTY_CTA }, internalLinks: [] }
  if (m) {
    const body = m[1]
    if (/includeBrandName=1/.test(body)) flags.includeBrandName = true
    if (/toc=1/.test(body)) flags.includeManualToc = true
    const brand = body.match(/brand=([^;]*)/)
    if (brand) flags.brandNameToInclude = unb64(brand[1])
    const ctaM = body.match(/cta=([^;]*)/)
    if (ctaM) {
      try {
        const o = JSON.parse(unb64(ctaM[1])) as Partial<CtaDetails>
        flags.cta = { text: String(o.text || ''), phone: String(o.phone || ''), whatsapp: String(o.whatsapp || ''), url: String(o.url || '') }
      } catch { /* ignore malformed cta marker */ }
    }
    const linksM = body.match(/links=([^;]*)/)
    if (linksM) {
      try {
        const arr = JSON.parse(unb64(linksM[1])) as unknown[]
        flags.internalLinks = (Array.isArray(arr) ? arr : [])
          .map((x) => {
            const o = (x || {}) as Record<string, unknown>
            return {
              targetId: String(o.targetId || ''),
              targetUrl: String(o.targetUrl || ''),
              targetTitle: String(o.targetTitle || ''),
              anchorText: String(o.anchorText || ''),
              source: (['primary_keyword', 'historical_anchor', 'secondary_keyword', 'manual'].includes(String(o.source)) ? o.source : 'manual') as PlannedInternalLink['source'],
            }
          })
          .filter((l) => l.anchorText.trim() && l.targetUrl.trim())
      } catch { /* ignore malformed links marker */ }
    }
  }
  return { notes: stripBriefMarker(text), flags }
}
