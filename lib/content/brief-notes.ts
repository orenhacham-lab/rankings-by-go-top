/**
 * Brief-notes encoding (content module, Phase 3A hardening).
 *
 * Phase 3A avoids new columns, so a couple of structured brief flags ride along
 * inside article_topics.brief_notes as an invisible trailing marker. The marker
 * is stripped before the notes are shown to the user and parsed at generation
 * time. Currently carries: includeBrandName (may the article mention the
 * business/brand name).
 */

const MARKER_RE = /\n*\[\[brief:([^\]]*)\]\]\s*$/

export interface BriefFlags {
  includeBrandName: boolean
}

/** Append the flags marker to the user's free-text notes. */
export function encodeBriefNotes(notes: string, flags: BriefFlags): string {
  const clean = stripBriefMarker(notes)
  const marker = `[[brief:includeBrandName=${flags.includeBrandName ? '1' : '0'}]]`
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
  const flags: BriefFlags = { includeBrandName: false }
  if (m) {
    const body = m[1]
    if (/includeBrandName=1/.test(body)) flags.includeBrandName = true
  }
  return { notes: stripBriefMarker(text), flags }
}
