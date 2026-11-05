import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingNl } from '@/lib/i18n/public/landing-nl'

export const metadata: Metadata = {
  title: 'Zichtbaarheid in AI meten | Go Top SEO',
  description: 'Meet hoe vaak uw bedrijf wordt genoemd in ChatGPT, Gemini en Google AI Mode. De optimalisatie voor generatieve engines, GEO, in cijfers.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['nl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Zichtbaarheid in de AI-diensten',
    eyebrowIcon: Sparkles,
    title: 'Als een klant het ChatGPT vraagt,',
    accent: 'ziet u of uw bedrijf wordt aanbevolen',
    subtitle: 'Het platform stelt ChatGPT, Gemini en Google AI Mode dezelfde vragen die uw klanten stellen, en laat u zien wie er in de antwoorden staat. Uw bedrijf of de concurrenten.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingNl.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom dit nu meetelt',
      title: 'Er zijn klanten die niet meer in Google zoeken. Zij vragen het de AI.',
      intro: 'Wie in het antwoord staat, krijgt de aanbeveling. Wie er niet in voorkomt, blijft buiten het gesprek.',
      items: [
        { icon: MessagesSquare, title: 'De vraag is naar de chat verhuisd', body: 'In plaats van tien zoekresultaten af te gaan stelt iemand één vraag en krijgt één antwoord met een paar namen erin. Eén daarvan hoort uw bedrijf te zijn.' },
        { icon: Award, title: 'Een aanbeveling die wordt geloofd', body: 'Noemt een AI-dienst de naam van een bedrijf, dan komt dat over als een advies. Wie daar vandaan komt, heeft zijn keuze al gemaakt.' },
        { icon: Target, title: 'De concurrenten staan er misschien al in', body: 'Zonder te meten weet u niet wie er in uw branche wordt aanbevolen. De meting laat dat per vraag en per dienst zien.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Drie stappen, en het beeld is er',
      items: [
        { title: 'U kiest de vragen', body: 'Uit de zoekwoorden van het bedrijf komen voorstellen voor vragen, die u kunt aanvullen of weghalen. Bijvoorbeeld “wie installeert in Amsterdam een airco?”.' },
        { title: 'Elke dienst wordt afzonderlijk gevraagd', body: 'Eén vraag gaat apart naar alle drie de diensten, en elk antwoord wordt gelezen en nagegaan.' },
        { title: 'U ziet wie erin staat', body: 'Per vraag ziet u of uw bedrijf wordt genoemd, of uw website als bron is opgegeven en wie er in uw plaats wordt genoemd.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat u krijgt',
      title: 'Alles wat nodig is om in het antwoord te komen',
      items: [
        { icon: Sparkles, title: 'De vermeldingen per dienst', body: 'Wij bekijken de drie diensten apart, omdat elk van hen anders antwoordt.' },
        { icon: Link2, title: 'De vermelding als bron', body: 'Niet alleen of de naam valt, maar of het antwoord uw website als bron opgeeft.' },
        { icon: Users, title: 'Wie er in uw plaats wordt genoemd', body: 'De concurrenten die in de antwoorden voorkomen, en de vragen waarbij zij de aanbeveling krijgen.' },
        { icon: Lightbulb, title: 'Wat er te verbeteren valt', body: 'Voorstellen voor wat er op de website moet worden aangevuld en veranderd, zodat de kans groter wordt dat u in het antwoord staat.' },
        { icon: LineChart, title: 'Het verloop in de tijd', body: 'Elke controle blijft vastgelegd, zodat u ziet of de zichtbaarheid meegroeit met de gepubliceerde artikelen.' },
        { icon: FileSpreadsheet, title: 'Rapporten als pdf en Excel', body: 'Een rapport met de vermeldingen en de bronvermeldingen per dienst, dat u aan klanten of binnen het eigen bedrijf kunt doorgeven.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Veelgestelde vragen',
      title: 'Wat er over de zichtbaarheid in AI wordt gevraagd',
      items: [
        { q: 'Wat is het verschil tussen SEO en GEO?', a: 'SEO betekent voorkomen in de zoekresultaten van Google. GEO betekent voorkomen in de antwoorden van de AI-diensten. Het platform meet beide, en de artikelen die het schrijft zijn voor beide gebouwd: met een heldere opbouw, een vraag-en-antwoordblok en, op websites met WordPress en de plug-in van Go Top, met structured data.' },
        { q: 'Garanderen jullie dat ik in de antwoorden voorkom?', a: 'Nee. Wat een AI-dienst antwoordt, heeft niemand in de hand. Wat wij kunnen doen, is uw situatie van vandaag nauwkeurig meten, u laten zien wie er in uw plaats staat en content klaarzetten die de kans vergroot.' },
        { q: 'Hoe worden de controles in de AI geteld?', a: 'Eén vraag aan één dienst is één controle. Stelt u dezelfde vraag aan alle drie de diensten, dan zijn dat drie controles. De grenzen per pakket staan op de prijspagina.' },
      ],
    },
  ],
  cta: {
    title: 'Zoek uit wat ChatGPT over uw branche zegt',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
