/**
 * Publishing one post to a Facebook Page or to the Instagram account linked to
 * it. Server-only. Every call carries the PAGE token in a POST body.
 *
 * Facebook: a post with a photo goes to /{page}/photos (url + caption), a text
 * post to /{page}/feed. Instagram: a media container (/{ig}/media) and then
 * /{ig}/media_publish, the documented two steps. Meta fetches the photo from
 * its public https address itself, so an image URL is always one the server
 * rebuilt from the project's own article, never one the browser sent.
 */
import { metaGraphGet, metaGraphPost, type FetchLike } from './oauth'
import { MetaApiError } from './errors'

export interface PublishedPost { id: string; permalink: string | null }

const SAFE_ID = /^[0-9_]{1,64}$/

export async function publishToFacebook(
  pageToken: string,
  args: { pageId: string; text: string; link: string | null; imageUrl: string | null },
  fetchImpl: FetchLike = fetch,
): Promise<PublishedPost> {
  if (!/^[0-9]{1,32}$/.test(args.pageId)) throw new MetaApiError('page_not_found')
  const withPhoto = !!args.imageUrl
  // A photo post has no link field, so the link rides in the caption; a text post uses Facebook's own link field.
  const caption = args.link ? `${args.text}\n\n${args.link}` : args.text
  const res = withPhoto
    ? await metaGraphPost(`/${args.pageId}/photos`, { url: args.imageUrl as string, caption, published: 'true', access_token: pageToken }, fetchImpl)
    : await metaGraphPost(`/${args.pageId}/feed`, { message: args.text, ...(args.link ? { link: args.link } : {}), access_token: pageToken }, fetchImpl)
  const id = typeof res.post_id === 'string' ? res.post_id : typeof res.id === 'string' ? res.id : ''
  if (!SAFE_ID.test(id)) throw new MetaApiError('unexpected')
  return { id, permalink: `https://www.facebook.com/${id}` }
}

export async function publishToInstagram(
  pageToken: string,
  args: { igUserId: string; caption: string; imageUrl: string },
  fetchImpl: FetchLike = fetch,
): Promise<PublishedPost> {
  if (!/^[0-9]{1,32}$/.test(args.igUserId)) throw new MetaApiError('no_instagram')
  const container = await metaGraphPost(`/${args.igUserId}/media`, { image_url: args.imageUrl, caption: args.caption, access_token: pageToken }, fetchImpl)
  const creationId = typeof container.id === 'string' ? container.id : ''
  if (!SAFE_ID.test(creationId)) throw new MetaApiError('unexpected')
  const published = await metaGraphPost(`/${args.igUserId}/media_publish`, { creation_id: creationId, access_token: pageToken }, fetchImpl)
  const id = typeof published.id === 'string' ? published.id : ''
  if (!SAFE_ID.test(id)) throw new MetaApiError('unexpected')
  let permalink: string | null = null
  try {
    const info = await metaGraphGet(`/${id}`, { fields: 'permalink', access_token: pageToken }, fetchImpl)
    permalink = typeof info.permalink === 'string' && /^https:\/\//.test(info.permalink) ? info.permalink : null
  } catch { /* the post is live; the link is a convenience */ }
  return { id, permalink }
}
