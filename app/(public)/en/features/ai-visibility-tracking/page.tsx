import { Metadata } from 'next'
import { Brain, MessageSquare, Zap, TrendingUp, Link2, BarChart3 } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiAnswersVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'AI Visibility Tracking | Rankings by Go Top',
  description: 'Track your business mentions in ChatGPT, Gemini, Perplexity, and Google AI. Monitor GEO - Generative Engine Optimization.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/ai-visibility-tracking',
    languages: buildHreflangAlternates(
      '/features/ai-visibility-tracking',
      '/en/features/ai-visibility-tracking'
    ),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'GEO - Generative Engine Optimization',
    eyebrowIcon: Brain,
    title: 'Monitor Your Business in AI Answers',
    subtitle: "More people use ChatGPT, Gemini, and Perplexity to find information. If you're mentioned there, you'll get discovered. Track your AI visibility now.",
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
    visual: (
      <AiAnswersVisual
        heading={'AI Mentions for: "best home loan options"'}
        rows={[
          { engine: 'ChatGPT (OpenAI)', detail: 'Mentioned as trusted lender', ok: true, icon: MessageSquare },
          { engine: 'Gemini (Google)', detail: 'Direct quote from your website', ok: true, icon: Zap },
          { engine: 'Perplexity', detail: 'Not mentioned in answer', ok: false, icon: Brain },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'Why AI Visibility Will Matter',
      intro: 'In a few years, GEO will be as important as SEO. Start measuring it now.',
      items: [
        { icon: Brain, title: 'New Search Paradigm', body: 'Google is no longer the only search engine. AI tools are becoming the primary research method for many users.' },
        { icon: Link2, title: 'Mentions = Credibility', body: 'Appearing in AI answers is like getting a recommendation from the AI itself. It builds trust and authority.' },
        { icon: TrendingUp, title: 'Competitors Are Already There', body: "Your competitors are already appearing in AI answers. Don't get left behind." },
      ],
    },
    {
      kind: 'steps',
      title: 'How Tracking Works',
      items: [
        { title: 'Choose Questions', body: 'Select the questions customers might ask AI about your business or industry.' },
        { title: 'System Queries AI', body: 'We ask ChatGPT, Gemini, Perplexity, and more. Each AI tool is queried separately.' },
        { title: 'Get Clear Results', body: "See where you're mentioned, how you're cited, and track changes over time." },
      ],
    },
    {
      kind: 'cards',
      title: 'What You Can Track',
      items: [
        { icon: Brain, title: 'All Major AI Engines', body: 'ChatGPT, Gemini, Perplexity, Google AI, and more - each tracked separately.' },
        { icon: MessageSquare, title: 'Citation Tracking', body: 'See exactly how your site is cited in AI answers. Summary? Link? Attribution?' },
        { icon: Link2, title: 'Source Page Tracking', body: 'See which pages from your website receive AI citations for optimization.' },
        { icon: Zap, title: 'Trends Over Time', body: 'See how AI mentions change week to week and month to month.' },
        { icon: BarChart3, title: 'Professional Reports', body: 'PDF and Excel reports showing your AI visibility clearly.' },
        { icon: TrendingUp, title: 'Competitive Tracking', body: 'Monitor where competitors appear in AI answers. Know your competitive landscape.' },
      ],
    },
    {
      kind: 'audiences',
      title: "Who It's Critical For",
      items: [
        { title: 'Content Creators & Writers', body: 'If you write blogs or content, being cited in AI is now a key metric of success.', bullets: ['Know which articles are cited', 'Optimize for AI mentions', 'Prove content impact'] },
        { title: 'Digital Agencies & SEO', body: 'Clients will soon ask: "Where are we in AI answers?" Be ready with the answer.', bullets: ['New service to offer clients', 'Forward-thinking positioning', 'Competitive advantage'] },
        { title: 'Podcasters & Media', body: 'If you create media or podcasts, AI visibility is a new distribution channel.', bullets: ['Track AI mentions', 'Prove audience reach', 'Partnership opportunities'] },
        { title: 'Marketing & Product Managers', body: 'A new KPI for success. Track visibility as AI transforms how people search.', bullets: ['Modern success metrics', 'Competitive benchmarking', 'Executive reports'] },
      ],
    },
  ],
  cta: {
    title: 'Stay Ahead with AI Visibility Tracking',
    body: 'Get ahead of the curve. Start measuring AI visibility today.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
  },
}
