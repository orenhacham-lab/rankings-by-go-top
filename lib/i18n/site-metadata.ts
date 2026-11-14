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
  nl: {
    title: 'SEO- en GEO-content maken, plannen en publiceren | Go Top SEO',
    description: 'Go Top SEO: SEO- en GEO-content op één plek maken, plannen en automatisch publiceren, plus maandelijkse monitoring van uw Google-posities en uw zichtbaarheid in AI-antwoorden. Gratis starten.',
    keywords: 'SEO content maken, contentplanning, artikelen automatisch publiceren, GEO, posities checken, zoekmachineoptimalisatie, SEO, Google, rankings, Google Maps, Google Bedrijfsprofiel, lokale SEO, seo lokaal, zichtbaarheid in AI, ChatGPT, Gemini, backlinks checken, zoekwoordenonderzoek',
    ogTitle: 'SEO- en GEO-content maken, plannen en publiceren — Go Top SEO',
    ogDescription: 'SEO- en GEO-content op één plek maken, plannen en automatisch publiceren, met maandelijkse monitoring van uw Google-posities en uw zichtbaarheid in AI-antwoorden (ChatGPT, Gemini, Google AI-modus)',
    ogLocale: 'nl_NL',
  },
  pl: {
    title: 'Tworzenie, planowanie i publikowanie treści SEO i GEO | Go Top SEO',
    description: 'Go Top SEO: tworzenie, planowanie i automatyczne publikowanie treści SEO i GEO w jednym miejscu, a do tego comiesięczne monitorowanie pozycji w Google i widoczności w odpowiedziach AI. Zacznij bezpłatnie.',
    keywords: 'tworzenie treści SEO, planowanie treści, automatyczne publikowanie artykułów, GEO, sprawdzanie pozycji, pozycjonowanie stron, SEO, Google, pozycje w Google, Mapy Google, Profil Firmy w Google, wizytówka Google, SEO lokalne, widoczność w AI, ChatGPT, Gemini, linki zwrotne, analiza słów kluczowych',
    ogTitle: 'Tworzenie, planowanie i publikowanie treści SEO i GEO — Go Top SEO',
    ogDescription: 'Tworzenie, planowanie i automatyczne publikowanie treści SEO i GEO w jednym miejscu, z comiesięcznym monitorowaniem pozycji w Google i widoczności w odpowiedziach AI (ChatGPT, Gemini, tryb AI w Google)',
    ogLocale: 'pl_PL',
  },
  ko: {
    title: 'SEO·GEO 콘텐츠 작성, 예약, 발행 | Go Top SEO',
    description: 'Go Top SEO는 SEO와 GEO 콘텐츠를 한곳에서 작성하고 예약하고 자동으로 발행하며, Google 검색 순위와 AI 답변에서의 가시성을 매달 측정합니다. 무료로 시작해 보십시오.',
    keywords: 'SEO 콘텐츠 작성, 콘텐츠 기획, 글 자동 발행, GEO, 검색 순위 확인, 검색엔진 최적화, SEO, Google, Google 순위, Google 지도, Google 비즈니스 프로필, 로컬 SEO, AI 가시성, ChatGPT, Gemini, 백링크, 키워드 분석, 네이버 SEO',
    ogTitle: 'SEO·GEO 콘텐츠 작성, 예약, 발행 — Go Top SEO',
    ogDescription: 'SEO와 GEO 콘텐츠를 한곳에서 작성하고 예약하고 자동으로 발행하며, Google 검색 순위와 AI 답변(ChatGPT, Gemini, Google AI 모드)에서의 가시성을 매달 측정합니다',
    ogLocale: 'ko_KR',
  },
  de: {
    title: 'SEO- und GEO-Inhalte erstellen, planen und veröffentlichen | Go Top SEO',
    description: 'Go Top SEO: SEO- und GEO-Inhalte an einer Stelle erstellen, planen und automatisch veröffentlichen, dazu monatliches Ranking-Tracking bei Google und die Sichtbarkeit in KI-Antworten. Kostenlos starten.',
    keywords: 'SEO Inhalte erstellen, Content-Planung, Beiträge automatisch veröffentlichen, GEO, Ranking prüfen, Suchmaschinenoptimierung, SEO, Google, Ranking, Google Maps, Google Unternehmensprofil optimieren, Local SEO, Sichtbarkeit in KI, ChatGPT, Gemini',
    ogTitle: 'SEO- und GEO-Inhalte erstellen, planen und veröffentlichen — Go Top SEO',
    ogDescription: 'SEO- und GEO-Inhalte an einer Stelle erstellen, planen und automatisch veröffentlichen, mit monatlichem Ranking-Tracking bei Google und der Sichtbarkeit in KI-Antworten (ChatGPT, Gemini, Google AI Modus)',
    ogLocale: 'de_DE',
  },
}

export function getSiteMetadata(locale: PublicLocale): SiteMetadataStrings {
  return SITE_METADATA[locale] ?? SITE_METADATA.he
}
