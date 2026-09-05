import type { Metadata } from 'next'
import './globals.css'
import { PublicSiteWidgets } from '@/components/public/PublicSiteWidgets'
import { RootThemeProvider } from './RootThemeProvider'
import { createClient } from '@/lib/supabase/server'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'

export const metadata: Metadata = {
  title: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO | Go Top',
  description: 'Rankings by Go Top - יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity). להרשמה בחינם כנסו עכשיו',
  keywords: 'יצירת תוכן SEO, תזמון תוכן, פרסום תוכן, GEO, מעקב מיקומים, קידום אתרים, SEO, גוגל, דירוג, מפות גוגל, AI visibility, ChatGPT, Gemini',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO - Rankings by Go Top',
    description: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity)',
    images: ['/gotop-primary.png'],
    url: 'https://www.gotopseo.com',
    siteName: 'Rankings by Go Top',
    locale: 'he_IL',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com',
    languages: buildHreflangAlternates('/', '/en'),
  },
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  authors: [{ name: 'Go Top' }],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // J1 — resolve auth server-side so the public contact widgets never render for a
  // logged-in user (no client-side flash). A transient auth failure defaults to the
  // safe public behavior and never breaks the whole app.
  let isAuthenticated = false
  // The signup language lives in auth metadata and is the seed for a device that
  // has no cookie yet. Read from the SAME call, so the document's language and
  // the dashboard provider's first render come from one source.
  let localeSeed: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    isAuthenticated = !!user
    const seed = user?.user_metadata?.locale
    localeSeed = typeof seed === 'string' ? seed : null
  } catch {
    isAuthenticated = false
  }

  // THE INITIAL RESPONSE carries the real language. Previously hard-coded to
  // Hebrew/RTL, so an English page shipped the wrong lang and dir to every
  // crawler, screen reader and first paint, and a client effect only patched it
  // up after hydration.
  // The seed (signup language in auth metadata) is applied HERE too, so the
  // <html> the server writes matches what the dashboard provider will start
  // from. Without it a fresh device after an English signup would render a
  // Hebrew document and then flip.
  const { lang, dir } = documentLocaleAttributes(await getServerLocale(localeSeed))

  return (
    <html lang={lang} dir={dir} className="h-full" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="google-site-verification" content="UL2PVup2WIEC5Gt3M45JUnk6Ks4sZqQAtdJ_6l2GHZA" />
        {/* Favicon - Go Top logo */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=7" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png?v=7" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=7" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png?v=7" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png?v=7" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png?v=7" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=7" />
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

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* JSON-LD Schema for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Rankings by Go Top',
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
                  name: 'Go Top',
                  url: 'https://www.gotop.co.il',
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'Rankings by Go Top',
                description: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO, לצד מעקב מיקומים בגוגל אורגני, מפות ונראות ב-AI',
                url: 'https://www.gotopseo.com',
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Web',
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: '4.8',
                  ratingCount: '156',
                },
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'ILS',
                },
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
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased overflow-x-hidden">
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