/**
 * The English home page's words (app/(public)/en/page.tsx renders them through
 * components/public/LandingPage.tsx).
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/** The lowest monthly price, read from the plan catalogue so the page never drifts from it. */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('en-US')
const TRIAL_DAYS = TRIAL_CATALOG.days

/**
 * The English home page's words. The layout is components/public/LandingPage.tsx.
 * Every claim is one the product keeps: no invented customers, totals, logos
 * or press. The demo's business names and figures are illustrative, and its
 * caption says so.
 */
export const landingEn: LandingCopy = {
  hero: {
    eyebrow: 'Automatic promotion in Google and AI engines, in one system',
    title: 'Your next customers are already searching.',
    accent: 'We make sure they find you.',
    subtitle:
      'Go Top SEO writes and publishes articles that answer what your customers are searching for, then shows you where you appear in Google, Google Maps, ChatGPT and Gemini. No content team. No guesswork.',
    signup: `Start a free ${TRIAL_DAYS}-day trial`,
    trialNote: 'No credit card, no commitment. Cancel anytime.',
    checkLead: 'Not ready to sign up? Get a free site check, no signup:',
    dashboard: 'Go to my dashboard',
    trust: ['Publishes to WordPress and Shopify', 'Support from real people'],
    climbChip: '#3 on Google',
    published: 'Article published on your site',
  },
  demo: {
    label: 'A live demo of the platform',
    caption: 'Product demo. Business names and figures are illustrative.',
    tabs: ['Climbing in Google', 'A new article', 'Recommended by AI'],
    describe: [
      'The keywords screen: a phrase that climbed from position 18 to 3 in Google, and three more on the way up.',
      'The articles screen: a new article is written, passes the quality check and is scheduled to publish on the site.',
      'The AI visibility screen: a ChatGPT answer that recommends the business, and the engines that mention it.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Dashboard', 'Keywords', 'Content strategy', 'Articles', 'AI visibility', 'Reports'],
    rank: {
      heading: 'Keywords',
      keyword: 'ac installation austin',
      positionLabel: 'Google position',
      period: 'Last 8 weeks',
      from: 18,
      to: 3,
      columns: ['Keyword', 'Position', 'Change'],
      rows: [
        { keyword: 'mini split cost', from: 24, to: 7 },
        { keyword: 'hvac repair round rock', from: 31, to: 9 },
        { keyword: 'ac cleaning service', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Austin',
      mapsValue: 'Position 2',
      toast: 'You climbed 15 places in Google',
    },
    article: {
      heading: 'New article',
      title: 'How much does a mini split install cost, and what to ask first',
      subheading: 'What drives the price?',
      checksTitle: 'Quality check',
      checks: ['Questions & answers', 'Structured data', 'Internal links', 'Featured image', 'Search-led headings'],
      draft: 'Writing',
      scheduled: 'Scheduled',
      when: 'Tue 9:00 AM',
      toast: 'Publishing to WordPress',
    },
    ai: {
      heading: 'AI visibility',
      question: 'Who is a good AC installer in Austin?',
      intro: 'Here are a few companies with strong recommendations in the area:',
      items: [
        { name: 'Summit Air', desc: 'Licensed installers, a warranty on the work and same-day replies.', you: true },
        { name: 'CoolPoint HVAC', desc: 'Fair prices for cleaning and maintenance.' },
        { name: 'Bayside Comfort', desc: 'Specialists in ducted systems.' },
      ],
      youTag: 'Your business',
      mentionedIn: 'Mentioned in:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT recommends you',
    },
  },
  worksWith: {
    label: 'We check and publish for you on:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'What you get',
    title: 'What Go Top SEO does for you while you run the business',
    body: 'Not another tool to learn. A system that does the work, then shows you the results.',
    items: [
      {
        title: 'Content that brings customers, not just traffic',
        desc: 'The platform finds what your customers search for and ask, writes complete articles about it and publishes them on your site on a steady schedule. You just pick the topics.',
        chips: ['Publishes itself', 'With images', 'Q&A sections', 'Internal links'],
      },
      {
        title: 'A place in ChatGPT and Gemini answers',
        desc: 'More and more people ask AI instead of searching. See whether you are recommended, who is recommended instead, and what to improve.',
        chips: ['6 AI engines', 'Versus competitors'],
      },
      {
        title: 'A clear picture of what works',
        desc: 'Google and Maps positions, AI mentions and published articles on one screen. No spreadsheets, no guessing.',
        chips: ['PDF and Excel reports', 'Full history'],
      },
    ],
    stats: [
      { value: 6, label: 'AI engines checked', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI' },
      { value: 3, label: 'channels in one report', detail: 'Google, Google Maps and AI answers' },
      { value: 2, label: 'platforms to publish to', detail: 'WordPress and Shopify, no copy and paste' },
      { value: TRIAL_DAYS, label: 'day free trial', detail: 'No credit card' },
    ],
  },
  shift: {
    eyebrow: 'Search has changed',
    title: 'Customers no longer just google. They ask AI, and get three recommendations.',
    body: 'If your site doesn\'t answer their questions, in Google or in a ChatGPT answer, that recommendation goes to a competitor. Most businesses have no idea where they stand, because no tool has shown them both at once.',
    withoutTitle: 'Without Go Top SEO',
    without: [
      'An article every couple of months, when someone finds time',
      'No clear idea what to write, or which phrase is worth it',
      'Rankings checked by hand, or not at all',
      'No idea whether ChatGPT recommends you or a competitor',
    ],
    withTitle: 'With Go Top SEO',
    with: [
      'A steady content calendar that publishes on your schedule',
      'Topics chosen from what your customers actually search for',
      'Automatic tracking of your Google and Google Maps positions',
      'Regular checks of what ChatGPT, Gemini and four more engines say about you',
    ],
  },
  flow: {
    eyebrow: 'How it works',
    title: 'From a site address to content that works, in four steps',
    body: 'You decide what gets written. The platform does the rest.',
    steps: [
      { tag: 'Free, no signup', title: 'Check your site', desc: 'Enter an address. In under a minute we work out what the business does, who its customers are and what is holding you back in Google and AI.' },
      { tag: 'You approve', title: 'Get a plan', desc: 'Search phrases, the questions customers ask and a list of articles ready to write. You choose what goes in.' },
      { tag: 'Automatic', title: 'Articles are written and published', desc: 'Each article comes with images and Q&A, and goes live on your site when you scheduled it. On WordPress sites with the Go Top plugin, structured data is added too.' },
      { tag: 'Transparent', title: 'See the results', desc: 'Google and Maps positions, AI mentions and reports you can send to anyone.' },
    ],
    cta: 'Start with a free check',
  },
  features: {
    eyebrow: 'What\'s inside',
    title: 'Everything you need to rise, in one place',
    body: 'Four tools that work together, so every article is measured and every measurement becomes the next article.',
    more: 'Learn more',
    note: 'Names and figures in the pictures are illustrative.',
    content: {
      overline: 'Content & publishing',
      title: 'Articles written to be found, not to fill a blog',
      body: 'Every article is built around a real search: headings from what people ask, a Q&A section, internal links to the pages that sell, and, on WordPress sites with the Go Top plugin, structured data that Google and AI engines read. You review, tweak if needed, and the platform publishes.',
      points: ['A featured image and images in the text', 'A quality check before every publish', 'Scheduling and direct publishing to WordPress and Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'This week on your site',
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        items: [
          { day: 0, title: 'Choosing an AC for the bedroom', status: 'published', label: 'Published' },
          { day: 2, title: 'What a mini split install costs', status: 'scheduled', label: 'Scheduled' },
          { day: 4, title: 'AC cleaning: how often?', status: 'writing', label: 'Writing' },
        ],
        destinationLabel: 'Publishing to',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'AI visibility',
      title: 'Know when ChatGPT recommends you, and when it picks a competitor',
      body: 'We ask the AI engines the questions your customers ask and check who appears in the answer. See which questions you win, where competitors take the recommendation, and what to improve on your site.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI', 'Side by side with your competitors', 'Recommendations on what to change to get into the answer'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Who appears in the answer',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Who installs AC in Austin?', hits: [true, true, true, false, true, false] },
          { question: 'How much is AC cleaning?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Share of mentions',
        you: { label: 'Your business', value: 58 },
        rival: { label: 'Top competitor', value: 42 },
      },
    },
    rank: {
      overline: 'Google rankings',
      title: 'See every climb, in Google and Google Maps',
      body: 'Track every phrase that matters to you, in regular search and in Maps by city or area, with a history that shows whether the articles are doing their job.',
      points: ['Google organic by country, language and device', 'Google Maps by city or area', 'Keyword research with search volume and competition'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Your keywords',
        columns: ['Keyword', 'Position', 'Change'],
        rows: [
          { keyword: 'ac installation austin', pos: 3, up: 15 },
          { keyword: 'mini split cost', pos: 7, up: 17 },
          { keyword: 'hvac repair round rock', pos: 9, up: 22 },
          { keyword: 'ac cleaning service', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Austin', value: 'Position 2 of 20' },
      },
    },
    reports: {
      overline: 'Reports',
      title: 'A report you can send to a client or your boss, in one click',
      body: 'Export positions, trends and AI visibility to PDF and Excel. Agencies run several client sites from one account, each in its own project.',
      points: ['PDF and Excel in one click', 'Several sites in one account', 'All the data in one place, no manual report building'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Performance report',
        period: 'September',
        stats: [
          { label: 'Keywords on page one', value: '14', up: true },
          { label: 'AI mentions', value: '9', up: true },
          { label: 'Articles published', value: '8' },
          { label: 'Average position', value: '6.2', up: true },
        ],
        clientsLabel: 'Projects:',
        clients: ['summit-air.com', 'studio-dana.com', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Who it is for',
    title: 'For anyone who wants their site to bring customers',
    body: 'You don\'t need to know SEO. You need to know what you sell.',
    items: [
      {
        title: 'Business owners',
        desc: 'You want more leads from Google without learning SEO or hiring a writer. Approve the topics, and the rest happens.',
        gain: 'A site that works while you\'re busy',
      },
      {
        title: 'Freelancers and agencies',
        desc: 'Run several clients from one account, produce content faster and show each client a clear report.',
        gain: 'More clients in the same working hours',
      },
      {
        title: 'Marketing teams',
        desc: 'Keep a steady publishing pace and see in one place what content does in Google and AI.',
        gain: 'A clear answer to "is it working?"',
      },
    ],
  },
  check: {
    eyebrow: 'Free site check',
    title: 'Not sure yet? Let us show you what we see',
    body: 'The check actually reads your site and returns a first research summary in under a minute:',
    items: [
      'What we understood about the business, and who your customers are',
      'Which competitors show up next to you',
      'What is holding you back in Google, with the evidence from your site',
      'How ready the site is for AI answers',
      'The list of articles we would write for you',
    ],
    cta: 'Check my site',
    note: 'Free, no signup and no credit card.',
    preview: {
      domain: 'summit-air.com',
      heading: 'Your first research summary',
      scoreLabel: 'AI readiness',
      score: '3/4',
      findings: ['Images are missing alt text', 'No questions and answers section', 'The meta description is the wrong length'],
      lockedLabel: 'More findings and competitors unlock with a free account',
    },
  },
  faq: {
    eyebrow: 'Questions',
    title: 'What people usually ask before they start',
    body: 'Didn\'t find your answer? Message us on WhatsApp.',
    items: [
      {
        q: 'I don\'t know anything about SEO. Is this for me?',
        a: 'Yes. The platform picks the phrases, suggests topics and writes the articles. What is left for you is deciding what fits the business, and approving it.',
      },
      {
        q: 'Will anything go live on my site without me seeing it?',
        a: 'Only topics you approved go into writing, and every article passes a quality check before it goes live. You can review and edit any article and choose when it publishes.',
      },
      {
        q: 'Why not just write it myself with ChatGPT?',
        a: 'You can, but then you pick topics, check phrases, build Q&A and structured data, link pages together, upload to the site and check whether it worked, all by yourself. Go Top SEO runs the whole chain, and measures the result in Google and AI.',
      },
      {
        q: 'Which sites does it work with?',
        a: 'Direct publishing works with WordPress and Shopify. Rank tracking, AI visibility and keyword research work with any site.',
      },
      {
        q: `What happens after the ${TRIAL_DAYS}-day trial?`,
        a: 'Pick a plan and carry on right where you left off. Didn\'t pick one? Nothing is charged, because we never asked for a card.',
      },
      {
        q: 'Can I cancel?',
        a: 'Yes, anytime from the dashboard, with no penalties or cancellation fees.',
      },
    ],
  },
  cta: {
    title: 'Your next customer is searching today. Be there.',
    body: `Check your site for free, or start a ${TRIAL_DAYS}-day trial and your first article can be written today.`,
    check: 'Check my site for free',
    signup: 'Start a free trial',
    dashboard: 'Go to my dashboard',
    pricing: `Plans from $${FROM_USD} a month.`,
    pricingLink: 'See all plans and prices',
  },
}
