import {
  TrajectoryEvent,
  TrajectoryEventType,
  EventPattern,
  TrajectoryEventListener,
  EventUnsubscribe,
} from './types.js';

interface RegisteredListener {
  id: string;
  pattern: EventPattern;
  listener: TrajectoryEventListener;
  once: boolean;
}

export class TrajectoryEventBus {
  private listeners: Map<string, RegisteredListener> = new Map();
  private errorHandler: (err: unknown, event: TrajectoryEvent) => void;
  private idCounter = 0;

  constructor(options?: { onError?: (err: unknown, event: TrajectoryEvent) => void }) {
    this.errorHandler =
      options?.onError ||
      ((err, event) => {
        // Default error isolation: capture listener failure without bringing down the bus
        console.error(`[TrajectoryEventBus] Listener error on event "${event.type}":`, err);
      });
  }

  /**
   * Subscribe to events matching a pattern
   * Patterns supported:
   *  - Exact type: 'turn:start', 'tool:end', etc.
   *  - Prefix wildcard: 'tool:*', 'turn:*', 'scenario:*'
   *  - Global wildcard: '*'
   */
  public on<T extends TrajectoryEvent = TrajectoryEvent>(
    pattern: EventPattern,
    listener: TrajectoryEventListener<T>
  ): EventUnsubscribe {
    const id = `sub_${++this.idCounter}`;
    this.listeners.set(id, {
      id,
      pattern,
      listener: listener as TrajectoryEventListener,
      once: false,
    });

    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * Subscribe to a single matching event
   */
  public once<T extends TrajectoryEvent = TrajectoryEvent>(
    pattern: EventPattern,
    listener: TrajectoryEventListener<T>
  ): EventUnsubscribe {
    const id = `sub_${++this.idCounter}`;
    this.listeners.set(id, {
      id,
      pattern,
      listener: listener as TrajectoryEventListener,
      once: true,
    });

    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * Remove a specific listener by pattern and function reference
   */
  public off(pattern: EventPattern, listener: TrajectoryEventListener): void {
    for (const [id, entry] of this.listeners.entries()) {
      if (entry.pattern === pattern && entry.listener === listener) {
        this.listeners.delete(id);
      }
    }
  }

  /**
   * Remove all listeners, optionally filtered by pattern
   */
  public removeAllListeners(pattern?: EventPattern): void {
    if (!pattern) {
      this.listeners.clear();
      return;
    }
    for (const [id, entry] of this.listeners.entries()) {
      if (entry.pattern === pattern) {
        this.listeners.delete(id);
      }
    }
  }

  /**
   * Count registered listeners, optionally filtered by pattern
   */
  public listenerCount(pattern?: EventPattern): number {
    if (!pattern) {
      return this.listeners.size;
    }
    let count = 0;
    for (const entry of this.listeners.values()) {
      if (entry.pattern === pattern) {
        count++;
      }
    }
    return count;
  }

  /**
   * Emit an event synchronously to matching listeners.
   * Listener errors are isolated via the configured errorHandler.
   */
  public emit(event: TrajectoryEvent): void {
    const targets = this.matchListeners(event.type);
    for (const target of targets) {
      if (target.once) {
        this.listeners.delete(target.id);
      }
      try {
        const res = target.listener(event);
        if (res instanceof Promise) {
          res.catch((err) => this.errorHandler(err, event));
        }
      } catch (err) {
        this.errorHandler(err, event);
      }
    }
  }

  /**
   * Emit an event asynchronously, awaiting all matching listeners concurrently.
   */
  public async emitAsync(event: TrajectoryEvent): Promise<void> {
    const targets = this.matchListeners(event.type);
    const promises: Promise<void>[] = [];

    for (const target of targets) {
      if (target.once) {
        this.listeners.delete(target.id);
      }
      try {
        const res = target.listener(event);
        if (res instanceof Promise) {
          promises.push(
            res.catch((err) => {
              this.errorHandler(err, event);
            })
          );
        }
      } catch (err) {
        this.errorHandler(err, event);
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Helper to construct a typed event with timestamp and UUID
   */
  public createEvent<T extends TrajectoryEvent>(
    data: Omit<T, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
  ): T {
    return {
      ...data,
      id: data.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: data.timestamp || new Date().toISOString(),
    } as unknown as T;
  }

  /**
   * Match registered listeners against event type
   */
  private matchListeners(eventType: TrajectoryEventType): RegisteredListener[] {
    const matched: RegisteredListener[] = [];
    for (const entry of this.listeners.values()) {
      if (this.matchesPattern(entry.pattern, eventType)) {
        matched.push(entry);
      }
    }
    return matched;
  }

  private matchesPattern(pattern: EventPattern, eventType: TrajectoryEventType): boolean {
    if (pattern === '*' || pattern === eventType) {
      return true;
    }
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(`${prefix}:`);
    }
    return false;
  }
}
