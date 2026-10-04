import http, { IncomingMessage, ServerResponse, Server } from 'node:http';
import { URL } from 'node:url';
import { VERSION } from '../index.js';
import { TrajectoryEvent } from '../events/types.js';
import { HarnessReport, Trajectory } from '../core/types.js';
import {
  TelemetryServerConfig,
  TelemetryServerConfigSchema,
  TelemetryServerStats,
  TelemetryEventHistoryQuery,
  TelemetryIngestEventSchema,
} from './types.js';
import { EventRingBuffer } from './ring-buffer.js';
import { SSEManager } from './sse.js';
import { renderDashboardHtml } from './dashboard.js';

export class TelemetryServer {
  private config: TelemetryServerConfig;
  private server?: Server;
  private buffer: EventRingBuffer;
  private sseManager: SSEManager;
  private startedAt?: Date;
  private status: 'running' | 'stopping' | 'stopped' = 'stopped';
  private totalEventsReceived = 0;
  private activeScenario?: {
    id?: string;
    name?: string;
    status?: string;
    durationMs?: number;
    passed?: boolean;
  };
  private latestReport?: HarnessReport;
  private latestTrajectory?: Trajectory;
  private boundPort = 0;
  private boundHost = '127.0.0.1';

  constructor(options?: Partial<TelemetryServerConfig>) {
    this.config = TelemetryServerConfigSchema.parse(options || {});
    this.buffer = new EventRingBuffer(this.config.historyLimit);
    this.sseManager = new SSEManager(this.config.heartbeatIntervalMs);
  }

  public async start(): Promise<{ port: number; host: string; url: string }> {
    if (this.status === 'running') {
      return {
        port: this.boundPort,
        host: this.boundHost,
        url: `http://${this.boundHost}:${this.boundPort}`,
      };
    }

    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.sendJson(res, 500, { error: 'Internal Server Error', message: String(err) });
        });
      });

      srv.on('error', (err) => {
        reject(err);
      });

      srv.listen(this.config.port, this.config.host, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          this.boundPort = addr.port;
          this.boundHost = addr.address === '0.0.0.0' ? '127.0.0.1' : addr.address;
        } else {
          this.boundPort = this.config.port;
          this.boundHost = this.config.host;
        }

        this.server = srv;
        this.status = 'running';
        this.startedAt = new Date();

        resolve({
          port: this.boundPort,
          host: this.boundHost,
          url: `http://${this.boundHost}:${this.boundPort}`,
        });
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.status === 'stopped' || !this.server) {
      return;
    }

    this.status = 'stopping';
    this.sseManager.closeAll();

    return new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        this.status = 'stopped';
        this.server = undefined;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public ingest(event: TrajectoryEvent): void {
    this.totalEventsReceived++;
    this.buffer.push(event);

    if (event.type === 'scenario:start') {
      this.activeScenario = {
        id: event.scenarioId,
        name: (event as any).scenarioName || event.scenarioId,
        status: 'running',
      };
    } else if (event.type === 'scenario:complete') {
      if (this.activeScenario) {
        this.activeScenario.status = (event as any).status;
        this.activeScenario.durationMs = (event as any).durationMs;
        this.activeScenario.passed = (event as any).passed;
      }
      if ((event as any).report) {
        this.latestReport = (event as any).report;
      }
    }

    this.sseManager.broadcast(event);
  }

  public setLatestReport(report: HarnessReport): void {
    this.latestReport = report;
  }

  public setLatestTrajectory(trajectory: Trajectory): void {
    this.latestTrajectory = trajectory;
  }

  public getLatestReport(): HarnessReport | undefined {
    return this.latestReport;
  }

  public getLatestTrajectory(): Trajectory | undefined {
    return this.latestTrajectory;
  }

  public getStats(): TelemetryServerStats {
    const uptimeSeconds = this.startedAt
      ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
      : 0;

    return {
      version: VERSION,
      status: this.status,
      host: this.boundHost,
      port: this.boundPort,
      uptimeSeconds,
      connectedClients: this.sseManager.getClientCount(),
      totalEventsReceived: this.totalEventsReceived,
      bufferUsage: {
        current: this.buffer.size,
        capacity: this.buffer.maxCapacity,
      },
      scenario: this.activeScenario,
    };
  }

  public getHistory(query?: TelemetryEventHistoryQuery): TrajectoryEvent[] {
    return this.buffer.query(query);
  }

  public getPort(): number {
    return this.boundPort;
  }

  public getHost(): string {
    return this.boundHost;
  }

  public isRunning(): boolean {
    return this.status === 'running';
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://${this.boundHost}:${this.boundPort}`);
    const pathname = parsedUrl.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // CORS preflight
    if (this.config.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Last-Event-ID, Authorization');
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Optional auth token check
    if (this.config.authKey) {
      const authHeader = req.headers['authorization'];
      const queryKey = parsedUrl.searchParams.get('auth');
      const expected = `Bearer ${this.config.authKey}`;
      if (authHeader !== expected && queryKey !== this.config.authKey) {
        this.sendJson(res, 401, { error: 'Unauthorized: Invalid auth key' });
        return;
      }
    }

    // Routing
    if (method === 'GET' && (pathname === '/' || pathname === '/dashboard')) {
      const html = renderDashboardHtml();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(html);
      return;
    }

    if (method === 'GET' && (pathname === '/api/events' || pathname === '/events')) {
      this.sseManager.handleConnection(req, res, this.buffer);
      return;
    }

    if (method === 'GET' && (pathname === '/api/status' || pathname === '/status')) {
      this.sendJson(res, 200, this.getStats());
      return;
    }

    if (method === 'GET' && (pathname === '/api/history' || pathname === '/history')) {
      const limit = parsedUrl.searchParams.get('limit')
        ? parseInt(parsedUrl.searchParams.get('limit')!, 10)
        : undefined;
      const sinceId = parsedUrl.searchParams.get('sinceId') || undefined;
      const type = parsedUrl.searchParams.get('type') || undefined;
      const scenarioId = parsedUrl.searchParams.get('scenarioId') || undefined;

      const events = this.getHistory({ limit, sinceId, type, scenarioId });
      this.sendJson(res, 200, events);
      return;
    }

    if (method === 'GET' && (pathname === '/api/report' || pathname === '/report')) {
      if (this.latestReport) {
        this.sendJson(res, 200, this.latestReport);
      } else {
        this.sendJson(res, 404, { error: 'No report available yet' });
      }
      return;
    }

    if (method === 'GET' && (pathname === '/api/trajectory' || pathname === '/trajectory')) {
      if (this.latestTrajectory) {
        this.sendJson(res, 200, this.latestTrajectory);
      } else {
        this.sendJson(res, 404, { error: 'No trajectory recorded yet' });
      }
      return;
    }

    if (method === 'POST' && (pathname === '/api/events' || pathname === '/events')) {
      const rawBody = await this.readRequestBody(req);
      try {
        const parsed = JSON.parse(rawBody);
        const validated = TelemetryIngestEventSchema.parse(parsed);
        const event: TrajectoryEvent = {
          id: validated.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: validated.timestamp || new Date().toISOString(),
          ...validated,
        } as TrajectoryEvent;

        this.ingest(event);
        this.sendJson(res, 201, { success: true, eventId: event.id });
      } catch (err: any) {
        this.sendJson(res, 400, { error: 'Invalid event payload', message: err.message });
      }
      return;
    }

    this.sendJson(res, 404, { error: `Not Found: ${method} ${pathname}` });
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    if (res.writableEnded) return;
    const body = JSON.stringify(data, null, 2);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          req.destroy(new Error('Payload Too Large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }
}
