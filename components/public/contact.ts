/**
 * Shared contact constants for the public site.
 *
 * Single source of truth for the WhatsApp / phone details so the floating
 * button, the mobile CTA bar and any future entry points stay in sync.
 */

export const WHATSAPP_NUMBER = '972549489377'
export const PHONE_DISPLAY = '054-9489377'
export const PHONE_TEL = 'tel:+972549489377'

export const EMAIL = 'oren@gotop.co.il'
export const EMAIL_HREF = `mailto:${EMAIL}`

/** wa.me deep link with a pre-filled Hebrew "I need help" message. */
export const WHATSAPP_HELP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  'היי, אני צריך עזרה'
)}`

/**
 * The same link with the message in the page's language: the English site
 * opens WhatsApp with "Hi, I need help", the Hebrew site with the Hebrew line.
 */
export function whatsappHelpUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export type ContactChannel = { id: 'whatsapp' | 'phone' | 'email'; href: string; label: string; value?: string; external: boolean }

/**
 * The three contact rows, in order (UX decision C): WhatsApp, the phone, the
 * email. One list for the nav's menu, the mobile menu, the footer and the
 * About page's close, so every entry point opens the same channels.
 */
export function contactChannels(t: { whatsappLabel: string; whatsappMessage: string; phoneLabel: string; emailLabel: string }): ContactChannel[] {
  return [
    { id: 'whatsapp', href: whatsappHelpUrl(t.whatsappMessage), label: t.whatsappLabel, external: true },
    { id: 'phone', href: PHONE_TEL, label: t.phoneLabel, value: PHONE_DISPLAY, external: false },
    { id: 'email', href: EMAIL_HREF, label: t.emailLabel, value: EMAIL, external: false },
  ]
}
