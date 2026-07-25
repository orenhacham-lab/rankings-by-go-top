/**
 * M — Content Hub ideas destination sub-tab mapping (pure, testable).
 *
 * The ideas area has two sub-tabs: 'auto' (the automatic article-ideas workflow)
 * and 'manual' (manual topic creation). The selection is carried in the URL as
 * `?section=` so a refresh / deep-link preserves it. Canonical param values:
 * automatic → 'ideas' (the documented deep-link), manual → 'manual'.
 */
export type IdeasSection = 'auto' | 'manual'

/** URL `section` param → sub-tab. Only 'manual' selects manual; everything else
 *  (including 'ideas', 'auto', absent, or junk) defaults to the automatic ideas. */
export function ideasSectionFromParam(param: string | null | undefined): IdeasSection {
  return param === 'manual' ? 'manual' : 'auto'
}

/** Sub-tab → canonical URL `section` value ('ideas' for automatic, 'manual' for manual). */
export function ideasSectionToParam(section: IdeasSection): 'ideas' | 'manual' {
  return section === 'manual' ? 'manual' : 'ideas'
}
