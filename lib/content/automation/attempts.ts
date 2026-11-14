/**
 * How many times the automation retries one pool item.
 *
 * It is one number, and it lives on its own for the same reason the image
 * bucket's name does (lib/content/image-bucket.ts): it was declared in
 * generate-item.ts, the module that GENERATES an article, which reaches the
 * featured-image generator and so sharp — about 19 MB of prebuilt libvips in
 * every function that can see it. The publishers and the site-platform
 * handlers read this cap without ever generating anything, and three routes
 * were paying for the import. lib/__qa__/function-storage.qa.ts guards it.
 */

/** Max total processing attempts per item before it stays 'failed' for a human. */
export const AUTOMATION_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUTOMATION_MAX_ATTEMPTS) || 3)
