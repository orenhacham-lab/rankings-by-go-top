/**
 * Brief-notes encoding (content module, Phase 3A).
 *
 * Phase 3A avoids new columns, so a couple of structured brief flags ride along
 * inside article_topics.brief_notes as an invisible trailing marker. The marker
 * is stripped before the notes are shown to the user and parsed at generation
 * time. Carries: includeBrandName + the exact brandNameToInclude to weave in.
 */

const MARKER_RE = /\n*\[\[brief:([^\]]*)\]\]\s*$/

export interface BriefFlags {
  includeBrandName: boolean
  brandNameToInclude: string
  // Whether to inject a manual <nav> table of contents into the article HTML.
  // Default false: most WordPress sites have a TOC plugin/theme that builds it.
  includeManualToc: boolean
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
  const marker = `[[brief:${parts.join(';')}]]`
  return clean ? `${clean}\n\n${marker}` : marker
}

/** Remove the trailing marker so only human notes remain. */
export function stripBriefMarker(raw: string | null | undefined): string {
  return (raw || '').replace(MARKER_RE, '').trim()
}

/** Parse the flags (and clean notes) from a stored brief_notes value. */
export function decodeBriefNotes(raw: string | null | undefined): { notes: string; flags: BriefFlags } {
  const text = raw || ''
  const m = text.match(MARKER_RE)
  const flags: BriefFlags = { includeBrandName: false, brandNameToInclude: '', includeManualToc: false }
  if (m) {
    const body = m[1]
    if (/includeBrandName=1/.test(body)) flags.includeBrandName = true
    if (/toc=1/.test(body)) flags.includeManualToc = true
    const brand = body.match(/brand=([^;]*)/)
    if (brand) flags.brandNameToInclude = unb64(brand[1])
  }
  return { notes: stripBriefMarker(text), flags }
}
