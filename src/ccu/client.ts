import type { CcuConfig, CcuRpcRequest, CcuRpcResponse } from "./types.js";
import { CcuError, mapCcuError, mapNetworkError } from "../middleware/error-mapper.js";
import type { Logger } from "../logger.js";

let requestCounter = 0;

export class CcuClient {
  private readonly baseUrl: string;
  private readonly config: CcuConfig;
  private readonly logger: Logger;

  constructor(config: CcuConfig, logger: Logger) {
    this.config = config;
    const protocol = config.https ? "https" : "http";
    this.baseUrl = `${protocol}://${config.host}:${config.port}/api/homematic.cgi`;
    this.logger = logger;
  }

  async call(method: string, params: Record<string, unknown>, timeout?: number): Promise<unknown> {
    const id = String(++requestCounter);
    const effectiveTimeout = timeout ?? this.config.timeout;

    const request: CcuRpcRequest = { id, method, params };

    this.logger.debug("ccu_request", { method, id });

    const start = Date.now();
    let response: CcuRpcResponse;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), effectiveTimeout);

      const httpResponse = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const text = await httpResponse.text();

      try {
        response = JSON.parse(text) as CcuRpcResponse;
      } catch {
        throw new CcuError({
          error: "CCU_ERROR",
          code: 0,
          message: `Invalid JSON response from CCU: ${text.slice(0, 200)}`,
          hint: "CCU returned invalid JSON. It may be overloaded or misconfigured.",
          ccuMethod: method,
        });
      }
    } catch (err) {
      if (err instanceof CcuError) throw err;

      const duration = Date.now() - start;
      this.logger.error("ccu_request_failed", { method, duration_ms: duration, error: (err as Error).message });
      throw new CcuError(mapNetworkError(err as Error, method));
    }

    const duration = Date.now() - start;

    if (response.error) {
      this.logger.debug("ccu_response_error", { method, duration_ms: duration, code: response.error.code });
      throw new CcuError(mapCcuError(response.error, method));
    }

    this.logger.debug("ccu_response_ok", { method, duration_ms: duration });
    return response.result;
  }
}
