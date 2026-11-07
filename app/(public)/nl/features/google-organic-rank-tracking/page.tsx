import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingNl } from '@/lib/i18n/public/landing-nl'

export const metadata: Metadata = {
  title: 'Posities in Google meten | Go Top SEO',
  description: 'Meet uw posities in Google per zoekwoord, plaats, taal en apparaat. Op elk moment met de hand of één keer per maand automatisch, met het verloop en een rapport over de concurrenten.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['nl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Posities in Google',
    eyebrowIcon: TrendingUp,
    title: 'U ziet op welke plek uw bedrijf in Google staat,',
    accent: 'en of het werk vrucht draagt',
    subtitle: 'Wij meten elk belangrijk zoekwoord afzonderlijk, naar land, stad, taal en apparaat. Op elk moment met de hand, en één keer per maand ook automatisch. Elke verandering blijft in het verloop staan.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingNl.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom meten',
      title: 'Wat niet wordt gemeten, wordt niet beter',
      intro: 'Zonder meting weet u niet of een nieuw artikel, een wijziging aan de website of het werk van een bureau iets heeft veranderd.',
      items: [
        { icon: LineChart, title: 'U ziet de beweging', body: 'Per zoekwoord of het is gestegen, gedaald of onveranderd, vergeleken met de vorige meting.' },
        { icon: FileText, title: 'Content en resultaat hangen samen', body: 'U ziet welke pagina na het publiceren van een artikel is gestegen, en waarover u als volgende moet schrijven.' },
        { icon: Target, title: 'U zet de kracht in waar het dichtbij is', body: 'Een zoekwoord net onder de eerste pagina is meestal de kans die het dichtst bij ligt. De meting laat zien welk zoekwoord dat is.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Eén keer ingesteld, en elke verandering is te zien',
      items: [
        { title: 'U voegt zoekwoorden toe', body: 'Vul de belangrijke zoekwoorden in of neem ze met één klik over uit het zoekwoordenonderzoek.' },
        { title: 'U kiest plaats en apparaat', body: 'Land, taal, stad en computer of telefoon — elk daarvan verandert de zoekresultaten.' },
        { title: 'U meet en volgt de beweging', body: 'U kunt op elk moment met de hand meten en de maandelijkse automatische meting het werk laten doen. Elk resultaat blijft in het verloop staan.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat u krijgt',
      title: 'U weet precies waar uw bedrijf in Google staat',
      items: [
        { icon: Smartphone, title: 'Computer en telefoon apart', body: 'De zoekresultaten op de telefoon en op de computer zijn niet altijd dezelfde. Wij bekijken elk afzonderlijk.' },
        { icon: Globe, title: 'Naar land, stad en taal', body: 'U ziet wat een klant ziet die zoekt vanuit het gebied waar het u om gaat.' },
        { icon: Link2, title: 'De pagina die vooraan staat', body: 'Per zoekwoord welke pagina van uw website in de zoekresultaten voorkomt.' },
        { icon: History, title: 'Het volledige verloop', body: 'Elke meting blijft vastgelegd, zodat u niet alleen de opname van vandaag ziet maar ook de weg daarheen.' },
        { icon: MapPin, title: 'Google Maps net zo', body: 'Dezelfde zoekwoorden meten wij ook in Google Maps, per stad en gebied.' },
        { icon: FileSpreadsheet, title: 'Rapporten als pdf en Excel', body: 'Een rapport met de posities, de veranderingen en het verloop, dat u kunt doorgeven aan wie u wilt.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Veelgestelde vragen',
      title: 'Wat er over het meten van posities wordt gevraagd',
      items: [
        { q: 'Hoe vaak worden de posities gemeten?', a: 'Elke keer dat u met de hand een meting start, en één keer per maand automatisch als u dat instelt. Een dagelijkse of wekelijkse automatische meting is er op dit moment niet.' },
        { q: 'Waarom wijkt de positie die ik in Google zie af van het cijfer in het platform?', a: 'Google verandert de resultaten naar plaats, apparaat en zoekgeschiedenis. Het platform meet onder vaste voorwaarden die u zelf vastlegt, en daardoor is het cijfer over de tijd heen vergelijkbaar.' },
        { q: 'Hoeveel zoekwoorden kunnen worden gemeten?', a: 'Dat hangt van uw pakket af. De precieze grenzen staan op de prijspagina.' },
      ],
    },
  ],
  cta: {
    title: 'Zoek uit waar u vandaag staat',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
