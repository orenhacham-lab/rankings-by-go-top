/**
 * The two /api/gbp/* handlers that TOUCH PIXELS, apart from the other thirteen.
 *
 * They are a module of their own for one reason: sharp. Cropping a merchant's
 * photo (./image) and generating one from a topic (./topic-image, through the
 * article image generator) both reach it, and sharp carries a prebuilt libvips
 * of about 19 MB into every serverless function whose import graph reaches it.
 * While these two handlers sat in lib/gbp/http.ts, all fifteen /api/gbp routes
 * imported that graph — thirteen of them to read reviews, save a location or
 * cancel a post, never to open an image.
 *
 * Everything else is unchanged: the auth and schema gate, the error codes and
 * the response shapes all still come from http.ts, which these call.
 * lib/__qa__/function-storage.qa.ts guards the separation.
 */
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/image-bucket'
import { imageGenerationHttpStatus } from '@/lib/content/image-generation-http'
import { preparePostImage, GBP_SOURCE_TYPES, GBP_SOURCE_MAX_BYTES, type CropBox } from './image'
import { postImagePath } from './image-store'
import { generateTopicImage, GBP_TOPIC_MAX } from './topic-image'
import { err, gate, json, type GbpRouteDeps } from './http'

// ── POST /api/gbp/image/generate {projectId, topic} ────────────────────────
/**
 * An AI photo for a post written from a topic. Answers the JPEG itself, which
 * the composer puts through the same crop and "use this photo" steps as an
 * upload, so nothing is stored here. A failure is logged with our own reason
 * and answered with one stable code; the provider's words go nowhere.
 */
export async function handleGenerateImage(req: Request, deps: GbpRouteDeps): Promise<Response> {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof body.projectId === 'string' ? body.projectId : null)
  if (g instanceof Response) return g
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!topic || topic.length > GBP_TOPIC_MAX) return err('invalid_request', 400)
  let reason: string
  try {
    const out = await (deps.generateImage ?? generateTopicImage)({ topic })
    if (out.ok) {
      return new Response(new Uint8Array(out.bytes), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } })
    }
    reason = out.reason
  } catch {
    reason = 'generator_threw'
  }
  // Only a code of ours reaches the log; anything that looks like free text is not one.
  const classified = /^[a-z][a-z0-9_]{0,59}$/.test(reason) ? reason : 'unclassified'
  console.error('[gbp-topic-image] generation failed', { reason: classified, projectId: g.project.id })
  return err('image_generation_failed', imageGenerationHttpStatus(classified))
}

// ── POST /api/gbp/image (multipart: projectId, file, crop) ─────────────────
export async function handleImage(req: Request, deps: GbpRouteDeps & { newId?: () => string }): Promise<Response> {
  let form: FormData
  try { form = await req.formData() } catch { return err('invalid_request', 400) }
  const g = await gate(deps, typeof form.get('projectId') === 'string' ? String(form.get('projectId')) : null)
  if (g instanceof Response) return g
  const file = form.get('file')
  if (!(file instanceof Blob)) return err('image_invalid', 400)
  if (!(GBP_SOURCE_TYPES as readonly string[]).includes(file.type) || file.size > GBP_SOURCE_MAX_BYTES) return err('image_invalid', 400)
  let crop: Partial<CropBox> | null = null
  try { crop = JSON.parse(String(form.get('crop') ?? 'null')) as Partial<CropBox> | null } catch { crop = null }
  const prepared = await preparePostImage(Buffer.from(await file.arrayBuffer()), crop)
  if (!prepared.ok) return err(prepared.code, 400)
  const id = (deps.newId ?? (() => crypto.randomUUID()))()
  const path = postImagePath(g.project.id, id)
  const up = await g.admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, prepared.bytes, { contentType: 'image/jpeg', upsert: false })
  if (up.error) return err('image_upload_failed', 500)
  const { data: pub } = g.admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)
  return json({ ok: true, imagePath: path, imageUrl: pub.publicUrl, width: prepared.width, height: prepared.height })
}
