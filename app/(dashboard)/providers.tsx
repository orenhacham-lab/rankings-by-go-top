'use client'

import { ThemeProvider } from 'next-themes'
import { ReactNode } from 'react'

export function DashboardProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="dashboard-theme"
      forcedTheme={undefined}
    >
      {children}
    </ThemeProvider>
  )
}
