import { TranslatedLegalPage, translatedLegalMetadata } from '@/components/public/TranslatedLegalPage'

// NOT force-static, for the reason the other translated legal routes give: the
// root layout decides <html lang/dir> from the request.

export const metadata = translatedLegalMetadata('affiliate-terms', 'ja')

export default function JapaneseAffiliateTermsPage() {
  return <TranslatedLegalPage slug="affiliate-terms" language="ja" />
}
