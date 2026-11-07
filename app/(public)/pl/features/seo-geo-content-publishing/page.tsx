import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingPl } from '@/lib/i18n/public/landing-pl'

export const metadata: Metadata = {
  title: 'Pisanie, planowanie i publikowanie treści pod SEO i GEO | Go Top SEO',
  description:
    'Planowanie tematów, pełny artykuł od AI, poprawianie go, planowanie publikacji i publikowanie wprost w WordPressie albo Shopify. Wszystko w jednym miejscu.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['pl']

const faqs = [
  {
    q: 'Czy muszę czytać każdy artykuł przed publikacją?',
    a: 'Nie muszą Państwo, ale zawsze mogą. Piszemy wyłącznie o tematach, które Państwo zatwierdzili, każdy artykuł przed publikacją przechodzi kontrolę jakości, a Państwo mogą go przeczytać, poprawić i wypuścić, zanim się pojawi.',
  },
  {
    q: 'Na jakich witrynach da się publikować?',
    a: 'Bezpośrednie publikowanie działa dla WordPressa i Shopify. Gdy witryna raz zostanie podłączona, każdy zatwierdzony artykuł się tam pojawia.',
  },
  {
    q: 'Jak działa zaplanowana publikacja?',
    a: 'Gdy Państwo zatwierdzą artykuł, publikują go od razu albo wybierają datę i godzinę. Platforma opublikuje go wtedy sama.',
  },
  {
    q: 'Czy artykuł dostaje obrazy i tytuł dla wyszukiwania?',
    a: 'Tak. Każdy artykuł dostaje obraz główny i obrazy w tekście, metatytuł i metaopis, a wszystko to da się poprawić przed publikacją.',
  },
  {
    q: 'Jak ograniczamy liczbę artykułów?',
    a: 'W każdym pakiecie jest pewna liczba artykułów na miesiąc. Limit wisi na koncie, odnawia się co miesiąc, a to, co niewykorzystane, nie przechodzi na następny miesiąc. Wygenerowany artykuł zużywa jeden; poprawianie, planowanie i publikowanie nie zużywają nic.',
  },
  {
    q: 'A jeśli w połowie miesiąca wykorzystam wszystko?',
    a: 'Prosimy przejść na pakiet, w którym jest więcej artykułów, i wtedy idą Państwo dalej w tym samym miesiącu.',
  },
  {
    q: 'Czy mogę wypróbować, zanim zapłacę?',
    a: `Tak. Darmowy okres próbny trwa ${TRIAL_CATALOG.days} dni i nie wymaga karty. Jeden artykuł jest w nim zawarty, żeby raz przejść całą drogę do publikacji.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Pisanie i publikowanie treści',
    eyebrowIcon: FileText,
    title: 'Artykuły powstają i są publikowane na witrynie,',
    accent: 'także bez osoby od treści',
    subtitle: 'Państwo planują tematy i je zatwierdzają, a powstaje pełny artykuł z obrazami, blokiem pytań i odpowiedzi oraz linkami wewnętrznymi. Jeśli zechcą, poprawiają go i publikują w WordPressie albo Shopify, od razu albo w wybranym dniu.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingPl.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego treści leżą',
      title: 'Treści zawsze odkłada się na później, bo w rzeczywistości to praca trzy razy',
      intro: 'Znaleźć temat, napisać, opublikować. Każde z tego zabiera czas, więc przesuwa się to na następny miesiąc. Tutaj te trzy rzeczy spotykają się w jednym miejscu.',
      items: [
        { icon: Search, title: 'Znaleźć, o czym pisać', body: 'Sprawdzić, czego ludzie szukają, co konkurenci już zajęli i czego brakuje na własnej witrynie.' },
        { icon: PenLine, title: 'Napisać porządnie', body: 'Szkic zabiera kilka godzin, a potem jeszcze się go zmienia i czyta.' },
        { icon: Send, title: 'Opublikować', body: 'Przenieść tekst, wysłać obrazy, wypełnić pola dla wyszukiwania i nie zapomnieć nacisnąć publikuj.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Od tematu do opublikowanego artykułu w pięciu krokach',
      items: [
        { title: 'Państwo planują tematy', body: 'Z firmy i ze słów kluczowych branży powstają propozycje tematów.' },
        { title: 'Państwo zatwierdzają', body: 'Wybierają Państwo tematy, które mają teraz sens. Tylko o nich piszemy.' },
        { title: 'Państwo dostają pełny artykuł', body: 'Z tytułem, tekstem, śródtytułami, obrazami, blokiem pytań i odpowiedzi oraz linkami wewnętrznymi.' },
        { title: 'Państwo czytają i poprawiają', body: 'Prosimy przeczytać, zmienić ile się chce i zatwierdzić, gdy pasuje.' },
        { title: 'Państwo planują albo publikują', body: 'Od razu albo w wybranym dniu i o wybranej godzinie, wprost w WordPressie albo Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co jest w każdym artykule',
      title: 'Nie luźny tekst, lecz skończony artykuł',
      items: [
        { icon: FileText, title: 'Pełny artykuł', body: 'Z tematu, który Państwo zatwierdzili, powstaje artykuł, a nie streszczenie ani szkielet.' },
        { icon: ImageIcon, title: 'Obrazy', body: 'Obraz główny i obrazy w tekście. Nie trzeba niczego szukać ani wysyłać.' },
        { icon: ListChecks, title: 'Pytania i odpowiedzi, dane strukturalne', body: 'W każdym artykule jest blok pytań i odpowiedzi. Na witrynach na WordPressie z wtyczką Go Top dochodzą do tego dane strukturalne, które Google i usługi AI potrafią czytać.' },
        { icon: Link2, title: 'Linki wewnętrzne', body: 'Proponujemy linki do innych stron Państwa witryny, a Państwo decydują, które z nich wejdą.' },
        { icon: FileCheck2, title: 'Metatytuł i metaopis', body: 'Napisane pod wyszukiwanie i tak samo łatwe do poprawienia jak wszystko inne.' },
        { icon: ShieldCheck, title: 'Kontrola jakości przed publikacją', body: 'Każdy artykuł czytamy przed publikacją. Praca w pół drogi się nie pojawia.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Publikowanie wprost',
      title: 'Raz podłączone i koniec z kopiowaniem i wklejaniem',
      intro: 'Artykuł, który Państwo zatwierdzili, pojawia się wprost na Państwa witrynie, razem z obrazami i polami dla wyszukiwania.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Prosimy podłączyć swoją witrynę na WordPressie i opublikować artykuł od razu albo w zaplanowanym dniu.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Prosimy podłączyć swój sklep w Shopify i publikować artykuły bloga wprost z platformy.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Często zadawane pytania', title: 'O co pytają w sprawie pisania i publikowania', items: faqs },
  ],
  cta: {
    title: 'Następny artykuł może powstać dziś',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
