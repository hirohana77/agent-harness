import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import {
  TelemetryServer,
  EventRingBuffer,
  TelemetryObserver,
  renderDashboardHtml,
  AgentHarness,
  ScenarioDefinition,
  TrajectoryEvent,
} from '../../src/index.js';

function httpRequest(options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(options.url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe('EventRingBuffer', () => {
  it('should store events up to capacity and evict oldest', () => {
    const buffer = new EventRingBuffer(3);
    expect(buffer.size).toBe(0);
    expect(buffer.maxCapacity).toBe(3);

    const e1 = { id: 'e1', type: 'tool:start', scenarioId: 's1', timestamp: 't1' } as any;
    const e2 = { id: 'e2', type: 'tool:end', scenarioId: 's1', timestamp: 't2' } as any;
    const e3 = { id: 'e3', type: 'turn:complete', scenarioId: 's1', timestamp: 't3' } as any;
    const e4 = { id: 'e4', type: 'scenario:complete', scenarioId: 's1', timestamp: 't4' } as any;

    buffer.push(e1);
    buffer.push(e2);
    expect(buffer.size).toBe(2);
    expect(buffer.getAll()).toEqual([e1, e2]);

    buffer.push(e3);
    expect(buffer.size).toBe(3);
    expect(buffer.getAll()).toEqual([e1, e2, e3]);

    buffer.push(e4);
    expect(buffer.size).toBe(3);
    expect(buffer.getAll()).toEqual([e2, e3, e4]);
  });

  it('should support getSinceId for reconnection replay', () => {
    const buffer = new EventRingBuffer(5);
    const e1 = { id: 'e1', type: 'turn:start', scenarioId: 's1', timestamp: 't1' } as any;
    const e2 = { id: 'e2', type: 'tool:start', scenarioId: 's1', timestamp: 't2' } as any;
    const e3 = { id: 'e3', type: 'tool:end', scenarioId: 's1', timestamp: 't3' } as any;

    buffer.push(e1);
    buffer.push(e2);
    buffer.push(e3);

    expect(buffer.getSinceId('e1')).toEqual([e2, e3]);
    expect(buffer.getSinceId('e2')).toEqual([e3]);
    expect(buffer.getSinceId('e3')).toEqual([]);
    expect(buffer.getSinceId('e_unknown')).toEqual([e1, e2, e3]);
  });

  it('should filter events via query', () => {
    const buffer = new EventRingBuffer(10);
    buffer.push({ id: 'e1', type: 'tool:start', scenarioId: 's1', timestamp: 't1' } as any);
    buffer.push({ id: 'e2', type: 'tool:end', scenarioId: 's1', timestamp: 't2' } as any);
    buffer.push({ id: 'e3', type: 'turn:start', scenarioId: 's2', timestamp: 't3' } as any);
    buffer.push({ id: 'e4', type: 'error', scenarioId: 's1', timestamp: 't4' } as any);

    expect(buffer.query({ type: 'tool:*' }).map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(buffer.query({ scenarioId: 's2' }).map((e) => e.id)).toEqual(['e3']);
    expect(buffer.query({ limit: 2 }).map((e) => e.id)).toEqual(['e3', 'e4']);

    buffer.clear();
    expect(buffer.size).toBe(0);
  });
});

describe('TelemetryServer & HTTP Endpoints', () => {
  let server: TelemetryServer;
  let serverUrl: string;

  beforeEach(async () => {
    server = new TelemetryServer({ port: 0, host: '127.0.0.1' });
    const res = await server.start();
    serverUrl = res.url;
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  it('should serve HTML dashboard on root and /dashboard', async () => {
    const res1 = await httpRequest({ url: `${serverUrl}/` });
    expect(res1.status).toBe(200);
    expect(res1.headers['content-type']).toContain('text/html');
    expect(res1.body).toContain('Live Telemetry');
    expect(res1.body).toContain('agent-harness');

    const res2 = await httpRequest({ url: `${serverUrl}/dashboard` });
    expect(res2.status).toBe(200);
    expect(res2.body).toContain('Live Telemetry');
  });

  it('should return server status JSON at /api/status', async () => {
    const res = await httpRequest({ url: `${serverUrl}/api/status` });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('running');
    expect(json.port).toBe(server.getPort());
    expect(json.connectedClients).toBe(0);
    expect(json.totalEventsReceived).toBe(0);
  });

  it('should ingest events via POST /api/events and query via GET /api/history', async () => {
    const eventPayload = {
      type: 'tool:start',
      scenarioId: 'sc_test',
      callId: 'call_1',
      toolName: 'bash',
      arguments: { command: 'echo hello' },
      turnNumber: 1,
    };

    const postRes = await httpRequest({
      url: `${serverUrl}/api/events`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
    });

    expect(postRes.status).toBe(201);
    const postJson = JSON.parse(postRes.body);
    expect(postJson.success).toBe(true);
    expect(postJson.eventId).toBeDefined();

    const histRes = await httpRequest({ url: `${serverUrl}/api/history` });
    expect(histRes.status).toBe(200);
    const history = JSON.parse(histRes.body);
    expect(history.length).toBe(1);
    expect(history[0].toolName).toBe('bash');
    expect(history[0].scenarioId).toBe('sc_test');
  });

  it('should return CORS preflight headers on OPTIONS', async () => {
    const res = await httpRequest({
      url: `${serverUrl}/api/events`,
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('should support storing and retrieving latest report and trajectory', async () => {
    // Before setting, returns 404
    const res404 = await httpRequest({ url: `${serverUrl}/api/report` });
    expect(res404.status).toBe(404);

    const mockReport: any = {
      scenarioId: 'sc1',
      passed: true,
      assertionResults: [],
      metrics: { durationMs: 100, totalTurns: 1, totalTokens: 50, passedAssertions: 0, failedAssertions: 0, totalAssertions: 0 },
    };
    server.setLatestReport(mockReport);

    const res200 = await httpRequest({ url: `${serverUrl}/api/report` });
    expect(res200.status).toBe(200);
    expect(JSON.parse(res200.body).scenarioId).toBe('sc1');
  });

  it('should enforce authKey when enabled', async () => {
    const secureServer = new TelemetryServer({ port: 0, host: '127.0.0.1', authKey: 'secret-token' });
    const { url } = await secureServer.start();

    try {
      // Without auth header
      const resUnauth = await httpRequest({ url: `${url}/api/status` });
      expect(resUnauth.status).toBe(401);

      // With auth header
      const resAuth = await httpRequest({
        url: `${url}/api/status`,
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(resAuth.status).toBe(200);

      // With auth query param
      const resQuery = await httpRequest({
        url: `${url}/api/status?auth=secret-token`,
      });
      expect(resQuery.status).toBe(200);
    } finally {
      await secureServer.stop();
    }
  });
});

describe('SSE Streaming and Reconnection', () => {
  let server: TelemetryServer;
  let serverUrl: string;

  beforeEach(async () => {
    server = new TelemetryServer({ port: 0, host: '127.0.0.1', heartbeatIntervalMs: 5000 });
    const res = await server.start();
    serverUrl = res.url;
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  it('should stream live events to SSE subscriber', async () => {
    const receivedChunks: string[] = [];

    const parsed = new URL(`${serverUrl}/api/events`);
    const clientReq = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'GET',
    });

    const connectedPromise = new Promise<void>((resolve) => {
      clientReq.on('response', (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');

        res.on('data', (chunk) => {
          const str = chunk.toString('utf8');
          receivedChunks.push(str);
          if (str.includes('event: connected')) {
            resolve();
          }
        });
      });
    });

    clientReq.end();
    await connectedPromise;

    // Check stats shows 1 connected client
    expect(server.getStats().connectedClients).toBe(1);

    // Ingest event into server
    const testEvent: TrajectoryEvent = {
      id: 'evt_test_123',
      type: 'tool:start',
      scenarioId: 'sc_sse',
      timestamp: new Date().toISOString(),
      callId: 'c1',
      toolName: 'read_file',
      arguments: { path: 'file.txt' },
      turnNumber: 1,
    };

    server.ingest(testEvent);

    // Wait briefly for SSE message arrival
    await new Promise((r) => setTimeout(r, 80));

    const allData = receivedChunks.join('');
    expect(allData).toContain('event: connected');
    expect(allData).toContain('id: evt_test_123');
    expect(allData).toContain('"toolName":"read_file"');

    // Close client
    clientReq.destroy();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.getStats().connectedClients).toBe(0);
  });

  it('should replay missed events via Last-Event-ID', async () => {
    const e1: TrajectoryEvent = {
      id: 'evt_1',
      type: 'turn:start',
      scenarioId: 's1',
      timestamp: 't1',
      turnNumber: 1,
      prompt: 'hello',
    };
    const e2: TrajectoryEvent = {
      id: 'evt_2',
      type: 'turn:complete',
      scenarioId: 's1',
      timestamp: 't2',
      turnNumber: 1,
      cumulativeTokens: 50,
    };
    server.ingest(e1);
    server.ingest(e2);

    // Connect with Last-Event-ID: evt_1 -> should replay evt_2
    const received: string[] = [];
    const parsed = new URL(`${serverUrl}/api/events?lastEventId=evt_1`);

    const clientReq = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
    });

    await new Promise<void>((resolve) => {
      clientReq.on('response', (res) => {
        res.on('data', (chunk) => {
          received.push(chunk.toString('utf8'));
          if (received.join('').includes('evt_2')) {
            resolve();
          }
        });
      });
      clientReq.end();
    });

    const combined = received.join('');
    expect(combined).not.toContain('id: evt_1');
    expect(combined).toContain('id: evt_2');
    expect(combined).toContain('"cumulativeTokens":50');

    clientReq.destroy();
  });
});

describe('TelemetryObserver & Harness Integration', () => {
  let server: TelemetryServer;
  let serverUrl: string;

  beforeEach(async () => {
    server = new TelemetryServer({ port: 0, host: '127.0.0.1' });
    const res = await server.start();
    serverUrl = res.url;
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  it('should ingest events via in-process TelemetryObserver', async () => {
    const observer = new TelemetryObserver({ server });
    expect(observer.name).toBe('telemetry');

    await observer.onEvent({
      id: 'evt_obs_1',
      type: 'scenario:start',
      scenarioId: 'sc_obs',
      timestamp: new Date().toISOString(),
      scenarioName: 'Observer Test',
    });

    const history = server.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('evt_obs_1');
    expect(server.getStats().scenario?.name).toBe('Observer Test');
  });

  it('should ingest events via remote HTTP TelemetryObserver', async () => {
    const observer = new TelemetryObserver({ url: serverUrl, batchSize: 1 });

    await observer.onEvent({
      id: 'evt_remote_1',
      type: 'turn:start',
      scenarioId: 'sc_remote',
      timestamp: new Date().toISOString(),
      turnNumber: 1,
      prompt: 'Remote prompt',
    });

    await observer.flush();
    await observer.close();

    const history = server.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('evt_remote_1');
  });

  it('should stream full scenario execution from AgentHarness into TelemetryServer', async () => {
    const observer = new TelemetryObserver({ server });

    const scenario: ScenarioDefinition = {
      id: 'live-telemetry-scenario',
      name: 'Live Telemetry Scenario',
      version: '1.0.0',
      workspace: {
        cleanup: true,
        gitInit: false,
        initialFiles: {
          'hello.txt': 'Hello Telemetry!',
        },
      },
      task: {
        instruction: 'Inspect file and finish',
      },
      budgets: {
        maxTurns: 5,
        timeoutMs: 10000,
      },
      assertions: {
        files: [
          {
            path: 'hello.txt',
            shouldExist: true,
            contains: 'Hello Telemetry',
          },
        ],
      },
    };

    const { report, trajectory } = await AgentHarness.runScenario(
      scenario,
      async (ctx) => {
        ctx.recorder.startTurn('Check hello.txt', 'Reading content');
        const callId = ctx.recorder.notifyToolStart("read_file", { path: "hello.txt" });
        const readResult = await ctx.workspace.readFile('hello.txt');
        ctx.recorder.recordToolCall(
          'read_file',
          { path: 'hello.txt' },
          { success: true, content: readResult },
          10
        );
        ctx.recorder.completeTurn('Found expected file content', {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        });
      },
      { observers: [observer] }
    );

    expect(report.passed).toBe(true);
    expect(trajectory.turns.length).toBe(1);

    const events = server.getHistory();
    const eventTypes = events.map((e) => e.type);

    expect(eventTypes).toContain('scenario:start');
    expect(eventTypes).toContain('sandbox:ready');
    expect(eventTypes).toContain('turn:start');
    expect(eventTypes).toContain('tool:start');
    expect(eventTypes).toContain('tool:end');
    expect(eventTypes).toContain('turn:complete');
    expect(eventTypes).toContain('scenario:complete');
    expect(eventTypes).toContain('sandbox:teardown');

    const stats = server.getStats();
    expect(stats.totalEventsReceived).toBe(events.length);
    expect(stats.scenario?.status).toBe('completed');
    expect(stats.scenario?.passed).toBe(true);
  });
});
