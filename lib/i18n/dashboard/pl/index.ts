/**
 * The dashboard in POLISH, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese, French, Italian, Japanese, German and
 * Dutch dictionaries it is a DeepPartial merged over ENGLISH
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew), so a section
 * that has not been translated yet shows English words in a left-to-right
 * layout — which a Polish reader can work with — rather than Hebrew in a
 * right-to-left one, which they cannot. It is COMPLETE: it answers every path
 * the Dutch dictionary answers, so the English underneath is a safety net
 * rather than something a Polish reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/polish-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromePl } from './chrome'
import { contentHubPl } from './content-hub'
import { homePl } from './home'
import { projectsPl } from './projects'
import { billingPl } from './billing'
import { trackingPl } from './tracking'
import { projectSettingsPl } from './project-settings'
import { projectDetailPl } from './project-detail'
import { siteHealthPl } from './site-health'
import { siteLinksPl } from './site-links'
import { strategyPl } from './strategy'
import { seedOnboardingPl } from './seed-onboarding'
import { keywordResearchPl } from './keyword-research'
import { aiVisibilityPl } from './ai-visibility'
import { guidePl } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const PL_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromePl,
  contentHubPl,
  homePl,
  projectsPl,
  billingPl,
  trackingPl,
  projectSettingsPl,
  projectDetailPl,
  siteHealthPl,
  siteLinksPl,
  strategyPl,
  seedOnboardingPl,
  keywordResearchPl,
  aiVisibilityPl,
  guidePl,
]

export const dashboardPl: DeepPartial<DashboardDictionary> = Object.assign({}, ...PL_PARTS)
