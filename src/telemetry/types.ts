import { z } from 'zod';
import { TrajectoryEvent, TrajectoryEventType } from '../events/types.js';
import { HarnessReport, Trajectory } from '../core/types.js';

export const TelemetryServerConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3456),
  host: z.string().default('127.0.0.1'),
  cors: z.boolean().default(true),
  historyLimit: z.number().int().positive().default(1000),
  heartbeatIntervalMs: z.number().int().positive().default(15000),
  authKey: z.string().optional(),
});

export type TelemetryServerConfig = z.infer<typeof TelemetryServerConfigSchema>;

export const TelemetryIngestEventSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  scenarioId: z.string(),
  timestamp: z.string().optional(),
}).passthrough();

export type TelemetryIngestEvent = z.infer<typeof TelemetryIngestEventSchema>;

export interface SSEClientInfo {
  id: string;
  ip: string;
  connectedAt: string;
  userAgent?: string;
  filterTypes?: string[];
  lastEventId?: string;
}

export interface TelemetryServerStats {
  version: string;
  status: 'running' | 'stopping' | 'stopped';
  host: string;
  port: number;
  uptimeSeconds: number;
  connectedClients: number;
  totalEventsReceived: number;
  bufferUsage: {
    current: number;
    capacity: number;
  };
  scenario?: {
    id?: string;
    name?: string;
    status?: string;
    durationMs?: number;
    passed?: boolean;
  };
}

export interface TelemetryEventHistoryQuery {
  limit?: number;
  sinceId?: string;
  scenarioId?: string;
  type?: TrajectoryEventType | string;
}

export interface TelemetryObserverOptions {
  server?: any; // TelemetryServer
  url?: string;
  authKey?: string;
  batchSize?: number;
  flushIntervalMs?: number;
}
