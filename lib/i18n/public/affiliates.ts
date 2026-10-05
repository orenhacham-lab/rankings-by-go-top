/**
 * The affiliate program's public page, in every language the site speaks.
 *
 * The NUMBERS live here once (AFFILIATE_TERMS) and every language reads them, so
 * no two languages can ever promise different rates — a page that said
 * 30% in one language and 25% in another would be an offer we could not honour.
 * lib/affiliate/referral.ts owns the same window in code, and the guard
 * __qa__/affiliates-page.qa.ts holds the two to the same number.
 *
 * The page does NOT take an application through a form: applications are read and
 * approved by a person (that manual approval is the program's main defence against
 * someone referring themselves), so the page opens WhatsApp or email. The form, the
 * affiliate dashboard and the payouts come once the attribution table exists.
 */
import { REFERRAL_WINDOW_DAYS } from '@/lib/affiliate/referral'
import type { PublicLocale } from '@/lib/i18n/locales'

export const AFFILIATE_TERMS = {
  /** Commission on every payment, for as long as the customer keeps paying. */
  baseRate: 30,
  /** The higher rate, from this many active paying referrals onwards. */
  topRate: 40,
  topRateFrom: 10,
  /**
   * The program's INTENDED last-click window, and the number the referral rules
   * in lib/affiliate/referral.ts carry. It is deliberately NOT promised on the
   * page: honouring a window means remembering a click for that long, and the
   * attribution decided on 5 October 2026 stores nothing on the visitor's
   * device at all (lib/affiliate/tracking-flag.ts). A page that promised 90
   * days while nothing is remembered would be an offer to partners we could not
   * keep, which is why __qa__/affiliates-page.qa.ts fails if any language puts a
   * day count back into the copy while there is no storage to support it.
   */
  windowDays: REFERRAL_WINDOW_DAYS,
  /** Paid once the balance passes this, 30 days after the customer's payment settles. */
  minPayoutUsd: 100,
  minPayoutIls: 350,
  holdDays: 30,
} as const

export type AffiliateCopy = {
  metaTitle: string
  metaDescription: string
  eyebrow: string
  title: string
  accent: string
  subtitle: string
  trust: string[]
  apply: string
  talk: string
  whatsappMessage: string
  whyTitle: string
  whyIntro: string
  why: { title: string; body: string }[]
  howTitle: string
  how: { title: string; body: string }[]
  rulesTitle: string
  rulesIntro: string
  rules: { title: string; body: string }[]
  faqTitle: string
  faq: { q: string; a: string }[]
  /**
   * The page states rates, payout thresholds and reversal rules, which makes it
   * an offer — so it has to point at the agreement that binds it, in the
   * reader's own language. The legal thread asked for this and it is right:
   * terms a partner cannot find are terms they never agreed to.
   */
  termsNote: string
  termsLink: string
  closeTitle: string
  closeBody: string
}

const T = AFFILIATE_TERMS

