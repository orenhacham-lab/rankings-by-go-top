/**
 * The partner application form's words, in every language the site speaks.
 *
 * In a file of its own rather than inside AFFILIATES_COPY, because this is the
 * one part of the page that is a TRANSACTION: every string here is either a
 * label an applicant has to understand before typing, or an answer to something
 * going wrong. Keeping them together makes it possible to read the whole form in
 * one language at once, which is how a form is checked.
 *
 * `errors` is keyed by the field names lib/affiliate/application.ts returns, so
 * a rejection from the server lands on the right field without a translation
 * table in between. __qa__/affiliate-form-copy.qa.ts derives the language list
 * and fails if any language is missing a single string.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type AffiliateFormCopy = {
  title: string
  intro: string
  name: string
  namePlaceholder: string
  email: string
  emailPlaceholder: string
  phone: string
  phoneOptional: string
  website: string
  websitePlaceholder: string
  country: string
  audience: string
  audienceHint: string
  audiencePlaceholder: string
  submit: string
  submitting: string
  /** What happens next, said before they send it — not after. */
  smallPrint: string
  success: string
  errors: {
    name: string
    email: string
    audience: string
    phone: string
    website: string
    country: string
    rateLimited: string
    failed: string
  }
}

export const AFFILIATE_FORM_COPY: Record<PublicLocale, AffiliateFormCopy> = {
  he: {
    title: 'להגשת מועמדות',
    intro: 'ממלאים, ואנחנו עוברים על הבקשה ידנית. מי שמתאים מקבל קישור אישי וקוד.',
    name: 'שם מלא',
    namePlaceholder: 'ישראל ישראלי',
    email: 'אימייל',
    emailPlaceholder: 'you@example.com',
    phone: 'טלפון',
    phoneOptional: '(לא חובה)',
    website: 'אתר, עמוד או ערוץ',
    websitePlaceholder: 'example.co.il',
    country: 'מדינה',
    audience: 'איפה הקהל שלכם',
    audienceHint: 'זה החלק שעליו מחליטים. כמה שורות על מי הקהל, איפה הוא נמצא וכמה גדול הוא.',
    audiencePlaceholder: 'אני בונה אתרי וורדפרס לעסקים קטנים, יש לי כ-40 לקוחות פעילים ורשימת תפוצה של 1,200 בעלי עסקים.',
    submit: 'שליחת הבקשה',
    submitting: 'שולח…',
    smallPrint: 'אנחנו לא מבקשים פרטי תשלום בשלב הזה. את אלה נבקש רק אחרי שהבקשה תאושר.',
    success: 'הבקשה התקבלה. נעבור עליה ונחזור אליכם באימייל.',
    errors: {
      name: 'נא להזין שם מלא',
      email: 'כתובת אימייל לא תקינה',
      audience: 'כמה שורות על הקהל שלכם, לא פחות. זה מה שעליו מחליטים.',
      phone: 'מספר הטלפון ארוך מדי',
      website: 'הכתובת ארוכה מדי',
      country: 'שם המדינה ארוך מדי',
      rateLimited: 'נשלחו כמה בקשות מאותו חיבור. נסו שוב בעוד שעה.',
      failed: 'לא הצלחנו לשלוח את הבקשה. נסו שוב בעוד רגע, או כתבו לנו בוואטסאפ.',
    },
  },
  en: {
    title: 'Apply to join',
    intro: 'Fill this in and a person reads it. Partners who fit get their own link and code.',
    name: 'Full name',
    namePlaceholder: 'Alex Taylor',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    phone: 'Phone',
    phoneOptional: '(optional)',
    website: 'Site, page or channel',
    websitePlaceholder: 'example.com',
    country: 'Country',
    audience: 'Where your audience is',
    audienceHint: 'This is the part the decision is made on. A few lines on who they are, where they are and how many.',
    audiencePlaceholder: 'I build WordPress sites for small businesses, around 40 active clients, and a newsletter of 1,200 owners.',
    submit: 'Send application',
    submitting: 'Sending…',
    smallPrint: 'We do not ask for payment details here. We ask for those once your application is approved.',
    success: 'Your application is in. We read it and come back to you by email.',
    errors: {
      name: 'Please enter your full name',
      email: 'That email address is not valid',
      audience: 'A few lines about your audience, please. This is what the decision is made on.',
      phone: 'That phone number is too long',
      website: 'That address is too long',
      country: 'That country name is too long',
      rateLimited: 'Several applications came from this connection. Try again in an hour.',
      failed: "We couldn't send your application. Try again in a moment, or message us on WhatsApp.",
    },
  },
  es: {
    title: 'Solicitar entrar',
    intro: 'Rellénalo y una persona lo lee. Quien encaja recibe su propio enlace y código.',
    name: 'Nombre completo',
    namePlaceholder: 'Alex Torres',
    email: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    phone: 'Teléfono',
    phoneOptional: '(opcional)',
    website: 'Web, página o canal',
    websitePlaceholder: 'ejemplo.com',
    country: 'País',
    audience: 'Dónde está tu audiencia',
    audienceHint: 'Es la parte sobre la que se decide. Unas líneas sobre quiénes son, dónde están y cuántos.',
    audiencePlaceholder: 'Creo webs WordPress para pequeños negocios, unos 40 clientes activos y un boletín de 1.200 propietarios.',
    submit: 'Enviar la solicitud',
    submitting: 'Enviando…',
    smallPrint: 'Aquí no pedimos datos de pago. Los pedimos cuando la solicitud se aprueba.',
    success: 'Hemos recibido tu solicitud. La leemos y te respondemos por correo.',
    errors: {
      name: 'Escribe tu nombre completo',
      email: 'Esa dirección de correo no es válida',
      audience: 'Unas líneas sobre tu audiencia, por favor. Es sobre esto que se decide.',
      phone: 'Ese teléfono es demasiado largo',
      website: 'Esa dirección es demasiado larga',
      country: 'Ese nombre de país es demasiado largo',
      rateLimited: 'Han llegado varias solicitudes desde esta conexión. Inténtalo en una hora.',
      failed: 'No hemos podido enviar la solicitud. Inténtalo en un momento o escríbenos por WhatsApp.',
    },
  },
  'pt-BR': {
    title: 'Solicitar entrada',
    intro: 'Preencha e uma pessoa lê. Quem se encaixa recebe o próprio link e código.',
    name: 'Nome completo',
    namePlaceholder: 'Alex Souza',
    email: 'E-mail',
    emailPlaceholder: 'voce@exemplo.com',
    phone: 'Telefone',
    phoneOptional: '(opcional)',
    website: 'Site, página ou canal',
    websitePlaceholder: 'exemplo.com',
    country: 'País',
    audience: 'Onde está o seu público',
    audienceHint: 'É a parte que decide. Algumas linhas sobre quem são, onde estão e quantos são.',
    audiencePlaceholder: 'Faço sites WordPress para pequenos negócios, cerca de 40 clientes ativos e uma newsletter com 1.200 donos de empresa.',
    submit: 'Enviar a solicitação',
    submitting: 'Enviando…',
    smallPrint: 'Aqui não pedimos dados de pagamento. Pedimos depois que a solicitação for aprovada.',
    success: 'Recebemos sua solicitação. Vamos ler e responder por e-mail.',
    errors: {
      name: 'Informe seu nome completo',
      email: 'Esse e-mail não é válido',
      audience: 'Algumas linhas sobre o seu público, por favor. É sobre isso que se decide.',
      phone: 'Esse telefone é longo demais',
      website: 'Esse endereço é longo demais',
      country: 'Esse nome de país é longo demais',
      rateLimited: 'Chegaram várias solicitações desta conexão. Tente de novo em uma hora.',
      failed: 'Não conseguimos enviar a solicitação. Tente de novo em instantes ou fale com a gente no WhatsApp.',
    },
  },
}
