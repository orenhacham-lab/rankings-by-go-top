import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Monitoraggio della posizione in Google Maps | Go Top SEO',
  description: 'Monitorate la vostra visibilità locale in Google Maps. Verificate la vostra posizione città per città e zona per zona, il punto di partenza del posizionamento locale.',
  alternates: {
    canonical: 'https://www.gotopseo.com/it/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="it" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['it']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'Quando qualcuno cerca vicino a casa un’azienda come la vostra,',
    accent: 'sappiate dove siete sulla mappa',
    subtitle: 'Monitorate la vostra posizione in Google Maps per espressione e per zona: una città, oppure un punto preciso della mappa. Vedete chi vi precede e come la vostra posizione si muove nel tempo.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is an Italian market, not a translated American one: the same
    // choice as the Italian landing page's demo (Milano, ClimaPoint). The figures
    // are the sample ones the English, Spanish and French pages already show, so
    // no new rating or review count is invented here.
    visual: (
      <MapsVisual
        positionLabel="La vostra posizione"
        position="3"
        positionSub='a Milano, "installazione climatizzatori"'
        changeLabel="Questo mese"
        change="2"
        changeSub="posizioni guadagnate"
        reviewsLabel="recensioni"
        rows={[
          { rank: 1, name: 'ClimaPoint Milano', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Comfort Lombardo', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'La vostra azienda', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Aria Nord Climatizzazione', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché la mappa',
      title: 'Nella ricerca locale la mappa è la vetrina',
      intro: 'Quando qualcuno cerca un servizio vicino a casa, Google mostra per prime alcune aziende sulla mappa. È lì che si decide a chi si telefona.',
      items: [
        { icon: Phone, title: 'Da lì arrivano le telefonate', body: 'Nei risultati della mappa le persone chiamano, chiedono il percorso o aprono il vostro sito con un solo gesto.' },
        { icon: Users, title: 'Pochi posti, molti concorrenti', body: 'Solo una manciata di aziende occupa le prime posizioni. Dovete sapere se siete tra queste.' },
        { icon: MapPin, title: 'Ogni zona è una gara a sé', body: 'Potete essere primi in una città e assenti nel comune accanto. Il monitoraggio per zona lo mostra.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Tre passaggi per vedere chiaro sulla mappa',
      items: [
        { title: 'Inserite la vostra azienda', body: 'Aggiungete la vostra azienda e la zona che servite.' },
        { title: 'Scegliete espressioni e zone', body: 'Per esempio «installazione climatizzatori» a Milano, oppure a partire da un punto preciso della mappa.' },
        { title: 'Seguite l’andamento', body: 'Analizzate a mano quando volete, oppure una volta al mese in automatico, con lo storico di ogni variazione.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Che cosa ricevete',
      title: 'Il vostro posto sulla mappa, senza supposizioni',
      items: [
        { icon: MapPin, title: 'Per città o per zona', body: 'Verificate ogni espressione nella zona in cui si trovano i vostri clienti.' },
        { icon: Navigation, title: 'Un punto preciso della mappa', body: 'Verificate dalle coordinate che scegliete, per vedere che cosa vede un cliente che si trova proprio lì.' },
        { icon: Store, title: 'Chi vi precede', body: 'Le aziende che emergono sopra di voi nei risultati, con il loro punteggio Google.' },
        { icon: History, title: 'Storico delle posizioni', body: 'Vedete come la vostra posizione è cambiata da un’analisi alla successiva.' },
        { icon: Search, title: 'Anche la ricerca classica', body: 'Monitorate le stesse espressioni nei risultati classici di Google.' },
        { icon: FileSpreadsheet, title: 'Report PDF ed Excel', body: 'Le vostre posizioni in Maps entrano in un report che potete passare a chi volete.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Domande',
      title: 'Quello che ci si chiede sul monitoraggio in Maps',
      items: [
        { q: 'Mi serve una scheda Profilo dell’attività su Google?', a: 'Per comparire in Maps serve una scheda Profilo dell’attività su Google. Il monitoraggio mostra dove emerge la vostra scheda, o se non emerge.' },
        { q: 'Con quale frequenza viene verificata la mia posizione?', a: 'Ogni volta che avviate un’analisi a mano, e potete anche attivare un’analisi mensile automatica. Per ora non esiste alcuna analisi automatica giornaliera o settimanale.' },
        { q: 'Ogni espressione in Maps conta come una verifica a sé?', a: 'Sì. Una verifica in Google è un’espressione in un luogo: la stessa espressione nella ricerca classica e in Maps conta quindi come due verifiche.' },
      ],
    },
  ],
  cta: {
    title: 'Scoprite chi raccoglie le telefonate nella vostra zona',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
