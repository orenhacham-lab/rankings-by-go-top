import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'Monitoraggio della visibilità nelle IA | Go Top SEO',
  description: 'Monitorate le menzioni della vostra azienda in ChatGPT, Gemini e Google AI Mode. Misurate il vostro GEO, l’ottimizzazione per i motori generativi.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Visibilità nei motori di IA',
    eyebrowIcon: Sparkles,
    title: 'Quando un cliente interroga ChatGPT,',
    accent: 'sappiate se vi consiglia',
    subtitle: 'La piattaforma pone a ChatGPT, a Gemini e a Google AI Mode le domande che pongono i vostri clienti, e mostra chi compare nella risposta: voi o un concorrente.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingJa.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Perché conta adesso',
      title: 'Alcuni clienti non cercano più in Google. Lo chiedono a un’IA.',
      intro: 'Chi compare nella risposta raccoglie la raccomandazione. Chi non c’è resta fuori dalla conversazione.',
      items: [
        { icon: MessagesSquare, title: 'La domanda è passata alla chat', body: 'Invece di scorrere dieci risultati, si pone una domanda e si ottiene una risposta che cita qualche nome. Uno di questi dovrebbe essere il vostro.' },
        { icon: Award, title: 'Una raccomandazione di cui si fida', body: 'Quando un motore di IA cita un’azienda, suona come un consiglio. Il cliente che arriva così arriva già deciso.' },
        { icon: Target, title: 'I vostri concorrenti potrebbero esserci già', body: 'Senza verificare è impossibile sapere chi viene consigliato nel vostro settore. Il monitoraggio lo mostra domanda per domanda e motore per motore.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Come funziona',
      title: 'Tre passaggi per un quadro chiaro',
      items: [
        { title: 'Scegliete le domande', body: 'La piattaforma propone domande a partire dalle parole chiave della vostra attività, e voi ne aggiungete o ne togliete. Per esempio: «Chi installa i climatizzatori a Milano?»' },
        { title: 'Ogni motore viene interrogato separatamente', body: 'Ogni domanda viene posta ai tre motori, e ogni risposta viene letta e verificata.' },
        { title: 'Vedete chi compare', body: 'Per ogni domanda: se siete citati, se il vostro sito è indicato come fonte, e chi viene citato al vostro posto.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Che cosa ricevete',
      title: 'Tutto quello che serve per entrare nella risposta',
      items: [
        { icon: Sparkles, title: 'Le menzioni per motore', body: 'In ciascuno dei tre motori separatamente, perché ognuno risponde a modo suo.' },
        { icon: Link2, title: 'Citati come fonte', body: 'Se la risposta rimanda al vostro sito come fonte, e non soltanto al vostro nome.' },
        { icon: Users, title: 'Chi viene citato al vostro posto', body: 'I concorrenti che emergono nelle risposte, e le domande in cui raccolgono la raccomandazione.' },
        { icon: Lightbulb, title: 'Che cosa migliorare', body: 'Indicazioni su che cosa aggiungere o cambiare sul vostro sito per avere più possibilità di comparire nella risposta.' },
        { icon: LineChart, title: 'Gli andamenti nel tempo', body: 'Ogni verifica viene conservata: così vedete se la visibilità cresce a mano a mano che vengono pubblicati gli articoli.' },
        { icon: FileSpreadsheet, title: 'Report PDF ed Excel', body: 'Le menzioni e le citazioni per motore, in un report che potete inviare a un cliente o alla vostra direzione.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Domande',
      title: 'Quello che ci si chiede sulla visibilità nelle IA',
      items: [
        { q: 'Qual è la differenza fra SEO e GEO?', a: 'La SEO è comparire nei risultati di Google. Il GEO è comparire nelle risposte dei motori di IA. La piattaforma misura entrambi, e gli articoli che scrive sono pensati per entrambi: una struttura chiara e sezioni di domande e risposte, a cui si aggiungono dati strutturati sui siti WordPress con il plugin Go Top installato.' },
        { q: 'Garantite che compariremo nelle risposte?', a: 'No. Nessuno controlla ciò che risponde un motore di IA. Quello che facciamo: misurare esattamente dove siete, mostrare chi compare al vostro posto e produrre contenuti che aumentano le vostre possibilità.' },
        { q: 'Come viene conteggiata una verifica IA?', a: 'Una domanda in un motore conta come una verifica. La stessa domanda nei tre motori conta come tre verifiche. Il limite di ogni piano è indicato nella pagina dei prezzi.' },
      ],
    },
  ],
  cta: {
    title: 'Scoprite che cosa dice ChatGPT del vostro settore',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
