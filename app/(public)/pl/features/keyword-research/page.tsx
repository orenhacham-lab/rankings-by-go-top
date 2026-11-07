import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Analiza słów kluczowych | Go Top SEO',
  description: 'Pomysły na słowa kluczowe z danych Google Ads. Z liczbą wyszukiwań, konkurencją i szacowaną ceną za klik. Każde słowo kluczowe można włączyć do pomiaru pozycji albo zamienić w pytanie dla AI.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="pl" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['pl']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Analiza słów kluczowych',
    eyebrowIcon: Search,
    title: 'To, czego Państwa klienci naprawdę szukają,',
    accent: 'staje się artykułem',
    subtitle: 'Pomysły na słowa kluczowe z danych Google Ads. Z miesięczną liczbą wyszukiwań, konkurencją i szacowaną ceną za klik. Co pasuje, włączają Państwo do pomiaru albo jednym kliknięciem zamieniają w pytanie dla AI.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    /* The example world is POLISH, not a translated Dutch one: montaż
       klimatyzacji in Warszawa. The figures are the example values the English,
       Spanish, French and Dutch pages already show, so no new number about any
       real market is invented. */
    visual: (
      <KeywordIdeasVisual
        seed="montaż klimatyzacji"
        headers={['Słowo kluczowe', 'Wyszukiwania miesięcznie', 'Konkurencja']}
        rows={[
          { keyword: 'firma montaż klimatyzacji', volume: '1 900', competition: 'Średnia', level: 'medium', added: true },
          { keyword: 'montaż klimatyzacji cena', volume: '1 300', competition: 'Niska', level: 'low' },
          { keyword: 'klimatyzacja kasetonowa', volume: '590', competition: 'Wysoka', level: 'high' },
          { keyword: 'naprawa klimatyzacji warszawa', volume: '320', competition: 'Niska', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Dlaczego zaczynać tutaj',
      title: 'Najlepszy artykuł o słowie kluczowym, którego nikt nie szuka, nikogo nie przyprowadzi',
      intro: 'Jeszcze przed napisaniem pierwszego słowa widzą Państwo, czego ludzie szukają, jak często to robią i jak trudno jest tam wejść.',
      items: [
        { icon: TrendingUp, title: 'Rzeczywisty popyt', body: 'Szacowana miesięczna liczba wyszukiwań dla każdego słowa kluczowego, według danych Google.' },
        { icon: Target, title: 'Gdzie da się wygrać', body: 'Konkurencja dla każdego słowa kluczowego, aby wybrać te, przy których miejsce na przodzie jest naprawdę osiągalne.' },
        { icon: Coins, title: 'Ile wart jest klik', body: 'Ile reklamodawcy płacą za klik. To wskazówka, ile to słowo kluczowe jest warte dla firmy.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Jak to działa',
      title: 'Od pomysłu do listy pracy',
      items: [
        { title: 'Państwo zaczynają od słowa kluczowego albo witryny', body: 'Prosimy wpisać słowo kluczowe albo adres witryny i wybrać kraj oraz język.' },
        { title: 'Państwo dostają pomysły z liczbami', body: 'Listę pokrewnych słów kluczowych, każde z liczbą wyszukiwań, konkurencją i szacowaną ceną za klik.' },
        { title: 'Państwo pracują dalej od razu', body: 'Prosimy włączyć słowo kluczowe do pomiaru pozycji albo zamienić je w pytanie do pomiaru widoczności w AI.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Co można zrobić',
      title: 'Wszystko, co potrzebne, aby wybrać odpowiednie słowa kluczowe',
      items: [
        { icon: Lightbulb, title: 'Pomysły ze słowa kluczowego albo z witryny', body: 'Z jednego słowa kluczowego albo z adresu witryny powstają pokrewne słowa kluczowe.' },
        { icon: TrendingUp, title: 'Liczba wyszukiwań', body: 'Dla każdego słowa kluczowego szacunek Google, jak często szuka się go w miesiącu.' },
        { icon: Target, title: 'Konkurencja', body: 'Dla każdego słowa kluczowego: niska, średnia albo wysoka.' },
        { icon: Coins, title: 'Szacowana cena za klik', body: 'Zakres stawek, przy których reklama wchodzi na górę strony.' },
        { icon: Plus, title: 'Jednym kliknięciem do pomiaru', body: 'Wybrane słowo kluczowe wchodzi od razu do pomiaru pozycji tego projektu.' },
        { icon: Sparkles, title: 'Pytania do pomiaru w AI', body: 'Słowo kluczowe staje się pytaniem w zwykłym języku, którym sprawdzają Państwo, czy usługi AI polecają Państwa firmę.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'O danych',
      body: (
        <>
          <p>Dane pochodzą z API Google Ads. Liczba wyszukiwań, konkurencja i cena za klik to szacunki Google i zmieniają się wraz z branżą, sezonem i regionem.</p>
          <p>Jako punkt wyjścia do wyboru tematu to wystarczy. Rzeczywisty wynik mierzymy pomiarem pozycji.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Prosimy znaleźć słowa kluczowe, dla których praca ma sens',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
