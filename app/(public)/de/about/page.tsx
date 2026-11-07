import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function GermanAboutPage() {
  return <AboutPage locale="de" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish, French, Italian and
 * Japanese ones, in German.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the German
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['de'], href: '/de/about' },
  title: 'Elf Jahre SEO-Praxis,',
  accent: 'in einer Plattform zusammengeführt.',
  subtitle: 'Eine Plattform, die Artikel für Ihre Website schreibt und veröffentlicht, die Positionen bei Google und in Google Maps misst und prüft, ob die KI-Dienste Ihr Unternehmen empfehlen. Gebaut von Go Top, einer Agentur für digitales Marketing mit mehr als elf Jahren Arbeit in der organischen Gewinnung von Besuchern und in der Anzeigenschaltung.',
  who: {
    title: 'Das Unternehmen, das diese Plattform baut',
    paragraphs: [
      'Go Top SEO wird von Go Top gebaut, einer Agentur für digitales Marketing, die seit mehr als elf Jahren für Unternehmen in Israel und im Ausland organische Sichtbarkeit, Onlinewerbung und Websites betreut.',
      'Die Plattform ist aus der täglichen Arbeit mit diesen Kunden entstanden. Wir haben gesehen, welcher Bericht wirklich etwas sagt, welche Daten bei einer Entscheidung helfen und wo die Zeit verloren geht. Also haben wir einen Ort gebaut, an dem Inhalte geschrieben, veröffentlicht und gemessen werden — bei Google und in den KI-Diensten.',
    ],
  },
  founderEyebrow: 'Die Person, die dieses Projekt führt',
  gaps: {
    title: 'Was gefehlt hat, und was wir stattdessen gebaut haben',
    body: 'Wir wollten, dass sich alles, was zum Gefundenwerden nötig ist, an einem Ort tun lässt, ohne vorher zu lernen, wie organische Suche funktioniert.',
    missingLabel: 'Was gefehlt hat',
    builtLabel: 'Was wir gebaut haben',
    rows: [
      {
        pain: { title: 'Positionen von Hand zu prüfen dauert zu lange', description: 'Dasselbe Keyword wieder und wieder nachsehen, eine Suchergebnisseite nach der anderen öffnen und von Hand rechnen — das kostet den halben Tag.' },
        answer: { title: 'Positionen bei Google und in Google Maps', description: 'Die Positionen in der organischen Suche und in Google Maps, je Keyword, nach Ort und nach Gerät gemessen, mit dem Verlauf der Veränderungen.' },
      },
      {
        pain: { title: 'Die Daten liegen über mehrere Werkzeuge verstreut', description: 'Die Position bei Google, die Position in Google Maps und die Sichtbarkeit in den KI-Diensten stehen jeweils an einem anderen Ort, und kein Bild fügt sich zusammen.' },
        answer: { title: 'Alles an einem Ort', description: 'Keyword-Recherche, Positionen, Sichtbarkeit in der KI und die Artikel hängen miteinander zusammen, statt in vier getrennten Werkzeugen zu liegen.' },
      },
      {
        pain: { title: 'Die KI-Dienste sind schon Teil der Suche', description: 'Immer mehr Kunden fragen ChatGPT, Gemini und Google AI Mode. Sie müssen wissen, ob Ihr Unternehmen in diesen Antworten vorkommt.' },
        answer: { title: 'Messung der Sichtbarkeit in der KI', description: 'Sie sehen, ob Ihr Unternehmen in den Antworten von ChatGPT, Gemini und Google AI Mode genannt, als Quelle angegeben oder empfohlen wird.' },
      },
      {
        pain: { title: 'Inhalte, die auf halbem Weg stehen bleiben', description: 'Zu wissen, worüber zu schreiben ist, ist die halbe Arbeit. Der Rest ist schreiben, veröffentlichen und messen.' },
        answer: { title: 'Artikel schreiben und veröffentlichen', description: 'Zu den Themen, die Sie freigeben, entsteht ein fertiger Artikel mit Bildern, einem Abschnitt mit Fragen und Antworten und internen Links, veröffentlicht in WordPress oder Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Wie wir arbeiten',
    items: [
      {
        title: 'Transparenz',
        description: 'Wir sagen Ihnen, was wir messen, woher die Daten kommen und was sie bedeuten. Keine aufgeblähten Kennzahlen.',
      },
      {
        title: 'Daten, die etwas nützen',
        description: 'Berichte, die eine Geschichte erzählen, die betriebswirtschaftlich Sinn ergibt, statt gut aussehender Zahlen.',
      },
      {
        title: 'Eine verständliche Oberfläche',
        description: 'Inhalte, Positionen bei Google und in Google Maps und die Sichtbarkeit in der KI auf einem Bildschirm, ohne alles Überflüssige.',
      },
      {
        title: 'SEO und GEO zusammen',
        description: 'Inhalte für Google und Inhalte für die KI-Dienste, und die Messung von beidem.',
      },
    ],
  },
  choose: {
    title: 'Warum Go Top SEO',
    items: [
      {
        title: 'Eine Person, die unmittelbar und ohne Abstriche antwortet',
        description: 'Kein „Account Manager“, der jeden Monat wechselt. Dieselbe Person, die Ihr Unternehmen kennt, antwortet Ihnen.',
      },
      {
        title: 'Vollständige Transparenz',
        description: 'Sie sehen jederzeit, was in Ihrem Konto geschieht, was gewirkt hat und was nicht, und wie es weitergeht.',
      },
      {
        title: 'Fachliche Tiefe ohne Fachjargon',
        description: 'Wir reihen keine schwierigen Wörter aneinander. Wir sprechen über Ergebnisse, die messbar und verständlich sind.',
      },
      {
        title: 'Wir sind selbst ein Unternehmen',
        description: 'Wir kennen den Druck, das begrenzte Budget und den Wunsch, Ergebnisse zu sehen, weil wir dasselbe erleben.',
      },
    ],
  },
  cta: {
    title: 'Sehen Sie, was diese Plattform an Ihrer Website ändert',
    body: FEATURE_COMMON['de'].closeBody,
    contact: 'Fragen richten Sie an:',
    updated: 'Diese Seite wurde im September 2026 zuletzt aktualisiert',
  },
}
