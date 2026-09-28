import { Metadata } from 'next'
import {
  FileText,
  Wand2,
  Edit3,
  CalendarClock,
  Send,
  Users,
  Image as ImageIcon,
  Link2,
  Search,
  Brain,
  Layers,
} from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'SEO/GEO Content Creation, Scheduling & Publishing | Rankings by Go Top',
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

const faqs = [
  {
    q: 'How does the article allowance work, and when does it reset?',
    a: 'Every subscription plan includes a set number of AI-generated articles per billing period. The allowance is shared across all projects on the account, resets at the start of each new billing period, and unused articles do not roll over.',
  },
  {
    q: 'What happens if I run out of articles partway through the period?',
    a: 'Once you reach your current plan\'s article limit, you can upgrade to a plan with a larger allowance to keep generating articles within the same billing period.',
  },
  {
    q: 'Do I have to edit the article before it publishes?',
    a: 'No, but you always have the chance to. Every generated article is a draft — you can read it, edit any part of it, and only then approve it for publishing or scheduling.',
  },
  {
    q: 'Which platforms can I publish to?',
    a: 'Direct publishing is supported for WordPress and Shopify. Connect your project to one of them, and approved articles publish straight there.',
  },
  {
    q: 'How does publish scheduling work?',
    a: 'Once you approve an article, you can publish it immediately or set a future date and time. The system publishes it automatically at the time you chose.',
  },
  {
    q: 'How do we split the allowance across multiple client sites?',
    a: 'The allowance lives at the account level and is shared across every project on it. An agency managing several client sites decides for itself, month to month, how many of the available articles go to each project.',
  },
  {
    q: 'Do articles come with a featured image and SEO titles automatically?',
    a: 'Yes — every generated article includes a featured image along with an SEO-ready meta title and description, and you can edit all of them before publishing.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes, there\'s a free 7-day trial with no credit card required, which includes generating a sample article so you can see the workflow for yourself.',
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Content Creation & Publishing',
    eyebrowIcon: FileText,
    title: 'SEO/GEO Content Creation, Scheduling & Publishing',
    subtitle: 'From topic to published article, without bouncing between a separate research tool, a writing tool, and a publishing tool. It all happens in one place — and every draft is yours to review before it goes anywhere.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
  },
  sections: [
    {
      kind: 'cards',
      title: 'Why content usually turns into a chore',
      intro: 'Publishing a single article typically means jumping between several disconnected tools — which is exactly why regular content is the first thing to slip.',
      items: [
        { icon: Search, title: 'Topic research, on its own', body: "Figuring out what's worth writing about, checking what competitors already cover, and making sure it actually matters to your business." },
        { icon: Edit3, title: 'Writing and editing, somewhere else', body: 'A solid first draft takes real time to write, and then still needs another pass to edit, tighten, and make sure it says what you meant.' },
        { icon: Send, title: 'Publishing, manually, in a third tool', body: "Then comes copying it into your site, adding an image, filling in SEO fields, and remembering when it's even supposed to go live." },
      ],
    },
    {
      kind: 'steps',
      title: 'How it works',
      intro: 'Five steps, from planning a topic to an article live on your site.',
      items: [
        { title: 'Plan a topic', body: 'The system helps you plan relevant topics for your business, based on your keywords and niche.' },
        { title: 'Approve it', body: 'Look through the suggested topics and pick the ones that fit what you need right now.' },
        { title: 'Get an AI-generated draft', body: 'From the approved topic, the system writes a complete article — title, body, subheadings, and SEO fields.' },
        { title: 'Review and edit', body: 'Every article starts as a draft. Read it, edit whatever you need to, and approve it only once it reads the way you want.' },
        { title: 'Schedule or publish', body: 'Set a future date and time, or publish right away — straight to WordPress or Shopify.' },
      ],
    },
    {
      kind: 'cards',
      title: "What's included in every article",
      intro: 'Every draft comes with everything needed to publish a complete article — not just raw text.',
      items: [
        { icon: Wand2, title: 'A complete article draft', body: 'From the topic you approved, the AI writes a full article — not just an outline or a summary.' },
        { icon: Edit3, title: 'Free editing before publishing', body: 'Change anything in the draft — title, body, structure — until it reads exactly how you want.' },
        { icon: Search, title: 'SEO title and description', body: 'Every article comes with a meta title and meta description already written — and you can edit those too.' },
        { icon: ImageIcon, title: 'A featured image for every article', body: "Each article includes a featured image, so you're not hunting one down or uploading it separately." },
        { icon: Link2, title: 'Suggested internal links', body: 'The system can suggest relevant internal links from your own site, and you decide which ones actually go in the article.' },
        { icon: CalendarClock, title: 'Publish scheduling', body: 'Set when an approved article should go live, and let the system publish it at the time you picked.' },
      ],
    },
    {
      kind: 'cards',
      title: 'Direct publishing to WordPress and Shopify',
      intro: 'Connect your WordPress site or Shopify store, and an approved article goes straight there — no copy-pasting, no extra publishing tool.',
      items: [
        { title: 'WordPress', body: 'Connect your WordPress site and publish articles directly to it, including SEO fields and the featured image.' },
        { title: 'Shopify', body: 'Connect your Shopify store and publish blog articles directly from the system.' },
      ],
    },
    {
      kind: 'callout',
      icon: Layers,
      title: "How your account's article allowance works",
      heading: 'h3',
      body: (
        <>
          <p>Every subscription plan includes a set number of AI-generated articles per billing period. The exact number is shown on the pricing page, but the important part is this: the allowance belongs to the account, not to any single project.</p>
          <p>That means every article your account gets each billing period is shared across all the projects and sites managed under it — you decide how many go to each site.</p>
        </>
      ),
    },
    {
      kind: 'cards',
      title: 'How this supports both SEO and GEO',
      intro: 'Consistent, well-planned content is the foundation for both ranking on Google and showing up in AI-generated answers — two different goals worth building for at once.',
      items: [
        { icon: Search, title: 'SEO — traditional Google search', body: "Articles with clear structure, meta titles and descriptions, and content that actually answers what people are searching for — all of that helps Google understand and rank your pages. We can't promise a specific ranking, but consistent, well-structured content is the baseline for improving one." },
        { icon: Brain, title: 'GEO — showing up in AI answers', body: 'More people ask ChatGPT, Gemini, and other AI tools questions directly. Clear, consistent, relevant content increases the chance your articles get used as a source — with no guarantee any specific question will surface a mention.' },
      ],
    },
    {
      kind: 'callout',
      icon: Users,
      title: 'For agencies: splitting the shared allowance across clients',
      heading: 'h2',
      body: (
        <>
          <p>Because the article allowance sits at the account level and is shared across every project, an agency running several client sites from one account decides for itself, each month, how many of the available articles go to which client.</p>
          <p>There&apos;s no need for a separate subscription per client — just prioritize whichever projects need content this month, and adjust the split again next month as priorities change.</p>
        </>
      ),
    },
    { kind: 'faq', eyebrow: 'FAQ', title: 'Questions about content creation and publishing', items: faqs },
  ],
  cta: {
    title: 'Ready to stop juggling separate content tools?',
    body: 'Start your free 7-day trial today. No credit card required.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
  },
}
