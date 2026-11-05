import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Zoekwoordenonderzoek | Go Top SEO',
  description: 'Ideeën voor zoekwoorden uit de gegevens van Google Ads. Met zoekvolume, concurrentie en de geschatte prijs per klik. Elk zoekwoord kunt u opnemen in de meting van de posities of omzetten in een vraag voor de AI.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['nl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Zoekwoordenonderzoek',
    eyebrowIcon: Search,
    title: 'Waar uw klanten werkelijk op zoeken,',
    accent: 'wordt een artikel',
    subtitle: 'Ideeën voor zoekwoorden uit de gegevens van Google Ads. Met het maandelijkse zoekvolume, de concurrentie en de geschatte prijs per klik. Wat past, neemt u op in de meting, of u zet het met één klik om in een vraag voor de AI.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="airco installatie"
        headers={['Zoekwoord', 'Zoekopdrachten per maand', 'Concurrentie']}
        rows={[
          { keyword: 'airco installatie bedrijf', volume: '1.900', competition: 'Gemiddeld', level: 'medium', added: true },
          { keyword: 'airco laten installeren kosten', volume: '1.300', competition: 'Laag', level: 'low' },
          { keyword: 'plafond airco', volume: '590', competition: 'Hoog', level: 'high' },
          { keyword: 'airco reparatie amsterdam', volume: '320', competition: 'Laag', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom hier beginnen',
      title: 'Het beste artikel over een zoekwoord waar niemand op zoekt, brengt niemand binnen',
      intro: 'Nog voordat het eerste woord is geschreven, ziet u waar mensen op zoeken, hoe vaak zij dat doen en hoe zwaar het is om daar mee te komen.',
      items: [
        { icon: TrendingUp, title: 'De werkelijke vraag', body: 'Het geschatte maandelijkse zoekvolume per zoekwoord, volgens de gegevens van Google.' },
        { icon: Target, title: 'Waar u kunt winnen', body: 'De concurrentie per zoekwoord, zodat u de zoekwoorden kiest waar een plek vooraan echt haalbaar is.' },
        { icon: Coins, title: 'Wat een klik waard is', body: 'Wat adverteerders voor een klik betalen. Dat is een aanwijzing voor wat dat zoekwoord voor het bedrijf waard is.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Van een inval naar een lijst met werk',
      items: [
        { title: 'U begint met een zoekwoord of een website', body: 'Vul een zoekwoord of het adres van een website in en kies land en taal.' },
        { title: 'U krijgt ideeën met cijfers', body: 'Een lijst met verwante zoekwoorden, elk met zoekvolume, concurrentie en de geschatte prijs per klik.' },
        { title: 'U werkt direct verder', body: 'Neem het zoekwoord op in de meting van de posities, of zet het om in een vraag voor de meting van de zichtbaarheid in AI.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat u kunt doen',
      title: 'Alles wat nodig is om de passende zoekwoorden te kiezen',
      items: [
        { icon: Lightbulb, title: 'Ideeën uit een zoekwoord of een website', body: 'Uit één zoekwoord of uit het adres van een website komen verwante zoekwoorden.' },
        { icon: TrendingUp, title: 'Zoekvolume', body: 'Per zoekwoord de schatting van Google van hoe vaak er per maand op wordt gezocht.' },
        { icon: Target, title: 'Concurrentie', body: 'Per zoekwoord laag, gemiddeld of hoog.' },
        { icon: Coins, title: 'Geschatte prijs per klik', body: 'De bandbreedte van de biedingen waarmee een advertentie boven aan de pagina komt.' },
        { icon: Plus, title: 'Met één klik in de meting', body: 'Het gekozen zoekwoord gaat direct de meting van de posities van dit project in.' },
        { icon: Sparkles, title: 'Vragen voor de meting in AI', body: 'Een zoekwoord wordt een vraag in gewone taal waarmee u nagaat of de AI-diensten uw bedrijf aanbevelen.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'Over de gegevens',
      body: (
        <>
          <p>De gegevens komen uit de API van Google Ads. Zoekvolume, concurrentie en prijs per klik zijn schattingen van Google en veranderen met de branche, het seizoen en de regio.</p>
          <p>Als uitgangspunt om een onderwerp te kiezen is dat genoeg. Het werkelijke resultaat meten wij met de meting van de posities.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Vind de zoekwoorden waarvoor het werk de moeite waard is',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
