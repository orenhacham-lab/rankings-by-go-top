/**
 * The dashboard in GERMAN, assembled from the parts beside this file.
 *
 * Like the Spanish, Brazilian Portuguese, French, Italian and Japanese
 * dictionaries it is a DeepPartial merged over ENGLISH
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew), so a section
 * that has not been translated yet shows English words in a left-to-right
 * layout — which a German reader can work with — rather than Hebrew in a
 * right-to-left one, which they cannot. It is COMPLETE: it answers every path
 * the Italian dictionary answers, so the English underneath is a safety net
 * rather than something a German reader meets.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/german-dashboard.qa.ts fails if any section name
 * appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromeDe } from './chrome'
import { contentHubDe } from './content-hub'
import { homeDe } from './home'
import { projectsDe } from './projects'
import { billingDe } from './billing'
import { trackingDe } from './tracking'
import { projectSettingsDe } from './project-settings'
import { projectDetailDe } from './project-detail'
import { siteHealthDe } from './site-health'
import { siteLinksDe } from './site-links'
import { strategyDe } from './strategy'
import { seedOnboardingDe } from './seed-onboarding'
import { keywordResearchDe } from './keyword-research'
import { aiVisibilityDe } from './ai-visibility'
import { guideDe } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const DE_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromeDe,
  contentHubDe,
  homeDe,
  projectsDe,
  billingDe,
  trackingDe,
  projectSettingsDe,
  projectDetailDe,
  siteHealthDe,
  siteLinksDe,
  strategyDe,
  seedOnboardingDe,
  keywordResearchDe,
  aiVisibilityDe,
  guideDe,
]

export const dashboardDe: DeepPartial<DashboardDictionary> = Object.assign({}, ...DE_PARTS)
