import { EnglishLocaleEffect } from '@/components/EnglishLocaleEffect'

export const metadata = {
  title: 'Google Rank Tracking & AI Visibility - Rankings by Go Top',
  description: 'Rankings by Go Top - Advanced Google rank tracking and AI visibility platform. Track your Google rankings, Google Maps visibility, and AI mentions (ChatGPT, Gemini, Perplexity). Free trial available.',
  openGraph: {
    title: 'Google Rank Tracking & AI Visibility - Rankings by Go Top',
    description: 'Track your Google rankings, Google Maps visibility, and AI mentions (ChatGPT, Gemini, Perplexity) in one platform.',
    locale: 'en_US',
  },
}

export default function EnLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <EnglishLocaleEffect />
      {children}
    </>
  )
}
