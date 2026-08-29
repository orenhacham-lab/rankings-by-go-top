'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateNextScanDate, isValidScanFrequency } from '@/lib/utils'
import { getUserEntitlement } from '@/lib/subscription'
import { deleteOwnedRecord, type DeleteOwnedResult } from '@/lib/data/delete-owned-record'

// Note: createProjectAction is deprecated - project creation now uses API route /api/projects/create
// Kept here for backwards compatibility if needed
export async function createProjectAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('לא מחובר')

  // Enforce plan limits
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)

    if ((count ?? 0) >= entitlement.limits.maxProjects) {
      throw new Error(
        `הגעת למגבלת ${entitlement.limits.maxProjects} פרויקטים בתוכנית ${entitlement.limits.label}. שדרג את המנוי להוספת פרויקטים נוספים.`
      )
    }
  }

  const rawScanFrequency = (formData.get('scan_frequency') as string) || 'manual'
  // Phase 3 — reject weekly (and any other unsupported value) server-side,
  // never relying solely on the DB CHECK constraint.
  if (!isValidScanFrequency(rawScanFrequency)) {
    throw new Error('תדירות סריקה לא נתמכת. רק "ידני" או "פעם בחודש" מותרים.')
  }
  const scanFrequency = rawScanFrequency
  const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'
  const nextScanAt = autoScanEnabled && scanFrequency !== 'manual'
    ? calculateNextScanDate(scanFrequency)
    : null

  const data = {
    user_id: user.id,
    client_id: formData.get('client_id') as string,
    name: formData.get('name') as string,
    target_domain: formData.get('target_domain') as string,
    business_name: (formData.get('business_name') as string) || null,
    country: (formData.get('country') as string) || 'IL',
    language: (formData.get('language') as string) || 'he',
    city: (formData.get('city') as string) || null,
    device_type: (formData.get('device_type') as string) || null,
    scan_frequency: scanFrequency || 'manual',
    auto_scan_enabled: autoScanEnabled,
    next_scan_at: nextScanAt?.toISOString() || null,
    is_active: true,
  }

  const { error } = await supabase.from('projects').insert(data)
  if (error) throw new Error(error.message)

  revalidatePath('/projects')
}

export async function updateProjectAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const rawScanFrequency = (formData.get('scan_frequency') as string) || 'manual'
  if (!isValidScanFrequency(rawScanFrequency)) {
    throw new Error('תדירות סריקה לא נתמכת. רק "ידני" או "פעם בחודש" מותרים.')
  }
  const scanFrequency = rawScanFrequency
  const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'

  const data = {
    name: formData.get('name') as string,
    target_domain: formData.get('target_domain') as string,
    business_name: (formData.get('business_name') as string) || null,
    country: (formData.get('country') as string) || 'IL',
    language: (formData.get('language') as string) || 'he',
    city: (formData.get('city') as string) || null,
    device_type: (formData.get('device_type') as string) || null,
    scan_frequency: scanFrequency || 'manual',
    auto_scan_enabled: autoScanEnabled,
  }

  const { error } = await supabase.from('projects').update(data).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
}

export async function toggleProjectActiveAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({ is_active: !isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
}

/**
 * Area I — PERMANENT delete of a project. Ownership-enforced; the DB's ON DELETE
 * CASCADE removes the project's dependents (tracking targets, scans, articles,
 * GSC per-project data, …). The per-user gsc_connections is NOT FK'd to projects
 * and is deliberately left intact. No remote WordPress/Shopify article is touched.
 * Reversible deactivation stays a separate action (toggleProjectActiveAction).
 */
export async function deleteProjectAction(id: string): Promise<DeleteOwnedResult | { ok: false; error: 'not_authenticated' }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }
  const res = await deleteOwnedRecord(supabase, 'projects', id, user.id)
  if (res.ok) {
    revalidatePath('/projects')
    revalidatePath('/dashboard')
  }
  return res
}
