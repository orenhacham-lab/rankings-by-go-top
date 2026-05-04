'use client'

import Link from 'next/link'

export function Footer() {
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
              מערכת מעקב מיקומים לקידום אתרים מתקדמת לתוצאות בגוגל אורגני וגוגל מפות.
            </p>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold mb-4">עמודים</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                  עמוד הבית
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-slate-400 hover:text-white transition-colors">
                  מחירים
                </Link>
              </li>
              <li>
                <Link href="/articles" className="text-slate-400 hover:text-white transition-colors">
                  מאמרים
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-slate-400 hover:text-white transition-colors">
                  אודות
                </Link>
              </li>
              <li>
                <Link href="/sitemap" className="text-slate-400 hover:text-white transition-colors">
                  מפת אתר
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
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
        <div className="border-t border-slate-800 pt-8">
          <p className="text-slate-400 text-sm text-center">
            © 2026 Rankings by Go Top. כל הזכויות שמורות.
          </p>
        </div>
      </div>
    </footer>
  )
}

