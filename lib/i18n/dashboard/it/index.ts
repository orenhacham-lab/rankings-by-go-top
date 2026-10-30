/**
 * The dashboard in ITALIAN, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese and French dictionaries it is a
 * DeepPartial merged over ENGLISH (lib/i18n/dashboard/merge.ts says why English
 * and not Hebrew), so a section that has not been translated yet shows English
 * words in a left-to-right layout — which an Italian reader can work with —
 * rather than Hebrew in a right-to-left one, which they cannot. It is
 * COMPLETE: it answers every path the French dictionary answers, so the English
 * underneath is a safety net rather than something an Italian reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/italian-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeIt } from './chrome'
import { contentHubIt } from './content-hub'
import { homeIt } from './home'
import { projectsIt } from './projects'
import { billingIt } from './billing'
import { trackingIt } from './tracking'
import { projectSettingsIt } from './project-settings'
import { projectDetailIt } from './project-detail'
import { siteHealthIt } from './site-health'
import { siteLinksIt } from './site-links'
import { strategyIt } from './strategy'
import { seedOnboardingIt } from './seed-onboarding'
import { keywordResearchIt } from './keyword-research'
import { aiVisibilityIt } from './ai-visibility'
import { guideIt } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const IT_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeIt,
  contentHubIt,
  homeIt,
  projectsIt,
  billingIt,
  trackingIt,
  projectSettingsIt,
  projectDetailIt,
  siteHealthIt,
  siteLinksIt,
  strategyIt,
  seedOnboardingIt,
  keywordResearchIt,
  aiVisibilityIt,
  guideIt,
]

export const dashboardIt: DeepPartial<DashboardDictionary> = Object.assign({}, ...IT_PARTS)
