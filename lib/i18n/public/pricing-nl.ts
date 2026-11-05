/**
 * The Dutch pricing page's words around the plan grid
 * (app/(public)/nl/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in the Netherlands sees the same
 * dollar price every market outside Israel is billed in today, because a Dutch
 * local price is not set. Nothing here promises a currency, and the Dutch page
 * never names euros — Creem charges dollars, and a euro figure would be a price
 * we do not take.
 *
 * The tax note carries the Dutch equivalent of what the German page says: a
 * consumer price has to be the total payable, so the dollar line names the
 * seller (Creem, as merchant of record) and says the final amount including tax
 * is shown before payment, which is where the total is actually stated.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingNl: PricingCopy = {
  hero: {
    eyebrow: 'Prijzen',
    title: 'Alles wat nodig is om gevonden te worden,',
    accent: 'voor één prijs per maand',
    subtitle: 'Artikelen die geschreven en op uw website gepubliceerd worden, monitoring van de posities in Google en in Google Maps, en een controle van wat ChatGPT en Gemini aanbevelen. Het pakket kiest u naar uw behoefte, en u begint met een gratis proefperiode.',
    trust: [`${DAYS} dagen gratis proberen`, 'Zonder creditcard', 'Opzegbaar wanneer u wilt, in het dashboard'],
  },
  plans: {
    perMonth: '/maand',
    popular: 'Onze aanbeveling',
    cta: `${DAYS} dagen gratis proberen`,
    dashboard: 'Mijn dashboard',
    noCard: 'Zonder creditcard',
    checksNote: CHECKS_EXPLAINER.nl,
    taxNote: {
      ILS: 'De prijzen zijn inclusief Israëlische btw. Dit is het bedrag dat betaald wordt, zonder toeslagen.',
      USD: 'Bij betaling met een kaart is Creem de verkoper en treedt het op als merchant of record: Creem berekent de belasting aan de hand van het factuuradres en toont het eindbedrag voor de betaling. De hier genoemde prijzen zijn daar exclusief.',
    },
    everyPlanLabel: 'In alle pakketten',
    everyPlan: [
      'Automatische geplande publicatie op WordPress, Shopify en Wix',
      'Monitoring van de positie in Google en in Google Maps',
      'Een controle of 6 AI-engines zoals ChatGPT en Gemini het bedrijf noemen',
      'Een gezondheidsscore van de website met de lijst van nodige verbeteringen',
      'Rapporten in pdf en Excel, klaar om te versturen',
      'Persoonlijke begeleiding',
    ],
  },
  unsure: {
    text: 'Nog niet overtuigd? Begin met een gratis websiteanalyse.',
    cta: 'Mijn website analyseren',
  },
  included: {
    eyebrow: 'In alle pakketten',
    title: 'Geen extra opties. Alles vanaf de eerste dag inbegrepen.',
    body: 'De pakketten verschillen alleen in omvang: hoeveel websites, hoeveel artikelen en hoeveel controles per maand. De functies zijn in alle pakketten dezelfde.',
    items: [
      {
        title: 'Artikelen die geschreven en gepubliceerd worden',
        desc: 'Het platform schrijft volledige artikelen over de goedgekeurde onderwerpen, met afbeeldingen, een vraag-en-antwoordblok en interne links, en publiceert ze volgens plan op uw website.',
      },
      {
        title: 'Monitoring in Google en in Google Maps',
        desc: 'Op welke positie het bedrijf staat bij elke zoekterm die telt — in de klassieke zoekresultaten en in Maps — en hoe dat in de tijd verandert.',
      },
      {
        title: 'Zichtbaarheid in de AI-engines',
        desc: 'Controleert of ChatGPT, Gemini, Perplexity, Copilot, Grok en Google AI het bedrijf noemen, en wie ze in plaats daarvan noemen.',
      },
      {
        title: 'Zoekwoordenonderzoek',
        desc: 'Het platform vindt waar uw klanten naar zoeken en wat zij vragen, en stelt voor waarmee te beginnen.',
      },
      {
        title: 'Rapporten, klaar om te versturen',
        desc: 'Posities, ontwikkelingen en zichtbaarheid in AI-antwoorden in één pdf- of Excel-rapport, met één klik gemaakt en klaar voor een klant of de directie.',
      },
      {
        title: 'Persoonlijke begeleiding',
        desc: 'Er antwoorden echte mensen, via WhatsApp en per e-mail.',
      },
    ],
  },
  value: {
    eyebrow: 'Waarom het de moeite waard is',
    title: 'Eén abonnement in plaats van drie partijen',
    body: 'Normaal is er iemand nodig die de onderwerpen kiest en schrijft, iemand die alles online zet, en een tool die controleert of het gewerkt heeft. Hier gebeurt alles op dezelfde plek.',
    items: [
      {
        title: 'Het werk wordt gedaan, niet alleen gemeten',
        desc: 'Niet alweer een rapport dat wacht tot iemand handelt. Het platform schrijft en publiceert de artikelen zelf, en alleen over de goedgekeurde onderwerpen.',
      },
      {
        title: 'U ziet precies waarvoor u betaalt',
        desc: 'De gepubliceerde artikelen, de positieveranderingen en de vermeldingen in AI-antwoorden in één dashboard, en in een rapport dat u aan iedereen kunt doorgeven.',
      },
      {
        title: 'Zonder verplichting',
        desc: `${DAYS} dagen proberen zonder creditcard, betaling per maand en opzeggen wanneer u wilt, in het dashboard.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Hoe het gebruik geteld wordt',
    title: 'Geen kleine lettertjes',
    body: 'Drie eenvoudige eenheden, en elk tegoed wordt elke maand vernieuwd.',
    items: [
      {
        title: 'Artikelen',
        desc: 'Een nieuw artikel aanmaken gebruikt één eenheid van het tegoed. Een bestaand artikel bewerken, plannen of publiceren gebruikt niets.',
      },
      {
        title: 'Positiecontrole in Google',
        desc: 'Zien op welke positie een zoekwoord staat, op één plek: in Google of in Google Maps. Hetzelfde zoekwoord in beide telt als twee controles.',
      },
      {
        title: 'Controle van de zichtbaarheid in AI-antwoorden',
        desc: 'Een AI-engine een vraag stellen en zien of het bedrijf genoemd wordt. Dezelfde vraag in ChatGPT en in Gemini telt als twee controles.',
      },
    ],
    note: 'Het artikeltegoed geldt per account. In pakketten met meerdere websites wordt het door alle websites samen gebruikt.',
  },
  faq: {
    eyebrow: 'Vragen',
    title: 'Wat er gevraagd wordt voor het kiezen van een pakket',
    body: 'Uw antwoord niet gevonden? Schrijf ons via WhatsApp.',
    items: [
      {
        q: 'Welk pakket past bij ons?',
        a: `Basic en Advanced zijn bedoeld voor één website, en het wezenlijke verschil ertussen is het aantal artikelen per maand: ${BASIC_ARTICLES} tegenover ${ADVANCED_ARTICLES}. Premium is voor meer dan één website, Agency voor het beheren van websites van klanten. U kunt klein beginnen en het pakket wanneer u wilt wijzigen.`,
      },
      {
        q: 'Wat zit er in de gratis proefperiode?',
        a: `${DAYS} dagen zonder creditcard: één website, tot ${TRIAL_CATALOG.maxKeywordsPerProject} zoekwoorden, tot ${TRIAL_CATALOG.maxGoogleChecksLifetime} positiecontroles in Google, tot ${TRIAL_CATALOG.maxAIChecksLifetime} controles van de zichtbaarheid in AI-antwoorden en één artikel, zodat u het hele verloop ziet, van het begin tot de publicatie.`,
      },
      {
        q: `Wat gebeurt er na de ${DAYS} proefdagen?`,
        a: 'U kiest een pakket en gaat verder waar u gebleven was. Kiest u er geen, dan wordt er niets afgeschreven, want de kaart is nooit gevraagd.',
      },
      {
        q: 'Kunnen wij van pakket wisselen of opzeggen?',
        a: 'Ja. Van pakket wisselt u wanneer u wilt, en de nieuwe tegoeden gelden vanaf dat moment. Opzeggen gebeurt in het dashboard, zonder boete en zonder opzegkosten.',
      },
      {
        q: 'Wat gebeurt er met artikelen die wij niet gebruiken?',
        a: 'Het tegoed wordt elke maand vernieuwd, en niet gebruikte artikelen gaan niet mee naar de volgende maand.',
      },
      {
        q: 'Starten de analyses van zelf?',
        a: 'Een handmatige analyse kunt u wanneer u wilt starten, of u zet een automatische maandelijkse analyse aan die elke maand van zelf loopt. Een automatische dagelijkse of wekelijkse analyse is er op dit moment niet.',
      },
      {
        q: 'Kunnen artikelen gepland en automatisch gepubliceerd worden?',
        a: 'Ja. Een artikel plant u op een datum in de toekomst, of u publiceert het direct op een verbonden website: WordPress, Shopify of Wix.',
      },
      {
        q: 'Hoe zijn onze gegevens beschermd?',
        a: 'Al het verkeer is versleuteld (SSL/TLS), wachtwoorden worden versleuteld opgeslagen, en elk account ziet alleen zijn eigen gegevens. De gegevens worden alleen gedeeld met de dienstverleners waarop het platform draait — hosting, betalingen en zoekdata — overeenkomstig de privacyverklaring.',
        // The privacy policy exists in this language (content/legal/nl, rendered
        // by app/(public)/nl/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: 'Privacyverklaring lezen', href: '/nl/privacy' },
      },
    ],
  },
  cta: {
    title: 'Wilt u eerst zien wat het platform op uw website vindt?',
    body: `De gratis analyse leest uw website en levert een eerste samenvatting, zonder registratie. Of u start ${DAYS} proefdagen en probeert alles uit.`,
    check: 'Mijn website gratis analyseren',
    trial: 'Gratis proberen',
    dashboard: 'Mijn dashboard',
  },
}
