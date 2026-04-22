import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

export const metadata = {
  title: 'מפת אתר | Rankings by Go Top',
  description: 'מפת האתר - כל העמודים וקטגוריות ב-Rankings by Go Top',
}

interface SitemapSection {
  title: string
  description?: string
  links: Array<{ label: string; href: string }>
}

export default function SitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'עמודים ראשיים',
      links: [
        { label: 'עמוד הבית', href: '/' },
        { label: 'התחברות/הרשמה', href: '/login' },
      ],
    },
    {
      title: 'תוכן וחינוך',
      links: [
        { label: 'מאמרים', href: '/articles' },
        { label: 'אודות', href: '/about' },
      ],
    },
    {
      title: 'בדיקה',
      description: 'לאחר התחברות למערכת',
      links: [
        { label: 'לוח בקרה', href: '/dashboard' },
        { label: 'פרויקטים', href: '/projects' },
        { label: 'מילות מפתח', href: '/keywords' },
        { label: 'לקוחות', href: '/clients' },
        { label: 'דוחות', href: '/reports' },
        { label: 'סריקות', href: '/scans' },
        { label: 'חיוב', href: '/billing' },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <div className="flex-1 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Breadcrumbs items={[{ label: 'מפת אתר', href: '/sitemap' }]} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">מפת אתר</h1>
            <p className="text-slate-600 mb-8">
              כאן תמצאו את כל העמודים והקטגוריות ב-Rankings by Go Top
            </p>

            <div className="space-y-12">
              {sections.map((section, index) => (
                <section key={index}>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">{section.title}</h2>
                  {section.description && (
                    <p className="text-sm text-slate-600 mb-4">{section.description}</p>
                  )}
                  <ul className="space-y-3">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2"
                        >
                          <span>→</span>
                          <span>{link.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="mt-12 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-3">הערה</h3>
              <p className="text-sm text-slate-600">
                עמודים המשויכים להרשמה (לוח בקרה, פרויקטים וכו') זמינים רק לאחר התחברות למערכת.
              </p>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-200">
              <p className="text-slate-500 text-sm">
                לקבלת מידע נוסף, בקר ב
                <Link href="/about" className="text-blue-600 hover:underline mx-1">
                  עמוד אודות
                </Link>
                או{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  צור קשר
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
