import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function JapaneseAboutPage() {
  return <AboutPage locale="ja" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish and French ones, in Japanese.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Japanese
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['ja'], href: '/ja/about' },
  title: '11 anni di SEO,',
  accent: 'in una piattaforma che lavora per voi.',
  subtitle: 'Una sola piattaforma che scrive e pubblica articoli sul vostro sito, monitora la vostra posizione in Google e in Google Maps e verifica se i motori di IA vi consigliano. È costruita da Go Top, un’agenzia digitale con oltre 11 anni di esperienza nel posizionamento organico e nella pubblicità a pagamento.',
  who: {
    title: 'Chi c’è dietro la piattaforma',
    paragraphs: [
      'Go Top SEO è costruito da Go Top, un’agenzia digitale con oltre 11 anni di esperienza nel posizionamento organico, nella pubblicità a pagamento e nella realizzazione di siti per aziende in Israele e all’estero.',
      'La piattaforma è nata dal nostro lavoro quotidiano con i clienti: abbiamo visto quali report le persone capiscono davvero, quali dati le aiutano a decidere e dove si perde tempo. Così abbiamo costruito un unico posto in cui i contenuti vengono scritti, pubblicati e misurati, sia in Google sia nei motori di IA.',
    ],
  },
  founderEyebrow: 'La persona dietro il progetto',
  gaps: {
    title: 'Che cosa mancava, e che cosa abbiamo costruito al suo posto',
    body: 'Volevamo che un’azienda potesse fare tutto ciò che serve per farsi trovare, nello stesso posto, senza dover imparare il posizionamento organico.',
    missingLabel: 'Che cosa mancava',
    builtLabel: 'Che cosa abbiamo costruito',
    rows: [
      {
        pain: { title: 'Controllare le posizioni a mano porta via troppo tempo', description: 'Verificare le stesse parole chiave una volta dopo l’altra, diverse schermate di risultati e calcoli fatti a mano che pesano sulla giornata.' },
        answer: { title: 'Le vostre posizioni in Google e in Google Maps', description: 'Il monitoraggio di ogni espressione nella ricerca classica e in Maps, per zona e per dispositivo, con lo storico di ogni variazione.' },
      },
      {
        pain: { title: 'Dati sparsi fra più strumenti', description: 'Le posizioni in Google, in Maps, nei motori di IA e altrove, senza un quadro unico e chiaro.' },
        answer: { title: 'Tutto nello stesso posto', description: 'La ricerca di parole chiave, le posizioni, la visibilità nelle IA e i vostri articoli sono collegati fra loro, e non distribuiti su quattro strumenti diversi.' },
      },
      {
        pain: { title: 'I motori di IA fanno ormai parte della ricerca', description: 'Sempre più clienti rivolgono la loro domanda a ChatGPT, a Gemini o a Google AI Mode. Dovete sapere se la vostra azienda compare nella risposta.' },
        answer: { title: 'Monitoraggio della visibilità nelle IA', description: 'Vedete se la vostra azienda viene citata, indicata come fonte o consigliata nelle risposte di ChatGPT, Gemini e Google AI Mode.' },
      },
      {
        pain: { title: 'Contenuti che restano per strada', description: 'Sapere di che cosa scrivere è metà del lavoro. Resta da scriverlo, pubblicarlo e misurarlo.' },
        answer: { title: 'Articoli scritti e pubblicati', description: 'Articoli completi sui temi che approvate, con immagini, una sezione di domande e risposte e collegamenti interni, pubblicati su WordPress o su Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Il nostro modo di lavorare',
    items: [
      {
        title: 'Trasparenza',
        description: 'Diciamo che cosa viene misurato, da dove vengono i dati e che cosa significano. Nessun indicatore gonfiato.',
      },
      {
        title: 'Dati utili',
        description: 'Report che raccontano una storia aziendale chiara, non solo numeri gradevoli.',
      },
      {
        title: 'Un’interfaccia semplice',
        description: 'Una sola schermata per i vostri contenuti, le vostre posizioni in Google e in Maps e la vostra visibilità nelle IA, senza rumore inutile.',
      },
      {
        title: 'SEO e GEO insieme',
        description: 'Contenuti pensati per Google e per i motori di IA, e la misurazione di entrambi.',
      },
    ],
  },
  choose: {
    title: 'Perché scegliere Go Top SEO',
    items: [
      {
        title: 'Un affiancamento diretto, senza compromessi',
        description: 'Nessun «account manager» che cambia ogni mese. Lavorate con gli stessi professionisti, che conoscono la vostra attività.',
      },
      {
        title: 'Trasparenza totale',
        description: 'Sapete sempre che cosa accade sul vostro account: che cosa ha funzionato, che cosa non ha funzionato e come procedere.',
      },
      {
        title: 'Competenza senza gergo',
        description: 'Nessun paroloni. Parliamo di risultati che potete misurare e capire.',
      },
      {
        title: 'Anche noi gestiamo un’azienda',
        description: 'Conosciamo la pressione, il budget stretto e il bisogno di vedere risultati, perché li viviamo anche noi.',
      },
    ],
  },
  cta: {
    title: 'Volete vedere che cosa potremmo fare del vostro sito?',
    body: FEATURE_COMMON['ja'].closeBody,
    contact: 'Domande? Scriveteci:',
    updated: 'Questa pagina è stata aggiornata per l’ultima volta a settembre 2026',
  },
}
