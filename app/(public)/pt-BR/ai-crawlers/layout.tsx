import {
  aiCrawlerBlockingDatasetSchema,
  aiCrawlerBlockingSitesDatasetSchema,
  aiCrawlerDatasetSchema,
} from '@/lib/seo/dataset'

// The reference table this page publishes, declared as a Dataset so Google
// Dataset Search and the AI engines can index it as one. The node is identical
// on every locale except its language and url, by design: see lib/seo/dataset.ts.
const datasetSchema = aiCrawlerDatasetSchema('pt-BR')
// The dated measurement the page now renders, declared as its own
// Dataset. Two nodes, because they are two datasets: see lib/seo/dataset.ts.
const measurementSchema = aiCrawlerBlockingDatasetSchema('pt-BR')
// The 09.11 re-reading, which keeps one row per domain. A third node because
// it is a third dataset: a different day, a different n and a different unit.
const sitesSchema = aiCrawlerBlockingSitesDatasetSchema('pt-BR')

export default function PortugueseAiCrawlersLayout({ children }: { children: React.ReactNode }) {
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sitesSchema) }}
      />
      {children}
    </>
  )
}
