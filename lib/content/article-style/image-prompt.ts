/**
 * What each image style asks the image model for. Read by buildImagePrompt
 * (lib/content/gemini-image.ts) for the hero and for every inline image, so
 * one article's images share one look. The same provider and the same
 * commercial-safety rules apply to every style; only the look changes.
 *
 * 'realistic' is the sentence the generator always used, so a project with no
 * setting gets exactly the images it got before.
 */
import { cleanBrandColors, type ImageStyle } from './types'

export const IMAGE_STYLE_PROMPTS: Record<ImageStyle, { look: string; avoid: string }> = {
  realistic: {
    look: 'Style: high-end editorial photography, realistic real-world environment, natural lighting, clean uncluttered composition with a clear focal point, shallow depth of field.',
    avoid: 'Do NOT make it a cartoon, illustration, or 3D render unless the topic clearly requires it.',
  },
  illustration: {
    look: 'Style: modern flat vector illustration, clean geometric shapes, soft even colour fields, subtle grain, generous negative space, calm and professional.',
    avoid: 'Not a photograph and not a 3D render; no gradients that look cheap, no clip-art.',
  },
  watercolor: {
    look: 'Style: delicate hand-painted watercolour on textured paper, soft bleeding edges, light airy washes, gentle natural palette, artistic and calm.',
    avoid: 'Not a photograph and not a 3D render; keep it painterly and light.',
  },
  sketch: {
    look: 'Style: refined pencil and ink sketch, confident hand-drawn lines, light cross-hatching, off-white paper, minimal accent colour.',
    avoid: 'Not a photograph and not a 3D render; no heavy colour fills.',
  },
  render3d: {
    look: 'Style: polished 3D render, soft studio lighting, smooth rounded forms, gentle shadows, clean pastel backdrop, premium product-visual feel.',
    avoid: 'Not a photograph and not a flat drawing; avoid plastic-looking cheap renders.',
  },
  clay: {
    look: 'Style: handmade clay miniature scene, playful sculpted forms with visible fingerprints and soft texture, warm studio light, tilt-shift depth.',
    avoid: 'Not a photograph of real people; keep it a crafted miniature.',
  },
}

/** The style sentences for a prompt. Illustrated styles lean on the brand colours; a photo keeps the world's own colours. */
export function imageStylePrompt(style: ImageStyle | null | undefined, brandColors: readonly string[] = []): { look: string; avoid: string } {
  const s = IMAGE_STYLE_PROMPTS[style ?? 'realistic'] ?? IMAGE_STYLE_PROMPTS.realistic
  const colors = cleanBrandColors([...brandColors]).slice(0, 3)
  if (style && style !== 'realistic' && colors.length) {
    return { look: `${s.look} Build the palette around these brand colours: ${colors.join(', ')}.`, avoid: s.avoid }
  }
  return s
}
