import { describe, it, expect, afterEach } from "vitest";
import { RateLimiter } from "../../src/middleware/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it("allows burst of requests up to max", async () => {
    limiter = new RateLimiter(5, 10);

    // Should complete immediately — 5 tokens available
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
  });

  it("queues requests when tokens exhausted", async () => {
    limiter = new RateLimiter(1, 100); // 1 token, fast refill

    await limiter.acquire(); // Use the one token

    // Next acquire should wait for refill
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    // Should have waited a bit (at least one refill cycle of 100ms)
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it("destroy releases waiting requests", async () => {
    limiter = new RateLimiter(0, 0); // No tokens, no refill

    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });

    limiter.destroy();
    await promise;
    expect(resolved).toBe(true);
  });
});
