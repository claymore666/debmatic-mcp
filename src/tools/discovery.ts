import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerDeps } from "../server.js";
import type { CcuDevice } from "../ccu/types.js";
import { CcuError } from "../middleware/error-mapper.js";
import { withRetry } from "../middleware/retry.js";

export function registerDiscoveryTools(server: McpServer, deps: ServerDeps): void {
  registerListDevices(server, deps);
}

function registerListDevices(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "list_devices",
    {
      title: "List Devices",
      description:
        "List all devices with their channels, types, and addresses. " +
        "Optional filters: room, function, type, name. " +
        "Use this first to discover device addresses for get_value/set_value.",
      inputSchema: {
        room: z.string().optional().describe("Filter by room name (exact match)"),
        function: z.string().optional().describe("Filter by function group name (exact match)"),
        type: z.string().optional().describe("Filter by device type (exact match, e.g. 'HmIP-eTRV-2')"),
        name: z.string().optional().describe("Filter by device/channel name (substring, case-insensitive)"),
      },
    },
    async (args) => {
      const { session, rateLimiter, logger } = deps;
      const start = Date.now();

      try {
        await rateLimiter.acquire();
        const result = await withRetry(
          () => session.call("Device.listAllDetail"),
          "Device.listAllDetail",
          logger,
        );

        let devices = result as CcuDevice[];

        // Apply room/function filters
        if (args.room || args.function) {
          const channelIds = new Set<string>();

          if (args.room) {
            await rateLimiter.acquire();
            const rooms = await withRetry(
              () => session.call("Room.getAll"),
              "Room.getAll",
              logger,
            ) as Array<{ id: string; name: string; channelIds: string[] }>;

            const room = rooms.find((r) => r.name === args.room);
            if (room) {
              for (const id of room.channelIds) channelIds.add(id);
            }
          }

          if (args.function) {
            await rateLimiter.acquire();
            const functions = await withRetry(
              () => session.call("Subsection.getAll"),
              "Subsection.getAll",
              logger,
            ) as Array<{ id: string; name: string; channelIds: string[] }>;

            const func = functions.find((f) => f.name === args.function);
            if (func) {
              for (const id of func.channelIds) channelIds.add(id);
            }
          }

          if (channelIds.size > 0) {
            devices = devices.filter((d) =>
              d.channels.some((ch) => channelIds.has(ch.id)),
            );
          } else {
            devices = [];
          }
        }

        if (args.type) {
          devices = devices.filter((d) => d.type === args.type);
        }

        if (args.name) {
          const needle = args.name.toLowerCase();
          devices = devices.filter(
            (d) =>
              d.name.toLowerCase().includes(needle) ||
              d.channels.some((ch) => ch.name.toLowerCase().includes(needle)),
          );
        }

        const duration = Date.now() - start;
        logger.info("tool_call", { tool: "list_devices", duration_ms: duration, status: "ok", deviceCount: devices.length });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(devices, null, 2) }],
        };
      } catch (err) {
        const duration = Date.now() - start;
        logger.info("tool_call", { tool: "list_devices", duration_ms: duration, status: "error" });
        if (err instanceof CcuError) return err.toMcpError();
        throw err;
      }
    },
  );
}
