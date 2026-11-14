/**
 * The dashboard in KOREAN, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese, French, Italian, Japanese, German,
 * Dutch and Polish dictionaries it is a DeepPartial merged over ENGLISH
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew), so a section
 * that has not been translated yet shows English words in a left-to-right
 * layout — which a Korean reader can work with — rather than Hebrew in a
 * right-to-left one, which they cannot. It is COMPLETE: it answers every path
 * the Polish dictionary answers, so the English underneath is a safety net
 * rather than something a Korean reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/korean-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeKo } from './chrome'
import { contentHubKo } from './content-hub'
import { homeKo } from './home'
import { projectsKo } from './projects'
import { billingKo } from './billing'
import { trackingKo } from './tracking'
import { projectSettingsKo } from './project-settings'
import { projectDetailKo } from './project-detail'
import { siteHealthKo } from './site-health'
import { siteLinksKo } from './site-links'
import { strategyKo } from './strategy'
import { seedOnboardingKo } from './seed-onboarding'
import { keywordResearchKo } from './keyword-research'
import { aiVisibilityKo } from './ai-visibility'
import { guideKo } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const KO_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeKo,
  contentHubKo,
  homeKo,
  projectsKo,
  billingKo,
  trackingKo,
  projectSettingsKo,
  projectDetailKo,
  siteHealthKo,
  siteLinksKo,
  strategyKo,
  seedOnboardingKo,
  keywordResearchKo,
  aiVisibilityKo,
  guideKo,
]

export const dashboardKo: DeepPartial<DashboardDictionary> = Object.assign({}, ...KO_PARTS)
