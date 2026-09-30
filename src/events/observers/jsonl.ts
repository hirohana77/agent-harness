import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { TrajectoryEvent, TrajectoryStreamObserver } from '../types.js';

export interface JsonLinesObserverOptions {
  filePath?: string;
  stream?: Writable;
  immediate?: boolean;
  onError?: (err: Error) => void;
}

export class JsonLinesStreamObserver implements TrajectoryStreamObserver {
  public readonly name = 'JsonLinesStreamObserver';
  private filePath?: string;
  private stream?: Writable;
  private immediate: boolean;
  private onError?: (err: Error) => void;
  private pendingQueue: string[] = [];
  private flushPromise: Promise<void> | null = null;
  private initPromise?: Promise<void>;

  constructor(options: JsonLinesObserverOptions | string) {
    if (typeof options === 'string') {
      this.filePath = options;
      this.immediate = true;
    } else {
      this.filePath = options.filePath;
      this.stream = options.stream;
      this.immediate = options.immediate ?? true;
      this.onError = options.onError;
    }

    if (!this.filePath && !this.stream) {
      throw new Error('JsonLinesStreamObserver requires either a filePath or a writable stream');
    }

    if (this.filePath) {
      const dir = path.dirname(path.resolve(this.filePath));
      this.initPromise = fs.mkdir(dir, { recursive: true }).then(() => {});
    }
  }

  public async onEvent(event: TrajectoryEvent): Promise<void> {
    try {
      const line = JSON.stringify(event) + '\n';
      this.pendingQueue.push(line);

      if (this.immediate) {
        await this.flush();
      }
    } catch (err: any) {
      if (this.onError) {
        this.onError(err);
      } else {
        console.error('[JsonLinesStreamObserver] Error processing event:', err);
      }
    }
  }

  public async flush(): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise;
    }

    if (this.pendingQueue.length === 0) {
      return;
    }

    this.flushPromise = this.doFlush();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async doFlush(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (this.pendingQueue.length === 0) {
      return;
    }

    const chunk = this.pendingQueue.join('');
    this.pendingQueue = [];

    try {
      if (this.stream) {
        await new Promise<void>((resolve, reject) => {
          this.stream!.write(chunk, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else if (this.filePath) {
        await fs.appendFile(path.resolve(this.filePath), chunk, 'utf8');
      }
    } catch (err: any) {
      if (this.onError) {
        this.onError(err);
      } else {
        console.error('[JsonLinesStreamObserver] Error writing chunk:', err);
      }
    }

    // Flush any entries queued while writing
    if (this.pendingQueue.length > 0) {
      await this.doFlush();
    }
  }

  public async close(): Promise<void> {
    await this.flush();
  }
}
