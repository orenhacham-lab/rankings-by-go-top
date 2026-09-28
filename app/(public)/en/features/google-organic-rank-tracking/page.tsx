import { Metadata } from 'next'
import { Search, TrendingUp, Globe, Smartphone, BarChart3, Clock } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankTableVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'Google Organic Rank Tracking | Rankings by Go Top',
  description: 'Monitor your Google search rankings by keyword, location, language, and device. Scan on demand whenever you need, or automatically once a month, and get detailed trend and competitor reports.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates(
      '/features/google-organic-rank-tracking',
      '/en/features/google-organic-rank-tracking'
    ),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Rank Tracking',
    eyebrowIcon: Search,
    title: 'Monitor Your Google Rankings, Whenever You Need',
    subtitle: 'Get accurate position data for every keyword. Track trends, analyze competitors, and generate detailed reports that prove ROI.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
    visual: (
      <RankTableVisual
        headers={['Keyword', 'Position', 'Change', 'URL']}
        rows={[
          { keyword: 'digital marketing agency', pos: 3, move: { dir: 'up', value: '2' }, url: 'example.com' },
          { keyword: 'SEO services', pos: 8, move: { dir: 'down', value: '1' }, url: 'example.com' },
          { keyword: 'rank tracking software', pos: 1, move: { dir: 'flat' }, url: 'example.com' },
          { keyword: 'local SEO tools', pos: 12, move: { dir: 'up', value: '5' }, url: 'example.com' },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'Why Rank Tracking Matters',
      intro: 'High Google rankings drive organic traffic. Track your positions over time to understand what works and optimize your SEO strategy.',
      items: [
        { icon: TrendingUp, title: 'Track Trends Over Time', body: 'See how your rankings change from scan to scan. Identify what SEO strategies are working and what needs adjustment.' },
        { icon: Globe, title: 'Competitive Analysis', body: 'Know exactly where you stand against competitors. Identify gaps and opportunities to outrank them.' },
        { icon: BarChart3, title: 'Professional Reports', body: 'Generate reports that clearly show clients the value of your SEO work and justify continued investment.' },
      ],
    },
    {
      kind: 'steps',
      title: 'How It Works',
      items: [
        { title: 'Add Keywords', body: 'Add the keywords you want to track. Bulk import from CSV for quick setup.' },
        { title: 'Set Preferences', body: 'Choose country, city, language, and device. Get precise data for your target audience.' },
        { title: 'Get Results', body: 'Run a scan on demand, or turn on automatic monthly scanning to keep your history up to date. View rankings, trends, and insights on a professional dashboard.' },
      ],
    },
    {
      kind: 'cards',
      title: 'What You Can Measure',
      items: [
        { icon: Smartphone, title: 'Device-Specific Tracking', body: 'Track rankings separately for desktop and mobile. Rankings often vary by device.' },
        { icon: Globe, title: 'Geographic Tracking', body: 'Track by country, city, and language. Each location can have different results.' },
        { icon: TrendingUp, title: 'Trend Analysis', body: 'See how rankings change over time with detailed graphs and historical data.' },
        { icon: BarChart3, title: 'Competitor Tracking', body: 'Monitor competitor rankings. See where they rank and where you can gain ground.' },
        { icon: Clock, title: 'Automatic Monthly Checks', body: 'The system checks your rankings automatically once a month, and you can also run a manual check any time you need.' },
        { icon: Search, title: 'Complete Data', body: 'For each keyword, get the ranking URL, meta description, and more details.' },
      ],
    },
    {
      kind: 'audiences',
      title: "Who It's For",
      items: [
        { title: 'Small & Medium Businesses', body: 'If you have a website and want customers to find you through Google, this is essential.', bullets: ['Simple, clear tracking', 'Affordable for small teams', 'Reports to share with clients'] },
        { title: 'Digital Agencies', body: 'Your clients ask monthly: "How\'s our SEO performing?" Here\'s the answer.', bullets: ['Client presentation reports', 'Track multiple projects simultaneously', 'Proof of service value'] },
        { title: 'Marketing Managers', body: 'Responsible for website performance? You need accurate rank data and reports.', bullets: ['Detailed performance analytics', 'Problem identification', 'Evidence of marketing impact'] },
        { title: 'SEO Professionals', body: 'You need reliable ranking data to prove your work is having impact.', bullets: ['Scans on demand, whenever you need them', 'Evidence of SEO effectiveness', 'Clear KPIs and goals'] },
      ],
    },
  ],
  cta: {
    title: 'Start Tracking Your Rankings Today',
    body: 'Free trial for 7 days, no credit card required. See exactly where your site ranks.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
  },
}
