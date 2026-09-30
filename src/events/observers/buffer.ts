import { TrajectoryEvent, TrajectoryEventType, TrajectoryStreamObserver } from '../types.js';
import { TrajectoryEventBus } from '../bus.js';

export interface BufferObserverOptions {
  maxSize?: number;
}

export class BufferedStreamObserver implements TrajectoryStreamObserver {
  public readonly name = 'BufferedStreamObserver';
  private buffer: TrajectoryEvent[] = [];
  private maxSize: number;

  constructor(options?: BufferObserverOptions) {
    this.maxSize = options?.maxSize ?? 1000;
  }

  public onEvent(event: TrajectoryEvent): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(event);
  }

  public getEvents(): TrajectoryEvent[] {
    return [...this.buffer];
  }

  public getEventsByType<T extends TrajectoryEventType>(
    type: T
  ): Extract<TrajectoryEvent, { type: T }>[] {
    return this.buffer.filter((e) => e.type === type) as Extract<
      TrajectoryEvent,
      { type: T }
    >[];
  }

  public size(): number {
    return this.buffer.length;
  }

  public clear(): void {
    this.buffer = [];
  }

  public drain(): TrajectoryEvent[] {
    const items = [...this.buffer];
    this.buffer = [];
    return items;
  }

  public replay(targetBus: TrajectoryEventBus): void {
    for (const evt of this.buffer) {
      targetBus.emit(evt);
    }
  }

  public async flush(): Promise<void> {
    // In-memory buffer flush is a no-op
  }
}
