import { EnglishLocaleEffect } from '@/components/EnglishLocaleEffect'

export const metadata = {
  title: 'Rankings by Go Top | Google Rank Tracking & AI Visibility',
  description: 'Track Google Organic rankings, Google Maps visibility, and AI mentions (ChatGPT, Gemini, Perplexity) in one professional SEO platform. Free 7-day trial.',
  keywords: 'rank tracking, SEO tools, Google ranking, AI visibility, ChatGPT visibility, Gemini, Perplexity, Google Maps rankings',
  openGraph: {
    title: 'Rankings by Go Top | Google Rank Tracking & AI Visibility',
    description: 'Track Google Organic rankings, Google Maps visibility, and AI mentions in one platform.',
    locale: 'en_US',
    type: 'website',
  },
}

export default function EnLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div dir="ltr" lang="en" className="ltr-scope">
      <EnglishLocaleEffect />
      {children}
    </div>
  )
}
