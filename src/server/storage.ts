import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { dbUpsert, dbDelete, dbGetById } from './db.ts';

// Configurable storage options from environment
const S3_ENDPOINT = process.env.STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
const S3_BUCKET = process.env.STORAGE_BUCKET || process.env.RAILWAY_STORAGE_BUCKET || process.env.AWS_S3_BUCKET;
const S3_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const S3_REGION = process.env.STORAGE_REGION || process.env.AWS_REGION || 'auto';

// Public domain configuration (e.g., Cloudflare R2 public URL, custom domain, or Railway public storage domain)
export const S3_PUBLIC_DOMAIN = (
  process.env.STORAGE_PUBLIC_DOMAIN ||
  process.env.S3_PUBLIC_DOMAIN ||
  process.env.PUBLIC_STORAGE_DOMAIN ||
  process.env.PUBLIC_BUCKET_URL ||
  ''
).trim().replace(/\/+$/, '');

let s3Client: S3Client | null = null;

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
    console.log(`[Storage] S3-compatible Railway Storage Bucket client configured for bucket "${S3_BUCKET}". Public domain: ${S3_PUBLIC_DOMAIN || 'None (proxied via /api/storage/file)'}`);
  } catch (err) {
    console.warn('[Storage] Could not initialize S3 client:', err);
    s3Client = null;
  }
} else {
  console.log('[Storage] S3 credentials not provided. Using persistent local disk storage (/public/uploads) with Express serving.');
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
 * Format the publicly accessible URL for a given file key
 */
export function getPublicUrlForFileKey(fileKey: string): string {
  const cleanKey = fileKey.replace(/^\/+/, '');
  if (S3_PUBLIC_DOMAIN) {
    const domain = S3_PUBLIC_DOMAIN.startsWith('http://') || S3_PUBLIC_DOMAIN.startsWith('https://')
      ? S3_PUBLIC_DOMAIN
      : `https://${S3_PUBLIC_DOMAIN}`;
    return `${domain}/${cleanKey}`;
  }
  // Default to server-side proxy route which handles redirection or streaming seamlessly
  return `/api/storage/file/${cleanKey}`;
}

/**
 * Upload a Buffer to Railway S3 Bucket or Local uploads storage
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
  const cleanExt = path.extname(fileName) || (mimeType.includes('webp') ? '.webp' : mimeType.includes('png') ? '.png' : '.jpg');
  const safeBaseName = path.basename(fileName, cleanExt).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileKey = `${folder}/${timestamp}_${randomStr}_${safeBaseName}${cleanExt}`;
  const fileId = `file_${timestamp}_${randomStr}`;

  let publicUrl = '';
  let storageType: 's3' | 'local' = 'local';

  // 1. Try S3 upload if configured
  if (s3Client && S3_BUCKET) {
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000',
      });
      await s3Client.send(command);

      publicUrl = getPublicUrlForFileKey(fileKey);
      storageType = 's3';
    } catch (s3Err) {
      console.warn('[Storage] S3 upload error, falling back to local file storage:', s3Err);
    }
  }

  // 2. Fallback to local disk storage
  if (!publicUrl) {
    const targetFolder = path.join(LOCAL_UPLOADS_DIR, folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    const localFilePath = path.join(targetFolder, `${timestamp}_${randomStr}_${safeBaseName}${cleanExt}`);
    fs.writeFileSync(localFilePath, buffer);
    publicUrl = `/uploads/${folder}/${timestamp}_${randomStr}_${safeBaseName}${cleanExt}`;
    storageType = 'local';
  }

  // 3. Record metadata in database
  try {
    await dbUpsert('file_uploads', fileId, {
      id: fileId,
      fileName,
      fileKey,
      mimeType,
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
    mimeType,
  };
}

/**
 * Retrieve file stream from S3 or local disk for serving/redirecting
 */
export async function getFileFromStorage(fileKey: string): Promise<{
  stream?: any;
  buffer?: Buffer;
  contentType?: string;
  contentLength?: number;
  localPath?: string;
  publicRedirectUrl?: string;
} | null> {
  const cleanKey = fileKey.replace(/^\/+/, '');

  // If public domain is configured, direct the caller to redirect immediately
  if (S3_PUBLIC_DOMAIN) {
    const domain = S3_PUBLIC_DOMAIN.startsWith('http://') || S3_PUBLIC_DOMAIN.startsWith('https://')
      ? S3_PUBLIC_DOMAIN
      : `https://${S3_PUBLIC_DOMAIN}`;
    return { publicRedirectUrl: `${domain}/${cleanKey}` };
  }

  // 1. Try S3 GetObject
  if (s3Client && S3_BUCKET) {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: cleanKey,
      });
      const response = await s3Client.send(command);
      return {
        stream: response.Body,
        contentType: response.ContentType || 'image/jpeg',
        contentLength: response.ContentLength,
      };
    } catch (s3Err) {
      console.warn(`[Storage] S3 get error for key "${cleanKey}":`, s3Err);
    }
  }

  // 2. Try Local uploads disk
  const localFilePath = path.join(LOCAL_UPLOADS_DIR, cleanKey);
  if (fs.existsSync(localFilePath)) {
    return {
      localPath: localFilePath,
    };
  }

  return null;
}

/**
 * Handle base64 string upload
 */
export async function saveBase64Image(
  base64String: string,
  folder: string = 'permits',
  uploadedBy: string = 'system'
): Promise<UploadResult> {
  let mimeType = 'image/jpeg';
  let rawBase64 = base64String;

  if (base64String.startsWith('data:')) {
    const match = base64String.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      rawBase64 = match[2];
    }
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const fileName = `upload_${Date.now()}.${ext}`;

  return saveFile(buffer, fileName, mimeType, folder, uploadedBy);
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
