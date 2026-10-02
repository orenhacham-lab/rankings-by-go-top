import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Keyword Research | Go Top SEO',
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

const C = FEATURE_COMMON.en

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Keyword research',
    eyebrowIcon: Search,
    title: 'Write about what your customers',
    accent: 'are actually searching for',
    subtitle: 'Keyword ideas from Google Ads data, with monthly search volume, competition and cost-per-click estimates. Add the good ones to tracking, or turn them into AI questions in one click.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="ac installation"
        headers={['Keyword', 'Monthly searches', 'Competition']}
        rows={[
          { keyword: 'mini split installation', volume: '1,900', competition: 'Medium', level: 'medium', added: true },
          { keyword: 'ac installation cost', volume: '1,300', competition: 'Low', level: 'low' },
          { keyword: 'central air installation', volume: '590', competition: 'High', level: 'high' },
          { keyword: 'hvac repair round rock', volume: '320', competition: 'Low', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why start here',
      title: 'A great article on a phrase nobody searches brings nobody',
      intro: 'Research shows what people search for, how often, and how hard it is to compete, before a single word is written.',
      items: [
        { icon: TrendingUp, title: 'Real demand', body: 'Estimated monthly search volume for every phrase, from Google\'s data.' },
        { icon: Target, title: 'Where you can win', body: 'Competition for every phrase, so you pick the ones you can actually rank for.' },
        { icon: Coins, title: 'What a click is worth', body: 'What advertisers pay per click, a good sign of how much a phrase is worth to businesses.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'From an idea to a work list',
      items: [
        { title: 'Start from a phrase or a site', body: 'Type a phrase or a site address, and choose country and language.' },
        { title: 'Get ideas with data', body: 'A list of related phrases, with search volume, competition and cost-per-click estimates.' },
        { title: 'Put them to work', body: 'Add phrases to rank tracking, or turn them into questions for AI tracking.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'What you can do',
      title: 'Everything you need to choose the right phrases',
      items: [
        { icon: Lightbulb, title: 'Ideas from a phrase or a site', body: 'Related phrases from a single phrase, or from a site\'s address.' },
        { icon: TrendingUp, title: 'Search volume', body: 'How often each phrase is searched per month, as Google estimates it.' },
        { icon: Target, title: 'Competition', body: 'Low, medium or high, for every phrase.' },
        { icon: Coins, title: 'Cost-per-click estimate', body: 'The range of top-of-page bids in paid search.' },
        { icon: Plus, title: 'Add to tracking in one click', body: 'A phrase you pick goes straight into rank tracking for the project.' },
        { icon: Sparkles, title: 'Questions for AI tracking', body: 'Turn a phrase into a natural-language question to check whether AI engines recommend you.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'About the data',
      body: (
        <>
          <p>The data comes from the Google Ads API. Search volume, competition and cost per click are Google’s estimates, and they vary by field, season and location.</p>
          <p>They’re a good starting point for choosing topics. The real result is measured in rank tracking.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Find the phrases worth writing about',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
