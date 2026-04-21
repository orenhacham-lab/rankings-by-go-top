import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'מערכת מעקב מיקומים לקידום אתרים - Rankings by Go Top',
  description: 'Rankings by Go Top - מערכת מעקב מיקומים לקידום אתרים מתקדמת לתוצאות בגוגל אורגני וגוגל מפות. להרשמה בחינם כנסו עכשיו',
  keywords: 'מעקב מיקומים, קידום אתרים, SEO, גוגל, דירוג, מפות גוגל',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'מערכת מעקב מיקומים לקידום אתרים - Rankings by Go Top',
    description: 'מערכת מעקב מיקומים לקידום אתרים מתקדמת לתוצאות בגוגל אורגני וגוגל מפות',
    images: ['/gotop-primary.png'],
    url: 'https://www.gotopseo.com',
    siteName: 'Rankings by Go Top',
    locale: 'he_IL',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com',
  },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  robots: 'index, follow',
  authors: [{ name: 'Go Top' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {/* Explicit favicon links to ensure Go Top logo is used */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Rankings by Go Top',
              description: 'מערכת מעקב מיקומים לקידום אתרים מתקדמת לתוצאות בגוגל אורגני וגוגל מפות',
              url: 'https://www.gotopseo.com',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
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
            }),
          }}
        />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}