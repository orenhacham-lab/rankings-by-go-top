import type { Metadata, Viewport } from 'next'
import { Heebo, Inter } from 'next/font/google'
import './globals.css'
import { PublicSiteWidgets } from '@/components/public/PublicSiteWidgets'
import { RootThemeProvider } from './RootThemeProvider'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'
import { getRootRequestContext } from '@/lib/i18n/root-request'
import { getSiteMetadata } from '@/lib/i18n/site-metadata'
import { SOFTWARE_OFFER } from '@/lib/seo/software-offer'

/**
 * The two faces of the type system (see --font-sans in globals.css): Inter for
 * Latin and every digit, Heebo for Hebrew. Self-hosted by next/font, so no page
 * waits on a third-party stylesheet and the fallback is metric-adjusted — the
 * text does not jump when the font arrives.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const heebo = Heebo({ subsets: ['hebrew', 'latin'], display: 'swap', variable: '--font-heebo' })

/**
 * The viewport is its own export: inside `metadata` Next ignores it and logs
 * "Unsupported metadata viewport" on every render. Same values as before.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

/**
 * The document's metadata follows the SAME resolved locale as <html lang/dir>.
 * It used to be a static Hebrew object, so an English document shipped a Hebrew
 * title, description, keywords and og:locale. `getRootRequestContext` is
 * request-cached, so this and the render below share one resolution and one
 * auth read — they cannot disagree.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getRootRequestContext()
  const m = getSiteMetadata(locale)
  return {
    title: m.title,
    description: m.description,
    keywords: m.keywords,
    // No `icons` here, and no <link rel="icon"> in <head> below: the icons are
    // the file conventions app/favicon.ico, app/icon.png and app/apple-icon.png
    // (rendered by scripts/brand/icons.ts), which Next links ONCE each, with a
    // content hash. Declaring them here too put every icon in the head three times.
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      images: ['/gotop-primary.png'],
      url: 'https://www.gotopseo.com',
      siteName: 'Go Top SEO',
      locale: m.ogLocale,
      type: 'website',
    },
    alternates: {
      canonical: 'https://www.gotopseo.com',
      languages: buildHreflangAlternates('/', '/en', '/es'),
    },
    robots: 'index, follow',
    authors: [{ name: 'Go Top' }],
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // J1 — auth is resolved server-side so the public contact widgets never render
  // for a logged-in user (no client-side flash), and the signup language in auth
  // metadata seeds the locale for a device that has no cookie yet. BOTH come from
  // the request-cached context that generateMetadata above already used, so the
  // title and the document element are answers to one resolution, not two.
  //
  // THE INITIAL RESPONSE carries the real language. Previously hard-coded to
  // Hebrew/RTL, so an English page shipped the wrong lang and dir to every
  // crawler, screen reader and first paint, and a client effect only patched it
  // up after hydration.
  const { isAuthenticated, locale } = await getRootRequestContext()
  const { lang, dir } = documentLocaleAttributes(locale)

  return (
    <html lang={lang} dir={dir} className={`h-full ${inter.variable} ${heebo.variable}`} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="google-site-verification" content="UL2PVup2WIEC5Gt3M45JUnk6Ks4sZqQAtdJ_6l2GHZA" />
        <meta name="theme-color" content="#0666C2" />

        {/* Google Tag Manager - Initialize data layer BEFORE GTM script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'GTM-PC29G3NQ');
            `,
          }}
        />

        {/* Google Tag Manager Script */}
        <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-PC29G3NQ"></script>

        {/* JSON-LD Schema for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Go Top SEO',
                alternateName: ['Rankings by Go Top'],
                url: 'https://www.gotopseo.com',
                logo: 'https://www.gotopseo.com/gotop-primary.png',
                description: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO, לצד מעקב מיקומים בגוגל אורגני, מפות ונראות ב-AI',
                sameAs: ['https://www.gotop.co.il'],
                contactPoint: {
                  '@type': 'ContactPoint',
                  telephone: '054-9489377',
                  contactType: 'Customer Support',
                  email: 'oren@gotop.co.il',
                },
                parentOrganization: {
                  '@type': 'Organization',
                  name: 'GO TOP',
                  url: 'https://www.gotop.co.il',
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'Go Top SEO',
                alternateName: ['Rankings by Go Top'],
                publisher: { '@type': 'Organization', name: 'GO TOP', url: 'https://gotop.co.il' },
                brand: { '@type': 'Organization', name: 'GO TOP', url: 'https://gotop.co.il' },
                description: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO, לצד מעקב מיקומים בגוגל אורגני, מפות ונראות ב-AI',
                url: 'https://www.gotopseo.com',
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Web',
                // No aggregateRating: a rating may only describe real, collected
                // reviews (Google's review-snippet policy; FTC fake-review rule).
                // The offer is the real plan range from the catalog.
                offers: SOFTWARE_OFFER,
                author: {
                  '@type': 'Organization',
                  name: 'Go Top',
                  url: 'https://www.gotop.co.il',
                },
              },
            ]),
          }}
        />
      </head>
      <body className="min-h-full bg-canvas text-body antialiased overflow-x-hidden">
        {/* Google Tag Manager (noscript) - must be first element in body */}
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PC29G3NQ" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
          }}
        />
        <RootThemeProvider>
          {children}
          <PublicSiteWidgets isAuthenticated={isAuthenticated} />
        </RootThemeProvider>
      </body>
    </html>
  )
}