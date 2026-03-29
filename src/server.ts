import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import type { SessionManager } from "./ccu/session.js";
import type { RateLimiter } from "./middleware/rate-limiter.js";
import type { Logger } from "./logger.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerReadTools } from "./tools/read.js";

export interface ServerDeps {
  config: AppConfig;
  session: SessionManager;
  rateLimiter: RateLimiter;
  logger: Logger;
}

export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    {
      name: "debmatic-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: true },
        prompts: {},
        logging: {},
      },
    },
  );

  registerDiscoveryTools(server, deps);
  registerReadTools(server, deps);

  return server;
}
