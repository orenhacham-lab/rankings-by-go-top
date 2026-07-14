/**
 * Safe runtime/build identity for deploy verification (Part: runtime observability).
 *
 * Returns ONLY non-secret Vercel build/runtime values so a caller can prove which
 * commit a given Preview/prod deployment is actually serving. Never reads or
 * exposes secrets, tokens, credentials or connection strings.
 */

/** Process-start timestamp — a stable per-deployment cold-start marker. */
const PROCESS_START_ISO = new Date().toISOString()

export interface RuntimeInfo {
  gitSha: string | null
  gitRef: string | null
  vercelEnv: string | null
  deploymentUrl: string | null
  buildTime: string | null
}

export function runtimeInfo(): RuntimeInfo {
  return {
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    // Prefer an injected build timestamp; else the process cold-start time.
    buildTime: process.env.BUILD_TIME ?? process.env.VERCEL_BUILD_TIME ?? PROCESS_START_ISO,
  }
}

/** Just the git SHA (null off-Vercel) — for embedding in diagnostics/logs. */
export function currentGitSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? null
}

/** True only on a Vercel Preview deployment (gates Preview-only diagnostics). */
export function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}