export const AFFILIATES_COPY: Record<PublicLocale, AffiliateCopy> = {
  he: {
    metaTitle: 'תוכנית שותפים | Go Top SEO',
    metaDescription: `הרוויחו ${T.baseRate}% מכל תשלום, כל עוד הלקוח ממשיך, ועד ${T.topRate}% משותפים ותיקים. תוכנית השותפים של Go Top SEO.`,
    eyebrow: 'תוכנית שותפים',
    title: 'ממליצים עלינו ממילא?',
    accent: `קבלו ${T.baseRate}% מכל תשלום`,
    subtitle: `על כל לקוח שמגיע דרככם אתם מקבלים ${T.baseRate}% מכל תשלום שלו, לא רק מהראשון, וכל עוד הוא לקוח. שותף עם ${T.topRateFrom} לקוחות משלמים פעילים עובר ל-${T.topRate}%.`,
    trust: [`${T.baseRate}% מכל תשלום`, `עד ${T.topRate}%`, 'עמלה חוזרת כל חודש'],
    apply: 'להגשת מועמדות',
    talk: 'לדבר איתנו בוואטסאפ',
    whatsappMessage: 'היי, אני רוצה להצטרף לתוכנית השותפים',
    whyTitle: 'למה דווקא זה שווה',
    whyIntro: 'רוב התוכניות בתחום משלמות פעם אחת על לקוח. כאן התשלום חוזר כל חודש.',
    why: [
      { title: 'עמלה חוזרת, בלי תקרה', body: `${T.baseRate}% מכל תשלום, כל חודש, כל עוד הלקוח נשאר. בלי הגבלה של שנה ובלי תאריך סיום.` },
      { title: 'מוצר שנשאר', body: 'המערכת כותבת ומפרסמת תוכן כל חודש, אז לקוח שנכנס בדרך כלל נשאר. עמלה חוזרת שווה משהו רק כשהמוצר שווה משהו.' },
      { title: 'קהל שכבר שואל אתכם', body: 'בעלי אתרים, חנויות וסוכנויות שואלים אתכם ממילא מה לעשות עם SEO. זו התשובה, ועליה אתם מקבלים.' },
    ],
    howTitle: 'איך זה עובד',
    how: [
      { title: 'מגישים מועמדות', body: 'מספרים לנו מי אתם ואיפה הקהל שלכם, אתר, רשימה, ערוץ או לקוחות. אנחנו עוברים על כל בקשה ידנית ומאשרים.' },
      { title: 'מקבלים קישור אישי', body: 'הקישור שלכם עובד על כל עמוד באתר. כל מי שנרשם דרכו נרשם עליכם.' },
      { title: 'מקבלים כסף', body: `העמלה נצברת על כל תשלום. היא משתחררת ${T.holdDays} יום אחרי שהתשלום של הלקוח התיישב, ומשולמת כשהיתרה עוברת ${T.minPayoutIls} שקל או ${T.minPayoutUsd} דולר.` },
    ],
    rulesTitle: 'הכללים, בלי אותיות קטנות',
    rulesIntro: 'עדיף שתדעו אותם עכשיו ולא אחרי שתשקיעו עבודה.',
    rules: [
      { title: 'לא על עצמכם', body: 'אין עמלה על החשבון שלכם, של העסק שלכם או של עובד שלכם. סוכנות שרושמת לקוח אמיתי כן מקבלת, זה בדיוק הקהל שאנחנו רוצים.' },
      { title: 'בלי פרסום על השם שלנו', body: 'אסור לרכוש פרסום ממומן על שם המותג Go Top או וריאציות שלו.' },
      { title: 'בלי אתרי קופונים', body: 'ולא הצעות מהסוג של "תירשמו דרכי ואחזיר לכם חלק".' },
      { title: 'אומרים שאתם מקבלים עמלה', body: 'זו דרישת חוק בחלק מהמדינות, ובכל מקרה זה הוגן כלפי מי שסומך עליכם.' },
      { title: 'ביטול מבטל עמלה', body: 'עמלה על לקוח שקיבל החזר או עשה ביטול חיוב מתבטלת ומנוכה מהתשלום הבא.' },
      { title: 'חשבונית בישראל', body: 'שותף ישראלי מוציא לנו חשבונית. מי שאין לו עוסק יכול לקבל במקום זה קרדיט בחשבון.' },
    ],
    faqTitle: 'שאלות',
    faq: [
      { q: 'מתי מקבלים את הכסף?', a: `העמלה נצברת מיד, משתחררת ${T.holdDays} יום אחרי שהתשלום של הלקוח התיישב, כדי שחלון הביטול יעבור, ומשולמת כשהיתרה עוברת ${T.minPayoutIls} שקל או ${T.minPayoutUsd} דולר. התשלום בפייפאל, ב-Wise או בהעברה בנקאית, מה שנוח לכם.` },
      { q: 'מה קורה אם הלקוח התחיל בניסיון?', a: 'הניסיון הוא שבעה ימים ואין עליו עמלה, כי אין תשלום. ברגע שהוא הופך ללקוח משלם, העמלה מתחילה לרוץ מהתשלום הראשון.' },
      { q: 'איך יודעים שהלקוח הגיע דרכי?', a: 'לפי הקליק האחרון על הקישור שלכם בדרך להרשמה. כל בקשה וכל עמלה עוברות אצלנו בדיקה של אדם, כך שאם מקרה מסוים לא ברור אנחנו בודקים אותו ולא מפילים אותו עליכם. אם נרחיב את הייחוס גם לקליק שחוזר אחרי כמה שבועות, נעדכן את השותפים בכתב לפני.' },
      { q: 'אני כבר לקוח. אפשר לקבל עמלה על עצמי?', a: 'לא. הקישור מצטרף רק לחשבון חדש, והחשבון שלכם והפרויקטים שלכם מוחרגים. אבל אתם בהחלט יכולים להמליץ לאחרים ולקבל על זה.' },
      { q: 'יש מינימום לקוחות?', a: `אין. הכסף משולם כשהיתרה עוברת ${T.minPayoutIls} שקל, ועד אז הוא פשוט ממשיך להיצבר.` },
    ],
    termsNote: 'הכללים האלה והתנאים המלאים של התוכנית, כולל אופן הייחוס, מועדי התשלום וביטול עמלה, מופיעים בהסכם.',
    termsLink: 'להסכם תוכנית השותפים',
    closeTitle: 'נשמע מתאים לכם?',
    closeBody: 'ספרו לנו מי אתם ואיפה הקהל שלכם. אנחנו עונים לכל בקשה.',
  },
  en: {
    metaTitle: 'Affiliate program | Go Top SEO',
    metaDescription: `Earn ${T.baseRate}% of every payment for as long as the customer stays, and up to ${T.topRate}% once you bring ${T.topRateFrom}. The Go Top SEO affiliate program.`,
    eyebrow: 'Affiliate program',
    title: 'Already recommending us?',
    accent: `Take ${T.baseRate}% of every payment`,
    subtitle: `For every customer who comes through you, you earn ${T.baseRate}% of every payment they make, not just the first, for as long as they stay. Bring ${T.topRateFrom} active paying customers and you move to ${T.topRate}%.`,
    trust: [`${T.baseRate}% of every payment`, `Up to ${T.topRate}%`, 'Recurring every month'],
    apply: 'Apply to join',
    talk: 'Talk to us on WhatsApp',
    whatsappMessage: 'Hi, I would like to join the affiliate program',
    whyTitle: 'Why this one is worth the work',
    whyIntro: 'Most programs in this field pay once per customer. Here the payment comes back every month.',
    why: [
      { title: 'Recurring, with no cap', body: `${T.baseRate}% of every payment, every month, for as long as the customer stays. No twelve-month limit and no end date.` },
      { title: 'A product people keep', body: 'The system writes and publishes content every month, so a customer who joins tends to stay. A recurring commission is only worth something when the product is.' },
      { title: 'An audience already asking you', body: 'Site owners, shops and agencies ask you what to do about SEO anyway. This is the answer, and you get paid for it.' },
    ],
    howTitle: 'How it works',
    how: [
      { title: 'Apply', body: 'Tell us who you are and where your audience is: a site, a list, a channel or your own clients. We read every application ourselves and approve it.' },
      { title: 'Get your link', body: 'Your link works on every page of the site. Anyone who signs up through it is credited to you.' },
      { title: 'Get paid', body: `Commission builds on every payment. It is released ${T.holdDays} days after the customer's payment settles, and paid once your balance passes $${T.minPayoutUsd} or ₪${T.minPayoutIls}.` },
    ],
    rulesTitle: 'The rules, with no small print',
    rulesIntro: 'Better to know them now than after you have done the work.',
    rules: [
      { title: 'Not on yourself', body: 'No commission on your own account, your own business or an employee of it. An agency signing up a real client does earn, and that is exactly the audience we want.' },
      { title: 'No ads on our name', body: 'No paid advertising on the Go Top brand name or variations of it.' },
      { title: 'No coupon sites', body: 'And no "sign up through me and I will refund you" offers.' },
      { title: 'Say that you earn', body: 'Tell your audience you get a commission. It is the law in some countries and fair to the people trusting you everywhere.' },
      { title: 'A refund reverses it', body: 'Commission on a customer who refunds or charges back is reversed and deducted from your next payout.' },
      { title: 'Invoices in Israel', body: 'Israeli affiliates invoice us. Anyone without a registered business can take account credit instead.' },
    ],
    faqTitle: 'Questions',
    faq: [
      { q: 'When do I get paid?', a: `Commission builds immediately, is released ${T.holdDays} days after the customer's payment settles so the refund window has passed, and is paid once your balance passes $${T.minPayoutUsd} or ₪${T.minPayoutIls}. By PayPal, Wise or bank transfer, whichever suits you.` },
      { q: 'What if the customer is on the trial?', a: 'The trial is seven days and earns nothing, because nothing is paid. The moment they become a paying customer, commission starts from their first payment.' },
      { q: 'How do you know the customer came through me?', a: 'By the last click on your link on the way to signing up. Every application and every commission is reviewed by a person, so a case that is not clear cut gets looked at rather than going against you. If we extend crediting to a click that comes back weeks later, partners will be told in writing first.' },
      { q: 'I am already a customer. Can I earn on myself?', a: 'No. A link attaches to a new account only, and your own account and projects are excluded. You can certainly recommend us to others and earn on that.' },
      { q: 'Is there a minimum number of customers?', a: `None. You are paid once your balance passes $${T.minPayoutUsd}, and until then it simply keeps building.` },
    ],
    termsNote: 'These rules and the program’s full terms, including how a referral is credited, when commission is paid and when it is reversed, are in the agreement.',
    termsLink: 'Read the Partner Program Agreement',
    closeTitle: 'Sound like you?',
    closeBody: 'Tell us who you are and where your audience is. We answer every application.',
  },
  es: {
    metaTitle: 'Programa de afiliados | Go Top SEO',
    metaDescription: `Gana el ${T.baseRate}% de cada pago mientras el cliente siga, y hasta el ${T.topRate}% cuando traigas ${T.topRateFrom}. Programa de afiliados de Go Top SEO.`,
    eyebrow: 'Programa de afiliados',
    title: '¿Ya nos recomiendas?',
    accent: `Llévate el ${T.baseRate}% de cada pago`,
    subtitle: `Por cada cliente que llegue a través de ti ganas el ${T.baseRate}% de cada pago que haga, no solo del primero, mientras siga con nosotros. Con ${T.topRateFrom} clientes activos que pagan, pasas al ${T.topRate}%.`,
    trust: [`${T.baseRate}% de cada pago`, `Hasta el ${T.topRate}%`, 'Recurrente cada mes'],
    apply: 'Solicitar unirme',
    talk: 'Hablar por WhatsApp',
    whatsappMessage: 'Hola, quiero unirme al programa de afiliados',
    whyTitle: 'Por qué merece la pena',
    whyIntro: 'Casi todos los programas del sector pagan una sola vez por cliente. Aquí el pago vuelve cada mes.',
    why: [
      { title: 'Recurrente y sin tope', body: `El ${T.baseRate}% de cada pago, cada mes, mientras el cliente siga. Sin límite de doce meses y sin fecha de fin.` },
      { title: 'Un producto que se queda', body: 'El sistema escribe y publica contenido cada mes, así que el cliente que entra suele quedarse. Una comisión recurrente solo vale algo si el producto también.' },
      { title: 'Un público que ya te pregunta', body: 'Dueños de webs, tiendas y agencias ya te preguntan qué hacer con el SEO. Esta es la respuesta, y cobras por ella.' },
    ],
    howTitle: 'Cómo funciona',
    how: [
      { title: 'Solicítalo', body: 'Cuéntanos quién eres y dónde está tu público: una web, una lista, un canal o tus propios clientes. Leemos cada solicitud a mano y la aprobamos.' },
      { title: 'Recibe tu enlace', body: 'Tu enlace funciona en cualquier página de la web. Quien se registre a través de él se te atribuye.' },
      { title: 'Cobra', body: `La comisión se acumula con cada pago. Se libera ${T.holdDays} días después de que el pago del cliente quede firme y se abona cuando tu saldo supera los ${T.minPayoutUsd} $.` },
    ],
    rulesTitle: 'Las reglas, sin letra pequeña',
    rulesIntro: 'Mejor saberlas ahora que después de hacer el trabajo.',
    rules: [
      { title: 'No por ti mismo', body: 'Sin comisión por tu propia cuenta, tu empresa o un empleado de ella. Una agencia que da de alta a un cliente real sí cobra, y ese es justo el público que queremos.' },
      { title: 'Sin anuncios con nuestra marca', body: 'Nada de publicidad de pago sobre la marca Go Top ni sus variantes.' },
      { title: 'Sin webs de cupones', body: 'Ni ofertas del tipo «regístrate conmigo y te devuelvo parte».' },
      { title: 'Di que cobras comisión', body: 'En algunos países es obligatorio, y con quien confía en ti es lo justo en todos.' },
      { title: 'Un reembolso la revierte', body: 'La comisión de un cliente que pide reembolso o hace un contracargo se revierte y se descuenta del siguiente pago.' },
      { title: 'Factura en Israel', body: 'Los afiliados en Israel nos emiten factura. Quien no tenga actividad dada de alta puede recibir crédito en su cuenta.' },
    ],
    faqTitle: 'Preguntas',
    faq: [
      { q: '¿Cuándo cobro?', a: `La comisión se acumula al momento, se libera ${T.holdDays} días después de que el pago del cliente quede firme para que pase la ventana de reembolso, y se abona cuando tu saldo supera los ${T.minPayoutUsd} $. Por PayPal, Wise o transferencia bancaria, lo que prefieras.` },
      { q: '¿Y si el cliente está en la prueba gratuita?', a: 'La prueba dura siete días y no genera comisión, porque no hay pago. En cuanto pasa a ser cliente de pago, la comisión empieza desde su primer pago.' },
      { q: '¿Cómo sabéis que el cliente vino por mí?', a: 'Por el último clic en tu enlace de camino al registro. Cada solicitud y cada comisión las revisa una persona, así que un caso que no esté claro se mira en lugar de ir en tu contra. Si ampliamos la atribución a un clic que vuelve semanas después, se avisará a los socios por escrito antes.' },
      { q: 'Ya soy cliente. ¿Puedo cobrar por mí mismo?', a: 'No. Un enlace solo se asocia a una cuenta nueva, y tu cuenta y tus proyectos quedan excluidos. Lo que sí puedes es recomendarnos a otros y cobrar por ello.' },
      { q: '¿Hay un mínimo de clientes?', a: `Ninguno. Cobras cuando tu saldo supera los ${T.minPayoutUsd} $, y hasta entonces simplemente sigue acumulándose.` },
    ],
    termsNote: 'Estas reglas y las condiciones completas del programa, incluido cómo se atribuye una recomendación, cuándo se paga la comisión y cuándo se revierte, están en el acuerdo.',
    termsLink: 'Leer el Acuerdo del Programa de Socios',
    closeTitle: '¿Te encaja?',
    closeBody: 'Cuéntanos quién eres y dónde está tu público. Respondemos a todas las solicitudes.',
  },
  'pt-BR': {
    metaTitle: 'Programa de afiliados | Go Top SEO',
    metaDescription: `Ganhe ${T.baseRate}% de cada pagamento enquanto o cliente continuar, e até ${T.topRate}% quando você trouxer ${T.topRateFrom}. Programa de afiliados da Go Top SEO.`,
    eyebrow: 'Programa de afiliados',
    title: 'Já indica a gente?',
    accent: `Leve ${T.baseRate}% de cada pagamento`,
    subtitle: `Para cada cliente que chega por você, você ganha ${T.baseRate}% de cada pagamento que ele faz, não só do primeiro, enquanto ele continuar com a gente. Com ${T.topRateFrom} clientes pagantes ativos, você passa para ${T.topRate}%.`,
    trust: [`${T.baseRate}% de cada pagamento`, `Até ${T.topRate}%`, 'Recorrente todo mês'],
    apply: 'Quero me candidatar',
    talk: 'Falar no WhatsApp',
    whatsappMessage: 'Olá, quero entrar no programa de afiliados',
    whyTitle: 'Por que vale a pena',
    whyIntro: 'Quase todos os programas do setor pagam uma vez só por cliente. Aqui o pagamento volta todo mês.',
    why: [
      { title: 'Recorrente e sem teto', body: `${T.baseRate}% de cada pagamento, todo mês, enquanto o cliente continuar. Sem limite de doze meses e sem data de fim.` },
      { title: 'Um produto que fica', body: 'O sistema escreve e publica conteúdo todo mês, então o cliente que entra costuma ficar. Uma comissão recorrente só vale algo se o produto também valer.' },
      { title: 'Um público que já pergunta a você', body: 'Donos de sites, de lojas e agências já perguntam a você o que fazer com o SEO. Esta é a resposta, e você é pago por ela.' },
    ],
    howTitle: 'Como funciona',
    how: [
      { title: 'Candidate-se', body: 'Conte quem você é e onde está o seu público: um site, uma lista, um canal ou os seus próprios clientes. Lemos cada candidatura à mão e aprovamos.' },
      { title: 'Receba seu link', body: 'Seu link funciona em qualquer página do site. Quem se cadastrar por ele é creditado a você.' },
      { title: 'Receba o pagamento', body: `A comissão acumula a cada pagamento. Ela é liberada ${T.holdDays} dias depois de o pagamento do cliente ficar firme e é paga quando seu saldo passa de ${T.minPayoutUsd} dólares.` },
    ],
    rulesTitle: 'As regras, sem letras miúdas',
    rulesIntro: 'Melhor saber agora do que depois de fazer o trabalho.',
    rules: [
      { title: 'Não por você mesmo', body: 'Sem comissão pela sua própria conta, pela sua empresa ou por um funcionário dela. Uma agência que cadastra um cliente real recebe, e é exatamente esse o público que queremos.' },
      { title: 'Sem anúncios com a nossa marca', body: 'Nada de mídia paga sobre a marca Go Top nem suas variações.' },
      { title: 'Sem sites de cupom', body: 'Nem ofertas do tipo «cadastre-se comigo e eu devolvo uma parte».' },
      { title: 'Diga que você recebe comissão', body: 'Em alguns países é obrigatório, e com quem confia em você é o justo em todos.' },
      { title: 'Um reembolso reverte', body: 'A comissão de um cliente que pede reembolso ou faz um chargeback é revertida e descontada do pagamento seguinte.' },
      { title: 'Nota fiscal', body: 'Afiliados em Israel emitem nota fiscal para nós. Fora de Israel, a nota fiscal segue a regra do seu país, e quem não tem atividade registrada pode receber crédito na conta.' },
    ],
    faqTitle: 'Perguntas',
    faq: [
      { q: 'Quando eu recebo?', a: `A comissão acumula na hora, é liberada ${T.holdDays} dias depois de o pagamento do cliente ficar firme, para a janela de reembolso passar, e é paga quando seu saldo passa de ${T.minPayoutUsd} dólares. Por PayPal, Wise ou transferência bancária, como você preferir.` },
      { q: 'E se o cliente estiver no teste gratuito?', a: 'O teste dura sete dias e não gera comissão, porque não há pagamento. Assim que ele passa a ser cliente pagante, a comissão começa no primeiro pagamento dele.' },
      { q: 'Como vocês sabem que o cliente veio por mim?', a: 'Pelo último clique no seu link no caminho do cadastro. Cada inscrição e cada comissão passam pela análise de uma pessoa, então um caso que não esteja claro é verificado em vez de pesar contra você. Se estendermos o crédito para um clique que volta semanas depois, os parceiros serão avisados por escrito antes.' },
      { q: 'Já sou cliente. Posso receber por mim mesmo?', a: 'Não. Um link só se liga a uma conta nova, e a sua própria conta e os seus projetos ficam de fora. O que você pode é indicar a gente para outras pessoas e receber por isso.' },
      { q: 'Existe um mínimo de clientes?', a: `Nenhum. Você recebe quando seu saldo passa de ${T.minPayoutUsd} dólares, e até lá ele simplesmente continua acumulando.` },
    ],
    termsNote: 'Estas regras e os termos completos do programa, incluindo como uma indicação é creditada, quando a comissão é paga e quando ela é revertida, estão no contrato.',
    termsLink: 'Ler o Contrato do Programa de Parceiros',
    closeTitle: 'Faz sentido para você?',
    closeBody: 'Conte quem você é e onde está o seu público. Respondemos a todas as candidaturas.',
  },
}
