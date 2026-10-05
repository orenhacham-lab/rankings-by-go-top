import { TranslatedLegalPage, translatedLegalMetadata } from '@/components/public/TranslatedLegalPage'

// NOT force-static. The root layout decides <html lang/dir> from the request,
// so a prerendered legal page came out as lang="en" on a translated URL — the
// one thing a legal document cannot get wrong, since a screen reader and a
// crawler both believe that attribute. The Markdown read stays cheap: it is
// parsed once per process (lib/legal/markdown.ts) and the files ship with the
// server trace (outputFileTracingIncludes in next.config.ts).

export const metadata = translatedLegalMetadata('privacy', 'pt-BR')

export default function PortuguesePrivacyPage() {
  return <TranslatedLegalPage slug="privacy" language="pt-BR" />
}
