import { describe, it, expect, beforeEach } from "vitest";
import { updateDeviceList, resolveType, getDeviceType, clearResolver } from "../../src/middleware/resolver.js";
import { DeviceTypeCache } from "../../src/cache/device-type-cache.js";
import { Logger } from "../../src/logger.js";
import type { CcuDevice } from "../../src/ccu/types.js";

const logger = new Logger("error");

const mockDevices: CcuDevice[] = [
  {
    id: "1", name: "Thermostat Wohnzimmer", address: "000A1BE9A71F15",
    interface: "HmIP-RF", type: "HmIP-eTRV-2", operateGroupOnly: "false", isReady: "true",
    channels: [
      { id: "10", name: "Ch0", address: "000A1BE9A71F15:0", deviceId: "1", index: 0,
        partnerId: "", mode: "", category: "", isReady: true, isUsable: true, isVisible: true,
        isLogged: false, isLogable: false, isReadable: true, isWritable: false, isEventable: true,
        isAesAvailable: false, isVirtual: false, channelType: "MAINTENANCE" },
      { id: "11", name: "Ch1", address: "000A1BE9A71F15:1", deviceId: "1", index: 1,
        partnerId: "", mode: "", category: "", isReady: true, isUsable: true, isVisible: true,
        isLogged: false, isLogable: true, isReadable: true, isWritable: true, isEventable: true,
        isAesAvailable: false, isVirtual: false, channelType: "HEATING_CLIMATECONTROL_TRANSCEIVER" },
    ],
  },
  {
    id: "2", name: "Fensterkontakt", address: "00109D898C36B0",
    interface: "HmIP-RF", type: "HmIP-SWDO-I", operateGroupOnly: "false", isReady: "true",
    channels: [],
  },
];

describe("resolver", () => {
  beforeEach(() => {
    clearResolver();
  });

  describe("updateDeviceList + getDeviceType", () => {
    it("resolves device type from address", () => {
      updateDeviceList(mockDevices);
      expect(getDeviceType("000A1BE9A71F15")).toBe("HmIP-eTRV-2");
      expect(getDeviceType("00109D898C36B0")).toBe("HmIP-SWDO-I");
    });

    it("returns undefined for unknown address", () => {
      updateDeviceList(mockDevices);
      expect(getDeviceType("UNKNOWN")).toBeUndefined();
    });
  });

  describe("resolveType", () => {
    it("resolves FLOAT to double", () => {
      updateDeviceList(mockDevices);
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      (cache as any).cache.set("HmIP-eTRV-2", {
        interface: "HmIP-RF",
        channels: {
          "1": {
            type: "HEATING",
            paramsets: {
              VALUES: {
                SET_POINT_TEMPERATURE: { type: "FLOAT", operations: 7 },
                ACTUAL_TEMPERATURE: { type: "FLOAT", operations: 5 },
                LEVEL: { type: "FLOAT", operations: 5 },
              },
            },
          },
        },
      });

      expect(resolveType("000A1BE9A71F15:1", "SET_POINT_TEMPERATURE", cache)).toBe("double");
      expect(resolveType("000A1BE9A71F15:1", "ACTUAL_TEMPERATURE", cache)).toBe("double");
    });

    it("resolves BOOL to bool", () => {
      updateDeviceList(mockDevices);
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      (cache as any).cache.set("HmIP-eTRV-2", {
        interface: "HmIP-RF",
        channels: {
          "0": {
            type: "MAINTENANCE",
            paramsets: {
              VALUES: {
                LOWBAT: { type: "BOOL", operations: 5 },
                UNREACH: { type: "BOOL", operations: 5 },
              },
            },
          },
        },
      });

      expect(resolveType("000A1BE9A71F15:0", "LOWBAT", cache)).toBe("bool");
    });

    it("resolves INTEGER to int", () => {
      updateDeviceList(mockDevices);
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      (cache as any).cache.set("HmIP-eTRV-2", {
        interface: "HmIP-RF",
        channels: {
          "1": {
            type: "HEATING",
            paramsets: { VALUES: { BOOST_TIME: { type: "INTEGER", operations: 5 } } },
          },
        },
      });

      expect(resolveType("000A1BE9A71F15:1", "BOOST_TIME", cache)).toBe("int");
    });

    it("resolves ENUM to int", () => {
      updateDeviceList(mockDevices);
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      (cache as any).cache.set("HmIP-eTRV-2", {
        interface: "HmIP-RF",
        channels: {
          "1": {
            type: "HEATING",
            paramsets: { VALUES: { CONTROL_MODE: { type: "ENUM", operations: 7 } } },
          },
        },
      });

      expect(resolveType("000A1BE9A71F15:1", "CONTROL_MODE", cache)).toBe("int");
    });

    it("returns undefined for unknown device type", () => {
      updateDeviceList(mockDevices);
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      expect(resolveType("000A1BE9A71F15:1", "SOMETHING", cache)).toBeUndefined();
    });

    it("returns undefined when resolver not populated", () => {
      const cache = new DeviceTypeCache("/tmp", 86400, logger);
      expect(resolveType("UNKNOWN:1", "STATE", cache)).toBeUndefined();
    });
  });
});
