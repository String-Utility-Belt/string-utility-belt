/**
 * The AI pipeline builder: the contract between the describe dialog that asks for steps
 * (`src/app/generate/`) and the Worker route that builds them (`worker/generate.ts`).
 *
 * Free of imports so the Worker bundles it without the app.
 */

export const GENERATE_PATH = '/api/generate'

/** Longest description the route accepts, after trimming. */
export const MAX_DESCRIPTION_CHARS = 500

/** The `code` on every error the route returns (403 and 405 carry none). */
export const GENERATE_ERROR_CODES = ['ai_off', 'ai_budget', 'ai_rate', 'ai_invalid', 'ai_unusable', 'ai_upstream'] as const

export type GenerateErrorCode = (typeof GENERATE_ERROR_CODES)[number]
