import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPl } from '@/lib/i18n/public/landing-pl'

export const metadata: Metadata = {
  title: 'Raporty o SEO i GEO | Go Top SEO',
  description: 'Raporty do pracy w PDF i Excelu, z pozycjami, zmianami i spojrzeniem na konkurentów. W kilka sekund gotowe, aby pójść do klientów.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['pl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Raporty',
    eyebrowIcon: ChartColumn,
    title: 'Jeden raport, który pokazuje, co się zmieniło,',
    accent: 'jednym kliknięciem',
    subtitle: 'Pozycje w Google i w Mapach Google oraz widoczność w usługach AI, zebrane w jednym raporcie w PDF albo w Excelu. Gotowe, aby takie jak są pójść do klienta, do własnej firmy albo do Państwa samych.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingPl.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego raport jest potrzebny',
      title: 'Dobra praca musi być widoczna',
      intro: 'Zrozumiały raport oszczędza tłumaczenia i pokazuje, że witryna idzie w górę.',
      items: [
        { icon: Eye, title: 'Cały obraz', body: 'Google, Mapy Google i AI w jednym miejscu. Nie trzeba zlepiać ekranów z kilku narzędzi.' },
        { icon: Clock, title: 'Nic do składania ręcznie', body: 'Dane są już w platformie. Raport powstaje z nich jednym kliknięciem.' },
        { icon: Handshake, title: 'Zaufanie klienta', body: 'Dla agencji i usługodawców: raport w stałych terminach pokazuje klientowi, co się zmieniło i dlaczego warto iść dalej.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Od danych do raportu w trzech krokach',
      items: [
        { title: 'Państwo wybierają projekt', body: 'Dla każdej witryny jest jeden projekt, a każdy projekt ma własne raporty.' },
        { title: 'Państwo eksportują', body: 'Jako PDF do przekazania albo jako Excel, aby pracować dalej z danymi.' },
        { title: 'Państwo wysyłają', body: 'Do klienta, do własnej firmy albo do partnera, bez przygotowywania czegokolwiek wcześniej.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co jest w raporcie',
      title: 'Tylko to, co coś znaczy, a nie to, co nic nie znaczy',
      items: [
        { icon: TrendingUp, title: 'Pozycje i zmiany', body: 'Dla każdego słowa kluczowego dzisiejsza pozycja, poprzednia i różnica między nimi.' },
        { icon: ArrowUpDown, title: 'Strona, która stoi na przodzie', body: 'Dla każdego słowa kluczowego, która strona Państwa witryny się pojawia.' },
        { icon: ChartColumn, title: 'Szacowany napływ', body: 'Szacunek odwiedzin z Google, według liczby wyszukiwań i dzisiejszej pozycji.' },
        { icon: Sparkles, title: 'Widoczność w AI', body: 'Wzmianki o Państwa witrynie i cytowania źródeł, dla każdej usługi AI.' },
        { icon: History, title: 'Pełny przebieg', body: 'W pliku dla Excela są wszystkie dotychczasowe pomiary, nie tylko ostatni.' },
        { icon: FileSpreadsheet, title: 'PDF i Excel', body: 'Złożony graficznie PDF do przekazania i plik dla Excela, jeśli chcą Państwo pracować dalej z liczbami.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Często zadawane pytania',
      title: 'O co pytają w sprawie raportów',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete Polish block, so the export really does come out
        // in Polish. Keep this answer and those two files in step.
        { q: 'W jakim języku przychodzi raport?', a: 'Raport przychodzi w języku panelu. Polski jest jednym z nich, a obok są hebrajski, angielski, hiszpański, portugalski, francuski, włoski, japoński, niemiecki i niderlandzki.' },
        { q: 'Czy mogę zrobić osobny raport dla każdego klienta?', a: 'Tak. Dla każdej witryny jest jeden projekt, a każdy projekt ma własne raporty. Ile projektów jest w pakiecie, podajemy w cenniku.' },
        { q: 'Czy raporty są w każdym pakiecie?', a: 'Tak. Raporty w PDF i w Excelu są w każdym pakiecie.' },
      ],
    },
  ],
  cta: {
    title: 'Do pierwszego raportu to kilka dni',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
