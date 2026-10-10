/**
 * The English pricing page's words around the plan grid
 * (app/(public)/en/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed. The badge says what it is, a recommendation, not a sales figure.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingEn: PricingCopy = {
  hero: {
    eyebrow: 'Pricing',
    title: 'Everything it takes to get found,',
    accent: 'for one monthly price',
    subtitle: 'Articles written and published on your site, rankings tracked in Google and Google Maps, and a check on whether ChatGPT and Gemini recommend you. Pick a plan by how much you need, and start with a free trial.',
    trust: [`${DAYS}-day free trial`, 'No credit card', 'Cancel anytime from your dashboard'],
  },
  plans: {
    perMonth: '/month',
    popular: 'Our pick',
    cta: `Try free for ${DAYS} days`,
    dashboard: 'Go to my dashboard',
    noCard: 'No credit card needed',
    checksNote: CHECKS_EXPLAINER.en,
    taxNote: 'On a card payment the merchant of record is Creem, which calculates tax by your billing address and shows the final amount before you pay. The prices here do not include it.',
    everyPlanLabel: 'In every plan',
    everyPlan: [
      'Automatic scheduled publishing to WordPress, Shopify and Wix',
      'Tracking of where you rank in Google and Google Maps',
      'A check of whether 6 AI engines, like ChatGPT and Gemini, mention you',
      'A website health score with a list of fixes',
      'PDF and Excel reports you can send',
      'Personal support',
    ],
  },
  unsure: {
    text: 'Not sure yet? Start with a free check of your site.',
    cta: 'Check my site',
  },
  included: {
    eyebrow: 'In every plan',
    title: 'No add-ons. Everything is in from day one.',
    body: 'Plans differ only in volume: how many websites, articles and checks you get each month. The features are the same in all of them.',
    items: [
      {
        title: 'Articles written and published',
        desc: 'The platform writes complete articles on the topics you approve, with images, a Q&A section and internal links, and publishes them to your site on a schedule.',
      },
      {
        title: 'Google and Google Maps tracking',
        desc: 'See where you show up for every phrase that matters to you, in regular search and in Maps, and how that moves over time.',
      },
      {
        title: 'Visibility in AI engines',
        desc: 'Check whether ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI mention you, and who they mention instead.',
      },
      {
        title: 'Keyword research',
        desc: 'The platform finds what your customers search for and ask, and suggests where to start.',
      },
      {
        title: 'Reports you can send',
        desc: 'Rankings, trends and AI visibility in a PDF or Excel report made in one click, ready for a client or a manager.',
      },
      {
        title: 'Personal support',
        desc: 'Real people answer you, on WhatsApp and by email.',
      },
    ],
  },
  value: {
    eyebrow: 'Why it pays',
    title: 'One subscription instead of three jobs',
    body: 'Usually you need someone to pick topics and write, someone to put it on the site, and a tool to check whether it worked. Here it all happens in one place.',
    items: [
      {
        title: 'The work gets done, not just measured',
        desc: 'Not another report waiting for someone to act on it. The platform writes and publishes the articles itself, only on topics you approved.',
      },
      {
        title: 'See exactly what you pay for',
        desc: 'Published articles, ranking changes and AI mentions sit on one dashboard, and in a report you can pass along.',
      },
      {
        title: 'No lock-in',
        desc: `A ${DAYS}-day trial with no credit card, monthly billing, and cancellation anytime from your dashboard.`,
      },
    ],
  },
  usage: {
    eyebrow: 'How usage is counted',
    title: 'No fine print',
    body: 'Three simple units, and every allowance renews each month.',
    items: [
      {
        title: 'Article',
        desc: 'Creating a new article uses one from your allowance. Editing, scheduling or publishing an existing one uses nothing.',
      },
      {
        title: 'Google ranking check',
        desc: 'Looking up where one keyword appears, in one place: Google or Google Maps. The same keyword in both counts as two checks.',
      },
      {
        title: 'AI visibility check',
        desc: 'Asking one AI engine one question and seeing whether your business is mentioned. The same question in ChatGPT and Gemini counts as two checks.',
      },
    ],
    note: 'The article allowance is per account. On plans with more than one website, it is shared across your websites.',
  },
  faq: {
    eyebrow: 'Questions',
    title: 'What people ask before picking a plan',
    body: 'Didn\'t find your answer? Message us on WhatsApp.',
    items: [
      {
        q: 'Which plan is right for us?',
        a: `Basic and Advanced are for one website, and the main difference between them is articles per month: ${BASIC_ARTICLES} versus ${ADVANCED_ARTICLES}. Premium is for anyone running more than one website, and Agency is for managing client sites. You can start small and upgrade anytime.`,
      },
      {
        q: 'What\'s in the free trial?',
        a: `${DAYS} days, no credit card: one website, up to ${TRIAL_CATALOG.maxKeywordsPerProject} keywords, up to ${TRIAL_CATALOG.maxGoogleChecksLifetime} Google ranking checks, up to ${TRIAL_CATALOG.maxAIChecksLifetime} AI visibility checks, and one article so you can see the whole process from start to publish.`,
      },
      {
        q: `What happens after the ${DAYS}-day trial?`,
        a: 'Pick a plan and carry on from where you are. Don\'t pick one? Nothing is charged, because we never asked for a card.',
      },
      {
        q: 'Can we switch plans or cancel?',
        a: 'Yes. Switch plans anytime and the new allowances apply from that moment. Cancel from your dashboard, with no penalties or cancellation fees.',
      },
      {
        q: 'What happens to unused articles?',
        a: 'The allowance renews every month, and unused articles don\'t roll over.',
      },
      {
        q: 'Do scans run on their own?',
        a: 'Run a manual scan whenever you like, or turn on an automatic monthly scan that runs by itself every month. There\'s no daily or weekly automatic scan at the moment.',
      },
      {
        q: 'Can articles be scheduled and published automatically?',
        a: 'Yes. Schedule an article for a future date, or publish it right away to a connected site: WordPress, Shopify or Wix.',
      },
      {
        q: 'How is our data protected?',
        a: 'All traffic is encrypted (SSL/TLS), passwords are stored encrypted, and each account sees only its own data. Information is shared only with the service providers the platform runs on, such as hosting, payments and search data, as set out in the privacy policy.',
        link: { label: 'Read the privacy policy', href: '/en/privacy' },
      },
    ],
  },
  cta: {
    title: 'Want to see what the platform sees on your site first?',
    body: `The free check reads your site and returns a first research summary, no signup needed. Or open a ${DAYS}-day trial and try everything.`,
    check: 'Check my site for free',
    trial: 'Start a free trial',
    dashboard: 'Go to my dashboard',
  },
}
