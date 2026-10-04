import { TrajectoryEvent } from '../events/types.js';
import { TelemetryEventHistoryQuery } from './types.js';

export class EventRingBuffer {
  private buffer: TrajectoryEvent[];
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity = 1000) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity);
  }

  public push(event: TrajectoryEvent): void {
    const index = (this.head + this.count) % this.capacity;
    this.buffer[index] = event;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  public getAll(): TrajectoryEvent[] {
    const result: TrajectoryEvent[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  public getSinceId(sinceId: string): TrajectoryEvent[] {
    const all = this.getAll();
    if (!sinceId) return all;

    const idx = all.findIndex((evt) => evt.id === sinceId);
    if (idx === -1) {
      // If sinceId is no longer in ring buffer (evicted), return all available buffer
      return all;
    }
    return all.slice(idx + 1);
  }

  public query(query?: TelemetryEventHistoryQuery): TrajectoryEvent[] {
    let events = this.getAll();

    if (query?.sinceId) {
      events = this.getSinceId(query.sinceId);
    }

    if (query?.scenarioId) {
      events = events.filter((e) => e.scenarioId === query.scenarioId);
    }

    if (query?.type) {
      const typeFilter = query.type;
      if (typeFilter.endsWith(':*')) {
        const prefix = typeFilter.slice(0, -2);
        events = events.filter((e) => e.type.startsWith(prefix + ':'));
      } else if (typeFilter !== '*') {
        events = events.filter((e) => e.type === typeFilter);
      }
    }

    if (query?.limit && query.limit > 0 && events.length > query.limit) {
      events = events.slice(events.length - query.limit);
    }

    return events;
  }

  public clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  public get size(): number {
    return this.count;
  }

  public get maxCapacity(): number {
    return this.capacity;
  }
}
