import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Ricerca di parole chiave | Go Top SEO',
  description: 'Trovate idee di parole chiave con i dati di Google Ads: volume di ricerca, concorrenza e costo per clic stimato. Aggiungetele al monitoraggio della posizione o trasformatele in domande per le IA.',
  alternates: {
    canonical: 'https://www.gotopseo.com/it/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="it" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['it']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Ricerca di parole chiave',
    eyebrowIcon: Search,
    title: 'Scrivete di quello che i vostri clienti',
    accent: 'cercano davvero',
    subtitle: 'Idee di parole chiave con i dati di Google Ads: volume di ricerca mensile, concorrenza e costo per clic stimato. Aggiungete al monitoraggio quelle giuste, oppure trasformatele in domande per le IA con un clic.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="installazione climatizzatori"
        headers={['Parola chiave', 'Ricerche al mese', 'Concorrenza']}
        rows={[
          { keyword: 'installazione climatizzatore a pompa di calore', volume: '1.900', competition: 'Media', level: 'medium', added: true },
          { keyword: 'prezzo installazione climatizzatore', volume: '1.300', competition: 'Bassa', level: 'low' },
          { keyword: 'climatizzatore canalizzato', volume: '590', competition: 'Alta', level: 'high' },
          { keyword: 'riparazione climatizzatori sesto san giovanni', volume: '320', competition: 'Bassa', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché partire da qui',
      title: 'Un articolo eccellente su un’espressione che nessuno cerca non porta nessuno',
      intro: 'La ricerca mostra che cosa cercano le persone, con quale frequenza e quanto è difficile competere, prima che scriviate una sola parola.',
      items: [
        { icon: TrendingUp, title: 'Una domanda reale', body: 'Il volume di ricerca mensile stimato per ogni espressione, secondo i dati di Google.' },
        { icon: Target, title: 'Dove potete vincere', body: 'La concorrenza di ogni espressione, per scegliere quelle su cui potete davvero posizionarvi.' },
        { icon: Coins, title: 'Quanto vale un clic', body: 'Quello che gli inserzionisti pagano per clic: un buon segnale di quanto un’espressione valga per le aziende.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Da un’idea a una lista di lavoro',
      items: [
        { title: 'Partite da un’espressione o da un sito', body: 'Inserite un’espressione o l’indirizzo di un sito, poi scegliete il paese e la lingua.' },
        { title: 'Ricevete idee con i numeri', body: 'Un elenco di espressioni vicine, con il volume di ricerca, la concorrenza e il costo per clic stimato.' },
        { title: 'Mettetele al lavoro', body: 'Aggiungete espressioni al monitoraggio della posizione, oppure trasformatele in domande per il monitoraggio nelle IA.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Che cosa potete fare',
      title: 'Tutto quello che serve per scegliere le espressioni giuste',
      items: [
        { icon: Lightbulb, title: 'Idee da un’espressione o da un sito', body: 'Espressioni vicine a partire da una sola espressione, o dall’indirizzo di un sito.' },
        { icon: TrendingUp, title: 'Il volume di ricerca', body: 'Quante volte ogni espressione viene cercata al mese, secondo la stima di Google.' },
        { icon: Target, title: 'La concorrenza', body: 'Bassa, media o alta, per ogni espressione.' },
        { icon: Coins, title: 'Il costo per clic stimato', body: 'L’intervallo delle offerte per la parte alta della pagina nella ricerca a pagamento.' },
        { icon: Plus, title: 'Al monitoraggio con un clic', body: 'L’espressione che scegliete entra direttamente nel monitoraggio della posizione del progetto.' },
        { icon: Sparkles, title: 'Domande per il monitoraggio nelle IA', body: 'Trasformate un’espressione in una domanda in linguaggio naturale, per verificare se i motori di IA vi consigliano.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'A proposito dei dati',
      body: (
        <>
          <p>I dati vengono dall&rsquo;API di Google Ads. Il volume di ricerca, la concorrenza e il costo per clic sono stime di Google, e variano in base al settore, alla stagione e al luogo.</p>
          <p>È un buon punto di partenza per scegliere i temi. Il risultato reale, invece, si misura nel monitoraggio della posizione.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Trovate le espressioni che valgono il lavoro',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
