/**
 * Business Classification & Search Object Extraction
 *
 * Improves question generation by:
 * 1. Detecting specific business types (service vs product, SaaS vs ecommerce, etc.)
 * 2. Extracting proper search objects instead of using brand names
 * 3. Identifying product/service subcategories for more specific questions
 */

export type BusinessType =
  | 'ecommerce_store'
  | 'local_service'
  | 'professional_service'
  | 'saas_tool'
  | 'agency'
  | 'home_improvement_service'
  | 'restaurant_or_local_place'
  | 'gift_or_flowers'
  | 'beauty_or_perfume'
  | 'fitness'
  | 'generic_brand'

export interface SearchObject {
  /**Primary products/services to feature in questions */
  primary: string[]
  /** Secondary products/services */
  secondary: string[]
  /** Service provider type (e.g., "contractor", "agency", "store") */
  providerType?: string
  /** Specific category (e.g., "kitchen remodeling", "rank tracking") */
  category?: string
}

export interface BusinessClassification {
  type: BusinessType
  confidence: number
  searchObjects: SearchObject
  isService: boolean
  isProduct: boolean
  isSaaS: boolean
  isLocal: boolean
  isAgency: boolean
}

/**
 * Classify business type from business name, domain, and keywords
 */
export function classifyBusiness(
  businessName: string,
  domain: string,
  keywords: string[] = [],
): BusinessClassification {
  const text = `${businessName} ${domain} ${keywords.join(' ')}`.toLowerCase()

  // SaaS detection
  if (
    /(saas|software|tool|platform|tracking|analytics|management|automation|cloud|\.io|\.ai|app|application)/i.test(
      text
    )
  ) {
    return {
      type: 'saas_tool',
      confidence: 0.9,
      searchObjects: extractSaaSObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: true,
      isLocal: false,
      isAgency: false,
    }
  }

  // Agency (marketing, SEO, digital)
  if (/(agency|seo|ppc|sem|marketing|advertis|digital|google ads|ppc|rank tracking)/i.test(text)) {
    return {
      type: 'agency',
      confidence: 0.9,
      searchObjects: extractAgencyObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: true,
    }
  }

  // Home improvement / construction / remodeling
  if (
    /(home improv|remodel|construc|contractor|kitchen|bathroom|design.build|plumb|electric|hvac|renov|building|cabinet)/i.test(
      text
    )
  ) {
    return {
      type: 'home_improvement_service',
      confidence: 0.9,
      searchObjects: extractHomeImprovementObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Beauty / perfume / salon
  if (/(beauty|salon|spa|hair|nails|massage|perfume|fragrance|cosmetics|makeup)/i.test(text)) {
    return {
      type: 'beauty_or_perfume',
      confidence: 0.85,
      searchObjects: extractBeautyObjects(businessName, keywords),
      isService: true,
      isProduct: true,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Flowers / gifts
  if (/(flower|florist|gift|present|hamper|bouquet|arrangement)/i.test(text)) {
    return {
      type: 'gift_or_flowers',
      confidence: 0.9,
      searchObjects: extractGiftFlowerObjects(businessName, keywords),
      isService: true,
      isProduct: true,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Fitness
  if (/(gym|fitness|yoga|crossfit|training|trainer|workout)/i.test(text)) {
    return {
      type: 'fitness',
      confidence: 0.85,
      searchObjects: extractFitnessObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Local services (plumber, electrician, cleaner, etc.)
  if (
    /(plumber|electrician|cleaner|contractor|repair|hvac|locksmith|pest|tree|landscap|moving|handyman)/i.test(
      text
    )
  ) {
    return {
      type: 'local_service',
      confidence: 0.85,
      searchObjects: extractLocalServiceObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Professional services (lawyer, accountant, consultant)
  if (/(lawyer|attorney|accountant|consultant|advisor|coach|therapist|doctor|clinic)/i.test(text)) {
    return {
      type: 'professional_service',
      confidence: 0.85,
      searchObjects: extractProfessionalServiceObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Restaurant / local place
  if (/(restaurant|cafe|bar|bistro|diner|pizzeria|bakery|food|cuisine)/i.test(text)) {
    return {
      type: 'restaurant_or_local_place',
      confidence: 0.85,
      searchObjects: extractRestaurantObjects(businessName, keywords),
      isService: true,
      isProduct: false,
      isSaaS: false,
      isLocal: true,
      isAgency: false,
    }
  }

  // Ecommerce store
  if (/(shop|store|ecommerce|online|retail|buy|sell|commerce|checkout)/i.test(text)) {
    return {
      type: 'ecommerce_store',
      confidence: 0.8,
      searchObjects: extractEcommerceObjects(businessName, keywords),
      isService: false,
      isProduct: true,
      isSaaS: false,
      isLocal: false,
      isAgency: false,
    }
  }

  // Default: generic brand
  return {
    type: 'generic_brand',
    confidence: 0.5,
    searchObjects: { primary: [], secondary: [], providerType: undefined },
    isService: false,
    isProduct: false,
    isSaaS: false,
    isLocal: false,
    isAgency: false,
  }
}

function extractSaaSObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let category = ''
  let providers: string[] = []

  if (/(rank tracking|rank checker|rank monitor|ranking|seo|google rank)/i.test(text)) {
    category = 'rank tracking'
    providers = [
      'Google rank tracking tool',
      'rank tracking software',
      'local SEO reporting tool',
      'AI visibility tracking tool',
      'SEO reporting software',
    ]
  } else if (/(analytics|data|report|insight|dashboard)/i.test(text)) {
    category = 'analytics'
    providers = ['business analytics tool', 'data analytics platform', 'reporting software']
  } else if (/(management|automation|workflow|project)/i.test(text)) {
    category = 'business management'
    providers = ['project management tool', 'business automation software', 'workflow management platform']
  } else {
    category = 'business software'
    providers = ['business management software', 'SaaS tool', 'business platform']
  }

  return {
    primary: providers,
    secondary: ['software comparison', 'pricing options', 'integration capabilities'],
    category,
    providerType: 'SaaS provider',
  }
}

function extractAgencyObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let services: string[] = []

  if (/rank tracking|seo|google rank|ranking/i.test(text)) {
    services = ['SEO rank tracking', 'local SEO reporting', 'Google rank monitoring']
  } else if (/ppc|google ads|paid search/i.test(text)) {
    services = ['Google Ads management', 'PPC campaigns', 'paid search advertising']
  } else if (/seo/i.test(text)) {
    services = ['SEO services', 'organic search optimization', 'local SEO']
  } else if (/marketing|advertis/i.test(text)) {
    services = ['digital marketing services', 'online advertising', 'campaign management']
  } else {
    services = ['digital marketing', 'online marketing services']
  }

  return {
    primary: services,
    secondary: ['marketing consulting', 'strategy development', 'performance reports'],
    providerType: 'marketing/SEO agency',
  }
}

function extractHomeImprovementObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let services: string[] = []

  if (/kitchen/i.test(text)) {
    services = ['kitchen remodeling', 'kitchen renovation', 'kitchen cabinets']
  }
  if (/bathroom/i.test(text)) {
    services = [...services, 'bathroom remodeling', 'bathroom renovation', 'tile work']
  }

  if (services.length === 0) {
    services = ['home remodeling', 'home renovation', 'home remodeling contractor']
  }

  return {
    primary: services,
    secondary: ['design services', 'construction services', 'home improvement'],
    providerType: 'remodeling contractor',
  }
}

function extractBeautyObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let services: string[] = []

  if (/perfume|fragrance|boshom/i.test(text)) {
    services = ['perfumes', 'fragrances', 'colognes']
  } else if (/hair|salon/i.test(text)) {
    services = ['hair salon', 'haircut', 'hair color']
  } else if (/spa|massage/i.test(text)) {
    services = ['spa services', 'massage therapy', 'wellness treatments']
  } else {
    services = ['beauty services', 'personal care']
  }

  return {
    primary: services,
    secondary: ['beauty products', 'skincare', 'cosmetics'],
    providerType: 'beauty salon',
  }
}

function extractGiftFlowerObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  if (/flower|florist|bouquet/i.test(text)) {
    return {
      primary: ['flower delivery', 'bouquets', 'fresh flowers'],
      secondary: ['floral arrangements', 'gift flowers'],
      providerType: 'florist',
    }
  }

  return {
    primary: ['gifts', 'gift baskets', 'gift delivery'],
    secondary: ['personalized gifts', 'corporate gifts'],
    providerType: 'gift shop',
  }
}

function extractFitnessObjects(businessName: string, keywords: string[]): SearchObject {
  return {
    primary: ['gym membership', 'fitness classes', 'personal training'],
    secondary: ['fitness equipment', 'wellness programs'],
    providerType: 'gym/fitness center',
  }
}

function extractLocalServiceObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let service = 'service'

  if (/plumb/i.test(text)) service = 'plumbing services'
  if (/electric/i.test(text)) service = 'electrical services'
  if (/hvac|air.condition/i.test(text)) service = 'HVAC services'
  if (/clean/i.test(text)) service = 'cleaning services'
  if (/repair/i.test(text)) service = 'repair services'

  return {
    primary: [service],
    secondary: ['professional contractor', 'licensed service provider'],
    providerType: 'service provider',
  }
}

function extractProfessionalServiceObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let service = 'professional services'

  if (/lawyer|attorney|legal/i.test(text)) service = 'legal services'
  if (/accountant|tax/i.test(text)) service = 'accounting services'
  if (/consultant|coaching/i.test(text)) service = 'consulting services'

  return {
    primary: [service],
    secondary: ['professional expertise', 'advisory services'],
    providerType: 'professional',
  }
}

function extractRestaurantObjects(businessName: string, keywords: string[]): SearchObject {
  const text = `${businessName} ${keywords.join(' ')}`.toLowerCase()

  let cuisine = 'restaurant'

  if (/pizza|italian/i.test(text)) cuisine = 'Italian restaurant'
  if (/japanese|sushi/i.test(text)) cuisine = 'Japanese restaurant'
  if (/chinese/i.test(text)) cuisine = 'Chinese restaurant'
  if (/bistro|french/i.test(text)) cuisine = 'French bistro'

  return {
    primary: [cuisine],
    secondary: ['dining experience', 'menu options'],
    providerType: 'restaurant',
  }
}

function extractEcommerceObjects(businessName: string, keywords: string[]): SearchObject {
  // Extract specific products from keywords
  const products = keywords.slice(0, 3).filter((k) => k.length > 3)

  return {
    primary: products.length > 0 ? products : ['products'],
    secondary: ['online shopping', 'product selection', 'shipping options'],
    providerType: 'online store',
  }
}
