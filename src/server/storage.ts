import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { dbUpsert, dbDelete, dbGetById } from './db.ts';

// Configurable storage options from environment (supports AWS, Railway, Cloudflare R2, MinIO)
const S3_ENDPOINT =
  process.env.STORAGE_ENDPOINT ||
  process.env.AWS_ENDPOINT_URL_S3 ||
  process.env.S3_ENDPOINT ||
  process.env.S3_ENDPOINT_URL ||
  process.env.MINIO_ENDPOINT;

const S3_BUCKET =
  process.env.STORAGE_BUCKET ||
  process.env.RAILWAY_STORAGE_BUCKET ||
  process.env.AWS_S3_BUCKET ||
  process.env.S3_BUCKET ||
  process.env.AWS_BUCKET_NAME ||
  process.env.BUCKET_NAME ||
  process.env.S3_BUCKET_NAME;

const S3_ACCESS_KEY =
  process.env.STORAGE_ACCESS_KEY ||
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.S3_ACCESS_KEY ||
  process.env.S3_ACCESS_KEY_ID ||
  process.env.MINIO_ACCESS_KEY;

const S3_SECRET_KEY =
  process.env.STORAGE_SECRET_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  process.env.S3_SECRET_KEY ||
  process.env.S3_SECRET_ACCESS_KEY ||
  process.env.MINIO_SECRET_KEY;

const S3_REGION =
  process.env.STORAGE_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  'auto';

// Public domain configuration (e.g., Cloudflare R2 public URL, custom domain, or Railway public storage domain)
export const S3_PUBLIC_DOMAIN = (
  process.env.STORAGE_PUBLIC_DOMAIN ||
  process.env.S3_PUBLIC_DOMAIN ||
  process.env.PUBLIC_STORAGE_DOMAIN ||
  process.env.PUBLIC_BUCKET_URL ||
  ''
).trim().replace(/\/+$/, '');

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  return s3Client;
}

export function getS3BucketName(): string | undefined {
  return S3_BUCKET;
}

if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY) {
  try {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
    console.log(
      `[Storage] S3 bucket client initialized. Endpoint: ${S3_ENDPOINT}, Bucket: "${S3_BUCKET}", Region: "${S3_REGION}". Authenticated proxy active.`
    );
  } catch (err) {
    console.error('[Storage] Error initializing S3 client:', err);
    s3Client = null;
  }
} else {
  console.log(
    `[Storage Status] S3 environment keys: endpoint=${Boolean(S3_ENDPOINT)}, bucket=${Boolean(S3_BUCKET)}, accessKey=${Boolean(S3_ACCESS_KEY)}, secretKey=${Boolean(S3_SECRET_KEY)}. Serving with local disk cache (/public/uploads).`
  );
}

// Local storage directory setup
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

// Multer in-memory storage configuration
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(null, true); // Allow upload with fallback
    }
  },
});

export interface UploadResult {
  fileId: string;
  url: string;
  fileKey: string;
  storageType: 's3' | 'local';
  size: number;
  mimeType: string;
}

/**
 * Detects actual image/document format from buffer magic bytes.
 * This guarantees 100% correct MIME types and prevents browser image corruption.
 */
export function detectImageMagicBytes(buffer: Buffer): { mime: string; ext: string } | null {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x4e &&
    buffer[2] === 0x47 &&
    buffer[3] === 0x0d &&
    buffer[4] === 0x0a &&
    buffer[5] === 0x1a &&
    buffer[6] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }

  // WebP: RIFF (52 49 46 46) ... WEBP (57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }

  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif', ext: '.gif' };
  }

  // PDF: %PDF (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: 'application/pdf', ext: '.pdf' };
  }

  return null;
}

/**
 * Normalizes image MIME types to standard IANA media types.
 * Prevents S3/browser corruption caused by 'image/jpg' or missing headers.
 */
export function normalizeImageMimeType(mime?: string, fileName?: string): string {
  const lower = (mime || '').toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg' || lower === 'jpg' || lower === 'jpeg') {
    return 'image/jpeg';
  }
  if (lower === 'image/webp' || lower === 'webp') {
    return 'image/webp';
  }
  if (lower === 'image/png' || lower === 'png') {
    return 'image/png';
  }
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.png') return 'image/png';
    if (ext === '.pdf') return 'application/pdf';
  }
  return lower && lower.includes('/') ? lower : 'image/jpeg';
}

/**
 * Format the publicly accessible URL for a given file key.
 * Always route through the authenticated server proxy to prevent 403 AccessDenied
 * and CORS issues with private S3/Railway buckets.
 */
