'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import GoTopMark from '@/components/brand/GoTopMark'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { whatsappHelpUrl } from '@/components/public/contact'

/**
 * The public footer: the navy band (bg-contrast), the same navy as the app's
 * rail, so the site and the product close on the same colour.
 */
export function Footer({ locale = 'he' }: { locale?: Locale } = {}) {
  const dict = getPublicDictionary(locale)
  const prefix = locale === 'en' ? '/en' : ''
  const homeHref = prefix === '/en' ? '/en' : '/'
  const linkClass = 'rounded-control text-copy text-contrast-ink/70 transition-colors duration-150 ease-snappy hover:text-contrast-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20'
  const headingClass = 'mb-4 text-caption font-semibold text-contrast-ink'

  return (
    <footer className="bg-contrast text-contrast-ink">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 md:pb-8 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4 md:gap-8">
          {/* Company Info */}
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <GoTopMark size={28} className="shrink-0" />
              <h3 className="text-section font-semibold text-contrast-ink" dir="ltr">
                <span>Rankings by </span>
                <Link
                  href="https://www.gotop.co.il"
                  className="rounded-control text-rail-tagline underline decoration-rail-tagline/40 underline-offset-4 transition-colors duration-150 ease-snappy hover:decoration-rail-tagline"
                  aria-label={dict.footer.agencyAria}
                >
                  Go Top
                </Link>
              </h3>
            </div>
            <p className="max-w-xs text-copy text-contrast-ink/70">
              {dict.footer.tagline}
            </p>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className={headingClass}>{dict.footer.pages}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href={homeHref} className={linkClass}>
                  {dict.footer.home}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/pricing`} className={linkClass}>
                  {dict.footer.pricing}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/articles`} className={linkClass}>
                  {dict.footer.articles}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/about`} className={linkClass}>
                  {dict.footer.about}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/sitemap`} className={linkClass}>
                  {dict.footer.sitemap}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className={headingClass}>{dict.footer.legal}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href={`${prefix}/privacy`} className={linkClass}>
                  {dict.footer.privacy}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/terms`} className={linkClass}>
                  {dict.footer.terms}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/accessibility`} className={linkClass}>
                  {dict.footer.accessibility}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className={headingClass}>{dict.footer.contact}</h4>
            <ul className="space-y-2.5">
              {/* WhatsApp first (wave 8, UX decision C) */}
              <li>
                <a
                  href={whatsappHelpUrl(dict.contact.whatsappMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={dict.contact.whatsappAria}
                  className={`${linkClass} inline-flex items-center gap-2`}
                  data-footer-whatsapp
                >
                  <WhatsAppGlyph size={16} className="shrink-0" />
                  {dict.contact.whatsappLabel}
                </a>
              </li>
              <li>
                <a href="mailto:oren@gotop.co.il" dir="ltr" className={linkClass}>
                  oren@gotop.co.il
                </a>
              </li>
              <li>
                <a href="tel:0549489377" dir="ltr" className={`${linkClass} tabular-nums`}>
                  054-9489377
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center gap-2 border-t border-white/10 pt-6 sm:flex-row sm:justify-between">
          <p className="text-center text-caption text-contrast-ink/60">
            {dict.footer.copyright}
          </p>
          <a
            href="https://gotop.co.il"
            className="rounded-control text-caption font-semibold text-contrast-ink/80 underline decoration-white/30 underline-offset-4 transition-colors duration-150 ease-snappy hover:text-contrast-ink hover:decoration-white/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20"
            data-footer-credit
          >
            {dict.footer.credit}
          </a>
        </div>
      </div>
    </footer>
  )
}
