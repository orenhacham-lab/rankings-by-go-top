import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'Redazione, pianificazione e pubblicazione di contenuti SEO e GEO | Go Top SEO',
  description:
    'Pianificate i temi, ricevete un articolo completo scritto dall’IA, modificatelo, programmatelo e pubblicatelo direttamente su WordPress o su Shopify, tutto nello stesso posto.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['ja']

const faqs = [
  {
    q: 'Devo rileggere ogni articolo prima della pubblicazione?',
    a: 'Non è obbligatorio, ma potete sempre farlo. Vengono scritti soltanto i temi che avete approvato, ogni articolo passa un controllo di qualità prima della pubblicazione, e potete leggerlo, modificarlo e approvarlo prima che esca.',
  },
  {
    q: 'Su quali siti posso pubblicare?',
    a: 'La pubblicazione diretta funziona con WordPress e con Shopify. Collegate il vostro sito una volta, e gli articoli approvati vanno direttamente lì.',
  },
  {
    q: 'Come funziona la programmazione?',
    a: 'Quando approvate un articolo, pubblicatelo subito oppure scegliete una data e un’ora. La piattaforma pubblica da sola al momento giusto.',
  },
  {
    q: 'Gli articoli arrivano con immagini e titoli SEO?',
    a: 'Sì. Ogni articolo arriva con un’immagine in evidenza e immagini nel testo, un meta titolo e una meta descrizione, e tutto resta modificabile prima della pubblicazione.',
  },
  {
    q: 'Come funziona il limite di articoli?',
    a: 'Ogni piano comprende un numero di articoli al mese. Il limite è legato all’account, si rinnova ogni mese, e gli articoli non usati non si accumulano. Creare un articolo ne consuma uno; modificarlo, programmarlo e pubblicarlo non consumano nulla.',
  },
  {
    q: 'E se finiscono a metà del mese?',
    a: 'Passate a un piano che comprende più articoli e proseguite nello stesso mese.',
  },
  {
    q: 'Posso provare prima di pagare?',
    a: `Sì. Una prova di ${TRIAL_CATALOG.days} giorni senza carta di credito, con un articolo incluso per vedere tutto il percorso fino alla pubblicazione.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Redazione e pubblicazione',
    eyebrowIcon: FileText,
    title: 'Articoli scritti e pubblicati sul vostro sito,',
    accent: 'senza un reparto contenuti',
    subtitle: 'Pianificate i temi, approvateli e ricevete un articolo completo con immagini, una sezione di domande e risposte e collegamenti interni. Modificatelo se volete, poi pubblicatelo su WordPress o su Shopify, subito o alla data che scegliete.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingJa.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché i contenuti si bloccano',
      title: 'I contenuti vengono sempre rinviati perché in realtà sono tre mestieri',
      intro: 'Trovare un tema, scriverlo e metterlo online. Ognuno porta via tempo, così si rimanda al mese successivo. Qui i tre si fanno nello stesso posto.',
      items: [
        { icon: Search, title: 'Trovare di che cosa parlare', body: 'Verificare che cosa cercano le persone, che cosa coprono già i concorrenti e che cosa manca sul vostro sito.' },
        { icon: PenLine, title: 'Scrivere bene', body: 'Una buona bozza porta via ore, e va comunque ripresa e riletta.' },
        { icon: Send, title: 'Metterlo online', body: 'Copiare, caricare le immagini, compilare i campi SEO e ricordarsi di fare clic su pubblica.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Dal tema all’articolo pubblicato in cinque passaggi',
      items: [
        { title: 'Pianificate i temi', body: 'La piattaforma propone temi a partire dalle parole chiave della vostra attività e del vostro settore.' },
        { title: 'Approvate', body: 'Scegliete i temi che hanno senso adesso. Vengono scritti soltanto quelli.' },
        { title: 'Ricevete un articolo completo', body: 'Titolo, corpo del testo, sottotitoli, immagini, una sezione di domande e risposte e collegamenti interni.' },
        { title: 'Rileggete e modificate', body: 'Leggete, cambiate tutto quello che volete, e approvate quando siete pronti.' },
        { title: 'Programmate o pubblicate', body: 'Subito, oppure alla data e all’ora che scegliete, direttamente su WordPress o su Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'In ogni articolo',
      title: 'Un articolo completo, non un testo grezzo',
      items: [
        { icon: FileText, title: 'Un articolo intero', body: 'Il tema che avete approvato diventa un articolo completo, non un riassunto né una scaletta.' },
        { icon: ImageIcon, title: 'Immagini', body: 'Un’immagine in evidenza e immagini nel testo, senza doverle cercare né caricare.' },
        { icon: ListChecks, title: 'Domande e risposte e dati strutturati', body: 'Una sezione di domande e risposte in ogni articolo. Sui siti WordPress con il plugin Go Top installato vengono aggiunti anche dati strutturati che Google e i motori di IA sanno leggere.' },
        { icon: Link2, title: 'Collegamenti interni', body: 'Link proposti verso altre pagine del vostro sito, e siete voi ad approvare quali entrano.' },
        { icon: FileCheck2, title: 'Meta titolo e meta descrizione', body: 'Scritti per la ricerca, e modificabili come tutto il resto.' },
        { icon: ShieldCheck, title: 'Un controllo di qualità prima della pubblicazione', body: 'Ogni articolo viene riletto prima di uscire: nulla viene pubblicato a metà.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Pubblicazione diretta',
      title: 'Collegate una volta, pubblicate senza copia e incolla',
      intro: 'Un articolo che avete approvato va direttamente sul vostro sito, con le vostre immagini e i vostri campi SEO.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Collegate il vostro sito WordPress e pubblicatevi articoli subito o alla data prevista.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Collegate il vostro negozio Shopify e pubblicate gli articoli del blog direttamente dalla piattaforma.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Domande', title: 'Quello che ci si chiede sulla redazione e sulla pubblicazione', items: faqs },
  ],
  cta: {
    title: 'Il vostro prossimo articolo può essere scritto oggi',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
