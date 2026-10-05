import { TranslatedLegalPage, translatedLegalMetadata } from '@/components/public/TranslatedLegalPage'

// NOT force-static, for the reason the other translated legal routes give: the
// root layout decides <html lang/dir> from the request.

export const metadata = translatedLegalMetadata('affiliate-terms', 'pt-BR')

export default function PortugueseAffiliateTermsPage() {
  return <TranslatedLegalPage slug="affiliate-terms" language="pt-BR" />
}
