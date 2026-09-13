/**
 * Image URL Normalizer and Resolver
 *
 * Ensures all image paths (local disk uploads, S3 storage keys, private bucket URLs,
 * and base64 strings) resolve to reliable, authenticated, CORS-safe display URLs.
 */

const KNOWN_PRIVATE_STORAGE_HOSTS = [
  '.railway.internal',
  'minio:9000',
  'localhost:9000',
  '.r2.cloudflarestorage.com',
  'backblazeb2.com',
  'storage.railway.app',
  '.amazonaws.com',
  'digitaloceanspaces.com',
  'storage.googleapis.com',
  'blob.core.windows.net',
];

const KNOWN_STORAGE_FOLDERS = [
  'permits',
  'receipts',
  'reports',
  'uploads',
  'portraits',
  'licenses',
  'national_ids',
  'police_permits',
  'documents',
  'evidence',
  'avatars',
];

export interface ResolvedImageSources {
  primaryUrl: string;
  proxyUrl?: string;
  isDataOrBlob: boolean;
}

/**
 * Determines whether a URL points to a cloud storage bucket or private backend
 */
export function isCloudBucketUrl(url: string): boolean {
  if (!url) return false;
  return KNOWN_PRIVATE_STORAGE_HOSTS.some((host) => url.includes(host));
}

/**
 * Resolves any raw image source string into an optimal display URL
 */
export function resolveDisplayImageUrl(rawSrc?: string): ResolvedImageSources {
  if (!rawSrc || typeof rawSrc !== 'string' || rawSrc.trim() === '') {
    return { primaryUrl: '', isDataOrBlob: false };
  }

  const src = rawSrc.trim();

  // 1. Data URLs and Blob Object URLs: Instant local rendering
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return {
      primaryUrl: src,
      isDataOrBlob: true,
    };
  }

  // 2. Already an API storage route
  if (src.startsWith('/api/storage/file/') || src.startsWith('/api/storage/proxy')) {
    return {
      primaryUrl: src,
      proxyUrl: src.startsWith('/api/storage/file/')
        ? `/api/storage/proxy?url=${encodeURIComponent(src)}`
        : undefined,
      isDataOrBlob: false,
    };
  }

  // 3. /uploads/... route -> Normalize to /api/storage/file/... for guaranteed S3 + cache serving
  if (src.startsWith('/uploads/')) {
    const cleanKey = src.replace(/^\/uploads\//, '');
    return {
      primaryUrl: `/api/storage/file/${cleanKey}`,
      proxyUrl: `/api/storage/proxy?url=${encodeURIComponent(src)}`,
      isDataOrBlob: false,
    };
  }

  // 4. Relative paths starting with known storage folders (e.g. "permits/portraits/123.jpg")
  const startsWithKnownFolder = KNOWN_STORAGE_FOLDERS.some(
    (folder) => src.startsWith(`${folder}/`) || src.startsWith(`uploads/${folder}/`)
  );
  if (startsWithKnownFolder) {
    const cleanKey = src.replace(/^uploads\//, '');
    return {
      primaryUrl: `/api/storage/file/${cleanKey}`,
      proxyUrl: `/api/storage/proxy?url=${encodeURIComponent(src)}`,
      isDataOrBlob: false,
    };
  }

  // 5. Remote HTTP/HTTPS URLs:
  if (src.startsWith('http://') || src.startsWith('https://')) {
    // If it points to an S3 bucket or private cloud storage, route through the server proxy
    // to bypass 403 AccessDenied XML responses
    if (isCloudBucketUrl(src)) {
      const proxy = `/api/storage/proxy?url=${encodeURIComponent(src)}`;
      return {
        primaryUrl: proxy,
        proxyUrl: proxy,
        isDataOrBlob: false,
      };
    }

    // Otherwise, attempt direct load, with proxy as fallback
    return {
      primaryUrl: src,
      proxyUrl: `/api/storage/proxy?url=${encodeURIComponent(src)}`,
      isDataOrBlob: false,
    };
  }

  // 6. Fallback: treat as a relative storage key
  const cleanKey = src.replace(/^\/+/, '').replace(/^uploads\//, '');
  return {
    primaryUrl: `/api/storage/file/${cleanKey}`,
    proxyUrl: `/api/storage/proxy?url=${encodeURIComponent(src)}`,
    isDataOrBlob: false,
  };
}
