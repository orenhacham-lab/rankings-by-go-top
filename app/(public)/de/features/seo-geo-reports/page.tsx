import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingDe } from '@/lib/i18n/public/landing-de'

export const metadata: Metadata = {
  title: 'Berichte zu SEO und GEO | Go Top SEO',
  description: 'Berichte für die Arbeit als PDF und Excel, mit den Positionen, den Veränderungen und einer Betrachtung der Wettbewerber. In Sekunden bereit, um an Kunden zu gehen.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['de']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Berichte',
    eyebrowIcon: ChartColumn,
    title: 'Ein Bericht, der zeigt, was sich verändert hat,',
    accent: 'mit einem Klick',
    subtitle: 'Die Positionen bei Google und in Google Maps und die Sichtbarkeit in den KI-Diensten, zusammengeführt in einem Bericht als PDF oder Excel. Bereit, so wie er ist an einen Kunden, ins eigene Haus oder an Sie selbst zu gehen.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingDe.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum ein Bericht nötig ist',
      title: 'Gute Arbeit muss sichtbar gemacht werden',
      intro: 'Ein verständlicher Bericht erspart die Erklärung und zeigt, dass die Website vorangeht.',
      items: [
        { icon: Eye, title: 'Das ganze Bild', body: 'Google, Google Maps und die KI an einem Ort. Sie müssen keine Bildschirme aus mehreren Werkzeugen zusammenkleben.' },
        { icon: Clock, title: 'Nichts von Hand zusammenzusetzen', body: 'Die Daten liegen schon in der Plattform. Der Bericht entsteht aus ihnen mit einem Klick.' },
        { icon: Handshake, title: 'Das Vertrauen des Kunden', body: 'Für Agenturen und Dienstleister: ein regelmäßiger Bericht zeigt dem Kunden, was sich verändert hat und warum es sich lohnt, weiterzumachen.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Von den Daten zum Bericht in drei Schritten',
      items: [
        { title: 'Sie wählen das Projekt', body: 'Je Website gibt es ein Projekt, und jedes hat seine eigenen Berichte.' },
        { title: 'Sie exportieren', body: 'Als PDF zum Weitergeben oder als Excel, um mit den Daten weiterzuarbeiten.' },
        { title: 'Sie senden', body: 'An den Kunden, ins eigene Haus oder an den Partner, ohne vorher etwas zurechtzulegen.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was im Bericht steht',
      title: 'Nur, was etwas bedeutet, und nicht, was nichts bedeutet',
      items: [
        { icon: TrendingUp, title: 'Positionen und Veränderungen', body: 'Je Keyword die heutige Position, die vorige und der Unterschied dazwischen.' },
        { icon: ArrowUpDown, title: 'Die Seite, die vorne steht', body: 'Je Keyword, welche Seite Ihrer Website erscheint.' },
        { icon: ChartColumn, title: 'Der geschätzte Zustrom', body: 'Eine Schätzung der Besuche aus Google, nach dem Suchvolumen und der heutigen Position.' },
        { icon: Sparkles, title: 'Sichtbarkeit in der KI', body: 'Die Nennungen Ihrer Website und die Quellenangaben, je KI-Dienst.' },
        { icon: History, title: 'Der vollständige Verlauf', body: 'In der Datei für Excel stehen alle bisherigen Messungen, nicht nur die letzte.' },
        { icon: FileSpreadsheet, title: 'PDF und Excel', body: 'Ein gesetztes PDF zum Weitergeben und eine Datei für Excel, wenn Sie mit den Zahlen weiterarbeiten wollen.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Häufige Fragen',
      title: 'Was zu den Berichten gefragt wird',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete German block, so the export really does come out
        // in German. Keep this answer and those two files in step.
        { q: 'In welcher Sprache kommt der Bericht?', a: 'Der Bericht kommt in der Sprache des Dashboards. Deutsch ist eine davon, und daneben gibt es Hebräisch, Englisch, Spanisch, Portugiesisch, Französisch, Italienisch und Japanisch.' },
        { q: 'Kann ich für jeden Kunden einen eigenen Bericht erstellen?', a: 'Ja. Je Website gibt es ein Projekt, und jedes Projekt hat seine eigenen Berichte. Wie viele Projekte in einem Tarif enthalten sind, steht auf der Preisseite.' },
        { q: 'Sind die Berichte in jedem Tarif enthalten?', a: 'Ja. Die Berichte als PDF und Excel sind in jedem Tarif enthalten.' },
      ],
    },
  ],
  cta: {
    title: 'Bis zum ersten Bericht sind es wenige Tage',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
