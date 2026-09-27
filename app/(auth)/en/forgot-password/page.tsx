'use client'

import { Suspense } from 'react'
import { ForgotPasswordForm } from '../../forgot-password/page'

export default function EnForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
