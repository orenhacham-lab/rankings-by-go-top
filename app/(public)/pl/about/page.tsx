import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function PolishAboutPage() {
  return <AboutPage locale="pl" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish, French, Italian, Japanese, German
 * and Dutch ones, in Polish.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Polish
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['pl'], href: '/pl/about' },
  title: 'Jedenaście lat pozycjonowania w praktyce,',
  accent: 'zebrane w jednej platformie.',
  subtitle: 'Platforma, która pisze i publikuje artykuły na Państwa witrynie, mierzy pozycje w Google i w Mapach Google oraz sprawdza, czy usługi AI polecają Państwa firmę. Zbudowana przez Go Top, agencję marketingu cyfrowego z ponad jedenastoma latami pracy w pozyskiwaniu odwiedzających z wyników organicznych i w reklamie.',
  who: {
    title: 'Firma, która buduje tę platformę',
    paragraphs: [
      'Go Top SEO buduje Go Top, agencja marketingu cyfrowego, która od ponad jedenastu lat zajmuje się widocznością organiczną, reklamą internetową i witrynami dla firm w Izraelu i za granicą.',
      'Platforma wyrosła z codziennej pracy z tymi klientami. Zobaczyliśmy, który raport naprawdę coś mówi, które dane pomagają przy decyzji i gdzie traci się czas. Zbudowaliśmy więc jedno miejsce, w którym treści się pisze, publikuje i mierzy: w Google i w usługach AI.',
    ],
  },
  founderEyebrow: 'Osoba, która prowadzi ten projekt',
  gaps: {
    title: 'Czego brakowało i co zbudowaliśmy w zamian',
    body: 'Chcieliśmy, żeby wszystko, co jest potrzebne, aby dać się znaleźć, mogło dziać się w jednym miejscu, bez konieczności uczenia się najpierw, jak działa wyszukiwanie organiczne.',
    missingLabel: 'Czego brakowało',
    builtLabel: 'Co zbudowaliśmy',
    rows: [
      {
        pain: { title: 'Ręczne sprawdzanie pozycji trwa za długo', description: 'Szukanie tego samego słowa kluczowego raz po raz, otwieranie kolejnych stron wyników i liczenie ręcznie zabiera pół dnia.' },
        answer: { title: 'Pozycje w Google i w Mapach Google', description: 'Pozycje w wyszukiwaniu organicznym i w Mapach Google, dla każdego słowa kluczowego, mierzone według miejsca i urządzenia, z przebiegiem zmian.' },
      },
      {
        pain: { title: 'Dane leżą rozproszone w kilku narzędziach', description: 'Pozycja w Google, pozycja w Mapach Google i widoczność w usługach AI są w trzech różnych miejscach i nie składają się w jeden obraz.' },
        answer: { title: 'Wszystko w jednym miejscu', description: 'Analiza słów kluczowych, pozycje, widoczność w AI i artykuły są ze sobą powiązane, zamiast leżeć w czterech osobnych narzędziach.' },
      },
      {
        pain: { title: 'Usługi AI są już częścią wyszukiwania', description: 'Coraz więcej klientów pyta ChatGPT, Gemini i Google AI Mode. Trzeba wiedzieć, czy Państwa firma pojawia się w tych odpowiedziach.' },
        answer: { title: 'Pomiar widoczności w AI', description: 'Widzą Państwo, czy Państwa firma jest wspominana w odpowiedziach ChatGPT, Gemini i Google AI Mode, czy jest podana jako źródło i czy jest polecana.' },
      },
      {
        pain: { title: 'Treści, które zatrzymują się w połowie', description: 'Wiedzieć, o czym pisać, to połowa pracy. Reszta to napisać, opublikować i zmierzyć.' },
        answer: { title: 'Pisanie i publikowanie artykułów', description: 'Z zatwierdzonych przez Państwa tematów powstaje skończony artykuł z obrazami, blokiem pytań i odpowiedzi oraz linkami wewnętrznymi, opublikowany w WordPressie albo w Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Jak pracujemy',
    items: [
      {
        title: 'Przejrzystość',
        description: 'Mówimy, co mierzymy, skąd pochodzą dane i co znaczą. Bez nadmuchanych liczb.',
      },
      {
        title: 'Dane, z których coś wynika',
        description: 'Raporty, które opowiadają historię mającą sens biznesowy, a nie liczby, które dobrze wyglądają.',
      },
      {
        title: 'Zrozumiały interfejs',
        description: 'Treści, pozycje w Google i w Mapach Google oraz widoczność w AI na jednym ekranie, bez tego, co zbędne.',
      },
      {
        title: 'SEO i GEO razem',
        description: 'Treści dla Google i treści dla usług AI, a do tego pomiar jednego i drugiego.',
      },
    ],
  },
  choose: {
    title: 'Dlaczego Go Top SEO',
    items: [
      {
        title: 'Jedna osoba, która odpowiada wprost i bez owijania',
        description: 'Żadnego „opiekuna klienta”, który zmienia się co miesiąc. Odpowiada ta sama osoba, która zna Państwa firmę.',
      },
      {
        title: 'Pełna przejrzystość',
        description: 'W każdej chwili widzą Państwo, co dzieje się na koncie, co zadziałało, a co nie, i jak idziemy dalej.',
      },
      {
        title: 'Fachowa wiedza bez żargonu',
        description: 'Nie nawlekamy trudnych słów. Mówimy o wynikach, które da się zmierzyć i zrozumieć.',
      },
      {
        title: 'Sami jesteśmy firmą',
        description: 'Znamy presję, ograniczony budżet i chęć zobaczenia wyniku, bo przechodzimy przez to samo.',
      },
    ],
  },
  cta: {
    title: 'Prosimy zobaczyć, co ta platforma zmienia na Państwa witrynie',
    body: FEATURE_COMMON['pl'].closeBody,
    contact: 'Pytania można przesłać na:',
    updated: 'Tę stronę zaktualizowano ostatnio we wrześniu 2026',
  },
}
