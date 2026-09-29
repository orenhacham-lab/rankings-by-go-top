/**
 * The real dependencies the auto-fix routes wire into lib/site-fix/api.ts. Server-side only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, encryptCredential } from '@/lib/security/credentials-crypto'
import { clientIpFrom } from '@/lib/free-check/store'
import {
  detectSeoCapabilities, findItemByUrl, getItemForEdit, searchItems, updateItemFields, writeVerifiedSeoMeta,
} from '@/lib/wordpress/client'
import { liveReader as siteHealthLiveReader } from '@/lib/site-health/api'
import type { FixesDeps } from './api'
import { liveReader } from './preview'

export function routeDeps(userId: string | null, headers: Headers): FixesDeps {
  const ip = clientIpFrom(headers)
  return {
    userId,
    ip: ip === 'unknown' ? null : ip.slice(0, 64),
    admin: createAdminClient(),
    decrypt: decryptCredential,
    encrypt: encryptCredential,
    wp: {
      findItemByUrl, getItemForEdit, updateItemFields, searchItems, detectSeoCapabilities, writeVerifiedSeoMeta,
      readLivePage: siteHealthLiveReader(),
    },
    readLive: liveReader(),
  }
}
