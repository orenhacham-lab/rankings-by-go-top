import { Metadata } from 'next'
import { Search, TrendingUp, Target, PieChart, Zap, Check, Info } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'Keyword Research | Rankings by Go Top',
  description: 'Discover keyword ideas with Google Ads data. Check search volume, competition, and CPC estimates. Add keywords directly to rank tracking and AI questions.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/keyword-research',
    languages: buildHreflangAlternates(
      '/features/keyword-research',
      '/en/features/keyword-research'
    ),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Keyword Research',
    eyebrowIcon: Search,
    title: 'Discover Keywords with Google Ads Data',
    subtitle: 'Research keyword ideas, check search volume and competition, then add them directly to rank tracking or AI visibility questions.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
  },
  sections: [
    {
      kind: 'cards',
      title: 'What You Can Do',
      items: [
        { icon: Search, title: 'Keyword Ideas', body: 'Find related keyword ideas based on your seed keyword using Google Ads API data.' },
        { icon: TrendingUp, title: 'Search Volume', body: 'View estimated monthly search volume for each keyword to understand demand.' },
        { icon: Target, title: 'Competition Data', body: 'Check competition levels (Low, Medium, High) and competitiveness index.' },
        { icon: PieChart, title: 'CPC Estimates', body: 'See low and high top-of-page bid estimates to understand advertiser demand.' },
        { icon: Zap, title: 'Quick Add to Projects', body: 'Add selected keywords directly to your projects for immediate rank tracking.' },
        { icon: Check, title: 'Generate AI Questions', body: 'Turn keywords into natural language questions for AI visibility scanning.' },
      ],
    },
    {
      kind: 'steps',
      title: 'How It Works',
      items: [
        { title: 'Search Keywords', body: 'Enter a seed keyword and select your target country and language.' },
        { title: 'Review Results', body: 'Browse keyword ideas with search volume, competition, and CPC data.' },
        { title: 'Take Action', body: 'Add keywords to your project, or create AI questions from them.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'About the Data',
      body: (
        <>
          <p>Keyword research data comes from Google Ads API. Search volumes, competition levels, and CPC estimates are approximate and based on Google&apos;s aggregated data. Actual performance may vary by campaign, targeting, and other factors.</p>
          <p>Use this data as a starting point for your SEO and content strategy. Always validate with your own analytics and testing.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Ready to Accelerate Your Keyword Research?',
    body: 'Start your free 7-day trial today. No credit card required.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
  },
}
