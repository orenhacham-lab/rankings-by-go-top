/**
 * The partner's own dashboard, in every language the site speaks.
 *
 * A partner is not a customer — they may never open the product itself — so this
 * screen reads the PUBLIC locale, like the marketing pages, rather than the
 * dashboard dictionaries a customer's app loads.
 *
 * WHAT IS NOT IN HERE, and cannot be: anything about a referred customer. The
 * live agreement promises a partner counts and amounts and never a referred
 * customer's email, site, plan or identity, and lib/affiliate/summary.ts is
 * shaped so that nothing else is available to put on the screen.
 *
 * `creatives` is the part that decides whether a partner ever posts anything. An
 * approved partner with a link and no words to put around it writes nothing, so
 * three are ready here — a post, a message to a client, and an email — each with
 * the link dropped in where it belongs. A partner edits them; that is the point
 * of giving them a draft rather than a brief.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type AffiliateDashboardCopy = {
  title: string
  subtitle: string
  /** Someone signed in who is not a partner (yet). */
  notPartnerTitle: string
  notPartnerBody: string
  notPartnerCta: string
  suspendedNotice: string
  linkTitle: string
  linkHint: string
  copyLink: string
  copied: string
  linkToHome: string
  linkToPricing: string
  linkToSignup: string
  linkToFreeCheck: string
  rateTitle: string
  rateNow: (rate: number) => string
  rateNext: (from: number, rate: number) => string
  rateTop: (rate: number) => string
  clicks30: string
  clicksTotal: string
  signedUp: string
  paying: string
  churned: string
  pending: string
  pendingHint: (days: number) => string
  payable: string
  payableHint: (ils: number, usd: number) => string
  paid: string
  reversed: string
  reversedHint: string
  payoutsTitle: string
  payoutsEmpty: string
  payoutDate: string
  payoutAmount: string
  payoutStatus: string
  payoutReference: string
  payoutDraft: string
  payoutPaid: string
  payoutCancelled: string
  creativesTitle: string
  creativesHint: string
  creativeCopy: string
  creatives: { label: string; body: string }[]
  termsLink: string
}

/** `{{link}}` is replaced with the partner's own link before the text is shown. */
export const CREATIVE_LINK_TOKEN = '{{link}}'

