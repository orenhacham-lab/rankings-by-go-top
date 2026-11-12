/**
 * The comparison index: the one page that holds the seven "Go Top SEO vs X"
 * pages together, in every language the public site speaks.
 *
 * WHY IT EXISTS. The comparison pages went live as orphans. Each one is
 * reachable from a search result and from the sitemap, and from nowhere else:
 * a reader who landed on the Semrush page because that is the tool they were
 * weighing had no way to discover that the Surfer page exists, and no page on
 * the site answered the question behind all of them at once — which of these tools
 * is the one for me. `marketingBreadcrumbSchema` says it in one line: "there is
 * no /features index page, and a breadcrumb may only name pages that exist."
 * /compare was the same hole, and this file fills it.
 *
 * THE SLUG LIST IS THE REGISTRY. `COMPARISONS` is the order the index prints
 * and the only list of comparisons in the codebase that a reader sees. It is
 * grouped by what the tool is rather than alphabetically — the suite, the two
 * WordPress plugins, the two writing tools, the local tool — because somebody
 * choosing between them is choosing between kinds first. `when` is typed
 * `Record<CompareSlug, string>`, so an eighth comparison added to the registry
 * stops the build in ten languages until its line is written; nobody has to
 * remember.
 *
 * WHAT THE LINES MAY SAY. Each `when` line is the short form of that page's
 * own `theirStrengths`, and it carries the same discipline: it says when the
 * other tool is the right choice, in their terms, and it never denies a
 * capability on their behalf. A number here would be a claim about a
 * competitor without the dated source that makes it checkable, so the numbers
 * stay on the comparison pages, beside the date and the link.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type CompareSlug = 'semrush' | 'yoast' | 'rankmath' | 'surfer' | 'writesonic' | 'brightlocal' | 'booster'

/** Every comparison, in the order the index prints them. */
export const COMPARISONS: readonly { slug: CompareSlug; name: string }[] = [
  { slug: 'semrush', name: 'Semrush' },
  { slug: 'yoast', name: 'Yoast' },
  { slug: 'rankmath', name: 'Rank Math' },
  { slug: 'surfer', name: 'Surfer' },
  { slug: 'writesonic', name: 'Writesonic' },
  { slug: 'brightlocal', name: 'BrightLocal' },
  { slug: 'booster', name: 'Booster SEO' },
] as const

export type CompareIndexCopy = {
  /** The short label in the breadcrumb and the hero's eyebrow. */
  eyebrow: string
  metaTitle: string
  metaDescription: string
  hero: { title: string; accent: string; subtitle: string }
  list: { eyebrow: string; title: string; intro: string }
  /** The link under each card. */
  compareWith: (name: string) => string
  /** What each tool is, and when it is the right choice. */
  when: Record<CompareSlug, string>
  /** What these pages are and are not. */
  note: string
  close: { title: string }
}

