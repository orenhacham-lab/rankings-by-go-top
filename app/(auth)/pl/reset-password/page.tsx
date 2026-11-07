'use client'

import { Suspense } from 'react'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export default function PolishResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
