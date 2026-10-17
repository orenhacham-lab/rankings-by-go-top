/**
 * The dashboard in BRAZILIAN PORTUGUESE, assembled from the parts beside this
 * file.
 *
 * Like the Spanish dictionary it is a DeepPartial merged over ENGLISH
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew), so a section
 * that has not been translated yet shows English words in a left-to-right
 * layout — which a Brazilian reader can work with — rather than Hebrew in a
 * right-to-left one, which they cannot.
 *
 * WHY PARTS AND NOT ONE FILE. es.ts is a single 400 KB module and it is the
 * hardest file in the repository to edit or review. Each part here owns WHOLE
 * top-level sections of the dictionary and they are combined by a flat spread,
 * never a deep merge, so two parts can never half-own one section: the guard in
 * lib/i18n/dashboard/__qa__/portuguese-dashboard.qa.ts fails if any section
 * name appears in two parts, which is the one mistake this arrangement allows.
 *
 * The register is written down once, at the top of chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { chromePtBR } from './chrome'
import { contentHubPtBR } from './content-hub'
import { homePtBR } from './home'
import { projectsPtBR } from './projects'
import { billingPtBR } from './billing'
import { trackingPtBR } from './tracking'
import { projectSettingsPtBR } from './project-settings'
import { projectDetailPtBR } from './project-detail'
import { siteHealthPtBR } from './site-health'
import { siteLinksPtBR } from './site-links'
import { strategyPtBR } from './strategy'
import { seedOnboardingPtBR } from './seed-onboarding'
import { keywordResearchPtBR } from './keyword-research'
import { aiVisibilityPtBR } from './ai-visibility'
import { guidePtBR } from './guide'

/** Every part, in the order the sections appear in the English dictionary. */
export const PT_BR_PARTS: Array<DeepPartial<DashboardDictionary>> = [
  chromePtBR,
  contentHubPtBR,
  homePtBR,
  projectsPtBR,
  billingPtBR,
  trackingPtBR,
  projectSettingsPtBR,
  projectDetailPtBR,
  siteHealthPtBR,
  siteLinksPtBR,
  strategyPtBR,
  seedOnboardingPtBR,
  keywordResearchPtBR,
  aiVisibilityPtBR,
  guidePtBR,
]

export const dashboardPtBR: DeepPartial<DashboardDictionary> = Object.assign({}, ...PT_BR_PARTS)
