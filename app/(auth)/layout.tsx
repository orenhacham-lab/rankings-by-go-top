import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Note: Auth pages are not indexed, but we don't explicitly block robots
  // to allow Google to crawl and understand the site structure
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
