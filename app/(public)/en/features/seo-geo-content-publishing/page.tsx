import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingEn } from '@/lib/i18n/public/landing-en'

export const metadata: Metadata = {
  title: 'SEO/GEO Content Creation, Scheduling & Publishing | Go Top SEO',
  description:
    'Plan topics, get a complete AI-generated article draft, edit it, schedule it, and publish straight to WordPress or Shopify — all from one place.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates(
      '/features/seo-geo-content-publishing',
      '/en/features/seo-geo-content-publishing'
    ),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const C = FEATURE_COMMON.en

const faqs = [
  {
    q: 'Do I have to edit every article before it goes live?',
    a: 'You don\'t have to, but you always can. Only topics you approved get written, every article passes a quality check before publishing, and you can read, edit and approve it before it goes live.',
  },
  {
    q: 'Which sites can I publish to?',
    a: 'Direct publishing works with WordPress and Shopify. Connect your site once, and approved articles go straight to it.',
  },
  {
    q: 'How does scheduling work?',
    a: 'Once you approve an article, publish it right away or pick a date and time. The platform publishes it on its own when that time comes.',
  },
  {
    q: 'Do articles come with images and SEO titles?',
    a: 'Yes. Every article comes with a featured image and in-text images, a meta title and a meta description, and all of them can be edited before publishing.',
  },
  {
    q: 'How does the article allowance work?',
    a: 'Every plan includes a number of articles per billing period. The allowance is per account, resets every period, and unused articles don\'t roll over. Creating an article uses one; editing, scheduling and publishing use nothing.',
  },
  {
    q: 'What if I run out mid-month?',
    a: 'Upgrade to a plan with more articles and keep going in the same billing period.',
  },
  {
    q: 'Can I try it before paying?',
    a: `Yes. A ${TRIAL_CATALOG.days}-day trial with no credit card, including one article so you can see the whole process through to publishing.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Writing and publishing',
    eyebrowIcon: FileText,
    title: 'Articles written and published on your site,',
    accent: 'without a content team',
    subtitle: 'Plan topics, approve them, and get a complete article with images, a Q&A section and internal links. Edit if you like, and publish to WordPress or Shopify, now or on a date you choose.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingEn.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why content stalls',
      title: 'Content gets put off because it\'s really three jobs',
      intro: 'Find a topic, write it, and get it onto the site. Each one takes time, so it slips to next month. Here all three happen in one place.',
      items: [
        { icon: Search, title: 'Finding what to write about', body: 'Checking what people search for, what competitors already cover, and what your site is missing.' },
        { icon: PenLine, title: 'Writing it well', body: 'A good draft takes hours, followed by more editing and checking.' },
        { icon: Send, title: 'Getting it on the site', body: 'Copying, uploading images, filling in SEO fields, and remembering to hit publish.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'From topic to live article in five steps',
      items: [
        { title: 'Plan topics', body: 'The platform suggests topics based on your business\'s keywords and field.' },
        { title: 'Approve', body: 'Pick the topics that fit right now. Only those get written.' },
        { title: 'Get a complete article', body: 'Title, body, subheadings, images, a Q&A section and internal links.' },
        { title: 'Review and edit', body: 'Read it, change as much as you want, and approve when it\'s ready.' },
        { title: 'Schedule or publish', body: 'Now, or on a date and time you choose, straight to WordPress or Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'In every article',
      title: 'A complete article, not raw text',
      items: [
        { icon: FileText, title: 'A full article', body: 'The topic you approved becomes a complete article, not a summary or an outline.' },
        { icon: ImageIcon, title: 'Images', body: 'A featured image and in-text images, without hunting for them and uploading them yourself.' },
        { icon: ListChecks, title: 'Q&A and structured data', body: 'A Q&A section and structured data that Google and AI engines can read.' },
        { icon: Link2, title: 'Internal links', body: 'Suggested links to other pages on your site, and you approve which ones go in.' },
        { icon: FileCheck2, title: 'Meta title and description', body: 'Written for search, and editable like everything else.' },
        { icon: ShieldCheck, title: 'A quality check before publishing', body: 'Every article is checked before it goes live, so nothing half-finished gets published.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Direct publishing',
      title: 'Connect once, publish without copy and paste',
      intro: 'An article you approved goes straight to your site, with its images and SEO fields.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Connect your WordPress site and publish articles to it now or on a schedule.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Connect your Shopify store and publish blog articles straight from the platform.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Questions', title: 'What people ask about writing and publishing', items: faqs },
  ],
  cta: {
    title: 'Your next article could be written today',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