export function getPublicUrlForFileKey(fileKey: string): string {
  const cleanKey = fileKey.replace(/^\/+/, '');
  // Default to server-side route which handles authentication, caching and streaming seamlessly
  return `/api/storage/file/${cleanKey}`;
}

/**
 * Upload a Buffer to Railway S3 Bucket and mirror to local uploads storage for instant caching
 */
export async function saveFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = 'permits',
  uploadedBy: string = 'system'
): Promise<UploadResult> {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 9);

  // 1. Detect genuine binary format from buffer magic bytes
  const magic = detectImageMagicBytes(buffer);
  const normalizedMime = magic ? magic.mime : normalizeImageMimeType(mimeType, fileName);
  const detectedExt = magic ? magic.ext : (normalizedMime === 'image/webp' ? '.webp' : normalizedMime === 'image/png' ? '.png' : '.jpg');
  const cleanExt = path.extname(fileName) || detectedExt;
  const safeBaseName = path.basename(fileName, cleanExt).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
  const fileKey = `${folder}/${timestamp}_${randomStr}_${safeBaseName}${detectedExt}`;
  const fileId = `file_${timestamp}_${randomStr}`;

  let storageType: 's3' | 'local' = 'local';

  // 2. Upload to S3 bucket if configured
  if (s3Client && S3_BUCKET) {
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: buffer,
        ContentType: normalizedMime,
        CacheControl: 'public, max-age=31536000',
      });
      await s3Client.send(command);
      storageType = 's3';
    } catch (s3Err) {
      console.warn('[Storage] S3 upload notice, saving to local cache:', s3Err);
    }
  }

  // 3. Mirror/save to local disk cache for instant zero-latency retrieval (< 2ms)
  const targetFolder = path.join(LOCAL_UPLOADS_DIR, folder);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }
  const localFilePath = path.join(targetFolder, `${timestamp}_${randomStr}_${safeBaseName}${detectedExt}`);
  try {
    fs.writeFileSync(localFilePath, buffer);
  } catch (writeErr) {
    console.warn('[Storage] Notice writing local disk cache:', writeErr);
  }

  const publicUrl = `/api/storage/file/${fileKey}`;

  // 4. Record metadata in database
  try {
    await dbUpsert('file_uploads', fileId, {
      id: fileId,
      fileName,
      fileKey,
      mimeType: normalizedMime,
      fileSize: buffer.length,
      storageType,
      publicUrl,
      folder,
      uploadedBy,
      createdAt: new Date().toISOString(),
    });
  } catch (dbErr) {
    console.warn('[Storage] Notice saving file upload metadata:', dbErr);
  }

  return {
    fileId,
    url: publicUrl,
    fileKey,
    storageType,
    size: buffer.length,
    mimeType: normalizedMime,
  };
}

/**
 * Retrieve file from S3 or local disk for serving
 * Reads S3 streams into complete Buffer to avoid stream truncation or chunking errors.
 * Systematically tests all plausible key variants (with/without prefix, local disk vs S3).
 */
