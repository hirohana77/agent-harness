import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { TrajectoryEvent } from '../events/types.js';
import { EventRingBuffer } from './ring-buffer.js';
import { SSEClientInfo } from './types.js';

interface SSEClientInternal {
  id: string;
  ip: string;
  req: IncomingMessage;
  res: ServerResponse;
  connectedAt: Date;
  filterTypes?: string[];
  lastEventId?: string;
  isClosed: boolean;
}

export class SSEManager {
  private clients: Map<string, SSEClientInternal> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatIntervalMs: number;
  private idCounter = 0;

  constructor(heartbeatIntervalMs = 15000) {
    this.heartbeatIntervalMs = Math.max(1000, heartbeatIntervalMs);
    this.startHeartbeat();
  }

  public handleConnection(
    req: IncomingMessage,
    res: ServerResponse,
    buffer: EventRingBuffer
  ): string {
    const clientId = `client_${Date.now()}_${++this.idCounter}`;
    const ip = req.socket.remoteAddress || '127.0.0.1';

    let filterTypes: string[] | undefined;
    let lastEventId: string | undefined = req.headers['last-event-id'] as string;

    try {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (!lastEventId && parsedUrl.searchParams.has('lastEventId')) {
        lastEventId = parsedUrl.searchParams.get('lastEventId') || undefined;
      }
      if (parsedUrl.searchParams.has('types')) {
        filterTypes = parsedUrl.searchParams
          .get('types')!
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {
      // Ignore URL parsing errors
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Last-Event-ID',
    });

    const client: SSEClientInternal = {
      id: clientId,
      ip,
      req,
      res,
      connectedAt: new Date(),
      filterTypes,
      lastEventId,
      isClosed: false,
    };

    this.clients.set(clientId, client);

    const cleanup = () => {
      if (!client.isClosed) {
        client.isClosed = true;
        this.removeClient(clientId);
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    // Send initial handshake
    this.writeDirect(
      client,
      `event: connected\ndata: ${JSON.stringify({
        clientId,
        timestamp: new Date().toISOString(),
        bufferedEvents: buffer.size,
      })}\n\n`
    );

    // Replay missed events if client provided Last-Event-ID
    if (lastEventId) {
      const missed = buffer.getSinceId(lastEventId);
      for (const evt of missed) {
        if (this.shouldSendEvent(evt, filterTypes)) {
          this.sendEventToClient(client, evt);
        }
      }
    }

    return clientId;
  }

  public broadcast(event: TrajectoryEvent): void {
    if (this.clients.size === 0) return;

    const deadClients: string[] = [];

    for (const [clientId, client] of this.clients.entries()) {
      if (client.isClosed) {
        deadClients.push(clientId);
        continue;
      }
      if (this.shouldSendEvent(event, client.filterTypes)) {
        const sent = this.sendEventToClient(client, event);
        if (!sent) {
          deadClients.push(clientId);
        }
      }
    }

    for (const id of deadClients) {
      this.removeClient(id);
    }
  }

  public sendHeartbeat(): void {
    if (this.clients.size === 0) return;

    const deadClients: string[] = [];
    for (const [clientId, client] of this.clients.entries()) {
      if (client.isClosed) {
        deadClients.push(clientId);
        continue;
      }
      const sent = this.writeDirect(client, `: keepalive\n\n`);
      if (!sent) {
        deadClients.push(clientId);
      }
    }

    for (const id of deadClients) {
      this.removeClient(id);
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public getClients(): SSEClientInfo[] {
    return Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      ip: c.ip,
      connectedAt: c.connectedAt.toISOString(),
      filterTypes: c.filterTypes,
      lastEventId: c.lastEventId,
    }));
  }

  public closeAll(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    for (const client of this.clients.values()) {
      client.isClosed = true;
      try {
        client.res.end();
      } catch {
        // Ignore socket close errors
      }
    }
    this.clients.clear();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  private removeClient(id: string): void {
    this.clients.delete(id);
  }

  private shouldSendEvent(event: TrajectoryEvent, filterTypes?: string[]): boolean {
    if (!filterTypes || filterTypes.length === 0 || filterTypes.includes('*')) {
      return true;
    }

    for (const filter of filterTypes) {
      if (filter.endsWith(':*')) {
        const prefix = filter.slice(0, -2);
        if (event.type.startsWith(prefix + ':')) return true;
      } else if (event.type === filter) {
        return true;
      }
    }
    return false;
  }

  private sendEventToClient(client: SSEClientInternal, event: TrajectoryEvent): boolean {
    const payload = `id: ${event.id}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`;
    const success = this.writeDirect(client, payload);
    if (success) {
      client.lastEventId = event.id;
    }
    return success;
  }

  private writeDirect(client: SSEClientInternal, payload: string): boolean {
    try {
      if (!client.isClosed && !client.res.writableEnded) {
        client.res.write(payload);
        return true;
      }
    } catch {
      client.isClosed = true;
    }
    return false;
  }
}
