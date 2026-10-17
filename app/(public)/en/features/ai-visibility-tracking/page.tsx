import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEn } from '@/lib/i18n/public/landing-en'

export const metadata: Metadata = {
  title: 'AI Visibility Tracking | Go Top SEO',
  description: 'Track your business mentions in ChatGPT, Gemini, Perplexity, and Google AI. Monitor GEO - Generative Engine Optimization.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON.en

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Visibility in AI engines',
    eyebrowIcon: Sparkles,
    title: 'When a customer asks ChatGPT,',
    accent: 'know whether it recommends you',
    subtitle: 'The platform asks ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI the questions your customers ask, and shows who appears in the answer: you, or a competitor.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingEn.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why it matters now',
      title: 'Some customers don\'t search Google anymore. They ask AI.',
      intro: 'Whoever appears in the answer gets the recommendation. Whoever doesn\'t isn\'t part of the conversation.',
      items: [
        { icon: MessagesSquare, title: 'The question moved to chat', body: 'Instead of scanning ten results, people ask one question and get one answer with a few names. One of them should be yours.' },
        { icon: Award, title: 'A recommendation people trust', body: 'When an AI engine mentions a business, it sounds like a recommendation. A customer who arrives that way arrives ready to act.' },
        { icon: Target, title: 'Your competitors may already be there', body: 'Without checking, you can\'t know who gets recommended in your field. Tracking shows it by question and by engine.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'Three steps to a clear picture',
      items: [
        { title: 'Pick the questions', body: 'The platform suggests questions from your business\'s keywords, and you add or remove. For example: "Who installs AC in Austin?"' },
        { title: 'Each engine is asked separately', body: 'Every question goes to each of the six engines, and every answer is read and checked.' },
        { title: 'See who\'s in', body: 'For each question: whether you were mentioned, whether your site was cited as a source, and who was mentioned instead.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'What you get',
      title: 'Everything you need to get into the answer',
      items: [
        { icon: Sparkles, title: 'Mentions by engine', body: 'In each of the six engines separately, because each one answers differently.' },
        { icon: Link2, title: 'Cited as a source', body: 'Whether the answer points to your site as a source, not just your name.' },
        { icon: Users, title: 'Who\'s mentioned instead', body: 'The competitors that show up in answers, and the questions where they take the recommendation.' },
        { icon: Lightbulb, title: 'What to improve', body: 'Recommendations on what to add or change on your site to improve your odds of being in the answer.' },
        { icon: LineChart, title: 'Trends over time', body: 'Every check is saved, so you can see whether visibility rises after articles go live.' },
        { icon: FileSpreadsheet, title: 'PDF and Excel reports', body: 'Mentions and citations by engine, in a report you can send to a client or a manager.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'What people ask about AI visibility',
      items: [
        { q: 'What\'s the difference between SEO and GEO?', a: 'SEO is showing up in Google\'s results. GEO is showing up in AI engines\' answers. The platform measures both, and the articles it writes are built for both: clear structure and Q&A sections, plus structured data on WordPress sites with the Go Top plugin.' },
        { q: 'Do you guarantee we\'ll appear in answers?', a: 'No. Nobody controls what an AI engine answers. What we do: measure exactly where you stand, show who appears instead of you, and build content that improves your odds.' },
        { q: 'How is an AI check counted?', a: 'One query in one engine is one check. The same query in all six engines is six checks. Each plan\'s allowance is on the pricing page.' },
      ],
    },
  ],
  cta: {
    title: 'Find out what ChatGPT says about your field',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
