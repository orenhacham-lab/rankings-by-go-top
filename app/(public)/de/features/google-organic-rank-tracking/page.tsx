import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingDe } from '@/lib/i18n/public/landing-de'

export const metadata: Metadata = {
  title: 'Positionen bei Google messen | Go Top SEO',
  description: 'Messen Sie Ihre Positionen bei Google je Keyword, Ort, Sprache und Gerät. Jederzeit von Hand oder einmal im Monat automatisch, mit dem Verlauf und einem Bericht zu den Wettbewerbern.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['de']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Positionen bei Google',
    eyebrowIcon: TrendingUp,
    title: 'Sie sehen, auf welchem Platz Ihr Unternehmen bei Google steht,',
    accent: 'und ob die Arbeit Früchte trägt',
    subtitle: 'Wir messen jedes wichtige Keyword einzeln, nach Land, Stadt, Sprache und Gerät. Jederzeit von Hand, und einmal im Monat auch automatisch. Jede Veränderung bleibt im Verlauf.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingDe.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum messen',
      title: 'Was nicht gemessen wird, wird nicht besser',
      intro: 'Ohne Messung wissen Sie nicht, ob ein neuer Artikel, eine Änderung an der Website oder die Arbeit einer Agentur etwas verändert hat.',
      items: [
        { icon: LineChart, title: 'Sie sehen die Bewegung', body: 'Je Keyword, ob es gestiegen, gefallen oder unverändert ist, im Vergleich mit der vorigen Messung.' },
        { icon: FileText, title: 'Inhalt und Ergebnis hängen zusammen', body: 'Sie sehen, welche Seite nach der Veröffentlichung eines Artikels gestiegen ist, und worüber als Nächstes zu schreiben ist.' },
        { icon: Target, title: 'Sie setzen die Kraft dort ein, wo es nah ist', body: 'Ein Keyword knapp unterhalb der ersten Seite ist meist die nächstliegende Gelegenheit. Die Messung zeigt, welches das ist.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Einmal eingerichtet, und jede Veränderung ist sichtbar',
      items: [
        { title: 'Sie fügen Keywords hinzu', body: 'Geben Sie die wichtigen Keywords ein oder übernehmen Sie sie mit einem Klick aus der Keyword-Recherche.' },
        { title: 'Sie wählen Ort und Gerät', body: 'Land, Sprache, Stadt und Computer oder Smartphone — jedes davon ändert die Suchergebnisse.' },
        { title: 'Sie messen und verfolgen die Bewegung', body: 'Sie können jederzeit von Hand messen und die monatliche automatische Messung übernehmen lassen. Jedes Ergebnis bleibt im Verlauf.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was Sie erhalten',
      title: 'Sie wissen genau, wo Ihr Unternehmen bei Google steht',
      items: [
        { icon: Smartphone, title: 'Computer und Smartphone getrennt', body: 'Die Suchergebnisse auf dem Smartphone und auf dem Computer sind nicht immer dieselben. Wir prüfen jedes für sich.' },
        { icon: Globe, title: 'Nach Land, Stadt und Sprache', body: 'Sie sehen, was ein Kunde sieht, der aus dem Gebiet sucht, auf das es Ihnen ankommt.' },
        { icon: Link2, title: 'Die Seite, die vorne steht', body: 'Je Keyword, welche Seite Ihrer Website in den Suchergebnissen erscheint.' },
        { icon: History, title: 'Der vollständige Verlauf', body: 'Jede Messung bleibt erfasst, sodass Sie nicht nur die heutige Aufnahme sehen, sondern den Weg dorthin.' },
        { icon: MapPin, title: 'Google Maps ebenso', body: 'Dieselben Keywords messen wir auch in Google Maps, je Stadt und Gebiet.' },
        { icon: FileSpreadsheet, title: 'Berichte als PDF und Excel', body: 'Ein Bericht mit den Positionen, den Veränderungen und dem Verlauf, den Sie weitergeben können, wem Sie wollen.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Häufige Fragen',
      title: 'Was zur Messung der Positionen gefragt wird',
      items: [
        { q: 'Wie oft werden die Positionen gemessen?', a: 'Jedes Mal, wenn Sie eine Messung von Hand starten, und einmal im Monat automatisch, wenn Sie das einrichten. Eine tägliche oder wöchentliche automatische Messung gibt es derzeit nicht.' },
        { q: 'Warum weicht die Position, die ich bei Google sehe, von der Zahl in der Plattform ab?', a: 'Google verändert die Ergebnisse je nach Ort, Gerät und Suchverlauf. Die Plattform misst unter festen Bedingungen, die Sie selbst festlegen, und das macht die Zahl über die Zeit hinweg vergleichbar.' },
        { q: 'Wie viele Keywords lassen sich messen?', a: 'Das hängt von Ihrem Tarif ab. Die genauen Grenzen stehen auf der Preisseite.' },
      ],
    },
  ],
  cta: {
    title: 'Finden Sie heraus, wo Sie heute stehen',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
