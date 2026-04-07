'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateNextScanDate } from '@/lib/utils'

export async function createProjectAction(formData: FormData) {
  const supabase = await createClient()

  const scanFrequency = formData.get('scan_frequency') as string
  const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'
  const nextScanAt = autoScanEnabled && scanFrequency !== 'manual'
    ? calculateNextScanDate(scanFrequency)
    : null

  const data = {
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

  const scanFrequency = formData.get('scan_frequency') as string
  const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'
  const nextScanAt = autoScanEnabled && scanFrequency !== 'manual'
    ? calculateNextScanDate(scanFrequency)
    : null

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
    next_scan_at: nextScanAt?.toISOString() || null,
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
