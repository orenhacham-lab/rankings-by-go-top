/**
 * The "show results" pages beside reports, in four languages.
 *
 * Competitors: maps to the rank scan's competitor comparison
 * (lib/competitors/comparison.ts, components/competitors/CompetitorSummary.tsx:
 * per competitor, on how many keywords it ranks above the project, from each
 * keyword's latest check) and the AI-visibility competitors and what tends to
 * replace the project in AI answers (components/ai-visibility).
 *
 * Search Console: maps to components/gsc (clicks, impressions and average
 * position over the last 28 days with the change against the previous 28, the
 * five pages with the most clicks, the searches you already appear for that no
 * tracked keyword covers, and the PDF / Excel / CSV export).
 */
import { BarChart3, Eye, FileDown, FileText, Info, LineChart, MousePointerClick, Plus, Search, Sparkles, Users, Target } from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']

// ── You vs. competitors ───────────────────────────────────────────────────────

export const COMPETITORS_PAGE: MarketingPage = {
  path: '/features/competitor-tracking',
  meta: {
    he: {
      title: 'אתם מול המתחרים | Go Top SEO',
      description: 'מוסיפים את המתחרים ורואים על כמה ביטויים כל אחד מהם מופיע מעליכם בגוגל, ואת מי ChatGPT, Gemini ו-Google AI מזכירים כשהם לא מזכירים אתכם.',
    },
    en: {
      title: 'You vs. Competitors | Go Top SEO',
      description: 'Add your competitors and see on how many keywords each one ranks above you in Google, and who ChatGPT, Gemini and Google AI mention when they do not mention you.',
    },
    es: {
      title: 'Tú frente a la competencia | Go Top SEO',
      description: 'Añade a tus competidores y mira en cuántas palabras clave cada uno aparece por encima de ti en Google, y a quién mencionan ChatGPT, Gemini y Google AI cuando no te mencionan a ti.',
    },
    'pt-BR': {
      title: 'Você x concorrentes | Go Top SEO',
      description: 'Adicione os seus concorrentes e veja em quantas palavras-chave cada um aparece acima de você no Google, e quem o ChatGPT, o Gemini e o Google AI citam quando não citam você.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'אתם מול המתחרים',
        eyebrowIcon: Users,
        title: 'יודעים בדיוק',
        accent: 'איפה המתחרים לפניכם',
        subtitle: 'מוסיפים את המתחרים בהגדרות הפרויקט, ובכל בדיקת מיקומים המערכת מראה על כמה ביטויים כל אחד מהם מופיע מעליכם בגוגל. בבדיקת הנראות ב-AI רואים את מי ChatGPT, Gemini ו-Google AI מזכירים כשהם לא מזכירים אתכם.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="אתם מול המתחרים"
            rows={[
              { title: 'מתחרה א׳', detail: 'מעליכם ב-6 מתוך 24 ביטויים', url: 'example-a.co.il', icon: Users, done: false, status: 'לפניכם' },
              { title: 'מתחרה ב׳', detail: 'מעליכם ב-2 מתוך 24 ביטויים', url: 'example-b.co.il', icon: Users, done: true, status: 'אתם לפניו' },
              { title: 'מתחרה ג׳', detail: 'לא מופיע ב-20 התוצאות הראשונות', url: 'example-c.co.il', icon: Users, done: true, status: 'אתם לפניו' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'למה זה חשוב',
          title: 'מיקום לבד לא מספר את כל הסיפור',
          intro: 'מקום חמישי יכול להיות הצלחה או בעיה. זה תלוי במי שנמצא מעליכם.',
          items: [
            { icon: Target, title: 'איפה הם לפניכם', body: 'לכל מתחרה: על כמה מהביטויים שלכם הוא מופיע מעליכם בבדיקה האחרונה.' },
            { icon: Sparkles, title: 'מי מוזכר במקומכם', body: 'בתשובות של מנועי AI: אילו עסקים ואתרים מופיעים כשאתם לא.' },
            { icon: FileText, title: 'מה כותבים עכשיו', body: 'ביטוי שמתחרה מקדים אתכם בו הוא נושא טוב למאמר הבא.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'שלושה צעדים',
          items: [
            { title: 'מוסיפים מתחרים', body: 'בהגדרות הפרויקט מכניסים את שם המתחרה ואת האתר שלו.' },
            { title: 'המערכת בודקת', body: 'בכל בדיקת מיקומים נשמר גם המיקום של המתחרים על אותם ביטויים.' },
            { title: 'רואים את ההשוואה', body: 'מעל טבלת הביטויים ובלוח הבקרה: מי לפניכם, ועל כמה ביטויים.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'על הנתונים',
          body: <p>ההשוואה בנויה רק ממה שהבדיקות שלנו מצאו בפועל בגוגל, על הביטויים שאתם עוקבים אחריהם. מתחרה שהוספתם אחרי בדיקה יופיע מהבדיקה הבאה.</p>,
        },
      ],
      cta: { title: 'תראו מי לפניכם בגוגל', body: he.closeBody, primary: he.check, secondary: he.trial },
    },
    en: {
      hero: {
        eyebrow: 'You vs. competitors',
        eyebrowIcon: Users,
        title: 'Know exactly',
        accent: 'where competitors are ahead',
        subtitle: 'Add your competitors in project settings, and every rank check shows on how many keywords each of them ranks above you in Google. The AI visibility check shows who ChatGPT, Gemini and Google AI mention when they do not mention you.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="You vs. competitors"
            rows={[
              { title: 'Competitor A', detail: 'above you on 6 of 24 keywords', url: 'example-a.com', icon: Users, done: false, status: 'Ahead of you' },
              { title: 'Competitor B', detail: 'above you on 2 of 24 keywords', url: 'example-b.com', icon: Users, done: true, status: 'You lead' },
              { title: 'Competitor C', detail: 'not in the top 20 results', url: 'example-c.com', icon: Users, done: true, status: 'You lead' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Why it matters',
          title: 'A ranking on its own does not tell the whole story',
          intro: 'Fifth place can be a win or a problem. It depends on who is above you.',
          items: [
            { icon: Target, title: 'Where they are ahead', body: 'For each competitor: on how many of your keywords it ranked above you in the latest check.' },
            { icon: Sparkles, title: 'Who is mentioned instead', body: 'In AI engine answers: which businesses and sites appear when you do not.' },
            { icon: FileText, title: 'What to write next', body: 'A keyword where a competitor is ahead of you is a good topic for the next article.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'Three steps',
          items: [
            { title: 'Add competitors', body: 'In project settings, enter the competitor\'s name and website.' },
            { title: 'The system checks', body: 'Every rank check also records where your competitors rank on the same keywords.' },
            { title: 'See the comparison', body: 'Above the keywords table and on the dashboard: who is ahead of you, and on how many keywords.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'About the data',
          body: <p>The comparison is built only from what our checks actually found in Google, on the keywords you track. A competitor added after a check appears from the next one.</p>,
        },
      ],
      cta: { title: 'See who is ahead of you in Google', body: en.closeBody, primary: en.check, secondary: en.trial },
    },
    es: {
      hero: {
        eyebrow: 'Tú frente a la competencia',
        eyebrowIcon: Users,
        title: 'Sabes exactamente',
        accent: 'dónde te adelanta la competencia',
        subtitle: 'Añade a tus competidores en la configuración del proyecto y cada revisión de posiciones mostrará en cuántas palabras clave cada uno aparece por encima de ti en Google. La revisión de visibilidad en IA muestra a quién mencionan ChatGPT, Gemini y Google AI cuando no te mencionan a ti.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Tú frente a la competencia"
            rows={[
              { title: 'Competidor A', detail: 'por encima de ti en 6 de 24 palabras clave', url: 'example-a.com', icon: Users, done: false, status: 'Te adelanta' },
              { title: 'Competidor B', detail: 'por encima de ti en 2 de 24 palabras clave', url: 'example-b.com', icon: Users, done: true, status: 'Vas delante' },
              { title: 'Competidor C', detail: 'fuera de los 20 primeros resultados', url: 'example-c.com', icon: Users, done: true, status: 'Vas delante' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por qué importa',
          title: 'Una posición por sí sola no lo cuenta todo',
          intro: 'El quinto puesto puede ser un éxito o un problema. Depende de quién esté por encima.',
          items: [
            { icon: Target, title: 'Dónde te adelantan', body: 'Para cada competidor: en cuántas de tus palabras clave apareció por encima de ti en la última revisión.' },
            { icon: Sparkles, title: 'A quién mencionan en tu lugar', body: 'En las respuestas de los motores de IA: qué negocios y sitios aparecen cuando tú no.' },
            { icon: FileText, title: 'Qué escribir ahora', body: 'Una palabra clave en la que un competidor te adelanta es un buen tema para el próximo artículo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'Tres pasos',
          items: [
            { title: 'Añade competidores', body: 'En la configuración del proyecto, escribe el nombre del competidor y su sitio web.' },
            { title: 'El sistema revisa', body: 'Cada revisión de posiciones guarda también dónde aparecen tus competidores en las mismas palabras clave.' },
            { title: 'Ve la comparación', body: 'Encima de la tabla de palabras clave y en el panel: quién va por delante y en cuántas palabras clave.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sobre los datos',
          body: <p>La comparación se construye solo con lo que nuestras revisiones encontraron realmente en Google, en las palabras clave que sigues. Un competidor añadido después de una revisión aparece a partir de la siguiente.</p>,
        },
      ],
      cta: { title: 'Mira quién te adelanta en Google', body: es.closeBody, primary: es.check, secondary: es.trial },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Você x concorrentes',
        eyebrowIcon: Users,
        title: 'Saiba exatamente',
        accent: 'onde os concorrentes estão na frente',
        subtitle: 'Adicione os seus concorrentes nas configurações do projeto e cada verificação de posições mostra em quantas palavras-chave cada um aparece acima de você no Google. A verificação de visibilidade em IA mostra quem o ChatGPT, o Gemini e o Google AI citam quando não citam você.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="Você x concorrentes"
            rows={[
              { title: 'Concorrente A', detail: 'acima de você em 6 de 24 palavras-chave', url: 'example-a.com.br', icon: Users, done: false, status: 'Na sua frente' },
              { title: 'Concorrente B', detail: 'acima de você em 2 de 24 palavras-chave', url: 'example-b.com.br', icon: Users, done: true, status: 'Você lidera' },
              { title: 'Concorrente C', detail: 'fora dos 20 primeiros resultados', url: 'example-c.com.br', icon: Users, done: true, status: 'Você lidera' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por que importa',
          title: 'A posição sozinha não conta a história toda',
          intro: 'O quinto lugar pode ser uma vitória ou um problema. Depende de quem está acima.',
          items: [
            { icon: Target, title: 'Onde eles estão na frente', body: 'Para cada concorrente: em quantas das suas palavras-chave ele apareceu acima de você na última verificação.' },
            { icon: Sparkles, title: 'Quem é citado no seu lugar', body: 'Nas respostas dos mecanismos de IA: quais negócios e sites aparecem quando você não aparece.' },
            { icon: FileText, title: 'O que escrever agora', body: 'Uma palavra-chave em que um concorrente está na sua frente é um bom tema para o próximo artigo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'Três passos',
          items: [
            { title: 'Adicione concorrentes', body: 'Nas configurações do projeto, informe o nome do concorrente e o site dele.' },
            { title: 'O sistema verifica', body: 'Cada verificação de posições também registra onde os concorrentes aparecem nas mesmas palavras-chave.' },
            { title: 'Veja a comparação', body: 'Acima da tabela de palavras-chave e no painel: quem está na sua frente, e em quantas palavras-chave.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sobre os dados',
          body: <p>A comparação é feita só com o que as nossas verificações encontraram de fato no Google, nas palavras-chave que você acompanha. Um concorrente adicionado depois de uma verificação aparece a partir da próxima.</p>,
        },
      ],
      cta: { title: 'Veja quem está na sua frente no Google', body: pt.closeBody, primary: pt.check, secondary: pt.trial },
    },
  },
}

// ── Search Console ────────────────────────────────────────────────────────────

export const SEARCH_CONSOLE_PAGE: MarketingPage = {
  path: '/features/search-console',
  meta: {
    he: {
      title: 'נתוני Search Console | Go Top SEO',
      description: 'מחברים את Google Search Console ורואים קליקים, חשיפות ומיקום ממוצע ב-28 הימים האחרונים, את העמודים המובילים ואת החיפושים שאתם כבר מופיעים בהם. כולל הורדה ל-PDF ו-Excel.',
    },
    en: {
      title: 'Search Console Data | Go Top SEO',
      description: 'Connect Google Search Console and see clicks, impressions and average position over the last 28 days, your top pages and the searches you already appear for. Download as PDF or Excel.',
    },
    es: {
      title: 'Datos de Search Console | Go Top SEO',
      description: 'Conecta Google Search Console y consulta clics, impresiones y posición media de los últimos 28 días, tus páginas principales y las búsquedas en las que ya apareces. Descarga en PDF o Excel.',
    },
    'pt-BR': {
      title: 'Dados do Search Console | Go Top SEO',
      description: 'Conecte o Google Search Console e veja cliques, impressões e posição média dos últimos 28 dias, as suas páginas principais e as buscas em que você já aparece. Baixe em PDF ou Excel.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'נתוני Search Console',
        eyebrowIcon: LineChart,
        title: 'מה גוגל עצמו',
        accent: 'אומר על האתר שלכם',
        subtitle: 'מחברים את Google Search Console, ורואים במערכת כמה קליקים וחשיפות האתר קיבל ב-28 הימים האחרונים ומה המיקום הממוצע שלו. לכל נתון מוצג גם השינוי לעומת 28 הימים שלפני כן.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="28 הימים האחרונים"
            rows={[
              { title: 'קליקים מגוגל', detail: 'לעומת 28 הימים הקודמים', icon: MousePointerClick, done: true, status: 'עלייה' },
              { title: 'חשיפות בתוצאות', detail: 'לעומת 28 הימים הקודמים', icon: Eye, done: true, status: 'עלייה' },
              { title: 'מיקום ממוצע', detail: 'לעומת 28 הימים הקודמים', icon: Search, done: false, status: 'ללא שינוי' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה רואים',
          title: 'הנתונים של גוגל, במקום שבו אתם עובדים',
          items: [
            { icon: LineChart, title: 'המגמה', body: 'קליקים, חשיפות ומיקום ממוצע, עם השינוי לעומת התקופה הקודמת.' },
            { icon: BarChart3, title: 'העמודים המובילים', body: 'חמשת העמודים שגוגל שולח אליהם הכי הרבה קליקים.' },
            { icon: Plus, title: 'חיפושים שאתם כבר בהם', body: 'חיפושים שגוגל כבר מציג אתכם בהם ושאתם עוד לא עוקבים אחריהם. מוסיפים למעקב בלחיצה.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך מתחברים',
          title: 'חיבור אחד לחשבון Google',
          items: [
            { title: 'מתחברים עם Google', body: 'בהגדרות הפרויקט מאשרים למערכת לקרוא את נתוני Search Console.' },
            { title: 'בוחרים את האתר', body: 'בוחרים את הנכס ב-Search Console שמתאים לפרויקט.' },
            { title: 'הנתונים מתעדכנים', body: 'המערכת מושכת את הנתונים בעצמה, והם מופיעים במסך הדוחות.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'הורדה ושיתוף',
          body: <p>את הנתונים אפשר להוריד כסיכום PDF של שני עמודים, או את כל השורות ב-Excel או CSV.</p>,
        },
      ],
      cta: { title: 'חברו את Search Console לפרויקט', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'Search Console data',
        eyebrowIcon: LineChart,
        title: 'What Google itself',
        accent: 'says about your site',
        subtitle: 'Connect Google Search Console and see in the system how many clicks and impressions your site got over the last 28 days, and its average position. Each figure also shows the change against the 28 days before.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="The last 28 days"
            rows={[
              { title: 'Clicks from Google', detail: 'against the previous 28 days', icon: MousePointerClick, done: true, status: 'Up' },
              { title: 'Impressions in results', detail: 'against the previous 28 days', icon: Eye, done: true, status: 'Up' },
              { title: 'Average position', detail: 'against the previous 28 days', icon: Search, done: false, status: 'No change' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What you see',
          title: 'Google\'s own figures, where you work',
          items: [
            { icon: LineChart, title: 'The trend', body: 'Clicks, impressions and average position, with the change against the previous period.' },
            { icon: BarChart3, title: 'Top pages', body: 'The five pages Google sends the most clicks to.' },
            { icon: Plus, title: 'Searches you already appear for', body: 'Searches Google already shows you for that you do not track yet. Add them to tracking in one click.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Connecting',
          title: 'One connection to your Google account',
          items: [
            { title: 'Sign in with Google', body: 'In project settings, allow the system to read your Search Console data.' },
            { title: 'Choose the site', body: 'Pick the Search Console property that matches the project.' },
            { title: 'The figures update', body: 'The system pulls the data on its own, and it appears on the Reports screen.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Download and share',
          body: <p>Download the figures as a two-page PDF summary, or every row in Excel or CSV.</p>,
        },
      ],
      cta: { title: 'Connect Search Console to your project', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Datos de Search Console',
        eyebrowIcon: LineChart,
        title: 'Lo que el propio Google',
        accent: 'dice de tu sitio',
        subtitle: 'Conecta Google Search Console y consulta en el sistema cuántos clics e impresiones recibió tu sitio en los últimos 28 días y su posición media. Cada dato muestra también el cambio respecto a los 28 días anteriores.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Los últimos 28 días"
            rows={[
              { title: 'Clics desde Google', detail: 'frente a los 28 días anteriores', icon: MousePointerClick, done: true, status: 'Sube' },
              { title: 'Impresiones en resultados', detail: 'frente a los 28 días anteriores', icon: Eye, done: true, status: 'Sube' },
              { title: 'Posición media', detail: 'frente a los 28 días anteriores', icon: Search, done: false, status: 'Sin cambios' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué ves',
          title: 'Los datos de Google, donde trabajas',
          items: [
            { icon: LineChart, title: 'La tendencia', body: 'Clics, impresiones y posición media, con el cambio respecto al periodo anterior.' },
            { icon: BarChart3, title: 'Páginas principales', body: 'Las cinco páginas a las que Google envía más clics.' },
            { icon: Plus, title: 'Búsquedas en las que ya apareces', body: 'Búsquedas en las que Google ya te muestra y que aún no sigues. Añádelas al seguimiento con un clic.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo conectarlo',
          title: 'Una conexión con tu cuenta de Google',
          items: [
            { title: 'Inicia sesión con Google', body: 'En la configuración del proyecto, permite que el sistema lea tus datos de Search Console.' },
            { title: 'Elige el sitio', body: 'Selecciona la propiedad de Search Console que corresponde al proyecto.' },
            { title: 'Los datos se actualizan', body: 'El sistema obtiene los datos por sí solo y aparecen en la pantalla de informes.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Descargar y compartir',
          body: <p>Descarga los datos como un resumen en PDF de dos páginas, o todas las filas en Excel o CSV.</p>,
        },
      ],
      cta: { title: 'Conecta Search Console a tu proyecto', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Dados do Search Console',
        eyebrowIcon: LineChart,
        title: 'O que o próprio Google',
        accent: 'diz sobre o seu site',
        subtitle: 'Conecte o Google Search Console e veja no sistema quantos cliques e impressões o seu site recebeu nos últimos 28 dias e a posição média dele. Cada número mostra também a variação em relação aos 28 dias anteriores.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="Os últimos 28 dias"
            rows={[
              { title: 'Cliques do Google', detail: 'em relação aos 28 dias anteriores', icon: MousePointerClick, done: true, status: 'Subiu' },
              { title: 'Impressões nos resultados', detail: 'em relação aos 28 dias anteriores', icon: Eye, done: true, status: 'Subiu' },
              { title: 'Posição média', detail: 'em relação aos 28 dias anteriores', icon: Search, done: false, status: 'Sem mudança' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que você vê',
          title: 'Os números do Google, onde você trabalha',
          items: [
            { icon: LineChart, title: 'A tendência', body: 'Cliques, impressões e posição média, com a variação em relação ao período anterior.' },
            { icon: BarChart3, title: 'Páginas principais', body: 'As cinco páginas para as quais o Google envia mais cliques.' },
            { icon: Plus, title: 'Buscas em que você já aparece', body: 'Buscas em que o Google já mostra você e que você ainda não acompanha. Adicione ao acompanhamento com um clique.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como conectar',
          title: 'Uma conexão com a sua conta Google',
          items: [
            { title: 'Entre com o Google', body: 'Nas configurações do projeto, permita que o sistema leia os seus dados do Search Console.' },
            { title: 'Escolha o site', body: 'Selecione a propriedade do Search Console que corresponde ao projeto.' },
            { title: 'Os números se atualizam', body: 'O sistema busca os dados sozinho, e eles aparecem na tela de relatórios.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Baixar e compartilhar',
          body: <p>Baixe os números como um resumo em PDF de duas páginas, ou todas as linhas em Excel ou CSV.</p>,
        },
      ],
      cta: { title: 'Conecte o Search Console ao seu projeto', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
  },
}

