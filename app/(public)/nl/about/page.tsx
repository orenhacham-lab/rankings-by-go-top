import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function DutchAboutPage() {
  return <AboutPage locale="nl" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish, French, Italian, Japanese and
 * German ones, in Dutch.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Dutch
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['nl'], href: '/nl/about' },
  title: 'Elf jaar SEO in de praktijk,',
  accent: 'samengebracht in één platform.',
  subtitle: 'Een platform dat artikelen voor uw website schrijft en publiceert, de posities in Google en in Google Maps meet en nagaat of de AI-diensten uw bedrijf aanbevelen. Gebouwd door Go Top, een bureau voor digitale marketing met meer dan elf jaar werk in het organisch binnenhalen van bezoekers en in adverteren.',
  who: {
    title: 'Het bedrijf dat dit platform bouwt',
    paragraphs: [
      'Go Top SEO wordt gebouwd door Go Top, een bureau voor digitale marketing dat al meer dan elf jaar organische zichtbaarheid, online advertenties en websites verzorgt voor bedrijven in Israël en in het buitenland.',
      'Het platform is uit het dagelijkse werk met die klanten ontstaan. Wij hebben gezien welk rapport werkelijk iets zegt, welke gegevens bij een beslissing helpen en waar de tijd verloren gaat. Dus hebben wij één plek gebouwd waar content wordt geschreven, gepubliceerd en gemeten — in Google en in de AI-diensten.',
    ],
  },
  founderEyebrow: 'De persoon die dit project leidt',
  gaps: {
    title: 'Wat ontbrak, en wat wij in plaats daarvan hebben gebouwd',
    body: 'Wij wilden dat alles wat nodig is om gevonden te worden op één plek kan gebeuren, zonder dat u eerst moet leren hoe organisch zoeken werkt.',
    missingLabel: 'Wat ontbrak',
    builtLabel: 'Wat wij hebben gebouwd',
    rows: [
      {
        pain: { title: 'Posities met de hand nagaan duurt te lang', description: 'Hetzelfde zoekwoord keer op keer opzoeken, de ene pagina met zoekresultaten na de andere openen en met de hand rekenen — dat kost een halve dag.' },
        answer: { title: 'Posities in Google en in Google Maps', description: 'De posities in het organische zoeken en in Google Maps, per zoekwoord, gemeten naar plaats en naar apparaat, met het verloop van de veranderingen.' },
      },
      {
        pain: { title: 'De gegevens liggen verspreid over meerdere hulpmiddelen', description: 'De positie in Google, de positie in Google Maps en de zichtbaarheid in de AI-diensten staan elk op een andere plek, en er ontstaat geen beeld.' },
        answer: { title: 'Alles op één plek', description: 'Zoekwoordenonderzoek, posities, zichtbaarheid in AI en de artikelen hangen met elkaar samen, in plaats van in vier losse hulpmiddelen te liggen.' },
      },
      {
        pain: { title: 'De AI-diensten zijn al deel van het zoeken', description: 'Steeds meer klanten vragen het ChatGPT, Gemini en Google AI Mode. U moet weten of uw bedrijf in die antwoorden voorkomt.' },
        answer: { title: 'Meting van de zichtbaarheid in AI', description: 'U ziet of uw bedrijf in de antwoorden van ChatGPT, Gemini en Google AI Mode wordt genoemd, als bron wordt opgegeven of wordt aanbevolen.' },
      },
      {
        pain: { title: 'Content die halverwege blijft staan', description: 'Weten waarover u moet schrijven is de helft van het werk. De rest is schrijven, publiceren en meten.' },
        answer: { title: 'Artikelen schrijven en publiceren', description: 'Bij de onderwerpen die u goedkeurt ontstaat een afgerond artikel met afbeeldingen, een vraag-en-antwoordblok en interne links, gepubliceerd in WordPress of Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Hoe wij werken',
    items: [
      {
        title: 'Transparantie',
        description: 'Wij zeggen u wat wij meten, waar de gegevens vandaan komen en wat ze betekenen. Geen opgeblazen cijfers.',
      },
      {
        title: 'Gegevens die iets opleveren',
        description: 'Rapporten die een verhaal vertellen dat bedrijfsmatig klopt, in plaats van cijfers die er mooi uitzien.',
      },
      {
        title: 'Een begrijpelijke interface',
        description: 'Content, posities in Google en in Google Maps en de zichtbaarheid in AI op één scherm, zonder alles wat overbodig is.',
      },
      {
        title: 'SEO en GEO bij elkaar',
        description: 'Content voor Google en content voor de AI-diensten, en de meting van beide.',
      },
    ],
  },
  choose: {
    title: 'Waarom Go Top SEO',
    items: [
      {
        title: 'Eén persoon die direct en zonder omhaal antwoordt',
        description: 'Geen “accountmanager” die elke maand wisselt. Dezelfde persoon die uw bedrijf kent, antwoordt u.',
      },
      {
        title: 'Volledige transparantie',
        description: 'U ziet op elk moment wat er in uw account gebeurt, wat heeft gewerkt en wat niet, en hoe het verdergaat.',
      },
      {
        title: 'Vakkennis zonder jargon',
        description: 'Wij rijgen geen moeilijke woorden aan elkaar. Wij spreken over resultaten die meetbaar en begrijpelijk zijn.',
      },
      {
        title: 'Wij zijn zelf een bedrijf',
        description: 'Wij kennen de druk, het beperkte budget en de wens om resultaat te zien, omdat wij hetzelfde meemaken.',
      },
    ],
  },
  cta: {
    title: 'Zie wat dit platform aan uw website verandert',
    body: FEATURE_COMMON['nl'].closeBody,
    contact: 'Vragen kunt u sturen naar:',
    updated: 'Deze pagina is in september 2026 voor het laatst bijgewerkt',
  },
}
