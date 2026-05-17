/**
 * Runtime test for the object-classification pipeline used by
 * generatePromptSuggestions(). Run with:
 *   npx tsx scripts/test-recommended-questions.ts
 */

import { generatePromptSuggestions } from '../lib/ai-visibility/prompt-templates'

type Case = {
  label: string
  args: Parameters<typeof generatePromptSuggestions>[0]
  mustInclude?: RegExp[]
  mustNotInclude?: RegExp[]
}

const cases: Case[] = [
  {
    label: '1. Fitness equipment store (חנות מוצרי כושר)',
    args: {
      businessName: 'חנות מוצרי כושר ביתי',
      domain: 'fitness-store.co.il',
      language: 'he',
      city: 'תל אביב',
      country: 'IL',
      keywords: ['משקולות', 'הליכון', 'ציוד כושר'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: 'ציוד כושר',
        secondaryCategories: ['משקולות', 'סט משקולות', 'ציוד כושר ביתי', 'הליכון'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustNotInclude: [
      /איפה\s+כדאי\s+לקנות\s+חנות\s+מוצרי\s+כושר/,
      /אילו\s+מותגי\s+ספורט/,
      /איפה\s+אפשר\s+למצוא\s+משקולות/,
      /כמה\s+עולים\s+ציוד/,
      /איזו\s+חנות\s+מומלצת\s+למשקולות[?]/,
    ],
  },
  {
    label: '2. Coast Design & Build Bakersfield',
    args: {
      businessName: 'Coast Design & Build Bakersfield',
      domain: 'coastdesignbuild.com',
      language: 'en',
      city: 'Bakersfield',
      country: 'US',
      keywords: ['kitchen remodeling', 'bathroom remodeling', 'home renovation'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: 'design-build contractor',
        secondaryCategories: ['kitchen remodeling', 'bathroom remodeling', 'home remodeling', 'design-build'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustNotInclude: [
      /what\s+to\s+check\s+when\s+buying\s+home\s+improvement/i,
      /where\s+to\s+find\s+home\s+improvement/i,
      /recommended\s+businesses?\s+similar\s+to/i,
      /alternatives\s+to/i,
    ],
  },
  {
    label: '3. Go Top (SaaS rank tracker)',
    args: {
      businessName: 'Go Top',
      domain: 'gotopseo.com',
      language: 'en',
      city: null,
      country: 'IL',
      keywords: ['rank tracking', 'SEO reporting', 'AI visibility'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: 'rank tracking software',
        secondaryCategories: ['rank tracking', 'SEO reporting', 'AI visibility', 'google rank tracking'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustNotInclude: [
      /alternatives\s+to\s+go\s+top/i,
      /recommended\s+businesses?\s+similar\s+to\s+go\s+top/i,
      /where\s+can\s+i\s+buy\s+seo/i,
    ],
  },
  {
    label: '4. Office cleaning company',
    args: {
      businessName: 'BrightOffice Cleaning',
      domain: 'brightoffice.com',
      language: 'en',
      city: 'Tel Aviv',
      country: 'IL',
      keywords: ['office cleaning', 'commercial cleaning'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: 'cleaning company',
        secondaryCategories: ['office cleaning', 'commercial cleaning'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustNotInclude: [/buying\s+cleaning/i, /alternatives\s+to/i],
  },
  {
    label: '5. Flower delivery business',
    args: {
      businessName: 'Erez Flowers',
      domain: 'erez-flowers.co.il',
      language: 'en',
      city: 'Jerusalem',
      country: 'IL',
      keywords: ['flower delivery', 'bouquets', 'birthday flowers'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: 'florist',
        secondaryCategories: ['flower delivery', 'bouquets', 'birthday flowers'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustNotInclude: [/where\s+to\s+find\s+(florist|flowers)/i, /alternatives\s+to/i],
  },
]

let failures = 0
for (const c of cases) {
  console.log('\n=========================================')
  console.log(c.label)
  console.log('=========================================')
  const out = generatePromptSuggestions(c.args)
  console.log(`(returned ${out.length} questions)`)
  for (const q of out) {
    console.log(`  · [${q.intent}] ${q.prompt}`)
  }

  if (c.mustNotInclude) {
    for (const pattern of c.mustNotInclude) {
      const hit = out.find((q) => pattern.test(q.prompt))
      if (hit) {
        console.log(`  !! FAIL — forbidden pattern matched: ${pattern} → "${hit.prompt}"`)
        failures++
      } else {
        console.log(`  ✓ no forbidden match for ${pattern}`)
      }
    }
  }
}

console.log('\n=========================================')
if (failures === 0) {
  console.log('All cases passed.')
} else {
  console.log(`${failures} forbidden pattern violation(s).`)
  process.exit(1)
}
