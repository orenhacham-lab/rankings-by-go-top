/**
 * The German home page's words (app/(public)/de/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * German in the formal register: "Sie", "Ihre Website", never "du" and never an
 * informal imperative. Buttons take the infinitive ("Kostenlos starten"), which
 * is what a German product page actually prints, and the established SEO
 * vocabulary stays in the words the industry uses — "Keywords", "Rankings",
 * "Backlinks" — because translating those into "Schlüsselwörter" reads as a
 * machine translation to the reader we are trying to win.
 *
 * The demo's example business is in Berlin rather than in Milan: the German
 * site opens in Germany, and a demo full of Italian cities reads as a
 * translated page rather than a German one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/de/features/...' here would ship
 * '/de/de/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise. Prices come from the plan catalogue,
 * so the page cannot drift from it, and they are quoted in USD — Germany is
 * billed through Creem in dollars, so naming euros here would be a price we do
 * not charge, which is exactly what the Preisangabenverordnung is about.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Germany has no price of its own yet, so the German
 * page shows the USD price every market outside Israel is billed in today,
 * grouped the German way (1.200, with the dot as the thousands separator).
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('de-DE')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingDe: LandingCopy = {
  hero: {
    eyebrow: 'Automatische Sichtbarkeit in Google und in KI-Antworten, in einem System',
    title: 'Ihre nächsten Kunden suchen schon.',
    accent: 'Wir sorgen dafür, dass sie Sie finden.',
    subtitle:
      'Go Top SEO schreibt und veröffentlicht Artikel, die genau das beantworten, wonach Ihre Kunden suchen, und zeigt Ihnen danach, wo Ihr Unternehmen in Google, Google Maps, ChatGPT und Gemini auftaucht. Ohne Content-Team. Ohne Raten.',
    signup: `${TRIAL_DAYS} Tage kostenlos testen`,
    trialNote: 'Ohne Kreditkarte, ohne Bindung. Jederzeit kündbar.',
    checkLead: 'Noch kein Konto? Kostenlose Website-Analyse, ohne Anmeldung:',
    dashboard: 'Mein Dashboard',
    trust: ['Veröffentlicht auf WordPress, Shopify und Wix', 'Support von echten Menschen'],
    climbChip: 'Position 3 in Google',
    published: 'Artikel auf Ihrer Website veröffentlicht',
  },
  demo: {
    label: 'Eine echte Demo der Plattform',
    caption: 'Produktdemo. Firmennamen und Zahlen sind Beispiele.',
    tabs: ['Der Aufstieg in Google', 'Ein neuer Artikel', 'Von der KI empfohlen'],
    describe: [
      'Die Keyword-Ansicht: ein Suchbegriff von Position 18 auf Position 3 in Google, und drei weitere im Aufwärtstrend.',
      'Die Artikel-Ansicht: ein neuer Artikel wird geschrieben, besteht die Qualitätsprüfung und wartet auf die geplante Veröffentlichung auf der Website.',
      'Die Ansicht zur Sichtbarkeit in KI-Antworten: eine ChatGPT-Antwort, die das Unternehmen empfiehlt, und die Engines, die es nennen.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Dashboard', 'Keywords', 'Content-Strategie', 'Artikel', 'Sichtbarkeit in KI', 'Berichte'],
    rank: {
      heading: 'Keywords',
      keyword: 'klimaanlage installieren berlin',
      positionLabel: 'Position in Google',
      period: 'In den letzten 8 Wochen',
      from: 18,
      to: 3,
      columns: ['Keyword', 'Position', 'Veränderung'],
      rows: [
        { keyword: 'wärmepumpe klimaanlage preis', from: 24, to: 7 },
        { keyword: 'klimaanlage reparatur charlottenburg', from: 31, to: 9 },
        { keyword: 'klimaanlage reinigen', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Berlin',
      mapsValue: 'Position 2',
      toast: '15 Positionen in Google gewonnen',
    },
    article: {
      heading: 'Neuer Artikel',
      title: 'Was kostet der Einbau einer Wärmepumpen-Klimaanlage, und was Sie vorher fragen sollten',
      subheading: 'Was bestimmt den Preis?',
      checksTitle: 'Qualitätsprüfung',
      checks: ['Fragen und Antworten', 'Strukturierte Daten', 'Interne Verlinkung', 'Beitragsbild', 'Überschriften aus echten Suchanfragen'],
      draft: 'Wird geschrieben',
      scheduled: 'Geplant',
      when: 'Di. 9:00',
      toast: 'Veröffentlichung auf WordPress',
    },
    ai: {
      heading: 'Sichtbarkeit in KI-Antworten',
      question: 'Wer baut in Berlin gute Klimaanlagen ein?',
      intro: 'Hier sind einige Betriebe, die in diesem Bereich gut empfohlen werden:',
      items: [
        { name: 'Klima Spree', desc: 'Qualifizierte Monteure, Gewährleistung auf die Arbeit und Rückmeldung am selben Tag.', you: true },
        { name: 'ClimaPoint', desc: 'Faire Preise für Reinigung und Wartung.' },
        { name: 'Komfort Berlin', desc: 'Spezialisten für Kanalsysteme.' },
      ],
      youTag: 'Ihr Unternehmen',
      mentionedIn: 'Genannt in:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT empfiehlt Sie',
    },
  },
  worksWith: {
    label: 'Wir prüfen und veröffentlichen für Sie auf:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify', 'Wix'],
  },
  outcomes: {
    eyebrow: 'Was Sie bekommen',
    title: 'Was Go Top SEO tut, während Sie Ihr Unternehmen führen',
    body: 'Kein weiteres Werkzeug, das Sie erst lernen müssen. Ein System, das die Arbeit macht und danach zeigt, was dabei herausgekommen ist.',
    items: [
      {
        title: 'Inhalte, die Kunden bringen, nicht nur Besuche',
        desc: 'Die Plattform findet, wonach Ihre Kunden suchen und was sie fragen, schreibt vollständige Artikel dazu und veröffentlicht sie in gleichmäßigem Rhythmus auf Ihrer Website. Sie wählen nur die Themen.',
        chips: ['Veröffentlicht selbst', 'Mit Bildern', 'Fragen-Abschnitte', 'Interne Verlinkung'],
      },
      {
        title: 'Ein Platz in den Antworten von ChatGPT und Gemini',
        desc: 'Immer mehr Menschen fragen eine KI, statt zu suchen. Sie sehen, ob sie Ihr Unternehmen empfiehlt, wen sie stattdessen empfiehlt und was sich dafür verbessern lässt.',
        chips: ['6 KI-Engines', 'Im Vergleich mit Ihren Wettbewerbern'],
      },
      {
        title: 'Ein klares Bild davon, was wirkt',
        desc: 'Die Positionen in Google und in Maps, die Nennungen in KI-Antworten und die veröffentlichten Artikel auf einer Oberfläche. Ohne Tabellen und ohne Raten.',
        chips: ['Berichte als PDF und Excel', 'Vollständige Historie'],
      },
    ],
    stats: [
      { value: 6, label: 'geprüfte KI-Engines', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok und Google AI' },
      { value: 3, label: 'Kanäle in einem Bericht', detail: 'Google, Google Maps und die KI-Antworten' },
      { value: 3, label: 'Veröffentlichungsplattformen', detail: 'WordPress, Shopify und Wix, ohne Copy-and-paste' },
      { value: TRIAL_DAYS, label: 'Tage kostenlos testen', detail: 'Ohne Kreditkarte' },
    ],
  },
  shift: {
    eyebrow: 'Die Suche hat sich verändert',
    title: 'Kunden gehen nicht mehr nur über Google. Sie fragen eine KI und bekommen drei Empfehlungen.',
    body: 'Wenn Ihre Website die Fragen Ihrer Kunden nicht beantwortet — weder in Google noch in einer ChatGPT-Antwort — geht diese Empfehlung an einen Wettbewerber. Fast kein Unternehmen weiß, wo es dabei steht, weil kein Werkzeug beides zusammen gezeigt hat.',
    withoutTitle: 'Ohne Go Top SEO',
    without: [
      'Ein Artikel alle zwei Monate, wenn jemand die Zeit findet',
      'Keine klare Vorstellung, worüber zu schreiben ist und welcher Suchbegriff sich lohnt',
      'Positionen von Hand geprüft, oder gar nicht',
      'Keine Ahnung, ob ChatGPT Sie oder einen Wettbewerber empfiehlt',
    ],
    withTitle: 'Mit Go Top SEO',
    with: [
      'Ein gleichmäßiger Content-Plan, der veröffentlicht, wann Sie es festlegen',
      'Themen, die aus echten Suchanfragen Ihrer Kunden kommen',
      'Automatische Überwachung der Positionen in Google und in Google Maps',
      'Automatische Prüfungen, was ChatGPT, Gemini und Google AI über Ihr Unternehmen sagen, und drei weitere Engines auf Wunsch',
    ],
  },
  flow: {
    eyebrow: 'So funktioniert es',
    title: 'Von einer Website-Adresse zu Inhalten, die wirken — in vier Schritten',
    body: 'Sie entscheiden, was geschrieben wird. Die Plattform macht den Rest.',
    steps: [
      { tag: 'Kostenlos, ohne Anmeldung', title: 'Website-Analyse', desc: 'Sie geben eine Adresse ein. In weniger als einer Minute erkennen wir, was das Unternehmen tut, wer seine Kunden sind und was die Website in Google und in KI-Antworten zurückhält.' },
      { tag: 'Mit Ihrer Freigabe', title: 'Es kommt ein Plan', desc: 'Die Suchbegriffe, die Fragen Ihrer Kunden und eine Liste von Artikeln, die bereit sind, geschrieben zu werden. Sie wählen aus, was hineinkommt.' },
      { tag: 'Automatisch', title: 'Artikel werden geschrieben und veröffentlicht', desc: 'Jeder Artikel kommt mit seinen Bildern und seinem Fragen-Abschnitt und erscheint am geplanten Datum auf Ihrer Website. Auf WordPress-Seiten mit dem Go-Top-Plugin kommen auch die strukturierten Daten hinzu.' },
      { tag: 'Transparent', title: 'Die Ergebnisse bleiben nachvollziehbar', desc: 'Die Positionen in Google und in Maps, die Nennungen in KI-Antworten und Berichte, die Sie an jeden weitergeben können.' },
    ],
    cta: 'Mit einer kostenlosen Analyse beginnen',
  },
  features: {
    eyebrow: 'Was enthalten ist',
    title: 'Alles, was für den Aufstieg nötig ist, an einem Ort',
    body: 'Vier Werkzeuge, die zusammenarbeiten, damit jeder Artikel gemessen wird und jede Messung den nächsten Artikel bestimmt.',
    more: 'Mehr erfahren',
    note: 'Die Namen und Zahlen in den Ansichten sind Beispiele.',
    content: {
      overline: 'Inhalte und Veröffentlichung',
      title: 'Artikel, die geschrieben werden, um gefunden zu werden — nicht um ein Blog zu füllen',
      body: 'Jeder Artikel steht auf echter Recherche: Überschriften aus den Fragen, die Menschen wirklich stellen, ein Fragen-und-Antworten-Abschnitt, interne Links auf die Seiten, die verkaufen, und auf WordPress-Seiten mit dem Go-Top-Plugin strukturierte Daten, die Google und die KI-Engines lesen. Sie lesen gegen, korrigieren wenn nötig, und die Plattform veröffentlicht.',
      points: ['Ein Beitragsbild und Bilder im Text', 'Eine Qualitätsprüfung vor jeder Veröffentlichung', 'Planung und direkte Veröffentlichung auf WordPress, Shopify und Wix'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Diese Woche auf Ihrer Website',
        days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
        items: [
          { day: 0, title: 'Wie Sie die Klimaanlage für ein Schlafzimmer auswählen', status: 'published', label: 'Veröffentlicht' },
          { day: 2, title: 'Was kostet der Einbau einer Wärmepumpen-Klimaanlage', status: 'scheduled', label: 'Geplant' },
          { day: 4, title: 'Klimaanlage reinigen: wie oft ist nötig?', status: 'writing', label: 'Wird geschrieben' },
        ],
        destinationLabel: 'Veröffentlichung auf',
        destinations: ['WordPress', 'Shopify', 'Wix'],
      },
    },
    ai: {
      overline: 'Sichtbarkeit in KI-Antworten',
      title: 'Wissen, wann ChatGPT Ihr Unternehmen empfiehlt — und wann einen Wettbewerber',
      body: 'Wir stellen den KI-Engines die Fragen, die Ihre Kunden stellen, und prüfen, wer in der Antwort auftaucht. Sie sehen, bei welchen Fragen Ihr Unternehmen gewinnt, wo die Empfehlung an einen Wettbewerber geht und was sich auf der Website dafür verbessern lässt.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok und Google AI', 'Direkt neben Ihren Wettbewerbern', 'Hinweise, was zu ändern ist, um in die Antwort zu kommen'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Wer in der Antwort auftaucht',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Wer baut in Berlin Klimaanlagen ein?', hits: [true, true, true, false, true, false] },
          { question: 'Was kostet die Reinigung einer Klimaanlage?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Anteil der Nennungen',
        you: { label: 'Ihr Unternehmen', value: 58 },
        rival: { label: 'Wichtigster Wettbewerber', value: 42 },
      },
    },
    rank: {
      overline: 'Positionen in Google',
      title: 'Jeden Aufstieg sehen, in Google und in Google Maps',
      body: 'Überwachung jedes Suchbegriffs, der zählt — in der klassischen Suche und in Maps nach Stadt oder Gebiet, mit einer Historie, die zeigt, ob die Artikel ihre Arbeit tun.',
      points: ['Google organisch nach Land, Sprache und Gerät', 'Google Maps nach Stadt oder Gebiet', 'Keyword-Recherche mit Suchvolumen und Wettbewerb'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Ihre Keywords',
        columns: ['Keyword', 'Position', 'Veränderung'],
        rows: [
          { keyword: 'klimaanlage installieren berlin', pos: 3, up: 15 },
          { keyword: 'wärmepumpe klimaanlage preis', pos: 7, up: 17 },
          { keyword: 'klimaanlage reparatur charlottenburg', pos: 9, up: 22 },
          { keyword: 'klimaanlage reinigen', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Berlin', value: 'Position 2 von 20' },
      },
    },
    reports: {
      overline: 'Berichte',
      title: 'Ein Bericht für den Kunden oder die Geschäftsführung, mit einem Klick',
      body: 'Export von Positionen, Entwicklungen und Sichtbarkeit in KI-Antworten als PDF und als Excel. Agenturen betreuen die Websites mehrerer Kunden aus einem Konto, jede in ihrem eigenen Projekt.',
      points: ['PDF und Excel mit einem Klick', 'Mehrere Websites in einem Konto', 'Alle Daten an einem Ort, ohne Berichte von Hand zusammenzusetzen'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Leistungsbericht',
        period: 'September',
        stats: [
          { label: 'Keywords auf Seite 1', value: '14', up: true },
          { label: 'Nennungen in KI-Antworten', value: '9', up: true },
          { label: 'Veröffentlichte Artikel', value: '8' },
          { label: 'Durchschnittliche Position', value: '6,2', up: true },
        ],
        clientsLabel: 'Projekte:',
        clients: ['klima-spree.de', 'studio-dana.de', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Für wen',
    title: 'Für alle, deren Website Kunden bringen soll',
    body: 'Sie müssen keine SEO kennen. Sie müssen wissen, was Sie verkaufen.',
    items: [
      {
        title: 'Unternehmerinnen und Unternehmer',
        desc: 'Mehr Anfragen über Google, ohne Suchmaschinenoptimierung zu lernen und ohne eine Redaktion einzustellen. Sie geben die Themen frei, der Rest läuft von selbst.',
        gain: 'Eine Website, die arbeitet, während Sie beschäftigt sind',
      },
      {
        title: 'Freiberufler und Agenturen',
        desc: 'Mehrere Kunden aus einem Konto betreuen, Inhalte schneller produzieren und jedem Kunden einen klaren Bericht übergeben.',
        gain: 'Mehr Kunden bei gleichen Arbeitsstunden',
      },
      {
        title: 'Marketing-Teams',
        desc: 'Ein gleichmäßiger Veröffentlichungsrhythmus, und an einem Ort das, was die Inhalte in Google und in KI-Antworten bewirken.',
        gain: 'Eine klare Antwort auf „Wirkt das?"',
      },
    ],
  },
  check: {
    eyebrow: 'Kostenlose Website-Analyse',
    title: 'Noch nicht überzeugt? Wir zeigen Ihnen, was wir sehen',
    body: 'Die Analyse liest Ihre Website wirklich und liefert in weniger als einer Minute eine erste Zusammenfassung:',
    items: [
      'Was wir über das Unternehmen verstanden haben und wer seine Kunden sind',
      'Welche Wettbewerber neben dem Unternehmen auftauchen',
      'Was die Website in Google zurückhält, mit den Belegen von der Website selbst',
      'Wie gut die Website auf KI-Antworten vorbereitet ist',
      'Die Liste der Artikel, die wir schreiben würden',
    ],
    cta: 'Meine Website analysieren',
    note: 'Kostenlos, ohne Anmeldung und ohne Kreditkarte.',
    preview: {
      domain: 'klima-spree.de',
      heading: 'Ihre erste Analyse-Zusammenfassung',
      scoreLabel: 'Bereit für KI-Antworten',
      score: '3/4',
      findings: ['Den Bildern fehlt der Alternativtext', 'Kein Fragen-und-Antworten-Abschnitt', 'Die Meta-Description hat nicht die richtige Länge'],
      lockedLabel: 'Weitere Befunde und Wettbewerber werden mit einem kostenlosen Konto freigeschaltet',
    },
  },
  faq: {
    eyebrow: 'Fragen',
    title: 'Was vor dem Start am häufigsten gefragt wird',
    body: 'Ihre Antwort nicht gefunden? Schreiben Sie uns über WhatsApp.',
    items: [
      {
        q: 'Ich weiß nichts über SEO. Ist die Plattform trotzdem etwas für mich?',
        a: 'Ja. Die Plattform wählt die Suchbegriffe, schlägt die Themen vor und schreibt die Artikel. Sie entscheiden nur, was zum Unternehmen passt, und geben es frei.',
      },
      {
        q: 'Wird etwas auf meiner Website veröffentlicht, ohne dass ich es gesehen habe?',
        a: 'Nur freigegebene Themen gehen in die Schreibphase, und jeder Artikel besteht vor der Veröffentlichung eine Qualitätsprüfung. Jeden Artikel können Sie gegenlesen und ändern, und das Veröffentlichungsdatum legen Sie fest.',
      },
      {
        q: 'Warum nicht alles selbst mit ChatGPT schreiben?',
        a: 'Das können Sie, aber dann wählen Sie selbst die Themen, prüfen die Suchbegriffe, bauen die Fragen und Antworten und die strukturierten Daten, verlinken die Seiten untereinander, laden alles auf die Website und prüfen allein, ob es gewirkt hat. Go Top SEO übernimmt die ganze Kette und misst das Ergebnis in Google und in KI-Antworten.',
      },
      {
        q: 'Mit welchen Websites funktioniert das?',
        a: 'Die direkte Veröffentlichung funktioniert mit WordPress, Shopify und Wix. Die Positionsüberwachung, die Sichtbarkeit in KI-Antworten und die Keyword-Recherche funktionieren mit jeder Website.',
      },
      {
        q: `Was passiert am Ende der ${TRIAL_DAYS} Testtage?`,
        a: 'Sie wählen einen Tarif und machen genau dort weiter, wo Sie stehen geblieben sind. Wählen Sie keinen, wird nichts abgebucht, denn die Karte wurde nie verlangt.',
      },
      {
        q: 'Kann ich kündigen?',
        a: 'Ja, jederzeit direkt im Dashboard, ohne Strafgebühr und ohne Kündigungskosten.',
      },
    ],
  },
  cta: {
    title: 'Ihr nächster Kunde sucht heute. Sorgen Sie dafür, dass er Sie findet.',
    body: `Kostenlose Website-Analyse oder ${TRIAL_DAYS} Tage testen: der erste Artikel kann noch heute geschrieben werden.`,
    check: 'Meine Website kostenlos analysieren',
    signup: 'Kostenlos testen',
    dashboard: 'Mein Dashboard',
    pricing: `Tarife ab ${FROM_USD} USD pro Monat.`,
    pricingLink: 'Alle Tarife und Preise ansehen',
  },
}
