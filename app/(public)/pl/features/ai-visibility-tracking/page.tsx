import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPl } from '@/lib/i18n/public/landing-pl'

export const metadata: Metadata = {
  title: 'Mierzenie widoczności w AI | Go Top SEO',
  description: 'Prosimy mierzyć, jak często Państwa firma jest wspominana w ChatGPT, Gemini i Google AI Mode. Optymalizacja pod silniki generatywne, GEO, w liczbach.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['pl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Widoczność w usługach AI',
    eyebrowIcon: Sparkles,
    title: 'Kiedy klient pyta ChatGPT,',
    accent: 'widzą Państwo, czy polecana jest Państwa firma',
    subtitle: 'Platforma zadaje ChatGPT, Gemini i Google AI Mode te same pytania, które zadają Państwa klienci, i pokazuje, kto stoi w odpowiedziach. Państwa firma albo konkurenci.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingPl.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego to się teraz liczy',
      title: 'Są klienci, którzy już nie szukają w Google. Pytają AI.',
      intro: 'Kto stoi w odpowiedzi, dostaje polecenie. Kto się w niej nie pojawia, zostaje poza rozmową.',
      items: [
        { icon: MessagesSquare, title: 'Pytanie przeniosło się do czatu', body: 'Zamiast przechodzić dziesięć wyników wyszukiwania, ktoś zadaje jedno pytanie i dostaje jedną odpowiedź z kilkoma nazwami. Jedną z nich powinna być Państwa firma.' },
        { icon: Award, title: 'Polecenie, w które się wierzy', body: 'Kiedy usługa AI wymienia nazwę firmy, odbiera się to jak poradę. Kto przychodzi stamtąd, wybór ma już za sobą.' },
        { icon: Target, title: 'Konkurenci może już tam są', body: 'Bez pomiaru nie wiadomo, kogo polecają w Państwa branży. Pomiar pokazuje to dla każdego pytania i każdej usługi.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Trzy kroki i obraz jest gotowy',
      items: [
        { title: 'Państwo wybierają pytania', body: 'Ze słów kluczowych firmy powstają propozycje pytań, które można uzupełnić albo usunąć. Na przykład „kto montuje klimatyzację w Warszawie?”.' },
        { title: 'Każdą usługę pytamy osobno', body: 'Jedno pytanie idzie oddzielnie do wszystkich trzech usług, a każdą odpowiedź czytamy i sprawdzamy.' },
        { title: 'Widzą Państwo, kto w niej stoi', body: 'Dla każdego pytania widzą Państwo, czy Państwa firma jest wspomniana, czy Państwa witryna jest podana jako źródło i kogo wymieniono zamiast Państwa.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co Państwo dostają',
      title: 'Wszystko, co potrzebne, aby trafić do odpowiedzi',
      items: [
        { icon: Sparkles, title: 'Wzmianki w każdej usłudze', body: 'Trzy usługi oglądamy osobno, bo każda z nich odpowiada inaczej.' },
        { icon: Link2, title: 'Wzmianka jako źródło', body: 'Nie tylko czy nazwa pada, ale czy odpowiedź podaje Państwa witrynę jako źródło.' },
        { icon: Users, title: 'Kogo wymieniono zamiast Państwa', body: 'Konkurenci, którzy pojawiają się w odpowiedziach, i pytania, przy których dostają polecenie.' },
        { icon: Lightbulb, title: 'Co da się poprawić', body: 'Propozycje tego, co na witrynie trzeba uzupełnić i zmienić, aby zwiększyć szansę na obecność w odpowiedzi.' },
        { icon: LineChart, title: 'Przebieg w czasie', body: 'Każda kontrola zostaje zapisana, więc widzą Państwo, czy widoczność rośnie wraz z publikowanymi artykułami.' },
        { icon: FileSpreadsheet, title: 'Raporty w PDF i Excelu', body: 'Raport ze wzmiankami i cytowaniami źródeł dla każdej usługi, który można przekazać klientom albo wewnątrz własnej firmy.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Często zadawane pytania',
      title: 'O co pytają w sprawie widoczności w AI',
      items: [
        { q: 'Jaka jest różnica między SEO i GEO?', a: 'SEO to obecność w wynikach wyszukiwania Google. GEO to obecność w odpowiedziach usług AI. Platforma mierzy jedno i drugie, a artykuły, które pisze, są zbudowane pod oba: z czytelną strukturą, blokiem pytań i odpowiedzi, a na witrynach na WordPressie z wtyczką Go Top także z danymi strukturalnymi.' },
        { q: 'Czy gwarantują Państwo, że pojawię się w odpowiedziach?', a: 'Nie. Tego, co odpowiada usługa AI, nikt nie kontroluje. Możemy dokładnie zmierzyć Państwa dzisiejszą sytuację, pokazać, kto stoi na Państwa miejscu, i przygotować treści, które zwiększają szansę.' },
        { q: 'Jak liczą się kontrole w AI?', a: 'Jedno pytanie do jednej usługi to jedna kontrola. Jeśli zadadzą Państwo to samo pytanie wszystkim trzem usługom, to będą trzy kontrole. Limity w każdym pakiecie są w cenniku.' },
      ],
    },
  ],
  cta: {
    title: 'Prosimy sprawdzić, co ChatGPT mówi o Państwa branży',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
