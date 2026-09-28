import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'

export default function EnglishAboutPage() {
  return <AboutPage locale="en" copy={COPY} />
}

const COPY: AboutCopy = {
  breadcrumb: { label: 'About', href: '/en/about' },
  title: 'About',
  accent: 'Rankings by Go Top',
  subtitle: 'One platform for tracking Google rankings, AI visibility, keyword research and reports — built by Go Top, a digital agency with more than 11 years of experience in SEO and paid advertising.',
  who: {
    title: 'Who is behind the platform',
    paragraphs: [
      'Rankings by Go Top is built by Go Top — a digital agency with more than 11 years of experience in organic SEO, paid advertising and website building for businesses in Israel and abroad.',
      'The platform was born out of our day-to-day work: we saw which reports clients actually understand, which data points help them decide, and where existing tools get in the way. Connecting rank tracking, keyword research and AI visibility into one workflow grew directly out of real client needs.',
    ],
  },
  stat: { value: '11+', label: 'years of experience', sub: 'in SEO and digital marketing' },
  why: {
    title: 'Why we built the platform',
    body: 'We wanted to connect every tool you need to monitor a business’s digital presence into one place — with a clean interface and data you can act on immediately.',
    items: [
      {
        title: 'Manual rank tracking takes too much time',
        description:
          'Repeated keyword checks, multiple result screens, and manual calculations that weigh down the daily routine.',
      },
      {
        title: 'Reports scattered across multiple tools',
        description:
          'Data lives in Google Search, Google Maps, AI engines and other sources — without a single clear picture.',
      },
      {
        title: 'AI visibility becomes critical',
        description:
          'Customers increasingly ask ChatGPT, Gemini and Perplexity. You need to know whether your business shows up there.',
      },
      {
        title: 'Keyword research that connects to action',
        description:
          'Knowing what people search is not enough. You need to add keywords to tracking and turn them into AI questions quickly.',
      },
    ],
  },
  solves: {
    title: 'What Rankings by Go Top solves',
    body: 'One dashboard that shows the full picture: organic rankings, Maps visibility, AI engine presence and keyword research. The data is connected, not scattered across four separate tools.',
    items: [
      { title: 'Google rank tracking', description: 'Periodic checks of your rankings on pages 1-2 of Google organic, with trends and comparisons over time.' },
      { title: 'Google Maps visibility', description: 'Tracking business presence on Google Maps results, with precise geographic targeting.' },
      { title: 'AI visibility tracking', description: 'See whether your business is mentioned, cited or recommended in answers from ChatGPT, Gemini, Perplexity and other AI engines.' },
      { title: 'Keyword research that drives action', description: 'Fetch keyword ideas, search volumes and competition from Google Ads — and add the selected keywords directly to tracking or turn them into AI questions.' },
    ],
  },
  approach: {
    title: 'Our approach',
    items: [
      {
        title: 'Transparency',
        description: 'Data and methodology are visible, including how each metric is calculated and where it comes from.',
      },
      {
        title: 'Useful data',
        description: 'Reports that tell a clear business story — not just pretty numbers.',
      },
      {
        title: 'Simple interface',
        description:
          'One screen that shows Google rankings, Maps visibility, AI visibility and keyword research — without extra noise.',
      },
      {
        title: 'SEO and GEO combined',
        description: 'Integrated tracking of organic and geographic results alongside AI engine visibility.',
      },
    ],
  },
  choose: {
    title: 'Why choose Rankings by Go Top',
    items: [
      {
        title: 'Personal Service Without Compromise',
        description:
          'No "account manager" rotating every month. You work with the same professionals who know your business.',
      },
      {
        title: 'Full Transparency',
        description: 'You always know what is happening in your account, what worked, what did not, and how to improve.',
      },
      {
        title: 'Professionalism That Drives Results',
        description: 'We do not throw inflated jargon at you. We deliver real, measurable, understandable results.',
      },
      {
        title: 'We Run a Business Too',
        description: 'We understand pressure, budget constraints and the need to see results — because we live it as well.',
      },
    ],
  },
  cta: {
    title: 'Ready to get started?',
    body: '7-day free trial. No credit card, no commitment.',
    signup: 'Start free trial',
    signupHref: '/en/signup',
    contact: 'Contact our team',
    updated: 'This page was last updated in May 2026',
  },
}
