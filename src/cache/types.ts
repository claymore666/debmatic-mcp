export interface DeviceTypeCacheFile {
  version: number;
  timestamp: string;
  ttl: number;
  types: Record<string, CachedDeviceType>;
}

export interface CachedDeviceType {
  interface: string;
  channels: Record<string, CachedChannelSchema>;
}

export interface CachedChannelSchema {
  type: string;
  paramsets: Record<string, Record<string, CachedParamDescription>>;
}

export interface CachedParamDescription {
  type: string;
  operations: number;
  min?: number;
  max?: number;
  default?: unknown;
  unit?: string;
  valueList?: string[];
}

export const CACHE_VERSION = 1;
