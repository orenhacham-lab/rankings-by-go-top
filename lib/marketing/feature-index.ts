/**
 * THE TWELVE FEATURE PAGES, as a list — what /features (the hub) shows.
 *
 * /features itself answered 404 while all twelve /features/* pages existed and
 * were in the sitemap (measured 15.11.2026): the menu's own address, the one a
 * visitor types or a crawler guesses, led nowhere.
 *
 * The page's words are the ones the nav menu already carries in every language
 * (`nav.featuresMenu[id]` and `nav.featureGroups`), so the hub cannot say a
 * feature something different from the menu that links to it. Only the slug,
 * the group and the icon live here; the guard in
 * lib/i18n/__qa__/features-index.qa.ts keeps this list and the nav's own list
 * of links in step.
 */
import {
  BarChart3, Building2, FileText, LineChart, MapPin, MapPinned, Search, Sparkles, Telescope, Users, Waypoints, Wrench,
  type LucideIcon,
} from 'lucide-react'

export type FeatureGroupId = 'measure' | 'act' | 'prove'

export type FeatureEntry = {
  /** Its key in `nav.featuresMenu`, which holds its label and description in every language. */
  id: string
  slug: string
  icon: LucideIcon
  group: FeatureGroupId
}

export const FEATURE_INDEX: readonly FeatureEntry[] = [
  // What the system measures.
  { id: 'googleOrganic', slug: 'google-organic-rank-tracking', icon: Search, group: 'measure' },
  { id: 'googleMaps', slug: 'google-maps-rank-tracking', icon: MapPin, group: 'measure' },
  { id: 'aiVisibility', slug: 'ai-visibility-tracking', icon: Sparkles, group: 'measure' },
  { id: 'keywordResearch', slug: 'keyword-research', icon: Telescope, group: 'measure' },
  // The work it does.
  { id: 'contentPublishing', slug: 'seo-geo-content-publishing', icon: FileText, group: 'act' },
  { id: 'businessProfile', slug: 'google-business-profile', icon: Building2, group: 'act' },
  { id: 'mapsPosts', slug: 'google-maps-posts', icon: MapPinned, group: 'act' },
  { id: 'siteFixes', slug: 'site-health-fixes', icon: Wrench, group: 'act' },
  { id: 'links', slug: 'site-links', icon: Waypoints, group: 'act' },
  // How the results are shown.
  { id: 'competitors', slug: 'competitor-tracking', icon: Users, group: 'prove' },
  { id: 'searchConsole', slug: 'search-console', icon: LineChart, group: 'prove' },
  { id: 'reports', slug: 'seo-geo-reports', icon: BarChart3, group: 'prove' },
]

export const FEATURE_GROUP_ORDER: readonly FeatureGroupId[] = ['measure', 'act', 'prove']

export const featuresOfGroup = (group: FeatureGroupId): readonly FeatureEntry[] =>
  FEATURE_INDEX.filter((f) => f.group === group)
