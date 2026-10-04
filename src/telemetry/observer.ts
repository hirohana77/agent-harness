import http from 'node:http';
import { URL } from 'node:url';
import { TrajectoryEvent, TrajectoryStreamObserver } from '../events/types.js';
import { TelemetryServer } from './server.js';
import { TelemetryObserverOptions } from './types.js';

export class TelemetryObserver implements TrajectoryStreamObserver {
  public readonly name = 'telemetry';
  private server?: TelemetryServer;
  private url?: string;
  private authKey?: string;
  private queue: TrajectoryEvent[] = [];
  private isFlushing = false;
  private flushTimer?: NodeJS.Timeout;
  private batchSize: number;
  private flushIntervalMs: number;

  constructor(options?: TelemetryObserverOptions) {
    this.server = options?.server;
    this.url = options?.url;
    this.authKey = options?.authKey;
    this.batchSize = options?.batchSize ?? 10;
    this.flushIntervalMs = options?.flushIntervalMs ?? 200;

    if (this.url) {
      this.flushTimer = setInterval(() => {
        this.flushQueue().catch(() => {});
      }, this.flushIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  public async onEvent(event: TrajectoryEvent): Promise<void> {
    if (this.server) {
      this.server.ingest(event);
      return;
    }

    if (this.url) {
      this.queue.push(event);
      if (this.queue.length >= this.batchSize) {
        await this.flushQueue();
      }
    }
  }

  public async flush(): Promise<void> {
    await this.flushQueue();
  }

  public async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flushQueue();
  }

  private async flushQueue(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0 || !this.url) {
      return;
    }

    this.isFlushing = true;
    const items = [...this.queue];
    this.queue = [];

    try {
      for (const item of items) {
        await this.postEvent(item);
      }
    } catch (err) {
      // Re-queue items on failure if not closed
      this.queue.unshift(...items);
    } finally {
      this.isFlushing = false;
    }
  }

  private postEvent(event: TrajectoryEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL('/api/events', this.url);
        const body = JSON.stringify(event);

        const req = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              ...(this.authKey ? { Authorization: `Bearer ${this.authKey}` } : {}),
            },
            timeout: 5000,
          },
          (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Failed to post event, HTTP ${res.statusCode}`));
            }
          }
        );

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(body);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
