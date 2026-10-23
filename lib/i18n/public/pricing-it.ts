/**
 * The Italian pricing page's words around the plan grid
 * (app/(public)/it/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Italy sees the same dollar
 * price every market outside Israel is billed in today, because Italy's own
 * local price is not set yet. Nothing here promises a currency, and the Italian
 * page never names euros.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingIt: PricingCopy = {
  hero: {
    eyebrow: 'Prezzi',
    title: 'Tutto il necessario per essere trovati,',
    accent: 'a un prezzo mensile',
    subtitle: 'Articoli scritti e pubblicati sul Suo sito, il monitoraggio delle posizioni in Google e in Google Maps e una verifica di ciò che ChatGPT e Gemini consigliano. Il piano si sceglie in base alle proprie esigenze, e si parte da una prova gratuita.',
    trust: [`${DAYS} giorni di prova gratuita`, 'Senza carta di credito', 'Disdetta in qualsiasi momento dalla dashboard'],
  },
  plans: {
    perMonth: '/mese',
    popular: 'La nostra scelta',
    cta: `Provare gratis per ${DAYS} giorni`,
    dashboard: 'La mia dashboard',
    noCard: 'Senza carta di credito',
    checksNote: CHECKS_EXPLAINER.it,
    taxNote: {
      ILS: 'I prezzi includono l’IVA israeliana. È l’importo che si paga, senza nulla in più.',
      USD: 'Nel pagamento con carta il venditore è Creem, in qualità di esercente registrato: calcola l’imposta in base all’indirizzo di fatturazione e mostra l’importo finale prima del pagamento. I prezzi indicati qui non la includono.',
    },
    everyPlanLabel: 'In tutti i piani',
    everyPlan: [
      'Pubblicazione programmata automatica su WordPress, Shopify e Wix',
      'Il monitoraggio della posizione in Google e in Google Maps',
      'Una verifica per sapere se 6 motori IA, come ChatGPT e Gemini, citano l’azienda',
      'Un punteggio di salute del sito con l’elenco delle correzioni',
      'Report PDF ed Excel pronti da inviare',
      'Un accompagnamento diretto',
    ],
  },
  unsure: {
    text: 'Non è ancora convinto? Si parta da un’analisi gratuita del sito.',
    cta: 'Analizzare il mio sito',
  },
  included: {
    eyebrow: 'In tutti i piani',
    title: 'Senza opzioni. Tutto incluso dal primo giorno.',
    body: 'I piani differiscono soltanto per il volume: quanti siti, quanti articoli e quante verifiche ogni mese. Le funzionalità sono le stesse in tutti.',
    items: [
      {
        title: 'Articoli scritti e pubblicati',
        desc: 'La piattaforma scrive articoli completi sugli argomenti approvati, con immagini, una sezione di domande e risposte e link interni, e li pubblica sul sito secondo un calendario.',
      },
      {
        title: 'Monitoraggio in Google e in Google Maps',
        desc: 'In quale posizione compare l’azienda per ogni frase che conta, nella ricerca classica e in Maps, e come cambia nel tempo.',
      },
      {
        title: 'Visibilità nei motori IA',
        desc: 'Verifica se ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI citano l’azienda, e chi citano al suo posto.',
      },
      {
        title: 'Ricerca di parole chiave',
        desc: 'La piattaforma individua ciò che i clienti cercano e chiedono, e suggerisce da dove iniziare.',
      },
      {
        title: 'Report pronti da inviare',
        desc: 'Posizioni, andamenti e visibilità nelle IA in un report PDF o Excel creato con un clic, pronto per un cliente o per la direzione.',
      },
      {
        title: 'Un accompagnamento diretto',
        desc: 'Rispondono persone reali, su WhatsApp e per e-mail.',
      },
    ],
  },
  value: {
    eyebrow: 'Perché conviene',
    title: 'Un abbonamento al posto di tre mestieri',
    body: 'Di solito serve qualcuno che scelga gli argomenti e scriva, qualcuno che pubblichi tutto online e uno strumento per verificare se ha funzionato. Qui accade tutto nello stesso posto.',
    items: [
      {
        title: 'Il lavoro viene fatto, non soltanto misurato',
        desc: 'Non è un ulteriore report in attesa che qualcuno agisca. La piattaforma scrive e pubblica gli articoli da sé, soltanto sugli argomenti approvati.',
      },
      {
        title: 'Si vede esattamente che cosa si paga',
        desc: 'Gli articoli pubblicati, le variazioni di posizione e le citazioni nelle IA in un’unica dashboard, e in un report da inoltrare a chiunque Lei voglia.',
      },
      {
        title: 'Senza vincoli',
        desc: `Una prova di ${DAYS} giorni senza carta di credito, un pagamento mensile e la disdetta in qualsiasi momento dalla dashboard.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Come viene contato l’utilizzo',
    title: 'Senza clausole in piccolo',
    body: 'Tre unità semplici, e ogni quota si rinnova ogni mese.',
    items: [
      {
        title: 'Articolo',
        desc: 'Creare un nuovo articolo consuma un’unità della quota. Modificare, programmare o pubblicare un articolo esistente non consuma nulla.',
      },
      {
        title: 'Verifica di posizione in Google',
        desc: 'Vedere in quale posizione compare una parola chiave, in un solo luogo: Google oppure Google Maps. La stessa parola chiave in entrambi conta come due verifiche.',
      },
      {
        title: 'Verifica di visibilità nelle IA',
        desc: 'Porre una domanda a un motore IA e vedere se l’azienda viene citata. La stessa domanda in ChatGPT e in Gemini conta come due verifiche.',
      },
    ],
    note: 'La quota di articoli è per account. Nei piani con più siti è condivisa fra tutti i siti.',
  },
  faq: {
    eyebrow: 'Domande',
    title: 'Che cosa si chiede prima di scegliere un piano',
    body: 'Non ha trovato la Sua risposta? Ci scriva su WhatsApp.',
    items: [
      {
        q: 'Quale piano è adatto a noi?',
        a: `Basic e Advanced sono pensati per un solo sito, e la differenza principale fra loro è il numero di articoli al mese: ${BASIC_ARTICLES} contro ${ADVANCED_ARTICLES}. Premium è per chi gestisce più di un sito, e Agency per gestire i siti dei clienti. Si può iniziare in piccolo e cambiare piano in qualsiasi momento.`,
      },
      {
        q: 'Che cosa comprende la prova gratuita?',
        a: `${DAYS} giorni senza carta di credito: un sito, fino a ${TRIAL_CATALOG.maxKeywordsPerProject} parole chiave, fino a ${TRIAL_CATALOG.maxGoogleChecksLifetime} verifiche di posizione in Google, fino a ${TRIAL_CATALOG.maxAIChecksLifetime} verifiche di visibilità nelle IA e un articolo, per vedere tutto il processo, dall’inizio fino alla pubblicazione.`,
      },
      {
        q: `Che cosa accade alla fine della prova di ${DAYS} giorni?`,
        a: 'Si sceglie un piano e si riprende da dove si era arrivati. Se non se ne sceglie nessuno, non viene addebitato nulla, perché la carta non è mai stata richiesta.',
      },
      {
        q: 'Possiamo cambiare piano o disdire?',
        a: 'Sì. Il piano si cambia in qualsiasi momento e le nuove quote valgono da quel momento. La disdetta si fa dalla dashboard, senza penali né costi di disdetta.',
      },
      {
        q: 'Che fine fanno gli articoli che non usiamo?',
        a: 'La quota si rinnova ogni mese, e gli articoli non usati non si sommano al mese successivo.',
      },
      {
        q: 'Le analisi partono da sole?',
        a: 'Un’analisi manuale si può avviare in qualsiasi momento, oppure si attiva un’analisi mensile automatica che parte da sé ogni mese. Per ora non esiste un’analisi automatica giornaliera né settimanale.',
      },
      {
        q: 'Gli articoli possono essere programmati e pubblicati automaticamente?',
        a: 'Sì. Un articolo si programma a una data futura, oppure si pubblica subito su un sito collegato: WordPress, Shopify o Wix.',
      },
      {
        q: 'Come sono protetti i nostri dati?',
        a: 'Tutto il traffico è cifrato (SSL/TLS), le password sono conservate cifrate e ogni account vede soltanto i propri dati. Le informazioni sono condivise solo con i fornitori su cui la piattaforma funziona, come l’hosting, i pagamenti e i dati di ricerca, in conformità con l’informativa sulla privacy.',
        // The privacy policy exists in this language (content/legal/it, rendered
        // by app/(public)/it/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: 'Leggere l’informativa sulla privacy', href: '/it/privacy' },
      },
    ],
  },
  cta: {
    title: 'Vuole prima vedere che cosa la piattaforma trova sul Suo sito?',
    body: `L’analisi gratuita legge il sito e restituisce una prima sintesi di ricerca, senza registrazione. Oppure si apre una prova di ${DAYS} giorni e si prova tutto.`,
    check: 'Analizzare gratis il mio sito',
    trial: 'Iniziare la prova gratuita',
    dashboard: 'La mia dashboard',
  },
}
