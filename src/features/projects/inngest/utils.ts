export interface RateLimitOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

export function isRateLimitOrTransientError(error: unknown): {
  isTransient: boolean;
  retryAfterMs?: number;
} {
  if (!error || typeof error !== "object") {
    return { isTransient: false };
  }

  const err = error as Record<string, unknown>;
  const status = typeof err.status === "number" ? err.status : undefined;
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";

  // Check headers if available from Octokit or HTTPError
  let retryAfterMs: number | undefined;
  const response = err.response as Record<string, unknown> | undefined;
  const headers = (response?.headers || err.headers) as Record<string, string> | undefined;

  if (headers) {
    const retryAfter = headers["retry-after"] || headers["Retry-After"];
    if (retryAfter) {
      const parsedSeconds = parseInt(retryAfter, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        retryAfterMs = parsedSeconds * 1000;
      }
    }
    const rateLimitReset = headers["x-ratelimit-reset"] || headers["X-RateLimit-Reset"];
    if (!retryAfterMs && rateLimitReset) {
      const resetEpochSeconds = parseInt(rateLimitReset, 10);
      if (!isNaN(resetEpochSeconds)) {
        const deltaMs = resetEpochSeconds * 1000 - Date.now();
        if (deltaMs > 0 && deltaMs < 60000) {
          // Cap reasonable wait
          retryAfterMs = deltaMs;
        }
      }
    }
  }

  // HTTP 429 Too Many Requests
  if (status === 429 || message.includes("too many requests")) {
    return { isTransient: true, retryAfterMs };
  }

  // HTTP 403 Rate limit or secondary rate limit
  if (
    status === 403 &&
    (message.includes("rate limit") ||
      message.includes("secondary rate limit") ||
      message.includes("abuse detection"))
  ) {
    return { isTransient: true, retryAfterMs };
  }

  // HTTP 5xx Server errors
  if (status && status >= 500 && status < 600) {
    return { isTransient: true, retryAfterMs };
  }

  // Transient network errors
  if (
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("network error") ||
    message.includes("socket hang up")
  ) {
    return { isTransient: true, retryAfterMs };
  }

  return { isTransient: false };
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RateLimitOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const factor = options.factor ?? 2;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }

      const { isTransient, retryAfterMs } = isRateLimitOrTransientError(error);
      if (!isTransient) {
        throw error;
      }

      // Calculate jittered exponential backoff
      let delayMs = retryAfterMs;
      if (!delayMs) {
        const exponentialDelay = initialDelayMs * Math.pow(factor, attempt - 1);
        const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
        delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Executes async tasks with bounded concurrency limit.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);

  return results;
}
