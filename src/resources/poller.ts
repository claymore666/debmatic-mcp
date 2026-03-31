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

// Backoff: 1×, 2×, 4×, 8×, capped at 10× the base interval
const MAX_BACKOFF_MULTIPLIER = 10;

export class ResourcePoller {
  private hashes = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Counts consecutive poll cycles where at least one resource failed.
  // Used to apply exponential backoff on the next schedule.
  private consecutiveFailures = 0;

  constructor(
    private readonly server: Server,
    private readonly session: SessionManager,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: Logger,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.schedule(this.intervalMs * 1000);
    this.logger.info("resource_poller_started", { interval_s: this.intervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.poll().finally(() => {
        if (this.timer !== null) {
          // still running (not stopped)
          const multiplier = this.consecutiveFailures > 0
            ? Math.min(Math.pow(2, this.consecutiveFailures - 1), MAX_BACKOFF_MULTIPLIER)
            : 1;
          this.schedule(this.intervalMs * 1000 * multiplier);
        }
      });
    }, delayMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    let anyChanged = false;
    let anyFailed = false;

    for (const resource of POLLABLE) {
      try {
        await this.rateLimiter.acquire();
        const data = await this.session.call(resource.method);
        const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");

        const prev = this.hashes.get(resource.uri);
        this.hashes.set(resource.uri, hash);

        if (prev && prev !== hash) {
          this.logger.info("resource_changed", { uri: resource.uri });
          anyChanged = true;
        }
      } catch (err) {
        anyFailed = true;
        this.logger.warn("resource_poll_failed", { uri: resource.uri, error: (err as Error).message });
      }
    }

    if (anyFailed) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures === 5) {
        this.logger.error("resource_poll_repeated_failures", { count: 5 });
      }
    } else {
      this.consecutiveFailures = 0;
    }

    if (anyChanged) {
      await this.server.sendResourceListChanged();
    }
  }
}
