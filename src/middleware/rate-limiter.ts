export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private lastRefill: number;
  private waitQueue: Array<() => void> = [];
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxBurst: number = 20, refillRate: number = 10) {
    this.maxTokens = maxBurst;
    this.tokens = maxBurst;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();

    // Start refill timer only when there are queued requests
  }

  private ensureRefillTimer(): void {
    if (!this.refillTimer && this.waitQueue.length > 0) {
      this.refillTimer = setInterval(() => {
        this.refill();
        if (this.waitQueue.length === 0 && this.refillTimer) {
          clearInterval(this.refillTimer);
          this.refillTimer = null;
        }
      }, 100);
      this.refillTimer.unref();
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.lastRefill = now;

    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);

    // Wake up waiting requests
    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.waitQueue.shift()!;
      resolve();
    }
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait for a token to become available
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
      this.ensureRefillTimer();
    });
  }

  destroy(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    // Release any waiting requests
    for (const resolve of this.waitQueue) {
      resolve();
    }
    this.waitQueue = [];
  }
}
