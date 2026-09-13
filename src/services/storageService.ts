/**
 * Storage Service - Bridge & Unified API
 *
 * Backed by ImageUploadManager:
 * - Pre-compression using bicubic downscaling
 * - Non-blocking async queue
 * - Bulletproof fallback to micro WebP/JPEG data URLs if offline
 */

import { imageUploadManager } from './imageUploadManager';

/**
 * Uploads an image (File, Blob, or Base64 data URL) to Railway S3 Storage / Express Storage API.
 */
export async function uploadDocumentPhoto(
  source: string | File | Blob,
  folder: string = 'permits'
): Promise<string> {
  if (!source) return '';

  const id = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const { remoteUrlPromise } = await imageUploadManager.upload(id, source, folder);
  return remoteUrlPromise;
}

/**
 * Checks if a string is a remote URL or server route rather than a heavy raw Base64 data string
 */
export function isRemoteStorageUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('/uploads/') ||
    url.startsWith('/api/storage/')
  );
}
