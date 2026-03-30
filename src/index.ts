#!/usr/bin/env node

import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { SessionManager } from "./ccu/session.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { DeviceTypeCache } from "./cache/device-type-cache.js";
import { ResourcePoller } from "./resources/poller.js";
import { resolveAuthToken } from "./auth/token.js";
import { handleHealthRequest } from "./health/handler.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const logger = createLogger();
  const config = loadConfig();

  logger.info("starting", {
    transport: config.mcp.transport,
    ccuHost: config.ccu.host,
    ccuPort: config.ccu.port,
    https: config.ccu.https,
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

  // Initialize device type cache
  const deviceTypeCache = new DeviceTypeCache(config.cache.dir, config.cache.ttl, logger);
  await deviceTypeCache.loadFromDisk();
  deviceTypeCache.warm(session, rateLimiter).catch((err) => {
    logger.error("cache_warm_background_error", { error: (err as Error).message });
  });

  // Create MCP server
  const mcpServer = createMcpServer({ config, session, rateLimiter, logger, deviceTypeCache });

  // Start resource poller
  const poller = new ResourcePoller(mcpServer.server, session, rateLimiter, logger, config.resourcePollInterval);

  // Connect transport
  if (config.mcp.transport === "stdio") {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    poller.start();
    logger.info("server_ready", { transport: "stdio" });
  } else {
    // HTTP mode with auth
    const authToken = await resolveAuthToken(config.mcp.authToken, config.cache.dir, logger);

    const httpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    const httpServer = createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        handleHealthRequest(req, res, { session, deviceTypeCache });
        return;
      }

      // Auth check for MCP endpoints
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${authToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Delegate to MCP transport
      await httpTransport.handleRequest(req, res);
    });

    await mcpServer.connect(httpTransport);
    poller.start();

    httpServer.listen(config.mcp.port, () => {
      logger.info("server_ready", { transport: "http", port: config.mcp.port });
    });
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info("shutdown", { signal });
    poller.stop();
    rateLimiter.destroy();
    await deviceTypeCache.saveToDisk();
    await session.logout();
    session.destroy();
    await mcpServer.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
