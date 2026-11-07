import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Posities in Google Maps meten | Go Top SEO',
  description: 'Meet uw zichtbaarheid in Google Maps. De positie per stad en per gebied. Klanten binnenhalen uit het zoeken in de buurt begint hier.',
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="nl" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['nl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'Als iemand in de buurt een bedrijf als het uwe zoekt,',
    accent: 'ziet u waar u op de kaart staat',
    subtitle: 'Wij meten uw positie in Google Maps, per zoekwoord en per gebied. Tot op de stad nauwkeurig of vanaf een precies punt op de kaart. U ziet wie er boven u staat en hoe de positie zich in de tijd heeft bewogen.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is the DUTCH market, not a translated American, Japanese or
    // German one: the same example world as the Dutch keyword page (Amsterdam,
    // airco, Zuidas Klimaattechniek and the neighbours). The numbers are the
    // example values the English, Spanish and French pages already show, so no
    // new rating and no new review count is invented.
    visual: (
      <MapsVisual
        positionLabel="Uw positie"
        position="3"
        positionSub="Amsterdam, “airco installatie”"
        changeLabel="Deze maand"
        change="2"
        changeSub="plaatsen gestegen"
        reviewsLabel="Beoordelingen"
        rows={[
          { rank: 1, name: 'Zuidas Klimaattechniek', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Amstel Koeltechniek', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Uw bedrijf', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Klimaatpunt Amsterdam', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Waarom de kaart meetelt',
      title: 'In het zoeken in de buurt is de kaart de etalage',
      intro: 'Wie in de buurt een dienst zoekt, krijgt van Google eerst een paar bedrijven op de kaart te zien. Daar wordt beslist wie de klant belt.',
      items: [
        { icon: Phone, title: 'Daar komen de telefoontjes vandaan', body: 'In de resultaten op de kaart is één tik genoeg om te bellen, de route te zoeken of de website te openen.' },
        { icon: Users, title: 'Weinig plekken, veel concurrenten', body: 'De plekken vooraan worden door maar een paar bedrijven bezet. U moet weten of het uwe erbij zit.' },
        { icon: MapPin, title: 'Elk gebied is een eigen wedstrijd', body: 'In de ene stad staat u op de eerste plek, in de stad ernaast komt u helemaal niet voor. De meting per gebied laat dat zien.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Hoe het werkt',
      title: 'Drie stappen, en het beeld op de kaart is helder',
      items: [
        { title: 'U voert uw bedrijf in', body: 'Voer uw bedrijf in en de gebieden waarin u werkt.' },
        { title: 'U kiest zoekwoorden en gebied', body: 'Bijvoorbeeld “airco installatie” in Amsterdam, of vanaf een precies punt op de kaart.' },
        { title: 'U volgt de beweging', body: 'U kunt op elk moment met de hand meten en één keer per maand automatisch laten meten. Elke verandering blijft in het verloop staan.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Wat u krijgt',
      title: 'Niet geschat, maar uw positie op de kaart',
      items: [
        { icon: MapPin, title: 'Naar stad en naar gebied', body: 'Per zoekwoord, in het gebied waar uw klanten zitten.' },
        { icon: Navigation, title: 'Een precies punt op de kaart', body: 'Wij meten vanaf de coördinaten die u opgeeft, zodat u ziet wat een klant daar precies ziet.' },
        { icon: Store, title: 'Wie er boven u staat', body: 'De bedrijven die in de resultaten boven u voorkomen, en hun beoordeling bij Google.' },
        { icon: History, title: 'Het verloop van de posities', body: 'U ziet hoe de positie sinds de vorige meting is veranderd.' },
        { icon: Search, title: 'Het gewone zoeken net zo', body: 'Dezelfde zoekwoorden meten wij ook in de gewone zoekresultaten van Google.' },
        { icon: FileSpreadsheet, title: 'Rapporten als pdf en Excel', body: 'De posities in Google Maps staan ook in het rapport, dat u kunt doorgeven aan wie u wilt.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Veelgestelde vragen',
      title: 'Wat er over het meten in Google Maps wordt gevraagd',
      items: [
        { q: 'Heb ik een Google-bedrijfsprofiel nodig?', a: 'Om in Google Maps voor te komen hebt u een vermelding in het Google-bedrijfsprofiel nodig. De meting laat u zien waar die vermelding voorkomt en waar niet.' },
        { q: 'Hoe vaak worden de posities gemeten?', a: 'Elke keer dat u met de hand een meting start, en één keer per maand automatisch als u dat instelt. Een dagelijkse of wekelijkse automatische meting is er op dit moment niet.' },
        { q: 'Telt een zoekwoord in Google Maps als een eigen controle?', a: 'Ja. Eén controle bij Google is één zoekwoord in één gebied. Meet u hetzelfde zoekwoord in het gewone zoeken en in Google Maps, dan zijn dat twee controles.' },
      ],
    },
  ],
  cta: {
    title: 'Zoek uit wie in uw gebied de telefoontjes krijgt',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
