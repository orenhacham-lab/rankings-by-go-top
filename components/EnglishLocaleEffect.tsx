'use client'

import { useEffect } from 'react'

export function EnglishLocaleEffect() {
  useEffect(() => {
    const html = document.documentElement
    const originalDir = html.dir
    const originalLang = html.lang

    html.dir = 'ltr'
    html.lang = 'en'

    return () => {
      html.dir = originalDir
      html.lang = originalLang
    }
  }, [])

  return null
}
