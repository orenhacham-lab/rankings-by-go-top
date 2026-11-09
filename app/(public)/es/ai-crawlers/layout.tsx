import { aiCrawlerBlockingDatasetSchema, aiCrawlerDatasetSchema } from '@/lib/seo/dataset'

// The reference table this page publishes, declared as a Dataset so Google
// Dataset Search and the AI engines can index it as one. The node is identical
// on every locale except its language and url, by design: see lib/seo/dataset.ts.
const datasetSchema = aiCrawlerDatasetSchema('es')
// The dated measurement the page now renders, declared as its own
// Dataset. Two nodes, because they are two datasets: see lib/seo/dataset.ts.
const measurementSchema = aiCrawlerBlockingDatasetSchema('es')

export default function SpanishAiCrawlersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(measurementSchema) }}
      />
      {children}
    </>
  )
}
