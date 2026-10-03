import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEn } from '@/lib/i18n/public/landing-en'

export const metadata: Metadata = {
  title: 'Google Organic Rank Tracking | Go Top SEO',
  description: 'Monitor your Google search rankings by keyword, location, language, and device. Scan on demand whenever you need, or automatically once a month, and get detailed trend and competitor reports.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const C = FEATURE_COMMON.en

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Rankings in Google',
    eyebrowIcon: TrendingUp,
    title: 'Know where you rank in Google,',
    accent: 'and whether the work is paying off',
    subtitle: 'Track every phrase that matters to you, by country, city, language and device. Scan whenever you like, or automatically once a month, with a history of every change.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingEn.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why measure',
      title: 'What isn\'t measured doesn\'t improve',
      intro: 'Without tracking, there\'s no way to know whether a new article, a site change or an agency\'s work moved anything.',
      items: [
        { icon: LineChart, title: 'See the direction', body: 'Up, down or steady for every phrase, from one scan to the next.' },
        { icon: FileText, title: 'Tie content to results', body: 'See which pages climb after an article goes live, and what to write about next.' },
        { icon: Target, title: 'Focus on what\'s close', body: 'Phrases sitting just below page one are usually your nearest opportunity. Tracking shows you which ones they are.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'Set it up once, see every change',
      items: [
        { title: 'Add your phrases', body: 'Type in the phrases that matter to you, or add them from keyword research in one click.' },
        { title: 'Choose where and on what device', body: 'Country, language, city, desktop or mobile, because results change with each.' },
        { title: 'Scan and see the trend', body: 'Run a manual scan anytime, or an automatic monthly scan that runs by itself. Every result is saved to your history.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'What you get',
      title: 'An accurate picture of where you stand in Google',
      items: [
        { icon: Smartphone, title: 'Desktop and mobile, separately', body: 'Mobile and desktop results aren\'t always the same. Check each on its own.' },
        { icon: Globe, title: 'By country, city and language', body: 'See what a customer sees when they search from the place that matters to you.' },
        { icon: Link2, title: 'Which page ranks', body: 'For every phrase, see which page on your site shows up in the results.' },
        { icon: History, title: 'Full history', body: 'Every scan is saved, so you see the journey, not just today\'s snapshot.' },
        { icon: MapPin, title: 'Google Maps too', body: 'Track the same phrases in Maps, by city or area.' },
        { icon: FileSpreadsheet, title: 'PDF and Excel reports', body: 'Rankings, changes and history in a report you can pass along.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'What people ask about rank tracking',
      items: [
        { q: 'How often are rankings checked?', a: 'Every time you run a manual scan, and you can also turn on an automatic monthly scan. There\'s no daily or weekly automatic scan at the moment.' },
        { q: 'Why is what I see in Google different from the platform?', a: 'Google personalizes results by location, device and search history. The platform checks under fixed conditions you set, which makes it a better measure for comparing over time.' },
        { q: 'How many phrases can I track?', a: 'It depends on your plan. The exact allowances are on the pricing page.' },
      ],
    },
  ],
  cta: {
    title: 'Find out where you stand today',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
