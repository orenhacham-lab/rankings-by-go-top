import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Keyword-Recherche | Go Top SEO',
  description: 'Keyword-Ideen aus den Daten von Google Ads. Mit Suchvolumen, Wettbewerb und geschätztem Klickpreis. Jedes Keyword lässt sich in die Messung der Positionen übernehmen oder in eine Frage für die KI verwandeln.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['de']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Keyword-Recherche',
    eyebrowIcon: Search,
    title: 'Was Ihre Kunden wirklich suchen,',
    accent: 'wird zu Artikeln',
    subtitle: 'Keyword-Ideen aus den Daten von Google Ads. Mit dem monatlichen Suchvolumen, dem Wettbewerb und dem geschätzten Klickpreis. Was passt, übernehmen Sie in die Messung, oder Sie verwandeln es mit einem Klick in eine Frage für die KI.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="Klimaanlage Montage"
        headers={['Keyword', 'Suchen im Monat', 'Wettbewerb']}
        rows={[
          { keyword: 'klimaanlage montage firma', volume: '1.900', competition: 'Mittel', level: 'medium', added: true },
          { keyword: 'klimaanlage einbauen kosten', volume: '1.300', competition: 'Niedrig', level: 'low' },
          { keyword: 'deckenklimagerät', volume: '590', competition: 'Hoch', level: 'high' },
          { keyword: 'klimaanlage reparatur münchen', volume: '320', competition: 'Niedrig', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum hier anfangen',
      title: 'Der beste Artikel zu einem Keyword, das niemand sucht, bringt niemanden',
      intro: 'Noch bevor das erste Wort geschrieben ist, sehen Sie, wonach Menschen suchen, wie oft sie danach suchen und wie schwer es ist, darum mitzuhalten.',
      items: [
        { icon: TrendingUp, title: 'Die wirkliche Nachfrage', body: 'Das geschätzte monatliche Suchvolumen je Keyword, nach den Daten von Google.' },
        { icon: Target, title: 'Wo Sie gewinnen können', body: 'Der Wettbewerb je Keyword, damit Sie die wählen, bei denen eine vordere Position wirklich erreichbar ist.' },
        { icon: Coins, title: 'Was ein Klick wert ist', body: 'Was Werbetreibende für einen Klick zahlen. Das ist ein Hinweis darauf, wie viel dieses Keyword für das Unternehmen wert ist.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Von einem Einfall zu einer Liste von Aufgaben',
      items: [
        { title: 'Sie beginnen mit einem Keyword oder einer Website', body: 'Geben Sie ein Keyword oder die Adresse einer Website ein und wählen Sie Land und Sprache.' },
        { title: 'Sie erhalten Ideen mit Zahlen', body: 'Eine Liste verwandter Keywords, jeweils mit Suchvolumen, Wettbewerb und geschätztem Klickpreis.' },
        { title: 'Sie arbeiten unmittelbar weiter', body: 'Übernehmen Sie das Keyword in die Messung der Positionen oder verwandeln Sie es in eine Frage für die Messung der Sichtbarkeit in der KI.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was Sie tun können',
      title: 'Alles, was es braucht, um die passenden Keywords zu wählen',
      items: [
        { icon: Lightbulb, title: 'Ideen aus einem Keyword oder einer Website', body: 'Aus einem einzelnen Keyword oder aus der Adresse einer Website entstehen verwandte Keywords.' },
        { icon: TrendingUp, title: 'Suchvolumen', body: 'Je Keyword die Schätzung von Google, wie oft es im Monat gesucht wird.' },
        { icon: Target, title: 'Wettbewerb', body: 'Je Keyword niedrig, mittel oder hoch.' },
        { icon: Coins, title: 'Geschätzter Klickpreis', body: 'Die Spanne der Gebote, mit denen eine Anzeige oben auf der Seite erscheint.' },
        { icon: Plus, title: 'Mit einem Klick in die Messung', body: 'Das gewählte Keyword geht unmittelbar in die Messung der Positionen dieses Projekts ein.' },
        { icon: Sparkles, title: 'Fragen für die Messung in der KI', body: 'Ein Keyword wird zu einer Frage in natürlicher Sprache, mit der Sie prüfen, ob die KI-Dienste Ihr Unternehmen empfehlen.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'Über die Daten',
      body: (
        <>
          <p>Die Daten kommen aus der API von Google Ads. Suchvolumen, Wettbewerb und Klickpreis sind Schätzungen von Google und ändern sich mit der Branche, der Jahreszeit und der Region.</p>
          <p>Als Ausgangspunkt für die Wahl eines Themas genügt das. Das wirkliche Ergebnis messen wir mit der Messung der Positionen.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Finden Sie die Keywords, für die sich die Arbeit lohnt',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
