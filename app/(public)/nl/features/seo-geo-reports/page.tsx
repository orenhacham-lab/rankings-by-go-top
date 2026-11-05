import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingNl } from '@/lib/i18n/public/landing-nl'

export const metadata: Metadata = {
  title: 'Rapporten over SEO en GEO | Go Top SEO',
  description: 'Rapporten voor het werk als pdf en Excel, met de posities, de veranderingen en een blik op de concurrenten. In seconden klaar om naar klanten te gaan.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['nl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Rapporten',
    eyebrowIcon: ChartColumn,
    title: 'Eén rapport dat laat zien wat er is veranderd,',
    accent: 'met één klik',
    subtitle: 'De posities in Google en in Google Maps en de zichtbaarheid in de AI-diensten, samengebracht in één rapport als pdf of Excel. Klaar om zoals het is naar een klant, naar het eigen bedrijf of naar u zelf te gaan.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingNl.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom een rapport nodig is',
      title: 'Goed werk moet te zien zijn',
      intro: 'Een begrijpelijk rapport spaart de uitleg uit en laat zien dat de website vooruitgaat.',
      items: [
        { icon: Eye, title: 'Het hele beeld', body: 'Google, Google Maps en de AI op één plek. U hoeft geen schermen uit meerdere hulpmiddelen aan elkaar te plakken.' },
        { icon: Clock, title: 'Niets met de hand in elkaar te zetten', body: 'De gegevens staan al in het platform. Het rapport komt daaruit met één klik.' },
        { icon: Handshake, title: 'Het vertrouwen van de klant', body: 'Voor bureaus en dienstverleners: een rapport op vaste momenten laat de klant zien wat er is veranderd en waarom het de moeite waard is door te gaan.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Van gegevens naar rapport in drie stappen',
      items: [
        { title: 'U kiest het project', body: 'Per website is er één project, en elk project heeft zijn eigen rapporten.' },
        { title: 'U exporteert', body: 'Als pdf om door te geven of als Excel om met de gegevens verder te werken.' },
        { title: 'U verstuurt', body: 'Naar de klant, naar het eigen bedrijf of naar de partner, zonder er eerst iets voor klaar te leggen.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat er in het rapport staat',
      title: 'Alleen wat iets betekent, en niet wat niets betekent',
      items: [
        { icon: TrendingUp, title: 'Posities en veranderingen', body: 'Per zoekwoord de positie van vandaag, de vorige en het verschil daartussen.' },
        { icon: ArrowUpDown, title: 'De pagina die vooraan staat', body: 'Per zoekwoord welke pagina van uw website voorkomt.' },
        { icon: ChartColumn, title: 'De geschatte toestroom', body: 'Een schatting van de bezoeken uit Google, naar het zoekvolume en de positie van vandaag.' },
        { icon: Sparkles, title: 'Zichtbaarheid in de AI', body: 'De vermeldingen van uw website en de bronvermeldingen, per AI-dienst.' },
        { icon: History, title: 'Het volledige verloop', body: 'In het bestand voor Excel staan alle metingen tot nu toe, niet alleen de laatste.' },
        { icon: FileSpreadsheet, title: 'Pdf en Excel', body: 'Een vormgegeven pdf om door te geven en een bestand voor Excel als u met de cijfers verder wilt werken.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Veelgestelde vragen',
      title: 'Wat er over de rapporten wordt gevraagd',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete Dutch block, so the export really does come out
        // in Dutch. Keep this answer and those two files in step.
        { q: 'In welke taal komt het rapport?', a: 'Het rapport komt in de taal van het dashboard. Nederlands is daar één van, en daarnaast zijn er Hebreeuws, Engels, Spaans, Portugees, Frans, Italiaans, Japans en Duits.' },
        { q: 'Kan ik voor elke klant een eigen rapport maken?', a: 'Ja. Per website is er één project, en elk project heeft zijn eigen rapporten. Hoeveel projecten er in een pakket zitten, staat op de prijspagina.' },
        { q: 'Zitten de rapporten in elk pakket?', a: 'Ja. De rapporten als pdf en Excel zitten in elk pakket.' },
      ],
    },
  ],
  cta: {
    title: 'Tot het eerste rapport zijn het een paar dagen',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
