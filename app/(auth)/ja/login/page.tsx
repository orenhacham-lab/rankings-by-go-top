'use client'

import { Suspense } from 'react'
import { AuthForm } from '../../login/page'

export default function JapaneseLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <AuthForm />
    </Suspense>
  )
}
