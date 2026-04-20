import { getDownloadUrl } from '@vercel/blob';

/**
 * Returns a time-limited read URL for Vercel Blob clips when the store is private.
 * Public blob URLs are returned unchanged.
 */
export function resolvePlayClipReadUrl(clipBlobKey: string | null): string | null {
  if (!clipBlobKey) return null;
  if (!clipBlobKey.includes('blob.vercel-storage.com')) {
    return clipBlobKey;
  }
  try {
    return getDownloadUrl(clipBlobKey);
  } catch {
    return clipBlobKey;
  }
}
