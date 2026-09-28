import { createClient } from '@/lib/supabase/server'
import { LandingPage, type LandingCopy } from '@/components/public/LandingPage'
import { authHref } from '@/lib/i18n/auth-href'

export default async function EnglishHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="en" copy={EN} signedIn={!!user} signupHref={authHref('signup', 'en')} pricingHref="/en/pricing" />
}

/** The English home page's words. The layout is components/public/LandingPage.tsx. */
const EN: LandingCopy = {
  hero: {
    eyebrow: 'SEO & GEO automation for businesses and agencies',
    title: 'Create, schedule and publish',
    accent: 'search-ready content — then track your visibility',
    subtitle:
      'Go Top brings your SEO workflow into one platform: plan relevant topics, create and review AI-assisted articles, schedule or publish them directly to your website, and monitor your visibility across Google Search, Google Maps and leading AI engines.',
    signup: 'Start Your Free 7-Day Trial',
    dashboard: 'Go to Dashboard',
    howItWorks: 'See How It Works',
    trust: ['No credit card required', 'WordPress and Shopify publishing', 'Direct support'],
  },
  mock: {
    address: 'gotopseo.com/content',
    stats: [
      { label: 'Topics planned', value: '18' },
      { label: 'Articles in review', value: '5' },
      { label: 'Scheduled', value: '9' },
      { label: 'Published this month', value: '14' },
    ],
    boardTitle: 'Content Board',
    boardMeta: 'Latest 4 articles',
    rows: [
      { title: 'SEO guide for small businesses', status: 'Published', tone: 'success' },
      { title: 'How to choose a marketing agency', status: 'Scheduled', tone: 'info' },
      { title: 'GEO trends for next year', status: 'In review', tone: 'warning' },
      { title: 'A guide to AI visibility', status: 'Draft', tone: 'neutral' },
    ],
  },
  problem: {
    eyebrow: 'Why Go Top',
    title: 'Content used to need five different tools. Now it needs one',
    body: 'A writing tool for drafts, a spreadsheet for planning, a separate rank tracker, and a manual login to the CMS to publish — every handoff costs time, and things slip through the cracks.',
    withoutTitle: 'Without Go Top',
    without: [
      'A separate writing tool for drafting content',
      'A spreadsheet to plan topics and track status',
      'A separate tool to check Google rankings',
      'Manual logins to the CMS to publish each piece',
    ],
    withTitle: 'With Go Top',
    with: [
      'Plan, create and edit articles in one place',
      'Schedule and publish straight to WordPress or Shopify',
      'Track Google rankings and AI visibility alongside your content',
      'One clear view of your entire SEO workflow',
    ],
  },
  workflow: {
    eyebrow: 'From idea to published',
    title: 'Your content workflow, end to end',
    body: 'Four steps that turn a topic idea into a published article that supports your SEO',
    steps: [
      { title: 'Plan relevant topics', desc: 'Get SEO and GEO topic suggestions for your business, grounded in keywords and the questions people actually ask.' },
      { title: 'Generate complete articles', desc: 'Produce a full, publish-ready article for each topic you choose — no more starting from a blank page.' },
      { title: 'Review and edit', desc: 'Go through every article, edit it to match your voice and facts, and approve it before it goes live.' },
      { title: 'Schedule or publish', desc: 'Publish now or schedule for later — straight to your connected WordPress or Shopify site.' },
    ],
  },
  capabilities: {
    eyebrow: 'Supporting capabilities',
    title: 'Everything measured, so you know it\'s working',
    body: 'Alongside planning, creating and publishing content, Go Top tracks how you\'re doing and gives you the full picture',
    items: [
      { title: 'Google Organic rank tracking', desc: 'Track your rankings over time, keyword by keyword, and see how the content you publish affects them.' },
      { title: 'Google Maps visibility', desc: 'Track your Google Maps position by city, zip code or landmark.' },
      { title: 'AI visibility', desc: 'See whether your business is mentioned in answers from ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI.' },
      { title: 'Keyword research', desc: 'Discover relevant keywords with search volume and competition data, and turn them into new content topics.' },
      { title: 'PDF and Excel reports', desc: 'Export clear reports to PDF or Excel with one click, for internal use or to share with clients.' },
      { title: 'Trend and competitor signals', desc: 'Get indicators of trends over time and competitor activity, alongside the tracking on your own site.' },
    ],
  },
  journey: {
    eyebrow: 'Getting Started',
    title: 'Getting started is simple',
    body: 'Three steps from connecting your site to content that\'s planned, published and measured',
    steps: [
      { title: 'Connect a site and create a project', desc: 'Create an account, connect your WordPress or Shopify site, and set up a project for your business or a client.' },
      { title: 'Select topics and create content', desc: 'Choose and approve suggested topics, generate articles, and review them before they go out.' },
      { title: 'Schedule publication and monitor visibility', desc: 'Schedule publishing to your connected site, and track your Google rankings and AI visibility over time.' },
    ],
  },
  audience: {
    eyebrow: 'Who it\'s for',
    title: 'Built for anyone responsible for a website\'s SEO',
    items: [
      { title: 'Small businesses', desc: 'One simple system instead of juggling several tools — no in-house marketing team required.' },
      { title: 'SEO freelancers', desc: 'Plan, write and publish content for clients faster, and see the results in the same place.' },
      { title: 'Digital agencies', desc: 'Manage several client sites at once, from topic planning to clear reports for every client.' },
      { title: 'Marketing teams', desc: 'Keep a steady publishing cadence and a shared view of performance, without chasing spreadsheets.' },
    ],
  },
  why: {
    eyebrow: 'Why subscribe',
    title: 'What you get with the subscription',
    items: [
      { title: 'Save time', desc: 'Fewer tool switches and less manual work across planning, writing and publishing content.' },
      { title: 'A consistent publishing schedule', desc: 'Schedule ahead so you keep a steady publishing cadence, without chasing deadlines.' },
      { title: 'Content and visibility in one system', desc: 'From your first topic to tracking your rankings — all under one roof.' },
      { title: 'A clear view of what\'s working', desc: 'Understand which articles and topics are supporting your visibility, and where there\'s still work to do.' },
      { title: 'Manage multiple client sites', desc: 'Run several projects and client sites from one dashboard, without switching accounts.' },
    ],
  },
  pricing: {
    title: 'Plans for every business size',
    body: 'From a small business just getting started with content to an agency managing several clients — there\'s a plan that fits.',
    cta: 'View Pricing',
  },
  cta: {
    title: 'Plan, write and publish your next article today',
    body: 'Start your free 7-day trial. No commitment, no credit card required.',
    signup: 'Start Your Free 7-Day Trial',
    dashboard: 'Go to Dashboard',
    pricing: 'View Pricing',
  },
}
