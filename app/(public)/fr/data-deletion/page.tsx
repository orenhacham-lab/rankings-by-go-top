import { DataDeletionPage, dataDeletionMetadata } from '@/components/public/DataDeletionPage'

// Reads the request's ?code=, so it is rendered per request (never prerendered).
export const dynamic = 'force-dynamic'
export const metadata = dataDeletionMetadata('fr')

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams
  return <DataDeletionPage locale="fr" code={typeof code === 'string' ? code : undefined} />
}
