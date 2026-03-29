import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerDeps } from "../server.js";
import { CcuError } from "../middleware/error-mapper.js";
import { withRetry } from "../middleware/retry.js";
import { resolveInterface } from "../middleware/resolver.js";

function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerReadTools(server: McpServer, deps: ServerDeps): void {
  registerGetValue(server, deps);
  registerGetValues(server, deps);
  registerGetParamset(server, deps);
}

function registerGetValue(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "get_value",
    {
      title: "Get Value",
      description:
        "Read a single datapoint value from a device channel. " +
        "Only address and valueKey are required — interface is auto-resolved. " +
        "Use list_devices to find addresses, describe_device_type to find valid valueKeys.",
      inputSchema: {
        address: z.string().describe("Channel address (e.g. '000A1BE9A71F15:1')"),
        valueKey: z.string().describe("Datapoint name (e.g. 'STATE', 'LEVEL', 'ACTUAL_TEMPERATURE')"),
        interface: z.string().optional().describe("Interface name override (auto-resolved if omitted)"),
      },
    },
    async (args) => {
      const { session, rateLimiter, logger } = deps;
      const start = Date.now();

      try {
        const iface = args.interface ?? await resolveInterface(args.address, session, rateLimiter, logger);

        await rateLimiter.acquire();
        const value = await withRetry(
          () => session.call("Interface.getValue", {
            interface: iface,
            address: args.address,
            valueKey: args.valueKey,
          }),
          "Interface.getValue",
          logger,
        );

        logger.info("tool_call", { tool: "get_value", duration_ms: Date.now() - start, status: "ok", address: args.address });
        return toolResult({ address: args.address, valueKey: args.valueKey, value });
      } catch (err) {
        logger.info("tool_call", { tool: "get_value", duration_ms: Date.now() - start, status: "error" });
        if (err instanceof CcuError) return err.toMcpError();
        throw err;
      }
    },
  );
}

function registerGetValues(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "get_values",
    {
      title: "Get Values (Bulk)",
      description:
        "Read datapoint values for multiple channels at once via HM Script. " +
        "Provide either a list of channel addresses, or filter by room or function name.",
      inputSchema: {
        channels: z.array(z.string()).optional().describe("Array of channel addresses to read"),
        room: z.string().optional().describe("Room name — read all channels in this room"),
        function: z.string().optional().describe("Function name — read all channels in this function group"),
      },
    },
    async (args) => {
      const { session, rateLimiter, logger } = deps;
      const start = Date.now();

      try {
        // Build HM Script to collect values
        let script: string;

        if (args.channels && args.channels.length > 0) {
          const addrList = args.channels.map((a) => `"${a}"`).join(",");
          script = buildGetValuesScript(`{${addrList}}`, "addresses");
        } else if (args.room) {
          script = buildGetValuesScript(`"${args.room}"`, "room");
        } else if (args.function) {
          script = buildGetValuesScript(`"${args.function}"`, "function");
        } else {
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "INVALID_INPUT",
              message: "Provide either channels, room, or function parameter.",
              hint: "At least one filter is required to avoid reading all devices.",
            }) }],
          };
        }

        await rateLimiter.acquire();
        const result = await withRetry(
          () => session.call("ReGa.runScript", { script }, deps.config.ccu.scriptTimeout),
          "ReGa.runScript",
          logger,
        );

        logger.info("tool_call", { tool: "get_values", duration_ms: Date.now() - start, status: "ok" });
        return toolResult(typeof result === "string" ? tryParseJson(result) : result);
      } catch (err) {
        logger.info("tool_call", { tool: "get_values", duration_ms: Date.now() - start, status: "error" });
        if (err instanceof CcuError) return err.toMcpError();
        throw err;
      }
    },
  );
}

function buildGetValuesScript(filter: string, filterType: "addresses" | "room" | "function"): string {
  if (filterType === "addresses") {
    return `
      string addresses = ${filter};
      boolean first = true;
      Write("[");
      string addr;
      foreach(addr, addresses) {
        object ch = dom.GetObject(addr);
        if (ch) {
          if (!first) { Write(","); } first = false;
          Write('{"address":"' # addr # '","name":"' # ch.Name() # '","datapoints":{');
          boolean firstDp = true;
          string dpId;
          foreach(dpId, ch.DPs()) {
            object dp = dom.GetObject(dpId);
            if (dp) {
              if (!firstDp) { Write(","); } firstDp = false;
              Write('"' # dp.HssType() # '":' # dp.Value());
            }
          }
          Write("}}");
        }
      }
      Write("]");
    `;
  }

  const objectLookup = filterType === "room"
    ? `dom.GetObject(ID_ROOMS).Get(${filter})`
    : `dom.GetObject(ID_FUNCTIONS).Get(${filter})`;

  return `
    object container = ${objectLookup};
    boolean first = true;
    Write("[");
    if (container) {
      string chId;
      foreach(chId, container.Channels()) {
        object ch = dom.GetObject(chId);
        if (ch) {
          if (!first) { Write(","); } first = false;
          Write('{"address":"' # ch.Address() # '","name":"' # ch.Name() # '","datapoints":{');
          boolean firstDp = true;
          string dpId;
          foreach(dpId, ch.DPs()) {
            object dp = dom.GetObject(dpId);
            if (dp) {
              if (!firstDp) { Write(","); } firstDp = false;
              Write('"' # dp.HssType() # '":' # dp.Value());
            }
          }
          Write("}}");
        }
      }
    }
    Write("]");
  `;
}

function registerGetParamset(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    "get_paramset",
    {
      title: "Get Paramset",
      description:
        "Read all parameters for a channel (VALUES, MASTER, or LINK). " +
        "Interface is auto-resolved from the address.",
      inputSchema: {
        address: z.string().describe("Channel address (e.g. '000A1BE9A71F15:1')"),
        paramsetKey: z.enum(["VALUES", "MASTER", "LINK"]).describe("Paramset to read"),
        interface: z.string().optional().describe("Interface name override (auto-resolved if omitted)"),
      },
    },
    async (args) => {
      const { session, rateLimiter, logger } = deps;
      const start = Date.now();

      try {
        const iface = args.interface ?? await resolveInterface(args.address, session, rateLimiter, logger);

        await rateLimiter.acquire();
        const result = await withRetry(
          () => session.call("Interface.getParamset", {
            interface: iface,
            address: args.address,
            paramsetKey: args.paramsetKey,
          }),
          "Interface.getParamset",
          logger,
        );

        logger.info("tool_call", { tool: "get_paramset", duration_ms: Date.now() - start, status: "ok" });
        return toolResult({ address: args.address, paramsetKey: args.paramsetKey, params: result });
      } catch (err) {
        logger.info("tool_call", { tool: "get_paramset", duration_ms: Date.now() - start, status: "error" });
        if (err instanceof CcuError) return err.toMcpError();
        throw err;
      }
    },
  );
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
