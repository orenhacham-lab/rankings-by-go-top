/**
 * What the merchant reads when "write the first article" does not produce one.
 *
 * The generate route answers with its own stable `reason` codes, and the content
 * dictionary's `genErrors` already has a line for each (the topics list reads the same
 * block). Only a code that block defines is looked up; anything else, including any
 * text a provider or the database might ever put in the body, becomes the generic line.
 */
export function generationErrorCopy(body: unknown, genErrors: Record<string, string>): string {
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined
  if (typeof reason === 'string' && Object.prototype.hasOwnProperty.call(genErrors, reason)) return genErrors[reason]
  return genErrors.unknown
}
