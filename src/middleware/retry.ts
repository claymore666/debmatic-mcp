import { CcuError } from "./error-mapper.js";
import type { Logger } from "../logger.js";

// Methods that are NOT safe to retry (non-idempotent)
const NON_IDEMPOTENT_METHODS = new Set([
  "Program.execute",
  "ReGa.runScript",
]);

const RETRIABLE_CATEGORIES = new Set(["TIMEOUT", "UNREACHABLE"]);

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  method: string,
  logger: Logger,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 1, delayMs = 1000 } = options;

  // Never retry non-idempotent methods
  if (NON_IDEMPOTENT_METHODS.has(method)) {
    return fn();
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Only retry retriable errors
      if (err instanceof CcuError && RETRIABLE_CATEGORIES.has(err.structured.error)) {
        if (attempt < maxRetries) {
          logger.warn("retry", { method, attempt: attempt + 1, maxRetries, delayMs });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // Non-retriable error or auth (handled by session manager) — throw immediately
      throw err;
    }
  }

  throw lastError;
}
