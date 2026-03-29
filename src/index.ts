#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { SessionManager } from "./ccu/session.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const logger = createLogger();
  const config = loadConfig();

  logger.info("starting", {
    transport: config.mcp.transport,
    ccuHost: config.ccu.host,
    ccuPort: config.ccu.port,
  });

  // Initialize CCU session
  const session = new SessionManager(config.ccu, logger);
  const rateLimiter = new RateLimiter(config.rateLimiter.burst, config.rateLimiter.rate);

  try {
    await session.login();
  } catch (err) {
    logger.error("startup_failed", { error: (err as Error).message });
    process.exit(1);
  }

  // Create MCP server
  const server = createMcpServer({ config, session, rateLimiter, logger });

  // Connect transport
  if (config.mcp.transport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("server_ready", { transport: "stdio" });
  } else {
    // HTTP transport will be implemented with auth in task #23
    logger.error("http_transport_not_yet_implemented");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info("shutdown", { signal });
    rateLimiter.destroy();
    await session.logout();
    session.destroy();
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
