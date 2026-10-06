/**
 * The ids of the settings screen's sections, for its index, for the links
 * between its cards, and for links from other screens. The two connection
 * anchors (#platform, #search-console) live in lib/content/content-hub-setup.ts
 * and are not repeated here.
 */
export const SECTION = {
  scan: 'site-scan',
  business: 'business',
  profile: 'profile',
  audience: 'audiences',
  competitors: 'competitors',
  writingGuidance: 'writing-guidance',
  articleDesign: 'article-design',
  officialProfiles: 'official-profiles',
  connections: 'connections',
  siteAutoFix: 'site-auto-fix',
  googleAds: 'google-ads',
  danger: 'danger',
} as const

/**
 * Sections other screens link to by hash (the onboarding summary opens
 * /settings?projectId=…#business, #audiences and #competitors; an article's
 * page opens #writing-guidance; the site-health screen opens #site-auto-fix). The screen
 * scrolls to them on load, as it does to the two connection anchors.
 */
export const LINKED_SECTIONS: readonly string[] = [SECTION.business, SECTION.audience, SECTION.competitors, SECTION.writingGuidance, SECTION.siteAutoFix]

/** Bring a section into view, smoothly unless the owner asked for less motion. */
export function scrollToSection(id: string) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}
