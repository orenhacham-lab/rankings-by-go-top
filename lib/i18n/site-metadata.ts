/**
 * The document's own metadata, per locale. PURE — no Next, no React.
 *
 * The root layout exported ONE static Hebrew `metadata` object, so an English
 * document shipped a Hebrew <title>, description, keywords and og:locale. The
 * page said `lang="en"` and the tab said Hebrew; a share card and a search
 * result did too. Localizing the document without localizing what describes it
 * is only half a language contract.
 *
 * The Hebrew strings are the previous constants, unchanged byte for byte, so
 * Hebrew visitors and every already-indexed Hebrew URL see exactly what they
 * saw before.
 */

import type { PublicLocale } from './locales'

export interface SiteMetadataStrings {
  title: string
  description: string
  keywords: string
  ogTitle: string
  ogDescription: string
  ogLocale: string
}

const SITE_METADATA: Record<PublicLocale, SiteMetadataStrings> = {
  he: {
    title: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO | Go Top SEO',
    description: 'Go Top SEO - יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity). להרשמה בחינם כנסו עכשיו',
    keywords: 'יצירת תוכן SEO, תזמון תוכן, פרסום תוכן, GEO, מעקב מיקומים, קידום אתרים, SEO, גוגל, דירוג, מפות גוגל, AI visibility, ChatGPT, Gemini',
    ogTitle: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO - Go Top SEO',
    ogDescription: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'he_IL',
  },
  en: {
    title: 'Create, schedule and publish SEO & GEO content | Go Top SEO',
    description: 'Go Top SEO — create, schedule and publish SEO and GEO content from one place, alongside Google rank tracking and visibility in AI answers (ChatGPT, Gemini, Perplexity). Start free.',
    keywords: 'SEO content creation, content scheduling, content publishing, GEO, rank tracking, SEO, Google, rankings, Google Maps, AI visibility, ChatGPT, Gemini',
    ogTitle: 'Create, schedule and publish SEO & GEO content — Go Top SEO',
    ogDescription: 'Create, schedule and publish SEO and GEO content from one place, alongside Google rank tracking and visibility in AI answers (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'en_US',
  },
  es: {
    title: 'Crea, programa y publica contenido SEO y GEO | Go Top SEO',
    description: 'Go Top SEO: crea, programa y publica contenido SEO y GEO desde un solo lugar, con seguimiento de posiciones en Google y visibilidad en las respuestas de la IA (ChatGPT, Gemini, Perplexity). Empieza gratis.',
    keywords: 'creación de contenido SEO, programación de contenido, publicación de contenido, GEO, seguimiento de posiciones, SEO, Google, posicionamiento, Google Maps, visibilidad en IA, ChatGPT, Gemini',
    ogTitle: 'Crea, programa y publica contenido SEO y GEO — Go Top SEO',
    ogDescription: 'Crea, programa y publica contenido SEO y GEO desde un solo lugar, con seguimiento de posiciones en Google y visibilidad en las respuestas de la IA (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'es_ES',
  },
  'pt-BR': {
    title: 'Crie, agende e publique conteúdo de SEO e GEO | Go Top SEO',
    description: 'Go Top SEO: crie, agende e publique conteúdo de SEO e GEO em um só lugar, com monitoramento de posições no Google e visibilidade nas respostas da IA (ChatGPT, Gemini, Perplexity). Comece de graça.',
    keywords: 'criação de conteúdo SEO, agendamento de conteúdo, publicação de conteúdo, GEO, monitoramento de posições, SEO, Google, rankeamento, Google Maps, visibilidade em IA, ChatGPT, Gemini',
    ogTitle: 'Crie, agende e publique conteúdo de SEO e GEO — Go Top SEO',
    ogDescription: 'Crie, agende e publique conteúdo de SEO e GEO em um só lugar, com monitoramento de posições no Google e visibilidade nas respostas da IA (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'pt_BR',
  },
  fr: {
    title: 'Créez, planifiez et publiez du contenu SEO et GEO | Go Top SEO',
    description: 'Go Top SEO : créez, planifiez et publiez du contenu SEO et GEO, avec suivi de position sur Google et visibilité dans les IA. Commencez gratuitement.',
    keywords: 'création de contenu SEO, planification de contenu, publication de contenu, GEO, suivi de position, référencement naturel, SEO, Google, classement, Google Maps, visibilité dans les IA, ChatGPT, Gemini',
    ogTitle: 'Créez, planifiez et publiez du contenu SEO et GEO — Go Top SEO',
    ogDescription: 'Créez, planifiez et publiez du contenu SEO et GEO depuis un seul endroit, avec suivi de position sur Google et visibilité dans les IA (ChatGPT, Gemini, Google AI)',
    ogLocale: 'fr_FR',
  },
  it: {
    title: 'Crea, pianifica e pubblica contenuti SEO e GEO | Go Top SEO',
    description: 'Go Top SEO: creazione, pianificazione e pubblicazione di contenuti SEO e GEO, con monitoraggio mensile delle posizioni su Google e visibilità nelle IA. Per iniziare gratuitamente.',
    keywords: 'creazione di contenuti SEO, pianificazione dei contenuti, pubblicazione dei contenuti, GEO, monitoraggio delle posizioni, posizionamento sui motori di ricerca, SEO, Google, classifica, Google Maps, visibilità nelle IA, ChatGPT, Gemini',
    ogTitle: 'Crea, pianifica e pubblica contenuti SEO e GEO — Go Top SEO',
    ogDescription: 'Creazione, pianificazione e pubblicazione di contenuti SEO e GEO da un unico punto, con monitoraggio mensile delle posizioni su Google e visibilità nelle IA (ChatGPT, Gemini, Google AI Mode)',
    ogLocale: 'it_IT',
  },
  ja: {
    title: 'SEO・GEOコンテンツの作成、計画、公開 | Go Top SEO',
    description: 'Go Top SEO は、SEOとGEOのコンテンツ作成・計画・公開を一つのシステムで行い、Googleの検索順位とAIでの見え方を毎月記録します。無料でお試しいただけます。',
    keywords: 'SEOコンテンツ作成, コンテンツ計画, 記事の自動公開, GEO, 検索順位の計測, 検索エンジン最適化, SEO, Google, 順位, Googleマップ, AIでの見え方, ChatGPT, Gemini',
    ogTitle: 'SEO・GEOコンテンツの作成、計画、公開 — Go Top SEO',
    ogDescription: 'SEOとGEOのコンテンツ作成・計画・公開を一つの画面から。Googleの検索順位とAI（ChatGPT、Gemini、Google AI モード）での見え方を毎月記録します。',
    ogLocale: 'ja_JP',
  },
}

export function getSiteMetadata(locale: PublicLocale): SiteMetadataStrings {
  return SITE_METADATA[locale] ?? SITE_METADATA.he
}
