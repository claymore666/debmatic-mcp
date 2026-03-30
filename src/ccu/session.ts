import type { CcuConfig } from "./types.js";
import { CcuClient } from "./client.js";
import { CcuError } from "../middleware/error-mapper.js";
import type { Logger } from "../logger.js";

const SESSION_RENEW_INTERVAL = 60_000; // Renew every 60s

export class SessionManager {
  private readonly client: CcuClient;
  private readonly config: CcuConfig;
  private readonly logger: Logger;
  private sessionId: string | null = null;
  private renewTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: CcuConfig, logger: Logger) {
    this.config = config;
    this.client = new CcuClient(config, logger);
    this.logger = logger;
  }

  async login(): Promise<void> {
    const result = await this.client.call("Session.login", {
      username: this.config.user,
      password: this.config.password,
    });

    this.sessionId = result as string;
    this.logger.info("session_login", { sessionActive: true });
    this.startRenewal();
  }

  async logout(): Promise<void> {
    this.stopRenewal();
    if (this.sessionId) {
      try {
        await this.client.call("Session.logout", { _session_id_: this.sessionId });
        this.logger.info("session_logout");
      } catch {
        this.logger.warn("session_logout_failed");
      }
      this.sessionId = null;
    }
  }

  getSessionId(): string {
    if (!this.sessionId) {
      throw new CcuError({
        error: "AUTH",
        code: 0,
        message: "No active session",
        hint: "Session not initialized. The server may still be starting.",
      });
    }
    return this.sessionId;
  }

  /**
   * Execute a CCU method with automatic session handling.
   * On auth error (code 400), re-login once and retry.
   */
  async call(method: string, params: Record<string, unknown> = {}, timeout?: number): Promise<unknown> {
    const paramsWithSession = { ...params, _session_id_: this.getSessionId() };

    try {
      return await this.client.call(method, paramsWithSession, timeout);
    } catch (err) {
      if (err instanceof CcuError && err.structured.error === "AUTH") {
        this.logger.warn("session_expired", { method });
        await this.login();
        const retryParams = { ...params, _session_id_: this.getSessionId() };
        return this.client.call(method, retryParams, timeout);
      }
      throw err;
    }
  }

  /**
   * Execute a CCU method that requires no session (e.g. Interface.isPresent).
   */
  async callNoSession(method: string, params: Record<string, unknown> = {}, timeout?: number): Promise<unknown> {
    return this.client.call(method, params, timeout);
  }

  isLoggedIn(): boolean {
    return this.sessionId !== null;
  }

  private startRenewal(): void {
    this.stopRenewal();
    this.renewTimer = setInterval(async () => {
      if (!this.sessionId) return;
      try {
        await this.client.call("Session.renew", { _session_id_: this.sessionId });
        this.logger.debug("session_renewed");
      } catch {
        this.logger.warn("session_renew_failed");
        try {
          await this.login();
        } catch (loginErr) {
          this.logger.error("session_relogin_failed", { error: (loginErr as Error).message });
        }
      }
    }, SESSION_RENEW_INTERVAL);
    this.renewTimer.unref();
  }

  private stopRenewal(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  destroy(): void {
    this.stopRenewal();
  }
}
