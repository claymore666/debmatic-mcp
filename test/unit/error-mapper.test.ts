import { describe, it, expect } from "vitest";
import { mapCcuError, mapNetworkError, CcuError } from "../../src/middleware/error-mapper.js";

describe("mapCcuError", () => {
  it("maps code 502 to NOT_FOUND", () => {
    const result = mapCcuError(
      { name: "JSONRPCError", code: 502, message: "XML-RPC: unknown device or channel" },
      "Interface.getValue",
    );
    expect(result.error).toBe("NOT_FOUND");
    expect(result.ccuMethod).toBe("Interface.getValue");
    expect(result.ccuCode).toBe(502);
    expect(result.hint).toContain("list_devices");
  });

  it("maps code 400 to AUTH", () => {
    const result = mapCcuError(
      { name: "JSONRPCError", code: 400, message: "access denied" },
      "Interface.setValue",
    );
    expect(result.error).toBe("AUTH");
  });

  it("maps code 505 to INVALID_INPUT", () => {
    const result = mapCcuError(
      { name: "JSONRPCError", code: 505, message: "XML-RPC: unknown argument or value" },
      "Interface.setValue",
    );
    expect(result.error).toBe("INVALID_INPUT");
    expect(result.hint).toContain("describe_device_type");
  });

  it("maps unknown codes to CCU_ERROR", () => {
    const result = mapCcuError(
      { name: "JSONRPCError", code: 999, message: "something weird" },
      "SomeMethod",
    );
    expect(result.error).toBe("CCU_ERROR");
  });
});

describe("mapNetworkError", () => {
  it("maps AbortError to TIMEOUT", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    const result = mapNetworkError(err, "Interface.getValue");
    expect(result.error).toBe("TIMEOUT");
  });

  it("maps timeout message to TIMEOUT", () => {
    const result = mapNetworkError(new Error("request timeout"), "Interface.getValue");
    expect(result.error).toBe("TIMEOUT");
  });

  it("maps connection errors to UNREACHABLE", () => {
    const result = mapNetworkError(new Error("ECONNREFUSED"), "Session.login");
    expect(result.error).toBe("UNREACHABLE");
    expect(result.hint).toContain("CCU is running");
  });
});

describe("CcuError", () => {
  it("produces MCP error format", () => {
    const err = new CcuError({
      error: "NOT_FOUND",
      code: 502,
      message: "unknown device",
      hint: "Call list_devices",
      ccuMethod: "Interface.getValue",
      ccuCode: 502,
    });

    const mcpErr = err.toMcpError();
    expect(mcpErr.isError).toBe(true);
    expect(mcpErr.content[0].type).toBe("text");

    const parsed = JSON.parse(mcpErr.content[0].text);
    expect(parsed.error).toBe("NOT_FOUND");
    expect(parsed.hint).toBe("Call list_devices");
  });
});
