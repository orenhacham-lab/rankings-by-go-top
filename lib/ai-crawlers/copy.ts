/**
 * Every visitor-facing string of the AI crawler checker, in all seven public
 * locales.
 *
 * Same shape as lib/free-check/copy.ts and for the same reason: one structural
 * type, seven objects, so a locale cannot quietly lose a key and fall through to
 * Hebrew. The whole asset is self-contained, so its words live beside its logic
 * rather than in the public dictionary.
 *
 * TRUTH DISCIPLINE, since this page is meant to be cited by strangers: no
 * counts of customers, no percentages, no promised rankings, no ratings. The
 * only numbers on the page are ones this run computed — how many agents are
 * allowed, how many blocked, how many bytes the file was — and the `limits`
 * block states plainly what robots.txt cannot tell anybody.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { CrawlerPurpose } from './agents'
import type { AiCrawlerErrorCode } from './types'

export type AiCrawlerCopy = {
  meta: { title: string; description: string }
  page: { badge: string; title: string; subtitle: string; trust: string[] }
  form: {
    urlLabel: string
    urlPlaceholder: string
    pathLabel: string
    pathPlaceholder: string
    pathHint: string
    submit: string
    submitting: string
    errors: Record<AiCrawlerErrorCode, string>
  }
  results: {
    heading: string
    forPath: string
    robotsFound: string
    robotsAbsent: string
    robotsUnreadable: string
    allowedCount: string
    blockedCount: string
    allowed: string
    blocked: string
    decidedBy: string
    noRule: string
    viaWildcard: string
    ignoresRobots: string
    sitemapsTitle: string
    again: string
  }
  purposes: Record<CrawlerPurpose, { label: string; blurb: string }>
  groups: { ai: string; classic: string }
  // `title` is the heading above the table; `datasetName` NAMES the table as a
  // dataset, which is what the schema.org Dataset node needs. A heading like
  // "Who each one is" is not a name a catalogue can list.
  reference: { title: string; datasetName: string; intro: string; colAgent: string; colOperator: string; colPurpose: string }
  limits: { title: string; items: string[] }
  cta: { title: string; body: string; button: string }
}

const he: AiCrawlerCopy = {
  meta: {
    title: 'בדיקת גישת סורקי AI ל-robots.txt - Go Top SEO',
    description:
      'הדביקו כתובת אתר ותראו אילו סורקי AI — GPTBot, ClaudeBot, PerplexityBot, Google-Extended ועוד — חסומים אצלכם ב-robots.txt, ואיזו שורה בדיוק חוסמת אותם. בלי הרשמה.',
  },
  page: {
    badge: 'כלי חינמי',
    title: 'מי מסורקי ה-AI חסום אצלכם?',
    subtitle:
      'אנחנו קוראים את קובץ ה-robots.txt שלכם ומראים, לכל סורק AI בנפרד, אם הוא מורשה או חסום — ואיזו שורה בקובץ קבעה את זה.',
    trust: ['בלי הרשמה ובלי אימייל', 'קריאה אחת של קובץ אחד', 'אפשר לבדוק נתיב מסוים ולא רק את הדף הראשי'],
  },
  form: {
    urlLabel: 'כתובת האתר',
    urlPlaceholder: 'example.co.il',
    pathLabel: 'נתיב לבדיקה (לא חובה)',
    pathPlaceholder: '/blog/',
    pathHint: 'ריק בודק את הדף הראשי. הכללים ב-robots.txt משתנים לפי נתיב.',
    submit: 'בדקו את הסורקים',
    submitting: 'קורא את robots.txt…',
    errors: {
      invalid_url: 'הכתובת לא נראית תקינה. נסו example.co.il',
      blocked_url: 'אפשר לבדוק רק אתרים ציבוריים.',
      unreachable: 'לא הצלחנו להגיע לאתר הזה כרגע. נסו שוב בעוד רגע.',
      rate_limited: 'בדקתם הרבה אתרים ברצף. נסו שוב בעוד דקה.',
      internal: 'משהו השתבש אצלנו. נסו שוב בעוד רגע.',
    },
  },
  results: {
    heading: 'התוצאה עבור',
    forPath: 'לנתיב',
    robotsFound: 'נקרא קובץ robots.txt',
    robotsAbsent: 'אין באתר הזה קובץ robots.txt, ולכן שום סורק לא חסום על ידו.',
    robotsUnreadable: 'האתר לא מסר את הקובץ, ולכן אי אפשר לקרוא ממנו מדיניות. התוצאות למטה מניחות שאין חסימה.',
    allowedCount: 'מורשים',
    blockedCount: 'חסומים',
    allowed: 'מורשה',
    blocked: 'חסום',
    decidedBy: 'לפי השורה',
    noRule: 'אין כלל תואם — ברירת המחדל היא גישה מותרת',
    viaWildcard: 'דרך הקבוצה הכללית',
    ignoresRobots: 'הסורק הזה לא התחייב לכבד robots.txt',
    sitemapsTitle: 'מפות אתר שהוצהרו בקובץ',
    again: 'בדיקה נוספת',
  },
  purposes: {
    train: { label: 'אימון', blurb: 'אוסף דפים כדי לאמן מודל. חסימה משאירה אתכם מחוץ למודל הבא.' },
    answer: { label: 'תשובה חיה', blurb: 'מביא את הדף ברגע שמישהו שואל, כדי לצטט אתכם בתשובה עם קישור.' },
    search: { label: 'אינדקס', blurb: 'בונה אינדקס חיפוש, שממנו נשענות גם תשובות ה-AI.' },
    ads: { label: 'מודעות', blurb: 'בודק דפי נחיתה של מודעות. חסימה שלו לא משפיעה על תשובות ולא על האינדקס.' },
  },
  groups: { ai: 'סורקי AI', classic: 'סורקי חיפוש קלאסיים' },
  reference: {
    title: 'מי כל אחד מהם',
    datasetName: 'מאגר סורקי ה-AI',
    intro: 'הטבלה הזו עומדת בפני עצמה: שם הסורק כפי שהוא מופיע בשורת User-agent, מי מפעיל אותו, ולשם מה.',
    colAgent: 'User-agent',
    colOperator: 'מופעל על ידי',
    colPurpose: 'לשם מה',
  },
  limits: {
    title: 'מה הבדיקה הזו לא יודעת',
    items: [
      'robots.txt הוא בקשה, לא חומה. סורק יכול להתעלם ממנו.',
      'חומת אש או CDN יכולים לחסום סורק שה-robots.txt דווקא מתיר.',
      'הבדיקה מתארת רגע אחד. שינוי בקובץ משנה את התשובה מיד.',
      'חסימה של סורק אימון וחסימה של סורק תשובה חיה הן שתי החלטות שונות לגמרי.',
    ],
  },
  cta: {
    title: 'לראות אם ה-AI באמת מזכיר אתכם',
    body: 'גישה היא רק השלב הראשון. Go Top SEO בודק אוטומטית אם העסק שלכם מופיע בתשובות של ChatGPT, Gemini ו-Google AI, ועוקב אחרי הדירוגים בגוגל ובמפות מדי חודש.',
    button: 'לנסות שבוע חינם, בלי כרטיס אשראי',
  },
}

const en: AiCrawlerCopy = {
  meta: {
    title: 'AI crawler access checker for robots.txt - Go Top SEO',
    description:
      'Paste a domain and see which AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended and more — your robots.txt blocks, and the exact line that blocks each one. No sign-up.',
  },
  page: {
    badge: 'Free tool',
    title: 'Which AI crawlers is your site blocking?',
    subtitle:
      'We read your robots.txt and tell you, for each AI crawler separately, whether it is allowed or blocked — and which line in the file decided it.',
    trust: ['No sign-up, no email', 'One read of one file', 'Check a specific path, not only the home page'],
  },
  form: {
    urlLabel: 'Site address',
    urlPlaceholder: 'example.com',
    pathLabel: 'Path to check (optional)',
    pathPlaceholder: '/blog/',
    pathHint: 'Empty checks the home page. robots.txt rules change from one path to another.',
    submit: 'Check the crawlers',
    submitting: 'Reading robots.txt…',
    errors: {
      invalid_url: 'That address does not look right. Try example.com',
      blocked_url: 'Only public websites can be checked.',
      unreachable: 'We could not reach that site just now. Try again in a moment.',
      rate_limited: 'That is a lot of sites in a row. Try again in a minute.',
      internal: 'Something went wrong on our side. Try again in a moment.',
    },
  },
  results: {
    heading: 'Result for',
    forPath: 'for path',
    robotsFound: 'robots.txt read',
    robotsAbsent: 'This site serves no robots.txt, so nothing is blocked by one.',
    robotsUnreadable: 'The site did not hand over the file, so no policy can be read from it. The results below assume nothing is blocked.',
    allowedCount: 'allowed',
    blockedCount: 'blocked',
    allowed: 'Allowed',
    blocked: 'Blocked',
    decidedBy: 'by the line',
    noRule: 'no rule matched — the default is allowed',
    viaWildcard: 'through the catch-all group',
    ignoresRobots: 'This crawler has not committed to honouring robots.txt',
    sitemapsTitle: 'Sitemaps declared in the file',
    again: 'Check another',
  },
  purposes: {
    train: { label: 'Training', blurb: 'Collects pages to train a model. Blocking it keeps you out of the next model.' },
    answer: { label: 'Live answer', blurb: 'Fetches the page the moment someone asks, to cite you in an answer with a link.' },
    search: { label: 'Index', blurb: 'Builds a search index, which AI answers are built on top of.' },
    ads: { label: 'Adverts', blurb: 'Checks the landing pages of adverts. Blocking it affects neither answers nor the index.' },
  },
  groups: { ai: 'AI crawlers', classic: 'Classic search crawlers' },
  reference: {
    title: 'Who each one is',
    datasetName: 'AI crawler reference table',
    intro: 'This table stands on its own: the crawler name as it appears in the User-agent line, who operates it, and what for.',
    colAgent: 'User-agent',
    colOperator: 'Operated by',
    colPurpose: 'What for',
  },
  limits: {
    title: 'What this check cannot tell you',
    items: [
      'robots.txt is a request, not a wall. A crawler can ignore it.',
      'A firewall or CDN can block a crawler that robots.txt allows.',
      'The check describes one moment. Editing the file changes the answer at once.',
      'Blocking a training crawler and blocking a live-answer crawler are two entirely different decisions.',
    ],
  },
  cta: {
    title: 'See whether AI actually mentions you',
    body: 'Access is only the first step. Go Top SEO checks automatically whether your business shows up in answers from ChatGPT, Gemini and Google AI, and tracks your Google and Maps rankings every month.',
    button: 'Try it free for 7 days, no card',
  },
}

const es: AiCrawlerCopy = {
  meta: {
    title: 'Comprobador de acceso de rastreadores de IA en robots.txt - Go Top SEO',
    description:
      'Pega un dominio y descubre qué rastreadores de IA — GPTBot, ClaudeBot, PerplexityBot, Google-Extended y más — bloquea tu robots.txt, y qué línea exacta bloquea a cada uno. Sin registro.',
  },
  page: {
    badge: 'Herramienta gratuita',
    title: '¿A qué rastreadores de IA bloquea tu sitio?',
    subtitle:
      'Leemos tu robots.txt y te decimos, para cada rastreador de IA por separado, si está permitido o bloqueado, y qué línea del archivo lo decidió.',
    trust: ['Sin registro ni correo', 'Una lectura de un único archivo', 'Comprueba una ruta concreta, no solo la portada'],
  },
  form: {
    urlLabel: 'Dirección del sitio',
    urlPlaceholder: 'ejemplo.es',
    pathLabel: 'Ruta a comprobar (opcional)',
    pathPlaceholder: '/blog/',
    pathHint: 'Vacío comprueba la portada. Las reglas de robots.txt cambian de una ruta a otra.',
    submit: 'Comprobar rastreadores',
    submitting: 'Leyendo robots.txt…',
    errors: {
      invalid_url: 'Esa dirección no parece correcta. Prueba ejemplo.es',
      blocked_url: 'Solo se pueden comprobar sitios públicos.',
      unreachable: 'No hemos podido acceder a ese sitio ahora mismo. Inténtalo dentro de un momento.',
      rate_limited: 'Son muchos sitios seguidos. Inténtalo dentro de un minuto.',
      internal: 'Algo ha fallado por nuestra parte. Inténtalo dentro de un momento.',
    },
  },
  results: {
    heading: 'Resultado para',
    forPath: 'para la ruta',
    robotsFound: 'robots.txt leído',
    robotsAbsent: 'Este sitio no sirve ningún robots.txt, así que no bloquea a nadie por esa vía.',
    robotsUnreadable: 'El sitio no entregó el archivo, así que no se puede leer ninguna política. Los resultados de abajo suponen que no hay bloqueo.',
    allowedCount: 'permitidos',
    blockedCount: 'bloqueados',
    allowed: 'Permitido',
    blocked: 'Bloqueado',
    decidedBy: 'por la línea',
    noRule: 'ninguna regla coincide: por defecto está permitido',
    viaWildcard: 'a través del grupo general',
    ignoresRobots: 'Este rastreador no se ha comprometido a respetar robots.txt',
    sitemapsTitle: 'Mapas del sitio declarados en el archivo',
    again: 'Comprobar otro',
  },
  purposes: {
    train: { label: 'Entrenamiento', blurb: 'Recopila páginas para entrenar un modelo. Bloquearlo te deja fuera del próximo modelo.' },
    answer: { label: 'Respuesta en vivo', blurb: 'Carga la página en el momento en que alguien pregunta, para citarte en la respuesta con un enlace.' },
    search: { label: 'Índice', blurb: 'Construye un índice de búsqueda, sobre el que se apoyan también las respuestas de IA.' },
    ads: { label: 'Anuncios', blurb: 'Revisa las páginas de destino de los anuncios. Bloquearlo no afecta ni a las respuestas ni al índice.' },
  },
  groups: { ai: 'Rastreadores de IA', classic: 'Rastreadores de búsqueda clásicos' },
  reference: {
    title: 'Quién es cada uno',
    datasetName: 'Tabla de referencia de rastreadores de IA',
    intro: 'Esta tabla se sostiene sola: el nombre del rastreador tal como aparece en la línea User-agent, quién lo opera y para qué.',
    colAgent: 'User-agent',
    colOperator: 'Operado por',
    colPurpose: 'Para qué',
  },
  limits: {
    title: 'Lo que esta comprobación no puede decirte',
    items: [
      'robots.txt es una petición, no un muro. Un rastreador puede ignorarlo.',
      'Un cortafuegos o una CDN pueden bloquear a un rastreador que robots.txt permite.',
      'La comprobación describe un instante. Editar el archivo cambia la respuesta de inmediato.',
      'Bloquear un rastreador de entrenamiento y bloquear uno de respuesta en vivo son dos decisiones completamente distintas.',
    ],
  },
  cta: {
    title: 'Comprueba si la IA te menciona de verdad',
    body: 'El acceso es solo el primer paso. Go Top SEO comprueba automáticamente si tu negocio aparece en las respuestas de ChatGPT, Gemini y Google AI, y sigue tus posiciones en Google y en Maps cada mes.',
    button: 'Pruébalo 7 días gratis, sin tarjeta',
  },
}

const ptBR: AiCrawlerCopy = {
  meta: {
    title: 'Verificador de acesso de rastreadores de IA no robots.txt - Go Top SEO',
    description:
      'Cole um domínio e veja quais rastreadores de IA — GPTBot, ClaudeBot, PerplexityBot, Google-Extended e outros — o seu robots.txt bloqueia, e qual linha exata bloqueia cada um. Sem cadastro.',
  },
  page: {
    badge: 'Ferramenta gratuita',
    title: 'Quais rastreadores de IA o seu site bloqueia?',
    subtitle:
      'Lemos o seu robots.txt e dizemos, para cada rastreador de IA separadamente, se ele está liberado ou bloqueado, e qual linha do arquivo decidiu isso.',
    trust: ['Sem cadastro, sem e-mail', 'Uma leitura de um único arquivo', 'Verifique um caminho específico, não só a página inicial'],
  },
  form: {
    urlLabel: 'Endereço do site',
    urlPlaceholder: 'exemplo.com.br',
    pathLabel: 'Caminho a verificar (opcional)',
    pathPlaceholder: '/blog/',
    pathHint: 'Vazio verifica a página inicial. As regras do robots.txt mudam de um caminho para outro.',
    submit: 'Verificar rastreadores',
    submitting: 'Lendo o robots.txt…',
    errors: {
      invalid_url: 'Esse endereço não parece certo. Tente exemplo.com.br',
      blocked_url: 'Só é possível verificar sites públicos.',
      unreachable: 'Não conseguimos acessar esse site agora. Tente de novo daqui a pouco.',
      rate_limited: 'São muitos sites seguidos. Tente de novo daqui a um minuto.',
      internal: 'Algo deu errado do nosso lado. Tente de novo daqui a pouco.',
    },
  },
  results: {
    heading: 'Resultado para',
    forPath: 'para o caminho',
    robotsFound: 'robots.txt lido',
    robotsAbsent: 'Este site não serve nenhum robots.txt, então nada é bloqueado por esse caminho.',
    robotsUnreadable: 'O site não entregou o arquivo, então nenhuma política pode ser lida dele. Os resultados abaixo supõem que não há bloqueio.',
    allowedCount: 'liberados',
    blockedCount: 'bloqueados',
    allowed: 'Liberado',
    blocked: 'Bloqueado',
    decidedBy: 'pela linha',
    noRule: 'nenhuma regra corresponde: o padrão é liberado',
    viaWildcard: 'pelo grupo geral',
    ignoresRobots: 'Esse rastreador não se comprometeu a respeitar o robots.txt',
    sitemapsTitle: 'Mapas do site declarados no arquivo',
    again: 'Verificar outro',
  },
  purposes: {
    train: { label: 'Treinamento', blurb: 'Reúne páginas para treinar um modelo. Bloquear deixa você fora do próximo modelo.' },
    answer: { label: 'Resposta ao vivo', blurb: 'Carrega a página no momento em que alguém pergunta, para citar você na resposta com um link.' },
    search: { label: 'Índice', blurb: 'Constrói um índice de busca, no qual as respostas de IA também se apoiam.' },
    ads: { label: 'Anúncios', blurb: 'Verifica as páginas de destino dos anúncios. Bloquear não afeta nem as respostas nem o índice.' },
  },
  groups: { ai: 'Rastreadores de IA', classic: 'Rastreadores de busca clássicos' },
  reference: {
    title: 'Quem é cada um',
    datasetName: 'Tabela de referência de rastreadores de IA',
    intro: 'Esta tabela se sustenta sozinha: o nome do rastreador como aparece na linha User-agent, quem o opera e para quê.',
    colAgent: 'User-agent',
    colOperator: 'Operado por',
    colPurpose: 'Para quê',
  },
  limits: {
    title: 'O que esta verificação não consegue dizer',
    items: [
      'robots.txt é um pedido, não um muro. Um rastreador pode ignorá-lo.',
      'Um firewall ou uma CDN podem bloquear um rastreador que o robots.txt libera.',
      'A verificação descreve um instante. Editar o arquivo muda a resposta na hora.',
      'Bloquear um rastreador de treinamento e bloquear um de resposta ao vivo são duas decisões completamente diferentes.',
    ],
  },
  cta: {
    title: 'Veja se a IA realmente menciona você',
    body: 'O acesso é só o primeiro passo. O Go Top SEO verifica automaticamente se o seu negócio aparece nas respostas do ChatGPT, do Gemini e do Google AI, e acompanha suas posições no Google e no Maps todo mês.',
    button: 'Teste 7 dias grátis, sem cartão',
  },
}

const fr: AiCrawlerCopy = {
  meta: {
    title: "Vérificateur d'accès des robots d'IA dans robots.txt - Go Top SEO",
    description:
      "Collez un domaine et voyez quels robots d'IA — GPTBot, ClaudeBot, PerplexityBot, Google-Extended et d'autres — votre robots.txt bloque, et quelle ligne exacte bloque chacun. Sans inscription.",
  },
  page: {
    badge: 'Outil gratuit',
    title: "Quels robots d'IA votre site bloque-t-il ?",
    subtitle:
      "Nous lisons votre robots.txt et vous disons, pour chaque robot d'IA séparément, s'il est autorisé ou bloqué, et quelle ligne du fichier en a décidé.",
    trust: ['Sans inscription ni courriel', "Une lecture d'un seul fichier", "Vérifiez un chemin précis, pas seulement l'accueil"],
  },
  form: {
    urlLabel: 'Adresse du site',
    urlPlaceholder: 'exemple.fr',
    pathLabel: 'Chemin à vérifier (facultatif)',
    pathPlaceholder: '/blog/',
    pathHint: "Vide vérifie l'accueil. Les règles du robots.txt changent d'un chemin à l'autre.",
    submit: 'Vérifier les robots',
    submitting: 'Lecture du robots.txt…',
    errors: {
      invalid_url: 'Cette adresse ne semble pas correcte. Essayez exemple.fr',
      blocked_url: 'Seuls les sites publics peuvent être vérifiés.',
      unreachable: "Nous n'avons pas pu joindre ce site pour l'instant. Réessayez dans un moment.",
      rate_limited: "Cela fait beaucoup de sites d'affilée. Réessayez dans une minute.",
      internal: "Quelque chose n'a pas fonctionné chez nous. Réessayez dans un moment.",
    },
  },
  results: {
    heading: 'Résultat pour',
    forPath: 'pour le chemin',
    robotsFound: 'robots.txt lu',
    robotsAbsent: "Ce site ne sert aucun robots.txt : rien n'est donc bloqué par ce biais.",
    robotsUnreadable: "Le site n'a pas remis le fichier, aucune politique ne peut donc en être lue. Les résultats ci-dessous supposent qu'il n'y a aucun blocage.",
    allowedCount: 'autorisés',
    blockedCount: 'bloqués',
    allowed: 'Autorisé',
    blocked: 'Bloqué',
    decidedBy: 'par la ligne',
    noRule: "aucune règle ne correspond : par défaut, l'accès est autorisé",
    viaWildcard: 'via le groupe général',
    ignoresRobots: "Ce robot ne s'est pas engagé à respecter robots.txt",
    sitemapsTitle: 'Plans de site déclarés dans le fichier',
    again: 'Vérifier un autre',
  },
  purposes: {
    train: { label: 'Entraînement', blurb: "Rassemble des pages pour entraîner un modèle. Le bloquer vous laisse hors du prochain modèle." },
    answer: { label: 'Réponse en direct', blurb: "Charge la page au moment où quelqu'un pose une question, pour vous citer dans la réponse avec un lien." },
    search: { label: 'Index', blurb: "Construit un index de recherche, sur lequel s'appuient aussi les réponses d'IA." },
    ads: { label: 'Publicités', blurb: "Vérifie les pages de destination des publicités. Le bloquer n'affecte ni les réponses ni l'index." },
  },
  groups: { ai: "Robots d'IA", classic: 'Robots de recherche classiques' },
  reference: {
    title: 'Qui est qui',
    datasetName: "Table de référence des robots d'IA",
    intro: "Ce tableau se suffit à lui-même : le nom du robot tel qu'il apparaît dans la ligne User-agent, qui l'exploite et pour quoi faire.",
    colAgent: 'User-agent',
    colOperator: 'Exploité par',
    colPurpose: 'Pour quoi faire',
  },
  limits: {
    title: 'Ce que cette vérification ne peut pas vous dire',
    items: [
      "robots.txt est une demande, pas un mur. Un robot peut l'ignorer.",
      'Un pare-feu ou un CDN peut bloquer un robot que robots.txt autorise.',
      'La vérification décrit un instant. Modifier le fichier change la réponse aussitôt.',
      "Bloquer un robot d'entraînement et bloquer un robot de réponse en direct sont deux décisions tout à fait différentes.",
    ],
  },
  cta: {
    title: "Voyez si l'IA vous mentionne vraiment",
    body: "L'accès n'est que la première étape. Go Top SEO vérifie automatiquement si votre entreprise apparaît dans les réponses de ChatGPT, de Gemini et de Google AI, et suit vos positions sur Google et sur Maps chaque mois.",
    button: 'Essayez 7 jours gratuitement, sans carte',
  },
}

const it: AiCrawlerCopy = {
  meta: {
    title: 'Verifica di accesso dei crawler IA nel robots.txt - Go Top SEO',
    description:
      'Incolla un dominio e scopri quali crawler IA — GPTBot, ClaudeBot, PerplexityBot, Google-Extended e altri — il tuo robots.txt blocca, e quale riga esatta blocca ciascuno. Senza registrazione.',
  },
  page: {
    badge: 'Strumento gratuito',
    title: 'Quali crawler IA sta bloccando il tuo sito?',
    subtitle:
      'Leggiamo il tuo robots.txt e ti diciamo, per ogni crawler IA separatamente, se è consentito o bloccato, e quale riga del file lo ha deciso.',
    trust: ['Senza registrazione né e-mail', 'Una lettura di un solo file', 'Verifica un percorso preciso, non solo la home'],
  },
  form: {
    urlLabel: 'Indirizzo del sito',
    urlPlaceholder: 'esempio.it',
    pathLabel: 'Percorso da verificare (facoltativo)',
    pathPlaceholder: '/blog/',
    pathHint: 'Vuoto verifica la home. Le regole del robots.txt cambiano da un percorso all’altro.',
    submit: 'Verifica i crawler',
    submitting: 'Lettura del robots.txt…',
    errors: {
      invalid_url: 'Questo indirizzo non sembra corretto. Prova esempio.it',
      blocked_url: 'Si possono verificare solo siti pubblici.',
      unreachable: 'Non siamo riusciti a raggiungere questo sito al momento. Riprova tra poco.',
      rate_limited: 'Sono molti siti di seguito. Riprova tra un minuto.',
      internal: 'Qualcosa non ha funzionato da parte nostra. Riprova tra poco.',
    },
  },
  results: {
    heading: 'Risultato per',
    forPath: 'per il percorso',
    robotsFound: 'robots.txt letto',
    robotsAbsent: 'Questo sito non serve alcun robots.txt, quindi per questa via non blocca nessuno.',
    robotsUnreadable: 'Il sito non ha consegnato il file, quindi non se ne può leggere alcuna politica. I risultati qui sotto presumono che non ci sia alcun blocco.',
    allowedCount: 'consentiti',
    blockedCount: 'bloccati',
    allowed: 'Consentito',
    blocked: 'Bloccato',
    decidedBy: 'dalla riga',
    noRule: 'nessuna regola corrisponde: per impostazione predefinita è consentito',
    viaWildcard: 'tramite il gruppo generale',
    ignoresRobots: 'Questo crawler non si è impegnato a rispettare il robots.txt',
    sitemapsTitle: 'Mappe del sito dichiarate nel file',
    again: 'Verificane un altro',
  },
  purposes: {
    train: { label: 'Addestramento', blurb: 'Raccoglie pagine per addestrare un modello. Bloccarlo ti lascia fuori dal prossimo modello.' },
    answer: { label: 'Risposta dal vivo', blurb: 'Carica la pagina nel momento in cui qualcuno fa una domanda, per citarti nella risposta con un collegamento.' },
    search: { label: 'Indice', blurb: 'Costruisce un indice di ricerca, su cui si appoggiano anche le risposte IA.' },
    ads: { label: 'Annunci', blurb: 'Controlla le pagine di destinazione degli annunci. Bloccarlo non influisce né sulle risposte né sull’indice.' },
  },
  groups: { ai: 'Crawler IA', classic: 'Crawler di ricerca classici' },
  reference: {
    title: 'Chi è ciascuno',
    datasetName: 'Tabella di riferimento dei crawler IA',
    intro: 'Questa tabella si regge da sola: il nome del crawler così come compare nella riga User-agent, chi lo gestisce e a quale scopo.',
    colAgent: 'User-agent',
    colOperator: 'Gestito da',
    colPurpose: 'A quale scopo',
  },
  limits: {
    title: 'Cosa questa verifica non può dirti',
    items: [
      'Il robots.txt è una richiesta, non un muro. Un crawler può ignorarlo.',
      'Un firewall o una CDN possono bloccare un crawler che il robots.txt consente.',
      'La verifica descrive un istante. Modificare il file cambia subito la risposta.',
      'Bloccare un crawler di addestramento e bloccarne uno di risposta dal vivo sono due decisioni del tutto diverse.',
    ],
  },
  cta: {
    title: 'Scopri se l’IA ti nomina davvero',
    body: 'L’accesso è solo il primo passo. Go Top SEO verifica automaticamente se la tua attività compare nelle risposte di ChatGPT, Gemini e Google AI, e segue le tue posizioni su Google e su Maps ogni mese.',
    button: 'Provalo 7 giorni gratis, senza carta',
  },
}

const ja: AiCrawlerCopy = {
  meta: {
    title: 'robots.txt のAIクローラー許可状況チェック - Go Top SEO',
    description:
      'ドメインをご記入ください。GPTBot、ClaudeBot、PerplexityBot、Google-Extended などのAIクローラーのうち、robots.txt がどれを拒否しているかと、そう判定した行そのものをお見せします。登録不要。',
  },
  page: {
    badge: '無料ツール',
    title: 'サイトはどのAIクローラーを拒否していますか',
    subtitle:
      'robots.txt を読み取り、AIクローラーごとに許可か拒否かをお見せします。あわせて、ファイルのどの行がそう判定したかもお示しします。',
    trust: ['登録不要、メールアドレスも不要', '1つのファイルを1回読み取るだけ', 'トップページだけでなく、特定のパスも確認できます'],
  },
  form: {
    urlLabel: 'サイトのアドレス',
    urlPlaceholder: 'example.com',
    pathLabel: '確認するパス（任意）',
    pathPlaceholder: '/blog/',
    pathHint: '空欄のままにすると、トップページを確認します。robots.txt の指定はパスごとに変わります。',
    submit: 'クローラーを確認する',
    submitting: 'robots.txt を読み取っています…',
    errors: {
      invalid_url: 'このアドレスは正しくないようです。example.com のような形でお試しください。',
      blocked_url: '確認できるのは公開されているサイトのみです。',
      unreachable: 'ただ今そのサイトに接続できませんでした。少し時間をおいてもう一度お試しください。',
      rate_limited: '短い間に多くのサイトが確認されました。1分ほどおいてもう一度お試しください。',
      internal: '当社側で処理が完了しませんでした。少し時間をおいてもう一度お試しください。',
    },
  },
  results: {
    heading: '確認の対象',
    forPath: '対象のパス',
    robotsFound: 'robots.txt を読み取りました',
    robotsAbsent: 'このサイトは robots.txt を返していないため、このファイルによる拒否はありません。',
    robotsUnreadable: 'サイトがファイルを返さなかったため、そこから方針を読み取ることはできません。以下の結果は、何も拒否されていないものとして扱っています。',
    allowedCount: '許可',
    blockedCount: '拒否',
    allowed: '許可',
    blocked: '拒否',
    decidedBy: '判定した行',
    noRule: '該当する指定がありません。既定では許可です',
    viaWildcard: '全体向けのグループによる判定',
    ignoresRobots: 'このクローラーは robots.txt を尊重すると明言していません',
    sitemapsTitle: 'ファイル内で宣言されているサイトマップ',
    again: 'ほかのサイトを確認する',
  },
  purposes: {
    train: { label: '学習', blurb: 'モデルの学習のためにページを収集します。拒否すると、次のモデルに載らなくなります。' },
    answer: { label: 'その場での回答', blurb: '誰かが質問したその時にページを取得し、回答の中でリンク付きで引用します。' },
    search: { label: '検索インデックス', blurb: '検索インデックスを作ります。AIの回答もこの上に成り立っています。' },
    ads: { label: '広告', blurb: '広告のリンク先ページを確認します。拒否しても、回答にも検索インデックスにも影響しません。' },
  },
  groups: { ai: 'AIクローラー', classic: '従来の検索クローラー' },
  reference: {
    title: 'それぞれの正体',
    datasetName: 'AI クローラー リファレンス表',
    intro: 'この表は単体で読めます。User-agent の行に現れるクローラー名、運営元、そして何のためのものかです。',
    colAgent: 'User-agent',
    colOperator: '運営元',
    colPurpose: '何のためか',
  },
  limits: {
    title: 'この確認では分からないこと',
    items: [
      'robots.txt はお願いであって、壁ではありません。クローラーは無視できます。',
      'robots.txt が許可しているクローラーを、ファイアウォールやCDNが拒否していることがあります。',
      'この確認は、ある一瞬の状態を示すものです。ファイルを書き換えれば、答えはすぐ変わります。',
      '学習クローラーを拒否することと、その場で回答するクローラーを拒否することは、まったく別の判断です。',
    ],
  },
  cta: {
    title: 'AIが実際に自社に言及しているかを確かめる',
    body: 'アクセスできるかどうかは最初の一歩にすぎません。Go Top SEOは、ChatGPT、Gemini、Google AIの回答に自社が出てくるかを自動で確認し、GoogleとGoogleマップでの順位を毎月追跡します。',
    button: '7日間の無料トライアル、クレジットカードは不要',
  },
}

const de: AiCrawlerCopy = {
  meta: {
    title: 'Welche KI-Crawler blockiert Ihre robots.txt? – Go Top SEO',
    description:
      'Domain eingeben und sehen, welche KI-Crawler — GPTBot, ClaudeBot, PerplexityBot, Google-Extended und weitere — Ihre robots.txt blockiert, und welche Zeile das jeweils entscheidet. Ohne Anmeldung.',
  },
  page: {
    badge: 'Kostenloses Tool',
    title: 'Welche KI-Crawler blockiert Ihre Website?',
    subtitle:
      'Wir lesen Ihre robots.txt und zeigen für jeden KI-Crawler, ob er erlaubt oder blockiert ist — und welche Zeile der Datei das entscheidet.',
    trust: ['Ohne Anmeldung, ohne E-Mail-Adresse', 'Eine Datei, einmal gelesen', 'Prüft nicht nur die Startseite, sondern auch einen einzelnen Pfad'],
  },
  form: {
    urlLabel: 'Adresse der Website',
    urlPlaceholder: 'beispiel.de',
    pathLabel: 'Zu prüfender Pfad (optional)',
    pathPlaceholder: '/blog/',
    pathHint: 'Leer lassen, um die Startseite zu prüfen. Die Regeln in der robots.txt können sich je Pfad unterscheiden.',
    submit: 'Crawler prüfen',
    submitting: 'robots.txt wird gelesen …',
    errors: {
      invalid_url: 'Diese Adresse sieht nicht richtig aus. Versuchen Sie es in der Form beispiel.de.',
      blocked_url: 'Es lassen sich nur öffentlich erreichbare Websites prüfen.',
      unreachable: 'Diese Website war gerade nicht erreichbar. Bitte versuchen Sie es später erneut.',
      rate_limited: 'In kurzer Zeit wurden viele Websites geprüft. Bitte warten Sie eine Minute und versuchen Sie es erneut.',
      internal: 'Die Prüfung ist auf unserer Seite nicht durchgelaufen. Bitte versuchen Sie es später erneut.',
    },
  },
  results: {
    heading: 'Geprüft wurde',
    forPath: 'Geprüfter Pfad',
    robotsFound: 'robots.txt gelesen',
    robotsAbsent: 'Diese Website liefert keine robots.txt aus, daher blockiert diese Datei nichts.',
    robotsUnreadable: 'Die Website hat die Datei nicht ausgeliefert, daher lässt sich daraus keine Regel lesen. Die Ergebnisse unten behandeln nichts als blockiert.',
    allowedCount: 'Erlaubt',
    blockedCount: 'Blockiert',
    allowed: 'Erlaubt',
    blocked: 'Blockiert',
    decidedBy: 'Entscheidende Zeile',
    noRule: 'Keine passende Regel. Standardmäßig erlaubt',
    viaWildcard: 'Entschieden durch die Gruppe für alle Crawler',
    ignoresRobots: 'Dieser Crawler sagt nicht zu, die robots.txt zu beachten',
    sitemapsTitle: 'In der Datei angegebene Sitemaps',
    again: 'Eine andere Website prüfen',
  },
  purposes: {
    train: { label: 'Training', blurb: 'Sammelt Seiten, um ein Modell zu trainieren. Wer ihn blockiert, kommt im nächsten Modell nicht vor.' },
    answer: { label: 'Antwort in Echtzeit', blurb: 'Holt die Seite in dem Moment, in dem jemand fragt, und zitiert sie mit Link in der Antwort.' },
    search: { label: 'Suchindex', blurb: 'Baut den Suchindex, auf dem auch die KI-Antworten aufsetzen.' },
    ads: { label: 'Werbung', blurb: 'Prüft die Zielseiten von Anzeigen. Eine Blockade wirkt sich weder auf Antworten noch auf den Suchindex aus.' },
  },
  groups: { ai: 'KI-Crawler', classic: 'Klassische Suchmaschinen-Crawler' },
  reference: {
    title: 'Wer dahintersteht',
    datasetName: 'Referenztabelle der KI-Crawler',
    intro: 'Diese Tabelle lässt sich auch für sich lesen: der Name, der in der User-agent-Zeile steht, der Betreiber und der Zweck.',
    colAgent: 'User-agent',
    colOperator: 'Betreiber',
    colPurpose: 'Zweck',
  },
  limits: {
    title: 'Was diese Prüfung nicht zeigt',
    items: [
      'Die robots.txt ist eine Bitte, keine Mauer. Ein Crawler kann sie ignorieren.',
      'Eine Firewall oder ein CDN kann einen Crawler blockieren, den die robots.txt erlaubt.',
      'Die Prüfung beschreibt einen Augenblick. Wer die Datei ändert, ändert die Antwort sofort.',
      'Einen Trainings-Crawler zu blockieren und einen Crawler zu blockieren, der live antwortet, sind zwei völlig verschiedene Entscheidungen.',
    ],
  },
  cta: {
    title: 'Herausfinden, ob die KI Ihr Unternehmen wirklich nennt',
    body: 'Der Zugang ist nur der erste Schritt. Go Top SEO prüft automatisch, ob Ihr Unternehmen in den Antworten von ChatGPT, Gemini und Google AI vorkommt, und verfolgt Ihre Positionen bei Google und in Google Maps monatlich.',
    button: '7 Tage kostenlos testen, ohne Kreditkarte',
  },
}

const pl: AiCrawlerCopy = {
  meta: {
    title: 'Które roboty AI blokuje Państwa robots.txt? – Go Top SEO',
    description:
      'Prosimy podać domenę, a pokażemy, które roboty AI — GPTBot, ClaudeBot, PerplexityBot, Google-Extended i inne — blokuje Państwa plik robots.txt oraz która reguła o tym decyduje dla każdego z nich. Bez rejestracji.',
  },
  page: {
    badge: 'Narzędzie bezpłatne',
    title: 'Które roboty AI blokuje Państwa witryna?',
    subtitle:
      'Czytamy Państwa plik robots.txt i dla każdego robota AI pokazujemy, czy jest dopuszczony czy zablokowany — oraz która reguła pliku o tym decyduje.',
    trust: ['Bez rejestracji i bez adresu e-mail', 'Jeden plik, czytany jeden raz', 'Sprawdza nie tylko stronę główną, lecz także wskazaną ścieżkę'],
  },
  form: {
    urlLabel: 'Adres witryny',
    urlPlaceholder: 'przyklad.pl',
    pathLabel: 'Ścieżka do sprawdzenia (opcjonalnie)',
    pathPlaceholder: '/blog/',
    pathHint: 'Pozostawione puste oznacza sprawdzenie strony głównej. Reguły w pliku robots.txt mogą różnić się dla różnych ścieżek.',
    submit: 'Sprawdź roboty',
    submitting: 'Czytamy plik robots.txt\u2026',
    errors: {
      invalid_url: 'Ten adres nie wygląda poprawnie. Prosimy podać go w postaci przyklad.pl.',
      blocked_url: 'Sprawdzić można wyłącznie witryny dostępne publicznie.',
      unreachable: 'Ta witryna była właśnie nieosiągalna. Prosimy spróbować później.',
      rate_limited: 'W krótkim czasie sprawdzono wiele witryn. Prosimy odczekać minutę i spróbować ponownie.',
      internal: 'Sprawdzenie nie zakończyło się po naszej stronie. Prosimy spróbować później.',
    },
  },
  results: {
    heading: 'Sprawdzono',
    forPath: 'Sprawdzona ścieżka',
    robotsFound: 'Plik robots.txt przeczytany',
    robotsAbsent: 'Ta witryna nie udostępnia pliku robots.txt, więc ten plik niczego nie blokuje.',
    robotsUnreadable: 'Witryna nie udostępniła pliku, więc nie da się z niego odczytać żadnej reguły. Wyniki poniżej nie traktują niczego jako zablokowane.',
    allowedCount: 'Dopuszczone',
    blockedCount: 'Zablokowane',
    allowed: 'Dopuszczony',
    blocked: 'Zablokowany',
    decidedBy: 'Decydująca reguła',
    noRule: 'Brak pasującej reguły. Domyślnie dopuszczony',
    viaWildcard: 'Zdecydowała grupa dla wszystkich robotów',
    ignoresRobots: 'Ten robot nie zobowiązuje się do przestrzegania pliku robots.txt',
    sitemapsTitle: 'Mapy witryny wskazane w pliku',
    again: 'Sprawdź inną witrynę',
  },
  purposes: {
    train: { label: 'Trenowanie', blurb: 'Zbiera strony, by wytrenować model. Kto go zablokuje, nie trafi do kolejnego modelu.' },
    answer: { label: 'Odpowiedź w czasie rzeczywistym', blurb: 'Pobiera stronę w chwili, gdy ktoś o coś pyta, i przytacza ją z linkiem w odpowiedzi.' },
    search: { label: 'Indeks wyszukiwania', blurb: 'Buduje indeks wyszukiwania, na którym opierają się także odpowiedzi AI.' },
    ads: { label: 'Reklamy', blurb: 'Sprawdza strony docelowe reklam. Zablokowanie go nie ma wpływu na odpowiedzi ani na indeks wyszukiwania.' },
  },
  groups: { ai: 'Roboty AI', classic: 'Klasyczne roboty wyszukiwarek' },
  reference: {
    title: 'Kto za tym stoi',
    datasetName: 'Tabela referencyjna crawlerów AI',
    intro: 'Tę tabelę można czytać także osobno: nazwa występująca w wierszu User-agent, właściciel i cel.',
    colAgent: 'User-agent',
    colOperator: 'Właściciel',
    colPurpose: 'Cel',
  },
  limits: {
    title: 'Czego to sprawdzenie nie pokazuje',
    items: [
      'Plik robots.txt jest prośbą, nie murem. Robot może go zignorować.',
      'Zapora sieciowa albo CDN mogą zablokować robota, którego robots.txt dopuszcza.',
      'Sprawdzenie opisuje jedną chwilę. Kto zmieni plik, od razu zmieni odpowiedź.',
      'Zablokowanie robota trenującego i zablokowanie robota, który odpowiada na żywo, to dwie całkowicie różne decyzje.',
    ],
  },
  cta: {
    title: 'Sprawdźmy, czy AI naprawdę wymienia Państwa firmę',
    body: 'Dostęp to dopiero pierwszy krok. Go Top SEO automatycznie sprawdza, czy Państwa firma pojawia się w odpowiedziach ChatGPT, Gemini i Google AI, i co miesiąc monitoruje pozycje w Google oraz w Mapach Google.',
    button: 'Wypróbuj 7 dni bezpłatnie, bez karty kredytowej',
  },
}

const nl: AiCrawlerCopy = {
  meta: {
    title: 'Welke AI-crawlers blokkeert uw robots.txt? – Go Top SEO',
    description:
      'Vul een domein in en zie welke AI-crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended en meer — uw robots.txt blokkeert, en welke regel dat per crawler beslist. Zonder aanmelden.',
  },
  page: {
    badge: 'Gratis tool',
    title: 'Welke AI-crawlers blokkeert uw website?',
    subtitle:
      'Wij lezen uw robots.txt en laten voor elke AI-crawler zien of die is toegestaan of geblokkeerd — en welke regel van het bestand dat beslist.',
    trust: ['Zonder aanmelden, zonder e-mailadres', 'Één bestand, één keer gelezen', 'Controleert niet alleen de startpagina, maar ook een afzonderlijk pad'],
  },
  form: {
    urlLabel: 'Adres van de website',
    urlPlaceholder: 'voorbeeld.nl',
    pathLabel: 'Te controleren pad (optioneel)',
    pathPlaceholder: '/blog/',
    pathHint: 'Laat dit leeg om de startpagina te controleren. De regels in de robots.txt kunnen per pad verschillen.',
    submit: 'Crawlers controleren',
    submitting: 'robots.txt wordt gelezen…',
    errors: {
      invalid_url: 'Dit adres ziet er niet goed uit. Probeer het in de vorm voorbeeld.nl.',
      blocked_url: 'Alleen openbaar bereikbare websites kunnen worden gecontroleerd.',
      unreachable: 'Deze website was net niet bereikbaar. Probeer het later opnieuw.',
      rate_limited: 'Er zijn in korte tijd veel websites gecontroleerd. Wacht een minuut en probeer het opnieuw.',
      internal: 'De controle is aan onze kant niet doorgelopen. Probeer het later opnieuw.',
    },
  },
  results: {
    heading: 'Gecontroleerd is',
    forPath: 'Gecontroleerd pad',
    robotsFound: 'robots.txt gelezen',
    robotsAbsent: 'Deze website levert geen robots.txt, dus dit bestand blokkeert niets.',
    robotsUnreadable: 'De website heeft het bestand niet geleverd, dus daaruit valt geen regel te lezen. De resultaten hieronder behandelen niets als geblokkeerd.',
    allowedCount: 'Toegestaan',
    blockedCount: 'Geblokkeerd',
    allowed: 'Toegestaan',
    blocked: 'Geblokkeerd',
    decidedBy: 'Beslissende regel',
    noRule: 'Geen passende regel. Standaard toegestaan',
    viaWildcard: 'Beslist door de groep voor alle crawlers',
    ignoresRobots: 'Deze crawler zegt niet toe de robots.txt te volgen',
    sitemapsTitle: 'In het bestand opgegeven sitemaps',
    again: 'Een andere website controleren',
  },
  purposes: {
    train: { label: 'Training', blurb: 'Verzamelt pagina’s om een model te trainen. Wie hem blokkeert, komt in het volgende model niet voor.' },
    answer: { label: 'Antwoord in real time', blurb: 'Haalt de pagina op het moment dat iemand iets vraagt, en citeert die met een link in het antwoord.' },
    search: { label: 'Zoekindex', blurb: 'Bouwt de zoekindex waarop ook de AI-antwoorden rusten.' },
    ads: { label: 'Advertenties', blurb: 'Controleert de bestemmingspagina’s van advertenties. Een blokkade heeft geen gevolgen voor antwoorden of voor de zoekindex.' },
  },
  groups: { ai: 'AI-crawlers', classic: 'Klassieke zoekmachinecrawlers' },
  reference: {
    title: 'Wie erachter zit',
    datasetName: 'Referentietabel van AI-crawlers',
    intro: 'Deze tabel is ook los te lezen: de naam die in de User-agent-regel staat, de eigenaar en het doel.',
    colAgent: 'User-agent',
    colOperator: 'Eigenaar',
    colPurpose: 'Doel',
  },
  limits: {
    title: 'Wat deze controle niet laat zien',
    items: [
      'De robots.txt is een verzoek, geen muur. Een crawler kan hem negeren.',
      'Een firewall of een CDN kan een crawler blokkeren die de robots.txt toestaat.',
      'De controle beschrijft één moment. Wie het bestand aanpast, verandert het antwoord direct.',
      'Een trainingscrawler blokkeren en een crawler blokkeren die live antwoordt, zijn twee volstrekt verschillende beslissingen.',
    ],
  },
  cta: {
    title: 'Uitzoeken of de AI uw bedrijf echt noemt',
    body: 'De toegang is pas de eerste stap. Go Top SEO controleert automatisch of uw bedrijf voorkomt in de antwoorden van ChatGPT, Gemini en Google AI, en volgt uw posities in Google en in Google Maps maandelijks.',
    button: '7 dagen gratis uitproberen, zonder creditcard',
  },
}

const COPY: Record<PublicLocale, AiCrawlerCopy> = { he, en, es, 'pt-BR': ptBR, fr, it, ja, de, nl, pl }

export function aiCrawlerCopy(locale: PublicLocale): AiCrawlerCopy {
  return COPY[locale] ?? he
}
