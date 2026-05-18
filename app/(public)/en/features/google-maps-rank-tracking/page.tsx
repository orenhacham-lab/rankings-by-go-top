import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { MapPin, Users, Phone, Star, Award, Navigation } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Google Maps Rank Tracking | Rankings by Go Top',
  description: 'Monitor your local visibility in Google Maps. Track positions by city and region. Essential for local SEO success.',
}

export default function GoogleMapsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-medium border border-amber-200">
                <MapPin className="w-4 h-4" />
                Local SEO - Google Maps
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              Dominate Your Local Market on Google Maps
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              Local customers search Google Maps first. If you're not in the top 3, they find your competitors. Know where you rank.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all text-center"
              >
                Start Free Trial
              </Link>
              <Link
                href="/en/pricing"
                className="px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all text-center"
              >
                View Pricing
              </Link>
            </div>

            {/* Visual Mockup */}
            <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg p-4 border-2 border-amber-300">
                    <div className="text-xs font-semibold text-amber-800 mb-2">Your Position</div>
                    <div className="text-2xl font-bold text-amber-900">#3</div>
                    <div className="text-xs text-amber-700 mt-1">in New York - "Italian Restaurant"</div>
                  </div>
                  <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg p-4 border-2 border-slate-300">
                    <div className="text-xs font-semibold text-slate-700 mb-2">Monthly Change</div>
                    <div className="text-2xl font-bold text-slate-900">↑1</div>
                    <div className="text-xs text-slate-600 mt-1">Improving</div>
                  </div>
                </div>
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  {[
                    { rank: 1, name: 'La Bella Restaurant', stars: 4.8, reviews: 234 },
                    { rank: 2, name: 'Pizza Prima', stars: 4.6, reviews: 189 },
                    { rank: 3, name: 'Your Restaurant', stars: 4.5, reviews: 156, highlight: true },
                    { rank: 4, name: 'Al-Tafoul', stars: 4.4, reviews: 142 },
                  ].map((item) => (
                    <div key={item.rank} className={`flex items-center justify-between p-3 rounded-lg ${item.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900 w-6">{item.rank}</span>
                        <div>
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-600">{item.reviews} reviews</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-amber-600">★ {item.stars}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">Why Google Maps Ranking Is Critical</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              When someone searches "restaurant near me," they go to Google Maps, not Google search.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-amber-200 bg-amber-50 hover:shadow-lg transition-shadow">
                <Users className="w-10 h-10 text-amber-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">First Stop for Local Customers</h3>
                <p className="text-slate-700">
                  Local customers don't play games. If you're not in the top 3 on Google Maps, they find someone else.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Phone className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Direct Calls & Store Visits</h3>
                <p className="text-slate-700">
                  High ranking on Google Maps = direct phone calls and visits to your location. Measurable results.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Star className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Reviews & Reputation</h3>
                <p className="text-slate-700">
                  High Google Maps ranking can lead to more positive reviews and build your local reputation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">How Tracking Works</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Set Up Your Business</h3>
                  <p className="text-slate-700">
                    Add your business address from Google Maps. If you have multiple locations, add them all.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Choose Search Terms</h3>
                  <p className="text-slate-700">
                    Select the search terms customers use. For example: "restaurant in New York" or "dentist near me".
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Daily Tracking Begins</h3>
                  <p className="text-slate-700">
                    Daily automatic checks on Google Maps. See how your ranking changes and impacts visits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">Google Maps Tracking Capabilities</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <MapPin className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Track by Postal Code</h3>
                  <p className="text-slate-700">Track rankings by exact postal code or neighborhood. Each area can be different.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Navigation className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">GPS Coordinate Tracking</h3>
                  <p className="text-slate-700">Set precise coordinates for tracking. Perfect for competitive analysis.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Award className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Review & Response Tracking</h3>
                  <p className="text-slate-700">Monitor your review count, average rating, and response time.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Users className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Multi-Location Support</h3>
                  <p className="text-slate-700">Track multiple locations or franchises in one dashboard.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Star className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Competitor Tracking</h3>
                  <p className="text-slate-700">See where competitors rank for the same local search terms.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Phone className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Phone & Website Analytics</h3>
                  <p className="text-slate-700">See how many people clicked your phone number or website.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-amber-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">Who It's Critical For</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-amber-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Local Businesses with Physical Locations</h3>
                <p className="text-slate-700 mb-4">Restaurants, stores, clinics, services - any business customers search from a specific location.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Google Maps rank = direct customers</li>
                  <li>✓ Monitor local competitors</li>
                  <li>✓ Improve reviews & response time</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-orange-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Multi-Location Chains</h3>
                <p className="text-slate-700 mb-4">Multiple stores, franchises, or service areas - centralized tracking for all locations.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Monitor all locations together</li>
                  <li>✓ Compare performance across sites</li>
                  <li>✓ Ensure quality standards everywhere</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Local Digital Agencies</h3>
                <p className="text-slate-700 mb-4">Working with local clients? They need to know: where are we on Google Maps?</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Clear client reports</li>
                  <li>✓ Proof of your service value</li>
                  <li>✓ Competitive benchmarking</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Seasonal or Time-Dependent Businesses</h3>
                <p className="text-slate-700 mb-4">Hotels, resorts, shops - businesses where demand changes with season or time.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Track demand patterns</li>
                  <li>✓ Adjust marketing spend strategically</li>
                  <li>✓ Watch for ranking drops</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-amber-600 to-orange-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">Master Your Local Google Maps Ranking</h2>
            <p className="text-xl text-amber-100 mb-8">
              Start tracking today. Discover where your business ranks right now.
            </p>
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-amber-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              Start Free Trial
            </Link>
          </div>
        </section>
      </main>

      <Footer locale="en" />
    </div>
  )
}
