/**
 * SERVER SIDE OF THE PUBLIC BLOG: metadata and JSON-LD, in every language.
 *
 * The page body is a client component (it reads Supabase from the browser), so
 * everything a crawler needs before JavaScript runs — title, description, Open
 * Graph, canonical, Article/Breadcrumb/FAQ schema — is produced here and
 * rendered by each locale's `layout.tsx`.
 *
 * This used to live, Hebrew-only, inside `app/(public)/articles/[slug]/layout.tsx`.
 * Four copies of it would have been four places to forget a fix, so the layouts
 * are now four thin files that pass their locale in.
 */
import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ARTICLES_COPY, articleHref, articlesIndexHref } from '@/lib/articles/i18n'
import { localeHomeHref, LOCALE_CONFIG, type PublicLocale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const SITE_URL = 'https://www.gotopseo.com'

/** The absolute URL of a path on the public site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === '/' ? '' : path}`
}

export interface PublicArticle {
  title: string
  meta_title: string | null
  meta_description: string | null
  excerpt: string | null
  content: string
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string | null
  published_at: string | null
  updated_at: string | null
}

/**
 * One published article of one language, or null.
 *
 * The `locale` filter is the same one the page body applies: a layout that
 * resolved the row by slug alone would emit English metadata for a Hebrew
 * article whose slug was typed under /en.
 *
 * `cache()` because three callers in one request want the same row — the
 * layout's metadata, its JSON-LD, and the page body, which is rendered on the
 * server now rather than fetched again from the browser.
 */
export const getPublicArticle = cache(async (slug: string, locale: PublicLocale): Promise<PublicArticle | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('title, meta_title, meta_description, excerpt, content, featured_image_url, featured_image_alt, author, published_at, updated_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('locale', locale)
    .single()

  return (data as PublicArticle | null) ?? null
})

/**
 * The FAQ block of an article, as schema.org Questions.
 *
 * It reads the shape the articles are written in: an `<h2>` whose text is the
 * locale's "frequently asked questions" heading, then one `<p><strong>question</strong><br>answer</p>`
 * per entry. The heading text is per language, so the Hebrew-only match this
 * replaces found nothing in a Spanish article and silently emitted no FAQ.
 */
export function extractFaqSchema(content: string, locale: PublicLocale): Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> {
  const faqSchema: Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> = []

  const heading = FAQ_HEADING[locale]
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const faqSectionMatch = content.match(new RegExp(`<h2[^>]*>[^<]*${escaped}[^<]*</h2>([\\s\\S]*?)(?=<h2|$)`, 'i'))
  if (!faqSectionMatch) return faqSchema

  const faqContent = faqSectionMatch[1]

  // Match each <p> containing <strong>question</strong><br>answer
  const pRegex = /<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*([^<]+)<\/p>/gi
  let match

  while ((match = pRegex.exec(faqContent)) !== null) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()

    if (question && answer) {
      faqSchema.push({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })
    }
  }

  return faqSchema
}

/** The heading an article's FAQ section carries, per language. */
export const FAQ_HEADING: Record<PublicLocale, string> = {
  he: 'שאלות נפוצות',
  en: 'Frequently asked questions',
  es: 'Preguntas frecuentes',
  'pt-BR': 'Perguntas frequentes',
}

/** Metadata for one article page. */
export async function buildArticleMetadata(slug: string, locale: PublicLocale): Promise<Metadata> {
  const article = await getPublicArticle(slug, locale)
  const copy = ARTICLES_COPY[locale]

  if (!article) {
    return {
      title: `${copy.article.notFoundTitle} | Go Top SEO`,
      description: copy.article.notFoundBody,
      robots: { index: false, follow: true },
    }
  }

  const description = article.meta_description || article.excerpt || article.title
  const url = absoluteUrl(articleHref(locale, slug))

  return {
    title: `${article.meta_title || article.title} | Go Top SEO`,
    description,
    openGraph: {
      title: article.title,
      description,
      url,
      type: 'article',
      locale: LOCALE_CONFIG[locale].ogLocale,
      ...(article.featured_image_url && {
        images: [
          {
            url: article.featured_image_url,
            alt: article.featured_image_alt || article.title,
          },
        ],
      }),
      ...(article.published_at && {
        publishedTime: article.published_at,
      }),
      ...(article.author && {
        authors: [article.author],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      ...(article.featured_image_url && {
        images: [article.featured_image_url],
      }),
    },
    alternates: {
      // No `languages` here on purpose: each language's articles are written
      // for its own readers, not translated one-for-one, so there is no
      // counterpart URL to advertise. The listing pages carry the hreflang set.
      canonical: url,
    },
  }
}

/**
 * The JSON-LD of one article page: breadcrumbs, the Article itself, and the FAQ
 * when the article has one. Returns the blocks the layout renders.
 */
export function buildArticleSchemas(article: PublicArticle | null, slug: string, locale: PublicLocale) {
  const dict = getPublicDictionary(locale)
  const copy = ARTICLES_COPY[locale]
  const articleUrl = absoluteUrl(articleHref(locale, slug))

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: dict.nav.home, item: absoluteUrl(localeHomeHref(locale)) },
      { '@type': 'ListItem', position: 2, name: copy.index.breadcrumb, item: absoluteUrl(articlesIndexHref(locale)) },
      { '@type': 'ListItem', position: 3, name: article?.title || copy.index.breadcrumb, item: articleUrl },
    ],
  }

  const articleSchema = article
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.meta_description || article.excerpt,
        inLanguage: LOCALE_CONFIG[locale].lang,
        ...(article.featured_image_url && { image: article.featured_image_url }),
        ...(article.author && {
          author: { '@type': 'Person', name: article.author, url: SITE_URL },
        }),
        ...(article.published_at && { datePublished: article.published_at }),
        ...(article.updated_at && { dateModified: article.updated_at }),
        publisher: {
          '@type': 'Organization',
          name: 'GO TOP',
          url: 'https://www.gotop.co.il',
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/gotop-primary.png` },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      }
    : null

  const faq = article?.content ? extractFaqSchema(article.content, locale) : []
  const faqSchema = faq.length > 0
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }
    : null

  return { breadcrumbSchema, articleSchema, faqSchema }
}

/** JSON-LD for the listing page of one language. */
export function buildArticlesIndexSchema(locale: PublicLocale) {
  const dict = getPublicDictionary(locale)
  const copy = ARTICLES_COPY[locale]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: dict.nav.home, item: absoluteUrl(localeHomeHref(locale)) },
      { '@type': 'ListItem', position: 2, name: copy.index.breadcrumb, item: absoluteUrl(articlesIndexHref(locale)) },
    ],
  }
}
