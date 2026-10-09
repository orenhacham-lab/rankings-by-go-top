/**
 * The "who it's for" pages, in four languages: business owners, agencies,
 * WordPress sites and Shopify stores. Shopify had no page of ours until w11 —
 * its menu item went straight to the App Store — and the owner asked for one
 * with real content; the listing is still the only way in, so every link out to
 * Shopify from here goes through SHOPIFY_APP_STORE_URL with rel="nofollow"
 * (lib/public-links/shopify-app-store.ts).
 *
 * Every claim maps to code: monthly automatic scans (manual anytime), the AI
 * check on ChatGPT, Gemini and Google AI, publishing to WordPress, Shopify and
 * Wix (lib/site-platforms), one project per site grouped under clients, PDF and
 * Excel reports with the site icon, the plan's article allowance shared across
 * sites with a per-site split, and WordPress fixes with preview, approval and
 * undo (lib/site-fix). No numbers, percentages or outcomes are promised.
 */
import {
  BarChart3, Briefcase, CalendarClock, FileText, FolderKanban, Image as ImageIcon, Info, MapPin, PieChart,
  Search, ShieldCheck, Sparkles, Store, Tags, Type, Wrench, Blocks,
} from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { SHOPIFY_APP_STORE_URL } from '@/lib/public-links/shopify-app-store'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']

// ── Business owners ───────────────────────────────────────────────────────────

