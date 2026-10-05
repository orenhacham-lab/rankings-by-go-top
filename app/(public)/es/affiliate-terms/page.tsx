import { TranslatedLegalPage, translatedLegalMetadata } from '@/components/public/TranslatedLegalPage'

// NOT force-static, for the reason the other Spanish legal routes give: the
// root layout decides <html lang/dir> from the request.

export const metadata = translatedLegalMetadata('affiliate-terms', 'es')

export default function SpanishAffiliateTermsPage() {
  return <TranslatedLegalPage slug="affiliate-terms" language="es" />
}
