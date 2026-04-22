'use client'

import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-100 py-12 mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <h3 className="font-bold text-lg mb-4">Rankings by Go Top</h3>
            <p className="text-slate-400 text-sm">
              מערכת מעקב מיקומים לקידום אתרים מתקדמת לתוצאות בגוגל אורגני וגוגל מפות.
            </p>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold mb-4">משפטי</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">
                  מדיניות פרטיות
                </Link>
              </li>
              <li>
                <Link href="/accessibility" className="text-slate-400 hover:text-white transition-colors">
                  נגישות
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-bold mb-4">משאבים</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/articles" className="text-slate-400 hover:text-white transition-colors">
                  מאמרים
                </Link>
              </li>
              <li>
                <a href="/robots.txt" className="text-slate-400 hover:text-white transition-colors">
                  Robots.txt
                </a>
              </li>
              <li>
                <a href="/sitemap.xml" className="text-slate-400 hover:text-white transition-colors">
                  Sitemap
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold mb-4">יצירת קשר</h4>
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
        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-400 text-sm">
            © 2026 Rankings by Go Top. כל הזכויות שמורות.
          </p>
          <div className="mt-4 md:mt-0 flex gap-6">
            <a href="https://www.gotop.co.il" className="text-slate-400 hover:text-white text-sm transition-colors">
              Go Top
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
