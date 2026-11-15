/**
 * The hub page's own two lines, per language: the sentence under its heading
 * and the description search engines read. Everything else on /features — its
 * heading, the three group titles, and every feature's label and description —
 * is the nav menu's own wording (`nav.features`, `nav.featureGroups`,
 * `nav.featuresMenu`), so the hub and the menu can never say different things.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type FeaturesIndexCopy = { subtitle: string; metaDescription: string }

export const FEATURES_INDEX_COPY: Record<PublicLocale, FeaturesIndexCopy> = {
  he: {
    subtitle: 'כל מה שהמערכת עושה, במקום אחד: מה היא מודדת בגוגל, בגוגל מפות ובמנועי ה-AI, איזו עבודה היא עושה באתר ובפרופיל העסק, ואיך התוצאות מוצגות.',
    metaDescription: 'כל היכולות של Go Top SEO: מעקב מיקומים בגוגל ובגוגל מפות, נראות במנועי AI, מחקר ביטויים, כתיבה ופרסום תוכן, תיקוני אתר, פוסטים בגוגל מפות ודוחות.',
  },
  en: {
    subtitle: 'Everything the system does, in one place: what it measures in Google, Google Maps and the AI engines, the work it does on your site and your business profile, and how the results are shown.',
    metaDescription: 'Every Go Top SEO feature: rank tracking in Google and Google Maps, AI visibility, keyword research, content writing and publishing, site fixes, Google Maps posts and reports.',
  },
  es: {
    subtitle: 'Todo lo que hace el sistema, en un solo lugar: qué mide en Google, en Google Maps y en los motores de IA, qué trabajo hace en tu sitio y en tu perfil de empresa, y cómo se presentan los resultados.',
    metaDescription: 'Todas las funciones de Go Top SEO: seguimiento de posiciones en Google y Google Maps, visibilidad en IA, investigación de palabras clave, creación y publicación de contenido, correcciones del sitio, publicaciones en Google Maps e informes.',
  },
  'pt-BR': {
    subtitle: 'Tudo o que o sistema faz, em um só lugar: o que ele mede no Google, no Google Maps e nos motores de IA, o trabalho que faz no seu site e no seu perfil da empresa, e como os resultados são apresentados.',
    metaDescription: 'Todos os recursos do Go Top SEO: monitoramento de posições no Google e no Google Maps, visibilidade em IA, pesquisa de palavras-chave, criação e publicação de conteúdo, correções no site, posts no Google Maps e relatórios.',
  },
  fr: {
    subtitle: "Tout ce que fait le système, au même endroit : ce qu'il mesure dans Google, dans Google Maps et dans les moteurs d'IA, le travail qu'il réalise sur votre site et sur votre fiche d'établissement, et la façon dont les résultats sont présentés.",
    metaDescription: "Toutes les fonctionnalités de Go Top SEO : suivi des positions dans Google et Google Maps, visibilité dans l'IA, recherche de mots-clés, rédaction et publication de contenu, corrections du site, posts Google Maps et rapports.",
  },
  it: {
    subtitle: 'Tutto ciò che fa il sistema, in un unico posto: che cosa misura su Google, su Google Maps e nei motori di IA, quale lavoro svolge sul tuo sito e sul profilo dell\'attività, e come vengono presentati i risultati.',
    metaDescription: 'Tutte le funzionalità di Go Top SEO: monitoraggio delle posizioni su Google e Google Maps, visibilità nell\'IA, ricerca di parole chiave, scrittura e pubblicazione di contenuti, correzioni del sito, post su Google Maps e report.',
  },
  ja: {
    subtitle: 'このシステムができることを、1ページにまとめました。Google、Google マップ、AI エンジンで何を測るのか、サイトとビジネス プロフィールにどんな作業をするのか、そして結果をどう見せるのかです。',
    metaDescription: 'Go Top SEO のすべての機能: Google と Google マップの順位計測、AI での引用状況、キーワード調査、記事の作成と公開、サイトの修正、Google マップへの投稿、レポート。',
  },
  de: {
    subtitle: 'Alles, was das System tut, an einer Stelle: was es in Google, in Google Maps und in den KI-Engines misst, welche Arbeit es auf Ihrer Website und in Ihrem Unternehmensprofil erledigt, und wie die Ergebnisse gezeigt werden.',
    metaDescription: 'Alle Funktionen von Go Top SEO: Rankings in Google und Google Maps, Sichtbarkeit in der KI, Keyword-Recherche, Inhalte schreiben und veröffentlichen, Website-Korrekturen, Google-Maps-Beiträge und Berichte.',
  },
  nl: {
    subtitle: 'Alles wat het systeem doet, op één plek: wat het meet in Google, in Google Maps en in de AI-engines, welk werk het doet op uw site en in uw bedrijfsprofiel, en hoe de resultaten worden getoond.',
    metaDescription: 'Alle functies van Go Top SEO: posities volgen in Google en Google Maps, zichtbaarheid in AI, zoekwoordonderzoek, content schrijven en publiceren, sitecorrecties, Google Maps-berichten en rapporten.',
  },
  pl: {
    subtitle: 'Wszystko, co robi system, w jednym miejscu: co mierzy w Google, w Mapach Google i w silnikach AI, jaką pracę wykonuje na Twojej stronie i w profilu firmy oraz jak pokazuje wyniki.',
    metaDescription: 'Wszystkie funkcje Go Top SEO: monitorowanie pozycji w Google i Mapach Google, widoczność w AI, badanie słów kluczowych, pisanie i publikowanie treści, poprawki na stronie, posty w Mapach Google i raporty.',
  },
  ko: {
    subtitle: '시스템이 하는 일을 한 곳에 모았습니다. 구글과 구글 지도, AI 엔진에서 무엇을 측정하는지, 사이트와 비즈니스 프로필에서 어떤 작업을 하는지, 그리고 결과를 어떻게 보여주는지입니다.',
    metaDescription: 'Go Top SEO의 모든 기능: 구글과 구글 지도 순위 추적, AI 노출 확인, 키워드 조사, 콘텐츠 작성과 발행, 사이트 수정, 구글 지도 게시물, 보고서.',
  },
}
