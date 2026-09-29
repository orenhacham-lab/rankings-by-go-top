/**
 * Shared contact constants for the public site.
 *
 * Single source of truth for the WhatsApp / phone details so the floating
 * button, the mobile CTA bar and any future entry points stay in sync.
 */

export const WHATSAPP_NUMBER = '972549489377'
export const PHONE_DISPLAY = '054-9489377'
export const PHONE_TEL = 'tel:+972549489377'

/** wa.me deep link with a pre-filled Hebrew "I need help" message. */
export const WHATSAPP_HELP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  'היי, אני צריך עזרה'
)}`

/** The support email, for the dashboard's contact menu (and any future entry point). */
export const CONTACT_EMAIL = 'oren@gotop.co.il'
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`

/** wa.me deep link with a given pre-filled message. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
