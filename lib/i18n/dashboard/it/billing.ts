/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Shopify billing, cancel renewal), the
 * trial bar, the "start here" checklist on the dashboard and the long-running
 * action messages, in ITALIAN.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so an Italian card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Abroad the plans are sold in US DOLLARS plus
 * tax, there has never been a euro price, and this file must not invent one.
 * Card payments are sold by Creem as merchant of record: Creem issues the
 * invoice and applies the tax on the billing address, which is what the Creem
 * disclosure below says.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const billingIt: DeepPartial<DashboardDictionary> = {
  reports: {
    title: 'Report',
    subtitle: 'Le sue posizioni in Google e la visibilità nelle risposte delle IA, in report che si possono scaricare e condividere',
    onDemandTitle: 'Report su richiesta',
    onDemandBody: 'Scelga un tipo di report e si carica con i dati più recenti. Lo scarichi in PDF oppure lo esporti in Excel.',
    googleReport: 'Report delle posizioni in Google',
    reportType: 'Tipo di report',
    googleReportType: 'Posizioni in Google (organico e Maps)',
    aiReportType: 'Visibilità nelle IA',
    loadingReportData: 'Caricamento dei dati del report...',
    loading: 'Caricamento...',
    exportExcel: 'Esportare in Excel',
    downloadReport: 'Scaricare il report',
    nothingToDownload: 'Per ora non c’è nulla da scaricare: il report si riempie dopo il primo rilevamento.',
    generatedOn: 'Generato il',
    excelExportWorkInProgress: 'L’esportazione in Excel del report di visibilità nelle IA non è ancora disponibile',
    loadAIReportFirst: 'Carichi prima il report di visibilità nelle IA',
    loadGoogleReportFirst: 'Carichi prima il report delle posizioni in Google',
    downloadError: 'Errore durante lo scaricamento del report',
    reportFilename: 'Report',
    rankingsLabel: 'Posizioni',
    google: {
      totalKeywords: 'Totale delle parole chiave',
      found: 'Trovate',
      notFound: 'Non trovate',
      coverage: 'Trovate su Google',
      currentRankings: 'Posizioni attuali',
      keyword: 'Parola chiave',
      engine: 'Motore',
      ranking: 'Posizione',
      change: 'Variazione',
      noKeywordsInReport: 'Nessuna parola chiave nel report',
      emptyTitle: 'Questo report si riempie appena vengono monitorate delle parole chiave',
      emptyBody: 'Metta in monitoraggio qualche parola chiave e, dopo il loro primo rilevamento, qui compariranno le loro posizioni e le loro variazioni.',
      emptyAction: 'Scegliere delle parole chiave',
    },
    ai: {
      aiScans: 'Controlli nelle IA',
      aiQueries: 'Domande alle IA',
      mentions: 'Citazioni',
      mentionRate: 'Tasso di citazioni',
      domainCited: 'Dominio indicato come fonte',
      citationRate: 'Tasso di fonti',
      activeEngines: 'Motori attivi',
      overallVisibility: 'Visibilità complessiva',
      performanceByEngine: 'Risultati per motore',
      scans: 'Controlli',
      citations: 'Fonti',
      aiQueryResults: 'Risultati delle domande alle IA',
      query: 'Domanda',
      engine: 'Motore',
      mentioned: 'Citata',
      domainCited2: 'Dominio indicato come fonte',
      citations2: 'Fonti',
      date: 'Data',
      yes: 'Sì',
      no: 'No',
      noResultsInReport: 'Nessun risultato nel report',
      emptyTitle: 'Questo report si riempie dopo il primo controllo nelle IA',
      emptyBody: 'Avvii un controllo di visibilità nelle IA e qui compariranno le sue citazioni e le fonti in ogni motore.',
      emptyAction: 'Controllare la visibilità nelle IA',
      showingResults: (showing: number, total: number) => `Sono mostrati ${showing} risultati su ${total}`,
      aiVisibilityReport: 'Report di visibilità nelle IA',
    },
  },
  onboarding: {
    title: 'Benvenuta e benvenuto! Si comincia',
    subtitle: 'Percorriamo insieme i primi passaggi',
    steps: {
      createProject: {
        title: 'Aggiungere un nuovo sito',
        description: 'Ogni sito è un progetto a sé. Il selettore in alto nella schermata permette di passare da un sito all’altro e di crearne uno nuovo.',
        action: 'Creare un sito',
      },
      keywordResearch: {
        title: 'Ricerca di parole chiave',
        description: 'Qui si trovano idee di parole chiave, si vedono il loro volume di ricerca e il loro andamento, e si aggiungono direttamente a un sito.',
        action: 'Andare alla ricerca di parole chiave',
      },
      generateReports: {
        title: 'Report',
        description: 'Qui si generano report SEO e GEO chiari per i clienti, con la visibilità nelle IA, le posizioni, i concorrenti e i consigli.',
        action: 'Andare ai report',
      },
    },
    buttons: {
      next: 'Avanti',
      skip: 'Saltare',
      done: 'Fatto',
      skipAll: 'Saltare tutto',
    },
  },
  billing: {
    title: 'Piani di abbonamento',
    subtitle: 'Scelga il piano che le serve',
    trialActive: 'È in corso il periodo di prova gratuito.',
    validUntilPrefix: 'Valido fino al',
    onPlanPrefix: 'Al momento è attivo il piano',
    renewalPrefix: 'Rinnovo il',
    recommended: 'Consigliato',
    currentPlan: 'Piano attuale',
    perMonth: 'al mese',
    trialName: 'Prova gratuita',
    planLabels: {
      trial: 'Prova',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // an Italian card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('it'),
      regular: planLimitLines('regular', 'it'),
      advanced: planLimitLines('advanced', 'it'),
      premium: planLimitLines('premium', 'it'),
      large_agency: planLimitLines('large_agency', 'it'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['it']} La quota di articoli è condivisa fra tutti i siti dell’account e tutte le quote si rinnovano ogni mese. Quello che non viene usato non viene riportato al mese successivo.`,
    trialNoChargeNotice: 'Non è stato aggiunto nessun metodo di pagamento e non verrà addebitato nulla automaticamente.',
    marketPrompt: {
      currencyName: { ILS: 'shekel israeliani (₪)', USD: 'dollari statunitensi ($)' },
      byLocation: (currency: string) => `I prezzi sono indicati in ${currency}, in base alla localizzazione. La valuta viene fissata con il primo pagamento.`,
      locked: (currency: string) => `Questo account viene fatturato in ${currency}.`,
    },
    manage: {
      title: 'Gestire l’abbonamento',
      description: 'Dopo l’annullamento del rinnovo, il piano resta attivo fino alla fine del periodo di fatturazione già pagato.',
      cancelButton: 'Annullare il rinnovo',
      cancelling: 'Annullamento...',
      confirmCancelTitle: 'Annullare il rinnovo?',
      confirmCancel: 'L’accesso resta attivo fino alla fine del periodo di fatturazione già pagato, e dopo non verrà addebitato nulla.',
      confirmCancelAction: 'Annullare il rinnovo',
      keepRenewal: 'Mantenere il piano',
      cancelSuccess: 'Il rinnovo dell’abbonamento è stato annullato. L’accesso resta attivo fino alla fine del periodo di fatturazione.',
      cancelError: 'Non è stato possibile annullare il rinnovo. Riprovi tra un momento, oppure ci scriva e lo annulliamo noi.',
      contactToCancel: 'Per annullare il rinnovo ci scriva e chiuderemo il piano. Se l’abbonamento è fatturato da un’altra società, le diremo dove si effettua l’annullamento e trasmetteremo loro la richiesta.',
      cancelAtMarketplace: (seller: string) => `Questo piano è stato acquistato su ${seller}, e la fatturazione avviene là. Il rinnovo si annulla dal suo account ${seller}, e l’accesso resta attivo fino alla fine del periodo pagato. Se non riesce a raggiungere ${seller}, ci scriva e chiuderemo il piano dalla nostra parte. Solo ${seller} può fermare l’addebito.`,
      marketplacePolicyLink: (seller: string) => `Condizioni e politiche di ${seller}`,
      renewalAlreadyCancelled: 'Il rinnovo è stato annullato. L’accesso resta attivo fino al',
    },
    paypal: {
      loading: 'Caricamento di PayPal...',
      notConfigured: 'Per il momento il pagamento con PayPal non è disponibile. Riprovi più tardi, oppure ci scriva e l’aiuteremo.',
      sdkLoadFailed: 'Non è stato possibile caricare PayPal. Verifichi la connessione a internet e aggiorni la pagina.',
      planUnavailable: 'Per il momento questo piano non si può pagare con PayPal. Ci scriva e l’aiuteremo.',
      createSubscriptionError: 'Non è stato possibile avviare l’abbonamento in PayPal. Riprovi tra un momento.',
      activateSubscriptionError: 'PayPal ha approvato il pagamento, ma non è stato possibile attivare il piano dalla nostra parte. Ci scriva e sistemeremo la cosa.',
      activatedSuccess: 'Il piano è attivo. Questa pagina si aggiorna tra un momento.',
      buttonError: 'Si è verificato un problema con PayPal. Riprovi tra un momento, oppure ci scriva e l’aiuteremo.',
    },
    creem: {
      payButton: 'Pagare con carta',
      starting: 'Apertura della pagina di pagamento sicura...',
      error: 'Non è stato possibile aprire la pagina di pagamento. Riprovi tra un momento, oppure ci scriva e l’aiuteremo.',
      changePlanNote: 'Per passare a un altro piano ci contatti e ce ne occupiamo noi.',
      disclosure:
        'Il pagamento con carta avviene tramite Creem (Armitage Labs OÜ), il venditore registrato (merchant of record): Creem emette la fattura, aggiunge l’imposta in base all’indirizzo di fatturazione, e l’addebito compare sull’estratto conto a nome di Creem. Il servizio in sé resta nostro.',
      buyerTermsLabel: 'Condizioni di acquisto di Creem',
      cancelNote: 'Creem le vende questo piano e lo fattura: l’annullamento si effettua quindi presso Creem, a partire dai dati dell’abbonamento che Creem le ha inviato al momento del pagamento. Se le risulta più semplice, ci scriva e trasmetteremo noi la richiesta di annullamento a Creem; solo Creem può fermare l’addebito vero e proprio. In ogni caso l’accesso resta attivo fino alla fine del periodo pagato.',
    },
    shopify: {
      title: 'La fatturazione è gestita da Shopify',
      description: 'Questo account viene fatturato tramite Shopify App Pricing, e non da PayPal. Collegare un negozio per pubblicare non cambia la cosa di per sé.',
      manageButton: 'Gestire il piano in Shopify',
      migrationPending: 'Stiamo completando il collegamento della sua fatturazione a Shopify. Può richiedere un momento: aggiorni questa pagina fra poco.',
      migrationNeedsAttention: 'Il piano Shopify è attivo, ma stiamo ancora chiudendo la fatturazione precedente. Se la cosa non si risolve da sé, ci contatti.',
      storeConnectedTitle: 'Il suo negozio viene fatturato da Shopify',
      storeConnectedDescription: 'A questo account è collegato un negozio Shopify: quindi paga tramite Shopify, e non tramite PayPal. Il piano si sceglie e si cambia nell’applicazione Go Top SEO, dall’amministrazione del negozio Shopify.',
      appStoreLink: 'Go Top SEO sullo Shopify App Store',
      paidUntil: (date: string) => `Il piano è già pagato sul sito fino al ${date}, e resta attivo fino a quella data.`,
      paidCurrentPeriod: 'Il piano è già pagato sul sito per il periodo in corso, e resta attivo fino alla fine di questo periodo.',
      renewalOff: 'Non verrà rinnovato tramite PayPal.',
      renewalStopping: 'Stiamo disattivando il suo rinnovo via PayPal.',
      afterPaidPeriod: 'Dopodiché scelga un piano nell’applicazione Go Top SEO, dall’amministrazione Shopify, per continuare a pubblicare.',
    },
    unavailable: {
      title: 'Lo stato della fatturazione non è momentaneamente disponibile',
      description: 'Non è stato possibile confermare quale fornitore gestisce la fatturazione di questo account: i cambi di piano sono quindi sospesi per un momento. Non è stato modificato nulla. Aggiorni questa pagina fra poco.',
    },
    admin: {
      title: 'Account amministratore: accesso completo',
      description: 'Questo account ha accesso completo al sistema e non ha bisogno di un piano di fatturazione.',
    },
  },
  trialBar: {
    daysLeft: (n: number): readonly [string, string] => [n === 1 ? 'Manca' : 'Mancano', n === 1 ? 'giorno di prova gratuita' : 'giorni di prova gratuita'],
    lastDay: 'Oggi è l’ultimo giorno della prova gratuita',
    expired: 'La prova gratuita è terminata',
    upgrade: 'Cambiare piano ora',
    dismiss: 'Nascondere per 24 ore',
    label: 'Prova gratuita',
  },
  dashboardStart: {
    title: 'Si comincia da qui',
    subtitle: (domain: string) => `Pochi passaggi brevi, e questa dashboard si riempie di dati su ${domain}.`,
    progress: (done: number, total: number) => `${done} su ${total} completati`,
    stepLabel: (n: number) => `Passo ${n}`,
    done: 'Completato',
    running: 'In corso',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: 'Passo successivo',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: 'Il sito non è ancora collegato',
      body: 'È il primo passo. Finché il sito non è collegato si può fare ricerca e si può scrivere, ma gli articoli non possono essere pubblicati là. Il collegamento si fa una volta sola.',
    },
    steps: {
      scan: {
        title: 'Analizzi il sito',
        body: 'Scopriamo cosa offre l’attività e a chi, cerchiamo parole chiave e concorrenti, e verifichiamo cosa frena il sito in Google e nelle risposte delle IA. Richiede qualche minuto.',
        runningBody: 'L’analisi è in corso. È possibile continuare a lavorare; questa dashboard si aggiorna appena l’analisi si conclude.',
        cta: 'Analizzare il sito',
        retry: 'Riprovare',
        doneLink: 'Vedere il riepilogo dell’analisi',
      },
      keywords: {
        title: 'Scelga delle parole chiave',
        body: 'Le parole che i suoi clienti cercano su Google. Rileviamo dove compare il sito per ciascuna di esse.',
        cta: 'Aprire la ricerca di parole chiave',
        doneLink: 'Vedere le sue parole chiave',
      },
      connect: {
        title: 'Colleghi il sito',
        body: 'Colleghi WordPress, Wix, Shopify o un altro sito, così che gli articoli vi vengano pubblicati con un clic.',
        cta: 'Collegare il sito',
        doneLink: 'Impostazioni della connessione',
      },
      article: {
        title: 'Scriva il suo primo articolo',
        body: 'Scelga un argomento fra i suggerimenti e scriveremo un articolo completo, pronto da rileggere e pubblicare.',
        cta: 'Scegliere un argomento',
        doneLink: 'Vedere i suoi articoli',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'Creazione del PDF. Può richiedere fino a un minuto.',
      done: 'Il report è pronto ed è stato scaricato.',
      failed: 'Non è stato possibile creare il report. Riprovi tra un momento.',
    },
  },
}

export {}
