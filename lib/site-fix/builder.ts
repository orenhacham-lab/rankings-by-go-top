/**
 * A page a page builder renders FROM ITS OWN DATA, not from the post's content: Elementor, Beaver
 * Builder, Oxygen, Bricks, Breakdance, Themify. On such a page a change to the post's content (an
 * image's alt text, a link, an FAQ block) is not what visitors see, and may be lost on the builder's
 * next save, so no content fix is offered or written there (`builder_page`).
 *
 * What the app knows comes from the plugin's own /inspect (2.1.0): `builder` is true for every page
 * builder, including the ones that DO render from the post's content through shortcodes (WPBakery,
 * Divi, Avada/Fusion, Cornerstone). Those keep their shortcodes in the content, so a builder page
 * whose content carries them is left alone here (a content fix there does show). `builder` absent
 * (plugin 2.0.0) or false: nothing is known, nothing is refused.
 *
 * Pure. Reads only what the plugin already answers; nothing in the plugin changes.
 */

/** The shortcode builders: their page IS the post's content (shortcodes and all). */
const SHORTCODE_BUILDER = /\[(?:vc_row|vc_column|et_pb_|fusion_|cs_content)/i

export function rendersFromBuilderData(item: { builder?: boolean | null; content?: string | null }): boolean {
  return item.builder === true && !SHORTCODE_BUILDER.test(String(item.content ?? ''))
}
