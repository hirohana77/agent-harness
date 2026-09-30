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

export interface TrajectoryEventBusOptions {
  onError?: (err: unknown, event: TrajectoryEvent) => void;
  maxListeners?: number;
}

export class TrajectoryEventBus {
  private listeners: Map<string, RegisteredListener> = new Map();
  private exactListeners: Map<string, Set<string>> = new Map();
  private prefixListeners: Map<string, Set<string>> = new Map();
  private globalListeners: Set<string> = new Set();
  private errorHandler: (err: unknown, event: TrajectoryEvent) => void;
  private maxListeners: number;
  private idCounter = 0;

  constructor(options?: TrajectoryEventBusOptions) {
    this.maxListeners = options?.maxListeners ?? 100;
    this.errorHandler =
      options?.onError ||
      ((err, event) => {
        console.error(`[TrajectoryEventBus] Listener error on event "${event.type}":`, err);
      });
  }

  /**
   * Subscribe to events matching a pattern
   */
  public on<T extends TrajectoryEvent = TrajectoryEvent>(
    pattern: EventPattern,
    listener: TrajectoryEventListener<T>
  ): EventUnsubscribe {
    return this.addListener(pattern, listener as TrajectoryEventListener, false);
  }

  /**
   * Subscribe to a single matching event
   */
  public once<T extends TrajectoryEvent = TrajectoryEvent>(
    pattern: EventPattern,
    listener: TrajectoryEventListener<T>
  ): EventUnsubscribe {
    return this.addListener(pattern, listener as TrajectoryEventListener, true);
  }

  /**
   * Remove a specific listener by pattern and function reference
   */
  public off(pattern: EventPattern, listener: TrajectoryEventListener): void {
    for (const [id, entry] of this.listeners.entries()) {
      if (entry.pattern === pattern && entry.listener === listener) {
        this.removeListenerById(id);
      }
    }
  }

  /**
   * Remove all listeners, optionally filtered by pattern
   */
  public removeAllListeners(pattern?: EventPattern): void {
    if (!pattern) {
      this.listeners.clear();
      this.exactListeners.clear();
      this.prefixListeners.clear();
      this.globalListeners.clear();
      return;
    }

    for (const [id, entry] of this.listeners.entries()) {
      if (entry.pattern === pattern) {
        this.removeListenerById(id);
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
   * Emit an event synchronously with zero-crash error boundaries.
   */
  public emit(event: TrajectoryEvent): void {
    const targets = this.matchListeners(event.type);
    for (const target of targets) {
      if (target.once) {
        this.removeListenerById(target.id);
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
        this.removeListenerById(target.id);
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
   * Wait for a matching event with an optional timeout
   */
  public waitForEvent<T extends TrajectoryEvent = TrajectoryEvent>(
    pattern: EventPattern,
    predicate?: (event: T) => boolean,
    timeoutMs = 5000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      const unsub = this.on(pattern, (evt: any) => {
        if (!predicate || predicate(evt)) {
          if (timer) clearTimeout(timer);
          unsub();
          resolve(evt);
        }
      });

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          unsub();
          reject(new Error(`Timeout waiting for event pattern "${pattern}" after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
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

  private addListener(
    pattern: EventPattern,
    listener: TrajectoryEventListener,
    once: boolean
  ): EventUnsubscribe {
    if (this.listeners.size >= this.maxListeners) {
      console.warn(
        `[TrajectoryEventBus] Warning: possible memory leak. ${this.listeners.size} listeners added (max: ${this.maxListeners}).`
      );
    }

    const id = `sub_${++this.idCounter}`;
    const entry: RegisteredListener = { id, pattern, listener, once };
    this.listeners.set(id, entry);

    if (pattern === '*') {
      this.globalListeners.add(id);
    } else if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      if (!this.prefixListeners.has(prefix)) {
        this.prefixListeners.set(prefix, new Set());
      }
      this.prefixListeners.get(prefix)!.add(id);
    } else {
      if (!this.exactListeners.has(pattern)) {
        this.exactListeners.set(pattern, new Set());
      }
      this.exactListeners.get(pattern)!.add(id);
    }

    return () => {
      this.removeListenerById(id);
    };
  }

  private removeListenerById(id: string): void {
    const entry = this.listeners.get(id);
    if (!entry) return;

    this.listeners.delete(id);
    if (entry.pattern === '*') {
      this.globalListeners.delete(id);
    } else if (entry.pattern.endsWith(':*')) {
      const prefix = entry.pattern.slice(0, -2);
      const set = this.prefixListeners.get(prefix);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.prefixListeners.delete(prefix);
      }
    } else {
      const set = this.exactListeners.get(entry.pattern);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.exactListeners.delete(entry.pattern);
      }
    }
  }

  /**
   * Fast indexed lookup of matching listeners
   */
  private matchListeners(eventType: TrajectoryEventType): RegisteredListener[] {
    const matched: RegisteredListener[] = [];
    const matchedIds = new Set<string>();

    // 1. Exact match
    const exact = this.exactListeners.get(eventType);
    if (exact) {
      for (const id of exact) {
        const item = this.listeners.get(id);
        if (item && !matchedIds.has(id)) {
          matched.push(item);
          matchedIds.add(id);
        }
      }
    }

    // 2. Prefix wildcard match (e.g. "tool:*" for "tool:start")
    const colonIdx = eventType.indexOf(':');
    if (colonIdx !== -1) {
      const prefix = eventType.slice(0, colonIdx);
      const prefixSet = this.prefixListeners.get(prefix);
      if (prefixSet) {
        for (const id of prefixSet) {
          const item = this.listeners.get(id);
          if (item && !matchedIds.has(id)) {
            matched.push(item);
            matchedIds.add(id);
          }
        }
      }
    }

    // 3. Global wildcard match ("*")
    for (const id of this.globalListeners) {
      const item = this.listeners.get(id);
      if (item && !matchedIds.has(id)) {
        matched.push(item);
        matchedIds.add(id);
      }
    }

    return matched;
  }
}
