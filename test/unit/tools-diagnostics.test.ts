import { describe, it, expect, vi, afterEach } from "vitest";
import { tryParseJson } from "../../src/tools/diagnostics.js";
import { createTestServer, callTool, parseToolResult, cleanupDeps } from "./_helpers.js";

describe("tryParseJson", () => {
  it("parses valid JSON", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it("returns raw string for invalid JSON", () => {
    expect(tryParseJson("not json")).toBe("not json");
    expect(tryParseJson("")).toBe("");
  });
});

describe("get_service_messages handler", () => {
  it("executes HM Script and returns parsed JSON", async () => {
    const mockMessages = '[{"id":"1","name":"LOWBAT","address":"ABC:0","channelName":"Thermostat","timestamp":"2026-03-30"}]';
    const { server, deps } = createTestServer({
      sessionCall: vi.fn().mockResolvedValue(mockMessages),
    });

    const result = parseToolResult(await callTool(server, "get_service_messages"));
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].name).toBe("LOWBAT");
    cleanupDeps(deps);
  });

  it("returns raw string when script output is not JSON", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn().mockResolvedValue("raw output"),
    });

    const result = parseToolResult(await callTool(server, "get_service_messages"));
    expect(result).toBe("raw output");
    cleanupDeps(deps);
  });
});

describe("get_system_info handler", () => {
  it("returns all system info fields", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn().mockImplementation(async (method: string) => {
        const responses: Record<string, unknown> = {
          "CCU.getVersion": "3.75.6",
          "CCU.getSerial": "NEQ1234567",
          "CCU.getAddress": "192.168.0.35",
          "CCU.getHmIPAddress": "0014DA12345678",
        };
        return responses[method] ?? null;
      }),
    });

    const result = parseToolResult(await callTool(server, "get_system_info")) as any;
    expect(result.version).toBe("3.75.6");
    expect(result.serial).toBe("NEQ1234567");
    expect(result.serverVersion).toBe("0.1.0");
    expect(result.cacheTypes).toBe(0);
    expect(typeof result.cacheWarming).toBe("boolean");
    cleanupDeps(deps);
  });

  it("returns null for individual call failures", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn().mockImplementation(async (method: string) => {
        if (method === "CCU.getSerial") throw new Error("fail");
        return "ok";
      }),
    });

    const result = parseToolResult(await callTool(server, "get_system_info")) as any;
    expect(result.version).toBe("ok");
    expect(result.serial).toBe(null);
    cleanupDeps(deps);
  });
});
