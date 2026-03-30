# debmatic-mcp

Talk to your HomeMatic smart home from Claude, Cursor, or any MCP client.

debmatic-mcp connects to the CCU's built-in JSON-RPC API and exposes your devices, rooms, programs, and system variables as MCP tools. No addons, no XML-API, no cloud — just a direct connection to the CCU on your local network.

Built for [debmatic](https://github.com/alexreinert/debmatic) (HomeMatic on Debian) but works with any CCU3 or RaspberryMatic installation that exposes the standard `/api/homematic.cgi` endpoint.

## What can it do?

Ask your AI assistant things like:

- "What's the temperature in the bathroom?"
- "Are any windows open?"
- "Set the living room heating to 21 degrees"
- "Show me all devices with low battery"
- "What's the gas meter reading?"

The MCP server handles device discovery, type resolution, session management, and value conversion — the AI just calls the tools.

## Installation

### Claude Code (recommended)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "debmatic": {
      "command": "node",
      "args": ["/path/to/debmatic-mcp/dist/index.js", "--stdio"],
      "env": {
        "CCU_HOST": "your-ccu-hostname",
        "CCU_PASSWORD": "your-password"
      }
    }
  }
}
```

Or use the CLI:

```bash
claude mcp add debmatic -- node /path/to/debmatic-mcp/dist/index.js --stdio
```

### Docker

```bash
docker run -d \
  --name debmatic-mcp \
  -e CCU_HOST=your-ccu-hostname \
  -e CCU_PASSWORD=your-password \
  -v debmatic-data:/data \
  -p 3000:3000 \
  debmatic-mcp
```

The server generates a bearer token on first startup. Grab it with:

```bash
docker logs debmatic-mcp 2>&1 | grep -oP 'Generated auth token: \K\S+'
```

### From source

```bash
git clone https://github.com/claymore666/debmatic-mcp.git
cd debmatic-mcp
npm ci
npm run build
```

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CCU_HOST` | required | Hostname or IP of your CCU |
| `CCU_PASSWORD` | required | CCU admin password |
| `CCU_USER` | `Admin` | CCU username |
| `CCU_PORT` | `80` | API port (`443` when using HTTPS) |
| `CCU_HTTPS` | `false` | Connect via HTTPS (self-signed certs supported) |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, or `debug` |
| `CACHE_DIR` | `/data` | Where to store device type cache and session |
| `CACHE_TTL` | `86400` | Cache lifetime in seconds (24h) |

## Tools

18 tools organized by what you'd actually want to do:

**Find things** — `list_devices`, `list_rooms`, `list_functions`, `list_interfaces`, `list_programs`, `list_system_variables`, `describe_device_type`

**Read state** — `get_value`, `get_values` (bulk), `get_paramset`

**Change things** — `set_value`, `put_paramset`, `set_system_variable`, `execute_program`

**Check health** — `get_service_messages`, `get_system_info`

**Other** — `help` (context-aware), `run_script` (raw HomeMatic Script)

Most tools auto-resolve the interface and value types from the device address — you don't need to know whether a device is on BidCos-RF or HmIP-RF.

## How it works

The server talks to the CCU's JSON-RPC API (the same one the WebUI uses). On startup it:

1. Logs in and caches the session (reused across restarts)
2. Loads the device type cache from disk (or warms it in the background)
3. Starts the MCP server on stdio or HTTP

Device type schemas are cached locally so the AI can look up valid parameters, types, and value ranges without hitting the CCU every time.

Values come back as native types — `21.5` not `"21.500000"`, `true` not `"true"`.

## Tested devices

This has been tested against a production debmatic installation with:

- HmIP-eTRV-2 / eTRV-2 I9F (radiator thermostats)
- HmIP-STHD (wall thermostats with humidity)
- HmIP-WTH-2 (wall thermostats)
- HmIP-SWDO-I (door/window contacts)
- HmIP-STHO (outdoor temperature/humidity)
- HmIP-ESI (energy/gas meter)
- HmIP-FALMOT-C12 (floor heating controller)
- HmIP-HEATING (virtual heating groups)
- HmIP-WRCC2 (wall remote)
- HM-PB-6-WM55 (BidCos 6-button remote)
- RPI-RF-MOD (radio module)

Other device types should work too — the server queries the CCU for parameter descriptions rather than maintaining a static device database.

## Related projects

- [debmatic](https://github.com/alexreinert/debmatic) — Run HomeMatic on Debian, Ubuntu, Raspberry Pi OS, Armbian
- [OCCU](https://github.com/eq-3/occu) — Open CCU SDK by eQ-3 (the upstream HomeMatic software)
- [RaspberryMatic](https://github.com/jens-maus/RaspberryMatic) — HomeMatic on Raspberry Pi
- [MCP](https://modelcontextprotocol.io/) — Model Context Protocol specification

## License

MIT
