'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserEntitlement } from '@/lib/subscription'

export async function createTrackingTargetAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('לא מחובר')

  const projectId = formData.get('project_id') as string

  // Enforce keyword limit per project
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const { count } = await supabase
      .from('tracking_targets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_active', true)

    if ((count ?? 0) >= entitlement.limits.maxKeywordsPerProject) {
      throw new Error(
        `הגעת למגבלת ${entitlement.limits.maxKeywordsPerProject} מילות מפתח לפרויקט בתוכנית ${entitlement.limits.label}. שדרג את המנוי להוספת מילות מפתח נוספות.`
      )
    }
  }

  const data = {
    user_id: user.id,
    project_id: projectId,
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

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}

export async function createBulkTrackingTargetsAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('לא מחובר')

  const projectId = formData.get('project_id') as string
  const engineType = formData.get('engine_type') as string
  const targetDomain = (formData.get('target_domain') as string) || null
  const targetBusinessName = (formData.get('target_business_name') as string) || null
  const preferredLandingPage = (formData.get('preferred_landing_page') as string) || null
  const notes = (formData.get('notes') as string) || null
  const rawKeywords = formData.get('keywords') as string

  // Parse: split by newline, trim, filter empty lines, deduplicate
  const keywords = [
    ...new Set(
      rawKeywords
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    ),
  ]

  if (keywords.length === 0) {
    throw new Error('לא הוזנו מילות מפתח')
  }

  // Fetch existing keywords for this project to avoid duplicates
  const { data: existing } = await supabase
    .from('tracking_targets')
    .select('keyword')
    .eq('project_id', projectId)

  const existingSet = new Set((existing || []).map((r) => r.keyword.trim().toLowerCase()))

  const toInsert = keywords
    .filter((k) => !existingSet.has(k.toLowerCase()))
    .map((keyword) => ({
      user_id: user.id,
      project_id: projectId,
      keyword,
      engine_type: engineType,
      target_domain: targetDomain,
      target_business_name: targetBusinessName,
      preferred_landing_page: preferredLandingPage,
      notes,
      is_active: true,
    }))

  if (toInsert.length === 0) {
    throw new Error('כל מילות המפתח שהוזנו כבר קיימות בפרויקט')
  }

  // Enforce keyword limit per project
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const currentCount = existingSet.size
    const limit = entitlement.limits.maxKeywordsPerProject
    const available = Math.max(0, limit - currentCount)

    if (available === 0) {
      throw new Error(
        `הגעת למגבלת ${limit} מילות מפתח לפרויקט בתוכנית ${entitlement.limits.label}.`
      )
    }

    if (toInsert.length > available) {
      throw new Error(
        `ניתן להוסיף עוד ${available} מילות מפתח בלבד (מגבלת ${limit} בתוכנית ${entitlement.limits.label}).`
      )
    }
  }

  const { error } = await supabase.from('tracking_targets').insert(toInsert)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')

  return { created: toInsert.length, skipped: keywords.length - toInsert.length }
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
