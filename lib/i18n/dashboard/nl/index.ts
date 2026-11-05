/**
 * The dashboard in DUTCH, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese, French, Italian, Japanese and German
 * dictionaries it is a DeepPartial merged over ENGLISH
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew), so a section
 * that has not been translated yet shows English words in a left-to-right
 * layout — which a Dutch reader can work with — rather than Hebrew in a
 * right-to-left one, which they cannot. It is COMPLETE: it answers every path
 * the German dictionary answers, so the English underneath is a safety net
 * rather than something a Dutch reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/dutch-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeNl } from './chrome'
import { contentHubNl } from './content-hub'
import { homeNl } from './home'
import { projectsNl } from './projects'
import { billingNl } from './billing'
import { trackingNl } from './tracking'
import { projectSettingsNl } from './project-settings'
import { projectDetailNl } from './project-detail'
import { siteHealthNl } from './site-health'
import { siteLinksNl } from './site-links'
import { strategyNl } from './strategy'
import { seedOnboardingNl } from './seed-onboarding'
import { keywordResearchNl } from './keyword-research'
import { aiVisibilityNl } from './ai-visibility'
import { guideNl } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const NL_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeNl,
  contentHubNl,
  homeNl,
  projectsNl,
  billingNl,
  trackingNl,
  projectSettingsNl,
  projectDetailNl,
  siteHealthNl,
  siteLinksNl,
  strategyNl,
  seedOnboardingNl,
  keywordResearchNl,
  aiVisibilityNl,
  guideNl,
]

export const dashboardNl: DeepPartial<DashboardDictionary> = Object.assign({}, ...NL_PARTS)
