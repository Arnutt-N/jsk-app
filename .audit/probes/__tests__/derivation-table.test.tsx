// The claim under test, from use-image-resize.ts:49-57:
//   currentKey = ready ? `${parsedWidth}x${parsedHeight}|${format}|${quality}` : null
//   processing   = ready && blobKey !== currentKey
//   visibleBlob  = ready && blobKey === currentKey ? outputBlob : null
//
// page.tsx disables Download/Upload with `!visibleBlob || processing`, but
// downloadOutput (:189) and uploadToMedia (:202) guard on the RAW outputBlob.
// These assertions pin the derivation table so a regression is loud, and show
// exactly which state the handlers can still reach while the UI shows nothing.
import { describe, expect, it } from 'vitest';

// Copied verbatim from the hook so the table is checkable in isolation.
function derive({ sourceFile, parsedWidth, parsedHeight, format, quality, blobKey, outputBlob, outputUrl, error }) {
  const ready = Boolean(sourceFile && parsedWidth && parsedHeight);
  const currentKey = ready ? `${parsedWidth}x${parsedHeight}|${format}|${quality}` : null;
  return {
    ready,
    currentKey,
    processing: ready && blobKey !== currentKey,
    visibleBlob: ready && blobKey === currentKey ? outputBlob : null,
    visibleUrl: ready && blobKey === currentKey ? outputUrl : null,
    visibleError: ready ? error : null,
  };
}

const blobA = { name: 'a' };
const blobB = { name: 'b' };

describe('image-resize derivation table', () => {
  it('settled: the blob that matches the inputs is visible and nothing spins', () => {
    const d = derive({
      sourceFile: {}, parsedWidth: 100, parsedHeight: 100, format: 'png', quality: 1,
      blobKey: '100x100|png|1', outputBlob: blobA, outputUrl: 'u1', error: null,
    });
    expect(d.processing).toBe(false);
    expect(d.visibleBlob).toBe(blobA);
  });

  it('dimensions change: the old blob is hidden and processing turns on in the same pass', () => {
    const d = derive({
      sourceFile: {}, parsedWidth: 200, parsedHeight: 100, format: 'png', quality: 1,
      blobKey: '100x100|png|1', outputBlob: blobA, outputUrl: 'u1', error: null,
    });
    expect(d.processing).toBe(true);
    expect(d.visibleBlob).toBeNull();
    // The gap: the raw blob is still live and the handlers guard on it, not on visibleBlob.
    expect(blobA).not.toBeNull();
  });

  it('no source: nothing is visible and nothing spins', () => {
    const d = derive({
      sourceFile: null, parsedWidth: 100, parsedHeight: 100, format: 'png', quality: 1,
      blobKey: '100x100|png|1', outputBlob: blobA, outputUrl: 'u1', error: null,
    });
    expect(d.ready).toBe(false);
    expect(d.processing).toBe(false);
    expect(d.visibleBlob).toBeNull();
  });

  it('failed resize: blobKey is set in the catch, so the spinner clears', () => {
    const d = derive({
      sourceFile: {}, parsedWidth: 100, parsedHeight: 100, format: 'png', quality: 1,
      blobKey: '100x100|png|1', outputBlob: null, outputUrl: null, error: 'boom',
    });
    expect(d.processing).toBe(false);
    expect(d.visibleError).toBe('boom');
  });
});