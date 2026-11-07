/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Shopify billing, cancel renewal), the
 * trial bar, the "start here" checklist on the dashboard and the long-running
 * action messages, in GERMAN.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so a German card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Abroad the plans are sold in US DOLLARS plus
 * tax, there has never been a euro price, and this file must not invent one.
 * That matters more in German than anywhere else: the Preisangabenverordnung
 * requires the price shown to a consumer to be the total price actually
 * charged, so a euro figure here would be a legal problem and not only a wrong
 * translation. Card payments are sold by Creem as merchant of record: Creem
 * issues the invoice and applies the tax on the billing address, which is what
 * the Creem disclosure below says.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const billingDe: DeepPartial<DashboardDictionary> = {
  reports: {
    title: 'Berichte',
    subtitle: 'Ihre Positionen bei Google und die Sichtbarkeit in KI-Antworten, in Berichten, die sich herunterladen und weitergeben lassen',
    onDemandTitle: 'Berichte auf Abruf',
    onDemandBody: 'Wählen Sie eine Berichtsart, und sie lädt sich mit den aktuellsten Daten. Laden Sie sie als PDF herunter oder exportieren Sie sie nach Excel.',
    googleReport: 'Bericht der Google-Positionen',
    reportType: 'Art des Berichts',
    googleReportType: 'Google-Positionen (organisch und Maps)',
    aiReportType: 'Sichtbarkeit in KI-Antworten',
    loadingReportData: 'Die Daten des Berichts werden geladen...',
    loading: 'Wird geladen...',
    exportExcel: 'Nach Excel exportieren',
    downloadReport: 'Bericht herunterladen',
    nothingToDownload: 'Gerade gibt es nichts herunterzuladen: der Bericht füllt sich nach der ersten Messung.',
    generatedOn: 'Erstellt am',
    excelExportWorkInProgress: 'Der Excel-Export des Berichts zur Sichtbarkeit in KI-Antworten ist noch nicht verfügbar',
    loadAIReportFirst: 'Laden Sie zuerst den Bericht zur Sichtbarkeit in KI-Antworten',
    loadGoogleReportFirst: 'Laden Sie zuerst den Bericht der Google-Positionen',
    downloadError: 'Fehler beim Herunterladen des Berichts',
    reportFilename: 'Bericht',
    rankingsLabel: 'Positionen',
    google: {
      totalKeywords: 'Keywords insgesamt',
      found: 'Gefunden',
      notFound: 'Nicht gefunden',
      coverage: 'Bei Google gefunden',
      currentRankings: 'Aktuelle Positionen',
      keyword: 'Keyword',
      engine: 'Engine',
      ranking: 'Position',
      change: 'Veränderung',
      noKeywordsInReport: 'Kein Keyword im Bericht',
      emptyTitle: 'Dieser Bericht füllt sich, sobald Keywords überwacht werden',
      emptyBody: 'Nehmen Sie ein paar Keywords in die Überwachung, und nach deren erster Messung erscheinen hier ihre Positionen und ihre Veränderungen.',
      emptyAction: 'Keywords auswählen',
    },
    ai: {
      aiScans: 'Prüfungen in KI-Engines',
      aiQueries: 'Fragen an die KI',
      mentions: 'Nennungen',
      mentionRate: 'Nennungsrate',
      domainCited: 'Domain als Quelle genannt',
      citationRate: 'Quellenrate',
      activeEngines: 'Aktive Engines',
      overallVisibility: 'Sichtbarkeit insgesamt',
      performanceByEngine: 'Ergebnisse je Engine',
      scans: 'Prüfungen',
      citations: 'Quellen',
      aiQueryResults: 'Ergebnisse der Fragen an die KI',
      query: 'Frage',
      engine: 'Engine',
      mentioned: 'Genannt',
      domainCited2: 'Domain als Quelle genannt',
      citations2: 'Quellen',
      date: 'Datum',
      yes: 'Ja',
      no: 'Nein',
      noResultsInReport: 'Kein Ergebnis im Bericht',
      emptyTitle: 'Dieser Bericht füllt sich nach der ersten Prüfung in den KI-Engines',
      emptyBody: 'Starten Sie eine Prüfung der Sichtbarkeit in KI-Antworten, und hier erscheinen Ihre Nennungen und die Quellen in jeder Engine.',
      emptyAction: 'Sichtbarkeit in KI-Antworten prüfen',
      showingResults: (showing: number, total: number) => `Es werden ${showing} von ${total} Ergebnissen angezeigt`,
      aiVisibilityReport: 'Bericht zur Sichtbarkeit in KI-Antworten',
    },
  },
  onboarding: {
    title: 'Willkommen! Es geht los',
    subtitle: 'Wir gehen die ersten Schritte gemeinsam durch',
    steps: {
      createProject: {
        title: 'Eine neue Website hinzufügen',
        description: 'Jede Website ist ein eigenes Projekt. Mit der Auswahl oben in der Ansicht wechseln Sie zwischen Websites und legen eine neue an.',
        action: 'Website anlegen',
      },
      keywordResearch: {
        title: 'Keyword-Recherche',
        description: 'Hier finden Sie Keyword-Ideen, sehen ihr Suchvolumen und ihre Entwicklung und fügen sie direkt einer Website hinzu.',
        action: 'Zur Keyword-Recherche',
      },
      generateReports: {
        title: 'Berichte',
        description: 'Hier erstellen Sie klare SEO- und GEO-Berichte für Ihre Kunden, mit der Sichtbarkeit in KI-Antworten, den Positionen, den Wettbewerbern und den Empfehlungen.',
        action: 'Zu den Berichten',
      },
    },
    buttons: {
      next: 'Weiter',
      skip: 'Überspringen',
      done: 'Fertig',
      skipAll: 'Alles überspringen',
    },
  },
  billing: {
    title: 'Abo-Tarife',
    subtitle: 'Wählen Sie den Tarif, den Sie brauchen',
    trialActive: 'Der kostenlose Testzeitraum läuft.',
    validUntilPrefix: 'Gültig bis',
    onPlanPrefix: 'Derzeit aktiv ist der Tarif',
    renewalPrefix: 'Verlängerung am',
    recommended: 'Empfohlen',
    currentPlan: 'Aktueller Tarif',
    perMonth: 'pro Monat',
    trialName: 'Kostenloser Test',
    planLabels: {
      trial: 'Test',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // a German card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('de'),
      regular: planLimitLines('regular', 'de'),
      advanced: planLimitLines('advanced', 'de'),
      premium: planLimitLines('premium', 'de'),
      large_agency: planLimitLines('large_agency', 'de'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['de']} Das Artikelkontingent wird von allen Websites des Kontos gemeinsam genutzt, und alle Kontingente erneuern sich jeden Monat. Was nicht genutzt wird, wird nicht auf den nächsten Monat übertragen.`,
    trialNoChargeNotice: 'Es wurde kein Zahlungsmittel hinzugefügt, und es wird nichts automatisch abgebucht.',
    marketPrompt: {
      currencyName: { ILS: 'israelischen Schekel (₪)', USD: 'US-Dollar ($)' },
      byLocation: (currency: string) => `Die Preise sind in ${currency} angegeben, nach Ihrem Standort. Die Währung wird mit der ersten Zahlung festgelegt.`,
      locked: (currency: string) => `Dieses Konto wird in ${currency} abgerechnet.`,
    },
    manage: {
      title: 'Abonnement verwalten',
      description: 'Nach der Kündigung der Verlängerung bleibt der Tarif bis zum Ende des bereits bezahlten Abrechnungszeitraums aktiv.',
      cancelButton: 'Verlängerung kündigen',
      cancelling: 'Wird gekündigt...',
      confirmCancelTitle: 'Verlängerung kündigen?',
      confirmCancel: 'Der Zugang bleibt bis zum Ende des bereits bezahlten Abrechnungszeitraums aktiv, danach wird nichts abgebucht.',
      confirmCancelAction: 'Verlängerung kündigen',
      keepRenewal: 'Tarif behalten',
      cancelSuccess: 'Die Verlängerung des Abonnements ist gekündigt. Der Zugang bleibt bis zum Ende des Abrechnungszeitraums aktiv.',
      cancelError: 'Die Verlängerung konnte nicht gekündigt werden. Versuchen Sie es in einem Moment erneut, oder schreiben Sie uns, dann kündigen wir sie.',
      contactToCancel: 'Für die Kündigung der Verlängerung schreiben Sie uns, dann schließen wir den Tarif. Wird das Abonnement von einem anderen Unternehmen abgerechnet, sagen wir Ihnen, wo die Kündigung erfolgt, und leiten Ihre Anfrage dorthin weiter.',
      cancelAtMarketplace: (seller: string) => `Dieser Tarif wurde bei ${seller} gekauft, und die Abrechnung läuft dort. Die Verlängerung kündigen Sie in Ihrem ${seller}-Konto; der Zugang bleibt bis zum Ende des bezahlten Zeitraums aktiv. Erreichen Sie ${seller} nicht, schreiben Sie uns, dann schließen wir den Tarif auf unserer Seite. Die Abbuchung kann nur ${seller} stoppen.`,
      marketplacePolicyLink: (seller: string) => `Bedingungen und Richtlinien von ${seller}`,
      renewalAlreadyCancelled: 'Die Verlängerung ist gekündigt. Der Zugang bleibt aktiv bis',
    },
    paypal: {
      loading: 'PayPal wird geladen...',
      notConfigured: 'Die Zahlung mit PayPal ist gerade nicht verfügbar. Versuchen Sie es später erneut, oder schreiben Sie uns, dann helfen wir.',
      sdkLoadFailed: 'PayPal konnte nicht geladen werden. Prüfen Sie Ihre Internetverbindung und laden Sie die Seite neu.',
      planUnavailable: 'Dieser Tarif lässt sich gerade nicht mit PayPal bezahlen. Schreiben Sie uns, dann helfen wir.',
      createSubscriptionError: 'Das Abonnement konnte in PayPal nicht gestartet werden. Versuchen Sie es in einem Moment erneut.',
      activateSubscriptionError: 'PayPal hat die Zahlung freigegeben, aber der Tarif konnte auf unserer Seite nicht aktiviert werden. Schreiben Sie uns, dann bringen wir das in Ordnung.',
      activatedSuccess: 'Der Tarif ist aktiv. Diese Seite aktualisiert sich in einem Moment.',
      buttonError: 'Mit PayPal gab es ein Problem. Versuchen Sie es in einem Moment erneut, oder schreiben Sie uns, dann helfen wir.',
    },
    withdrawal: {
      label:
        'Ich verlange von Go Top SEO, mit dem Dienst sofort zu beginnen, vor dem Ende der vierzehntägigen Widerrufsfrist, die das Verbraucherrecht der Europäischen Union und des Vereinigten Königreichs einem Verbraucher gibt, und ich bestätige, dass ich darauf hingewiesen wurde, dass ich dieses Recht mit der vollständigen Erbringung des Dienstes verliere.',
      requiredNote: 'Die Zahlungsmöglichkeiten erscheinen, sobald Sie die Zeile darüber bestätigen. Vorher wird nichts abgebucht.',
      policyLabel: 'Das Widerrufsrecht im Wortlaut, in der Kündigungs- und Rückerstattungsrichtlinie',
    },
    creem: {
      payButton: 'Mit Karte zahlen',
      starting: 'Die sichere Zahlungsseite wird geöffnet...',
      error: 'Die Zahlungsseite konnte nicht geöffnet werden. Versuchen Sie es in einem Moment erneut, oder schreiben Sie uns, dann helfen wir.',
      changePlanNote: 'Für den Wechsel in einen anderen Tarif schreiben Sie uns, wir übernehmen das.',
      disclosure:
        'Die Kartenzahlung läuft über Creem (Armitage Labs OÜ) als eingetragenen Händler (Merchant of Record): Creem stellt die Rechnung aus, fügt die Steuer nach der Rechnungsadresse hinzu, und die Abbuchung erscheint auf dem Kontoauszug unter dem Namen Creem. Der Dienst selbst bleibt unser.',
      buyerTermsLabel: 'Kaufbedingungen von Creem',
      cancelNote: 'Creem verkauft Ihnen diesen Tarif und rechnet ihn ab: die Kündigung erfolgt daher bei Creem, mit den Abonnementdaten, die Creem Ihnen bei der Zahlung geschickt hat. Wenn es Ihnen leichter fällt, schreiben Sie uns, dann leiten wir die Kündigung an Creem weiter; die eigentliche Abbuchung kann nur Creem stoppen. In jedem Fall bleibt der Zugang bis zum Ende des bezahlten Zeitraums aktiv.',
    },
    shopify: {
      title: 'Die Abrechnung läuft über Shopify',
      description: 'Dieses Konto wird über Shopify App Pricing abgerechnet, nicht über PayPal. Einen Shop zum Veröffentlichen zu verbinden ändert daran nichts.',
      manageButton: 'Tarif in Shopify verwalten',
      migrationPending: 'Wir stellen die Verbindung Ihrer Abrechnung zu Shopify noch fertig. Das kann einen Moment dauern: laden Sie diese Seite in Kürze neu.',
      migrationNeedsAttention: 'Der Shopify-Tarif ist aktiv, aber wir schließen die vorherige Abrechnung noch ab. Löst sich das nicht von selbst, schreiben Sie uns.',
      storeConnectedTitle: 'Ihr Shop wird von Shopify abgerechnet',
      storeConnectedDescription: 'Mit diesem Konto ist ein Shopify-Shop verbunden: Sie zahlen daher über Shopify, nicht über PayPal. Den Tarif wählen und wechseln Sie in der App Go Top SEO, in der Verwaltung Ihres Shopify-Shops.',
      appStoreLink: 'Go Top SEO im Shopify App Store',
      paidUntil: (date: string) => `Der Tarif ist auf der Website bis zum ${date} bezahlt und bleibt bis dahin aktiv.`,
      paidCurrentPeriod: 'Der Tarif ist auf der Website für den laufenden Zeitraum bezahlt und bleibt bis zum Ende dieses Zeitraums aktiv.',
      renewalOff: 'Über PayPal wird nicht verlängert.',
      renewalStopping: 'Wir deaktivieren Ihre Verlängerung über PayPal.',
      afterPaidPeriod: 'Wählen Sie danach in der App Go Top SEO in der Shopify-Verwaltung einen Tarif, um weiter zu veröffentlichen.',
    },
    unavailable: {
      title: 'Der Abrechnungsstatus ist gerade nicht verfügbar',
      description: 'Wir konnten nicht bestätigen, welcher Anbieter die Abrechnung dieses Kontos führt: Tarifwechsel sind deshalb für einen Moment ausgesetzt. Es wurde nichts verändert. Laden Sie diese Seite in Kürze neu.',
    },
    admin: {
      title: 'Administratorkonto: vollständiger Zugang',
      description: 'Dieses Konto hat vollen Zugang zum System und braucht keinen Abrechnungstarif.',
    },
  },
  trialBar: {
    daysLeft: (n: number): readonly [string, string] => [n === 1 ? 'Es bleibt' : 'Es bleiben', n === 1 ? 'Tag kostenloser Test' : 'Tage kostenloser Test'],
    lastDay: 'Heute ist der letzte Tag des kostenlosen Tests',
    expired: 'Der kostenlose Test ist beendet',
    upgrade: 'Jetzt Tarif wechseln',
    dismiss: 'Für 24 Stunden ausblenden',
    label: 'Kostenloser Test',
  },
  dashboardStart: {
    title: 'Hier geht es los',
    subtitle: (domain: string) => `Ein paar kurze Schritte, und dieses Dashboard füllt sich mit Daten zu ${domain}.`,
    progress: (done: number, total: number) => `${done} von ${total} erledigt`,
    stepLabel: (n: number) => `Schritt ${n}`,
    done: 'Erledigt',
    running: 'Läuft',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: 'Nächster Schritt',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: 'Die Website ist noch nicht verbunden',
      body: 'Das ist der erste Schritt. Solange die Website nicht verbunden ist, können Sie recherchieren und schreiben, aber die Artikel können dort nicht veröffentlicht werden. Verbunden wird nur einmal.',
    },
    steps: {
      scan: {
        title: 'Analysieren Sie Ihre Website',
        body: 'Wir finden heraus, was das Unternehmen anbietet und für wen, suchen Keywords und Wettbewerber und prüfen, was die Website bei Google und in KI-Antworten zurückhält. Das dauert einige Minuten.',
        runningBody: 'Die Analyse läuft. Sie können weiterarbeiten; dieses Dashboard aktualisiert sich, sobald die Analyse fertig ist.',
        cta: 'Website analysieren',
        retry: 'Erneut versuchen',
        doneLink: 'Zusammenfassung der Analyse ansehen',
      },
      keywords: {
        title: 'Wählen Sie Keywords',
        body: 'Die Begriffe, nach denen Ihre Kunden bei Google suchen. Wir messen, wo die Website bei jedem einzelnen auftaucht.',
        cta: 'Keyword-Recherche öffnen',
        doneLink: 'Ihre Keywords ansehen',
      },
      connect: {
        title: 'Verbinden Sie Ihre Website',
        body: 'Verbinden Sie WordPress, Wix, Shopify oder eine andere Website, damit die Artikel dort mit einem Klick veröffentlicht werden.',
        cta: 'Website verbinden',
        doneLink: 'Einstellungen der Verbindung',
      },
      article: {
        title: 'Schreiben Sie Ihren ersten Artikel',
        body: 'Wählen Sie ein Thema aus den Vorschlägen, und wir schreiben einen vollständigen Artikel, bereit zum Gegenlesen und Veröffentlichen.',
        cta: 'Thema wählen',
        doneLink: 'Ihre Artikel ansehen',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'Das PDF wird erstellt. Das kann bis zu einer Minute dauern.',
      done: 'Der Bericht ist fertig und wurde heruntergeladen.',
      failed: 'Der Bericht konnte nicht erstellt werden. Versuchen Sie es in einem Moment erneut.',
    },
  },
}

export {}
