import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEn } from '@/lib/i18n/public/landing-en'

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

const C = FEATURE_COMMON.en

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Reports',
    eyebrowIcon: ChartColumn,
    title: 'A report that shows what changed,',
    accent: 'in one click',
    subtitle: 'Rankings in Google and Maps and visibility in AI engines, in a PDF or Excel report ready to send to a client, a manager, or yourself.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingEn.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why a report',
      title: 'Good work needs to be seen',
      intro: 'A clear report saves explaining, and shows the site is moving forward.',
      items: [
        { icon: Eye, title: 'The full picture', body: 'Google, Maps and AI in one place, instead of screenshots from several tools.' },
        { icon: Clock, title: 'No manual assembly', body: 'The data is already in the platform. The report is built from it in a click.' },
        { icon: Handshake, title: 'Client trust', body: 'For agencies: a regular report shows the client what changed and why to keep going.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'From data to report in three steps',
      items: [
        { title: 'Pick a project', body: 'Each site is its own project, with its own reports.' },
        { title: 'Export', body: 'PDF to send, or Excel to work with the data.' },
        { title: 'Send it', body: 'To a client, a manager or a partner, with nothing to format.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'What\'s in the report',
      title: 'Everything that matters, nothing that doesn\'t',
      items: [
        { icon: TrendingUp, title: 'Rankings and changes', body: 'For every phrase: today\'s position, the previous one, and the change between them.' },
        { icon: ArrowUpDown, title: 'The ranking page', body: 'Which page on your site shows up for each phrase.' },
        { icon: ChartColumn, title: 'Estimated traffic', body: 'An estimate of visits from Google, based on search volume and current position.' },
        { icon: Sparkles, title: 'AI visibility', body: 'Mentions and citations of your site, for each AI engine separately.' },
        { icon: History, title: 'Full history', body: 'In the Excel file: every check over time, not just the latest.' },
        { icon: FileSpreadsheet, title: 'PDF and Excel', body: 'A tidy PDF to send, and Excel for anyone who wants to work with the numbers.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'What people ask about reports',
      items: [
        { q: 'What languages are reports in?', a: 'You can export a report in English or Hebrew.' },
        { q: 'Can I make a separate report for each client?', a: 'Yes. Each site is its own project, and each project gets its own report. The number of projects in each plan is on the pricing page.' },
        { q: 'Are reports included in every plan?', a: 'Yes. PDF and Excel reports are included in every plan.' },
      ],
    },
  ],
  cta: {
    title: 'Your first report is days away',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
