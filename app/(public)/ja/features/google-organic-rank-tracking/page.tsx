import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'Monitoraggio della posizione in Google organico | Go Top SEO',
  description: 'Monitorate le vostre posizioni in Google per parola chiave, luogo, lingua e dispositivo. Avviate un’analisi quando volete, oppure una volta al mese in automatico, con report di andamento e di concorrenza.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Le vostre posizioni in Google',
    eyebrowIcon: TrendingUp,
    title: 'Sappiate in che posizione siete in Google,',
    accent: 'e se il lavoro sta dando frutti',
    subtitle: 'Monitorate ogni espressione che conta per voi, per paese, per città, per lingua e per dispositivo. Analizzate quando volete, oppure una volta al mese in automatico, con lo storico di ogni variazione.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingJa.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché misurare',
      title: 'Ciò che non si misura non migliora',
      intro: 'Senza monitoraggio è impossibile sapere se un nuovo articolo, una modifica al sito o il lavoro di un’agenzia hanno cambiato qualcosa.',
      items: [
        { icon: LineChart, title: 'Vedete l’andamento', body: 'In salita, in discesa o stabile su ogni espressione, da un’analisi alla successiva.' },
        { icon: FileText, title: 'Collegate il contenuto al risultato', body: 'Vedete quali pagine salgono dopo la pubblicazione di un articolo, e di che cosa scrivere poi.' },
        { icon: Target, title: 'Concentratevi su ciò che è vicino', body: 'Le espressioni appena sotto la prima pagina sono spesso l’occasione più vicina. Il monitoraggio vi mostra quali.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Impostate una volta, vedete ogni variazione',
      items: [
        { title: 'Aggiungete le vostre espressioni', body: 'Inserite le espressioni che contano per voi, oppure aggiungetele dalla ricerca di parole chiave con un clic.' },
        { title: 'Scegliete luogo e dispositivo', body: 'Paese, lingua, città, computer o cellulare, perché i risultati cambiano con ognuno di questi.' },
        { title: 'Analizzate e seguite l’andamento', body: 'Avviate un’analisi a mano quando volete, oppure un’analisi mensile automatica che gira da sola. Ogni risultato resta nel vostro storico.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Che cosa ricevete',
      title: 'Un quadro preciso del vostro posto in Google',
      items: [
        { icon: Smartphone, title: 'Computer e cellulare, separatamente', body: 'I risultati su cellulare e su computer non sono sempre gli stessi. Verificate ognuno per sé.' },
        { icon: Globe, title: 'Per paese, per città e per lingua', body: 'Vedete che cosa vede un cliente quando cerca dal luogo che conta per voi.' },
        { icon: Link2, title: 'La pagina che si posiziona', body: 'Per ogni espressione, quale pagina del vostro sito emerge nei risultati.' },
        { icon: History, title: 'Storico completo', body: 'Ogni analisi viene conservata: vedete il percorso fatto, e non soltanto la fotografia di oggi.' },
        { icon: MapPin, title: 'Anche Google Maps', body: 'Monitorate le stesse espressioni in Maps, per città o per zona.' },
        { icon: FileSpreadsheet, title: 'Report PDF ed Excel', body: 'Le posizioni, le variazioni e lo storico in un report che potete passare a chi volete.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Domande',
      title: 'Quello che ci si chiede sul monitoraggio della posizione',
      items: [
        { q: 'Con quale frequenza vengono verificate le posizioni?', a: 'Ogni volta che avviate un’analisi a mano, e potete anche attivare un’analisi mensile automatica. Per ora non esiste alcuna analisi automatica giornaliera o settimanale.' },
        { q: 'Perché quello che vedo in Google non corrisponde alla piattaforma?', a: 'Google personalizza i risultati in base al luogo, al dispositivo e alla cronologia di ricerca. La piattaforma verifica in condizioni fisse che definite voi, il che la rende una misura migliore per confrontare nel tempo.' },
        { q: 'Quante espressioni posso monitorare?', a: 'Dipende dal vostro piano. I limiti esatti sono indicati nella pagina dei prezzi.' },
      ],
    },
  ],
  cta: {
    title: 'Scoprite dove siete oggi',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
