import { describe, it, expect, vi } from "vitest";
import { handleHealthRequest } from "../../src/health/handler.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function createMockRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  return res;
}

function createMockSession(loggedIn: boolean) {
  return { isLoggedIn: () => loggedIn } as any;
}

function createMockCache(size: number, warming: boolean) {
  return { size: () => size, isWarming: () => warming } as any;
}

describe("handleHealthRequest", () => {
  it("returns healthy when session is valid", () => {
    const res = createMockRes();
    handleHealthRequest({} as IncomingMessage, res, {
      session: createMockSession(true),
      deviceTypeCache: createMockCache(10, false),
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.status).toBe("healthy");
    expect(body.checks.session_valid).toBe(true);
    expect(body.checks.cache_types_count).toBe(10);
    expect(body.checks.cache_warming).toBe(false);
  });

  it("returns degraded when session is invalid", () => {
    const res = createMockRes();
    handleHealthRequest({} as IncomingMessage, res, {
      session: createMockSession(false),
      deviceTypeCache: createMockCache(0, true),
    });

    expect(res.writeHead).toHaveBeenCalledWith(503, { "Content-Type": "application/json" });
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.status).toBe("degraded");
    expect(body.checks.session_valid).toBe(false);
  });
});
