import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SessionManager } from "../../src/ccu/session.js";
import { createLogger } from "../../src/logger.js";
import type { CcuConfig, CcuDevice } from "../../src/ccu/types.js";

const CCU_HOST = process.env.CCU_HOST;
const describeIf = CCU_HOST ? describe : describe.skip;

describeIf("CCU Integration (against debmatic)", () => {
  const config: CcuConfig = {
    host: CCU_HOST!,
    port: parseInt(process.env.CCU_PORT || "80", 10),
    https: process.env.CCU_HTTPS === "true",
    user: process.env.CCU_USER || "Admin",
    password: process.env.CCU_PASSWORD || "",
    timeout: 10_000,
    scriptTimeout: 30_000,
  };

  const logger = createLogger();
  let session: SessionManager;

  beforeAll(async () => {
    session = new SessionManager(config, logger);
    await session.login();
  });

  afterAll(async () => {
    await session.logout();
    session.destroy();
  });

  it("Session.login succeeds", () => {
    expect(session.isLoggedIn()).toBe(true);
  });

  it("Device.listAllDetail returns devices with expected shape", async () => {
    const devices = await session.call("Device.listAllDetail") as CcuDevice[];
    expect(Array.isArray(devices)).toBe(true);
    expect(devices.length).toBeGreaterThan(0);

    const device = devices[0]!;
    expect(device).toHaveProperty("id");
    expect(device).toHaveProperty("name");
    expect(device).toHaveProperty("address");
    expect(device).toHaveProperty("interface");
    expect(device).toHaveProperty("type");
    expect(device).toHaveProperty("channels");
  });

  it("Interface.listInterfaces returns interfaces", async () => {
    const interfaces = await session.call("Interface.listInterfaces") as Array<{ name: string }>;
    expect(Array.isArray(interfaces)).toBe(true);
    expect(interfaces.length).toBeGreaterThan(0);
  });

  it("Room.getAll returns array", async () => {
    expect(Array.isArray(await session.call("Room.getAll"))).toBe(true);
  });

  it("Subsection.getAll returns array", async () => {
    expect(Array.isArray(await session.call("Subsection.getAll"))).toBe(true);
  });

  it("Program.getAll returns array", async () => {
    expect(Array.isArray(await session.call("Program.getAll"))).toBe(true);
  });

  it("SysVar.getAll returns array", async () => {
    expect(Array.isArray(await session.call("SysVar.getAll"))).toBe(true);
  });

  it("Interface.getValue reads a thermostat temperature", async () => {
    const devices = await session.call("Device.listAllDetail") as CcuDevice[];
    const thermostat = devices.find((d) => d.type.startsWith("HmIP-eTRV"));
    if (!thermostat) { console.log("No thermostat found, skipping"); return; }

    const value = await session.call("Interface.getValue", {
      interface: thermostat.interface,
      address: thermostat.address + ":1",
      valueKey: "ACTUAL_TEMPERATURE",
    });

    const numValue = Number(value);
    expect(isNaN(numValue)).toBe(false);
    expect(numValue).toBeGreaterThan(-10);
    expect(numValue).toBeLessThan(50);
  });

  it("Interface.getParamsetDescription returns array of param descriptions", async () => {
    const devices = await session.call("Device.listAllDetail") as CcuDevice[];
    const device = devices.find((d) => d.interface === "HmIP-RF" && d.channels.length > 1);
    if (!device) { console.log("No HmIP device found, skipping"); return; }

    const desc = await session.call("Interface.getParamsetDescription", {
      interface: device.interface,
      address: device.channels[0]!.address,
      paramsetKey: "VALUES",
    });

    expect(Array.isArray(desc)).toBe(true);
    const params = desc as Array<{ ID: string; TYPE: string; OPERATIONS: string }>;
    if (params.length > 0) {
      expect(params[0]).toHaveProperty("ID");
      expect(params[0]).toHaveProperty("TYPE");
      expect(params[0]).toHaveProperty("OPERATIONS");
    }
  });

  it("CCU.getVersion returns firmware version", async () => {
    const version = await session.call("CCU.getVersion");
    expect(typeof version).toBe("string");
    expect((version as string).length).toBeGreaterThan(0);
  });

  it("ReGa.runScript executes and returns output", async () => {
    const result = await session.call("ReGa.runScript", {
      script: 'Write("hello from ReGa");',
    });
    expect(typeof result).toBe("string");
    expect((result as string)).toContain("hello from ReGa");
  });
});