export const BUSINESSES_PAGE: MarketingPage = {
  path: '/solutions/businesses',
  meta: {
    he: {
      title: 'לבעלי עסקים | Go Top SEO',
      description: 'מערכת אחת שכותבת ומפרסמת מאמרים לאתר, בודקת איפה העסק מופיע בגוגל ובגוגל מפות, ובודקת אם ChatGPT, Gemini ו-Google AI מזכירים אותו.',
    },
    en: {
      title: 'For Business Owners | Go Top SEO',
      description: 'One system that writes and publishes articles to your site, checks where your business appears in Google and Google Maps, and checks whether ChatGPT, Gemini and Google AI mention it.',
    },
    es: {
      title: 'Para dueños de negocios | Go Top SEO',
      description: 'Un solo sistema que escribe y publica artículos en tu sitio, comprueba dónde aparece tu negocio en Google y Google Maps, y si ChatGPT, Gemini y Google AI lo mencionan.',
    },
    'pt-BR': {
      title: 'Para donos de negócios | Go Top SEO',
      description: 'Um só sistema que escreve e publica artigos no seu site, verifica onde o seu negócio aparece no Google e no Google Maps, e se o ChatGPT, o Gemini e o Google AI o mencionam.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'לבעלי עסקים',
        eyebrowIcon: Store,
        title: 'כותבים, מפרסמים ומודדים,',
        accent: 'בשבילכם, כל חודש',
        subtitle: 'מאמרים על מה שהלקוחות שלכם מחפשים, שמתפרסמים ישירות לאתר. בדיקה איפה העסק מופיע בגוגל ובגוגל מפות, ובדיקה אם ChatGPT, Gemini ו-Google AI מזכירים אותו. בלי לנהל ספקים ובלי ללמוד SEO.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="החודש שלכם במערכת"
            rows={[
              { title: 'מאמר חדש פורסם', detail: 'איך בוחרים מזגן לסלון', icon: FileText, done: true, status: 'פורסם' },
              { title: 'בדיקת מיקומים', detail: 'גוגל וגוגל מפות', icon: Search, done: true, status: 'הושלמה' },
              { title: 'בדיקת נראות ב-AI', detail: 'ChatGPT, Gemini, Google AI', icon: Sparkles, done: true, status: 'הושלמה' },
              { title: 'המאמר הבא', detail: 'מחיר התקנת מזגן', icon: CalendarClock, done: false, status: 'מתוזמן' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה המערכת עושה בשבילכם',
          title: 'העבודה שבדרך כלל מחולקת בין כמה ספקים',
          items: [
            { icon: FileText, title: 'תוכן שמביא חיפושים', body: 'המערכת בוחרת נושאים לפי מה שמחפשים בתחום שלכם, כותבת מאמרים ומפרסמת אותם לאתר בקצב של התוכנית.' },
            { icon: MapPin, title: 'מדידה שאפשר לסמוך עליה', body: 'איפה האתר מופיע בגוגל ובגוגל מפות לכל ביטוי, ואם מנועי AI מזכירים את העסק.' },
            { icon: Wrench, title: 'אתר בלי תקלות', body: 'סריקת האתר מוצאת מה מפריע לגוגל. בוורדפרס מתקנים בלחיצה, אחרי שאישרתם.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך מתחילים',
          title: 'שלושה צעדים, והמערכת עובדת',
          items: [
            { title: 'מכניסים את כתובת האתר', body: 'המערכת קוראת את האתר ומכינה הגדרות, אסטרטגיית תוכן ורעיונות לביטויים.' },
            { title: 'מחברים את האתר', body: 'וורדפרס, שופיפיי או וויקס. המאמרים יתפרסמו ישירות אליו.' },
            { title: 'עוקבים אחרי התוצאות', body: 'בדיקת מיקומים ונראות אוטומטית פעם בחודש, ובדיקה ידנית בכל רגע. הכול במקום אחד.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות נפוצות',
          title: 'מה בעלי עסקים שואלים',
          items: [
            { q: 'צריך לדעת SEO?', a: 'לא. המערכת מציעה נושאים, כותבת ומפרסמת. אפשר לעבור על כל מאמר ולשנות אותו לפני שהוא עולה.' },
            { q: 'זה מתאים גם לעסק מקומי?', a: 'כן. מעקב המיקום בגוגל מפות בודק איפה העסק מופיע בחיפוש מקומי, לפי עיר או אזור.' },
            { q: 'כמה מאמרים מקבלים בחודש?', a: 'זה תלוי בתוכנית. כל התוכניות והמכסות מפורטות בעמוד המחירים.' },
          ],
        },
      ],
      cta: { title: 'תראו קודם מה המערכת רואה באתר שלכם', body: he.closeBody, primary: he.check, secondary: he.trial },
    },
    en: {
      hero: {
        eyebrow: 'For business owners',
        eyebrowIcon: Store,
        title: 'Written, published and measured,',
        accent: 'for you, every month',
        subtitle: 'Articles on what your customers search for, published straight to your site. A check on where your business appears in Google and Google Maps, and whether ChatGPT, Gemini and Google AI mention it. No vendors to manage and no SEO to learn.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="Your month in the system"
            rows={[
              { title: 'New article published', detail: 'How to choose a living-room AC', icon: FileText, done: true, status: 'Published' },
              { title: 'Rank check', detail: 'Google and Google Maps', icon: Search, done: true, status: 'Done' },
              { title: 'AI visibility check', detail: 'ChatGPT, Gemini, Google AI', icon: Sparkles, done: true, status: 'Done' },
              { title: 'Next article', detail: 'AC installation cost', icon: CalendarClock, done: false, status: 'Scheduled' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What the system does for you',
          title: 'The work usually split across several vendors',
          items: [
            { icon: FileText, title: 'Content that brings searches', body: 'The system picks topics from what people search for in your field, writes the articles and publishes them to your site at your plan\'s pace.' },
            { icon: MapPin, title: 'Measurement you can trust', body: 'Where your site appears in Google and Google Maps for each keyword, and whether AI engines mention your business.' },
            { icon: Wrench, title: 'A site without blockers', body: 'The site scan finds what holds you back in Google. On WordPress you fix it in one click, after you approve.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Getting started',
          title: 'Three steps, and the system is working',
          items: [
            { title: 'Enter your site address', body: 'The system reads your site and prepares settings, a content strategy and keyword ideas.' },
            { title: 'Connect your site', body: 'WordPress, Shopify or Wix. Articles are published straight to it.' },
            { title: 'Follow the results', body: 'Rank and visibility checks run automatically once a month, and manually whenever you like. All in one place.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'FAQ',
          title: 'What business owners ask',
          items: [
            { q: 'Do I need to know SEO?', a: 'No. The system suggests topics, writes and publishes. You can review and edit any article before it goes live.' },
            { q: 'Does it work for a local business?', a: 'Yes. Google Maps rank tracking checks where your business appears in local search, by city or area.' },
            { q: 'How many articles do I get a month?', a: 'It depends on the plan. Every plan and its allowances are on the pricing page.' },
          ],
        },
      ],
      cta: { title: 'First, see what the system sees on your site', body: en.closeBody, primary: en.check, secondary: en.trial },
    },
    es: {
      hero: {
        eyebrow: 'Para dueños de negocios',
        eyebrowIcon: Store,
        title: 'Escribimos, publicamos y medimos,',
        accent: 'por ti, cada mes',
        subtitle: 'Artículos sobre lo que buscan tus clientes, publicados directamente en tu sitio. Una comprobación de dónde aparece tu negocio en Google y Google Maps, y de si ChatGPT, Gemini y Google AI lo mencionan. Sin proveedores que gestionar y sin aprender SEO.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Tu mes en el sistema"
            rows={[
              { title: 'Nuevo artículo publicado', detail: 'Cómo elegir un aire acondicionado para el salón', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Revisión de posiciones', detail: 'Google y Google Maps', icon: Search, done: true, status: 'Completada' },
              { title: 'Revisión de visibilidad en IA', detail: 'ChatGPT, Gemini, Google AI', icon: Sparkles, done: true, status: 'Completada' },
              { title: 'Próximo artículo', detail: 'Precio de instalación de aire acondicionado', icon: CalendarClock, done: false, status: 'Programado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Lo que el sistema hace por ti',
          title: 'El trabajo que suele repartirse entre varios proveedores',
          items: [
            { icon: FileText, title: 'Contenido que atrae búsquedas', body: 'El sistema elige temas según lo que se busca en tu sector, escribe los artículos y los publica en tu sitio al ritmo de tu plan.' },
            { icon: MapPin, title: 'Mediciones fiables', body: 'Dónde aparece tu sitio en Google y Google Maps para cada palabra clave, y si los motores de IA mencionan tu negocio.' },
            { icon: Wrench, title: 'Un sitio sin obstáculos', body: 'El análisis del sitio encuentra lo que te frena en Google. En WordPress lo corriges con un clic, después de aprobarlo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo empezar',
          title: 'Tres pasos y el sistema se pone a trabajar',
          items: [
            { title: 'Escribe la dirección de tu sitio', body: 'El sistema lee tu sitio y prepara la configuración, una estrategia de contenido e ideas de palabras clave.' },
            { title: 'Conecta tu sitio', body: 'WordPress, Shopify o Wix. Los artículos se publican directamente en él.' },
            { title: 'Sigue los resultados', body: 'Las revisiones de posiciones y visibilidad se hacen solas una vez al mes, y a mano cuando quieras. Todo en un solo lugar.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que preguntan los dueños de negocios',
          items: [
            { q: '¿Necesito saber de SEO?', a: 'No. El sistema propone temas, escribe y publica. Puedes revisar y editar cualquier artículo antes de que se publique.' },
            { q: '¿Sirve para un negocio local?', a: 'Sí. El seguimiento en Google Maps comprueba dónde aparece tu negocio en las búsquedas locales, por ciudad o zona.' },
            { q: '¿Cuántos artículos recibo al mes?', a: 'Depende del plan. Todos los planes y sus límites están en la página de precios.' },
          ],
        },
      ],
      cta: { title: 'Primero, mira lo que el sistema ve en tu sitio', body: es.closeBody, primary: es.check, secondary: es.trial },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Para donos de negócios',
        eyebrowIcon: Store,
        title: 'Escrevemos, publicamos e medimos,',
        accent: 'por você, todo mês',
        subtitle: 'Artigos sobre o que os seus clientes buscam, publicados direto no seu site. Uma verificação de onde o seu negócio aparece no Google e no Google Maps, e se o ChatGPT, o Gemini e o Google AI o mencionam. Sem fornecedores para gerenciar e sem precisar aprender SEO.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="O seu mês no sistema"
            rows={[
              { title: 'Novo artigo publicado', detail: 'Como escolher um ar-condicionado para a sala', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Verificação de posições', detail: 'Google e Google Maps', icon: Search, done: true, status: 'Concluída' },
              { title: 'Verificação de visibilidade em IA', detail: 'ChatGPT, Gemini, Google AI', icon: Sparkles, done: true, status: 'Concluída' },
              { title: 'Próximo artigo', detail: 'Preço de instalação de ar-condicionado', icon: CalendarClock, done: false, status: 'Agendado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que o sistema faz por você',
          title: 'O trabalho que costuma ficar dividido entre vários fornecedores',
          items: [
            { icon: FileText, title: 'Conteúdo que traz buscas', body: 'O sistema escolhe temas pelo que se busca no seu ramo, escreve os artigos e publica no seu site no ritmo do seu plano.' },
            { icon: MapPin, title: 'Medição confiável', body: 'Onde o seu site aparece no Google e no Google Maps para cada palavra-chave, e se os mecanismos de IA mencionam o seu negócio.' },
            { icon: Wrench, title: 'Um site sem travas', body: 'A análise do site encontra o que atrapalha você no Google. No WordPress você corrige com um clique, depois de aprovar.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como começar',
          title: 'Três passos e o sistema começa a trabalhar',
          items: [
            { title: 'Informe o endereço do site', body: 'O sistema lê o seu site e prepara as configurações, uma estratégia de conteúdo e ideias de palavras-chave.' },
            { title: 'Conecte o site', body: 'WordPress, Shopify ou Wix. Os artigos são publicados direto nele.' },
            { title: 'Acompanhe os resultados', body: 'As verificações de posições e de visibilidade rodam sozinhas uma vez por mês, e manualmente quando você quiser. Tudo num só lugar.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que os donos de negócios perguntam',
          items: [
            { q: 'Preciso entender de SEO?', a: 'Não. O sistema sugere temas, escreve e publica. Você pode revisar e editar qualquer artigo antes de ele ir ao ar.' },
            { q: 'Funciona para um negócio local?', a: 'Sim. O acompanhamento no Google Maps verifica onde o seu negócio aparece nas buscas locais, por cidade ou região.' },
            { q: 'Quantos artigos recebo por mês?', a: 'Depende do plano. Todos os planos e os seus limites estão na página de preços.' },
          ],
        },
      ],
      cta: { title: 'Primeiro, veja o que o sistema enxerga no seu site', body: pt.closeBody, primary: pt.check, secondary: pt.trial },
    },
  },
}

// ── Agencies ──────────────────────────────────────────────────────────────────

export const AGENCIES_PAGE: MarketingPage = {
  path: '/solutions/agencies',
  meta: {
    he: {
      title: 'לסוכנויות | Go Top SEO',
      description: 'פרויקט נפרד לכל אתר של לקוח, עם מאמרים, מעקב מיקומים, נראות ב-AI ודוחות PDF ו-Excel. מנהלים את כל הלקוחות מחשבון אחד.',
    },
    en: {
      title: 'For Agencies | Go Top SEO',
      description: 'A separate project for every client site, with articles, rank tracking, AI visibility and PDF and Excel reports. Manage every client from one account.',
    },
    es: {
      title: 'Para agencias | Go Top SEO',
      description: 'Un proyecto separado para cada sitio de cliente, con artículos, seguimiento de posiciones, visibilidad en IA e informes en PDF y Excel. Gestiona todos los clientes desde una sola cuenta.',
    },
    'pt-BR': {
      title: 'Para agências | Go Top SEO',
      description: 'Um projeto separado para cada site de cliente, com artigos, acompanhamento de posições, visibilidade em IA e relatórios em PDF e Excel. Gerencie todos os clientes numa só conta.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'לסוכנויות',
        eyebrowIcon: Briefcase,
        title: 'כל אתרי הלקוחות,',
        accent: 'במערכת אחת',
        subtitle: 'כל לקוח מקבל פרויקט נפרד עם מאמרים, מעקב מיקומים, נראות ב-AI ודוחות משלו. מנהלים הכול מחשבון אחד, ומוציאים ללקוח דוח PDF שמראה מה נעשה החודש.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.pricing,
        visual: (
          <WorkListVisual
            heading="הלקוחות שלכם"
            rows={[
              { title: 'מרפאת שיניים', detail: '3 מאמרים החודש', url: 'example-dental.co.il', icon: FolderKanban, done: true, status: 'דוח מוכן' },
              { title: 'משרד עורכי דין', detail: '2 מאמרים החודש', url: 'example-law.co.il', icon: FolderKanban, done: true, status: 'דוח מוכן' },
              { title: 'חנות רהיטים', detail: 'סריקה רצה', url: 'example-furniture.com', icon: FolderKanban, done: false, status: 'בתהליך' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה מקבלים',
          title: 'כלים לעבודה על הרבה אתרים במקביל',
          items: [
            { icon: FolderKanban, title: 'פרויקט לכל אתר', body: 'הגדרות, ביטויים, אסטרטגיה ומאמרים נפרדים לכל אתר, ואפשר לקבץ פרויקטים לפי לקוח.' },
            { icon: BarChart3, title: 'דוחות שאפשר לשלוח', body: 'דוחות PDF ו-Excel למיקומים, לנראות ב-AI ולנתוני Search Console, עם שם הפרויקט ולוגו האתר.' },
            { icon: PieChart, title: 'מכסה שמתחלקת נכון', body: 'מכסת המאמרים משותפת לכל האתרים, ואפשר לקבוע כמה מאמרים כל אתר מקבל.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'מלקוח חדש לדוח ראשון',
          items: [
            { title: 'פותחים פרויקט ללקוח', body: 'מכניסים את כתובת האתר, והמערכת מכינה הגדרות, אסטרטגיה ורעיונות לביטויים.' },
            { title: 'מחברים את האתר', body: 'וורדפרס, שופיפיי או וויקס, והמאמרים מתפרסמים אליו.' },
            { title: 'מפיקים דוח', body: 'דוח PDF ללקוח עם מה שנכתב, איפה האתר מופיע ומה השתנה.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'איזו תוכנית מתאימה',
          body: <p>פרימיום מיועדת למי שמנהל כמה אתרים, וסוכנות למי שמנהל אתרים של לקוחות. המכסות של כל תוכנית מפורטות בעמוד המחירים.</p>,
        },
      ],
      cta: { title: 'נסו את המערכת על אתר של לקוח', body: he.closeBody, primary: he.trial, secondary: he.pricing },
    },
    en: {
      hero: {
        eyebrow: 'For agencies',
        eyebrowIcon: Briefcase,
        title: 'Every client site,',
        accent: 'in one system',
        subtitle: 'Each client gets a separate project with its own articles, rank tracking, AI visibility and reports. Manage everything from one account, and give the client a PDF report that shows what was done this month.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.pricing,
        visual: (
          <WorkListVisual
            heading="Your clients"
            rows={[
              { title: 'Dental clinic', detail: '3 articles this month', url: 'example-dental.com', icon: FolderKanban, done: true, status: 'Report ready' },
              { title: 'Law firm', detail: '2 articles this month', url: 'example-law.com', icon: FolderKanban, done: true, status: 'Report ready' },
              { title: 'Furniture store', detail: 'scan running', url: 'example-furniture.com', icon: FolderKanban, done: false, status: 'In progress' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What you get',
          title: 'Tools for working on many sites at once',
          items: [
            { icon: FolderKanban, title: 'A project per site', body: 'Separate settings, keywords, strategy and articles for each site, with projects grouped by client.' },
            { icon: BarChart3, title: 'Reports you can send', body: 'PDF and Excel reports for rankings, AI visibility and Search Console data, with the project name and the site\'s logo.' },
            { icon: PieChart, title: 'An allowance that splits fairly', body: 'The article allowance is shared across all sites, and you decide how many articles each site gets.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'From new client to first report',
          items: [
            { title: 'Open a project for the client', body: 'Enter the site address and the system prepares settings, a strategy and keyword ideas.' },
            { title: 'Connect the site', body: 'WordPress, Shopify or Wix, and articles are published to it.' },
            { title: 'Produce a report', body: 'A PDF report for the client with what was written, where the site appears and what changed.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Which plan fits',
          body: <p>Premium is for managing several sites, Agency for managing client sites. Each plan&apos;s allowances are on the pricing page.</p>,
        },
      ],
      cta: { title: 'Try the system on a client site', body: en.closeBody, primary: en.trial, secondary: en.pricing },
    },
    es: {
      hero: {
        eyebrow: 'Para agencias',
        eyebrowIcon: Briefcase,
        title: 'Todos los sitios de tus clientes,',
        accent: 'en un solo sistema',
        subtitle: 'Cada cliente tiene un proyecto separado con sus propios artículos, seguimiento de posiciones, visibilidad en IA e informes. Gestiona todo desde una sola cuenta y entrega al cliente un informe en PDF con lo que se hizo este mes.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.pricing,
        visual: (
          <WorkListVisual
            heading="Tus clientes"
            rows={[
              { title: 'Clínica dental', detail: '3 artículos este mes', url: 'example-dental.com', icon: FolderKanban, done: true, status: 'Informe listo' },
              { title: 'Despacho de abogados', detail: '2 artículos este mes', url: 'example-law.com', icon: FolderKanban, done: true, status: 'Informe listo' },
              { title: 'Tienda de muebles', detail: 'análisis en curso', url: 'example-furniture.com', icon: FolderKanban, done: false, status: 'En curso' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué obtienes',
          title: 'Herramientas para trabajar en muchos sitios a la vez',
          items: [
            { icon: FolderKanban, title: 'Un proyecto por sitio', body: 'Configuración, palabras clave, estrategia y artículos separados para cada sitio, con los proyectos agrupados por cliente.' },
            { icon: BarChart3, title: 'Informes para enviar', body: 'Informes en PDF y Excel de posiciones, visibilidad en IA y datos de Search Console, con el nombre del proyecto y el logo del sitio.' },
            { icon: PieChart, title: 'Un límite que se reparte bien', body: 'El límite de artículos se comparte entre todos los sitios, y tú decides cuántos recibe cada uno.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'Del cliente nuevo al primer informe',
          items: [
            { title: 'Abre un proyecto para el cliente', body: 'Escribe la dirección del sitio y el sistema prepara la configuración, una estrategia e ideas de palabras clave.' },
            { title: 'Conecta el sitio', body: 'WordPress, Shopify o Wix, y los artículos se publican en él.' },
            { title: 'Genera un informe', body: 'Un informe en PDF para el cliente con lo que se escribió, dónde aparece el sitio y qué cambió.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Qué plan encaja',
          body: <p>Premium es para gestionar varios sitios, y Agencia para gestionar sitios de clientes. Los límites de cada plan están en la página de precios.</p>,
        },
      ],
      cta: { title: 'Prueba el sistema con el sitio de un cliente', body: es.closeBody, primary: es.trial, secondary: es.pricing },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Para agências',
        eyebrowIcon: Briefcase,
        title: 'Todos os sites dos seus clientes,',
        accent: 'num só sistema',
        subtitle: 'Cada cliente tem um projeto separado, com os seus próprios artigos, acompanhamento de posições, visibilidade em IA e relatórios. Gerencie tudo numa só conta e entregue ao cliente um relatório em PDF com o que foi feito no mês.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.pricing,
        visual: (
          <WorkListVisual
            heading="Os seus clientes"
            rows={[
              { title: 'Clínica odontológica', detail: '3 artigos este mês', url: 'example-dental.com.br', icon: FolderKanban, done: true, status: 'Relatório pronto' },
              { title: 'Escritório de advocacia', detail: '2 artigos este mês', url: 'example-law.com.br', icon: FolderKanban, done: true, status: 'Relatório pronto' },
              { title: 'Loja de móveis', detail: 'análise em andamento', url: 'example-furniture.com.br', icon: FolderKanban, done: false, status: 'Em andamento' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que você recebe',
          title: 'Ferramentas para trabalhar em muitos sites ao mesmo tempo',
          items: [
            { icon: FolderKanban, title: 'Um projeto por site', body: 'Configurações, palavras-chave, estratégia e artigos separados para cada site, com os projetos agrupados por cliente.' },
            { icon: BarChart3, title: 'Relatórios para enviar', body: 'Relatórios em PDF e Excel de posições, visibilidade em IA e dados do Search Console, com o nome do projeto e o logo do site.' },
            { icon: PieChart, title: 'Um limite bem dividido', body: 'O limite de artigos é compartilhado entre todos os sites, e você decide quantos artigos cada site recebe.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'Do cliente novo ao primeiro relatório',
          items: [
            { title: 'Abra um projeto para o cliente', body: 'Informe o endereço do site e o sistema prepara as configurações, uma estratégia e ideias de palavras-chave.' },
            { title: 'Conecte o site', body: 'WordPress, Shopify ou Wix, e os artigos são publicados nele.' },
            { title: 'Gere um relatório', body: 'Um relatório em PDF para o cliente com o que foi escrito, onde o site aparece e o que mudou.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Qual plano combina',
          body: <p>O Premium é para quem gerencia vários sites, e o Agência para quem gerencia sites de clientes. Os limites de cada plano estão na página de preços.</p>,
        },
      ],
      cta: { title: 'Teste o sistema no site de um cliente', body: pt.closeBody, primary: pt.trial, secondary: pt.pricing },
    },
  },
}

// ── WordPress ─────────────────────────────────────────────────────────────────

export const WORDPRESS_PAGE: MarketingPage = {
  path: '/solutions/wordpress',
  meta: {
    he: {
      title: 'לאתרי וורדפרס | Go Top SEO',
      description: 'מחברים את אתר הוורדפרס פעם אחת, והמאמרים מתפרסמים אליו עם תמונה ראשית, קטגוריות ותגיות. סריקת האתר מוצאת בעיות, ורובן מתוקנות בלחיצה אחרי אישור.',
    },
    en: {
      title: 'For WordPress Sites | Go Top SEO',
      description: 'Connect your WordPress site once, and articles are published to it with a featured image, categories and tags. The site scan finds issues, and most are fixed in one click after you approve.',
    },
    es: {
      title: 'Para sitios WordPress | Go Top SEO',
      description: 'Conecta tu sitio WordPress una vez y los artículos se publican con imagen destacada, categorías y etiquetas. El análisis del sitio encuentra problemas, y la mayoría se corrigen con un clic después de aprobarlos.',
    },
    'pt-BR': {
      title: 'Para sites WordPress | Go Top SEO',
      description: 'Conecte o seu site WordPress uma vez e os artigos são publicados com imagem destacada, categorias e tags. A análise do site encontra problemas, e a maioria é corrigida com um clique depois que você aprova.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'לאתרי וורדפרס',
        eyebrowIcon: Blocks,
        title: 'המאמרים מתפרסמים',
        accent: 'ישירות לאתר שלכם',
        subtitle: 'מחברים את אתר הוורדפרס פעם אחת, ומאותו רגע המאמרים עולים לאתר עם תמונה ראשית, קטגוריות ותגיות, בתאריך שקבעתם. סריקת האתר מוצאת בעיות, ורובן מתוקנות בלחיצה אחרי שאישרתם.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.check,
        visual: (
          <WorkListVisual
            heading="האתר שלכם בוורדפרס"
            rows={[
              { title: 'מאמר פורסם', detail: 'מדריך מחירים · עם תמונה ראשית', icon: FileText, done: true, status: 'פורסם' },
              { title: 'כותרת SEO תוקנה', detail: '', url: '/services', icon: Type, done: true, status: 'תוקן' },
              { title: 'טקסט חלופי ל-6 תמונות', detail: '', url: '/gallery', icon: ImageIcon, done: true, status: 'תוקן' },
              { title: 'המאמר הבא', detail: 'ביום חמישי ב-09:00', icon: CalendarClock, done: false, status: 'מתוזמן' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה מקבלים בוורדפרס',
          title: 'פרסום ותיקונים בלי להיכנס לממשק הניהול',
          items: [
            { icon: Tags, title: 'פרסום מלא', body: 'מאמר עם תמונה ראשית, תמונות בתוכן, קטגוריות ותגיות, מיד או בתאריך שתזמנתם.' },
            { icon: Wrench, title: 'תיקוני אתר בלחיצה', body: 'כותרות, תיאורים, טקסט חלופי וקישורים. כל תיקון מוצג לפני שהוא נכתב, ואפשר לבטל אותו.' },
            { icon: ShieldCheck, title: 'עובד עם Yoast ו-Rank Math', body: 'כותרות ותיאורים נשמרים בשדות של תוסף ה-SEO. כשהוא כבר מדפיס סכימה, אנחנו מוסיפים רק שאלות נפוצות, בלי כפילויות.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך מתחברים',
          title: 'חיבור אחד, וזהו',
          items: [
            { title: 'יוצרים סיסמת אפליקציה', body: 'בפרופיל המשתמש בוורדפרס. המערכת מסבירה איך, צעד אחר צעד.' },
            { title: 'מחברים בהגדרות הפרויקט', body: 'מכניסים את כתובת האתר, שם המשתמש וסיסמת האפליקציה. המערכת בודקת שהחיבור עובד.' },
            { title: 'מוסיפים את התוסף של Go Top', body: 'לא חובה. התוסף, שמורידים מעמוד בריאות האתר, מוסיף תיאורי מטא, נתונים מובנים וקובץ llms.txt.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות נפוצות',
          title: 'מה שואלים לפני שמחברים',
          items: [
            { q: 'זה בטוח?', a: 'סיסמת האפליקציה נשמרת מוצפנת, ואפשר לבטל אותה בכל רגע מפרופיל המשתמש בוורדפרס. תיקון באתר נעשה רק אחרי שאישרתם אותו.' },
            { q: 'צריך תוסף SEO?', a: 'לא. עם Yoast או Rank Math המערכת כותבת לשדות שלהם. תיאורי מטא דורשים תוסף SEO באתר.' },
            { q: 'אפשר לערוך מאמר לפני שהוא עולה?', a: 'כן. כל מאמר אפשר לפתוח, לשנות ולתזמן מחדש לפני הפרסום.' },
          ],
        },
      ],
      cta: { title: 'חברו את אתר הוורדפרס שלכם', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'For WordPress sites',
        eyebrowIcon: Blocks,
        title: 'Articles published',
        accent: 'straight to your site',
        subtitle: 'Connect your WordPress site once, and from then on articles go live with a featured image, categories and tags, on the date you set. The site scan finds issues, and most of them are fixed in one click after you approve.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.check,
        visual: (
          <WorkListVisual
            heading="Your WordPress site"
            rows={[
              { title: 'Article published', detail: 'Pricing guide · with featured image', icon: FileText, done: true, status: 'Published' },
              { title: 'SEO title fixed', detail: '', url: '/services', icon: Type, done: true, status: 'Fixed' },
              { title: 'Alt text for 6 images', detail: '', url: '/gallery', icon: ImageIcon, done: true, status: 'Fixed' },
              { title: 'Next article', detail: 'Thursday at 09:00', icon: CalendarClock, done: false, status: 'Scheduled' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What you get on WordPress',
          title: 'Publishing and fixes without opening the admin',
          items: [
            { icon: Tags, title: 'Complete publishing', body: 'An article with a featured image, images in the content, categories and tags, right away or on the date you scheduled.' },
            { icon: Wrench, title: 'One-click site fixes', body: 'Titles, descriptions, alt text and links. Every fix is shown before it is written, and can be undone.' },
            { icon: ShieldCheck, title: 'Works with Yoast and Rank Math', body: 'Titles and descriptions are saved in the SEO plugin\'s fields. When it already prints schema, we add only the FAQ, with no duplicates.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Connecting',
          title: 'One connection, and that is it',
          items: [
            { title: 'Create an application password', body: 'In your WordPress user profile. The system walks you through it step by step.' },
            { title: 'Connect in project settings', body: 'Enter the site address, the username and the application password. The system checks the connection works.' },
            { title: 'Add the Go Top plugin', body: 'Optional. The plugin, downloaded from the Site health page, adds meta descriptions, structured data and an llms.txt file.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'FAQ',
          title: 'What people ask before connecting',
          items: [
            { q: 'Is it safe?', a: 'The application password is stored encrypted, and you can revoke it anytime from your WordPress user profile. A fix is written to the site only after you approve it.' },
            { q: 'Do I need an SEO plugin?', a: 'No. With Yoast or Rank Math the system writes to their fields. Meta descriptions need an SEO plugin on the site.' },
            { q: 'Can I edit an article before it goes live?', a: 'Yes. You can open, change and reschedule any article before it is published.' },
          ],
        },
      ],
      cta: { title: 'Connect your WordPress site', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Para sitios WordPress',
        eyebrowIcon: Blocks,
        title: 'Artículos publicados',
        accent: 'directamente en tu sitio',
        subtitle: 'Conecta tu sitio WordPress una vez y, desde ese momento, los artículos se publican con imagen destacada, categorías y etiquetas, en la fecha que elijas. El análisis del sitio encuentra problemas, y la mayoría se corrigen con un clic después de aprobarlos.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.check,
        visual: (
          <WorkListVisual
            heading="Tu sitio WordPress"
            rows={[
              { title: 'Artículo publicado', detail: 'Guía de precios · con imagen destacada', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Título SEO corregido', detail: '', url: '/servicios', icon: Type, done: true, status: 'Corregido' },
              { title: 'Texto alternativo en 6 imágenes', detail: '', url: '/galeria', icon: ImageIcon, done: true, status: 'Corregido' },
              { title: 'Próximo artículo', detail: 'El jueves a las 09:00', icon: CalendarClock, done: false, status: 'Programado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué obtienes en WordPress',
          title: 'Publicación y correcciones sin entrar al escritorio',
          items: [
            { icon: Tags, title: 'Publicación completa', body: 'Un artículo con imagen destacada, imágenes en el contenido, categorías y etiquetas, al momento o en la fecha programada.' },
            { icon: Wrench, title: 'Correcciones con un clic', body: 'Títulos, descripciones, texto alternativo y enlaces. Cada corrección se muestra antes de escribirse y se puede deshacer.' },
            { icon: ShieldCheck, title: 'Compatible con Yoast y Rank Math', body: 'Los títulos y las descripciones se guardan en los campos del plugin SEO. Si ya imprime datos estructurados, solo añadimos las preguntas frecuentes, sin duplicados.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo conectarlo',
          title: 'Una sola conexión, y listo',
          items: [
            { title: 'Crea una contraseña de aplicación', body: 'En tu perfil de usuario de WordPress. El sistema te guía paso a paso.' },
            { title: 'Conéctalo en la configuración del proyecto', body: 'Escribe la dirección del sitio, el usuario y la contraseña de aplicación. El sistema comprueba que la conexión funciona.' },
            { title: 'Añade el plugin de Go Top', body: 'Opcional. El plugin, que se descarga desde la página de salud del sitio, añade meta descripciones, datos estructurados y un archivo llms.txt.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que se pregunta antes de conectar',
          items: [
            { q: '¿Es seguro?', a: 'La contraseña de aplicación se guarda cifrada y puedes revocarla cuando quieras desde tu perfil de WordPress. Una corrección solo se escribe en el sitio después de que la apruebes.' },
            { q: '¿Necesito un plugin SEO?', a: 'No. Con Yoast o Rank Math el sistema escribe en sus campos. Las meta descripciones requieren un plugin SEO en el sitio.' },
            { q: '¿Puedo editar un artículo antes de publicarlo?', a: 'Sí. Puedes abrir, cambiar y reprogramar cualquier artículo antes de que se publique.' },
          ],
        },
      ],
      cta: { title: 'Conecta tu sitio WordPress', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Para sites WordPress',
        eyebrowIcon: Blocks,
        title: 'Artigos publicados',
        accent: 'direto no seu site',
        subtitle: 'Conecte o seu site WordPress uma vez e, a partir daí, os artigos vão ao ar com imagem destacada, categorias e tags, na data que você definir. A análise do site encontra problemas, e a maioria é corrigida com um clique depois que você aprova.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.check,
        visual: (
          <WorkListVisual
            heading="O seu site WordPress"
            rows={[
              { title: 'Artigo publicado', detail: 'Guia de preços · com imagem destacada', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Título de SEO corrigido', detail: '', url: '/servicos', icon: Type, done: true, status: 'Corrigido' },
              { title: 'Texto alternativo em 6 imagens', detail: '', url: '/galeria', icon: ImageIcon, done: true, status: 'Corrigido' },
              { title: 'Próximo artigo', detail: 'Quinta-feira às 09:00', icon: CalendarClock, done: false, status: 'Agendado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que você recebe no WordPress',
          title: 'Publicação e correções sem abrir o painel',
          items: [
            { icon: Tags, title: 'Publicação completa', body: 'Um artigo com imagem destacada, imagens no conteúdo, categorias e tags, na hora ou na data agendada.' },
            { icon: Wrench, title: 'Correções com um clique', body: 'Títulos, descrições, texto alternativo e links. Cada correção aparece antes de ser gravada e pode ser desfeita.' },
            { icon: ShieldCheck, title: 'Funciona com Yoast e Rank Math', body: 'Títulos e descrições são salvos nos campos do plugin de SEO. Quando ele já imprime dados estruturados, adicionamos só as perguntas frequentes, sem duplicar.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como conectar',
          title: 'Uma conexão e pronto',
          items: [
            { title: 'Crie uma senha de aplicativo', body: 'No seu perfil de usuário do WordPress. O sistema mostra como, passo a passo.' },
            { title: 'Conecte nas configurações do projeto', body: 'Informe o endereço do site, o usuário e a senha de aplicativo. O sistema confere se a conexão funciona.' },
            { title: 'Adicione o plugin da Go Top', body: 'Opcional. O plugin, baixado na página de saúde do site, adiciona meta descrições, dados estruturados e um arquivo llms.txt.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que perguntam antes de conectar',
          items: [
            { q: 'É seguro?', a: 'A senha de aplicativo fica guardada criptografada, e você pode revogá-la a qualquer momento no seu perfil do WordPress. Uma correção só é gravada no site depois que você aprova.' },
            { q: 'Preciso de um plugin de SEO?', a: 'Não. Com Yoast ou Rank Math o sistema grava nos campos deles. As meta descrições exigem um plugin de SEO no site.' },
            { q: 'Posso editar um artigo antes de ele ir ao ar?', a: 'Sim. Você pode abrir, alterar e reagendar qualquer artigo antes da publicação.' },
          ],
        },
      ],
      cta: { title: 'Conecte o seu site WordPress', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
  },
}

// ── Shopify stores ────────────────────────────────────────────────────────────

/**
 * The Shopify page (w11). Until now Shopify had no page of ours and its menu
 * item went straight to the App Store; the owner asked on 9 Oct 2026 for a page
 * with real content that links to the listing, so the menu item now points here
 * and every link out to Shopify from this page carries rel="nofollow" through
 * SHOPIFY_APP_STORE_URL, as every Shopify link on the site does.
 *
 * What it may and may not claim, read from the code rather than remembered:
 *   - the app's granted scopes are read_products, read_content, write_content
 *     (shopify.app.toml), so it writes ONLY the store's own articles and pages;
 *   - the fixes it can write are SHOPIFY_FIX_TYPES — the search engine listing
 *     (title and description), image alt text, a broken link, an FAQ block and
 *     an extra main heading demoted (lib/site-fix/shopify-admin.ts), each
 *     previewed, approved one at a time, and undoable;
 *   - products, collections, the theme, prices, orders and settings are never
 *     touched, and llms.txt is refused outright on a store (lib/site-fix/api.ts);
 *   - automatic approval of fixes is WordPress only: a Shopify store approves
 *     every fix itself, which is what the App Store requires;
 *   - NO structured-data promise for Shopify anywhere, in any language;
 *   - the automatic monthly AI check runs ChatGPT, Gemini and Google AI
 *     (MONTHLY_CORE_ENGINES); the other three are a click.
 */
const shopifyAppStoreLink = (label: string) =>
  SHOPIFY_APP_STORE_URL
    ? (
        <a
          href={SHOPIFY_APP_STORE_URL}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="font-semibold text-action underline decoration-action/40 underline-offset-4 hover:decoration-action"
        >
          {label}
        </a>
      )
    : label

export const SHOPIFY_PAGE: MarketingPage = {
  path: '/solutions/shopify',
  meta: {
    he: {
      title: 'לחנויות שופיפיי | Go Top SEO',
      description: 'מתקינים את האפליקציה מחנות האפליקציות של Shopify, והמאמרים נכתבים ומתפרסמים לבלוג של החנות. סריקת החנות מוצאת בעיות במאמרים ובעמודים, ואתם מאשרים כל תיקון.',
    },
    en: {
      title: 'For Shopify Stores | Go Top SEO',
      description: 'Install the app from the Shopify App Store and articles are written and published to your store blog. The store scan finds issues in articles and pages, and you approve every fix.',
    },
    es: {
      title: 'Para tiendas Shopify | Go Top SEO',
      description: 'Instala la app desde la Shopify App Store y los artículos se escriben y se publican en el blog de tu tienda. El análisis encuentra problemas en artículos y páginas, y tú apruebas cada corrección.',
    },
    'pt-BR': {
      title: 'Para lojas Shopify | Go Top SEO',
      description: 'Instale o app na Shopify App Store e os artigos são escritos e publicados no blog da sua loja. A análise encontra problemas em artigos e páginas, e você aprova cada correção.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'לחנויות שופיפיי',
        eyebrowIcon: Store,
        title: 'התוכן של החנות נכתב,',
        accent: 'מתפרסם ונמדד',
        subtitle: 'מתקינים את האפליקציה מחנות האפליקציות של Shopify, ומאותו רגע המערכת כותבת מאמרים על מה שהלקוחות שלכם מחפשים ומפרסמת אותם לבלוג של החנות, ומראה לכם איפה החנות מופיעה בגוגל, בגוגל מפות ובתשובות של ChatGPT, Gemini ו-Google AI.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.check,
        visual: (
          <WorkListVisual
            heading="החנות שלכם ב-Shopify"
            rows={[
              { title: 'מאמר פורסם לבלוג', detail: 'מדריך בחירה · עם תמונות', icon: FileText, done: true, status: 'פורסם' },
              { title: 'כותרת וחיפוש בגוגל תוקנו', detail: '', url: '/pages/about', icon: Type, done: true, status: 'אושר' },
              { title: 'טקסט חלופי לתמונות במאמר', detail: '', url: '/blogs/news', icon: ImageIcon, done: true, status: 'אושר' },
              { title: 'המאמר הבא', detail: 'ביום שני ב-09:00', icon: CalendarClock, done: false, status: 'מתוזמן' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'callout',
          icon: Store,
          title: 'ההתקנה היא דרך חנות האפליקציות של Shopify',
          body: (
            <>
              {'כל חנות מתקינה את המערכת מהרישום הרשמי: '}
              {shopifyAppStoreLink('Go Top SEO ב-Shopify App Store')}
              {'. ההתקנה היא בלחיצה, החיוב עובר דרך Shopify, ואין מה להעתיק או להדביק בקוד של החנות.'}
            </>
          ),
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה המערכת עושה בחנות',
          title: 'כתיבה, פרסום ותיקונים, בלי לגעת בתבנית',
          items: [
            { icon: Tags, title: 'מאמרים לבלוג של החנות', body: 'כל מאמר נכתב סביב חיפוש אמיתי, עם תמונות, מקטע שאלות ותשובות וקישורים פנימיים, ועולה לבלוג בתאריך שקבעתם.' },
            { icon: Wrench, title: 'תיקונים שאתם מאשרים', body: 'כותרת ותיאור לחיפוש בגוגל, טקסט חלופי לתמונות, קישור שבור ומקטע שאלות ותשובות, במאמרים ובעמודים של החנות. כל תיקון מוצג לפני הכתיבה, מאושר בנפרד, ואפשר לבטל אותו.' },
            { icon: BarChart3, title: 'מעקב על גוגל ועל ה-AI', body: 'מיקומים בגוגל ובגוגל מפות, ובדיקה אוטומטית חודשית אם ChatGPT, Gemini ו-Google AI מזכירים את החנות. שלושה מנועים נוספים בלחיצה.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך מתחילים',
          title: 'שלושה צעדים, בלי מתכנת',
          items: [
            { title: 'מתקינים מחנות האפליקציות', body: <>{'פותחים את '}{shopifyAppStoreLink('הרישום של Go Top SEO')}{' ומאשרים את ההתקנה בחנות.'}</> },
            { title: 'המערכת סורקת את החנות', body: 'המאמרים והעמודים נקראים, והמערכת מציגה מה חסר ומה כדאי לתקן, לפי סדר חשיבות.' },
            { title: 'מאשרים תוכן ותיקונים', body: 'בוחרים על מה נכתב, מאשרים כל תיקון בנפרד, והפרסום לבלוג קורה לפי לוח הזמנים שקבעתם.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'הגבולות, בלי אותיות קטנות',
          title: 'במה המערכת לא נוגעת בחנות שלכם',
          items: [
            { icon: ShieldCheck, title: 'לא בתבנית ולא בקוד', body: 'המערכת כותבת רק בתוך המאמרים והעמודים של החנות. היא לא נוגעת בתבנית, בקוד, בהגדרות, במחירים ובהזמנות.' },
            { icon: Info, title: 'מוצרים וקטגוריות: מראים, לא כותבים', body: 'ההרשאות של האפליקציה לקריאת מוצרים וקטגוריות הן לקריאה בלבד, אז המערכת מראה לכם מה לתקן בעמוד המוצר ואתם מתקנים בשופיפיי. פתיחה של תיקון אוטומטי שם דורשת גרסה חדשה של האפליקציה.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות נפוצות',
          title: 'מה שואלים לפני שמתקינים',
          items: [
            { q: 'האם המערכת תשנה לי דברים בחנות בלי שאאשר?', a: 'לא. בחנות שופיפיי כל תיקון מוצג לפני הכתיבה ומאושר בנפרד, וגם אחרי שאושר אפשר לבטל אותו. אישור אוטומטי של תיקונים קיים באתרי וורדפרס בלבד.' },
            { q: 'איפה המאמרים מתפרסמים?', a: 'בבלוג של החנות, כמו כל מאמר אחר שלכם. אתם יכולים לפתוח, לערוך ולתזמן מחדש כל מאמר לפני הפרסום.' },
            { q: 'צריך להוסיף קוד או תוסף לחנות?', a: 'לא. ההתקנה היא דרך חנות האפליקציות של Shopify, והמערכת עובדת מול החנות בלי שינוי בתבנית.' },
            { q: 'מה עם נתונים מובנים בחנות?', a: 'התבנית של Shopify כבר מדפיסה חלק מהנתונים המובנים, והמערכת לא מוסיפה שם נתונים מובנים משלה. נתונים מובנים שאנחנו כותבים קיימים רק באתרי וורדפרס עם התוסף של Go Top. בעמוד בריאות האתר אנחנו מסתירים את השורות שהתבנית כבר מכסה.' },
          ],
        },
      ],
      cta: { title: 'התחילו עם החנות שלכם', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'For Shopify stores',
        eyebrowIcon: Store,
        title: 'Your store content written,',
        accent: 'published and measured',
        subtitle: 'Install the app from the Shopify App Store, and from then on the system writes articles about what your customers are searching for, publishes them to your store blog, and shows you where the store appears in Google, Google Maps and the answers of ChatGPT, Gemini and Google AI.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.check,
        visual: (
          <WorkListVisual
            heading="Your Shopify store"
            rows={[
              { title: 'Article published to the blog', detail: 'Buying guide · with images', icon: FileText, done: true, status: 'Published' },
              { title: 'Search engine listing fixed', detail: '', url: '/pages/about', icon: Type, done: true, status: 'Approved' },
              { title: 'Alt text for article images', detail: '', url: '/blogs/news', icon: ImageIcon, done: true, status: 'Approved' },
              { title: 'Next article', detail: 'Monday at 09:00', icon: CalendarClock, done: false, status: 'Scheduled' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'callout',
          icon: Store,
          title: 'Installation goes through the Shopify App Store',
          body: (
            <>
              {'Every store installs from the official listing: '}
              {shopifyAppStoreLink('Go Top SEO on the Shopify App Store')}
              {'. It is one click, billing runs through Shopify, and there is nothing to paste into your store code.'}
            </>
          ),
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What the system does in your store',
          title: 'Writing, publishing and fixes, without touching the theme',
          items: [
            { icon: Tags, title: 'Articles on your store blog', body: 'Each article is built around a real search, with images, an FAQ section and internal links, and goes live on the blog on the date you set.' },
            { icon: Wrench, title: 'Fixes you approve', body: 'The search engine listing title and description, image alt text, a broken link and an FAQ section, in your store articles and pages. Every fix is shown before it is written, approved on its own, and can be undone.' },
            { icon: BarChart3, title: 'Tracking in Google and in AI', body: 'Positions in Google and Google Maps, and an automatic monthly check of whether ChatGPT, Gemini and Google AI mention the store. Three more engines are one click.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Getting started',
          title: 'Three steps, no developer',
          items: [
            { title: 'Install from the App Store', body: <>{'Open '}{shopifyAppStoreLink('the Go Top SEO listing')}{' and approve the installation in your store.'}</> },
            { title: 'The system scans the store', body: 'Your articles and pages are read, and the system shows what is missing and what is worth fixing, in order of importance.' },
            { title: 'Approve content and fixes', body: 'Choose what gets written, approve each fix on its own, and publishing to the blog follows the schedule you set.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'The limits, no small print',
          title: 'What the system never touches in your store',
          items: [
            { icon: ShieldCheck, title: 'Not the theme, not the code', body: 'The system writes only inside your store articles and pages. It does not touch the theme, the code, your settings, your prices or your orders.' },
            { icon: Info, title: 'Products and collections: shown, not written', body: 'The app’s access to products and collections is read-only, so the system shows you what to fix on a product page and you fix it in Shopify. Fixing those automatically would need a new version of the app.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Common questions',
          title: 'What stores ask before installing',
          items: [
            { q: 'Will it change things in my store without my approval?', a: 'No. In a Shopify store every fix is shown before it is written and approved on its own, and even after approval it can be undone. Automatic approval of fixes exists on WordPress sites only.' },
            { q: 'Where are the articles published?', a: 'On your store blog, like any other article of yours. You can open, edit and reschedule any article before it is published.' },
            { q: 'Do I need to add code or an app embed?', a: 'No. Installation goes through the Shopify App Store, and the system works with your store without changing the theme.' },
            { q: 'What about structured data in the store?', a: 'A Shopify theme already prints some structured data, and the system does not add structured data of its own there. Structured data we write exists only on WordPress sites with the Go Top plugin. On the Site health page we hide the rows your theme already covers.' },
          ],
        },
      ],
      cta: { title: 'Start with your store', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Para tiendas Shopify',
        eyebrowIcon: Store,
        title: 'El contenido de tu tienda se escribe,',
        accent: 'se publica y se mide',
        subtitle: 'Instala la app desde la Shopify App Store y, a partir de ese momento, el sistema escribe artículos sobre lo que buscan tus clientes, los publica en el blog de tu tienda y te muestra dónde aparece la tienda en Google, en Google Maps y en las respuestas de ChatGPT, Gemini y Google AI.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.check,
        visual: (
          <WorkListVisual
            heading="Tu tienda en Shopify"
            rows={[
              { title: 'Artículo publicado en el blog', detail: 'Guía de compra · con imágenes', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Listado de Google corregido', detail: '', url: '/pages/about', icon: Type, done: true, status: 'Aprobado' },
              { title: 'Texto alternativo de las imágenes', detail: '', url: '/blogs/news', icon: ImageIcon, done: true, status: 'Aprobado' },
              { title: 'Próximo artículo', detail: 'El lunes a las 09:00', icon: CalendarClock, done: false, status: 'Programado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'callout',
          icon: Store,
          title: 'La instalación se hace desde la Shopify App Store',
          body: (
            <>
              {'Cada tienda instala desde la ficha oficial: '}
              {shopifyAppStoreLink('Go Top SEO en la Shopify App Store')}
              {'. Es un clic, el cobro va por Shopify y no hay nada que pegar en el código de la tienda.'}
            </>
          ),
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué hace el sistema en tu tienda',
          title: 'Escribir, publicar y corregir, sin tocar la plantilla',
          items: [
            { icon: Tags, title: 'Artículos en el blog de tu tienda', body: 'Cada artículo se construye alrededor de una búsqueda real, con imágenes, una sección de preguntas frecuentes y enlaces internos, y se publica en el blog en la fecha que elijas.' },
            { icon: Wrench, title: 'Correcciones que tú apruebas', body: 'El título y la descripción para Google, el texto alternativo de las imágenes, un enlace roto y una sección de preguntas frecuentes, en los artículos y las páginas de tu tienda. Cada corrección se muestra antes de escribirla, se aprueba por separado y se puede deshacer.' },
            { icon: BarChart3, title: 'Seguimiento en Google y en la IA', body: 'Posiciones en Google y en Google Maps, y una comprobación automática mensual de si ChatGPT, Gemini y Google AI mencionan la tienda. Otros tres motores, con un clic.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo empezar',
          title: 'Tres pasos, sin programador',
          items: [
            { title: 'Instala desde la App Store', body: <>{'Abre '}{shopifyAppStoreLink('la ficha de Go Top SEO')}{' y aprueba la instalación en tu tienda.'}</> },
            { title: 'El sistema analiza la tienda', body: 'Se leen tus artículos y páginas, y el sistema muestra qué falta y qué conviene corregir, por orden de importancia.' },
            { title: 'Apruebas contenido y correcciones', body: 'Eliges sobre qué se escribe, apruebas cada corrección por separado y la publicación en el blog sigue el calendario que fijaste.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Los límites, sin letra pequeña',
          title: 'Qué no toca el sistema en tu tienda',
          items: [
            { icon: ShieldCheck, title: 'Ni la plantilla ni el código', body: 'El sistema escribe solo dentro de los artículos y las páginas de tu tienda. No toca la plantilla, el código, tus ajustes, tus precios ni tus pedidos.' },
            { icon: Info, title: 'Productos y colecciones: se muestran, no se escriben', body: 'El acceso de la app a productos y colecciones es de solo lectura, así que el sistema te muestra qué corregir en la página de producto y tú lo corriges en Shopify. Corregirlo automáticamente requeriría una nueva versión de la app.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que preguntan las tiendas antes de instalar',
          items: [
            { q: '¿Va a cambiar cosas en mi tienda sin que yo lo apruebe?', a: 'No. En una tienda Shopify cada corrección se muestra antes de escribirla y se aprueba por separado, y aun después de aprobarla se puede deshacer. La aprobación automática de correcciones existe solo en sitios WordPress.' },
            { q: '¿Dónde se publican los artículos?', a: 'En el blog de tu tienda, como cualquier otro artículo tuyo. Puedes abrir, editar y reprogramar cualquier artículo antes de publicarlo.' },
            { q: '¿Hay que añadir código o una extensión?', a: 'No. La instalación se hace desde la Shopify App Store y el sistema trabaja con tu tienda sin cambiar la plantilla.' },
            { q: '¿Y los datos estructurados de la tienda?', a: 'Una plantilla de Shopify ya imprime parte de los datos estructurados, y el sistema no añade datos estructurados propios ahí. Los datos estructurados que escribimos existen solo en sitios WordPress con el plugin de Go Top. En la página de salud del sitio ocultamos las filas que tu plantilla ya cubre.' },
          ],
        },
      ],
      cta: { title: 'Empieza con tu tienda', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Para lojas Shopify',
        eyebrowIcon: Store,
        title: 'O conteúdo da sua loja é escrito,',
        accent: 'publicado e medido',
        subtitle: 'Instale o app na Shopify App Store e, a partir daí, o sistema escreve artigos sobre o que os seus clientes procuram, publica no blog da sua loja e mostra onde a loja aparece no Google, no Google Maps e nas respostas do ChatGPT, do Gemini e do Google AI.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.check,
        visual: (
          <WorkListVisual
            heading="Sua loja na Shopify"
            rows={[
              { title: 'Artigo publicado no blog', detail: 'Guia de compra · com imagens', icon: FileText, done: true, status: 'Publicado' },
              { title: 'Listagem do Google corrigida', detail: '', url: '/pages/about', icon: Type, done: true, status: 'Aprovado' },
              { title: 'Texto alternativo das imagens', detail: '', url: '/blogs/news', icon: ImageIcon, done: true, status: 'Aprovado' },
              { title: 'Próximo artigo', detail: 'Segunda-feira às 09:00', icon: CalendarClock, done: false, status: 'Agendado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'callout',
          icon: Store,
          title: 'A instalação é feita pela Shopify App Store',
          body: (
            <>
              {'Toda loja instala pela listagem oficial: '}
              {shopifyAppStoreLink('Go Top SEO na Shopify App Store')}
              {'. É um clique, a cobrança passa pela Shopify e não há nada para colar no código da loja.'}
            </>
          ),
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que o sistema faz na sua loja',
          title: 'Escrever, publicar e corrigir, sem tocar no tema',
          items: [
            { icon: Tags, title: 'Artigos no blog da sua loja', body: 'Cada artigo é construído em torno de uma busca real, com imagens, uma seção de perguntas frequentes e links internos, e vai ao ar no blog na data que você definir.' },
            { icon: Wrench, title: 'Correções que você aprova', body: 'O título e a descrição para o Google, o texto alternativo das imagens, um link quebrado e uma seção de perguntas frequentes, nos artigos e nas páginas da sua loja. Cada correção é mostrada antes de ser escrita, aprovada separadamente, e pode ser desfeita.' },
            { icon: BarChart3, title: 'Acompanhamento no Google e na IA', body: 'Posições no Google e no Google Maps, e uma verificação automática mensal de o ChatGPT, o Gemini e o Google AI mencionam a loja. Outros três motores, com um clique.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como começar',
          title: 'Três passos, sem programador',
          items: [
            { title: 'Instale pela App Store', body: <>{'Abra '}{shopifyAppStoreLink('a listagem do Go Top SEO')}{' e aprove a instalação na sua loja.'}</> },
            { title: 'O sistema analisa a loja', body: 'Seus artigos e páginas são lidos, e o sistema mostra o que falta e o que vale corrigir, por ordem de importância.' },
            { title: 'Você aprova conteúdo e correções', body: 'Escolhe sobre o que será escrito, aprova cada correção separadamente, e a publicação no blog segue o calendário que você definiu.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Os limites, sem letras miúdas',
          title: 'No que o sistema nunca mexe na sua loja',
          items: [
            { icon: ShieldCheck, title: 'Nem no tema, nem no código', body: 'O sistema escreve apenas dentro dos artigos e das páginas da sua loja. Não mexe no tema, no código, nas suas configurações, nos seus preços nem nos seus pedidos.' },
            { icon: Info, title: 'Produtos e coleções: mostrados, não escritos', body: 'O acesso do app a produtos e coleções é somente de leitura, então o sistema mostra o que corrigir na página do produto e você corrige na Shopify. Corrigir isso automaticamente exigiria uma nova versão do app.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que as lojas perguntam antes de instalar',
          items: [
            { q: 'O sistema vai mudar coisas na minha loja sem a minha aprovação?', a: 'Não. Em uma loja Shopify cada correção é mostrada antes de ser escrita e aprovada separadamente, e mesmo depois de aprovada pode ser desfeita. A aprovação automática de correções existe só em sites WordPress.' },
            { q: 'Onde os artigos são publicados?', a: 'No blog da sua loja, como qualquer outro artigo seu. Você pode abrir, editar e reagendar qualquer artigo antes da publicação.' },
            { q: 'Preciso adicionar código ou uma extensão?', a: 'Não. A instalação é feita pela Shopify App Store, e o sistema funciona com a sua loja sem alterar o tema.' },
            { q: 'E os dados estruturados da loja?', a: 'Um tema da Shopify já imprime parte dos dados estruturados, e o sistema não adiciona dados estruturados próprios ali. Os dados estruturados que escrevemos existem apenas em sites WordPress com o plugin do Go Top. Na página de saúde do site escondemos as linhas que o seu tema já cobre.' },
          ],
        },
      ],
      cta: { title: 'Comece com a sua loja', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
  },
}
