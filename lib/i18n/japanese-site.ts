/**
 * The Japanese public site's gate, the same shape as the Spanish, Brazilian
 * Portuguese, French and Italian ones.
 *
 * OFF means genuinely absent, not merely unlinked: `/ja/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * It stays OFF until the owner says otherwise, which is also the owner's own
 * rule: a language launches only once its legal pages cover us in it. Japanese
 * has one document the other five do not — the 特定商取引法 disclosure a Japanese
 * buyer expects to find before paying — and it is part of that condition.
 */
export function japaneseSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED): boolean {
  return value === 'true'
}

/**
 * The footer entry for the 特定商取引法 disclosure, which only Japanese has.
 *
 * It lives here rather than in the public dictionary because the dictionary's
 * type is `typeof he` (lib/i18n/public/he.ts), so a key that exists in one
 * language only has nowhere to go in it; and it lives here rather than inline in
 * components/Footer.tsx because the footer is shared by seven languages and
 * carries no literal text of its own. The Act asks that the disclosure be where
 * the buyer can find it before paying, which is what the footer of every
 * Japanese page is.
 */
export const JAPANESE_TOKUSHO_LINK = { href: '/ja/tokusho', label: '特定商取引法に基づく表記' } as const
