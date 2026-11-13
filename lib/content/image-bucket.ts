/**
 * The Supabase storage bucket that holds article images.
 *
 * It is one string, and it lives on its own because of what importing it used
 * to cost. It was declared in lib/content/featured-image.ts, which imports the
 * image generator and so, transitively, sharp — and sharp carries a prebuilt
 * libvips of about 19 MB into every function that reaches it. Six modules that
 * never touch a pixel import this bucket name: the account deletion path, the
 * WordPress publisher, the inline-image routes, the GBP handlers and the GBP
 * image store. Each of them was paying 19 MB of Vercel function storage for a
 * 24-character constant.
 *
 * So: anything that only needs to NAME the bucket imports it from here, and
 * only code that actually encodes an image imports featured-image.ts.
 * lib/__qa__/function-storage.qa.ts guards that separation.
 */
export const CONTENT_IMAGE_BUCKET = 'content-article-images'
