import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DeviceTypeCache } from "../../src/cache/device-type-cache.js";
import { Logger } from "../../src/logger.js";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DeviceTypeCacheFile } from "../../src/cache/types.js";
import { CACHE_VERSION } from "../../src/cache/types.js";

const logger = new Logger("error");

describe("DeviceTypeCache", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "debmatic-cache-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    expect(cache.size()).toBe(0);
    expect(cache.has("HmIP-eTRV-2")).toBe(false);
    expect(cache.get("HmIP-eTRV-2")).toBeUndefined();
  });

  it("loadFromDisk returns false for missing file", async () => {
    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    expect(await cache.loadFromDisk()).toBe(false);
  });

  it("saves and loads cache to/from disk", async () => {
    const cache1 = new DeviceTypeCache(tempDir, 86400, logger);

    // Manually populate cache via the internal Map (simulating warm)
    const testType = {
      interface: "HmIP-RF",
      channels: {
        "1": {
          type: "HEATING",
          paramsets: {
            VALUES: {
              ACTUAL_TEMPERATURE: { type: "FLOAT", operations: 5 },
            },
          },
        },
      },
    };

    // Use queryAndCache-like approach — set directly for test
    (cache1 as any).cache.set("HmIP-eTRV-2", testType);
    await cache1.saveToDisk();

    // Load in a new instance
    const cache2 = new DeviceTypeCache(tempDir, 86400, logger);
    const valid = await cache2.loadFromDisk();

    expect(valid).toBe(true);
    expect(cache2.size()).toBe(1);
    expect(cache2.has("HmIP-eTRV-2")).toBe(true);
    expect(cache2.get("HmIP-eTRV-2")!.interface).toBe("HmIP-RF");
    expect(cache2.get("HmIP-eTRV-2")!.channels["1"]!.paramsets.VALUES!.ACTUAL_TEMPERATURE.type).toBe("FLOAT");
  });

  it("returns false for expired cache", async () => {
    const cacheFile: DeviceTypeCacheFile = {
      version: CACHE_VERSION,
      timestamp: new Date(Date.now() - 100_000 * 1000).toISOString(), // 100k seconds ago
      ttl: 86400,
      types: { "HmIP-TEST": { interface: "HmIP-RF", channels: {} } },
    };
    await writeFile(join(tempDir, "device-type-cache.json"), JSON.stringify(cacheFile));

    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    const valid = await cache.loadFromDisk();

    expect(valid).toBe(false);
    // But data should still be loaded (serve stale)
    expect(cache.size()).toBe(1);
    expect(cache.has("HmIP-TEST")).toBe(true);
  });

  it("returns false for wrong version", async () => {
    const cacheFile = {
      version: 999,
      timestamp: new Date().toISOString(),
      ttl: 86400,
      types: { "HmIP-TEST": { interface: "HmIP-RF", channels: {} } },
    };
    await writeFile(join(tempDir, "device-type-cache.json"), JSON.stringify(cacheFile));

    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    const valid = await cache.loadFromDisk();

    expect(valid).toBe(false);
    expect(cache.size()).toBe(0); // Wrong version = don't load
  });

  it("handles corrupt cache file gracefully", async () => {
    await writeFile(join(tempDir, "device-type-cache.json"), "not valid json{{{");

    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    const valid = await cache.loadFromDisk();

    expect(valid).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it("getAll returns all types as object", async () => {
    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    (cache as any).cache.set("TypeA", { interface: "A", channels: {} });
    (cache as any).cache.set("TypeB", { interface: "B", channels: {} });

    const all = cache.getAll();
    expect(Object.keys(all)).toEqual(["TypeA", "TypeB"]);
  });

  it("atomic write leaves no .tmp file on success", async () => {
    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    (cache as any).cache.set("Test", { interface: "RF", channels: {} });
    await cache.saveToDisk();

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(tempDir);
    expect(files).toContain("device-type-cache.json");
    expect(files).not.toContain("device-type-cache.json.tmp");
  });

  it("isWarming returns false by default", () => {
    const cache = new DeviceTypeCache(tempDir, 86400, logger);
    expect(cache.isWarming()).toBe(false);
  });
});
