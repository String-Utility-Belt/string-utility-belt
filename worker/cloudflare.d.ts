/**
 * The Cloudflare runtime types the worker code names, declared against the DOM lib
 * (see tsconfig.worker.json for why the generated worker-configuration.d.ts is not
 * part of this program). Shapes match @cloudflare/workers-types.
 */
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface AnalyticsEngineDataPoint {
  indexes?: ((ArrayBuffer | string) | null)[]
  doubles?: number[]
  blobs?: ((ArrayBuffer | string) | null)[]
}

interface AnalyticsEngineDataset {
  writeDataPoint(event?: AnalyticsEngineDataPoint): void
}

/** Email Service's `send_email` binding (`send()` with a structured message). */
interface EmailAddress {
  email: string
  name?: string
}

interface EmailMessageBuilder {
  to: string | EmailAddress | (string | EmailAddress)[]
  from: string | EmailAddress
  subject: string
  text?: string
  html?: string
  replyTo?: string | EmailAddress
  headers?: Record<string, string>
}

interface EmailSendResult {
  messageId: string
}

/** Rejects with an Error carrying a string `code` (`E_DELIVERY_FAILED`, `E_RATE_LIMIT_EXCEEDED`, …). */
interface SendEmail {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>
}
