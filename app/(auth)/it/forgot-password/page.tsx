'use client'

import { Suspense } from 'react'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export default function ItalianForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
