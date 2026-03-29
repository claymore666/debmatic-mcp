import type { SessionManager } from "../ccu/session.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { DeviceTypeCache } from "../cache/device-type-cache.js";
import type { Logger } from "../logger.js";
import type { CcuDevice } from "../ccu/types.js";
import { CcuError } from "./error-mapper.js";
import { withRetry } from "./retry.js";

// In-memory map of device address → interface name
let interfaceMap: Map<string, string> | null = null;
// In-memory map of device address → device type
let deviceTypeMap: Map<string, string> | null = null;
// In-memory device list for channel → device lookups
let deviceList: CcuDevice[] | null = null;

export async function resolveInterface(
  address: string,
  session: SessionManager,
  rateLimiter: RateLimiter,
  logger: Logger,
): Promise<string> {
  const deviceAddress = address.includes(":") ? address.split(":")[0]! : address;

  if (interfaceMap?.has(deviceAddress)) {
    return interfaceMap.get(deviceAddress)!;
  }

  await refreshDeviceList(session, rateLimiter, logger);

  const iface = interfaceMap!.get(deviceAddress);
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

export function resolveType(
  address: string,
  valueKey: string,
  cache: DeviceTypeCache,
): string | undefined {
  const deviceAddress = address.includes(":") ? address.split(":")[0]! : address;
  const channelIndex = address.includes(":") ? address.split(":")[1]! : "0";
  const deviceType = deviceTypeMap?.get(deviceAddress);

  if (!deviceType) return undefined;

  const cached = cache.get(deviceType);
  if (!cached) return undefined;

  const channel = cached.channels[channelIndex];
  if (!channel) return undefined;

  const param = channel.paramsets["VALUES"]?.[valueKey];
  if (!param) return undefined;

  // Map CCU types to Interface.setValue type parameter
  const typeMap: Record<string, string> = {
    BOOL: "bool",
    ACTION: "bool",
    FLOAT: "double",
    INTEGER: "int",
    ENUM: "int",
    STRING: "string",
  };

  return typeMap[param.type] || "string";
}

export function getDeviceType(address: string): string | undefined {
  const deviceAddress = address.includes(":") ? address.split(":")[0]! : address;
  return deviceTypeMap?.get(deviceAddress);
}

export function getDeviceList(): CcuDevice[] | null {
  return deviceList;
}

async function refreshDeviceList(
  session: SessionManager,
  rateLimiter: RateLimiter,
  logger: Logger,
): Promise<void> {
  await rateLimiter.acquire();
  const devices = await withRetry(
    () => session.call("Device.listAllDetail"),
    "Device.listAllDetail",
    logger,
  ) as CcuDevice[];

  interfaceMap = new Map();
  deviceTypeMap = new Map();
  deviceList = devices;

  for (const device of devices) {
    interfaceMap.set(device.address, device.interface);
    deviceTypeMap.set(device.address, device.type);
  }
}

/** Called when device list changes (e.g. after list_devices tool call). */
export function updateDeviceList(devices: CcuDevice[]): void {
  interfaceMap = new Map();
  deviceTypeMap = new Map();
  deviceList = devices;

  for (const device of devices) {
    interfaceMap.set(device.address, device.interface);
    deviceTypeMap.set(device.address, device.type);
  }
}

export function clearResolver(): void {
  interfaceMap = null;
  deviceTypeMap = null;
  deviceList = null;
}
