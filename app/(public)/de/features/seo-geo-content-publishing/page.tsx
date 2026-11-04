import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingDe } from '@/lib/i18n/public/landing-de'

export const metadata: Metadata = {
  title: 'Inhalte für SEO und GEO schreiben, planen und veröffentlichen | Go Top SEO',
  description:
    'Themen planen, einen vollständigen Artikel von der KI erhalten, ihn überarbeiten, die Veröffentlichung planen und unmittelbar in WordPress oder Shopify veröffentlichen. Alles an einem Ort.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['de']

const faqs = [
  {
    q: 'Muss ich jeden Artikel vor der Veröffentlichung lesen?',
    a: 'Sie müssen nicht, Sie können jederzeit. Geschrieben wird nur zu den Themen, die Sie freigegeben haben, jeder Artikel geht vor der Veröffentlichung durch eine Prüfung der Qualität, und Sie können ihn lesen, überarbeiten und freigeben, bevor er erscheint.',
  },
  {
    q: 'Auf welchen Websites kann veröffentlicht werden?',
    a: 'Die unmittelbare Veröffentlichung unterstützt WordPress und Shopify. Sobald die Website einmal verbunden ist, erscheint jeder freigegebene Artikel dort.',
  },
  {
    q: 'Wie funktioniert die geplante Veröffentlichung?',
    a: 'Sobald Sie einen Artikel freigeben, veröffentlichen Sie ihn sofort oder wählen ein Datum und eine Uhrzeit. Die Plattform veröffentlicht ihn dann von selbst.',
  },
  {
    q: 'Bekommt ein Artikel Bilder und einen Titel für die Suche?',
    a: 'Ja. Jeder Artikel bekommt ein Titelbild und Bilder im Text, einen Meta-Titel und eine Meta-Beschreibung, und alles davon lässt sich vor der Veröffentlichung überarbeiten.',
  },
  {
    q: 'Wie wird die Zahl der Artikel begrenzt?',
    a: 'In jedem Tarif ist eine Zahl von Artikeln im Monat enthalten. Die Grenze hängt am Konto, erneuert sich jeden Monat, und was nicht verbraucht wurde, geht nicht in den nächsten Monat über. Ein erzeugter Artikel verbraucht einen; das Überarbeiten, das Planen und das Veröffentlichen verbrauchen nichts.',
  },
  {
    q: 'Was ist, wenn ich mitten im Monat alles verbraucht habe?',
    a: 'Wechseln Sie in einen Tarif, in dem mehr Artikel enthalten sind, dann machen Sie im selben Monat weiter.',
  },
  {
    q: 'Kann ich es ausprobieren, bevor ich zahle?',
    a: `Ja. Die kostenlose Testphase dauert ${TRIAL_CATALOG.days} Tage und verlangt keine Zahlungskarte. Ein Artikel ist enthalten, sodass Sie den ganzen Weg bis zur Veröffentlichung einmal durchgehen können.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Inhalte schreiben und veröffentlichen',
    eyebrowIcon: FileText,
    title: 'Die Artikel werden geschrieben und auf der Website veröffentlicht,',
    accent: 'auch ohne eine Person für Inhalte',
    subtitle: 'Sie planen die Themen und geben sie frei, und es kommt ein vollständiger Artikel mit Bildern, einem Abschnitt mit Fragen und Antworten und internen Links. Wenn Sie wollen, überarbeiten Sie ihn, und veröffentlichen ihn in WordPress oder Shopify, sofort oder zu einem Datum, das Sie wählen.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingDe.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum Inhalte liegen bleiben',
      title: 'Inhalte werden immer aufgeschoben, weil es in Wahrheit drei Arbeiten sind',
      intro: 'Das Thema finden, schreiben, veröffentlichen. Jedes davon kostet Zeit, also wird es in den nächsten Monat geschoben. Hier enden die drei an einem Ort.',
      items: [
        { icon: Search, title: 'Finden, worüber zu schreiben ist', body: 'Prüfen, wonach Menschen suchen, was die Wettbewerber schon besetzen und was auf der eigenen Website fehlt.' },
        { icon: PenLine, title: 'Ordentlich schreiben', body: 'Ein Entwurf kostet einige Stunden, und danach wird noch geändert und nachgelesen.' },
        { icon: Send, title: 'Veröffentlichen', body: 'Den Text übertragen, Bilder hochladen, die Felder für die Suche füllen und nicht vergessen, auf veröffentlichen zu drücken.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Vom Thema zum veröffentlichten Artikel in fünf Schritten',
      items: [
        { title: 'Sie planen die Themen', body: 'Aus dem Unternehmen und den Keywords der Branche entstehen Vorschläge für Themen.' },
        { title: 'Sie geben frei', body: 'Sie wählen die Themen, die jetzt Sinn ergeben. Nur darüber wird geschrieben.' },
        { title: 'Sie erhalten einen vollständigen Artikel', body: 'Mit Titel, Text, Zwischentiteln, Bildern, einem Abschnitt mit Fragen und Antworten und internen Links.' },
        { title: 'Sie lesen und überarbeiten', body: 'Lesen Sie, ändern Sie, so viel Sie wollen, und geben Sie frei, wenn es passt.' },
        { title: 'Sie planen oder veröffentlichen', body: 'Sofort oder zu dem Datum und der Uhrzeit, die Sie wählen, unmittelbar in WordPress oder Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was in jedem Artikel steckt',
      title: 'Kein bloßer Text, sondern ein fertiger Artikel',
      items: [
        { icon: FileText, title: 'Ein vollständiger Artikel', body: 'Aus dem Thema, das Sie freigegeben haben, wird ein Artikel, keine Zusammenfassung und keine Gliederung.' },
        { icon: ImageIcon, title: 'Bilder', body: 'Ein Titelbild und Bilder im Text. Sie müssen nichts suchen und nichts hochladen.' },
        { icon: ListChecks, title: 'Fragen und Antworten, strukturierte Daten', body: 'In jedem Artikel steht ein Abschnitt mit Fragen und Antworten. Auf Websites mit WordPress und dem Plugin von Go Top kommen strukturierte Daten hinzu, die Google und die KI-Dienste lesen können.' },
        { icon: Link2, title: 'Interne Links', body: 'Es werden Links auf andere Seiten Ihrer Website vorgeschlagen, und Sie entscheiden, welche davon hineinkommen.' },
        { icon: FileCheck2, title: 'Meta-Titel und Meta-Beschreibung', body: 'Für die Suche geschrieben und so überarbeitbar wie alles andere.' },
        { icon: ShieldCheck, title: 'Prüfung der Qualität vor der Veröffentlichung', body: 'Jeder Artikel wird vor der Veröffentlichung nachgelesen. Halbfertiges erscheint nicht.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Unmittelbare Veröffentlichung',
      title: 'Einmal verbunden, und kein Kopieren und Einfügen mehr',
      intro: 'Der Artikel, den Sie freigegeben haben, erscheint unmittelbar auf Ihrer Website, samt Bildern und den Feldern für die Suche.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Verbinden Sie Ihre Website mit WordPress und veröffentlichen Sie den Artikel sofort oder zum geplanten Tag.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Verbinden Sie Ihren Shop bei Shopify und veröffentlichen Sie die Artikel des Blogs unmittelbar aus der Plattform.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Häufige Fragen', title: 'Was zum Schreiben und Veröffentlichen gefragt wird', items: faqs },
  ],
  cta: {
    title: 'Der nächste Artikel kann heute geschrieben werden',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
