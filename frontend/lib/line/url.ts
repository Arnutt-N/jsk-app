/**
 * Shared URL guard for LINE message previews.
 *
 * Payloads are admin-supplied JSON, so only allow http(s) image URLs and block
 * `javascript:` / `data:` URIs as defense-in-depth even though the authoring
 * page is authenticated.
 */
export function isSafeImageUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const protocol = new URL(url, 'https://line.invalid').protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
