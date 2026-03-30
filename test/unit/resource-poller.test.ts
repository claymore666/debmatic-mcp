import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ResourcePoller } from "../../src/resources/poller.js";
import { Logger } from "../../src/logger.js";

const logger = new Logger("error");

function createMocks() {
  return {
    server: { sendResourceListChanged: vi.fn(async () => {}) } as any,
    session: { call: vi.fn(async () => []) } as any,
    rateLimiter: { acquire: vi.fn(async () => {}) } as any,
  };
}

describe("ResourcePoller", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("start sets interval and stop clears it", () => {
    const mocks = createMocks();
    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 30);
    poller.start();
    poller.stop();
    // No throw, timer cleaned up
  });

  it("does not emit event on first poll (no previous hash)", async () => {
    const mocks = createMocks();
    mocks.session.call.mockResolvedValue([{ id: "1" }]);
    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 10);
    poller.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(mocks.server.sendResourceListChanged).not.toHaveBeenCalled();
    poller.stop();
  });

  it("emits sendResourceListChanged when data hash changes", async () => {
    const mocks = createMocks();
    let callCount = 0;
    mocks.session.call.mockImplementation(async () => {
      callCount++;
      return [{ data: callCount }]; // different on each call
    });

    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 10);
    poller.start();

    // First poll — sets baseline hashes
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.server.sendResourceListChanged).not.toHaveBeenCalled();

    // Second poll — data changed
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.server.sendResourceListChanged).toHaveBeenCalled();
    poller.stop();
  });

  it("does not emit event when data is unchanged", async () => {
    const mocks = createMocks();
    mocks.session.call.mockResolvedValue([{ data: "static" }]);

    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 10);
    poller.start();

    await vi.advanceTimersByTimeAsync(10_000); // first poll
    await vi.advanceTimersByTimeAsync(10_000); // second poll — same data

    expect(mocks.server.sendResourceListChanged).not.toHaveBeenCalled();
    poller.stop();
  });

  it("failure in one resource does not stop polling others", async () => {
    const mocks = createMocks();
    let callIdx = 0;
    mocks.session.call.mockImplementation(async (method: string) => {
      callIdx++;
      if (method === "Device.listAllDetail") throw new Error("fail");
      return [];
    });

    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 10);
    poller.start();

    await vi.advanceTimersByTimeAsync(10_000);

    // Should have been called for all 5 POLLABLE resources despite first failing
    expect(mocks.session.call.mock.calls.length).toBe(5);
    poller.stop();
  });

  it("acquires rate limiter before each resource poll", async () => {
    const mocks = createMocks();
    const poller = new ResourcePoller(mocks.server, mocks.session, mocks.rateLimiter, logger, 10);
    poller.start();

    await vi.advanceTimersByTimeAsync(10_000);

    // 5 resources = 5 acquire calls
    expect(mocks.rateLimiter.acquire).toHaveBeenCalledTimes(5);
    poller.stop();
  });
});