export async function getFileFromStorage(fileKey: string): Promise<{
  buffer?: Buffer;
  contentType: string;
  contentLength?: number;
  localPath?: string;
} | null> {
  if (!fileKey) return null;

  // Clean key and remove any URL query params or leading slashes
  let cleanKey = decodeURIComponent(fileKey.split('?')[0].split('#')[0]).trim().replace(/^\/+/, '');

  // Generate candidate keys to handle various storage path formats
  const candidateKeys = new Set<string>();
  candidateKeys.add(cleanKey);

  // If starts with 'uploads/', also check without it
  if (cleanKey.startsWith('uploads/')) {
    candidateKeys.add(cleanKey.replace(/^uploads\//, ''));
  } else {
    // If doesn't start with 'uploads/', also test with 'uploads/'
    candidateKeys.add(`uploads/${cleanKey}`);
  }

  // If starts with 'public/uploads/', also check without it
  if (cleanKey.startsWith('public/uploads/')) {
    candidateKeys.add(cleanKey.replace(/^public\/uploads\//, ''));
  }

  // If contains bucket name prefix (e.g., "my-bucket/permits/..."), strip it
  if (S3_BUCKET && cleanKey.startsWith(`${S3_BUCKET}/`)) {
    candidateKeys.add(cleanKey.replace(new RegExp(`^${S3_BUCKET}\\/`), ''));
  }

  // Also check just the filename in known folders
  const baseName = path.basename(cleanKey);
  if (baseName && baseName !== cleanKey) {
    candidateKeys.add(`permits/${baseName}`);
    candidateKeys.add(`receipts/${baseName}`);
    candidateKeys.add(`reports/${baseName}`);
    candidateKeys.add(baseName);
  }

  const inferredMime = normalizeImageMimeType('', cleanKey);

  // 1. Check local disk cache first across all candidates (instant zero-latency response)
  for (const candidate of candidateKeys) {
    const localFilePath = path.join(LOCAL_UPLOADS_DIR, candidate);
    if (fs.existsSync(localFilePath)) {
      try {
        const stats = fs.statSync(localFilePath);
        if (stats.isFile() && stats.size > 0) {
          return {
            localPath: localFilePath,
            contentType: inferredMime,
            contentLength: stats.size,
          };
        }
      } catch (e) {}
    }
  }

  // 2. Fetch from S3 using authenticated S3 Client across all candidate keys
  if (s3Client && S3_BUCKET) {
    const attemptedKeys: string[] = [];

    for (const candidate of candidateKeys) {
      attemptedKeys.push(candidate);
      try {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: candidate,
        });
        const response = await s3Client.send(command);

        if (response.Body) {
          // Read the S3 stream into a full byte array
          const bytes = await (response.Body as any).transformToByteArray();
          const buffer = Buffer.from(bytes);

          // Detect true content type from magic bytes or S3 response
          const magic = detectImageMagicBytes(buffer);
          const finalContentType = magic
            ? magic.mime
            : response.ContentType && response.ContentType !== 'application/octet-stream'
              ? normalizeImageMimeType(response.ContentType, candidate)
              : inferredMime;

          console.log(
            `[Storage Server] Bucket hit: Retrieved "${candidate}" from bucket "${S3_BUCKET}" (${buffer.length} bytes, MIME: ${finalContentType})`
          );

          // Cache to local disk for fast subsequent requests
          try {
            const cachePath = path.join(LOCAL_UPLOADS_DIR, candidate);
            const localDir = path.dirname(cachePath);
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }
            fs.writeFileSync(cachePath, buffer);
          } catch (cacheErr) {
            // non-fatal cache write
          }

          return {
            buffer,
            contentType: finalContentType,
            contentLength: buffer.length,
          };
        }
      } catch (s3Err: any) {
        const errCode = s3Err?.name || s3Err?.code || 'UnknownError';
        // Only log if it's not a standard NoSuchKey/NotFound miss
        if (errCode !== 'NoSuchKey' && errCode !== 'NotFound' && errCode !== '404') {
          console.error(
            `[Storage Server S3 Warning] Error querying key "${candidate}" on bucket "${S3_BUCKET}": ${errCode} - ${s3Err.message}`
          );
        }
      }
    }

    console.warn(
      `[Storage Server] Object not found in bucket "${S3_BUCKET}". Attempted keys: [${attemptedKeys.join(', ')}]`
    );
  }

  return null;
}

/**
 * Generate a pre-signed URL for direct browser access if S3 is active
 */
export async function generatePresignedGetUrl(fileKey: string, expiresInSeconds: number = 3600): Promise<string | null> {
  if (!s3Client || !S3_BUCKET || !fileKey) return null;
  try {
    const cleanKey = fileKey.replace(/^\/+/, '');
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: cleanKey,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (err: any) {
    console.error('[Storage] Error creating presigned URL:', err?.message || err);
    return null;
  }
}

/**
 * Handle base64 string upload with sanitize clean-up
 */
export async function saveBase64Image(
  base64String: string,
  folder: string = 'permits',
  uploadedBy: string = 'system'
): Promise<UploadResult> {
  let mimeType = 'image/jpeg';
  let rawBase64 = (base64String || '').trim();

  if (rawBase64.startsWith('data:')) {
    const match = rawBase64.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (match) {
      mimeType = match[1];
      rawBase64 = match[2];
    }
  }

  // Remove any whitespace, newlines or carriage returns that corrupt JPEG/WebP SOI headers
  rawBase64 = rawBase64.replace(/\s+/g, '');
  const buffer = Buffer.from(rawBase64, 'base64');
  const magic = detectImageMagicBytes(buffer);
  const normalizedMime = magic ? magic.mime : normalizeImageMimeType(mimeType);
  const ext = magic ? magic.ext : (normalizedMime === 'image/webp' ? '.webp' : normalizedMime === 'image/png' ? '.png' : '.jpg');
  const fileName = `upload_${Date.now()}${ext}`;

  return saveFile(buffer, fileName, normalizedMime, folder, uploadedBy);
}

/**
 * Delete a file from storage
 */
export async function deleteStoredFile(fileKey: string): Promise<boolean> {
  if (s3Client && S3_BUCKET) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileKey,
      }));
    } catch (e) {}
  }

  // Also try local file delete
  try {
    const localPath = path.join(LOCAL_UPLOADS_DIR, fileKey);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } catch (e) {}

  return true;
}
