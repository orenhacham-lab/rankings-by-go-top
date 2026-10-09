import { Fragment } from 'react'
import Image from 'next/image'
import { CalendarDays, Clock, FileQuestion, ListTree, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import BackLink from '@/components/ui/BackLink'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { CONTAINER } from '@/components/public/marketing'
import { ArticlesPromo } from '@/components/public/ArticlesPromo'
import { ArticlePlans } from '@/components/public/articles/ArticlePlans'
import { ArticleCta } from '@/components/public/articles/ArticleCta'
import { ArticleAuthorBox } from '@/components/public/articles/ArticleAuthorBox'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'
import { ARTICLES_COPY, articlesIndexHref } from '@/lib/articles/i18n'
import { getPublicArticle } from '@/lib/articles/server'
import { withHeadingIds } from '@/lib/articles/headings'
import { splitArticleBlocks } from '@/lib/articles/widgets'
import { readingMinutes } from '@/lib/articles/reading-time'
import { resolveBillingMarket } from '@/lib/billing/server-market'
import { INTL_LOCALE, localeHomeHref, type PublicLocale } from '@/lib/i18n/locales'

// ============================================================
// ARTICLE ACCESS CONTROL NOTE
// ============================================================
// Articles are reachable by direct URL /<locale>/articles/[slug].
// SECURITY: only published rows are selected (is_published=true), and the row
//   is read with the anon key under RLS, as before — moving the read to the
//   server did not give this page the service role.
// DISCOVERY: an article is linked only from the /articles listing of its own
//   language; a slug from another language is a 404 here.

/**
 * ONE ARTICLE, RENDERED ON THE SERVER.
 *
 * This was a client component: it fetched the row in `useEffect`, parsed the
 * HTML with DOMParser to add heading ids, and rendered. So the HTML a crawler
 * received carried the title, the metadata and the JSON-LD, and in place of the
 * article a loading skeleton — verified on the live page, where a sentence from
 * the middle of the article could not be found in the response. Google runs
 * JavaScript; several of the AI engines' crawlers do not, and these articles
 * exist to be read by those engines.
 *
 * Rendering here also makes two things possible that flat HTML could not give:
 * the body can hold REAL components (`lib/articles/widgets.ts` — the plan cards
 * priced in the visitor's own currency, the trial call to action), and the
 * table of contents is in the markup rather than assembled after load.
 *
 * The `locale` filter is not decoration: without it `/en/articles/<hebrew-slug>`
 * would render Hebrew copy inside the English shell, and two languages could
 * never reuse a slug.
 */
export async function ArticleView({ locale, slug }: { locale: PublicLocale; slug: string }) {
  const copy = ARTICLES_COPY[locale]
  const indexHref = articlesIndexHref(locale)
  const article = await getPublicArticle(slug, locale)

  if (!article) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicNav locale={locale} />
        <main className="flex-1">
          <div className={`${CONTAINER} max-w-3xl pt-28 pb-16 lg:pt-32`}>
            <Breadcrumbs
              locale={locale}
              items={[{ label: copy.index.breadcrumb, href: indexHref }, { label: copy.article.notFoundTitle, href: '#' }]}
            />
            <div className="mt-8 flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
              <div className="mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70" aria-hidden="true">
                <FileQuestion className="size-5" />
              </div>
              <h1 className="text-title font-bold tracking-tight text-ink">{copy.article.notFoundTitle}</h1>
              <p className="text-copy text-muted">{copy.article.notFoundBody}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <BackLink href={indexHref}>{copy.article.backToArticles}</BackLink>
                <BackLink href={localeHomeHref(locale)}>{copy.article.backHome}</BackLink>
              </div>
            </div>
          </div>
        </main>
        <Footer locale={locale} />
      </div>
    )
  }

  // Sanitized at render as well as on write (lib/content/public-article-html):
  // this HTML is injected on the app's own origin.
  const { html, headings } = withHeadingIds(sanitizePublicArticleHtml(article.content))
  const blocks = splitArticleBlocks(html)
  const hasCta = blocks.some((b) => b.kind === 'widget' && b.widget === 'cta')
  // The index the author box is rendered at: just before a closing call to
  // action when the article has one, otherwise at the very end of the body.
  const lastCta = blocks.map((b) => b.kind === 'widget' && b.widget === 'cta').lastIndexOf(true)
  const authorBoxBefore = lastCta === -1 ? blocks.length : lastCta
  const minutes = readingMinutes(html)

  // The plan cards need the visitor's currency, which is a server decision
  // (the account's stored market, else the country header) — the same one the
  // pricing page makes, so an article cannot quote a different price.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { market } = await resolveBillingMarket(supabase, user)
  const signedIn = !!user

  const dateFormat = { year: 'numeric', month: 'long', day: 'numeric' } as const
  const published = article.published_at
    ? new Date(article.published_at).toLocaleDateString(INTL_LOCALE[locale], dateFormat)
    : null
  // Shown only when it is a real revision, not the row's own creation.
  const updated = article.updated_at && article.published_at
    && new Date(article.updated_at).getTime() - new Date(article.published_at).getTime() > 36e5
    ? new Date(article.updated_at).toLocaleDateString(INTL_LOCALE[locale], dateFormat)
    : null

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />
      <main className="flex-1">
        {/* ── The opening: everything a reader decides on before scrolling ── */}
        <header className="border-b border-line bg-surface">
          <div className={`${CONTAINER} max-w-5xl pt-28 pb-10 lg:pt-32 lg:pb-12`}>
            <Breadcrumbs
              locale={locale}
              items={[{ label: copy.index.breadcrumb, href: indexHref }, { label: article.title, href: '#' }]}
            />

            <h1 className="mt-6 max-w-3xl text-display font-bold tracking-tight text-ink text-balance">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="mt-4 max-w-3xl text-section text-body text-pretty">{article.excerpt}</p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
              {article.author && (
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 items-center justify-center rounded-pill bg-action-soft text-caption font-bold text-action"
                    aria-hidden="true"
                  >
                    {article.author.charAt(0)}
                  </span>
                  <span className="text-copy font-semibold text-ink">{article.author}</span>
                </div>
              )}
              {published && (
                <span className="flex items-center gap-1.5 text-copy text-muted">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {published}
                </span>
              )}
              {updated && (
                <span className="flex items-center gap-1.5 text-copy text-muted">
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {copy.article.updated} {updated}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-copy text-muted">
                <Clock className="size-4" aria-hidden="true" />
                {copy.article.readingTime(minutes)}
              </span>
            </div>
          </div>
        </header>

        <div className={`${CONTAINER} max-w-5xl pb-16 lg:pb-20`}>
          {article.featured_image_url && (
            <div className="relative -mt-px aspect-[2/1] w-full overflow-hidden rounded-b-card border-x border-b border-line bg-sunk shadow-card">
              <Image
                src={article.featured_image_url}
                alt={article.featured_image_alt || article.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-cover"
              />
            </div>
          )}

          {/* The contents list is a sticky column from the large breakpoint up
              and a plain box above the text below it — one nav either way, so
              there is never a second copy of the same anchors. */}
          <div className="mt-10 lg:mt-12 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
            {headings.length > 1 && (
              <nav aria-labelledby="article-toc" className="mb-8 lg:mb-0 lg:sticky lg:top-28 lg:self-start">
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <h2
                    id="article-toc"
                    className="mb-3 flex items-center gap-2 border-b border-line pb-3 text-copy font-semibold text-ink"
                  >
                    <ListTree className="size-4 text-action" aria-hidden="true" />
                    {copy.article.toc}
                  </h2>
                  <ul className="space-y-2">
                    {headings.map((heading) => (
                      <li key={heading.id} style={{ paddingInlineStart: (heading.level - 2) * 12 }}>
                        <a
                          href={`#${heading.id}`}
                          className="rounded-control text-caption text-body underline-offset-4 transition-colors duration-150 ease-snappy hover:text-action hover:underline"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            )}

            <article className="min-w-0 max-w-3xl">
              {blocks.map((block, i) => (
                <Fragment key={i}>
                  {/* Who wrote this comes BEFORE the closing call to action: a
                      reader weighs the claim, then decides what to do about it. */}
                  {i === authorBoxBefore && <ArticleAuthorBox locale={locale} author={article.author} />}
                  {block.kind === 'html' ? (
                    <div className="gt-article" dangerouslySetInnerHTML={{ __html: block.html }} />
                  ) : block.widget === 'plans' ? (
                    <ArticlePlans locale={locale} market={market} signedIn={signedIn} />
                  ) : (
                    <ArticleCta locale={locale} signedIn={signedIn} />
                  )}
                </Fragment>
              ))}
              {authorBoxBefore === blocks.length && <ArticleAuthorBox locale={locale} author={article.author} />}
            </article>
          </div>

          {/* The standing promo band is the article's call to action ONLY when the
              body does not carry its own: an article that ends with <div class="gt-cta">
              would otherwise close on two identical navy bands, one under the other. */}
          {!hasCta && (
            <div className="mt-14 sm:mt-16">
              <ArticlesPromo copy={copy.promo} />
            </div>
          )}
        </div>
      </main>
      <Footer locale={locale} />
    </div>
  )
}
