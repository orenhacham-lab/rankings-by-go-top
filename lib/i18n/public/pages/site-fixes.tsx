/**
 * /features/site-health-fixes in four languages. Every claim here maps to code:
 * the scan's finding kinds (lib/site-health/types.ts), the fix types and the
 * preview-then-approve flow with undo (lib/site-fix), WordPress as the only
 * platform we write to, and Shopify read-only (lib/site-fix/channel.ts).
 */
import { Code2, FileSearch, Heading1, Image as ImageIcon, Info, Link2, RotateCcw, ScanSearch, ShieldCheck, Type, Wrench } from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']

export const SITE_FIXES_PAGE: MarketingPage = {
  path: '/features/site-health-fixes',
  meta: {
    he: {
      title: 'תיקוני אתר | Go Top SEO',
      description: 'סריקה שמוצאת מה מפריע לגוגל ולמנועי AI באתר: כותרות, תיאורים, טקסט חלופי, קישורים שבורים ועוד. בוורדפרס התיקון נעשה בלחיצה, אחרי שאישרתם, ואפשר לבטל אותו.',
    },
    en: {
      title: 'Site Fixes | Go Top SEO',
      description: 'A scan that finds what holds your site back in Google and AI engines: titles, descriptions, alt text, broken links and more. On WordPress each fix is one click after you approve it, and can be undone.',
    },
    es: {
      title: 'Correcciones del sitio | Go Top SEO',
      description: 'Un análisis que encuentra lo que frena a tu sitio en Google y en los motores de IA: títulos, descripciones, texto alternativo, enlaces rotos y más. En WordPress cada corrección se aplica con un clic después de aprobarla, y se puede deshacer.',
    },
    'pt-BR': {
      title: 'Correções no site | Go Top SEO',
      description: 'Uma análise que encontra o que atrapalha o seu site no Google e nos mecanismos de IA: títulos, descrições, texto alternativo, links quebrados e mais. No WordPress cada correção é aplicada com um clique depois que você aprova, e pode ser desfeita.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'תיקוני אתר',
        eyebrowIcon: Wrench,
        title: 'מה שמפריע לגוגל באתר,',
        accent: 'מתוקן אחרי שאישרתם',
        subtitle: 'המערכת סורקת את האתר ומוצאת כותרות חסרות או ארוכות מדי, תיאורים חסרים, תמונות בלי טקסט חלופי, קישורים שבורים ועמודים שחסומים לגוגל או למנועי AI. באתר וורדפרס מחובר רוב התיקונים נעשים בלחיצה, אחרי שראיתם בדיוק מה ישתנה.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="תיקונים באתר"
            rows={[
              { title: 'כותרת ארוכה מדי', detail: '', url: '/services/ac-installation', icon: Type, done: true, status: 'תוקן' },
              { title: 'תמונות בלי טקסט חלופי', detail: '4 תמונות', url: '/blog/ac-guide', icon: ImageIcon, done: true, status: 'תוקן' },
              { title: 'קישור שבור', detail: '', url: '/about', icon: Link2, done: false, status: 'ממתין לאישור' },
              { title: 'תיאור חסר', detail: '', url: '/contact', icon: FileSearch, done: false, status: 'ממתין לאישור' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'למה זה חשוב',
          title: 'תוכן טוב לא עוזר כשהאתר עצמו מפריע',
          intro: 'כותרת שנחתכת בתוצאות, תמונה שגוגל לא מבין, קישור שמוביל לעמוד שגיאה. כל אחד מהם קטן, וביחד הם מושכים את האתר למטה.',
          items: [
            { icon: ScanSearch, title: 'רואים מה תקוע', body: 'כל בעיה מוצגת עם העמודים שבהם היא מופיעה, מסודרת לפי חומרה.' },
            { icon: ShieldCheck, title: 'שום דבר לא משתנה בלי אישור', body: 'לכל תיקון יש תצוגה מקדימה: מה כתוב היום ומה ייכתב במקומו.' },
            { icon: RotateCcw, title: 'אפשר להחזיר', body: 'תיקון שנעשה דרך המערכת נשמר עם הערך הקודם, ואפשר לבטל אותו.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'מסריקה לאתר מתוקן',
          items: [
            { title: 'סורקים את האתר', body: 'המערכת עוברת על עמודי האתר ומחזירה רשימת בעיות לפי חומרה.' },
            { title: 'בודקים את ההצעה', body: 'לכל בעיה מוצג תיקון מוצע, עם הערך הנוכחי והערך החדש זה לצד זה.' },
            { title: 'מאשרים', body: 'באתר וורדפרס מחובר התיקון נכתב לאתר. בשאר הפלטפורמות מקבלים הוראות צעד אחר צעד.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'מה מתקנים בוורדפרס',
          title: 'התיקונים שהמערכת יודעת לעשות בעצמה',
          items: [
            { icon: Type, title: 'כותרות SEO', body: 'כותרת חסרה, קצרה או ארוכה מדי נכתבת מחדש. עם Yoast או Rank Math היא נשמרת בשדה שלהם.' },
            { icon: FileSearch, title: 'תיאורי מטא', body: 'תיאור חסר או באורך לא נכון. נשמר בתוסף ה-SEO של האתר, דרך התוסף של Go Top.' },
            { icon: ImageIcon, title: 'טקסט חלופי לתמונות', body: 'רק תמונות בתוכן שאין להן טקסט חלופי מקבלות אחד. שאר התמונות לא נוגעים בהן.' },
            { icon: Link2, title: 'קישורים', body: 'קישור שבור מוחלף או מוסר, ונוספים קישורים פנימיים בין עמודים קשורים.' },
            { icon: Heading1, title: 'כותרת ראשית', body: 'עמוד עם יותר מכותרת H1 אחת מקבל כותרת ראשית אחת, דרך התוסף של Go Top.' },
            { icon: Code2, title: 'שאלות נפוצות ו-llms.txt', body: 'בלוק שאלות נפוצות בעמוד, וקובץ llms.txt שמסביר את האתר למנועי AI, דרך התוסף של Go Top.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'בשופיפיי ובפלטפורמות אחרות',
          body: (
            <p>הסריקה עובדת על כל אתר. בשופיפיי, בוויקס ובשאר הפלטפורמות המערכת לא כותבת לאתר, ומציגה לכל בעיה הוראות קצרות איך לתקן אותה בעצמכם.</p>
          ),
        },
      ],
      cta: { title: 'תראו מה מפריע לאתר שלכם', body: he.closeBody, primary: he.check, secondary: he.trial },
    },
    en: {
      hero: {
        eyebrow: 'Site fixes',
        eyebrowIcon: Wrench,
        title: 'What holds your site back,',
        accent: 'fixed once you approve',
        subtitle: 'The system scans your site and finds missing or overlong titles, missing descriptions, images without alt text, broken links, and pages blocked to Google or to AI engines. On a connected WordPress site most fixes take one click, after you have seen exactly what will change.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="Site fixes"
            rows={[
              { title: 'Title too long', detail: '', url: '/services/ac-installation', icon: Type, done: true, status: 'Fixed' },
              { title: 'Images without alt text', detail: '4 images', url: '/blog/ac-guide', icon: ImageIcon, done: true, status: 'Fixed' },
              { title: 'Broken link', detail: '', url: '/about', icon: Link2, done: false, status: 'Awaiting approval' },
              { title: 'Missing description', detail: '', url: '/contact', icon: FileSearch, done: false, status: 'Awaiting approval' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Why it matters',
          title: 'Good content cannot help a site that gets in its own way',
          intro: 'A title cut off in the results, an image Google cannot read, a link that ends on an error page. Each one is small. Together they pull the site down.',
          items: [
            { icon: ScanSearch, title: 'See what is stuck', body: 'Every issue is listed with the pages it appears on, sorted by severity.' },
            { icon: ShieldCheck, title: 'Nothing changes without you', body: 'Every fix has a preview: what the page says today and what will replace it.' },
            { icon: RotateCcw, title: 'Undo anytime', body: 'A fix made through the system keeps the previous value, so you can roll it back.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'From scan to fixed site',
          items: [
            { title: 'Scan the site', body: 'The system goes through your pages and returns a list of issues by severity.' },
            { title: 'Review the suggestion', body: 'Each issue comes with a suggested fix, the current value and the new one side by side.' },
            { title: 'Approve', body: 'On a connected WordPress site the fix is written to the site. On other platforms you get step-by-step instructions.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'What gets fixed on WordPress',
          title: 'The fixes the system makes on its own',
          items: [
            { icon: Type, title: 'SEO titles', body: 'A missing, short or overlong title is rewritten. With Yoast or Rank Math it is saved in their field.' },
            { icon: FileSearch, title: 'Meta descriptions', body: 'A missing description, or one of the wrong length. Saved in the site\'s SEO plugin, through the Go Top plugin.' },
            { icon: ImageIcon, title: 'Image alt text', body: 'Only images in the content that have no alt text get one. Every other image is left alone.' },
            { icon: Link2, title: 'Links', body: 'A broken link is replaced or removed, and internal links are added between related pages.' },
            { icon: Heading1, title: 'Main heading', body: 'A page with more than one H1 is left with a single main heading, through the Go Top plugin.' },
            { icon: Code2, title: 'FAQ and llms.txt', body: 'An FAQ block on the page, and an llms.txt file that describes the site to AI engines, through the Go Top plugin.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'On Shopify and other platforms',
          body: (
            <p>The scan works on any site. On Shopify, Wix and other platforms the system does not write to the site; it shows short instructions for fixing each issue yourself.</p>
          ),
        },
      ],
      cta: { title: 'See what is holding your site back', body: en.closeBody, primary: en.check, secondary: en.trial },
    },
    es: {
      hero: {
        eyebrow: 'Correcciones del sitio',
        eyebrowIcon: Wrench,
        title: 'Lo que frena a tu sitio,',
        accent: 'corregido cuando lo apruebas',
        subtitle: 'El sistema analiza tu sitio y encuentra títulos que faltan o son demasiado largos, descripciones ausentes, imágenes sin texto alternativo, enlaces rotos y páginas bloqueadas para Google o para los motores de IA. En un sitio WordPress conectado, la mayoría de las correcciones se aplican con un clic, después de ver exactamente qué va a cambiar.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Correcciones del sitio"
            rows={[
              { title: 'Título demasiado largo', detail: '', url: '/servicios/instalacion-aire', icon: Type, done: true, status: 'Corregido' },
              { title: 'Imágenes sin texto alternativo', detail: '4 imágenes', url: '/blog/guia-aire', icon: ImageIcon, done: true, status: 'Corregido' },
              { title: 'Enlace roto', detail: '', url: '/nosotros', icon: Link2, done: false, status: 'Pendiente de aprobación' },
              { title: 'Falta la descripción', detail: '', url: '/contacto', icon: FileSearch, done: false, status: 'Pendiente de aprobación' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por qué importa',
          title: 'El buen contenido no sirve si el propio sitio estorba',
          intro: 'Un título cortado en los resultados, una imagen que Google no entiende, un enlace que termina en una página de error. Cada uno es pequeño. Juntos hunden el sitio.',
          items: [
            { icon: ScanSearch, title: 'Ves lo que falla', body: 'Cada problema aparece con las páginas donde ocurre, ordenado por gravedad.' },
            { icon: ShieldCheck, title: 'Nada cambia sin tu aprobación', body: 'Cada corrección tiene una vista previa: lo que dice la página hoy y lo que lo sustituirá.' },
            { icon: RotateCcw, title: 'Se puede deshacer', body: 'Una corrección hecha desde el sistema guarda el valor anterior, así que puedes revertirla.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'Del análisis al sitio corregido',
          items: [
            { title: 'Analiza el sitio', body: 'El sistema recorre tus páginas y devuelve una lista de problemas por gravedad.' },
            { title: 'Revisa la propuesta', body: 'Cada problema trae una corrección sugerida, con el valor actual y el nuevo uno al lado del otro.' },
            { title: 'Aprueba', body: 'En un sitio WordPress conectado, la corrección se escribe en el sitio. En otras plataformas recibes instrucciones paso a paso.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Qué se corrige en WordPress',
          title: 'Las correcciones que el sistema hace por sí solo',
          items: [
            { icon: Type, title: 'Títulos SEO', body: 'Un título ausente, corto o demasiado largo se reescribe. Con Yoast o Rank Math se guarda en su campo.' },
            { icon: FileSearch, title: 'Meta descripciones', body: 'Una descripción ausente o de longitud incorrecta. Se guarda en el plugin SEO del sitio, a través del plugin de Go Top.' },
            { icon: ImageIcon, title: 'Texto alternativo', body: 'Solo las imágenes del contenido que no tienen texto alternativo reciben uno. Las demás no se tocan.' },
            { icon: Link2, title: 'Enlaces', body: 'Un enlace roto se sustituye o se elimina, y se añaden enlaces internos entre páginas relacionadas.' },
            { icon: Heading1, title: 'Encabezado principal', body: 'Una página con más de un H1 queda con un solo encabezado principal, a través del plugin de Go Top.' },
            { icon: Code2, title: 'Preguntas frecuentes y llms.txt', body: 'Un bloque de preguntas frecuentes en la página y un archivo llms.txt que describe el sitio a los motores de IA, a través del plugin de Go Top.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'En Shopify y otras plataformas',
          body: (
            <p>El análisis funciona en cualquier sitio. En Shopify, Wix y otras plataformas el sistema no escribe en el sitio: muestra instrucciones breves para que corrijas cada problema tú mismo.</p>
          ),
        },
      ],
      cta: { title: 'Descubre qué frena a tu sitio', body: es.closeBody, primary: es.check, secondary: es.trial },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Correções no site',
        eyebrowIcon: Wrench,
        title: 'O que atrapalha o seu site,',
        accent: 'corrigido quando você aprova',
        subtitle: 'O sistema analisa o seu site e encontra títulos ausentes ou longos demais, descrições faltando, imagens sem texto alternativo, links quebrados e páginas bloqueadas para o Google ou para os mecanismos de IA. Num site WordPress conectado, a maioria das correções sai com um clique, depois que você vê exatamente o que vai mudar.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="Correções no site"
            rows={[
              { title: 'Título longo demais', detail: '', url: '/servicos/instalacao-ar', icon: Type, done: true, status: 'Corrigido' },
              { title: 'Imagens sem texto alternativo', detail: '4 imagens', url: '/blog/guia-ar', icon: ImageIcon, done: true, status: 'Corrigido' },
              { title: 'Link quebrado', detail: '', url: '/sobre', icon: Link2, done: false, status: 'Aguardando aprovação' },
              { title: 'Descrição ausente', detail: '', url: '/contato', icon: FileSearch, done: false, status: 'Aguardando aprovação' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por que importa',
          title: 'Conteúdo bom não adianta quando o próprio site atrapalha',
          intro: 'Um título cortado nos resultados, uma imagem que o Google não entende, um link que termina numa página de erro. Cada um é pequeno. Juntos, puxam o site para baixo.',
          items: [
            { icon: ScanSearch, title: 'Veja o que está travando', body: 'Cada problema aparece com as páginas onde ocorre, em ordem de gravidade.' },
            { icon: ShieldCheck, title: 'Nada muda sem você', body: 'Cada correção tem uma prévia: o que a página diz hoje e o que vai substituir.' },
            { icon: RotateCcw, title: 'Dá para desfazer', body: 'Uma correção feita pelo sistema guarda o valor anterior, então você pode revertê-la.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'Da análise ao site corrigido',
          items: [
            { title: 'Analise o site', body: 'O sistema percorre as suas páginas e devolve uma lista de problemas por gravidade.' },
            { title: 'Confira a sugestão', body: 'Cada problema vem com uma correção sugerida, com o valor atual e o novo lado a lado.' },
            { title: 'Aprove', body: 'Num site WordPress conectado, a correção é gravada no site. Nas outras plataformas você recebe instruções passo a passo.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'O que é corrigido no WordPress',
          title: 'As correções que o sistema faz sozinho',
          items: [
            { icon: Type, title: 'Títulos de SEO', body: 'Um título ausente, curto ou longo demais é reescrito. Com Yoast ou Rank Math, ele é salvo no campo deles.' },
            { icon: FileSearch, title: 'Meta descrições', body: 'Uma descrição ausente ou com o tamanho errado. Salva no plugin de SEO do site, pelo plugin da Go Top.' },
            { icon: ImageIcon, title: 'Texto alternativo', body: 'Só as imagens do conteúdo que não têm texto alternativo recebem um. As outras não são tocadas.' },
            { icon: Link2, title: 'Links', body: 'Um link quebrado é substituído ou removido, e links internos são adicionados entre páginas relacionadas.' },
            { icon: Heading1, title: 'Título principal', body: 'Uma página com mais de um H1 fica com um único título principal, pelo plugin da Go Top.' },
            { icon: Code2, title: 'Perguntas frequentes e llms.txt', body: 'Um bloco de perguntas frequentes na página e um arquivo llms.txt que descreve o site para os mecanismos de IA, pelo plugin da Go Top.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'No Shopify e em outras plataformas',
          body: (
            <p>A análise funciona em qualquer site. No Shopify, no Wix e em outras plataformas o sistema não grava no site: mostra instruções curtas para você corrigir cada problema.</p>
          ),
        },
      ],
      cta: { title: 'Veja o que atrapalha o seu site', body: pt.closeBody, primary: pt.check, secondary: pt.trial },
    },
  },
}

