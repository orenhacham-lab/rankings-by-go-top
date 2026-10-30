'use client'

import { Suspense } from 'react'
import { SignupForm } from '../../signup/page'

export default function JapaneseSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <SignupForm />
    </Suspense>
  )
}
