import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingIt } from '@/lib/i18n/public/landing-it'

export const metadata: Metadata = {
  title: 'Report SEO e GEO | Go Top SEO',
  description: 'Report PDF ed Excel professionali con le vostre posizioni, i vostri andamenti e l’analisi dei concorrenti, pronti da inviare a un cliente in pochi secondi.',
  alternates: {
    canonical: 'https://www.gotopseo.com/it/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="it" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['it']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Report',
    eyebrowIcon: ChartColumn,
    title: 'Un report che mostra che cosa è cambiato,',
    accent: 'con un clic',
    subtitle: 'Le vostre posizioni in Google e in Maps e la vostra visibilità nei motori di IA, in un report PDF o Excel pronto da inviare a un cliente, alla vostra direzione, o a voi stessi.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingIt.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché un report',
      title: 'Il buon lavoro si deve vedere',
      intro: 'Un report chiaro evita le spiegazioni e mostra che il sito sta avanzando.',
      items: [
        { icon: Eye, title: 'Il quadro completo', body: 'Google, Maps e le IA nello stesso posto, invece di schermate prese da più strumenti.' },
        { icon: Clock, title: 'Nulla da assemblare a mano', body: 'I dati sono già nella piattaforma. Il report si costruisce da quei dati con un clic.' },
        { icon: Handshake, title: 'La fiducia del cliente', body: 'Per le agenzie: un report regolare mostra al cliente che cosa è cambiato e perché continuare.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Dai dati al report in tre passaggi',
      items: [
        { title: 'Scegliete un progetto', body: 'Ogni sito è un progetto a sé, con i propri report.' },
        { title: 'Esportate', body: 'Un PDF da inviare, oppure un Excel per lavorare i dati.' },
        { title: 'Inviate', body: 'A un cliente, alla vostra direzione o a un socio, senza nulla da impaginare.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Che cosa contiene il report',
      title: 'Tutto quello che conta, nulla di quello che non conta',
      items: [
        { icon: TrendingUp, title: 'Posizioni e variazioni', body: 'Per ogni espressione: la posizione di oggi, quella precedente, e la differenza fra le due.' },
        { icon: ArrowUpDown, title: 'La pagina che si posiziona', body: 'Quale pagina del vostro sito emerge su ogni espressione.' },
        { icon: ChartColumn, title: 'Traffico stimato', body: 'Una stima delle visite arrivate da Google, in base al volume di ricerca e alla posizione attuale.' },
        { icon: Sparkles, title: 'Visibilità nelle IA', body: 'Le menzioni e le citazioni del vostro sito, motore di IA per motore di IA.' },
        { icon: History, title: 'Storico completo', body: 'Nel file Excel: tutte le verifiche nel tempo, non soltanto l’ultima.' },
        { icon: FileSpreadsheet, title: 'PDF ed Excel', body: 'Un PDF curato da inviare, e un Excel per chi vuole lavorare sui numeri.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Domande',
      title: 'Quello che ci si chiede sui report',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete Italian block, so the export really does come out
        // in Italian. Keep this answer and those two files in step.
        { q: 'In quali lingue escono i report?', a: 'Il report esce nella lingua della vostra dashboard, e l’italiano è una di queste, accanto all’ebraico, all’inglese, allo spagnolo, al portoghese e al francese.' },
        { q: 'Posso fare un report distinto per ogni cliente?', a: 'Sì. Ogni sito è un progetto a sé, e ogni progetto ha il proprio report. Il numero di progetti di ogni piano è indicato nella pagina dei prezzi.' },
        { q: 'I report sono inclusi in tutti i piani?', a: 'Sì. I report PDF ed Excel sono inclusi in tutti i piani.' },
      ],
    },
  ],
  cta: {
    title: 'Il vostro primo report è a pochi giorni di distanza',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
