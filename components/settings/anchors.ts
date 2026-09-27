/**
 * The ids of the settings screen's sections, for its index and for the links
 * between its cards. The two connection anchors other screens link to live in
 * lib/content/content-hub-setup.ts and are not repeated here.
 */
export const SECTION = {
  scan: 'site-scan',
  business: 'business',
  profile: 'profile',
  audience: 'audience',
  competitors: 'competitors',
  connections: 'connections',
  googleAds: 'google-ads',
  danger: 'danger',
} as const

/** Bring a section into view, smoothly unless the owner asked for less motion. */
export function scrollToSection(id: string) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}
