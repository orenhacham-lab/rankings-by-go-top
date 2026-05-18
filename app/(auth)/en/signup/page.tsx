'use client'

import { Suspense } from 'react'
import { SignupForm } from '../../../(auth)/signup/page'

export default function EnSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <SignupForm />
    </Suspense>
  )
}
