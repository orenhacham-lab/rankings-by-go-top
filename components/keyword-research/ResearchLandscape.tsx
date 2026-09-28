'use client'

/**
 * The research tab's two landscape sections, mounted only with the scan's research on
 * screen, so their reads (the project's audiences, its tracked competitors and their
 * rank rows, all database reads under the owner's session) happen only there:
 *   "who you are up against"  LandscapeRivals
 *   "who searches for you"    LandscapeAudiences
 */
import { useMemo } from 'react'
import { useProjectCompetitorComparison } from '@/components/competitors/useCompetitorComparison'
import { intentMix, keywordsByAudience } from '@/lib/content/strategy/insights'
import type { ScanKeyword } from '@/lib/keyword-research/scan-research'
import LandscapeRivals from './LandscapeRivals'
import LandscapeAudiences from './LandscapeAudiences'
import { competitorLandscape, gapDemand, type SeedLandscape } from './landscape'
import { useProjectAudiences } from './useProjectAudiences'

export const LANDSCAPE_IDS = { rivals: 'research-rivals', audiences: 'research-audiences' } as const

export default function ResearchLandscape({ projectId, keywords, seed, domain }: {
  projectId: string
  keywords: readonly ScanKeyword[]
  seed: SeedLandscape
  domain: string | null
}) {
  const compared = useProjectCompetitorComparison(projectId)
  const ownAudiences = useProjectAudiences(projectId)
  const relevant = useMemo(() => keywords.filter((k) => k.relevant !== false), [keywords])

  const landscape = useMemo(() => competitorLandscape({
    keywords: relevant,
    scan: seed.competitors,
    tracked: compared.status === 'ready' || compared.status === 'loading' ? compared.competitors : [],
    standings: compared.comparison?.standings ?? [],
    ownDomain: domain,
  }), [relevant, seed.competitors, compared.status, compared.competitors, compared.comparison, domain])

  const labels = ownAudiences && ownAudiences.length > 0 ? ownAudiences : seed.audiences
  const audiences = useMemo(() => keywordsByAudience(labels, relevant), [labels, relevant])
  const mix = useMemo(() => intentMix(relevant), [relevant])

  return (
    <>
      <LandscapeRivals id={LANDSCAPE_IDS.rivals} landscape={landscape} domain={domain} siteIcon={seed.siteIcon} gapSearches={gapDemand(relevant)} />
      <LandscapeAudiences id={LANDSCAPE_IDS.audiences} audiences={audiences} mix={mix} niche={seed.niche} />
    </>
  )
}
