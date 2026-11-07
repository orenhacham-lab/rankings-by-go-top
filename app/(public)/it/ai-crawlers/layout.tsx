import { aiCrawlerDatasetSchema } from '@/lib/seo/dataset'

// The reference table this page publishes, declared as a Dataset so Google
// Dataset Search and the AI engines can index it as one. The node is identical
// on every locale except its language and url, by design: see lib/seo/dataset.ts.
const datasetSchema = aiCrawlerDatasetSchema('it')

export default function ItalianAiCrawlersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
      {children}
    </>
  )
}
