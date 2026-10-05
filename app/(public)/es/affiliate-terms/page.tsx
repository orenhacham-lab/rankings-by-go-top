import { SpanishLegalPage, spanishLegalMetadata } from '@/components/public/SpanishLegalPage'

// NOT force-static, for the reason the other Spanish legal routes give: the
// root layout decides <html lang/dir> from the request.

export const metadata = spanishLegalMetadata('affiliate-terms')

export default function SpanishAffiliateTermsPage() {
  return <SpanishLegalPage slug="affiliate-terms" />
}
