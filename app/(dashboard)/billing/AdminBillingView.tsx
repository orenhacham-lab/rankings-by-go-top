'use client'

import Header from '@/components/layout/Header'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/**
 * Hotfix — admin billing bypass. Rendered INSTEAD of BillingView for any
 * admin user (see app/(dashboard)/billing/page.tsx, which checks
 * entitlement.isAdmin BEFORE querying Shopify/PayPal/subscription state at
 * all, so an admin's own possibly-connected Shopify store — kept connected
 * for testing/publishing — can never surface here). Deliberately a
 * SEPARATE, minimal component — never a branch inside BillingView — so no
 * future BillingView change can accidentally leak plan/Shopify/PayPal
 * wording or a billing-management button into this view.
 *
 * Renders ONLY the explicit non-billing admin state: no plan cards, no
 * "current plan" wording, no Shopify- or PayPal-managed billing wording,
 * no upgrade/downgrade/cancel/manage-payment button, no "Manage plan in
 * Shopify" — admins have full product access and no billing concept at all.
 */
export default function AdminBillingView() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.billing.admin

  return (
    <div className="max-w-6xl mx-auto">
      <Header title={t.title} subtitle={t.description} />
    </div>
  )
}
