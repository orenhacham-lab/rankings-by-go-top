/**
 * The "one system" hero: website + Google Maps + Facebook and Instagram.
 *
 * OFF until posting to Facebook and Instagram is live in every language
 * (PR 526). The old hero says nothing about social posting, because a page may
 * not claim what the product cannot do yet. On launch day flip the flag; the
 * copy below is already in all 11 languages. Customers never read "Meta".
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export const ONE_SYSTEM_HERO_LIVE = false

export type OneSystemHeroCopy = {
  eyebrow: string
  title: string
  accent: string
  subtitle: string
  /** The three channel cards, in order: site, Google Maps, Facebook and Instagram. */
  channels: [
    { name: string; status: string },
    { name: string; status: string },
    { name: string; status: string },
  ]
  /** The one line under the cards: it is a single calendar. */
  calendar: string
  /** Under the cards: the names are examples. */
  caption: string
}

export const ONE_SYSTEM_HERO: Record<PublicLocale, OneSystemHeroCopy> = {
  en: {
    eyebrow: 'Website, Google Maps and social media, in one system',
    title: 'Your website, Google Maps and social media.',
    accent: 'One system that keeps them all fresh.',
    subtitle: 'Go Top SEO writes and publishes articles on your site, posts to Google Maps, Facebook and Instagram, and shows you where you appear in Google and ChatGPT. No content team. No juggling tools.',
    channels: [
      { name: 'Your website', status: 'Article published' },
      { name: 'Google Maps', status: 'Post scheduled' },
      { name: 'Facebook and Instagram', status: 'Post scheduled' },
    ],
    calendar: 'One content calendar for all three',
    caption: 'Illustration. Names and content are examples.',
  },
  he: {
    eyebrow: 'אתר, גוגל מפות ורשתות חברתיות, במערכת אחת',
    title: 'האתר, גוגל מפות והרשתות החברתיות שלכם.',
    accent: 'מערכת אחת שמעדכנת את כולם.',
    subtitle: 'Go Top SEO כותבת ומפרסמת מאמרים באתר, מפרסמת פוסטים בגוגל מפות, בפייסבוק ובאינסטגרם, ומראה לכם איפה אתם מופיעים בגוגל וב-ChatGPT. בלי צוות תוכן. בלי לרוץ בין כלים.',
    channels: [
      { name: 'האתר שלכם', status: 'מאמר פורסם' },
      { name: 'גוגל מפות', status: 'פוסט מתוזמן' },
      { name: 'פייסבוק ואינסטגרם', status: 'פוסט מתוזמן' },
    ],
    calendar: 'יומן תוכן אחד לשלושתם',
    caption: 'הדגמה. השמות והתוכן הם דוגמאות.',
  },
  es: {
    eyebrow: 'Sitio web, Google Maps y redes sociales, en un solo sistema',
    title: 'Tu sitio web, Google Maps y tus redes sociales.',
    accent: 'Un solo sistema que los mantiene al día.',
    subtitle: 'Go Top SEO escribe y publica artículos en tu sitio, publica en Google Maps, Facebook e Instagram, y te muestra dónde apareces en Google y en ChatGPT. Sin equipo de contenido. Sin saltar entre herramientas.',
    channels: [
      { name: 'Tu sitio web', status: 'Artículo publicado' },
      { name: 'Google Maps', status: 'Publicación programada' },
      { name: 'Facebook e Instagram', status: 'Publicación programada' },
    ],
    calendar: 'Un solo calendario de contenido para los tres',
    caption: 'Ilustración. Los nombres y el contenido son ejemplos.',
  },
  'pt-BR': {
    eyebrow: 'Site, Google Maps e redes sociais, em um só sistema',
    title: 'Seu site, o Google Maps e as redes sociais.',
    accent: 'Um só sistema que mantém tudo atualizado.',
    subtitle: 'O Go Top SEO escreve e publica artigos no seu site, posta no Google Maps, no Facebook e no Instagram, e mostra onde você aparece no Google e no ChatGPT. Sem equipe de conteúdo. Sem alternar entre ferramentas.',
    channels: [
      { name: 'Seu site', status: 'Artigo publicado' },
      { name: 'Google Maps', status: 'Post agendado' },
      { name: 'Facebook e Instagram', status: 'Post agendado' },
    ],
    calendar: 'Um só calendário de conteúdo para os três',
    caption: 'Ilustração. Nomes e conteúdo são exemplos.',
  },
  fr: {
    eyebrow: 'Site web, Google Maps et réseaux sociaux, dans un seul système',
    title: 'Votre site, Google Maps et vos réseaux sociaux.',
    accent: 'Un seul système qui garde tout à jour.',
    subtitle: 'Go Top SEO rédige et publie des articles sur votre site, publie sur Google Maps, Facebook et Instagram, et vous montre où vous apparaissez dans Google et ChatGPT. Pas d’équipe de contenu. Pas de jonglage entre outils.',
    channels: [
      { name: 'Votre site', status: 'Article publié' },
      { name: 'Google Maps', status: 'Publication programmée' },
      { name: 'Facebook et Instagram', status: 'Publication programmée' },
    ],
    calendar: 'Un seul calendrier de contenu pour les trois',
    caption: 'Illustration. Les noms et le contenu sont des exemples.',
  },
  it: {
    eyebrow: 'Sito web, Google Maps e social, in un unico sistema',
    title: 'Il Suo sito, Google Maps e i social.',
    accent: 'Un unico sistema che li tiene tutti aggiornati.',
    subtitle: 'Go Top SEO scrive e pubblica articoli sul Suo sito, pubblica su Google Maps, Facebook e Instagram, e Le mostra dove compare in Google e in ChatGPT. Niente team di contenuti. Niente strumenti da rincorrere.',
    channels: [
      { name: 'Il Suo sito', status: 'Articolo pubblicato' },
      { name: 'Google Maps', status: 'Post programmato' },
      { name: 'Facebook e Instagram', status: 'Post programmato' },
    ],
    calendar: 'Un unico calendario dei contenuti per tutti e tre',
    caption: 'Illustrazione. Nomi e contenuti sono esempi.',
  },
  ja: {
    eyebrow: 'Webサイト、Googleマップ、SNSをひとつのシステムで',
    title: 'Webサイトも、Googleマップも、SNSも。',
    accent: 'ひとつのシステムで、すべて最新に。',
    subtitle: 'Go Top SEOは、サイトへの記事の作成と公開、Googleマップ、Facebook、Instagramへの投稿を行い、GoogleとChatGPTでの表示状況をお見せします。コンテンツ担当のチームも、複数ツールの使い分けも不要です。',
    channels: [
      { name: 'Webサイト', status: '記事を公開しました' },
      { name: 'Googleマップ', status: '投稿を予約しました' },
      { name: 'FacebookとInstagram', status: '投稿を予約しました' },
    ],
    calendar: '3つをひとつのコンテンツカレンダーで管理',
    caption: 'イメージです。名称と内容は例です。',
  },
  de: {
    eyebrow: 'Website, Google Maps und Social Media in einem System',
    title: 'Ihre Website, Google Maps und Social Media.',
    accent: 'Ein System, das alles aktuell hält.',
    subtitle: 'Go Top SEO schreibt und veröffentlicht Artikel auf Ihrer Website, postet bei Google Maps, Facebook und Instagram und zeigt Ihnen, wo Sie in Google und ChatGPT erscheinen. Kein Content-Team. Kein Wechsel zwischen Werkzeugen.',
    channels: [
      { name: 'Ihre Website', status: 'Artikel veröffentlicht' },
      { name: 'Google Maps', status: 'Beitrag geplant' },
      { name: 'Facebook und Instagram', status: 'Beitrag geplant' },
    ],
    calendar: 'Ein Redaktionskalender für alle drei',
    caption: 'Illustration. Namen und Inhalte sind Beispiele.',
  },
  nl: {
    eyebrow: 'Website, Google Maps en social media in één systeem',
    title: 'Uw website, Google Maps en social media.',
    accent: 'Eén systeem dat alles actueel houdt.',
    subtitle: 'Go Top SEO schrijft en publiceert artikelen op uw site, plaatst berichten op Google Maps, Facebook en Instagram, en laat zien waar u verschijnt in Google en ChatGPT. Geen contentteam. Geen gesjor met tools.',
    channels: [
      { name: 'Uw website', status: 'Artikel gepubliceerd' },
      { name: 'Google Maps', status: 'Bericht ingepland' },
      { name: 'Facebook en Instagram', status: 'Bericht ingepland' },
    ],
    calendar: 'Eén contentkalender voor alle drie',
    caption: 'Illustratie. Namen en inhoud zijn voorbeelden.',
  },
  pl: {
    eyebrow: 'Strona, Mapy Google i media społecznościowe w jednym systemie',
    title: 'Państwa strona, Mapy Google i social media.',
    accent: 'Jeden system, który wszystko aktualizuje.',
    subtitle: 'Go Top SEO pisze i publikuje artykuły na stronie, dodaje posty w Mapach Google, na Facebooku i Instagramie oraz pokazuje, gdzie firma pojawia się w Google i ChatGPT. Bez zespołu od treści. Bez żonglowania narzędziami.',
    channels: [
      { name: 'Państwa strona', status: 'Artykuł opublikowany' },
      { name: 'Mapy Google', status: 'Post zaplanowany' },
      { name: 'Facebook i Instagram', status: 'Post zaplanowany' },
    ],
    calendar: 'Jeden kalendarz treści dla wszystkich trzech',
    caption: 'Ilustracja. Nazwy i treści są przykładami.',
  },
  ko: {
    eyebrow: '웹사이트, 구글 지도, SNS를 하나의 시스템으로',
    title: '웹사이트, 구글 지도, SNS까지.',
    accent: '하나의 시스템이 모두 최신으로 유지합니다.',
    subtitle: 'Go Top SEO가 사이트에 글을 작성해 발행하고, 구글 지도와 Facebook, Instagram에 게시하며, Google과 ChatGPT에서 어디에 노출되는지 보여 드립니다. 콘텐츠 팀도, 여러 도구를 오가는 수고도 필요 없습니다.',
    channels: [
      { name: '웹사이트', status: '글 발행 완료' },
      { name: '구글 지도', status: '게시물 예약됨' },
      { name: 'Facebook과 Instagram', status: '게시물 예약됨' },
    ],
    calendar: '세 곳을 하나의 콘텐츠 캘린더로',
    caption: '예시 화면입니다. 이름과 내용은 예시입니다.',
  },
}
