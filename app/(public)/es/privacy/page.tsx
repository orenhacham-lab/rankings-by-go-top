import { SpanishLegalPage, spanishLegalMetadata } from '@/components/public/SpanishLegalPage'

// The body is read from content/legal/es/privacy.md while this renders, so the
// route is static on purpose: the read happens during `next build`.
export const dynamic = 'force-static'

export const metadata = spanishLegalMetadata('privacy')

export default function SpanishPrivacyPage() {
  return <SpanishLegalPage slug="privacy" />
}
