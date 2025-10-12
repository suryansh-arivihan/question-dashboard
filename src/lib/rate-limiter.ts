/**
 * Rate limiter to control concurrent DynamoDB operations
 */
export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;

  constructor(private maxConcurrent: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const fn = this.queue.shift();

    if (fn) {
      await fn();
      this.running--;
      this.process();
    }
  }
}

/**
 * Sleep utility for adding delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a throttling error
      if (error && typeof error === 'object' && '__type' in error) {
        const errorType = (error as any).__type;
        if (errorType === 'com.amazon.coral.availability#ThrottlingException') {
          const delay = initialDelay * Math.pow(2, i);
          console.log(`[retryWithBackoff] Throttled, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
      }

      // For non-throttling errors, throw immediately
      throw error;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
