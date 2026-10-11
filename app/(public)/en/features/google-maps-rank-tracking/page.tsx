import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Google Maps Rank Tracking | Go Top SEO',
  description: 'Monitor your local visibility in Google Maps. Track positions by city and region. Essential for local SEO success.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON.en

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'When people search for a business like yours nearby,',
    accent: 'know where you are on the map',
    subtitle: 'Track your Google Maps position by phrase and by area: a city, or an exact point on the map. See who ranks ahead of you, and how your position moves over time.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <MapsVisual
        positionLabel="Your position"
        position="3"
        positionSub='in Austin, "ac installation"'
        changeLabel="This month"
        change="2"
        changeSub="places up"
        reviewsLabel="reviews"
        rows={[
          { rank: 1, name: 'Cool Plus HVAC', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Fresh Air Co.', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Your business', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Bayside Cooling', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Why the map',
      title: 'In local search, the map is the shop window',
      intro: 'When someone looks for a service nearby, Google shows a few businesses on the map first. That\'s where they decide who to call.',
      items: [
        { icon: Phone, title: 'That\'s where they call from', body: 'From the map results, people call, get directions or visit your site in one tap.' },
        { icon: Users, title: 'Few spots, many competitors', body: 'Only a handful of businesses get the top spots. You need to know whether you\'re one of them.' },
        { icon: MapPin, title: 'Every area is a different race', body: 'You can be first in one city and missing in the next. Tracking by area shows it.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'How it works',
      title: 'Three steps to a clear map',
      items: [
        { title: 'Set up your business', body: 'Add your business and the area you serve.' },
        { title: 'Pick phrases and areas', body: 'For example "ac installation" in Austin, or from an exact point on the map.' },
        { title: 'Track over time', body: 'Scan manually anytime or automatically once a month, with a history of every change.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'What you get',
      title: 'Your place on the map, without guessing',
      items: [
        { icon: MapPin, title: 'By city or area', body: 'Check each phrase in the area where your customers are.' },
        { icon: Navigation, title: 'An exact point on the map', body: 'Check from coordinates you choose, to see what a customer standing there sees.' },
        { icon: Store, title: 'Who ranks ahead of you', body: 'The businesses above you in the results, with their Google rating.' },
        { icon: History, title: 'Position history', body: 'See how your position changed from one scan to the next.' },
        { icon: Search, title: 'Regular search too', body: 'Track the same phrases in Google\'s regular results.' },
        { icon: FileSpreadsheet, title: 'PDF and Excel reports', body: 'Your Maps positions go into a report you can pass along.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Questions',
      title: 'What people ask about Maps tracking',
      items: [
        { q: 'Do I need a Google Business Profile?', a: 'To appear in Maps, you need a Google Business Profile. Tracking shows where your profile appears, or whether it appears at all.' },
        { q: 'How often is my position checked?', a: 'Every time you run a manual scan, and you can also turn on an automatic monthly scan. There\'s no daily or weekly automatic scan at the moment.' },
        { q: 'Does each Maps phrase count as a separate check?', a: 'Yes. One Google check is one phrase in one place, so the same phrase in regular search and in Maps counts as two checks.' },
      ],
    },
  ],
  cta: {
    title: 'Find out who gets the calls in your area',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
