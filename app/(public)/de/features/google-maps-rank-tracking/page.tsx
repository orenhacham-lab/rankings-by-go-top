import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Positionen in Google Maps messen | Go Top SEO',
  description: 'Messen Sie Ihre Sichtbarkeit in Google Maps. Die Position je Stadt und je Gebiet. Die Gewinnung von Kunden aus der Suche in der Nähe beginnt hier.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['de']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'Wenn jemand in der Nähe ein Unternehmen wie Ihres sucht,',
    accent: 'sehen Sie, wo Sie auf der Karte stehen',
    subtitle: 'Wir messen Ihre Position in Google Maps, je Keyword und je Gebiet. Auf die Stadt genau oder von einem genauen Punkt auf der Karte aus. Sie sehen, wer über Ihnen steht und wie sich die Position über die Zeit bewegt hat.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // Das Beispiel ist der deutsche Markt, keine übersetzte amerikanische oder
    // japanische Fassung: dieselbe Beispielwelt wie auf der deutschen
    // Keyword-Seite (München, Klimaanlagen, Südstadt Klima und die Nachbarn).
    // Die Zahlen sind die Beispielwerte, die die englische, spanische und
    // französische Seite schon zeigen, es wird also keine neue Bewertung und
    // keine neue Zahl an Bewertungen erfunden.
    visual: (
      <MapsVisual
        positionLabel="Ihre Position"
        position="3"
        positionSub="München, „Klimaanlage Montage“"
        changeLabel="Diesen Monat"
        change="2"
        changeSub="Plätze gestiegen"
        reviewsLabel="Bewertungen"
        rows={[
          { rank: 1, name: 'Südstadt Klima GmbH', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Isar Kältetechnik', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Ihr Unternehmen', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Klimapunkt München', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum die Karte zählt',
      title: 'In der Suche in der Nähe ist die Karte das Schaufenster',
      intro: 'Wer in der Nähe eine Dienstleistung sucht, bekommt von Google zuerst einige Unternehmen auf der Karte gezeigt. Dort entscheidet sich, wen der Kunde anruft.',
      items: [
        { icon: Phone, title: 'Von dort kommen die Anrufe', body: 'In den Ergebnissen auf der Karte genügt ein Tippen, um anzurufen, den Weg zu suchen oder die Website zu öffnen.' },
        { icon: Users, title: 'Wenige Plätze, viele Wettbewerber', body: 'Die vorderen Plätze besetzen nur einige Unternehmen. Sie müssen wissen, ob Ihres dabei ist.' },
        { icon: MapPin, title: 'Jedes Gebiet ist ein eigenes Rennen', body: 'In einer Stadt stehen Sie auf dem ersten Platz, in der Nachbarstadt erscheinen Sie gar nicht. Die Messung je Gebiet zeigt das.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Drei Schritte, und das Bild auf der Karte ist klar',
      items: [
        { title: 'Sie tragen Ihr Unternehmen ein', body: 'Tragen Sie Ihr Unternehmen und die Gebiete ein, in denen Sie arbeiten.' },
        { title: 'Sie wählen Keywords und Gebiet', body: 'Zum Beispiel „Klimaanlage Montage“ in München, oder von einem genauen Punkt auf der Karte aus.' },
        { title: 'Sie verfolgen die Bewegung', body: 'Sie können jederzeit von Hand messen und einmal im Monat automatisch messen lassen. Jede Veränderung bleibt im Verlauf.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was Sie erhalten',
      title: 'Nicht geschätzt, sondern Ihre Position auf der Karte',
      items: [
        { icon: MapPin, title: 'Nach Stadt und nach Gebiet', body: 'Je Keyword, in dem Gebiet, in dem Ihre Kunden sind.' },
        { icon: Navigation, title: 'Ein genauer Punkt auf der Karte', body: 'Wir prüfen von den Koordinaten aus, die Sie angeben, sodass Sie sehen, was ein Kunde genau dort sieht.' },
        { icon: Store, title: 'Wer über Ihnen steht', body: 'Die Unternehmen, die in den Ergebnissen über Ihnen erscheinen, und ihre Bewertung bei Google.' },
        { icon: History, title: 'Der Verlauf der Positionen', body: 'Sie sehen, wie sich die Position seit der vorigen Messung verändert hat.' },
        { icon: Search, title: 'Die gewöhnliche Suche ebenso', body: 'Dieselben Keywords messen wir auch in den gewöhnlichen Suchergebnissen von Google.' },
        { icon: FileSpreadsheet, title: 'Berichte als PDF und Excel', body: 'Die Positionen in Google Maps stehen ebenfalls im Bericht, den Sie weitergeben können, wem Sie wollen.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Häufige Fragen',
      title: 'Was zur Messung in Google Maps gefragt wird',
      items: [
        { q: 'Brauche ich ein Google-Unternehmensprofil?', a: 'Um in Google Maps zu erscheinen, brauchen Sie einen Eintrag im Google-Unternehmensprofil. Die Messung zeigt Ihnen, wo dieser Eintrag erscheint und wo nicht.' },
        { q: 'Wie oft werden die Positionen gemessen?', a: 'Jedes Mal, wenn Sie eine Messung von Hand starten, und einmal im Monat automatisch, wenn Sie das einrichten. Eine tägliche oder wöchentliche automatische Messung gibt es derzeit nicht.' },
        { q: 'Zählt ein Keyword in Google Maps als eigene Prüfung?', a: 'Ja. Eine Prüfung bei Google ist ein Keyword in einem Gebiet. Wenn Sie dasselbe Keyword in der gewöhnlichen Suche und in Google Maps messen, sind das zwei Prüfungen.' },
      ],
    },
  ],
  cta: {
    title: 'Finden Sie heraus, wer in Ihrem Gebiet die Anrufe bekommt',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
