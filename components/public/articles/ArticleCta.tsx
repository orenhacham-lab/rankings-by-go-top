import { ArrowLeft, Sparkles } from 'lucide-react'
import { ButtonLink } from '@/components/public/marketing'
import { authHref } from '@/lib/i18n/auth-href'
import type { PublicLocale } from '@/lib/i18n/locales'
import { ARTICLES_COPY } from '@/lib/articles/i18n'

/**
 * THE CALL TO ACTION, INSIDE AN ARTICLE — `<div class="gt-cta"></div>`.
 *
 * An article used to end its argument with a sentence carrying two inline
 * links, which reads as a footnote: by the time a reader has agreed with the
 * article, the thing to do next should be the most visible element on the
 * screen, not a blue word in a paragraph. The free check is the secondary
 * action, because it needs no account and is the honest first step for a
 * reader who is not ready to sign up.
 */
export function ArticleCta({ locale, signedIn }: { locale: PublicLocale; signedIn: boolean }) {
  const copy = ARTICLES_COPY[locale].widgets.cta
  const checkHref = locale === 'he' ? '/free-check' : `/${locale}/free-check`

  return (
    <aside className="relative my-12 overflow-hidden rounded-card bg-contrast p-6 text-contrast-ink shadow-card sm:my-14 sm:p-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_110%_at_100%_0%,rgb(0_134_245/0.22),transparent_60%)] rtl:bg-[radial-gradient(80%_110%_at_0%_0%,rgb(0_134_245/0.22),transparent_60%)]"
      />
      <div className="relative max-w-2xl">
        <span
          className="mb-4 inline-flex h-7 items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-3 text-caption font-semibold text-contrast-ink"
        >
          <Sparkles className="size-3.5 text-rail-tagline" aria-hidden="true" />
          Go Top SEO
        </span>
        <p className="text-title font-bold tracking-tight text-contrast-ink text-balance">{copy.title}</p>
        <p className="mt-3 text-section font-normal text-contrast-ink/75 text-pretty">{copy.body}</p>

        <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={signedIn ? '/dashboard' : authHref('signup', locale)} size="lg">
            {copy.primary}
          </ButtonLink>
          <a
            href={checkHref}
            className="inline-flex items-center gap-1.5 rounded-control text-copy font-semibold text-contrast-ink/85 underline-offset-4 hover:text-contrast-ink hover:underline"
          >
            {copy.secondary}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </a>
        </div>
      </div>
    </aside>
  )
}
