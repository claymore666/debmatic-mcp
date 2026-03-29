import type { CcuConfig } from "./ccu/types.js";

export interface AppConfig {
  ccu: CcuConfig;
  mcp: {
    transport: "http" | "stdio";
    port: number;
    authToken?: string;
  };
  cache: {
    dir: string;
    ttl: number;
  };
  rateLimiter: {
    burst: number;
    rate: number;
  };
  resourcePollInterval: number;
}

export function loadConfig(): AppConfig {
  const host = process.env.CCU_HOST;
  if (!host) {
    throw new Error("CCU_HOST environment variable is required");
  }

  const password = process.env.CCU_PASSWORD;
  if (!password) {
    throw new Error("CCU_PASSWORD environment variable is required");
  }

  // CLI flags override env vars for transport
  const args = process.argv.slice(2);
  let transport: "http" | "stdio" = (process.env.MCP_TRANSPORT as "http" | "stdio") || "http";
  if (args.includes("--stdio")) transport = "stdio";
  if (args.includes("--http")) transport = "http";

  return {
    ccu: {
      host,
      port: parseInt(process.env.CCU_PORT || "80", 10),
      user: process.env.CCU_USER || "Admin",
      password,
      timeout: 10_000,
      scriptTimeout: 30_000,
    },
    mcp: {
      transport,
      port: parseInt(process.env.MCP_PORT || "3000", 10),
      authToken: process.env.MCP_AUTH_TOKEN,
    },
    cache: {
      dir: process.env.CACHE_DIR || "/data",
      ttl: parseInt(process.env.CACHE_TTL || "86400", 10),
    },
    rateLimiter: {
      burst: parseInt(process.env.CCU_RATE_LIMIT_BURST || "20", 10),
      rate: parseInt(process.env.CCU_RATE_LIMIT_RATE || "10", 10),
    },
    resourcePollInterval: parseInt(process.env.RESOURCE_POLL_INTERVAL || "60", 10),
  };
}
