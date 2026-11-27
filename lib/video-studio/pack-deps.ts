/** Real collaborators for lib/video-studio/paypal-packs.ts. Server-only. */
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayPalToken, paypalApiUrl } from '@/lib/paypal/client'
import type { PayPalPackDeps } from './paypal-packs'

export const realPayPalPackDeps: PayPalPackDeps = {
  async paypal(path, init) {
    const token = await getPayPalToken()
    const res = await fetch(`${paypalApiUrl()}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
    return { ok: res.ok, json: ((await res.json().catch(() => ({}))) as Record<string, unknown>) }
  },
  async grant(g) {
    const { data, error } = await createAdminClient().rpc('video_credit_purchase', {
      p_user: g.userId, p_credits: g.credits, p_provider: 'paypal', p_ref: g.ref, p_pack: g.pack, p_amount: g.amountMinor, p_currency: g.currency,
    })
    return error ? null : data === true
  },
}

import { createCreemCheckout } from '@/lib/creem/client'
import { fetchCreemCheckout } from '@/lib/creem/checkout-read'
import { creemReturnOrigin } from '@/lib/creem/config'
import type { CreemPackDeps } from './creem-packs'

export const realCreemPackDeps: CreemPackDeps = {
  createCheckout: (p) => createCreemCheckout({
    productId: p.productId,
    // Our own origin and a fixed path: nothing from the request becomes a redirect.
    successUrl: `${creemReturnOrigin()}/video-studio?pack=creem`,
    requestId: p.requestId,
    customerEmail: p.customerEmail,
    metadata: p.metadata,
  }),
  readCheckout: (id) => fetchCreemCheckout(id),
  async grant(g) {
    const { data, error } = await createAdminClient().rpc('video_credit_purchase', {
      p_user: g.userId, p_credits: g.credits, p_provider: 'creem', p_ref: g.ref, p_pack: g.pack, p_amount: g.amountMinor, p_currency: g.currency,
    })
    return error ? null : data === true
  },
}
