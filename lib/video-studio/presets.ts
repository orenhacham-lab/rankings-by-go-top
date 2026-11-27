/**
 * Goals and one-tap chips for the video studio. Stable ids only: the browser and the server
 * exchange these ids, never a localized label, and the English phrases the model reads live here.
 */
export const GOAL_IDS = ['showcase', 'offer', 'arrival', 'behind', 'intro'] as const
export type GoalId = (typeof GOAL_IDS)[number]
export const STYLE_IDS = ['clean', 'cinematic', 'warm', 'bold'] as const
export type StyleId = (typeof STYLE_IDS)[number]
export const MOOD_IDS = ['calm', 'joyful', 'premium', 'energetic'] as const
export type MoodId = (typeof MOOD_IDS)[number]
export const CAMERA_IDS = ['push_in', 'orbit', 'pan', 'reveal'] as const
export type CameraId = (typeof CAMERA_IDS)[number]
/** Clip lengths offered as one-tap choices. The server still accepts 3 to 15. */
export const SECONDS_OPTIONS = [5, 8, 10, 15] as const

export interface GoalPreset { id: GoalId; seconds: (typeof SECONDS_OPTIONS)[number]; style: StyleId | null; mood: MoodId | null; camera: CameraId | null; definition: string }
export const GOALS: Record<GoalId, GoalPreset> = {
  showcase: { id: 'showcase', seconds: 5, style: 'clean', mood: 'premium', camera: 'push_in', definition: 'show the product beautifully, close and detailed' },
  offer: { id: 'offer', seconds: 5, style: 'bold', mood: 'energetic', camera: 'pan', definition: 'an eye-catching, energetic presentation of a product for a promotion, with no text or numbers' },
  arrival: { id: 'arrival', seconds: 5, style: 'clean', mood: 'joyful', camera: 'reveal', definition: 'a fresh, exciting reveal of something new' },
  behind: { id: 'behind', seconds: 8, style: 'warm', mood: 'calm', camera: 'orbit', definition: 'an authentic, human behind-the-scenes craft moment' },
  intro: { id: 'intro', seconds: 8, style: 'warm', mood: 'calm', camera: 'orbit', definition: 'a welcoming introduction to the place and its atmosphere' },
}

export const STYLE_PHRASE: Record<StyleId, string> = {
  clean: 'clean, bright, minimal', cinematic: 'cinematic, film-like colour grade', warm: 'warm, cozy, inviting', bold: 'bold, vibrant, high-energy',
}
export const MOOD_PHRASE: Record<MoodId, string> = {
  calm: 'calm and unhurried', joyful: 'cheerful and welcoming', premium: 'premium and refined', energetic: 'energetic and lively',
}
export const CAMERA_PHRASE: Record<CameraId, string> = {
  push_in: 'slow push-in', orbit: 'slow orbit around the subject', pan: 'smooth lateral pan', reveal: 'slow pull-back reveal',
}

export const isGoalId = (v: unknown): v is GoalId => typeof v === 'string' && (GOAL_IDS as readonly string[]).includes(v)
export const isStyleId = (v: unknown): v is StyleId => typeof v === 'string' && (STYLE_IDS as readonly string[]).includes(v)
export const isMoodId = (v: unknown): v is MoodId => typeof v === 'string' && (MOOD_IDS as readonly string[]).includes(v)
export const isCameraId = (v: unknown): v is CameraId => typeof v === 'string' && (CAMERA_IDS as readonly string[]).includes(v)

export interface PlanInput {
  idea: string
  goal: GoalId | null
  style: StyleId | null
  mood: MoodId | null
  camera: CameraId | null
  seconds: number
  aspect: '9:16' | '16:9'
  photoCount: number
}
