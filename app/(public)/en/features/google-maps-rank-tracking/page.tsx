import { Metadata } from 'next'
import { MapPin, Users, Phone, Star, Navigation, Award } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'Google Maps Rank Tracking | Rankings by Go Top',
  description: 'Monitor your local visibility in Google Maps. Track positions by city and region. Essential for local SEO success.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates(
      '/features/google-maps-rank-tracking',
      '/en/features/google-maps-rank-tracking'
    ),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="en" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Local SEO - Google Maps',
    eyebrowIcon: MapPin,
    title: 'Dominate Your Local Market on Google Maps',
    subtitle: "Local customers search Google Maps first. If you're not in the top 3, they find your competitors. Know where you rank.",
    primary: { label: 'Start Free Trial', href: '/en/signup' },
    secondary: { label: 'View Pricing', href: '/en/pricing' },
    visual: (
      <MapsVisual
        positionLabel="Your Position"
        position="#3"
        positionSub='in New York - "Italian Restaurant"'
        changeLabel="Monthly Change"
        change="1"
        changeSub="Improving"
        reviewsLabel="reviews"
        rows={[
          { rank: 1, name: 'La Bella Restaurant', stars: 4.8, reviews: 234 },
          { rank: 2, name: 'Pizza Prima', stars: 4.6, reviews: 189 },
          { rank: 3, name: 'Your Restaurant', stars: 4.5, reviews: 156, highlight: true },
          { rank: 4, name: 'Al-Tafoul', stars: 4.4, reviews: 142 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'Why Google Maps Ranking Is Critical',
      intro: 'When someone searches "restaurant near me," they go to Google Maps, not Google search.',
      items: [
        { icon: Users, title: 'First Stop for Local Customers', body: "Local customers don't play games. If you're not in the top 3 on Google Maps, they find someone else." },
        { icon: Phone, title: 'Direct Calls & Store Visits', body: 'High ranking on Google Maps = direct phone calls and visits to your location. Measurable results.' },
        { icon: Star, title: 'Reviews & Reputation', body: 'High Google Maps ranking can lead to more positive reviews and build your local reputation.' },
      ],
    },
    {
      kind: 'steps',
      title: 'How Tracking Works',
      items: [
        { title: 'Set Up Your Business', body: 'Add your business address from Google Maps. If you have multiple locations, add them all.' },
        { title: 'Choose Search Terms', body: 'Select the search terms customers use. For example: "restaurant in New York" or "dentist near me".' },
        { title: 'Tracking Begins', body: 'Run a scan on demand whenever you want, or turn on automatic monthly checks on Google Maps. See how your ranking changes and impacts visits.' },
      ],
    },
    {
      kind: 'cards',
      title: 'Google Maps Tracking Capabilities',
      items: [
        { icon: MapPin, title: 'Track by Postal Code', body: 'Track rankings by exact postal code or neighborhood. Each area can be different.' },
        { icon: Navigation, title: 'GPS Coordinate Tracking', body: 'Set precise coordinates for tracking. Perfect for competitive analysis.' },
        { icon: Award, title: 'Ranking History Over Time', body: 'See how your Google Maps position has changed from scan to scan, and spot upward or downward trends.' },
        { icon: Users, title: 'Multi-Location Support', body: 'Track multiple locations or franchises in one dashboard.' },
        { icon: Star, title: 'Competitor Tracking', body: 'See where competitors rank for the same local search terms.' },
        { icon: Phone, title: 'Accurate Business Matching', body: 'The system identifies your business among the results by name and domain, so the ranking you see is always accurate.' },
      ],
    },
    {
      kind: 'audiences',
      title: "Who It's Critical For",
      items: [
        { title: 'Local Businesses with Physical Locations', body: 'Restaurants, stores, clinics, services - any business customers search from a specific location.', bullets: ['Google Maps rank = direct customers', 'Monitor local competitors', 'Spot ranking changes over time'] },
        { title: 'Multi-Location Chains', body: 'Multiple stores, franchises, or service areas - centralized tracking for all locations.', bullets: ['Monitor all locations together', 'Compare performance across sites', 'Ensure quality standards everywhere'] },
        { title: 'Local Digital Agencies', body: 'Working with local clients? They need to know: where are we on Google Maps?', bullets: ['Clear client reports', 'Proof of your service value', 'Competitive benchmarking'] },
        { title: 'Seasonal or Time-Dependent Businesses', body: 'Hotels, resorts, shops - businesses where demand changes with season or time.', bullets: ['Track demand patterns', 'Adjust marketing spend strategically', 'Watch for ranking drops'] },
      ],
    },
  ],
  cta: {
    title: 'Master Your Local Google Maps Ranking',
    body: 'Start tracking today. Discover where your business ranks right now.',
    primary: { label: 'Start Free Trial', href: '/en/signup' },
  },
}
