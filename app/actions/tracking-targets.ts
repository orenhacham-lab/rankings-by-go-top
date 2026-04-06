'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTrackingTargetAction(formData: FormData) {
  const supabase = await createClient()

  const data = {
    project_id: formData.get('project_id') as string,
    keyword: formData.get('keyword') as string,
    engine_type: formData.get('engine_type') as string,
    target_domain: (formData.get('target_domain') as string) || null,
    target_business_name: (formData.get('target_business_name') as string) || null,
    preferred_landing_page: (formData.get('preferred_landing_page') as string) || null,
    notes: (formData.get('notes') as string) || null,
    is_active: true,
  }

  const { error } = await supabase.from('tracking_targets').insert(data)
  if (error) throw new Error(error.message)

  const projectId = formData.get('project_id') as string
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}

export async function updateTrackingTargetAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const data = {
    keyword: formData.get('keyword') as string,
    engine_type: formData.get('engine_type') as string,
    target_domain: (formData.get('target_domain') as string) || null,
    target_business_name: (formData.get('target_business_name') as string) || null,
    preferred_landing_page: (formData.get('preferred_landing_page') as string) || null,
    notes: (formData.get('notes') as string) || null,
  }

  const { error } = await supabase.from('tracking_targets').update(data).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/keywords')
}

export async function toggleTrackingTargetActiveAction(id: string, isActive: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tracking_targets')
    .update({ is_active: !isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}

export async function deleteTrackingTargetAction(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tracking_targets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}
