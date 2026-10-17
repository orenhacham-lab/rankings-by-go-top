/**
 * PayPal's activation write — now provider-neutral, and living in
 * lib/billing/entitlement-write.ts because Creem performs the identical
 * write and a second copy of it would be a second place for the
 * single-current-entitlement rule to drift.
 *
 * Nothing about PayPal's behaviour changed with the move: the function is
 * the same one, with the same outcomes and the same in-place update. This
 * file stays so every existing import path (app/api/paypal/activate/route.ts,
 * the PayPal QA suites) keeps resolving; see lib/billing/entitlement-write.ts
 * for the reasoning that used to be here.
 */

export {
  transitionSubscriptionToActivePlan,
  type PaidSubscriptionFields,
  type ActivationTransitionOutcome,
} from '@/lib/billing/entitlement-write'
