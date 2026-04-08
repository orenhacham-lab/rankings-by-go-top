import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rankings by Go Top',
  description: 'מערכת מעקב דירוגים לקידום אתרים',
  icons: {
    icon: '/gotop-primary.svg',
    shortcut: '/gotop-primary.svg',
    apple: '/gotop-primary.svg',
  },
  openGraph: {
    images: ['/gotop-primary.svg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
