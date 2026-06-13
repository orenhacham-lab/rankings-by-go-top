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
  {
    label: '6. Apple HE — manual product categories + keyword variants',
    args: {
      businessName: 'Apple',
      domain: 'apple.com',
      language: 'he',
      city: null,
      country: 'IL',
      keywords: ['מקבוק פרו', 'מקבוק אייר'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: null,
        secondaryCategories: ['אייפון', 'מקבוק', 'אייפד'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustInclude: [/אייפון/, /מקבוק/],
    mustNotInclude: [
      /מוצרי\s+Apple/i,
      /מוצר\s+של\s+Apple/i,
      /חוות\s+דעת\s+על\s+מוצרי\s+Apple/i,
      /מה\s+עדיף\s+Apple\s+או\s+Samsung/i,
      /מה\s+ההבדל\s+בין\s+Apple\s+ל-Samsung/i,
      /מה\s+ההבדל\s+בין\s+Apple\s+ל-Google/i,
      /\{\{[^}]+\}\}/,
      /\bapple\b(?!\s*Watch|\s*Care)/, // lowercase apple shouldn't appear
    ],
  },
  {
    label: '7. Apple EN — manual product categories + keyword variants',
    args: {
      businessName: 'Apple',
      domain: 'apple.com',
      language: 'en',
      city: null,
      country: 'US',
      keywords: ['MacBook Pro', 'MacBook Air'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: null,
        secondaryCategories: ['iPhone', 'MacBook', 'iPad'],
        excludedTopics: [],
      },
      limit: 12,
      diversify: false,
    },
    mustInclude: [/iPhone/, /MacBook/],
    mustNotInclude: [
      /Apple\s+products?/i,
      /products?\s+by\s+Apple/i,
      /Reviews\s+of\s+Apple\s+products/i,
      /\bApple\s+vs\s+Samsung\b/i,
      /\bApple\s+vs\s+Google\b/i,
      /What\s+is\s+the\s+difference\s+between\s+Apple\s+and\s+(Samsung|Google)/i,
      /\{\{[^}]+\}\}/,
    ],
  },
  {
    label: '8. Apple HE — variant comparison',
    args: {
      businessName: 'Apple',
      domain: 'apple.com',
      language: 'he',
      city: null,
      country: 'IL',
      keywords: ['מקבוק פרו', 'מקבוק אייר'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: null,
        secondaryCategories: ['אייפון', 'מקבוק', 'אייפד'],
        excludedTopics: [],
      },
      limit: 18,
      diversify: false,
    },
    mustInclude: [
      /מה\s+ההבדל\s+בין\s+מקבוק\s+פרו\s+ל-?מקבוק\s+אייר|מה\s+עדיף\s+מקבוק\s+פרו\s+או\s+מקבוק\s+אייר/,
    ],
    mustNotInclude: [/מוצרי\s+Apple/i],
  },
  {
    label: '9. Apple EN — variant comparison',
    args: {
      businessName: 'Apple',
      domain: 'apple.com',
      language: 'en',
      city: null,
      country: 'US',
      keywords: ['MacBook Pro', 'MacBook Air'],
      manualProfile: {
        mode: 'manual',
        primaryCategory: null,
        secondaryCategories: ['iPhone', 'MacBook', 'iPad'],
        excludedTopics: [],
      },
      limit: 18,
      diversify: false,
    },
    mustInclude: [
      /MacBook\s+Pro\s+vs\s+MacBook\s+Air|What\s+is\s+the\s+difference\s+between\s+MacBook\s+Pro\s+and\s+MacBook\s+Air/i,
    ],
    mustNotInclude: [/Apple\s+products?/i],
  },
  {
    label: '10. Shopify HE — must remain SaaS, not product_brand',
    args: {
      businessName: 'Shopify',
      domain: 'shopify.com',
      language: 'he',
      city: null,
      country: 'US',
      keywords: ['חנות אונליין', 'מערכת מסחר'],
      manualProfile: null,
      limit: 12,
      diversify: false,
    },
    mustInclude: [/Shopify/],
    mustNotInclude: [
      /מוצרי\s+Shopify/i,
      /חוות\s+דעת\s+על\s+מוצרי\s+Shopify/i,
      /\bcompetitors?\b/i,
      /אלטרנטיבות\s+ל/i,
      /\{\{[^}]+\}\}/,
    ],
  },
  {
    label: '11. Shopify EN — must remain SaaS, not product_brand',
    args: {
      businessName: 'Shopify',
      domain: 'shopify.com',
      language: 'en',
      city: null,
      country: 'US',
      keywords: ['online store builder', 'ecommerce platform'],
      manualProfile: null,
      limit: 12,
      diversify: false,
    },
    mustInclude: [/Shopify/],
    mustNotInclude: [
      /Shopify\s+products?/i,
      /Reviews\s+of\s+Shopify\s+products/i,
      /\bcompetitors?\b/i,
      /alternatives\s+to/i,
      /\{\{[^}]+\}\}/,
    ],
  },
  {
    label: '12. Apple with NO manual profile — fallback to generic ecosystem',
    args: {
      businessName: 'Apple',
      domain: 'apple.com',
      language: 'he',
      city: null,
      country: 'IL',
      keywords: [],
      manualProfile: null,
      limit: 12,
      diversify: false,
    },
    // No manual categories or keywords → known_brand fallback kicks in,
    // so we still expect product-specific questions (iPhone, MacBook, etc.)
    mustInclude: [/אייפון|מקבוק|אייפד|iPhone|MacBook|iPad/],
    mustNotInclude: [/\{\{[^}]+\}\}/],
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

  if (c.mustInclude) {
    for (const pattern of c.mustInclude) {
      const hit = out.find((q) => pattern.test(q.prompt))
      if (hit) {
        console.log(`  ✓ required pattern matched: ${pattern} → "${hit.prompt}"`)
      } else {
        console.log(`  !! FAIL — required pattern NOT matched: ${pattern}`)
        failures++
      }
    }
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
