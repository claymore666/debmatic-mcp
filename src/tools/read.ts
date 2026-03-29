import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerDeps } from "../server.js";
import { CcuError } from "../middleware/error-mapper.js";
import { withRetry } from "../middleware/retry.js";
import type { SessionManager } from "../ccu/session.js";
import type { RateLimiter } from "../middleware/rate-limiter.js";
import type { Logger } from "../logger.js";

export function registerReadTools(server: McpServer, deps: ServerDeps): void {
  registerGetValue(server, deps);
}

function registerGetValue(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "get_value",
    {
      title: "Get Value",
      description:
        "Read a single datapoint value from a device channel. " +
        "Only address and valueKey are required — interface is auto-resolved from the device list. " +
        "Use list_devices to find addresses, describe_device_type to find valid valueKeys.",
      inputSchema: {
        address: z.string().describe("Channel address (e.g. '000A1B2C3D4E5F:1'). Get from list_devices."),
        valueKey: z.string().describe("Datapoint name (e.g. 'STATE', 'LEVEL', 'SET_POINT_TEMPERATURE'). Get from describe_device_type."),
        interface: z.string().optional().describe("Interface name (e.g. 'HmIP-RF'). Auto-resolved if omitted."),
      },
    },
    async (args) => {
      const { session, rateLimiter, logger } = deps;
      const start = Date.now();

      try {
        // Resolve interface if not provided
        let iface = args.interface;
        if (!iface) {
          iface = await resolveInterface(args.address, session, rateLimiter, logger);
        }

        await rateLimiter.acquire();
        const value = await withRetry(
          () =>
            session.call("Interface.getValue", {
              interface: iface,
              address: args.address,
              valueKey: args.valueKey,
            }),
          "Interface.getValue",
          logger,
        );

        const duration = Date.now() - start;
        logger.info("tool_call", {
          tool: "get_value",
          duration_ms: duration,
          status: "ok",
          address: args.address,
          valueKey: args.valueKey,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ address: args.address, valueKey: args.valueKey, value }, null, 2),
          }],
        };
      } catch (err) {
        const duration = Date.now() - start;
        logger.info("tool_call", {
          tool: "get_value",
          duration_ms: duration,
          status: "error",
          address: args.address,
        });
        if (err instanceof CcuError) return err.toMcpError();
        throw err;
      }
    },
  );
}

// In-memory cache of device address → interface name
let interfaceMap: Map<string, string> | null = null;

async function resolveInterface(
  address: string,
  session: SessionManager,
  rateLimiter: RateLimiter,
  logger: Logger,
): Promise<string> {
  const deviceAddress = address.includes(":") ? address.split(":")[0]! : address;

  if (interfaceMap?.has(deviceAddress)) {
    return interfaceMap.get(deviceAddress)!;
  }

  // Fetch device list to build the map
  await rateLimiter.acquire();
  const devices = await withRetry(
    () => session.call("Device.listAllDetail"),
    "Device.listAllDetail",
    logger,
  ) as Array<{ address: string; interface: string }>;

  interfaceMap = new Map();
  for (const device of devices) {
    interfaceMap.set(device.address, device.interface);
  }

  const iface = interfaceMap.get(deviceAddress);
  if (!iface) {
    throw new CcuError({
      error: "NOT_FOUND",
      code: 0,
      message: `Cannot resolve interface for address: ${address}`,
      hint: "Address not found in device list. Call list_devices to discover valid addresses.",
    });
  }

  return iface;
}

export function clearInterfaceMap(): void {
  interfaceMap = null;
}
