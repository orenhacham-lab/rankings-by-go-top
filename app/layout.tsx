import type { Metadata } from 'next'
import { Rubik } from 'next/font/google'
import './globals.css'
import { PublicSiteWidgets } from '@/components/public/PublicSiteWidgets'
import { RootThemeProvider } from './RootThemeProvider'

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  title: 'מעקב מיקומים בגוגל ונראות ב-AI - Rankings by Go Top',
  description: 'Rankings by Go Top - מערכת מעקב מיקומים בגוגל ונראות ב-AI מתקדמת. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI (ChatGPT, Gemini, Perplexity). להרשמה בחינם כנסו עכשיו',
  keywords: 'מעקב מיקומים, קידום אתרים, SEO, גוגל, דירוג, מפות גוגל, AI visibility, ChatGPT, Gemini',
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
    title: 'מעקב מיקומים בגוגל ונראות ב-AI - Rankings by Go Top',
    description: 'מערכת מעקב מיקומים בגוגל ונראות ב-AI. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI (ChatGPT, Gemini, Perplexity)',
    images: ['/gotop-primary.png'],
    url: 'https://www.gotopseo.com',
    siteName: 'Rankings by Go Top',
    locale: 'he_IL',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com',
  },
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  authors: [{ name: 'Go Top' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className="h-full" suppressHydrationWarning style={{ fontFamily: rubik.style.fontFamily }}>
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
                description: 'מערכת מעקב מיקומים בגוגל ונראות ב-AI. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI',
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
                description: 'מערכת מעקב מיקומים בגוגל ונראות ב-AI. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI',
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
          <PublicSiteWidgets />
        </RootThemeProvider>
      </body>
    </html>
  )
}