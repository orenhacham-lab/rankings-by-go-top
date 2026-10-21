/**
 * The dashboard in FRENCH, assembled from the parts beside this file.
 *
 * Like the Spanish and Brazilian Portuguese dictionaries it is a DeepPartial
 * merged over ENGLISH (lib/i18n/dashboard/merge.ts says why English and not
 * Hebrew), so a section that has not been translated yet shows English words in
 * a left-to-right layout — which a French reader can work with — rather than
 * Hebrew in a right-to-left one, which they cannot. It is COMPLETE: it answers
 * every path the Portuguese dictionary answers, so the English underneath is a
 * safety net rather than something a French reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/french-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeFr } from './chrome'
import { contentHubFr } from './content-hub'
import { homeFr } from './home'
import { projectsFr } from './projects'
import { billingFr } from './billing'
import { trackingFr } from './tracking'
import { projectSettingsFr } from './project-settings'
import { projectDetailFr } from './project-detail'
import { siteHealthFr } from './site-health'
import { siteLinksFr } from './site-links'
import { strategyFr } from './strategy'
import { seedOnboardingFr } from './seed-onboarding'
import { keywordResearchFr } from './keyword-research'
import { aiVisibilityFr } from './ai-visibility'
import { guideFr } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const FR_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeFr,
  contentHubFr,
  homeFr,
  projectsFr,
  billingFr,
  trackingFr,
  projectSettingsFr,
  projectDetailFr,
  siteHealthFr,
  siteLinksFr,
  strategyFr,
  seedOnboardingFr,
  keywordResearchFr,
  aiVisibilityFr,
  guideFr,
]

export const dashboardFr: DeepPartial<DashboardDictionary> = Object.assign({}, ...FR_PARTS)
