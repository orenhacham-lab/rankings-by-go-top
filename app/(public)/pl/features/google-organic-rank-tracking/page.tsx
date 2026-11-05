import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPl } from '@/lib/i18n/public/landing-pl'

export const metadata: Metadata = {
  title: 'Mierzenie pozycji w Google | Go Top SEO',
  description: 'Prosimy mierzyć swoje pozycje w Google dla każdego słowa kluczowego, miejsca, języka i urządzenia. W każdej chwili ręcznie albo raz w miesiącu automatycznie, z przebiegiem zmian i raportem o konkurentach.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['pl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Pozycje w Google',
    eyebrowIcon: TrendingUp,
    title: 'Widzą Państwo, na którym miejscu stoi w Google Państwa firma',
    accent: 'i czy praca przynosi owoce',
    subtitle: 'Mierzymy każde ważne słowo kluczowe osobno, według kraju, miasta, języka i urządzenia. W każdej chwili ręcznie, a raz w miesiącu także automatycznie. Każda zmiana zostaje w przebiegu.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingPl.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego mierzyć',
      title: 'Co nie jest mierzone, nie staje się lepsze',
      intro: 'Bez pomiaru nie wiadomo, czy nowy artykuł, zmiana na witrynie albo praca agencji cokolwiek zmieniły.',
      items: [
        { icon: LineChart, title: 'Widzą Państwo ruch', body: 'Dla każdego słowa kluczowego, czy wzrosło, spadło, czy stoi w miejscu, w porównaniu z poprzednim pomiarem.' },
        { icon: FileText, title: 'Treść i wynik są powiązane', body: 'Widzą Państwo, która strona wzrosła po opublikowaniu artykułu i o czym napisać jako następne.' },
        { icon: Target, title: 'Siły idą tam, gdzie jest blisko', body: 'Słowo kluczowe tuż pod pierwszą stroną wyników to zwykle najbliższa okazja. Pomiar pokazuje, które to słowo.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Raz ustawione i każda zmiana jest widoczna',
      items: [
        { title: 'Państwo dodają słowa kluczowe', body: 'Prosimy wpisać ważne słowa kluczowe albo przenieść je jednym kliknięciem z analizy słów kluczowych.' },
        { title: 'Państwo wybierają miejsce i urządzenie', body: 'Kraj, język, miasto oraz komputer albo telefon: każde z nich zmienia wyniki wyszukiwania.' },
        { title: 'Państwo mierzą i śledzą ruch', body: 'W każdej chwili można zmierzyć ręcznie, a comiesięczny pomiar automatyczny wykona pracę sam. Każdy wynik zostaje w przebiegu.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co Państwo dostają',
      title: 'Wiedzą Państwo dokładnie, gdzie stoi w Google Państwa firma',
      items: [
        { icon: Smartphone, title: 'Komputer i telefon osobno', body: 'Wyniki wyszukiwania na telefonie i na komputerze nie zawsze są takie same. Każde oglądamy osobno.' },
        { icon: Globe, title: 'Według kraju, miasta i języka', body: 'Widzą Państwo to, co widzi klient szukający z obszaru, na którym Państwu zależy.' },
        { icon: Link2, title: 'Strona, która stoi na przodzie', body: 'Dla każdego słowa kluczowego, która strona Państwa witryny pojawia się w wynikach.' },
        { icon: History, title: 'Pełny przebieg', body: 'Każdy pomiar zostaje zapisany, więc widzą Państwo nie tylko dzisiejszy stan, ale i drogę do niego.' },
        { icon: MapPin, title: 'Mapy Google tak samo', body: 'Te same słowa kluczowe mierzymy także w Mapach Google, według miasta i obszaru.' },
        { icon: FileSpreadsheet, title: 'Raporty w PDF i Excelu', body: 'Raport z pozycjami, zmianami i przebiegiem, który można przekazać komu się chce.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Często zadawane pytania',
      title: 'O co pytają w sprawie mierzenia pozycji',
      items: [
        { q: 'Jak często mierzymy pozycje?', a: 'Za każdym razem, gdy Państwo uruchomią pomiar ręcznie, i raz w miesiącu automatycznie, jeśli tak ustawią. Codziennego ani cotygodniowego pomiaru automatycznego w tej chwili nie ma.' },
        { q: 'Dlaczego pozycja, którą widzę w Google, różni się od liczby w platformie?', a: 'Google zmienia wyniki według miejsca, urządzenia i historii wyszukiwania. Platforma mierzy w stałych warunkach, które Państwo sami ustalają, dzięki czemu liczba jest porównywalna w czasie.' },
        { q: 'Ile słów kluczowych da się mierzyć?', a: 'To zależy od Państwa pakietu. Dokładne limity są w cenniku.' },
      ],
    },
  ],
  cta: {
    title: 'Prosimy sprawdzić, gdzie są Państwo dziś',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
