import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionManager } from "../ccu/session.js";
import type { DeviceTypeCache } from "../cache/device-type-cache.js";

export interface HealthDeps {
  session: SessionManager;
  deviceTypeCache: DeviceTypeCache;
}

export function handleHealthRequest(req: IncomingMessage, res: ServerResponse, deps: HealthDeps): void {
  const { session, deviceTypeCache } = deps;

  const checks = {
    server: "up" as const,
    session_valid: session.isLoggedIn(),
    cache_types_count: deviceTypeCache.size(),
    cache_warming: deviceTypeCache.isWarming(),
  };

  const status = checks.session_valid ? "healthy" : "degraded";
  const httpStatus = status === "healthy" ? 200 : 503;

  res.writeHead(httpStatus, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status, checks }));
}
