'use client'

import { Suspense } from 'react'
import { AuthForm } from '../../../(auth)/login/page'

export default function EnLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <AuthForm />
    </Suspense>
  )
}
