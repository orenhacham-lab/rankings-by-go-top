'use client'

import { Suspense } from 'react'
import { SignupForm } from '../../../(auth)/signup/page'

export default function EnSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <SignupForm />
    </Suspense>
  )
}
