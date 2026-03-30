import { createHash } from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { SessionManager } from "../ccu/session.js";
import type { RateLimiter } from "../middleware/rate-limiter.js";
import type { Logger } from "../logger.js";

interface PollableResource {
  uri: string;
  method: string;
}

const POLLABLE: PollableResource[] = [
  { uri: "homematic://devices", method: "Device.listAllDetail" },
  { uri: "homematic://rooms", method: "Room.getAll" },
  { uri: "homematic://functions", method: "Subsection.getAll" },
  { uri: "homematic://programs", method: "Program.getAll" },
  { uri: "homematic://sysvars", method: "SysVar.getAll" },
];

export class ResourcePoller {
  private hashes = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly server: Server,
    private readonly session: SessionManager,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: Logger,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.poll(), this.intervalMs * 1000);
    this.logger.info("resource_poller_started", { interval_s: this.intervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    for (const resource of POLLABLE) {
      try {
        await this.rateLimiter.acquire();
        const data = await this.session.call(resource.method);
        const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");

        const prev = this.hashes.get(resource.uri);
        this.hashes.set(resource.uri, hash);

        if (prev && prev !== hash) {
          this.logger.info("resource_changed", { uri: resource.uri });
          await this.server.sendResourceListChanged();
        }

        this.consecutiveFailures = 0;
      } catch (err) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures <= 1) {
          this.logger.warn("resource_poll_failed", { uri: resource.uri, error: (err as Error).message });
        }
        if (this.consecutiveFailures === 5) {
          this.logger.error("resource_poll_repeated_failures", { count: 5 });
        }
        // Skip this resource, continue polling others
      }
    }
  }
}
