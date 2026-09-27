'use client'

import { Suspense } from 'react'
import { ResetPasswordForm } from '../../reset-password/page'

export default function EnResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
