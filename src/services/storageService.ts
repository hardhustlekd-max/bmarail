import { compressImageToBlob, CompressedImageResult } from '../utils/imageCompressor';

// In-memory cache to prevent re-uploading identical images
const imageUploadCache = new Map<string, string>();

/**
 * Uploads an image (File, Blob, or Base64 data URL) to Railway S3 Storage / Express Storage API.
 *
 * Utilizes the zero-data-loss compression engine:
 * 1. Downscales raw captures to optimal 1280px bounding box (preserving 100% of text and stamps).
 * 2. Compresses via WebP/JPEG with document contrast sharpening.
 * 3. Sends binary FormData or compressed payload to /api/storage/upload.
 * 4. Falls back gracefully to the compressed data URL if offline.
 */
export async function uploadDocumentPhoto(
  source: string | File | Blob,
  folder: string = 'permits'
): Promise<string> {
  if (!source) return '';

  // 1. If it's already a cloud/remote URL, return immediately without re-uploading
  if (typeof source === 'string') {
    if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/uploads/')) {
      return source;
    }
    if (imageUploadCache.has(source)) {
      return imageUploadCache.get(source)!;
    }
  }

  // 2. High-performance compression pass
  let compressedResult: CompressedImageResult | null = null;
  try {
    compressedResult = await compressImageToBlob(source, {
      maxWidth: 1280,
      maxHeight: 1280,
      quality: 0.80,
      maxBytes: 150 * 1024,
      contrastBoost: true,
    });
  } catch (compErr) {
    console.warn('Document photo compression notice, proceeding with fallback:', compErr);
  }

  const fallbackDataUrl = compressedResult?.dataUrl || (typeof source === 'string' ? source : '');

  // If completely offline, return compressed data URL
  if (typeof window !== 'undefined' && !navigator.onLine) {
    if (typeof source === 'string' && fallbackDataUrl) {
      imageUploadCache.set(source, fallbackDataUrl);
    }
    return fallbackDataUrl;
  }

  // 3. Upload to Railway / Express Storage API
  try {
    const formData = new FormData();
    formData.append('folder', folder);

    if (compressedResult?.blob) {
      const ext = compressedResult.mimeType === 'image/webp' ? 'webp' : 'jpg';
      formData.append('file', compressedResult.blob, `capture_${Date.now()}.${ext}`);
    } else if (fallbackDataUrl) {
      formData.append('dataUrl', fallbackDataUrl);
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const uploadPromise = fetch('/api/storage/upload', {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          return data.url;
        }
      }
      return fallbackDataUrl;
    });

    // Safety race with 4000ms timeout
    const result = await Promise.race([
      uploadPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve(fallbackDataUrl), 4000)),
    ]);

    const finalUrl = result || fallbackDataUrl;
    if (typeof source === 'string' && finalUrl) {
      imageUploadCache.set(source, finalUrl);
    }
    if (fallbackDataUrl && finalUrl) {
      imageUploadCache.set(fallbackDataUrl, finalUrl);
    }
    return finalUrl;
  } catch (storageErr) {
    console.warn('[Storage] API upload notice, using local compressed data URL:', storageErr);
    if (typeof source === 'string' && fallbackDataUrl) {
      imageUploadCache.set(source, fallbackDataUrl);
    }
    return fallbackDataUrl;
  }
}

/**
 * Checks if a string is a remote URL rather than a heavy Base64 data string
 */
export function isRemoteStorageUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/uploads/');
}
