/**
 * How a topic the monthly top-up prepared is recognised (lib/content/automation/
 * topic-topup.ts): the idea it came from carries this source_context. Its own module
 * so the strategy tab's read path does not load the top-up.
 */
export const TOPUP_SOURCE_CONTEXT = 'auto_topup'
