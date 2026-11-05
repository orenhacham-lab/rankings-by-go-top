import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingNl } from '@/lib/i18n/public/landing-nl'

export const metadata: Metadata = {
  title: 'Content voor SEO en GEO schrijven, plannen en publiceren | Go Top SEO',
  description:
    'Onderwerpen plannen, een volledig artikel van de AI krijgen, het bijwerken, de publicatie plannen en direct in WordPress of Shopify publiceren. Alles op één plek.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['nl']

const faqs = [
  {
    q: 'Moet ik elk artikel voor publicatie lezen?',
    a: 'U hoeft het niet, u kunt het altijd. Er wordt alleen geschreven over de onderwerpen die u hebt goedgekeurd, elk artikel gaat voor publicatie door een controle op kwaliteit, en u kunt het lezen, bijwerken en vrijgeven voordat het verschijnt.',
  },
  {
    q: 'Op welke websites kan worden gepubliceerd?',
    a: 'Het directe publiceren werkt voor WordPress en Shopify. Zodra de website één keer is verbonden, verschijnt elk goedgekeurd artikel daar.',
  },
  {
    q: 'Hoe werkt de ingeplande publicatie?',
    a: 'Zodra u een artikel goedkeurt, publiceert u het direct of kiest u een datum en een tijd. Het platform publiceert het dan van zichzelf.',
  },
  {
    q: 'Krijgt een artikel afbeeldingen en een titel voor het zoeken?',
    a: 'Ja. Elk artikel krijgt een omslagafbeelding en afbeeldingen in de tekst, een metatitel en een meta description, en dat alles is voor publicatie bij te werken.',
  },
  {
    q: 'Hoe wordt het aantal artikelen begrensd?',
    a: 'In elk pakket zit een aantal artikelen per maand. De grens hangt aan het account, vernieuwt zich elke maand, en wat niet is gebruikt gaat niet mee naar de volgende maand. Een gegenereerd artikel gebruikt er één; bijwerken, inplannen en publiceren gebruiken niets.',
  },
  {
    q: 'En als ik halverwege de maand alles heb gebruikt?',
    a: 'Stap over naar een pakket waarin meer artikelen zitten, dan gaat u in dezelfde maand verder.',
  },
  {
    q: 'Kan ik het uitproberen voordat ik betaal?',
    a: `Ja. De gratis proefperiode duurt ${TRIAL_CATALOG.days} dagen en vraagt geen betaalkaart. Eén artikel zit erbij, zodat u de hele weg tot de publicatie één keer kunt doorlopen.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Content schrijven en publiceren',
    eyebrowIcon: FileText,
    title: 'De artikelen worden geschreven en op de website gepubliceerd,',
    accent: 'ook zonder iemand voor content',
    subtitle: 'U plant de onderwerpen en keurt ze goed, en er komt een volledig artikel met afbeeldingen, een vraag-en-antwoordblok en interne links. Wilt u dat, dan werkt u het bij, en u publiceert het in WordPress of Shopify, direct of op een datum die u kiest.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingNl.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom content blijft liggen',
      title: 'Content wordt altijd uitgesteld, omdat het in werkelijkheid drie keer werk is',
      intro: 'Het onderwerp vinden, schrijven, publiceren. Elk daarvan kost tijd, dus wordt het naar de volgende maand geschoven. Hier komen de drie op één plek samen.',
      items: [
        { icon: Search, title: 'Vinden waarover u moet schrijven', body: 'Nagaan waar mensen op zoeken, wat de concurrenten al bezetten en wat op de eigen website ontbreekt.' },
        { icon: PenLine, title: 'Netjes schrijven', body: 'Een concept kost een paar uur, en daarna wordt er nog veranderd en nagelezen.' },
        { icon: Send, title: 'Publiceren', body: 'De tekst overzetten, afbeeldingen uploaden, de velden voor het zoeken vullen en niet vergeten op publiceren te drukken.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Van onderwerp naar gepubliceerd artikel in vijf stappen',
      items: [
        { title: 'U plant de onderwerpen', body: 'Uit het bedrijf en de zoekwoorden van de branche komen voorstellen voor onderwerpen.' },
        { title: 'U keurt goed', body: 'U kiest de onderwerpen die nu zinvol zijn. Alleen daarover wordt geschreven.' },
        { title: 'U krijgt een volledig artikel', body: 'Met titel, tekst, tussenkoppen, afbeeldingen, een vraag-en-antwoordblok en interne links.' },
        { title: 'U leest en werkt bij', body: 'Lees, verander zoveel u wilt, en keur goed wanneer het past.' },
        { title: 'U plant of publiceert', body: 'Direct of op de datum en de tijd die u kiest, rechtstreeks in WordPress of Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat er in elk artikel zit',
      title: 'Geen losse tekst, maar een afgerond artikel',
      items: [
        { icon: FileText, title: 'Een volledig artikel', body: 'Uit het onderwerp dat u hebt goedgekeurd komt een artikel, geen samenvatting en geen opzet.' },
        { icon: ImageIcon, title: 'Afbeeldingen', body: 'Een omslagafbeelding en afbeeldingen in de tekst. U hoeft niets te zoeken en niets te uploaden.' },
        { icon: ListChecks, title: 'Vragen en antwoorden, structured data', body: 'In elk artikel staat een vraag-en-antwoordblok. Op websites met WordPress en de plug-in van Go Top komen daar structured data bij, die Google en de AI-diensten kunnen lezen.' },
        { icon: Link2, title: 'Interne links', body: 'Er worden links naar andere pagina’s van uw website voorgesteld, en u beslist welke daarvan erin komen.' },
        { icon: FileCheck2, title: 'Metatitel en meta description', body: 'Voor het zoeken geschreven en net zo bij te werken als al het andere.' },
        { icon: ShieldCheck, title: 'Controle op kwaliteit voor publicatie', body: 'Elk artikel wordt voor publicatie nagelezen. Halfaf werk verschijnt niet.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Direct publiceren',
      title: 'Eén keer verbonden, en geen knippen en plakken meer',
      intro: 'Het artikel dat u hebt goedgekeurd verschijnt direct op uw website, met afbeeldingen en de velden voor het zoeken erbij.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Verbind uw website met WordPress en publiceer het artikel direct of op de ingeplande dag.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Verbind uw winkel bij Shopify en publiceer de artikelen van de blog rechtstreeks uit het platform.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Veelgestelde vragen', title: 'Wat er over schrijven en publiceren wordt gevraagd', items: faqs },
  ],
  cta: {
    title: 'Het volgende artikel kan vandaag worden geschreven',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
