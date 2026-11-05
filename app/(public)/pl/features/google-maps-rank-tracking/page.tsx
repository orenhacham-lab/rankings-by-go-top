import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Mierzenie pozycji w Mapach Google | Go Top SEO',
  description: 'Prosimy mierzyć swoją widoczność w Mapach Google. Pozycja dla każdego miasta i obszaru. Pozyskiwanie klientów z wyszukiwania w okolicy zaczyna się tutaj.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['pl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Mapy Google',
    eyebrowIcon: MapPin,
    title: 'Kiedy ktoś w okolicy szuka firmy takiej jak Państwa,',
    accent: 'widzą Państwo, gdzie stoją na mapie',
    subtitle: 'Mierzymy Państwa pozycję w Mapach Google, dla każdego słowa kluczowego i każdego obszaru. Z dokładnością do miasta albo z konkretnego punktu na mapie. Widzą Państwo, kto stoi wyżej i jak pozycja poruszała się w czasie.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    /* The example is the POLISH market, not a translated American, Japanese,
       German or Dutch one: the same example world as the Polish keyword page
       (Warszawa, montaż klimatyzacji and the neighbours). The numbers are the
       example values the English, Spanish and French pages already show, so no
       new rating and no new review count is invented. */
    visual: (
      <MapsVisual
        positionLabel="Państwa pozycja"
        position="3"
        positionSub="Warszawa, „montaż klimatyzacji”"
        changeLabel="W tym miesiącu"
        change="2"
        changeSub="miejsca w górę"
        reviewsLabel="Opinie"
        rows={[
          { rank: 1, name: 'Klimatechnika Mokotów', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Wisła Chłodnictwo', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Państwa firma', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Klimapunkt Warszawa', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego mapa się liczy',
      title: 'W wyszukiwaniu w okolicy mapa jest witryną sklepową',
      intro: 'Kto szuka usługi w okolicy, dostaje od Google najpierw kilka firm na mapie. Tam rozstrzyga się, do kogo klient zadzwoni.',
      items: [
        { icon: Phone, title: 'Stamtąd przychodzą telefony', body: 'W wynikach na mapie jedno dotknięcie wystarczy, aby zadzwonić, wyznaczyć trasę albo otworzyć witrynę.' },
        { icon: Users, title: 'Mało miejsc, dużo konkurentów', body: 'Miejsca na przodzie zajmuje tylko kilka firm. Trzeba wiedzieć, czy jest wśród nich Państwa.' },
        { icon: MapPin, title: 'Każdy obszar to osobny mecz', body: 'W jednym mieście stoją Państwo na pierwszym miejscu, w mieście obok nie pojawiają się wcale. Pomiar według obszaru to pokazuje.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Trzy kroki i obraz na mapie jest jasny',
      items: [
        { title: 'Państwo wpisują swoją firmę', body: 'Prosimy wpisać swoją firmę i obszary, na których Państwo działają.' },
        { title: 'Państwo wybierają słowa kluczowe i obszar', body: 'Na przykład „montaż klimatyzacji” w Warszawie albo z konkretnego punktu na mapie.' },
        { title: 'Państwo śledzą ruch', body: 'W każdej chwili można zmierzyć ręcznie, a raz w miesiącu zmierzyć automatycznie. Każda zmiana zostaje w przebiegu.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co Państwo dostają',
      title: 'Nie szacunek, lecz Państwa pozycję na mapie',
      items: [
        { icon: MapPin, title: 'Według miasta i obszaru', body: 'Dla każdego słowa kluczowego, na obszarze, gdzie są Państwa klienci.' },
        { icon: Navigation, title: 'Konkretny punkt na mapie', body: 'Mierzymy ze współrzędnych, które Państwo podadzą, więc widzą Państwo dokładnie to, co widzi tam klient.' },
        { icon: Store, title: 'Kto stoi wyżej', body: 'Firmy, które w wynikach pojawiają się nad Państwem, i ich ocena w Google.' },
        { icon: History, title: 'Przebieg pozycji', body: 'Widzą Państwo, jak pozycja zmieniła się od poprzedniego pomiaru.' },
        { icon: Search, title: 'Zwykłe wyszukiwanie tak samo', body: 'Te same słowa kluczowe mierzymy także w zwykłych wynikach Google.' },
        { icon: FileSpreadsheet, title: 'Raporty w PDF i Excelu', body: 'Pozycje w Mapach Google są też w raporcie, który można przekazać komu się chce.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Często zadawane pytania',
      title: 'O co pytają w sprawie mierzenia w Mapach Google',
      items: [
        { q: 'Czy potrzebuję Profilu Firmy w Google?', a: 'Aby pojawiać się w Mapach Google, potrzebny jest wpis w Profilu Firmy w Google. Pomiar pokazuje, gdzie ten wpis się pojawia, a gdzie nie.' },
        { q: 'Jak często mierzymy pozycje?', a: 'Za każdym razem, gdy Państwo uruchomią pomiar ręcznie, i raz w miesiącu automatycznie, jeśli tak ustawią. Codziennego ani cotygodniowego pomiaru automatycznego w tej chwili nie ma.' },
        { q: 'Czy słowo kluczowe w Mapach Google liczy się jako osobna kontrola?', a: 'Tak. Jedna kontrola w Google to jedno słowo kluczowe na jednym obszarze. Jeśli mierzą Państwo to samo słowo w zwykłym wyszukiwaniu i w Mapach Google, to są dwie kontrole.' },
      ],
    },
  ],
  cta: {
    title: 'Prosimy sprawdzić, kto na Państwa obszarze dostaje telefony',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
