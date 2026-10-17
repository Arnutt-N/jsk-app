export function stubBroadcastChannel(): void {
  if (typeof globalThis.BroadcastChannel === 'undefined') {
    (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = class {
      postMessage() {}
      close() {}
      set onmessage(_: unknown) {}
    };
  }
}