export const AFFILIATE_DASHBOARD_COPY: Record<PublicLocale, AffiliateDashboardCopy> = {
  he: {
    title: 'תוכנית השותפים',
    subtitle: 'הקישור שלכם, מה שהוא הביא, ומה שמגיע לכם.',
    notPartnerTitle: 'אתם לא בתוכנית השותפים',
    notPartnerBody: 'אם יש לכם קהל של בעלי אתרים, חנויות או סוכנויות, אתם מקבלים 30% מכל תשלום של כל לקוח שמגיע דרככם, כל עוד הוא לקוח.',
    notPartnerCta: 'לקרוא על התוכנית ולהגיש מועמדות',
    suspendedNotice: 'החשבון שלכם בתוכנית מושהה. הקישור ממשיך לעבוד למי שלוחץ עליו, אבל לא נצברות עמלות חדשות עד שנדבר.',
    linkTitle: 'הקישור שלכם',
    linkHint: 'עובד כמו שהוא. אפשר גם לבחור לאיפה הוא יוביל.',
    copyLink: 'העתקה',
    copied: 'הועתק',
    linkToHome: 'לדף הבית',
    linkToPricing: 'למחירים',
    linkToSignup: 'ישר להרשמה',
    linkToFreeCheck: 'לבדיקת אתר חינם',
    rateTitle: 'העמלה שלכם',
    rateNow: (rate) => `${rate}% מכל תשלום`,
    rateNext: (from, rate) => `מ-${from} לקוחות משלמים פעילים עוברים ל-${rate}%`,
    rateTop: (rate) => `אתם בשיעור הגבוה: ${rate}%`,
    clicks30: 'קליקים ב-30 יום',
    clicksTotal: 'קליקים בסך הכל',
    signedUp: 'נרשמו',
    paying: 'לקוחות משלמים',
    churned: 'הפסיקו',
    pending: 'ממתין',
    pendingHint: (days) => `נצבר ומשתחרר ${days} יום אחרי שהתשלום של הלקוח התיישב.`,
    payable: 'מאושר לתשלום',
    payableHint: (ils, usd) => `משולם כשהיתרה עוברת ${ils} ש"ח או ${usd} דולר.`,
    paid: 'שולם',
    reversed: 'בוטל',
    reversedHint: 'עמלה על לקוח שקיבל החזר או עשה ביטול חיוב.',
    payoutsTitle: 'תשלומים',
    payoutsEmpty: 'אין עדיין תשלומים. ברגע שהיתרה המאושרת עוברת את המינימום, אנחנו מעבירים.',
    payoutDate: 'תאריך',
    payoutAmount: 'סכום',
    payoutStatus: 'מצב',
    payoutReference: 'אסמכתא',
    payoutDraft: 'בהכנה',
    payoutPaid: 'שולם',
    payoutCancelled: 'בוטל',
    creativesTitle: 'חומרים מוכנים',
    creativesHint: 'הקישור שלכם כבר בפנים. אפשר ורצוי לשנות למילים שלכם.',
    creativeCopy: 'העתקה',
    creatives: [
      {
        label: 'פוסט',
        body: 'כל לקוח שואל אותי בסוף אותה שאלה: למה אני לא בגוגל?\n\nהתשובה היא שתוכן לא קורה לבד. מישהו צריך לבדוק מה מחפשים, לכתוב, לפרסם, ולתקן את מה ששבור באתר. כל חודש.\n\nאני עובד עם מערכת שעושה בדיוק את זה אוטומטית: מחקר ביטויים, כתיבת מאמרים ופרסום שלהם באתר, מעקב מיקומים בגוגל, ובדיקה אם ChatGPT ו-Gemini בכלל מכירים את העסק.\n\nשבעה ימי ניסיון בחינם, בלי התחייבות: {{link}}',
      },
      {
        label: 'הודעה ללקוח',
        body: 'היי, משהו שיכול להתאים לך. יש מערכת שמנהלת את הקידום האורגני של האתר לבד: מוצאת את הביטויים שאנשים מחפשים אצלך בתחום, כותבת מאמרים, מפרסמת אותם באתר ומתקנת מה ששבור בו. אפשר לנסות שבוע בחינם ולראות מה היא מוציאה: {{link}}',
      },
      {
        label: 'אימייל',
        body: 'נושא: הדרך להיות בעמוד הראשון בגוגל בלי להעסיק איש תוכן\n\nשלום,\n\nאם האתר שלך לא מביא לידים מגוגל, בדרך כלל זה לא בגלל האתר אלא בגלל שאין תוכן שעונה על מה שאנשים מחפשים.\n\nהמערכת שאני ממליץ עליה עושה את זה במקומך: היא בודקת מה מחפשים בתחום שלך, כותבת מאמרים ברמה גבוהה, מפרסמת אותם באתר, עוקבת אחרי המיקומים בגוגל ומראה גם אם מנועי ה-AI מכירים את העסק.\n\nשבעה ימי ניסיון בחינם: {{link}}',
      },
    ],
    termsLink: 'להסכם תוכנית השותפים',
  },
  en: {
    title: 'Partner program',
    subtitle: 'Your link, what it brought in, and what you are owed.',
    notPartnerTitle: 'You are not in the partner program',
    notPartnerBody: 'If you have an audience of site owners, stores or agencies, you earn 30% of every payment from every customer who comes through you, for as long as they stay.',
    notPartnerCta: 'Read about the program and apply',
    suspendedNotice: 'Your partner account is suspended. Your link still works for anyone who clicks it, but no new commission accrues until we have spoken.',
    linkTitle: 'Your link',
    linkHint: 'Works as it is. You can also choose where it lands.',
    copyLink: 'Copy',
    copied: 'Copied',
    linkToHome: 'Home page',
    linkToPricing: 'Pricing',
    linkToSignup: 'Straight to signup',
    linkToFreeCheck: 'Free site check',
    rateTitle: 'Your commission',
    rateNow: (rate) => `${rate}% of every payment`,
    rateNext: (from, rate) => `From ${from} active paying customers you move to ${rate}%`,
    rateTop: (rate) => `You are on the higher rate: ${rate}%`,
    clicks30: 'Clicks in 30 days',
    clicksTotal: 'Clicks in total',
    signedUp: 'Signed up',
    paying: 'Paying customers',
    churned: 'Stopped',
    pending: 'Pending',
    pendingHint: (days) => `Accrues now and is released ${days} days after the customer's payment settles.`,
    payable: 'Approved for payout',
    payableHint: (ils, usd) => `Paid once the balance passes ILS ${ils} or USD ${usd}.`,
    paid: 'Paid',
    reversed: 'Reversed',
    reversedHint: 'Commission on a customer who was refunded or charged back.',
    payoutsTitle: 'Payouts',
    payoutsEmpty: 'No payouts yet. Once your approved balance passes the minimum, we send it.',
    payoutDate: 'Date',
    payoutAmount: 'Amount',
    payoutStatus: 'Status',
    payoutReference: 'Reference',
    payoutDraft: 'Being prepared',
    payoutPaid: 'Paid',
    payoutCancelled: 'Cancelled',
    creativesTitle: 'Ready to post',
    creativesHint: 'Your link is already in them. Edit them into your own words.',
    creativeCopy: 'Copy',
    creatives: [
      {
        label: 'Post',
        body: 'Every client ends up asking me the same thing: why am I not on Google?\n\nThe answer is that content does not happen by itself. Somebody has to find out what people search for, write it, publish it, and fix what is broken on the site. Every month.\n\nI work with a system that does exactly that on its own: keyword research, articles written and published on the site, Google rank tracking, and a check on whether ChatGPT and Gemini have even heard of the business.\n\nSeven days free, no commitment: {{link}}',
      },
      {
        label: 'Message to a client',
        body: 'Hi — something that might fit you. There is a system that runs a site\'s organic search on its own: it finds the terms people actually search in your field, writes the articles, publishes them on the site and fixes what is broken on it. You can try it free for a week and see what it produces: {{link}}',
      },
      {
        label: 'Email',
        body: 'Subject: Getting onto the first page of Google without hiring a writer\n\nHello,\n\nIf your site brings no leads from Google, it is usually not the site — it is that nothing on it answers what people are searching for.\n\nThe system I recommend does that part for you: it checks what is searched in your field, writes proper articles, publishes them on your site, tracks your Google positions, and shows whether the AI engines know your business at all.\n\nSeven days free: {{link}}',
      },
    ],
    termsLink: 'The partner agreement',
  },
  es: {
    title: 'Programa de socios',
    subtitle: 'Tu enlace, lo que ha traído y lo que te corresponde.',
    notPartnerTitle: 'No estás en el programa de socios',
    notPartnerBody: 'Si tienes una audiencia de dueños de webs, tiendas o agencias, ganas el 30% de cada pago de cada cliente que llegue por ti, mientras siga siendo cliente.',
    notPartnerCta: 'Leer sobre el programa y solicitar entrar',
    suspendedNotice: 'Tu cuenta de socio está suspendida. Tu enlace sigue funcionando para quien lo pulse, pero no se acumulan nuevas comisiones hasta que hablemos.',
    linkTitle: 'Tu enlace',
    linkHint: 'Funciona tal cual. También puedes elegir a dónde lleva.',
    copyLink: 'Copiar',
    copied: 'Copiado',
    linkToHome: 'Página de inicio',
    linkToPricing: 'Precios',
    linkToSignup: 'Directo al registro',
    linkToFreeCheck: 'Análisis gratuito',
    rateTitle: 'Tu comisión',
    rateNow: (rate) => `${rate}% de cada pago`,
    rateNext: (from, rate) => `Con ${from} clientes activos que pagan pasas al ${rate}%`,
    rateTop: (rate) => `Estás en la tarifa alta: ${rate}%`,
    clicks30: 'Clics en 30 días',
    clicksTotal: 'Clics en total',
    signedUp: 'Se han registrado',
    paying: 'Clientes que pagan',
    churned: 'Se han ido',
    pending: 'Pendiente',
    pendingHint: (days) => `Se acumula ya y se libera ${days} días después de que el pago del cliente se asiente.`,
    payable: 'Aprobado para pago',
    payableHint: (ils, usd) => `Se paga cuando el saldo pasa de ${ils} ILS o ${usd} USD.`,
    paid: 'Pagado',
    reversed: 'Anulado',
    reversedHint: 'Comisión de un cliente con reembolso o contracargo.',
    payoutsTitle: 'Pagos',
    payoutsEmpty: 'Todavía no hay pagos. Cuando tu saldo aprobado pase el mínimo, lo enviamos.',
    payoutDate: 'Fecha',
    payoutAmount: 'Importe',
    payoutStatus: 'Estado',
    payoutReference: 'Referencia',
    payoutDraft: 'En preparación',
    payoutPaid: 'Pagado',
    payoutCancelled: 'Anulado',
    creativesTitle: 'Listo para publicar',
    creativesHint: 'Tu enlace ya está dentro. Cámbialo a tus palabras.',
    creativeCopy: 'Copiar',
    creatives: [
      {
        label: 'Publicación',
        body: 'Todos los clientes acaban preguntándome lo mismo: ¿por qué no aparezco en Google?\n\nLa respuesta es que el contenido no se escribe solo. Alguien tiene que averiguar qué busca la gente, escribirlo, publicarlo y arreglar lo que está roto en la web. Cada mes.\n\nTrabajo con un sistema que hace exactamente eso por su cuenta: investigación de palabras clave, artículos escritos y publicados en la web, seguimiento de posiciones en Google y una comprobación de si ChatGPT y Gemini conocen el negocio.\n\nSiete días gratis, sin compromiso: {{link}}',
      },
      {
        label: 'Mensaje a un cliente',
        body: 'Hola, algo que puede encajarte. Hay un sistema que lleva el posicionamiento orgánico de una web por su cuenta: encuentra los términos que la gente busca de verdad en tu sector, escribe los artículos, los publica en la web y arregla lo que está roto. Puedes probarlo gratis una semana y ver qué produce: {{link}}',
      },
      {
        label: 'Correo',
        body: 'Asunto: Llegar a la primera página de Google sin contratar a un redactor\n\nHola:\n\nSi tu web no trae clientes desde Google, normalmente no es la web: es que no hay nada en ella que responda a lo que la gente busca.\n\nEl sistema que recomiendo hace esa parte por ti: comprueba qué se busca en tu sector, escribe artículos de verdad, los publica en tu web, sigue tus posiciones en Google y muestra si los motores de IA conocen tu negocio.\n\nSiete días gratis: {{link}}',
      },
    ],
    termsLink: 'El acuerdo del programa de socios',
  },
  'pt-BR': {
    title: 'Programa de parceiros',
    subtitle: 'Seu link, o que ele trouxe e o que é seu.',
    notPartnerTitle: 'Você não está no programa de parceiros',
    notPartnerBody: 'Se você tem um público de donos de sites, lojas ou agências, ganha 30% de cada pagamento de cada cliente que chega por você, enquanto ele continuar pagando.',
    notPartnerCta: 'Ler sobre o programa e se candidatar',
    suspendedNotice: 'Sua conta de parceiro está suspensa. Seu link continua funcionando para quem clicar, mas nenhuma comissão nova é acumulada até conversarmos.',
    linkTitle: 'Seu link',
    linkHint: 'Funciona assim mesmo. Você também pode escolher para onde ele leva.',
    copyLink: 'Copiar',
    copied: 'Copiado',
    linkToHome: 'Página inicial',
    linkToPricing: 'Preços',
    linkToSignup: 'Direto para o cadastro',
    linkToFreeCheck: 'Análise gratuita',
    rateTitle: 'Sua comissão',
    rateNow: (rate) => `${rate}% de cada pagamento`,
    rateNext: (from, rate) => `Com ${from} clientes pagantes ativos você passa para ${rate}%`,
    rateTop: (rate) => `Você está na taxa maior: ${rate}%`,
    clicks30: 'Cliques em 30 dias',
    clicksTotal: 'Cliques no total',
    signedUp: 'Se cadastraram',
    paying: 'Clientes pagantes',
    churned: 'Saíram',
    pending: 'Pendente',
    pendingHint: (days) => `Acumula agora e é liberado ${days} dias depois que o pagamento do cliente é confirmado.`,
    payable: 'Aprovado para pagamento',
    payableHint: (ils, usd) => `Pago quando o saldo passa de ${ils} ILS ou ${usd} USD.`,
    paid: 'Pago',
    reversed: 'Cancelado',
    reversedHint: 'Comissão de um cliente que teve reembolso ou contestação.',
    payoutsTitle: 'Pagamentos',
    payoutsEmpty: 'Ainda não há pagamentos. Quando seu saldo aprovado passar do mínimo, enviamos.',
    payoutDate: 'Data',
    payoutAmount: 'Valor',
    payoutStatus: 'Situação',
    payoutReference: 'Referência',
    payoutDraft: 'Em preparação',
    payoutPaid: 'Pago',
    payoutCancelled: 'Cancelado',
    creativesTitle: 'Pronto para publicar',
    creativesHint: 'Seu link já está dentro. Ajuste para as suas palavras.',
    creativeCopy: 'Copiar',
    creatives: [
      {
        label: 'Post',
        body: 'Todo cliente termina me perguntando a mesma coisa: por que eu não apareço no Google?\n\nA resposta é que conteúdo não acontece sozinho. Alguém precisa descobrir o que as pessoas procuram, escrever, publicar e corrigir o que está quebrado no site. Todo mês.\n\nEu trabalho com um sistema que faz exatamente isso por conta própria: pesquisa de palavras-chave, artigos escritos e publicados no site, acompanhamento das posições no Google e uma checagem se o ChatGPT e o Gemini conhecem o negócio.\n\nSete dias grátis, sem compromisso: {{link}}',
      },
      {
        label: 'Mensagem para um cliente',
        body: 'Oi, algo que pode servir para você. Existe um sistema que cuida do tráfego orgânico de um site sozinho: ele encontra os termos que as pessoas realmente buscam na sua área, escreve os artigos, publica no site e corrige o que está quebrado. Você pode testar uma semana de graça e ver o que ele produz: {{link}}',
      },
      {
        label: 'E-mail',
        body: 'Assunto: Chegar à primeira página do Google sem contratar um redator\n\nOlá,\n\nSe o seu site não traz clientes do Google, normalmente não é o site: é que não existe nele nada que responda ao que as pessoas procuram.\n\nO sistema que eu recomendo faz essa parte por você: verifica o que se busca na sua área, escreve artigos de verdade, publica no seu site, acompanha suas posições no Google e mostra se os motores de IA conhecem o seu negócio.\n\nSete dias grátis: {{link}}',
      },
    ],
    termsLink: 'O contrato do programa de parceiros',
  },
}
