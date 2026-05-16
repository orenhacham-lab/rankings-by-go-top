import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export const metadata = {
  title: 'Sitemap | Rankings by Go Top',
  description: 'Complete sitemap for Rankings by Go Top — find all our pages in one place.',
  openGraph: {
    title: 'Sitemap | Rankings by Go Top',
    description: 'Complete sitemap for Rankings by Go Top',
    url: 'https://www.gotopseo.com/en/sitemap',
    locale: 'en_US',
  },
}

interface SitemapSection {
  title: string
  description?: string
  links: Array<{ label: string; href: string }>
}

export default function EnglishSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Pages',
      links: [
        { label: 'Home', href: '/en' },
        { label: 'Pricing', href: '/en/pricing' },
        { label: 'About', href: '/en/about' },
        { label: 'Articles', href: '/en/articles' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Sign in', href: '/login' },
        { label: 'Start free trial', href: '/login' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/en/privacy' },
        { label: 'Accessibility', href: '/en/accessibility' },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="en" />
      <main className="flex-1 pt-28 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Breadcrumbs items={[{ label: 'Sitemap', href: '/en/sitemap' }]} locale="en" />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Sitemap</h1>
            <p className="text-slate-600 mb-8">
              Find all pages and sections of Rankings by Go Top here
            </p>

            <div className="space-y-12">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">{section.title}</h2>
                  {section.description && (
                    <p className="text-sm text-slate-600 mb-4">{section.description}</p>
                  )}
                  <ul className="space-y-3">
                    {section.links.map((link) => (
                      <li key={`${section.title}-${link.label}`}>
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

            <div className="mt-8 pt-8 border-t border-slate-200">
              <p className="text-slate-600 text-sm">
                For more information, visit our{' '}
                <Link href="/en/about" className="text-blue-600 hover:underline mx-1">
                  about page
                </Link>
                or{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  contact us
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer locale="en" />
    </div>
  )
}
