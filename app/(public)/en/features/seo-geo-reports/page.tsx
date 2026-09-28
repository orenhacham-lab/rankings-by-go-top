import { Metadata } from 'next'
import { FileText, BarChart2, TrendingUp, Share2, Clock, Zap, Award } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'SEO/GEO Reports | Rankings by Go Top',
  description: 'Professional PDF and Excel reports with rankings, trends, and competitive analysis. Client-ready reports in seconds.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/seo-geo-reports',
    languages: buildHreflangAlternates(
      '/features/seo-geo-reports',
      '/en/features/seo-geo-reports'
    ),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Professional Reports in Seconds',
    eyebrowIcon: FileText,
    title: 'Reports Your Clients Will Actually Read',
    subtitle: "Every month with one click. Professional PDF and Excel reports that show exactly what you achieved and where you're heading.",
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
    visual: (
      <ReportVisual
        title="Monthly Report - May 2025"
        stats={[
          { label: 'Rankings Up', value: '+12' },
          { label: 'Keywords Tracking', value: '847' },
          { label: 'Top 3 Rankings', value: '18' },
          { label: 'Avg Position', value: '4.2' },
        ]}
        breakdownTitle="Top Performing Pages"
        breakdown={['Keywords in Top 3: 12', 'Pages in Top 10: 8', 'New Rankings: 6']}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'Why Reports Matter So Much',
      intro: 'A good report says: "Here\'s what I did for you." That\'s the difference between good service and great service.',
      items: [
        { icon: Share2, title: 'Demonstrate Value', body: "A clear report shows your client exactly what rankings changed and how you're improving their business." },
        { icon: Clock, title: 'Save Time', body: 'Instead of explaining verbally, send a report. Your client reads it, understands, and moves to the next steps.' },
        { icon: Zap, title: 'Build Trust', body: 'Monthly reports say: "I\'m here, I\'m working, I see results." This builds the kind of trust that keeps clients.' },
      ],
    },
    {
      kind: 'steps',
      title: 'How It Works',
      items: [
        { title: 'Configure Your Report', body: 'Choose which metrics to include: rankings, competitors, AI visibility, trends - full control.' },
        { title: 'System Generates', body: 'We compile data, create charts, and fill the professional template automatically.' },
        { title: 'Download or Send', body: 'PDF or Excel in seconds. Send to client or save. That easy.' },
      ],
    },
    {
      kind: 'cards',
      title: "What's Included in Reports",
      items: [
        { icon: BarChart2, title: 'Rankings Summary & Trends', body: 'Full analysis of your rankings. Up, down, or stable. Detailed breakdown of what changed.' },
        { icon: TrendingUp, title: 'Charts & Graphs', body: 'Month-over-month visuals. Easy to understand trends at a glance.' },
        { icon: FileText, title: 'Complete Keyword List', body: 'Every keyword: current ranking, previous ranking, change, URL, and score.' },
        { icon: Award, title: 'Competitor Analysis', body: "Where you stand vs competitors. Who's in the top 3? Where can you gain ground?" },
        { icon: Share2, title: 'Custom Branding', body: 'Add your logo, choose colors, make it yours.' },
        { icon: Clock, title: 'Automated Monthly', body: 'Set it and forget it. Get reports automatically every month.' },
      ],
    },
    {
      kind: 'audiences',
      title: 'Who Needs These Reports',
      items: [
        { title: 'Digital Agencies', body: 'Multiple clients, all asking: "How is my SEO?" Automate with reports.', bullets: ['Automated client reports', 'Proof of service value', 'Client renewals & growth'] },
        { title: 'In-House SEO Teams', body: 'You track rankings yourself. Now show leadership the results monthly.', bullets: ['Executive reports', 'Prove SEO investment value', 'Plan future strategies'] },
        { title: 'Content Teams', body: 'Using Rankings by Go Top to track content performance? Share monthly wins.', bullets: ['Monthly team reports', 'Clear targets for writers', 'Content impact proof'] },
        { title: 'Marketing Teams', body: 'Need to show ROI from SEO? Reports make it clear and measurable.', bullets: ['ROI clarity from SEO', 'Compare to other channels', 'Future planning data'] },
      ],
    },
  ],
  cta: {
    title: 'Generate Your First Professional Report',
    body: "One click. That's all it takes. See your first report in minutes.",
    primary: { label: 'Start Free Trial', href: '/en/signup' },
  },
}