export const COMPARE_INDEX: Record<PublicLocale, CompareIndexCopy> = {
  he: {
    eyebrow: 'השוואות',
    metaTitle: 'Go Top SEO מול שבעה כלי SEO | השוואות',
    metaDescription:
      'השוואות בין Go Top SEO לבין Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal ו-Booster SEO: במה כל אחד חזק, מה כלול בכל מחיר, ומתי הכלי האחר הוא הבחירה הנכונה.',
    hero: {
      title: 'שבעה כלים, ובמה כל אחד מהם חזק.',
      accent: 'אנחנו ביניהם',
      subtitle:
        'כל עמוד כאן משווה את Go Top SEO לכלי אחד בשמו, פותח במה שהכלי הזה עושה טוב מאיתנו, ומתארך כל קביעה עליו לעמודים שקראנו באתר שלהם. אם אחד מהם מתאים לכם יותר מאיתנו, העמוד אומר את זה.',
    },
    list: {
      eyebrow: 'ההשוואות',
      title: 'בחרו את הכלי שאתם שוקלים מולנו',
      intro: 'שורה אחת על כל כלי: מה הוא, ומתי הוא הבחירה הנכונה.',
    },
    compareWith: (name) => `Go Top SEO מול ${name}`,
    when: {
      semrush:
        'מערכת מחקר רחבה עם מעקב יומי וממשק API. הבחירה הנכונה כשאתם רוצים לחקור שוק בעצמכם, ולא לקבל את העבודה עשויה.',
      yoast:
        'תוסף לוורדפרס שמנחה את מי שכותב ולא עושה דבר לבד. הבחירה הנכונה כשיש לכם כבר מי שכותב.',
      rankmath:
        'תוסף ותיק לוורדפרס שהגרעין שלו חינמי. הבחירה הנכונה כשאין תקציב חודשי ואתם כותבים את הפוסטים בעצמכם.',
      surfer:
        'ניקוד שמחדד עמוד אחד מול התוצאות שהוא צריך לנצח. הבחירה הנכונה כשיש כותב, והפער הוא המקצועיות.',
      writesonic:
        'מדידה יומית של פרומפטים בשמם, על יותר מנועים ממה שאנחנו בודקים. הבחירה הנכונה כשכל השאלה היא אם ה-AI מזכיר אתכם.',
      brightlocal:
        'מדידה מקומית מעמיקה: מפת רשת גאוגרפית, ציטוטים, איסוף ביקורות. הבחירה הנכונה כשהפרנסה תלויה במפות.',
      booster:
        'אפליקציית שופיפיי שמתקנת תגיות, קישורים ותמונות בכל הקטלוג. הבחירה הנכונה כשהבעיה היא היגיינה של החנות ולא תוכן חדש.',
    },
    note:
      'אף אחד מהעמודים האלה אינו פרסומת. במקום שבו הכלי האחר טוב יותר, זה נכתב ראשון; ובמקום שבו העמוד שלהם לא מציין משהו, כתוב שהוא לא מופיע שם — לא שהמוצר לא יכול.',
    close: { title: 'אחרי שהשוויתם, אפשר לבדוק את האתר שלכם' },
  },
  en: {
    eyebrow: 'Comparisons',
    metaTitle: 'Go Top SEO compared with seven SEO tools | Comparisons',
    metaDescription:
      'Comparisons between Go Top SEO and Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal and Booster SEO: what each one is better at, what is in each price, and when the other tool is the right choice.',
    hero: {
      title: 'Seven tools, and what each one is stronger at.',
      accent: 'Ours among them',
      subtitle:
        'Each page here compares Go Top SEO with one named tool, opens with what that tool does better than we do, and dates every claim about it to the pages we read on their own site. If one of them fits you better than we do, the page says so.',
    },
    list: {
      eyebrow: 'The comparisons',
      title: 'Pick the tool you are weighing us against',
      intro: 'One line per tool: what it is, and when it is the right choice.',
    },
    compareWith: (name) => `Go Top SEO vs ${name}`,
    when: {
      semrush:
        'A wide research suite with daily tracking and an API. The right choice when you want to dig into a market yourself rather than be served the work.',
      yoast:
        'A WordPress plugin that coaches whoever writes and never acts on its own. The right choice when somebody already writes for you.',
      rankmath:
        'A mature WordPress plugin whose core is free. The right choice when there is no monthly budget and you write your own posts.',
      surfer:
        'Scoring that sharpens one page against the results it has to beat. The right choice when the writer is there and the gap is the craft.',
      writesonic:
        'Daily measurement of named prompts, across more engines than we check. The right choice when the whole question is whether AI mentions you.',
      brightlocal:
        'Deep local measurement: a geo-grid map, citations, review collection. The right choice when your living depends on Maps.',
      booster:
        'A Shopify app that fixes tags, links and images across the catalogue. The right choice when the problem is store hygiene rather than new content.',
    },
    note:
      'None of these pages is an advert. Where the other tool is better, that is said first; and where their own page does not list something, it says that it does not appear there, not that the product cannot do it.',
    close: { title: 'Once you have compared, you can check your own site' },
  },
  es: {
    eyebrow: 'Comparativas',
    metaTitle: 'Go Top SEO frente a siete herramientas SEO | Comparativas',
    metaDescription:
      'Comparativas entre Go Top SEO y Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal y Booster SEO: en qué es mejor cada una, qué incluye cada precio y cuándo la otra herramienta es la elección correcta.',
    hero: {
      title: 'Siete herramientas y en qué es fuerte cada una.',
      accent: 'La nuestra entre ellas',
      subtitle:
        'Cada página compara Go Top SEO con una herramienta concreta, empieza por lo que esa herramienta hace mejor que nosotros y fecha cada afirmación sobre ella en las páginas que leímos en su propio sitio. Si alguna te encaja mejor que nosotros, la página lo dice.',
    },
    list: {
      eyebrow: 'Las comparativas',
      title: 'Elige la herramienta con la que nos estás comparando',
      intro: 'Una línea por herramienta: qué es y cuándo es la elección correcta.',
    },
    compareWith: (name) => `Go Top SEO frente a ${name}`,
    when: {
      semrush:
        'Una suite de investigación amplia, con seguimiento diario y API. La elección correcta cuando quieres analizar un mercado tú mismo en lugar de recibir el trabajo hecho.',
      yoast:
        'Un plugin de WordPress que guía a quien escribe y nunca actúa por su cuenta. La elección correcta cuando ya tienes a alguien que escribe.',
      rankmath:
        'Un plugin de WordPress veterano cuyo núcleo es gratuito. La elección correcta cuando no hay presupuesto mensual y escribes tus propias entradas.',
      surfer:
        'Una puntuación que afina una página frente a los resultados que tiene que superar. La elección correcta cuando ya hay quien escribe y lo que falta es el oficio.',
      writesonic:
        'Medición diaria de prompts concretos, en más motores de los que nosotros comprobamos. La elección correcta cuando toda la pregunta es si la IA te menciona.',
      brightlocal:
        'Medición local a fondo: mapa de cuadrícula geográfica, citaciones, recogida de reseñas. La elección correcta cuando el negocio vive de Maps.',
      booster:
        'Una app de Shopify que corrige etiquetas, enlaces e imágenes en todo el catálogo. La elección correcta cuando el problema es la higiene de la tienda y no el contenido nuevo.',
    },
    note:
      'Ninguna de estas páginas es un anuncio. Donde la otra herramienta es mejor, se dice primero; y donde su propia página no menciona algo, decimos que no aparece allí, no que el producto no pueda hacerlo.',
    close: { title: 'Después de comparar, puedes revisar tu propio sitio' },
  },
  'pt-BR': {
    eyebrow: 'Comparações',
    metaTitle: 'Go Top SEO em comparação com sete ferramentas de SEO | Comparações',
    metaDescription:
      'Comparações entre Go Top SEO e Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal e Booster SEO: em que cada uma é melhor, o que está incluído em cada preço e quando a outra ferramenta é a escolha certa.',
    hero: {
      title: 'Sete ferramentas e em que cada uma é forte.',
      accent: 'A nossa entre elas',
      subtitle:
        'Cada página compara o Go Top SEO com uma ferramenta pelo nome, começa pelo que ela faz melhor do que nós e data cada afirmação sobre ela nas páginas que lemos no site dela. Se alguma combinar mais com você do que nós, a página diz isso.',
    },
    list: {
      eyebrow: 'As comparações',
      title: 'Escolha a ferramenta com a qual você nos compara',
      intro: 'Uma linha por ferramenta: o que ela é e quando é a escolha certa.',
    },
    compareWith: (name) => `Go Top SEO x ${name}`,
    when: {
      semrush:
        'Uma suíte de pesquisa ampla, com acompanhamento diário e API. A escolha certa quando você quer investigar um mercado por conta própria, em vez de receber o trabalho pronto.',
      yoast:
        'Um plugin de WordPress que orienta quem escreve e nunca age sozinho. A escolha certa quando já existe alguém escrevendo para você.',
      rankmath:
        'Um plugin de WordPress maduro cujo núcleo é gratuito. A escolha certa quando não há orçamento mensal e você escreve os próprios posts.',
      surfer:
        'Uma pontuação que afina uma página diante dos resultados que ela precisa superar. A escolha certa quando já há quem escreva e o que falta é o ofício.',
      writesonic:
        'Medição diária de prompts nomeados, em mais motores do que verificamos. A escolha certa quando toda a pergunta é se a IA menciona você.',
      brightlocal:
        'Medição local profunda: mapa de grade geográfica, citações, coleta de avaliações. A escolha certa quando o negócio vive do Maps.',
      booster:
        'Um app da Shopify que corrige tags, links e imagens em todo o catálogo. A escolha certa quando o problema é a higiene da loja e não conteúdo novo.',
    },
    note:
      'Nenhuma destas páginas é um anúncio. Onde a outra ferramenta é melhor, isso é dito primeiro; e onde a página dela não menciona algo, dizemos que não aparece lá, não que o produto não possa fazer.',
    close: { title: 'Depois de comparar, você pode checar o seu próprio site' },
  },
  fr: {
    eyebrow: 'Comparatifs',
    metaTitle: 'Go Top SEO comparé à sept outils SEO | Comparatifs',
    metaDescription:
      'Comparatifs entre Go Top SEO et Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal et Booster SEO : les points forts de chacun, ce que contient chaque tarif, et quand l’autre outil est le bon choix.',
    hero: {
      title: 'Sept outils, et les points forts de chacun.',
      accent: 'Le nôtre compris',
      subtitle:
        'Chaque page compare Go Top SEO à un outil nommé, commence par ce que cet outil fait mieux que nous, et date chaque affirmation à son sujet d’après les pages lues sur son propre site. Si l’un d’eux vous convient mieux que nous, la page le dit.',
    },
    list: {
      eyebrow: 'Les comparatifs',
      title: 'Choisissez l’outil auquel vous nous comparez',
      intro: 'Une ligne par outil : ce qu’il est, et quand il est le bon choix.',
    },
    compareWith: (name) => `Go Top SEO face à ${name}`,
    when: {
      semrush:
        'Une suite de recherche large, avec un suivi quotidien et une API. Le bon choix quand vous voulez explorer un marché vous-même plutôt que recevoir le travail fait.',
      yoast:
        'Une extension WordPress qui guide celui qui écrit et n’agit jamais seule. Le bon choix quand quelqu’un écrit déjà pour vous.',
      rankmath:
        'Une extension WordPress éprouvée dont le cœur est gratuit. Le bon choix quand il n’y a pas de budget mensuel et que vous écrivez vos articles vous-même.',
      surfer:
        'Un score qui affine une page face aux résultats qu’elle doit dépasser. Le bon choix quand la plume est là et que seul le métier manque.',
      writesonic:
        'Une mesure quotidienne de prompts nommés, sur plus de moteurs que nous n’en vérifions. Le bon choix quand toute la question est de savoir si l’IA vous cite.',
      brightlocal:
        'Une mesure locale approfondie : carte en grille géographique, citations, collecte d’avis. Le bon choix quand l’activité vit de Maps.',
      booster:
        'Une appli Shopify qui corrige les balises, les liens et les images de tout le catalogue. Le bon choix quand le problème est l’hygiène de la boutique et non le contenu.',
    },
    note:
      'Aucune de ces pages n’est une publicité. Là où l’autre outil est meilleur, cela est dit d’abord ; et là où sa propre page ne mentionne pas quelque chose, nous écrivons qu’elle ne le mentionne pas, non que le produit en soit incapable.',
    close: { title: 'Après la comparaison, vous pouvez analyser votre propre site' },
  },
  it: {
    eyebrow: 'Confronti',
    metaTitle: 'Go Top SEO a confronto con sette strumenti SEO | Confronti',
    metaDescription:
      'Confronti tra Go Top SEO e Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal e Booster SEO: i punti di forza di ciascuno, cosa comprende ogni prezzo e quando l’altro strumento è la scelta giusta.',
    hero: {
      title: 'Sette strumenti, e i punti di forza di ciascuno.',
      accent: 'Il nostro compreso',
      subtitle:
        'Ogni pagina confronta Go Top SEO con uno strumento per nome, apre con ciò che quello strumento fa meglio di noi e data ogni affermazione sul suo conto alle pagine lette sul suo stesso sito. Se uno di essi vi si adatta meglio di noi, la pagina lo dice.',
    },
    list: {
      eyebrow: 'I confronti',
      title: 'Scegliete lo strumento con cui ci state confrontando',
      intro: 'Una riga per strumento: che cos’è e quando è la scelta giusta.',
    },
    compareWith: (name) => `Go Top SEO contro ${name}`,
    when: {
      semrush:
        'Una suite di ricerca ampia, con monitoraggio quotidiano e API. La scelta giusta quando volete analizzare un mercato da soli, invece di ricevere il lavoro già fatto.',
      yoast:
        'Un plugin per WordPress che guida chi scrive e non agisce mai da solo. La scelta giusta quando qualcuno già scrive per voi.',
      rankmath:
        'Un plugin per WordPress maturo, con il nucleo gratuito. La scelta giusta quando non c’è budget mensile e scrivete i vostri articoli.',
      surfer:
        'Un punteggio che affina una pagina rispetto ai risultati che deve superare. La scelta giusta quando chi scrive c’è già e manca solo il mestiere.',
      writesonic:
        'Misurazione quotidiana di prompt per nome, su più motori di quanti ne controlliamo noi. La scelta giusta quando l’unica domanda è se l’IA vi cita.',
      brightlocal:
        'Misurazione locale approfondita: mappa a griglia geografica, citazioni, raccolta di recensioni. La scelta giusta quando l’attività vive di Maps.',
      booster:
        'Un’app di Shopify che corregge tag, link e immagini in tutto il catalogo. La scelta giusta quando il problema è l’igiene del negozio e non i contenuti nuovi.',
    },
    note:
      'Nessuna di queste pagine è una pubblicità. Dove l’altro strumento è migliore, lo diciamo per primo; e dove la loro pagina non elenca qualcosa, scriviamo che lì non compare, non che il prodotto non sappia farlo.',
    close: { title: 'Dopo il confronto, potete controllare il vostro sito' },
  },
  ja: {
    eyebrow: '比較',
    metaTitle: 'Go Top SEO と7つのSEOツールの比較 | 比較ページ',
    metaDescription:
      'Go Top SEO と Semrush、Yoast、Rank Math、Surfer、Writesonic、BrightLocal、Booster SEO の比較。それぞれが得意なこと、各料金に含まれるもの、そして他社のツールを選ぶべき場合をまとめています。',
    hero: {
      title: '7つのツールと、それぞれが得意なこと。',
      accent: '当社も含めて',
      subtitle:
        '各ページでは Go Top SEO を1つのツールと名前を挙げて比較します。はじめに相手のツールが当社より優れている点を示し、相手に関する記述はすべて相手自身のページを確認した日付を添えています。あなたに合うのが当社でない場合は、そのページにそう書いてあります。',
    },
    list: {
      eyebrow: '比較ページ',
      title: '検討中のツールをお選びください',
      intro: '各ツールを1行で: どのようなツールか、どの場合に最適か。',
    },
    compareWith: (name) => `Go Top SEO と ${name} の比較`,
    when: {
      semrush:
        '毎日の順位計測と API を備えた広範なリサーチ基盤。市場を自分の手で掘り下げたい場合に最適です。',
      yoast:
        '書く人を支援し、自ら手を加えることのない WordPress プラグイン。すでに書く人がいる場合に最適です。',
      rankmath:
        '中核機能が無料の、実績ある WordPress プラグイン。毎月の予算がなく、記事を自分で書く場合に最適です。',
      surfer:
        '上回るべき検索結果に合わせて一つのページを磨き込むスコア。書く人がいて、足りないのが技術だけの場合に最適です。',
      writesonic:
        '指定したプロンプトを毎日、当社が確認するより多くのエンジンで計測します。AI が自社に言及するかどうかが論点のすべてである場合に最適です。',
      brightlocal:
        'ジオグリッドマップ、サイテーション、レビュー収集まで含む本格的なローカル計測。事業がマップに依存している場合に最適です。',
      booster:
        'カタログ全体のタグ、リンク、画像を直す Shopify アプリ。課題が新しいコンテンツではなくストアの衛生状態であるときの正しい選択です。',
    },
    note:
      'これらのページは広告ではありません。相手のツールが優れている点は先に書いています。また相手のページに記載がない場合は「そこに記載がない」と書き、「その製品にはできない」とは書きません。',
    close: { title: '比較のあとは、ご自身のサイトを診断できます' },
  },
  de: {
    eyebrow: 'Vergleiche',
    metaTitle: 'Go Top SEO im Vergleich mit sieben SEO-Werkzeugen | Vergleiche',
    metaDescription:
      'Vergleiche zwischen Go Top SEO und Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal und Booster SEO: worin jedes stärker ist, was in welchem Preis steckt und wann das andere Werkzeug die richtige Wahl ist.',
    hero: {
      title: 'Sieben Werkzeuge, und worin jedes stärker ist.',
      accent: 'Unseres eingeschlossen',
      subtitle:
        'Jede Seite vergleicht Go Top SEO mit einem namentlich genannten Werkzeug, beginnt mit dem, was jenes besser macht als wir, und datiert jede Aussage darüber auf die Seiten, die wir auf deren eigener Website gelesen haben. Passt eines besser zu Ihnen als wir, steht das auf der Seite.',
    },
    list: {
      eyebrow: 'Die Vergleiche',
      title: 'Wählen Sie das Werkzeug, mit dem Sie uns vergleichen',
      intro: 'Eine Zeile pro Werkzeug: was es ist und wann es die richtige Wahl ist.',
    },
    compareWith: (name) => `Go Top SEO gegen ${name}`,
    when: {
      semrush:
        'Eine breite Recherche-Suite mit täglicher Verfolgung und API. Die richtige Wahl, wenn Sie einen Markt selbst durchdringen wollen, statt die Arbeit fertig zu bekommen.',
      yoast:
        'Ein WordPress-Plugin, das den Schreibenden anleitet und nie von selbst eingreift. Die richtige Wahl, wenn bei Ihnen schon jemand schreibt.',
      rankmath:
        'Ein ausgereiftes WordPress-Plugin, dessen Kern kostenlos ist. Die richtige Wahl, wenn kein monatliches Budget da ist und Sie Ihre Beiträge selbst schreiben.',
      surfer:
        'Eine Bewertung, die eine Seite gegen die Ergebnisse schärft, die sie überholen muss. Die richtige Wahl, wenn der Schreibende da ist und nur das Handwerk fehlt.',
      writesonic:
        'Tägliche Messung benannter Prompts, über mehr Engines als wir prüfen. Die richtige Wahl, wenn die ganze Frage ist, ob die KI Sie nennt.',
      brightlocal:
        'Tiefe lokale Messung: Geo-Grid-Karte, Citations, Einsammeln von Bewertungen. Die richtige Wahl, wenn das Geschäft von Maps lebt.',
      booster:
        'Eine Shopify-App, die Tags, Links und Bilder im ganzen Katalog korrigiert. Die richtige Wahl, wenn das Problem die Hygiene des Shops ist und nicht neue Inhalte.',
    },
    note:
      'Keine dieser Seiten ist Werbung. Wo das andere Werkzeug besser ist, steht das zuerst; und wo deren eigene Seite etwas nicht aufführt, schreiben wir, dass es dort nicht steht, nicht dass das Produkt es nicht könne.',
    close: { title: 'Nach dem Vergleich können Sie Ihre eigene Website prüfen' },
  },
  nl: {
    eyebrow: 'Vergelijkingen',
    metaTitle: 'Go Top SEO vergeleken met zeven SEO-tools | Vergelijkingen',
    metaDescription:
      'Vergelijkingen tussen Go Top SEO en Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal en Booster SEO: waarin elk beter is, wat er in elke prijs zit en wanneer de andere tool de juiste keuze is.',
    hero: {
      title: 'Zeven tools, en waarin elk sterker is.',
      accent: 'De onze erbij',
      subtitle:
        'Elke pagina vergelijkt Go Top SEO met één tool bij naam, begint met wat die tool beter doet dan wij, en dateert elke uitspraak erover op de pagina’s die wij op hun eigen site hebben gelezen. Past een van hen beter bij u dan wij, dan staat dat op de pagina.',
    },
    list: {
      eyebrow: 'De vergelijkingen',
      title: 'Kies de tool waarmee u ons vergelijkt',
      intro: 'Eén regel per tool: wat het is en wanneer het de juiste keuze is.',
    },
    compareWith: (name) => `Go Top SEO tegenover ${name}`,
    when: {
      semrush:
        'Een brede onderzoekssuite met dagelijkse meting en een API. De juiste keuze wanneer u een markt zelf wilt uitdiepen in plaats van het werk kant-en-klaar te krijgen.',
      yoast:
        'Een WordPress-plug-in die de schrijver begeleidt en nooit zelf ingrijpt. De juiste keuze wanneer er al iemand voor u schrijft.',
      rankmath:
        'Een volwassen WordPress-plug-in waarvan de kern gratis is. De juiste keuze wanneer er geen maandbudget is en u uw berichten zelf schrijft.',
      surfer:
        'Een score die één pagina bijslijpt tegen de resultaten die zij moet verslaan. De juiste keuze wanneer de schrijver er is en alleen het vakmanschap ontbreekt.',
      writesonic:
        'Dagelijkse meting van benoemde prompts, over meer engines dan wij nagaan. De juiste keuze wanneer de hele vraag is of de AI u noemt.',
      brightlocal:
        'Diepe lokale meting: geo-grid-kaart, citaties, het ophalen van reviews. De juiste keuze wanneer de zaak van Maps leeft.',
      booster:
        'Een Shopify-app die tags, links en afbeeldingen in de hele catalogus corrigeert. De juiste keuze als het probleem winkelhygiëne is en niet nieuwe content.',
    },
    note:
      'Geen van deze pagina’s is een advertentie. Waar de andere tool beter is, staat dat eerst; en waar hun eigen pagina iets niet noemt, schrijven wij dat het daar niet staat, niet dat het product het niet kan.',
    close: { title: 'Na het vergelijken kunt u uw eigen site laten nakijken' },
  },
  pl: {
    eyebrow: 'Porównania',
    metaTitle: 'Go Top SEO w porównaniu z siedmioma narzędziami SEO | Porównania',
    metaDescription:
      'Porównania Go Top SEO z Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal i Booster SEO: w czym każde jest lepsze, co zawiera każda cena i kiedy właściwym wyborem jest inne narzędzie.',
    hero: {
      title: 'Siedem narzędzi i to, w czym każde jest mocniejsze.',
      accent: 'Nasze również',
      subtitle:
        'Każda strona porównuje Go Top SEO z jednym narzędziem z nazwy, zaczyna od tego, co tamto robi lepiej od nas, i opatruje każde twierdzenie o nim datą przeczytania stron w ich własnym serwisie. Jeśli któreś pasuje do Państwa lepiej niż my, strona to mówi.',
    },
    list: {
      eyebrow: 'Porównania',
      title: 'Proszę wybrać narzędzie, z którym nas Państwo porównują',
      intro: 'Jedna linia o każdym narzędziu: czym jest i kiedy jest właściwym wyborem.',
    },
    compareWith: (name) => `Go Top SEO a ${name}`,
    when: {
      semrush:
        'Szeroki warsztat badawczy z codziennym monitoringiem i API. Właściwy wybór, gdy chcą Państwo samodzielnie zgłębić rynek, a nie otrzymać gotową pracę.',
      yoast:
        'Wtyczka WordPressa, która prowadzi piszącego i nigdy nie działa sama. Właściwy wybór, gdy ktoś już dla Państwa pisze.',
      rankmath:
        'Dojrzała wtyczka WordPressa z darmowym rdzeniem. Właściwy wybór, gdy nie ma miesięcznego budżetu, a wpisy piszą Państwo sami.',
      surfer:
        'Ocena, która dopracowuje jedną stronę wobec wyników, jakie musi wyprzedzić. Właściwy wybór, gdy piszący już jest, a brakuje tylko rzemiosła.',
      writesonic:
        'Codzienny pomiar nazwanych promptów, w większej liczbie silników niż sprawdzamy my. Właściwy wybór, gdy całe pytanie brzmi, czy AI o Państwu wspomina.',
      brightlocal:
        'Głęboki pomiar lokalny: mapa siatki geograficznej, cytowania, zbieranie opinii. Właściwy wybór, gdy firma żyje z Map.',
      booster:
        'Aplikacja Shopify, która poprawia tagi, linki i obrazy w całym katalogu. Właściwy wybór, gdy problemem jest higiena sklepu, a nie nowe treści.',
    },
    note:
      'Żadna z tych stron nie jest reklamą. Tam, gdzie drugie narzędzie jest lepsze, mówimy o tym pierwsi; a tam, gdzie ich własna strona czegoś nie wymienia, piszemy, że tego tam nie ma, a nie że produkt tego nie potrafi.',
    close: { title: 'Po porównaniu można sprawdzić własną stronę' },
  },
  ko: {
    eyebrow: '비교',
    metaTitle: 'Go Top SEO와 SEO 도구 일곱 가지 비교 | 비교',
    metaDescription:
      'Go Top SEO와 Semrush, Yoast, Rank Math, Surfer, Writesonic, BrightLocal, Booster SEO 비교입니다. 각 도구가 무엇을 더 잘하는지, 각 가격에 무엇이 들어 있는지, 그리고 다른 도구가 더 맞는 경우는 언제인지 적었습니다.',
    hero: {
      title: '도구 일곱 가지와, 각자 더 강한 지점.',
      accent: '저희 것도 함께',
      subtitle:
        '각 페이지는 Go Top SEO를 이름이 있는 도구 하나와 비교하고, 그 도구가 저희보다 잘하는 것부터 먼저 말하며, 그 도구에 대한 모든 서술에 그들의 사이트를 읽은 날짜를 붙입니다. 저희보다 그쪽이 더 맞는다면 페이지가 그렇게 말합니다.',
    },
    list: {
      eyebrow: '비교',
      title: '저희와 비교하실 도구를 골라 주십시오',
      intro: '도구마다 한 줄씩. 무엇인지, 그리고 언제 그쪽이 맞는 선택인지입니다.',
    },
    compareWith: (name) => `Go Top SEO와 ${name}`,
    when: {
      semrush:
        '매일 측정과 API까지 갖춘 폭넓은 리서치 도구입니다. 완성된 작업을 받기보다 시장을 직접 파고들고 싶을 때 맞는 선택입니다.',
      yoast:
        '글 쓰는 사람을 안내하는 WordPress 플러그인이며, 혼자서 일하지는 않습니다. 이미 누군가 글을 써 주고 있을 때 맞는 선택입니다.',
      rankmath:
        '핵심 기능이 무료인, 오래 다듬어진 WordPress 플러그인입니다. 월 예산이 없고 글은 직접 쓰실 때 맞는 선택입니다.',
      surfer:
        '앞질러야 하는 결과들에 맞춰 한 페이지를 다듬어 주는 점수입니다. 쓸 사람은 이미 있고 다듬는 솜씨만 모자랄 때 맞는 선택입니다.',
      writesonic:
        '지정한 프롬프트를 매일 측정하며, 저희보다 많은 엔진을 봅니다. 질문이 오직 "AI가 우리를 언급하느냐"일 때 맞는 선택입니다.',
      brightlocal:
        '지역 측정이 깊습니다. 격자 지도, 인용 정보, 리뷰 수집까지 다룹니다. 사업이 지도에서 먹고살 때 맞는 선택입니다.',
      booster:
        '카탈로그 전체의 태그와 링크, 이미지를 고쳐 주는 Shopify 앱입니다. 문제가 새 콘텐츠가 아니라 쇼핑몰 정리일 때 맞는 선택입니다.',
    },
    note:
      '이 페이지들은 광고가 아닙니다. 다른 도구가 더 나은 지점은 저희가 먼저 말하고, 그들 사이트에 적혀 있지 않은 것은 "제품이 못 한다"가 아니라 "거기에 적혀 있지 않다"고 씁니다.',
    close: { title: '비교를 마치셨다면 내 사이트를 진단해 보십시오' },
  },
}
