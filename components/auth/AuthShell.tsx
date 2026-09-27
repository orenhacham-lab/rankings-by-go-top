'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'

/** The frame the sign-in page draws, for the password-reset pages: logo, product name, one card. */
export default function AuthShell({ locale, logoAlt, subtitle, children }: { locale: 'he' | 'en'; logoAlt: string; subtitle: string; children: ReactNode }) {
  return (
    <main dir={locale === 'en' ? 'ltr' : 'rtl'} className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/gotop-primary.png" alt={logoAlt} width={160} height={64} className="h-16 w-auto object-contain" sizes="(max-width: 768px) 128px, 160px" priority />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Rankings by Go Top</h1>
          <p className="text-slate-600 mt-1 text-sm">{subtitle}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">{children}</div>
      </div>
    </main>
  )
}
