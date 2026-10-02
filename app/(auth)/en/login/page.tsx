'use client'

import { Suspense } from 'react'
import { AuthForm } from '../../../(auth)/login/page'

export default function EnLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <AuthForm />
    </Suspense>
  )
}
