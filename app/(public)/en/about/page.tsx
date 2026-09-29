import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export default function EnglishAboutPage() {
  return <AboutPage locale="en" copy={COPY} />
}

const COPY: AboutCopy = {
  breadcrumb: { label: 'About', href: '/en/about' },
  title: 'About',
  accent: 'Rankings by Go Top',
  subtitle: 'One platform that writes and publishes articles on your site, tracks where you rank in Google and Google Maps, and checks whether AI engines recommend you. Built by Go Top, a digital agency with more than 11 years of experience in SEO and paid advertising.',
  who: {
    title: 'Who is behind the platform',
    paragraphs: [
      'Rankings by Go Top is built by Go Top, a digital agency with more than 11 years of experience in organic SEO, paid advertising and website building for businesses in Israel and abroad.',
      'The platform grew out of our day-to-day work with clients: we saw which reports people actually understand, which data helps them decide, and where the time goes. So we built one place where content gets written, published and measured, in Google and in AI engines.',
    ],
  },
  stat: { value: '11+', label: 'years of experience', sub: 'in SEO and digital marketing' },
  why: {
    title: 'Why we built the platform',
    body: 'We wanted a business to be able to do everything it takes to get found, in one place, without having to learn SEO.',
    items: [
      {
        title: 'Manual rank tracking takes too much time',
        description:
          'Repeated keyword checks, multiple result screens, and manual calculations that weigh down the daily routine.',
      },
      {
        title: 'Data scattered across tools',
        description:
          'Rankings in Google, Maps, AI engines and other sources, without one clear picture.',
      },
      {
        title: 'AI engines became part of search',
        description:
          'More customers ask ChatGPT, Gemini and Perplexity. You need to know whether your business is in the answer.',
      },
      {
        title: 'Content that stalls on the way',
        description:
          'Knowing what to write about is half the job. It also has to be written, put on the site, and measured.',
      },
    ],
  },
  solves: {
    title: 'What Rankings by Go Top solves',
    body: 'The platform does the work and shows the result: it writes and publishes content, and measures your rankings in Google, Maps and AI engines. Everything is connected, not spread across four separate tools.',
    items: [
      { title: 'Articles written and published', description: 'Complete articles on topics you approve, with images, a Q&A section and internal links, published to WordPress or Shopify.' },
      { title: 'Rankings in Google and Google Maps', description: 'Tracking for every phrase in regular search and in Maps, by area and device, with a history of every change.' },
      { title: 'AI visibility tracking', description: 'See whether your business is mentioned, cited or recommended in answers from ChatGPT, Gemini, Perplexity and other AI engines.' },
      { title: 'Keyword research', description: 'Ideas, search volumes and competition from Google Ads, added straight to tracking or turned into AI questions.' },
    ],
  },
  approach: {
    title: 'Our approach',
    items: [
      {
        title: 'Transparency',
        description: 'We say what is measured, where the data comes from and what it means. No inflated metrics.',
      },
      {
        title: 'Useful data',
        description: 'Reports that tell a clear business story, not just pretty numbers.',
      },
      {
        title: 'Simple interface',
        description:
          'One screen for your content, your Google and Maps rankings and your AI visibility, without extra noise.',
      },
      {
        title: 'SEO and GEO combined',
        description: 'Content built for Google and for AI engines, and measurement of both.',
      },
    ],
  },
  choose: {
    title: 'Why choose Rankings by Go Top',
    items: [
      {
        title: 'Personal service, no compromise',
        description:
          'No "account manager" rotating every month. You work with the same professionals who know your business.',
      },
      {
        title: 'Full transparency',
        description: 'You always know what is happening in your account, what worked, what did not, and how to improve.',
      },
      {
        title: 'Expertise without the jargon',
        description: 'No inflated jargon. We talk in results you can measure and understand.',
      },
      {
        title: 'We run a business too',
        description: 'We understand pressure, budget constraints and the need to see results — because we live it as well.',
      },
    ],
  },
  cta: {
    title: 'Want to see what we could do with your site?',
    body: FEATURE_COMMON.en.closeBody,
    contact: 'Questions? Email us:',
    updated: 'This page was last updated in September 2026',
  },
}
