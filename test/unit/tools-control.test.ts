import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inferType } from "../../src/tools/control.js";
import { createTestServer, callTool, parseToolResult, cleanupDeps } from "./_helpers.js";

describe("inferType", () => {
  it("returns 'bool' for booleans", () => {
    expect(inferType(true)).toBe("bool");
    expect(inferType(false)).toBe("bool");
  });

  it("returns 'int' for integers", () => {
    expect(inferType(0)).toBe("int");
    expect(inferType(42)).toBe("int");
    expect(inferType(-1)).toBe("int");
  });

  it("returns 'double' for floats", () => {
    expect(inferType(3.14)).toBe("double");
    expect(inferType(0.5)).toBe("double");
  });

  it("returns 'string' for strings", () => {
    expect(inferType("hello")).toBe("string");
    expect(inferType("")).toBe("string");
  });
});

describe("set_value handler", () => {
  it("reads previous value before writing", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn()
        .mockResolvedValueOnce(21.5)    // getValue (pre-read)
        .mockResolvedValueOnce(true),   // setValue
    });

    const result = parseToolResult(await callTool(server, "set_value", {
      address: "ABC123:1", valueKey: "SET_POINT_TEMPERATURE", value: 22.0, interface: "HmIP-RF", type: "double",
    }));

    expect((result as any).previousValue).toBe(21.5);
    expect((result as any).newValue).toBe(22.0);
    cleanupDeps(deps);
  });

  it("continues write if previous-value read fails", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn()
        .mockRejectedValueOnce(new Error("unreachable"))  // getValue fails
        .mockResolvedValueOnce(true),                       // setValue succeeds
    });

    const result = parseToolResult(await callTool(server, "set_value", {
      address: "ABC123:1", valueKey: "STATE", value: true, interface: "HmIP-RF", type: "bool",
    }));

    expect((result as any).previousValue).toBe(null);
    expect((result as any).newValue).toBe(true);
    cleanupDeps(deps);
  });

  it("falls back to inferType when type not provided and cache empty", async () => {
    const { server, deps } = createTestServer({
      sessionCall: vi.fn().mockResolvedValue(true),
    });

    const result = parseToolResult(await callTool(server, "set_value", {
      address: "ABC123:1", valueKey: "STATE", value: true, interface: "HmIP-RF",
    }));

    expect((result as any).type).toBe("bool");
    cleanupDeps(deps);
  });
});

describe("execute_program handler", () => {
  it("calls Program.execute and returns success", async () => {
    const sessionCall = vi.fn().mockResolvedValue(true);
    const { server, deps } = createTestServer({ sessionCall });

    const result = parseToolResult(await callTool(server, "execute_program", { id: "123" }));

    expect((result as any).executed).toBe(true);
    expect(sessionCall).toHaveBeenCalledWith("Program.execute", expect.objectContaining({ id: "123" }));
    cleanupDeps(deps);
  });
});
