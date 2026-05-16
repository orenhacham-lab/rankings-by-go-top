'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export function Footer({ locale = 'he' }: { locale?: Locale } = {}) {
  const dict = getPublicDictionary(locale)
  const prefix = locale === 'en' ? '/en' : ''
  const homeHref = prefix === '/en' ? '/en' : '/'

  return (
    <footer className="bg-slate-900 text-slate-100 py-12 mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <h3 className="font-bold text-lg mb-4">
              <span>Rankings by </span>
              <Link href="https://www.gotop.co.il" className="text-blue-400 hover:text-blue-300 transition-colors">
                Go Top
              </Link>
            </h3>
            <p className="text-slate-400 text-sm">
              {dict.footer.tagline}
            </p>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold mb-4">{dict.footer.pages}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={homeHref} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.home}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/pricing`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.pricing}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/articles`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.articles}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/about`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.about}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/sitemap`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.sitemap}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold mb-4">{dict.footer.legal}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`${prefix}/privacy`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.privacy}
                </Link>
              </li>
              <li>
                <Link href={`${prefix}/accessibility`} className="text-slate-400 hover:text-white transition-colors">
                  {dict.footer.accessibility}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold mb-4">{dict.footer.contact}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="mailto:oren@gotop.co.il"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  oren@gotop.co.il
                </a>
              </li>
              <li>
                <a
                  href="tel:0549489377"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  054-9489377
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-slate-800 pt-8">
          <p className="text-slate-400 text-sm text-center">
            {dict.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  )
}
