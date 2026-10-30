/**
 * /features/site-health-fixes in four languages. Every claim here maps to code:
 * the scan's finding kinds (lib/site-health/types.ts), the fix types and the
 * preview-then-approve flow with undo (lib/site-fix), WordPress as the only
 * platform we write to in full, and on Shopify only the store's blog articles and pages
 * (lib/site-fix/channel.ts, lib/site-fix/shopify-admin.ts).
 */
import { Code2, FileSearch, Heading1, Image as ImageIcon, Info, Link2, RotateCcw, ScanSearch, ShieldCheck, Type, Wrench } from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']
const fr = FEATURE_COMMON.fr
const it = FEATURE_COMMON.it

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
    fr: {
      title: 'Corrections du site | Go Top SEO',
      description: 'Un audit du site qui trouve ce qui freine votre site dans Google et dans les moteurs d’IA : titres, descriptions, textes alternatifs, liens cassés et plus. Sur WordPress, chaque correction se fait en un clic après votre validation, et reste annulable.',
    },
    it: {
      title: 'Correzioni del sito | Go Top SEO',
      description: 'Un’analisi del sito che trova ciò che lo frena su Google e nei motori di IA: titoli, descrizioni, testi alternativi, link rotti e altro. Su WordPress ogni correzione si applica con un clic dopo l’approvazione, e resta annullabile.',
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
            { title: 'מאשרים', body: 'באתר וורדפרס מחובר, ובמאמרים ובעמודים של חנות שופיפיי מחוברת, התיקון נכתב לאתר. בשאר המקרים מקבלים הוראות צעד אחר צעד.' },
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
            <p>הסריקה עובדת על כל אתר. בחנות שופיפיי מחוברת המערכת מתקנת את המאמרים והעמודים של החנות אחרי שאישרתם: כותרת ותיאור לגוגל, טקסט חלופי לתמונות, קישור שבור, שאלות נפוצות וכותרת ראשית כפולה. גם כאן אפשר לבטל כל תיקון. מוצרים, קטגוריות והגדרות החנות לא משתנים. בוויקס ובשאר הפלטפורמות המערכת לא כותבת לאתר, ומציגה לכל בעיה הוראות קצרות איך לתקן אותה בעצמכם.</p>
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
            { title: 'Approve', body: 'On a connected WordPress site, and on the articles and pages of a connected Shopify store, the fix is written to the site. Otherwise you get step-by-step instructions.' },
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
            <p>The scan works on any site. On a connected Shopify store the system fixes the store&apos;s blog articles and pages after you approve: the title and description Google shows, image alt text, a broken link, an FAQ block and an extra main heading. Each fix can be undone here too. Products, collections and store settings are never changed. On Wix and other platforms the system does not write to the site; it shows short instructions for fixing each issue yourself.</p>
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
            { title: 'Aprueba', body: 'En un sitio WordPress conectado, y en los artículos y páginas de una tienda Shopify conectada, la corrección se escribe en el sitio. En los demás casos recibes instrucciones paso a paso.' },
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
            <p>El análisis funciona en cualquier sitio. En una tienda Shopify conectada, el sistema corrige los artículos del blog y las páginas de la tienda después de que lo apruebas: el título y la descripción que muestra Google, el texto alternativo de las imágenes, un enlace roto, un bloque de preguntas frecuentes y un encabezado principal de más. También aquí cada corrección se puede deshacer. Los productos, las colecciones y la configuración de la tienda nunca se modifican. En Wix y otras plataformas el sistema no escribe en el sitio: muestra instrucciones breves para que corrijas cada problema tú mismo.</p>
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
            { title: 'Aprove', body: 'Num site WordPress conectado, e nos artigos e páginas de uma loja Shopify conectada, a correção é gravada no site. Nos demais casos você recebe instruções passo a passo.' },
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
            <p>A análise funciona em qualquer site. Numa loja Shopify conectada, o sistema corrige os artigos do blog e as páginas da loja depois que você aprova: o título e a descrição que o Google mostra, o texto alternativo das imagens, um link quebrado, um bloco de perguntas frequentes e um título principal a mais. Aqui também cada correção pode ser desfeita. Produtos, coleções e configurações da loja nunca são alterados. No Wix e em outras plataformas o sistema não grava no site: mostra instruções curtas para você corrigir cada problema.</p>
          ),
        },
      ],
      cta: { title: 'Veja o que atrapalha o seu site', body: pt.closeBody, primary: pt.check, secondary: pt.trial },
    },
    fr: {
      hero: {
        eyebrow: 'Corrections du site',
        eyebrowIcon: Wrench,
        title: 'Ce qui freine votre site,',
        accent: 'corrigé après votre validation',
        subtitle: 'Le système analyse votre site et repère les titres absents ou trop longs, les descriptions manquantes, les images sans texte alternatif, les liens cassés et les pages bloquées à Google ou aux moteurs d’IA. Sur un site WordPress connecté, la plupart des corrections se font en un clic, après que vous avez vu exactement ce qui va changer.',
        trust: fr.trust,
        primary: fr.check,
        secondary: fr.trial,
        visual: (
          <WorkListVisual
            heading="Corrections du site"
            rows={[
              { title: 'Titre trop long', detail: '', url: '/services/installation-clim', icon: Type, done: true, status: 'Corrigé' },
              { title: 'Images sans texte alternatif', detail: '4 images', url: '/blog/guide-clim', icon: ImageIcon, done: true, status: 'Corrigé' },
              { title: 'Lien cassé', detail: '', url: '/a-propos', icon: Link2, done: false, status: 'En attente de validation' },
              { title: 'Description manquante', detail: '', url: '/contact', icon: FileSearch, done: false, status: 'En attente de validation' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Pourquoi c’est important',
          title: 'Un bon contenu ne sert à rien si le site lui-même fait obstacle',
          intro: 'Un titre coupé dans les résultats, une image que Google ne comprend pas, un lien qui finit sur une page d’erreur. Chacun est petit. Ensemble, ils tirent le site vers le bas.',
          items: [
            { icon: ScanSearch, title: 'Vous voyez ce qui bloque', body: 'Chaque problème est listé avec les pages où il apparaît, classé par gravité.' },
            { icon: ShieldCheck, title: 'Rien ne change sans vous', body: 'Chaque correction a un aperçu : ce que la page dit aujourd’hui et ce qui va le remplacer.' },
            { icon: RotateCcw, title: 'Annulable à tout moment', body: 'Une correction faite par le système conserve la valeur précédente, donc vous pouvez revenir en arrière.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Comment ça marche',
          title: 'De l’audit au site corrigé',
          items: [
            { title: 'Analysez le site', body: 'Le système parcourt vos pages et renvoie une liste de problèmes par gravité.' },
            { title: 'Examinez la proposition', body: 'Chaque problème arrive avec une correction proposée, la valeur actuelle et la nouvelle côte à côte.' },
            { title: 'Validez', body: 'Sur un site WordPress connecté, et sur les articles et les pages d’une boutique Shopify connectée, la correction est écrite sur le site. Sinon, vous recevez des instructions pas à pas.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Ce qui est corrigé sur WordPress',
          title: 'Les corrections que le système fait tout seul',
          items: [
            { icon: Type, title: 'Titres SEO', body: 'Un titre absent, trop court ou trop long est réécrit. Avec Yoast ou Rank Math, il est enregistré dans leur champ.' },
            { icon: FileSearch, title: 'Méta-descriptions', body: 'Une description absente, ou d’une longueur inadaptée. Enregistrée dans l’extension SEO du site, via l’extension Go Top.' },
            { icon: ImageIcon, title: 'Texte alternatif des images', body: 'Seules les images du contenu sans texte alternatif en reçoivent un. Les autres ne sont pas touchées.' },
            { icon: Link2, title: 'Liens', body: 'Un lien cassé est remplacé ou retiré, et des liens internes sont ajoutés entre pages liées.' },
            { icon: Heading1, title: 'Titre principal', body: 'Une page avec plus d’un H1 ne garde qu’un seul titre principal, via l’extension Go Top.' },
            { icon: Code2, title: 'Questions fréquentes et llms.txt', body: 'Un bloc de questions fréquentes sur la page, et un fichier llms.txt qui décrit le site aux moteurs d’IA, via l’extension Go Top.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sur Shopify et les autres plateformes',
          body: (
            <p>L’audit fonctionne sur n’importe quel site. Sur une boutique Shopify connectée, le système corrige les articles du blog et les pages de la boutique après votre validation : le titre et la description que Google affiche, le texte alternatif des images, un lien cassé, un bloc de questions fréquentes et un titre principal en trop. Ici aussi, chaque correction peut être annulée. Les produits, les collections et les réglages de la boutique ne sont jamais modifiés. Sur Wix et les autres plateformes, le système n’écrit pas sur le site : il affiche de courtes instructions pour corriger chaque problème vous-même.</p>
          ),
        },
      ],
      cta: { title: 'Voyez ce qui freine votre site', body: fr.closeBody, primary: fr.check, secondary: fr.trial },
    },
    it: {
      hero: {
        eyebrow: 'Correzioni del sito',
        eyebrowIcon: Wrench,
        title: 'Ciò che frena il sito,',
        accent: 'corretto dopo l’approvazione',
        subtitle: 'Il sistema analizza il sito e individua i titoli assenti o troppo lunghi, le descrizioni mancanti, le immagini senza testo alternativo, i link rotti e le pagine bloccate a Google o ai motori di IA. Su un sito WordPress collegato la maggior parte delle correzioni si applica con un clic, dopo aver visto esattamente che cosa cambierà.',
        trust: it.trust,
        primary: it.check,
        secondary: it.trial,
        visual: (
          <WorkListVisual
            heading="Correzioni del sito"
            rows={[
              { title: 'Titolo troppo lungo', detail: '', url: '/servizi/installazione-clima', icon: Type, done: true, status: 'Corretto' },
              { title: 'Immagini senza testo alternativo', detail: '4 immagini', url: '/blog/guida-clima', icon: ImageIcon, done: true, status: 'Corretto' },
              { title: 'Link rotto', detail: '', url: '/chi-siamo', icon: Link2, done: false, status: 'In attesa di approvazione' },
              { title: 'Descrizione mancante', detail: '', url: '/contatti', icon: FileSearch, done: false, status: 'In attesa di approvazione' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Perché è importante',
          title: 'Un buon contenuto non serve a nulla se il sito stesso fa da ostacolo',
          intro: 'Un titolo tagliato nei risultati, un’immagine che Google non capisce, un link che finisce su una pagina di errore. Ognuno è piccolo. Insieme tirano il sito verso il basso.',
          items: [
            { icon: ScanSearch, title: 'Si vede che cosa blocca', body: 'Ogni problema è elencato con le pagine in cui compare, ordinato per gravità.' },
            { icon: ShieldCheck, title: 'Nulla cambia senza approvazione', body: 'Ogni correzione ha un’anteprima: ciò che la pagina dice oggi e ciò che lo sostituirà.' },
            { icon: RotateCcw, title: 'Annullabile in qualsiasi momento', body: 'Una correzione fatta dal sistema conserva il valore precedente, quindi si può tornare indietro.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Come funziona',
          title: 'Dall’analisi al sito corretto',
          items: [
            { title: 'Analisi del sito', body: 'Il sistema percorre le pagine e restituisce un elenco di problemi per gravità.' },
            { title: 'Esame della proposta', body: 'Ogni problema arriva con una correzione proposta, il valore attuale e quello nuovo affiancati.' },
            { title: 'Approvazione', body: 'Su un sito WordPress collegato, e sugli articoli e sulle pagine di un negozio Shopify collegato, la correzione viene scritta sul sito. Altrimenti si ricevono istruzioni passo per passo.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Che cosa viene corretto su WordPress',
          title: 'Le correzioni che il sistema fa da sé',
          items: [
            { icon: Type, title: 'Titoli SEO', body: 'Un titolo assente, troppo corto o troppo lungo viene riscritto. Con Yoast o Rank Math viene salvato nel loro campo.' },
            { icon: FileSearch, title: 'Meta description', body: 'Una descrizione assente, o di lunghezza inadatta. Salvata nell’estensione SEO del sito, tramite l’estensione Go Top.' },
            { icon: ImageIcon, title: 'Testo alternativo delle immagini', body: 'Solo le immagini del contenuto senza testo alternativo ne ricevono uno. Le altre non vengono toccate.' },
            { icon: Link2, title: 'Link', body: 'Un link rotto viene sostituito o rimosso, e si aggiungono link interni fra pagine collegate.' },
            { icon: Heading1, title: 'Titolo principale', body: 'Una pagina con più di un H1 mantiene un solo titolo principale, tramite l’estensione Go Top.' },
            { icon: Code2, title: 'Domande frequenti e llms.txt', body: 'Un blocco di domande frequenti sulla pagina e un file llms.txt che descrive il sito ai motori di IA, tramite l’estensione Go Top.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Su Shopify e sulle altre piattaforme',
          body: (
            <p>L’analisi funziona su qualsiasi sito. Su un negozio Shopify collegato il sistema corregge gli articoli del blog e le pagine del negozio dopo l’approvazione: il titolo e la descrizione che Google mostra, il testo alternativo delle immagini, un link rotto, un blocco di domande frequenti e un titolo principale in eccesso. Anche qui ogni correzione può essere annullata. I prodotti, le collezioni e le impostazioni del negozio non vengono mai modificati. Su Wix e sulle altre piattaforme il sistema non scrive sul sito: mostra brevi istruzioni per correggere ogni problema in autonomia.</p>
          ),
        },
      ],
      cta: { title: 'Scopra che cosa frena il suo sito', body: it.closeBody, primary: it.check, secondary: it.trial },
    },
  },
}

