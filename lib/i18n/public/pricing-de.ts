/**
 * The German pricing page's words around the plan grid
 * (app/(public)/de/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Germany sees the same dollar
 * price every market outside Israel is billed in today, because Germany's own
 * local price is not set yet. Nothing here promises a currency, and the German
 * page never names euros — under the Preisangabenverordnung the price shown has
 * to be the price actually charged, and the charge is in dollars.
 *
 * The tax note matters more here than anywhere else: a German consumer price
 * has to be a total price including VAT, and the dollar line says who the seller
 * is (Creem, as merchant of record) and that the final amount including tax is
 * shown before payment, which is where the total price is actually stated.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingDe: PricingCopy = {
  hero: {
    eyebrow: 'Preise',
    title: 'Alles, was nötig ist, um gefunden zu werden,',
    accent: 'zu einem monatlichen Preis',
    subtitle: 'Artikel, die geschrieben und auf Ihrer Website veröffentlicht werden, die Überwachung der Positionen in Google und in Google Maps und eine Prüfung, was ChatGPT und Gemini empfehlen. Den Tarif wählen Sie nach Ihrem Bedarf, und los geht es mit einem kostenlosen Test.',
    trust: [`${DAYS} Tage kostenlos testen`, 'Ohne Kreditkarte', 'Jederzeit im Dashboard kündbar'],
  },
  plans: {
    perMonth: '/Monat',
    popular: 'Unsere Empfehlung',
    cta: `${DAYS} Tage kostenlos testen`,
    dashboard: 'Mein Dashboard',
    noCard: 'Ohne Kreditkarte',
    checksNote: CHECKS_EXPLAINER.de,
    taxNote: {
      ILS: 'Die Preise enthalten die israelische Mehrwertsteuer. Es ist der Betrag, der gezahlt wird, ohne Zusätze.',
      USD: 'Bei Kartenzahlung ist Creem der Verkäufer und tritt als eingetragener Händler auf: Creem berechnet die Steuer anhand der Rechnungsadresse und zeigt den Endbetrag vor der Zahlung an. Die hier genannten Preise enthalten sie nicht.',
    },
    /* 전자상거래법 제21조 제1항 제1호 forbids inducing a consumer by withholding a
       material fact, and it binds any business carrying on electronic commerce,
       not only a mail-order seller, so it bites BEFORE any contract. Shown only
       to a visitor placed in Korea, on every language's page, because the duty
       follows the consumer and not the page. lib/billing/korea-sale.ts. */
    koreaTrialOnly: 'In Südkorea ist derzeit nur die kostenlose Testphase verfügbar, ein bezahltes Abonnement wird dort nicht verkauft. Die Testphase endet nach sieben Tagen automatisch, und wir erheben keine Kartendaten, es wird also nichts abgebucht.',
    everyPlanLabel: 'In allen Tarifen',
    everyPlan: [
      'Automatische geplante Veröffentlichung auf WordPress, Shopify und Wix',
      'Die Überwachung der Position in Google und in Google Maps',
      'Eine Prüfung, ob 6 KI-Engines wie ChatGPT und Gemini das Unternehmen nennen',
      'Ein Website-Gesundheitswert mit der Liste der nötigen Korrekturen',
      'Berichte als PDF und Excel, fertig zum Versenden',
      'Eine persönliche Begleitung',
    ],
  },
  unsure: {
    text: 'Noch nicht überzeugt? Beginnen Sie mit einer kostenlosen Website-Analyse.',
    cta: 'Meine Website analysieren',
  },
  included: {
    eyebrow: 'In allen Tarifen',
    title: 'Keine Zusatzoptionen. Alles ab dem ersten Tag enthalten.',
    body: 'Die Tarife unterscheiden sich nur im Umfang: wie viele Websites, wie viele Artikel und wie viele Prüfungen pro Monat. Die Funktionen sind in allen dieselben.',
    items: [
      {
        title: 'Artikel, die geschrieben und veröffentlicht werden',
        desc: 'Die Plattform schreibt vollständige Artikel zu den freigegebenen Themen, mit Bildern, einem Fragen-und-Antworten-Abschnitt und interner Verlinkung, und veröffentlicht sie nach Plan auf Ihrer Website.',
      },
      {
        title: 'Überwachung in Google und in Google Maps',
        desc: 'Auf welcher Position das Unternehmen bei jedem Suchbegriff steht, der zählt — in der klassischen Suche und in Maps — und wie sich das über die Zeit verändert.',
      },
      {
        title: 'Sichtbarkeit in den KI-Engines',
        desc: 'Prüft, ob ChatGPT, Gemini, Perplexity, Copilot, Grok und Google AI das Unternehmen nennen, und wen sie stattdessen nennen.',
      },
      {
        title: 'Keyword-Recherche',
        desc: 'Die Plattform findet, wonach Ihre Kunden suchen und was sie fragen, und schlägt vor, womit zu beginnen ist.',
      },
      {
        title: 'Berichte, fertig zum Versenden',
        desc: 'Positionen, Entwicklungen und Sichtbarkeit in KI-Antworten in einem PDF- oder Excel-Bericht, mit einem Klick erstellt und bereit für einen Kunden oder die Geschäftsführung.',
      },
      {
        title: 'Eine persönliche Begleitung',
        desc: 'Es antworten echte Menschen, über WhatsApp und per E-Mail.',
      },
    ],
  },
  value: {
    eyebrow: 'Warum es sich lohnt',
    title: 'Ein Abonnement statt drei Gewerke',
    body: 'Normalerweise braucht es jemanden, der die Themen wählt und schreibt, jemanden, der alles online stellt, und ein Werkzeug, das prüft, ob es gewirkt hat. Hier passiert alles an derselben Stelle.',
    items: [
      {
        title: 'Die Arbeit wird getan, nicht nur gemessen',
        desc: 'Kein weiterer Bericht, der darauf wartet, dass jemand handelt. Die Plattform schreibt und veröffentlicht die Artikel selbst, und nur zu den freigegebenen Themen.',
      },
      {
        title: 'Sie sehen genau, wofür Sie zahlen',
        desc: 'Die veröffentlichten Artikel, die Positionsveränderungen und die Nennungen in KI-Antworten in einem Dashboard, und in einem Bericht, den Sie an jeden weitergeben können.',
      },
      {
        title: 'Ohne Bindung',
        desc: `${DAYS} Tage testen ohne Kreditkarte, monatliche Zahlung und Kündigung jederzeit im Dashboard.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Wie die Nutzung gezählt wird',
    title: 'Kein Kleingedrucktes',
    body: 'Drei einfache Einheiten, und jedes Kontingent erneuert sich jeden Monat.',
    items: [
      {
        title: 'Artikel',
        desc: 'Einen neuen Artikel anzulegen verbraucht eine Einheit des Kontingents. Einen bestehenden Artikel zu bearbeiten, zu planen oder zu veröffentlichen verbraucht nichts.',
      },
      {
        title: 'Positionsprüfung in Google',
        desc: 'Sehen, auf welcher Position ein Keyword steht, an einer Stelle: in Google oder in Google Maps. Dasselbe Keyword in beiden zählt als zwei Prüfungen.',
      },
      {
        title: 'Prüfung der Sichtbarkeit in KI-Antworten',
        desc: 'Einer KI-Engine eine Frage stellen und sehen, ob das Unternehmen genannt wird. Dieselbe Frage in ChatGPT und in Gemini zählt als zwei Prüfungen.',
      },
    ],
    note: 'Das Artikelkontingent gilt pro Konto. In Tarifen mit mehreren Websites wird es von allen Websites gemeinsam genutzt.',
  },
  faq: {
    eyebrow: 'Fragen',
    title: 'Was vor der Tarifwahl gefragt wird',
    body: 'Ihre Antwort nicht gefunden? Schreiben Sie uns über WhatsApp.',
    items: [
      {
        q: 'Welcher Tarif passt zu uns?',
        a: `Basic und Advanced sind für eine Website gedacht, und der wesentliche Unterschied zwischen ihnen ist die Zahl der Artikel pro Monat: ${BASIC_ARTICLES} gegenüber ${ADVANCED_ARTICLES}. Premium ist für mehr als eine Website, Agency für die Betreuung von Kundenwebsites. Sie können klein beginnen und den Tarif jederzeit wechseln.`,
      },
      {
        q: 'Was ist im kostenlosen Test enthalten?',
        a: `${DAYS} Tage ohne Kreditkarte: eine Website, bis zu ${TRIAL_CATALOG.maxKeywordsPerProject} Keywords, bis zu ${TRIAL_CATALOG.maxGoogleChecksLifetime} Positionsprüfungen in Google, bis zu ${TRIAL_CATALOG.maxAIChecksLifetime} Prüfungen der Sichtbarkeit in KI-Antworten und ein Artikel, damit Sie den ganzen Ablauf sehen, vom Anfang bis zur Veröffentlichung.`,
      },
      {
        q: `Was passiert am Ende der ${DAYS} Testtage?`,
        a: 'Sie wählen einen Tarif und machen dort weiter, wo Sie stehen geblieben sind. Wählen Sie keinen, wird nichts abgebucht, denn die Karte wurde nie verlangt.',
      },
      {
        q: 'Können wir den Tarif wechseln oder kündigen?',
        a: 'Ja. Den Tarif wechseln Sie jederzeit, und die neuen Kontingente gelten von diesem Moment an. Gekündigt wird im Dashboard, ohne Strafgebühr und ohne Kündigungskosten.',
      },
      {
        q: 'Was passiert mit Artikeln, die wir nicht nutzen?',
        a: 'Das Kontingent erneuert sich jeden Monat, und nicht genutzte Artikel werden nicht auf den nächsten Monat übertragen.',
      },
      {
        q: 'Starten die Analysen von selbst?',
        a: 'Eine manuelle Analyse können Sie jederzeit starten, oder Sie aktivieren eine automatische monatliche Analyse, die jeden Monat von selbst läuft. Eine automatische tägliche oder wöchentliche Analyse gibt es derzeit nicht.',
      },
      {
        q: 'Können Artikel geplant und automatisch veröffentlicht werden?',
        a: 'Ja. Einen Artikel planen Sie auf ein künftiges Datum, oder Sie veröffentlichen ihn sofort auf einer verbundenen Website: WordPress, Shopify oder Wix.',
      },
      {
        q: 'Wie sind unsere Daten geschützt?',
        a: 'Der gesamte Datenverkehr ist verschlüsselt (SSL/TLS), Passwörter werden verschlüsselt gespeichert, und jedes Konto sieht nur seine eigenen Daten. Die Daten werden nur mit den Dienstleistern geteilt, auf denen die Plattform läuft — Hosting, Zahlungen und Suchdaten — entsprechend der Datenschutzerklärung.',
        // The privacy policy exists in this language (content/legal/de, rendered
        // by app/(public)/de/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: 'Datenschutzerklärung lesen', href: '/de/privacy' },
      },
    ],
  },
  cta: {
    title: 'Möchten Sie zuerst sehen, was die Plattform auf Ihrer Website findet?',
    body: `Die kostenlose Analyse liest Ihre Website und liefert eine erste Zusammenfassung, ohne Anmeldung. Oder Sie starten ${DAYS} Tage Test und probieren alles aus.`,
    check: 'Meine Website kostenlos analysieren',
    trial: 'Kostenlos testen',
    dashboard: 'Mein Dashboard',
  },
}
