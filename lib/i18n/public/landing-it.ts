/**
 * The Italian home page's words (app/(public)/it/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * Italian in a formal, neutral register: impersonal constructions wherever a
 * sentence allows one, and the courtesy form — "Lei", "il Suo sito" — where the
 * second person is unavoidable. Never the informal imperative addressed to
 * "tu". The demo's example business is in Milan rather than in Lyon: the
 * Italian site opens in Italy, and a demo full of French cities reads as a
 * translated page rather than an Italian one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/it/features/...' here would ship
 * '/it/it/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise. Prices come from the plan catalogue,
 * so the page cannot drift from it, and they are quoted in USD — the Italian
 * page never names euros.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Italy's own price is not set yet, so the Italian
 * page shows the USD price every market outside Israel is billed in today,
 * grouped the Italian way.
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('it-IT')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingIt: LandingCopy = {
  hero: {
    eyebrow: 'La promozione automatica in Google e nei motori IA, in un solo sistema',
    title: 'I Suoi prossimi clienti stanno già cercando.',
    accent: 'Noi facciamo in modo che La trovino.',
    subtitle:
      'Go Top SEO scrive e pubblica articoli che rispondono a ciò che i Suoi clienti cercano, e poi mostra dove l’azienda compare in Google, Google Maps, ChatGPT e Gemini. Senza un team di contenuti. Senza tirare a indovinare.',
    signup: `Prova gratuita di ${TRIAL_DAYS} giorni`,
    trialNote: 'Senza carta di credito, senza vincoli. Disdetta in qualsiasi momento.',
    checkLead: 'Non è ancora il momento di creare un account? Analisi gratuita del sito, senza registrazione:',
    dashboard: 'La mia dashboard',
    trust: ['Pubblica su WordPress e Shopify', 'Un’assistenza affidata a persone reali'],
    climbChip: '3ª posizione in Google',
    published: 'Articolo pubblicato sul Suo sito',
  },
  demo: {
    label: 'Una dimostrazione reale della piattaforma',
    caption: 'Dimostrazione del prodotto. I nomi delle aziende e i numeri sono esempi.',
    tabs: ['La risalita in Google', 'Un nuovo articolo', 'Consigliati dalle IA'],
    describe: [
      'La schermata delle parole chiave: una frase passata dalla 18ª alla 3ª posizione in Google, e altre tre in crescita.',
      'La schermata degli articoli: un nuovo articolo viene scritto, supera il controllo qualità e attende la pubblicazione programmata sul sito.',
      'La schermata della visibilità nelle IA: una risposta di ChatGPT che consiglia l’azienda, e i motori che la citano.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Dashboard', 'Parole chiave', 'Strategia di contenuto', 'Articoli', 'Visibilità nelle IA', 'Report'],
    rank: {
      heading: 'Parole chiave',
      keyword: 'installazione climatizzatore milano',
      positionLabel: 'Posizione in Google',
      period: 'Nelle ultime 8 settimane',
      from: 18,
      to: 3,
      columns: ['Parola chiave', 'Posizione', 'Variazione'],
      rows: [
        { keyword: 'prezzo climatizzatore a pompa di calore', from: 24, to: 7 },
        { keyword: 'riparazione climatizzatori sesto san giovanni', from: 31, to: 9 },
        { keyword: 'pulizia climatizzatore', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Milano',
      mapsValue: '2ª posizione',
      toast: 'Ha guadagnato 15 posizioni in Google',
    },
    article: {
      heading: 'Nuovo articolo',
      title: 'Quanto costa installare un climatizzatore a pompa di calore, e che cosa chiedere prima',
      subheading: 'Che cosa determina il prezzo?',
      checksTitle: 'Controllo qualità',
      checks: ['Domande e risposte', 'Dati strutturati', 'Link interni', 'Immagine in evidenza', 'Titoli guidati dalla ricerca'],
      draft: 'In scrittura',
      scheduled: 'Programmato',
      when: 'Mar. 9:00',
      toast: 'Pubblicazione su WordPress',
    },
    ai: {
      heading: 'Visibilità nelle IA',
      question: 'Chi installa bene i climatizzatori a Milano?',
      intro: 'Ecco alcune aziende ben raccomandate nel settore:',
      items: [
        { name: 'Aria Lombarda', desc: 'Installatori qualificati, garanzia sui lavori e risposta in giornata.', you: true },
        { name: 'ClimaPoint', desc: 'Prezzi corretti per la pulizia e la manutenzione.' },
        { name: 'Comfort Milanese', desc: 'Specialisti in impianti canalizzati.' },
      ],
      youTag: 'La Sua azienda',
      mentionedIn: 'Citata in:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT La consiglia',
    },
  },
  worksWith: {
    label: 'Controlliamo e pubblichiamo per Lei su:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'Che cosa si ottiene',
    title: 'Che cosa fa Go Top SEO mentre Lei si occupa dell’azienda',
    body: 'Non è un altro strumento da imparare. È un sistema che fa il lavoro, e poi ne mostra i risultati.',
    items: [
      {
        title: 'Contenuti che portano clienti, non soltanto visite',
        desc: 'La piattaforma individua ciò che i clienti cercano e chiedono, scrive articoli completi sull’argomento e li pubblica sul sito con un ritmo regolare. Resta solo da scegliere gli argomenti.',
        chips: ['Si pubblica da sé', 'Con immagini', 'Sezioni di domande', 'Link interni'],
      },
      {
        title: 'Un posto nelle risposte di ChatGPT e di Gemini',
        desc: 'Sempre più persone interrogano le IA invece di cercare. Si vede se consigliano l’azienda, chi consigliano al suo posto e che cosa conviene migliorare.',
        chips: ['6 motori IA', 'A confronto con i concorrenti'],
      },
      {
        title: 'Una visione chiara di ciò che funziona',
        desc: 'Le posizioni in Google e in Maps, le citazioni nelle IA e gli articoli pubblicati in una sola schermata. Senza fogli di calcolo e senza tirare a indovinare.',
        chips: ['Report PDF ed Excel', 'Storico completo'],
      },
    ],
    stats: [
      { value: 6, label: 'motori IA controllati', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI' },
      { value: 3, label: 'canali in un solo report', detail: 'Google, Google Maps e le risposte delle IA' },
      { value: 2, label: 'piattaforme di pubblicazione', detail: 'WordPress e Shopify, senza copia e incolla' },
      { value: TRIAL_DAYS, label: 'giorni di prova gratuita', detail: 'Senza carta di credito' },
    ],
  },
  shift: {
    eyebrow: 'La ricerca è cambiata',
    title: 'I clienti non passano più soltanto da Google. Interrogano le IA e ricevono tre consigli.',
    body: 'Se il sito non risponde alle loro domande, né in Google né in una risposta di ChatGPT, quel consiglio va a un concorrente. Quasi nessuna azienda sa come è posizionata, perché nessuno strumento le ha mai mostrato le due cose insieme.',
    withoutTitle: 'Senza Go Top SEO',
    without: [
      'Un articolo ogni due mesi, quando qualcuno trova il tempo',
      'Nessuna idea chiara di che cosa scrivere, né di quale frase valga la pena',
      'Posizioni controllate a mano, o non controllate affatto',
      'Nessuna idea se ChatGPT consigli Lei oppure un concorrente',
    ],
    withTitle: 'Con Go Top SEO',
    with: [
      'Un calendario di contenuti regolare, che pubblica quando lo decide Lei',
      'Argomenti scelti a partire da ciò che i clienti cercano davvero',
      'Un monitoraggio automatico delle posizioni in Google e in Google Maps',
      'Verifiche automatiche di ciò che ChatGPT, Gemini e Google AI dicono dell’azienda, più altri tre motori su richiesta',
    ],
  },
  flow: {
    eyebrow: 'Come funziona',
    title: 'Da un indirizzo di sito a contenuti che funzionano, in quattro passaggi',
    body: 'Lei decide che cosa viene scritto. La piattaforma fa il resto.',
    steps: [
      { tag: 'Gratis, senza registrazione', title: 'Analisi del sito', desc: 'Basta inserire un indirizzo. In meno di un minuto capiamo che cosa fa l’azienda, chi sono i suoi clienti e che cosa trattiene il sito in Google e nelle IA.' },
      { tag: 'Con la Sua approvazione', title: 'Arriva un piano', desc: 'Le frasi di ricerca, le domande che pongono i clienti e un elenco di articoli pronti da scrivere. Lei sceglie che cosa entra.' },
      { tag: 'Automatico', title: 'Gli articoli vengono scritti e pubblicati', desc: 'Ogni articolo arriva con le sue immagini e la sua sezione di domande e risposte, e compare sul sito alla data programmata. Sui siti WordPress con il plugin Go Top vengono aggiunti anche i dati strutturati.' },
      { tag: 'Trasparente', title: 'I risultati si seguono', desc: 'Le posizioni in Google e in Maps, le citazioni nelle IA e report da inviare a chiunque Lei voglia.' },
    ],
    cta: 'Iniziare con un’analisi gratuita',
  },
  features: {
    eyebrow: 'Che cosa è incluso',
    title: 'Tutto il necessario per risalire, in un unico posto',
    body: 'Quattro strumenti che lavorano insieme, perché ogni articolo venga misurato e ogni misurazione indichi l’articolo successivo.',
    more: 'Scoprire di più',
    note: 'I nomi e i numeri delle schermate sono esempi.',
    content: {
      overline: 'Contenuti e pubblicazione',
      title: 'Articoli scritti per essere trovati, non per riempire un blog',
      body: 'Ogni articolo è costruito su una ricerca reale: titoli tratti da ciò che le persone chiedono, una sezione di domande e risposte, link interni verso le pagine che vendono e, sui siti WordPress con il plugin Go Top, dati strutturati che Google e i motori IA leggono. Lei rilegge, corregge se serve, e la piattaforma pubblica.',
      points: ['Un’immagine in evidenza e immagini nel testo', 'Un controllo qualità prima di ogni pubblicazione', 'Programmazione e pubblicazione diretta su WordPress e Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Questa settimana sul Suo sito',
        days: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
        items: [
          { day: 0, title: 'Come scegliere il climatizzatore per una camera', status: 'published', label: 'Pubblicato' },
          { day: 2, title: 'Quanto costa installare un climatizzatore a pompa di calore', status: 'scheduled', label: 'Programmato' },
          { day: 4, title: 'Pulizia del climatizzatore: ogni quanto farla?', status: 'writing', label: 'In scrittura' },
        ],
        destinationLabel: 'Pubblicazione su',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'Visibilità nelle IA',
      title: 'Sapere quando ChatGPT consiglia l’azienda, e quando sceglie un concorrente',
      body: 'Poniamo ai motori IA le domande che pongono i Suoi clienti e verifichiamo chi compare nella risposta. Si vede su quali domande l’azienda vince, dove il consiglio va a un concorrente e che cosa conviene migliorare sul sito.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI', 'Affiancati ai Suoi concorrenti', 'Indicazioni su che cosa cambiare per entrare nella risposta'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Chi compare nella risposta',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Chi installa climatizzatori a Milano?', hits: [true, true, true, false, true, false] },
          { question: 'Quanto costa la pulizia di un climatizzatore?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Quota di citazioni',
        you: { label: 'La Sua azienda', value: 58 },
        rival: { label: 'Concorrente principale', value: 42 },
      },
    },
    rank: {
      overline: 'Posizioni in Google',
      title: 'Vedere ogni risalita, in Google e in Google Maps',
      body: 'Monitoraggio di ogni frase che conta, nella ricerca classica e in Maps per città o per area, con uno storico che mostra se gli articoli stanno facendo il loro lavoro.',
      points: ['Google organico per paese, lingua e dispositivo', 'Google Maps per città o per area', 'Ricerca di parole chiave con volume di ricerca e concorrenza'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Le Sue parole chiave',
        columns: ['Parola chiave', 'Posizione', 'Variazione'],
        rows: [
          { keyword: 'installazione climatizzatore milano', pos: 3, up: 15 },
          { keyword: 'prezzo climatizzatore a pompa di calore', pos: 7, up: 17 },
          { keyword: 'riparazione climatizzatori sesto san giovanni', pos: 9, up: 22 },
          { keyword: 'pulizia climatizzatore', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Milano', value: '2ª posizione su 20' },
      },
    },
    reports: {
      overline: 'Report',
      title: 'Un report da inviare a un cliente o alla direzione, con un clic',
      body: 'Esportazione di posizioni, andamenti e visibilità nelle IA in PDF e in Excel. Le agenzie gestiscono i siti di più clienti da un solo account, ognuno nel proprio progetto.',
      points: ['PDF ed Excel con un clic', 'Più siti in un solo account', 'Tutti i dati in un unico posto, senza montare i report a mano'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Report di rendimento',
        period: 'Settembre',
        stats: [
          { label: 'Parole chiave in prima pagina', value: '14', up: true },
          { label: 'Citazioni nelle IA', value: '9', up: true },
          { label: 'Articoli pubblicati', value: '8' },
          { label: 'Posizione media', value: '6,2', up: true },
        ],
        clientsLabel: 'Progetti:',
        clients: ['aria-lombarda.it', 'studio-dana.it', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Per chi',
    title: 'Per chiunque voglia che il proprio sito porti clienti',
    body: 'Non serve conoscere la SEO. Serve sapere che cosa si vende.',
    items: [
      {
        title: 'Titolari d’azienda',
        desc: 'Più contatti da Google senza imparare il posizionamento organico né assumere un redattore. Basta approvare gli argomenti: il resto va da sé.',
        gain: 'Un sito che lavora mentre Lei è occupato',
      },
      {
        title: 'Liberi professionisti e agenzie',
        desc: 'Gestione di più clienti da un solo account, contenuti prodotti più in fretta e un report chiaro da consegnare a ogni cliente.',
        gain: 'Più clienti con le stesse ore di lavoro',
      },
      {
        title: 'Team di marketing',
        desc: 'Un ritmo di pubblicazione regolare, e in un unico posto ciò che i contenuti stanno facendo in Google e nelle IA.',
        gain: 'Una risposta chiara a «sta funzionando?»',
      },
    ],
  },
  check: {
    eyebrow: 'Analisi gratuita del sito',
    title: 'Non è ancora convinto? Le mostriamo che cosa vediamo',
    body: 'L’analisi legge davvero il sito e restituisce una prima sintesi di ricerca in meno di un minuto:',
    items: [
      'Che cosa abbiamo capito dell’azienda e chi sono i suoi clienti',
      'Quali concorrenti compaiono accanto all’azienda',
      'Che cosa trattiene il sito in Google, con le prove raccolte sul sito stesso',
      'Quanto il sito è pronto per le risposte delle IA',
      'L’elenco degli articoli che scriveremmo',
    ],
    cta: 'Analizzare il mio sito',
    note: 'Gratis, senza registrazione e senza carta di credito.',
    preview: {
      domain: 'aria-lombarda.it',
      heading: 'La Sua prima sintesi di ricerca',
      scoreLabel: 'Preparazione per le IA',
      score: '3/4',
      findings: ['Le immagini non hanno testo alternativo', 'Nessuna sezione di domande e risposte', 'La meta description non ha la lunghezza giusta'],
      lockedLabel: 'Altri rilievi e concorrenti si sbloccano con un account gratuito',
    },
  },
  faq: {
    eyebrow: 'Domande',
    title: 'Che cosa si chiede più spesso prima di iniziare',
    body: 'Non ha trovato la Sua risposta? Ci scriva su WhatsApp.',
    items: [
      {
        q: 'Non so nulla di SEO. È una piattaforma adatta a me?',
        a: 'Sì. La piattaforma sceglie le frasi, propone gli argomenti e scrive gli articoli. Resta solo da decidere che cosa è in linea con l’azienda, e approvare.',
      },
      {
        q: 'Verrà pubblicato qualcosa sul mio sito senza che io lo veda?',
        a: 'Solo gli argomenti approvati vanno in scrittura, e ogni articolo supera un controllo qualità prima della pubblicazione. Ogni articolo può essere riletto e modificato, e la data di pubblicazione la decide Lei.',
      },
      {
        q: 'Perché non scrivere tutto da sé con ChatGPT?',
        a: 'È possibile, ma allora tocca a Lei scegliere gli argomenti, verificare le frasi, montare le domande e risposte e i dati strutturati, collegare le pagine fra loro, caricare tutto sul sito e controllare se ha funzionato, da solo. Go Top SEO si occupa di tutta la catena e misura il risultato in Google e nelle IA.',
      },
      {
        q: 'Con quali siti funziona?',
        a: 'La pubblicazione diretta funziona con WordPress e Shopify. Il monitoraggio delle posizioni, la visibilità nelle IA e la ricerca di parole chiave funzionano con qualsiasi sito.',
      },
      {
        q: `Che cosa accade alla fine della prova di ${TRIAL_DAYS} giorni?`,
        a: 'Si sceglie un piano e si riprende esattamente da dove si era arrivati. Se non se ne sceglie nessuno, non viene addebitato nulla, perché la carta non è mai stata richiesta.',
      },
      {
        q: 'È possibile disdire?',
        a: 'Sì, in qualsiasi momento, direttamente dalla dashboard, senza penali né costi di disdetta.',
      },
    ],
  },
  cta: {
    title: 'Il Suo prossimo cliente sta cercando oggi. Faccia in modo che La trovi.',
    body: `Analisi gratuita del sito, oppure una prova di ${TRIAL_DAYS} giorni: il primo articolo può essere scritto già oggi.`,
    check: 'Analizzare gratis il mio sito',
    signup: 'Iniziare la prova gratuita',
    dashboard: 'La mia dashboard',
    pricing: `Piani a partire da ${FROM_USD} USD al mese.`,
    pricingLink: 'Vedere tutti i piani e i prezzi',
  },
}
