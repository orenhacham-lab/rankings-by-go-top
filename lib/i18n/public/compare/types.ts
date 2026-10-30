/**
 * The words of one comparison page, in one language.
 *
 * Words only: no JSX, no icons, no links to our own pages. The page itself is
 * assembled in `components/public/ComparisonPage.tsx`, which is where the
 * shared calls to action and the shared template come from — so a comparison
 * page cannot quietly grow its own hero, its own buttons or its own order.
 *
 * `theirStrengths` is required, and that is the point of the type. A page about
 * a named competitor that lists only what they lack is not a comparison, it is
 * an advert that a reader stops trusting the moment they know the other product
 * — and they usually do, because they came here searching for it.
 */
export type ComparisonCopy = {
  /** The competitor's name, exactly as they write it. */
  competitor: string
  /** The short label in the breadcrumb and the hero's eyebrow. */
  eyebrow: string
  metaTitle: string
  metaDescription: string
  hero: {
    title: string
    /** The headline's second line. */
    accent: string
    subtitle: string
  }
  table: {
    eyebrow: string
    title: string
    rows: { label: string; ours: string; theirs: string }[]
    /** ISO date their pages were read. */
    checkedOn: string
    sources: { label: string; href: string }[]
  }
  /** When the other product is the better buy. Honest, and first. */
  theirStrengths: { eyebrow: string; title: string; intro: string; items: { title: string; body: string }[] }
  /** When ours is. */
  ourStrengths: { eyebrow: string; title: string; intro: string; items: { title: string; body: string }[] }
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] }
  close: { title: string }
}
