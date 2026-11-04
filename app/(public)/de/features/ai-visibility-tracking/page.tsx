import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingDe } from '@/lib/i18n/public/landing-de'

export const metadata: Metadata = {
  title: 'Sichtbarkeit in der KI messen | Go Top SEO',
  description: 'Messen Sie, wie oft Ihr Unternehmen in ChatGPT, Gemini und Google AI Mode genannt wird. Die Optimierung für generative Engines, GEO, in Zahlen.',
  alternates: {
    canonical: 'https://www.gotopseo.com/de/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="de" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['de']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Sichtbarkeit in den KI-Diensten',
    eyebrowIcon: Sparkles,
    title: 'Wenn ein Kunde ChatGPT fragt,',
    accent: 'sehen Sie, ob Ihr Unternehmen empfohlen wird',
    subtitle: 'Die Plattform stellt ChatGPT, Gemini und Google AI Mode dieselben Fragen, die Ihre Kunden stellen, und zeigt Ihnen, wer in den Antworten erscheint. Ihr Unternehmen oder die Wettbewerber.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingDe.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Warum das jetzt zählt',
      title: 'Es gibt Kunden, die nicht mehr bei Google suchen. Sie fragen die KI.',
      intro: 'Wer in der Antwort erscheint, bekommt die Empfehlung. Wer nicht darin vorkommt, bleibt außerhalb des Gesprächs.',
      items: [
        { icon: MessagesSquare, title: 'Die Frage ist in den Chat gewandert', body: 'Statt zehn Suchergebnisse durchzugehen, stellt man eine Frage und bekommt eine Antwort, in der einige Namen stehen. Einer davon sollte Ihr Unternehmen sein.' },
        { icon: Award, title: 'Eine Empfehlung, der geglaubt wird', body: 'Wenn ein KI-Dienst den Namen eines Unternehmens nennt, wird das wie ein Ratschlag aufgenommen. Wer von dort kommt, hat sich bereits entschieden.' },
        { icon: Target, title: 'Die Wettbewerber erscheinen möglicherweise schon', body: 'Ohne zu prüfen wissen Sie nicht, wer in Ihrer Branche empfohlen wird. Die Messung zeigt es je Frage und je Dienst.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Wie es funktioniert',
      title: 'Drei Schritte, und das Bild ist vollständig',
      items: [
        { title: 'Sie wählen die Fragen', body: 'Aus den Keywords des Unternehmens entstehen Vorschläge für Fragen, die Sie ergänzen oder entfernen können. Zum Beispiel „Wer montiert in München eine Klimaanlage?“.' },
        { title: 'Jeder Dienst wird einzeln gefragt', body: 'Eine Frage geht an alle drei Dienste getrennt, und jede Antwort wird gelesen und geprüft.' },
        { title: 'Sie sehen, wer erscheint', body: 'Je Frage sehen Sie, ob Ihr Unternehmen genannt wird, ob Ihre Website als Quelle angegeben ist und wer an Ihrer Stelle genannt wird.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Was Sie erhalten',
      title: 'Alles, was es braucht, um in die Antwort zu kommen',
      items: [
        { icon: Sparkles, title: 'Die Nennungen je Dienst', body: 'Wir sehen uns die drei Dienste getrennt an, weil jeder von ihnen anders antwortet.' },
        { icon: Link2, title: 'Die Angabe als Quelle', body: 'Nicht nur, ob der Name genannt wird, sondern ob die Antwort Ihre Website als Quelle angibt.' },
        { icon: Users, title: 'Wer an Ihrer Stelle genannt wird', body: 'Die Wettbewerber, die in den Antworten erscheinen, und die Fragen, bei denen sie die Empfehlung bekommen.' },
        { icon: Lightbulb, title: 'Was zu verbessern ist', body: 'Vorschläge, was auf der Website zu ergänzen und zu ändern ist, damit die Wahrscheinlichkeit steigt, in der Antwort zu erscheinen.' },
        { icon: LineChart, title: 'Die Entwicklung über die Zeit', body: 'Jede Prüfung bleibt erfasst, sodass Sie sehen, ob die Sichtbarkeit mit den veröffentlichten Artikeln wächst.' },
        { icon: FileSpreadsheet, title: 'Berichte als PDF und Excel', body: 'Ein Bericht mit den Nennungen und den Quellenangaben je Dienst, den Sie an Kunden oder ins eigene Haus weitergeben können.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Häufige Fragen',
      title: 'Was zur Sichtbarkeit in der KI gefragt wird',
      items: [
        { q: 'Was ist der Unterschied zwischen SEO und GEO?', a: 'SEO heißt, in den Suchergebnissen von Google zu erscheinen. GEO heißt, in den Antworten der KI-Dienste zu erscheinen. Die Plattform misst beides, und die Artikel, die sie schreibt, sind für beides gebaut: mit einer klaren Gliederung, einem Abschnitt mit Fragen und Antworten und, auf Websites mit WordPress und dem Plugin von Go Top, mit strukturierten Daten.' },
        { q: 'Garantieren Sie, dass ich in den Antworten erscheine?', a: 'Nein. Was ein KI-Dienst antwortet, kontrolliert niemand. Was wir können, ist Ihre heutige Lage genau zu messen, Ihnen zu zeigen, wer an Ihrer Stelle erscheint, und Inhalte vorzubereiten, die die Wahrscheinlichkeit erhöhen.' },
        { q: 'Wie werden die Prüfungen in der KI gezählt?', a: 'Eine Frage an einen Dienst ist eine Prüfung. Stellen Sie dieselbe Frage allen drei Diensten, sind das drei Prüfungen. Die Grenzen je Tarif stehen auf der Preisseite.' },
      ],
    },
  ],
  cta: {
    title: 'Finden Sie heraus, was ChatGPT über Ihre Branche sagt',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
