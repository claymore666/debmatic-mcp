import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SessionManager } from "../../src/ccu/session.js";
import { createLogger } from "../../src/logger.js";
import type { CcuConfig, CcuDevice } from "../../src/ccu/types.js";

// Skip if CCU_HOST not set (CI environment)
const CCU_HOST = process.env.CCU_HOST;
const describeIf = CCU_HOST ? describe : describe.skip;

describeIf("CCU Integration (against debmatic)", () => {
  const config: CcuConfig = {
    host: CCU_HOST!,
    port: parseInt(process.env.CCU_PORT || "80", 10),
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
    const result = await session.call("Device.listAllDetail");
    const devices = result as CcuDevice[];

    expect(Array.isArray(devices)).toBe(true);
    expect(devices.length).toBeGreaterThan(0);

    const device = devices[0]!;
    expect(device).toHaveProperty("id");
    expect(device).toHaveProperty("name");
    expect(device).toHaveProperty("address");
    expect(device).toHaveProperty("interface");
    expect(device).toHaveProperty("type");
    expect(device).toHaveProperty("channels");
    expect(Array.isArray(device.channels)).toBe(true);
  });

  it("Interface.listInterfaces returns interfaces", async () => {
    const result = await session.call("Interface.listInterfaces");
    const interfaces = result as Array<{ name: string }>;

    expect(Array.isArray(interfaces)).toBe(true);
    expect(interfaces.length).toBeGreaterThan(0);
  });

  it("Room.getAll returns array", async () => {
    const result = await session.call("Room.getAll");
    expect(Array.isArray(result)).toBe(true);
  });

  it("Interface.getValue reads a thermostat temperature", async () => {
    // Find a thermostat (HmIP-eTRV-2) which has ACTUAL_TEMPERATURE on channel 1
    const devices = await session.call("Device.listAllDetail") as CcuDevice[];
    const thermostat = devices.find((d) => d.type.startsWith("HmIP-eTRV"));

    if (!thermostat) {
      console.log("No thermostat found, skipping getValue test");
      return;
    }

    const value = await session.call("Interface.getValue", {
      interface: thermostat.interface,
      address: thermostat.address + ":1",
      valueKey: "ACTUAL_TEMPERATURE",
    });

    // CCU returns values as strings or numbers depending on interface
    const numValue = Number(value);
    expect(isNaN(numValue)).toBe(false);
    expect(numValue).toBeGreaterThan(-10);
    expect(numValue).toBeLessThan(50);
  });
});
