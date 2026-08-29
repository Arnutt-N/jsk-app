import { MessageType } from './types';

interface QueuedMessage {
  id: string;
  type: MessageType;
  payload: unknown;
  timestamp: number;
  retries: number;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private maxRetries = 3;
  private maxSize = 100;
  private overflowLogged = false;

  enqueue(type: MessageType, payload: unknown): string | false {
    // Prevent queue overflow — signal failure instead of silently dropping
    if (this.queue.length >= this.maxSize) {
      if (!this.overflowLogged) {
        console.warn(`MessageQueue: queue full (${this.maxSize}), message dropped`);
        this.overflowLogged = true;
      }
      return false;
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.queue.push({
      id,
      type,
      payload,
      timestamp: Date.now(),
      retries: 0
    });
    return id;
  }

  dequeue(): QueuedMessage | undefined {
    return this.queue.shift();
  }

  peek(): QueuedMessage | undefined {
    return this.queue[0];
  }

  requeue(message: QueuedMessage): boolean {
    if (message.retries < this.maxRetries) {
      message.retries++;
      this.queue.unshift(message);
      return true;
    }
    return false;
  }

  remove(id: string): boolean {
    const index = this.queue.findIndex(m => m.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  getPending(): QueuedMessage[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  get length(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
