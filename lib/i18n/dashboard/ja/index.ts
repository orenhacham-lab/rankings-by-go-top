/**
 * The dashboard in JAPANESE, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese, French and Italian dictionaries it is
 * a DeepPartial merged over ENGLISH (lib/i18n/dashboard/merge.ts says why
 * English and not Hebrew), so a section that has not been translated yet shows
 * English words in a left-to-right layout — which a Japanese reader can work
 * with — rather than Hebrew in a right-to-left one, which they cannot. It is
 * COMPLETE: it answers every path the Italian dictionary answers, so the English
 * underneath is a safety net rather than something a Japanese reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/japanese-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register, the typography and the glossary are written down once, at the
 * top of chrome.ts, and hold for every file in this folder.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeJa } from './chrome'
import { contentHubJa } from './content-hub'
import { homeJa } from './home'
import { projectsJa } from './projects'
import { billingJa } from './billing'
import { trackingJa } from './tracking'
import { projectSettingsJa } from './project-settings'
import { projectDetailJa } from './project-detail'
import { siteHealthJa } from './site-health'
import { siteLinksJa } from './site-links'
import { strategyJa } from './strategy'
import { seedOnboardingJa } from './seed-onboarding'
import { keywordResearchJa } from './keyword-research'
import { aiVisibilityJa } from './ai-visibility'
import { guideJa } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const JA_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeJa,
  contentHubJa,
  homeJa,
  projectsJa,
  billingJa,
  trackingJa,
  projectSettingsJa,
  projectDetailJa,
  siteHealthJa,
  siteLinksJa,
  strategyJa,
  seedOnboardingJa,
  keywordResearchJa,
  aiVisibilityJa,
  guideJa,
]

export const dashboardJa: DeepPartial<DashboardDictionary> = Object.assign({}, ...JA_PARTS)
