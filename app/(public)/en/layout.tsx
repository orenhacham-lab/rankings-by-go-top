import { EnglishLocaleEffect } from '@/components/EnglishLocaleEffect'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'SEO/GEO Content Creation, Scheduling & Publishing | Go Top',
  description: 'Create, schedule, and publish SEO and GEO content in one platform, alongside Google Organic rank tracking, Google Maps visibility, and AI mentions (ChatGPT, Gemini, Perplexity). Free 7-day trial.',
  keywords: 'SEO content creation, content scheduling, content publishing, GEO, rank tracking, SEO tools, Google ranking, AI visibility, ChatGPT visibility, Gemini, Perplexity, Google Maps rankings',
  openGraph: {
    title: 'SEO/GEO Content Creation, Scheduling & Publishing | Go Top',
    description: 'Create, schedule, and publish SEO and GEO content, alongside Google Organic rank tracking, Google Maps visibility, and AI mentions.',
    locale: 'en_US',
    type: 'website',
  },
  alternates: {
    languages: buildHreflangAlternates('/', '/en'),
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
