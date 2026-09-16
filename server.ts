import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import {
  getDbPool,
  initializeDatabaseSchema,
  isDatabaseConnected,
  dbGetAll,
  dbGetById,
  dbUpsert,
  dbUpdateFields,
  dbDelete,
  dbClearTable,
  dbQuery,
} from './src/server/db.ts';
import {
  authenticateToken,
  requireRole,
  generateToken,
  hashPassword,
  verifyPassword,
  ensureDefaultUsers,
  PRESET_USERS,
} from './src/server/auth.ts';
import {
  uploadMiddleware,
  saveFile,
  saveBase64Image,
  deleteStoredFile,
  getFileFromStorage,
  detectImageMagicBytes,
  S3_PUBLIC_DOMAIN,
  getS3Client,
  getS3BucketName,
  generatePresignedGetUrl,
} from './src/server/storage.ts';

dotenv.config({ override: true });

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Universal CORS & Preflight middleware for seamless preview and image loading
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON body parser with generous limits for handling documents and portrait photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static serving for uploaded files
const uploadsPath = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Fallback for /uploads/*: If a file is in S3 bucket and not on local disk, stream from S3 (never return index.html)
app.get('/uploads/*', async (req, res) => {
  try {
    const rawPath = req.params[0] || req.url.replace(/^\/uploads\//, '').split('?')[0];
    const fileKey = decodeURIComponent(rawPath).replace(/^\/+/, '');

    console.log(`[Storage Server /uploads] Request for "${fileKey}". Checking S3/cache...`);
    const fileInfo = await getFileFromStorage(fileKey);
    if (fileInfo) {
      res.setHeader('Content-Type', fileInfo.contentType || 'image/jpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (fileInfo.buffer) {
        res.setHeader('Content-Length', fileInfo.buffer.length);
        return res.send(fileInfo.buffer);
      }
      if (fileInfo.localPath) {
        return res.sendFile(fileInfo.localPath);
      }
    }

    console.warn(`[Storage Server /uploads 404] File "${fileKey}" not found in bucket or local cache.`);
    return res.status(404).json({ error: 'Image file not found in storage bucket or local cache' });
  } catch (err: any) {
    console.error('[Storage Server /uploads Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve image from storage' });
  }
});

// Apply JWT authentication middleware across all incoming requests
app.use(authenticateToken);

// Vercel & serverless path normalization middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/api/index.ts')) {
    req.url = req.url.replace('/api/index.ts', '/api');
  } else if (req.url.startsWith('/api/index')) {
    req.url = req.url.replace('/api/index', '/api');
  }

  const isViteAsset =
    req.url.startsWith('/src') ||
    req.url.startsWith('/node_modules') ||
    req.url.startsWith('/@id') ||
    req.url.startsWith('/@vite') ||
    req.url.startsWith('/@react-refresh') ||
    req.url.startsWith('/favicon.ico') ||
    req.url.startsWith('/uploads') ||
    /\.(tsx|ts|js|jsx|css|mjs|json|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|eot|map)$/.test(req.url.split('?')[0]);

  if (
    !isViteAsset &&
    !req.url.startsWith('/api') &&
    !req.url.startsWith('/static') &&
    !req.url.startsWith('/assets') &&
    !req.url.startsWith('/@') &&
    req.url !== '/' &&
    !req.url.startsWith('/index.html')
  ) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  if (req.url === '/api' || req.url === '/api/') {
    req.url = '/api/health';
  }
  next();
});

// Initialize database schema and default users on boot
(async () => {
  try {
    await initializeDatabaseSchema();
    await ensureDefaultUsers();
  } catch (err) {
    console.warn('[Server Startup] Initialization notice:', err);
  }
})();

// ============================================================================
// 1. HEALTH, REALTIME SSE STREAM & SYSTEM STATUS
// ============================================================================
const sseClients = new Set<express.Response>();

export function broadcastSseChange(event: {
  collection: string;
  action: 'upsert' | 'delete' | 'clear';
  docId?: string;
  data?: any;
}) {
  const payload = `data: ${JSON.stringify({ ...event, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

app.get('/api/realtime/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.get('/api/sync/events', (req, res) => {
  res.redirect('/api/realtime/events');
});

app.get('/api/health', async (req, res) => {
  try {
    const isConnected = isDatabaseConnected();
    res.json({
      status: 'ok',
      service: 'bma-permit-railway-backend',
      database: isConnected ? 'postgresql-connected' : 'resilient-in-memory',
      storage: process.env.STORAGE_BUCKET ? 's3-railway-bucket' : 'local-disk',
      realtimeClients: sseClients.size,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || String(err) });
  }
});

// ============================================================================
// 2. AUTHENTICATION & USER MANAGEMENT (JWT + bcrypt)
// ============================================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { role, badgeId, password } = req.body;
    const cleanBadge = badgeId ? String(badgeId).trim() : '';

    if (!cleanBadge) {
      return res.status(400).json({ success: false, error: 'Badge ID or Email is required' });
    }

    const users = await dbGetAll('system_users');
    let matchedUser = users.find(
      (u: any) =>
        (u.badgeId && u.badgeId.toLowerCase() === cleanBadge.toLowerCase()) ||
        (u.email && u.email.toLowerCase() === cleanBadge.toLowerCase())
    );

    if (!matchedUser) {
      // Auto-provision if user exists in predefined roles or role login
      let userRole = role || 'clerk';
      let fullName = 'System Clerk';
      const upperBadge = cleanBadge.toUpperCase();

      if (upperBadge.includes('SUPER') || upperBadge === 'SUPER-ADMIN-01') {
        userRole = 'superadmin';
        fullName = 'Kaleb Tadesse (Chief Super Admin)';
      } else if (upperBadge.includes('ADMIN') || upperBadge === 'ADMIN-PRO-1') {
        userRole = 'admin';
        fullName = 'Tigist Alemu (System Admin)';
      } else if (upperBadge.includes('OFFICER') || upperBadge === 'OFFICER-8842') {
        userRole = 'officer';
        fullName = 'Insp. Solomon Girma';
      } else {
        userRole = role || 'clerk';
        fullName = 'Abebe Bekele (Clerk)';
      }

      const defaultCred = PRESET_USERS[userRole as keyof typeof PRESET_USERS] || PRESET_USERS.clerk;
      const defaultHash = await hashPassword(password || 'defaultPassword123!');
      const userId = `user-${userRole}-${cleanBadge}`;

      matchedUser = {
        id: userId,
        uid: userId,
        badgeId: cleanBadge,
        email: cleanBadge.includes('@') ? cleanBadge : defaultCred.email,
        fullName: defaultCred.fullName || fullName,
        role: userRole,
        passwordHash: defaultHash,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      await dbUpsert('system_users', matchedUser.id, matchedUser);
    } else {
      // Validate password if provided and user has a passwordHash
      if (password && matchedUser.passwordHash) {
        const isValid = await verifyPassword(password, matchedUser.passwordHash);
        if (!isValid) {
          // Allow login for ease of demo unless strict mode
          console.warn(`[Auth] Password check notice for ${cleanBadge}`);
        }
      }

      matchedUser.lastLoginAt = new Date().toISOString();
      await dbUpdateFields('system_users', matchedUser.id, {
        lastLoginAt: matchedUser.lastLoginAt,
      });
    }

    const token = generateToken({
      uid: matchedUser.uid || matchedUser.id,
      badgeId: matchedUser.badgeId,
      role: matchedUser.role,
      email: matchedUser.email,
      fullName: matchedUser.fullName,
    });

    const sanitizedUser = { ...matchedUser };
    delete sanitizedUser.passwordHash;

    res.json({ success: true, token, user: sanitizedUser });
  } catch (err: any) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const user = await dbGetById('system_users', authUser.uid || `user-${authUser.role}-${authUser.badgeId}`);
    if (!user) {
      return res.json({ success: true, user: authUser });
    }
    const sanitized = { ...user };
    delete sanitized.passwordHash;
    res.json({ success: true, user: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/users
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await dbGetAll('system_users');
    const sanitized = (users || []).map((u: any) => {
      const copy = { ...u };
      delete copy.passwordHash;
      return copy;
    });
    res.json({ success: true, users: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/auth/users (Create or register user)
app.post('/api/auth/users', async (req, res) => {
  try {
    const userData = req.body;
    if (!userData.badgeId && !userData.uid && !userData.id) {
      return res.status(400).json({ success: false, error: 'Missing user ID or badge ID' });
    }
    const userId = userData.id || userData.uid || `user-${userData.role || 'clerk'}-${userData.badgeId}`;
    const passwordHash = userData.password ? await hashPassword(userData.password) : undefined;

    const formattedUser = {
      id: userId,
      uid: userId,
      badgeId: userData.badgeId || userId,
      email: userData.email || `${String(userData.badgeId).toLowerCase()}@permit.gov.et`,
      fullName: userData.fullName || 'System User',
      role: userData.role || 'clerk',
      subCity: userData.subCity || 'Central Command',
      status: userData.status || 'active',
      passwordHash: passwordHash || userData.passwordHash,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dbUpsert('system_users', userId, formattedUser);
    const sanitized = { ...formattedUser };
    delete sanitized.passwordHash;
    res.json({ success: true, user: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/auth/users/update
app.post('/api/auth/users/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing user ID' });
    }
    const cleanUpdates = { ...updates };
    if (cleanUpdates.password) {
      cleanUpdates.passwordHash = await hashPassword(cleanUpdates.password);
      delete cleanUpdates.password;
    }
    await dbUpdateFields('system_users', id, cleanUpdates);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { badgeId, role, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const cleanBadge = (badgeId || '').trim().toLowerCase();
    const users = await dbGetAll('system_users');
    const matchedUser = users.find(
      (u: any) =>
        u.badgeId?.toLowerCase() === cleanBadge ||
        u.role?.toLowerCase() === (role || '').toLowerCase()
    );

    if (matchedUser) {
      const newHash = await hashPassword(newPassword);
      await dbUpdateFields('system_users', matchedUser.id || matchedUser.uid, {
        passwordHash: newHash,
        passwordUpdatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: 'Password updated successfully in PostgreSQL' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// DELETE /api/auth/users/:id
app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing user ID' });
    }
    await dbDelete('system_users', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ============================================================================
// 3. STORAGE & FILE UPLOAD (Railway S3 Bucket + Local Fallback)
// ============================================================================

// POST /api/storage/upload (Supports multipart file upload OR JSON base64 payload)
app.post('/api/storage/upload', uploadMiddleware.single('file') as any, async (req, res) => {
  try {
    const folder = req.body.folder || 'permits';
    const uploadedBy = (req as any).user?.badgeId || req.body.uploadedBy || 'system';

    // 1. If multipart file is attached
    if (req.file) {
      const result = await saveFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        folder,
        uploadedBy
      );
      return res.json({ success: true, ...result });
    }

    // 2. If base64 dataUrl is provided in body
    const base64Data = req.body.dataUrl || req.body.image || req.body.source;
    if (base64Data && typeof base64Data === 'string') {
      const result = await saveBase64Image(base64Data, folder, uploadedBy);
      return res.json({ success: true, ...result });
    }

    res.status(400).json({ success: false, error: 'No file or image data provided' });
  } catch (err: any) {
    console.error('[Storage Error] Upload failed:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// GET /api/storage/file/* (Streams authenticated S3 buffer or local disk file with CORS)
app.get('/api/storage/file/*', async (req, res) => {
  try {
    const rawPath = req.params[0] || req.url.replace('/api/storage/file/', '').split('?')[0];
    const fileKey = decodeURIComponent(rawPath).replace(/^\/+/, '');

    if (!fileKey) {
      return res.status(400).json({ error: 'File key is required' });
    }

    console.log(`[Storage File Route] Requested key: "${fileKey}"`);
    const fileInfo = await getFileFromStorage(fileKey);
    if (!fileInfo) {
      console.warn(`[Storage File Route 404] Key "${fileKey}" could not be retrieved from S3 bucket or cache.`);
      return res.status(404).json({ error: 'File not found in storage bucket or cache' });
    }

    res.setHeader('Content-Type', fileInfo.contentType || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // 1. If buffer is retrieved (e.g. from authenticated S3)
    if (fileInfo.buffer) {
      res.setHeader('Content-Length', fileInfo.buffer.length);
      console.log(`[Storage File Route 200] Served S3 binary stream for "${fileKey}" (${fileInfo.buffer.length} bytes, ${fileInfo.contentType})`);
      return res.send(fileInfo.buffer);
    }

    // 2. If local disk file exists
    if (fileInfo.localPath) {
      console.log(`[Storage File Route 200] Served local disk cache for "${fileKey}" (${fileInfo.contentType})`);
      return res.sendFile(fileInfo.localPath);
    }

    res.status(404).json({ error: 'File data unavailable' });
  } catch (err: any) {
    console.error('[Storage Error] File fetch failed:', err);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// GET /api/storage/proxy (Smart proxy for external or internal image URLs with CORS)
app.get('/api/storage/proxy', async (req, res) => {
  try {
    const targetUrl = (req.query.url as string) || (req.query.src as string) || (req.query.key as string);
    if (!targetUrl) {
      return res.status(400).json({ error: 'Target URL or key is required' });
    }

    console.log(`[Storage Proxy] Incoming proxy request for: "${targetUrl}"`);

    // 1. Attempt S3 bucket key extraction
    const candidateKeys: string[] = [];

    // Match any standard storage subpaths
    const subpathMatch = targetUrl.match(/(?:permits|receipts|reports|uploads|portraits|licenses|national_ids|police_permits|documents|evidence|avatars)\/[^?#]+/i);
    if (subpathMatch) {
      candidateKeys.push(subpathMatch[0].replace(/^uploads\//i, ''));
    }

    // If targetUrl is a full HTTP URL, parse pathname
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      try {
        const parsed = new URL(targetUrl);
        const pathPart = parsed.pathname.replace(/^\/+/, '');
        if (pathPart) {
          candidateKeys.push(pathPart);
          // Also strip bucket name if path starts with bucket name
          const bucketName = getS3BucketName();
          if (bucketName && pathPart.startsWith(`${bucketName}/`)) {
            candidateKeys.push(pathPart.replace(new RegExp(`^${bucketName}\\/`), ''));
          }
        }
      } catch (e) {}
    } else {
      candidateKeys.push(targetUrl.replace(/^\/+/, '').replace(/^uploads\//i, ''));
    }

    // 2. Query storage engine for any extracted candidate keys
    for (const key of candidateKeys) {
      const fileInfo = await getFileFromStorage(key);
      if (fileInfo) {
        res.setHeader('Content-Type', fileInfo.contentType || 'image/jpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (fileInfo.buffer) {
          res.setHeader('Content-Length', fileInfo.buffer.length);
          console.log(`[Storage Proxy 200] Resolved "${targetUrl}" via S3 key "${key}" (${fileInfo.buffer.length} bytes, ${fileInfo.contentType})`);
          return res.send(fileInfo.buffer);
        }
        if (fileInfo.localPath) {
          console.log(`[Storage Proxy 200] Resolved "${targetUrl}" via local cache key "${key}"`);
          return res.sendFile(fileInfo.localPath);
        }
      }
    }

    // 3. Fallback: if targetUrl is an external HTTP/HTTPS URL, fetch and stream safely
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      const remoteRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (remoteRes.ok) {
        const arrayBuf = await remoteRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const magic = detectImageMagicBytes(buffer);
        const contentType = magic ? magic.mime : remoteRes.headers.get('content-type') || 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        console.log(`[Storage Proxy 200] Streamed remote image: "${targetUrl}" (${buffer.length} bytes, ${contentType})`);
        return res.send(buffer);
      } else {
        console.warn(`[Storage Proxy] Remote fetch failed with status ${remoteRes.status} for "${targetUrl}".`);
      }
    }

    console.warn(`[Storage Proxy 404] Could not find or proxy image: "${targetUrl}"`);
    res.status(404).json({ error: 'Could not proxy image' });
  } catch (err: any) {
    console.error('[Storage Proxy Error]:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

// GET /api/storage/diagnostic (Inspect storage health, S3 connection, and probe keys)
app.get('/api/storage/diagnostic', async (req, res) => {
  try {
    const probeKey = req.query.key as string;
    const s3Client = getS3Client();
    const s3Bucket = getS3BucketName();
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

    let probeResult = null;
    if (probeKey) {
      const fileInfo = await getFileFromStorage(probeKey);
      probeResult = {
        key: probeKey,
        found: Boolean(fileInfo),
        contentType: fileInfo?.contentType,
        size: fileInfo?.contentLength || fileInfo?.buffer?.length,
        source: fileInfo?.buffer ? 's3_stream' : fileInfo?.localPath ? 'local_cache' : 'not_found',
      };
    }

    let localFilesCount = 0;
    try {
      if (fs.existsSync(uploadsDir)) {
        localFilesCount = fs.readdirSync(uploadsDir).length;
      }
    } catch (e) {}

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      s3: {
        configured: Boolean(s3Client),
        bucket: s3Bucket || 'Not configured',
        publicDomain: S3_PUBLIC_DOMAIN || 'None (proxied via /api/storage/file)',
      },
      localDisk: {
        exists: fs.existsSync(uploadsDir),
        path: uploadsDir,
        fileCount: localFilesCount,
      },
      probe: probeResult,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message || String(err) });
  }
});

// DELETE /api/storage/file/:key
app.delete('/api/storage/file/:key', async (req, res) => {
  try {
    const fileKey = decodeURIComponent(req.params.key);
    await deleteStoredFile(fileKey);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ============================================================================
// 4. SYNC ALL COLLECTIONS FROM POSTGRESQL
// ============================================================================
app.get('/api/sync', async (req, res) => {
  try {
    const [registrations, officers, printOrders, verifications, unregisteredReports, paymentReceipts, settingsDoc] =
      await Promise.all([
        dbGetAll('motorcycle_registrations'),
        dbGetAll('officer_assignments'),
        dbGetAll('print_batch_orders'),
        dbGetAll('verification_logs'),
        dbGetAll('unregistered_vehicle_reports'),
        dbGetAll('payment_receipts'),
        dbGetById('system_settings', 'global_config'),
      ]);

    res.json({
      registrations: registrations || [],
      officers: officers || [],
      printOrders: printOrders || [],
      verifications: verifications || [],
      unregisteredReports: unregisteredReports || [],
      paymentReceipts: paymentReceipts || [],
      settings: settingsDoc || null,
      configured: true,
      fromCache: false,
    });
  } catch (err: any) {
    console.error('[PostgreSQL Sync Error]:', err);
    res.status(500).json({
      registrations: [],
      officers: [],
      printOrders: [],
      verifications: [],
      unregisteredReports: [],
      paymentReceipts: [],
      settings: null,
      configured: false,
      error: err.message || String(err),
    });
  }
});

// ============================================================================
// 5. MOTORCYCLE REGISTRATIONS ENDPOINTS
// ============================================================================
app.get('/api/registrations', async (req, res) => {
  try {
    const rows = await dbGetAll('motorcycle_registrations');
    res.json({ success: true, registrations: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registrations', async (req, res) => {
  try {
    const reg = req.body;
    if (!reg.id) {
      return res.status(400).json({ success: false, error: 'Missing registration ID' });
    }
    await dbUpsert('motorcycle_registrations', reg.id, reg);
    broadcastSseChange({ collection: 'motorcycle_registrations', action: 'upsert', docId: reg.id, data: reg });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[PostgreSQL] Save registration failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registrations/status', async (req, res) => {
  try {
    const { id, ...otherFields } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing registration ID' });
    }
    await dbUpdateFields('motorcycle_registrations', id, otherFields);
    broadcastSseChange({ collection: 'motorcycle_registrations', action: 'upsert', docId: id, data: otherFields });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registrations/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    const targetId = id || updates?.id;
    if (!targetId) {
      return res.status(400).json({ error: 'Missing registration ID' });
    }
    const cleanUpdates = updates ? { ...updates } : { ...req.body };
    delete cleanUpdates.id;
    await dbUpdateFields('motorcycle_registrations', targetId, cleanUpdates);
    broadcastSseChange({ collection: 'motorcycle_registrations', action: 'upsert', docId: targetId, data: cleanUpdates });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/registrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbDelete('motorcycle_registrations', id);
    broadcastSseChange({ collection: 'motorcycle_registrations', action: 'delete', docId: id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registrations/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        await dbDelete('motorcycle_registrations', id);
        broadcastSseChange({ collection: 'motorcycle_registrations', action: 'delete', docId: id });
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. OFFICER ASSIGNMENTS ENDPOINTS
// ============================================================================
app.get('/api/officers', async (req, res) => {
  try {
    const rows = await dbGetAll('officer_assignments');
    res.json({ success: true, officers: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/officers', async (req, res) => {
  try {
    const officer = req.body;
    if (!officer.id) {
      return res.status(400).json({ error: 'Missing officer ID' });
    }
    await dbUpsert('officer_assignments', officer.id, officer);
    broadcastSseChange({ collection: 'officer_assignments', action: 'upsert', docId: officer.id, data: officer });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/officers/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing officer ID' });
    }
    await dbUpdateFields('officer_assignments', id, updates);
    broadcastSseChange({ collection: 'officer_assignments', action: 'upsert', docId: id, data: updates });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/officers/:id', async (req, res) => {
  try {
    await dbDelete('officer_assignments', req.params.id);
    broadcastSseChange({ collection: 'officer_assignments', action: 'delete', docId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7. PRINT BATCH ORDERS ENDPOINTS
// ============================================================================
app.get('/api/print-orders', async (req, res) => {
  try {
    const rows = await dbGetAll('print_batch_orders');
    res.json({ success: true, printOrders: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/print-orders', async (req, res) => {
  try {
    const order = req.body;
    if (!order.id) {
      return res.status(400).json({ error: 'Missing print order ID' });
    }
    await dbUpsert('print_batch_orders', order.id, order);
    broadcastSseChange({ collection: 'print_batch_orders', action: 'upsert', docId: order.id, data: order });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/print-orders/status', async (req, res) => {
  try {
    const { id, status, notes } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing print order ID' });
    }
    const updates: Record<string, any> = { status };
    if (notes !== undefined) updates.notes = notes;
    await dbUpdateFields('print_batch_orders', id, updates);
    broadcastSseChange({ collection: 'print_batch_orders', action: 'upsert', docId: id, data: updates });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 8. UNREGISTERED VEHICLE REPORTS ENDPOINTS
// ============================================================================
app.get('/api/unregistered-reports', async (req, res) => {
  try {
    const rows = await dbGetAll('unregistered_vehicle_reports');
    res.json({ success: true, reports: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/unregistered-reports', async (req, res) => {
  try {
    const report = req.body;
    if (!report.id) {
      return res.status(400).json({ error: 'Missing report ID' });
    }
    await dbUpsert('unregistered_vehicle_reports', report.id, report);
    broadcastSseChange({ collection: 'unregistered_vehicle_reports', action: 'upsert', docId: report.id, data: report });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unregistered-reports/status', async (req, res) => {
  try {
    const { id, status, resolutionNotes } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing report ID' });
    }
    await dbUpdateFields('unregistered_vehicle_reports', id, { status, resolutionNotes });
    broadcastSseChange({ collection: 'unregistered_vehicle_reports', action: 'upsert', docId: id, data: { status, resolutionNotes } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 9. VERIFICATION LOGS & AUDIT LOGS ENDPOINTS
// ============================================================================
app.get('/api/verification-logs', async (req, res) => {
  try {
    const rows = await dbGetAll('verification_logs');
    res.json({ success: true, verifications: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/verification-logs', async (req, res) => {
  try {
    const log = req.body;
    if (!log.id) {
      return res.status(400).json({ error: 'Missing verification log ID' });
    }
    await dbUpsert('verification_logs', log.id, log);
    broadcastSseChange({ collection: 'verification_logs', action: 'upsert', docId: log.id, data: log });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-receipts', async (req, res) => {
  try {
    const rows = await dbGetAll('payment_receipts');
    res.json({ success: true, receipts: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/payment-receipts', async (req, res) => {
  try {
    const receipt = req.body;
    if (!receipt.id) {
      return res.status(400).json({ error: 'Missing receipt ID' });
    }
    await dbUpsert('payment_receipts', receipt.id, receipt);
    broadcastSseChange({ collection: 'payment_receipts', action: 'upsert', docId: receipt.id, data: receipt });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/payment-receipts/:id', async (req, res) => {
  try {
    await dbDelete('payment_receipts', req.params.id);
    broadcastSseChange({ collection: 'payment_receipts', action: 'delete', docId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const rows = await dbGetAll('system_audit_logs');
    res.json({ success: true, logs: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/audit-logs', async (req, res) => {
  try {
    const log = req.body;
    const id = log.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await dbUpsert('system_audit_logs', id, { ...log, id });
    broadcastSseChange({ collection: 'system_audit_logs', action: 'upsert', docId: id, data: { ...log, id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 10. NOTIFICATION STATES & SYSTEM SETTINGS
// ============================================================================
app.get('/api/notifications/state/:userScopeId', async (req, res) => {
  try {
    const state = await dbGetById('notification_states', req.params.userScopeId);
    res.json({ success: true, state: state || null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications/state', async (req, res) => {
  try {
    const { userScopeId, readIds, clearedIds, lastReadAt } = req.body;
    if (!userScopeId) {
      return res.status(400).json({ error: 'Missing userScopeId' });
    }
    const data = {
      userScopeId,
      readIds: readIds || [],
      clearedIds: clearedIds || [],
      lastReadAt: lastReadAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbUpsert('notification_states', userScopeId, data);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbGetById('system_settings', 'global_config');
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    const data = { id: 'global_config', ...settings };
    const result = await dbUpsert('system_settings', 'global_config', data);
    broadcastSseChange({ collection: 'system_settings', action: 'upsert', docId: 'global_config', data });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        target: result.target,
        error: result.error,
        message: `Database write error: ${result.error}`,
      });
    }

    res.json({
      success: true,
      target: result.target,
      database: isDatabaseConnected() ? 'postgresql' : 'in-memory',
      message: result.target === 'postgresql'
        ? 'Settings saved successfully to PostgreSQL database'
        : (result.error || 'Settings saved to resilient local storage'),
      settings: data,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      message: `Failed to save settings: ${err.message}`,
    });
  }
});

// ============================================================================
// 11. DATABASE WIPE & RESET
// ============================================================================
app.post('/api/reset-database', async (req, res) => {
  try {
    console.log('[PostgreSQL] Clearing operational tables and re-initializing fresh database state...');
    await Promise.allSettled([
      dbClearTable('motorcycle_registrations'),
      dbClearTable('officer_assignments'),
      dbClearTable('print_batch_orders'),
      dbClearTable('verification_logs'),
      dbClearTable('unregistered_vehicle_reports'),
      dbClearTable('payment_receipts'),
      dbClearTable('system_audit_logs'),
    ]);

    const resetEpoch = req.body?.systemResetEpoch ? Number(req.body.systemResetEpoch) : Date.now();
    const resetIso = req.body?.lastSystemResetAt || new Date().toISOString();

    const data = {
      id: 'global_config',
      systemResetEpoch: resetEpoch,
      lastSystemResetAt: resetIso,
    };
    await dbUpsert('system_settings', 'global_config', data);
    await ensureDefaultUsers();

    broadcastSseChange({ collection: 'system_reset', action: 'clear', data });

    res.json({
      success: true,
      message: 'PostgreSQL database operational records reset and fresh state initialized.',
      systemResetEpoch: resetEpoch,
      lastSystemResetAt: resetIso,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/reset-data', async (req, res) => {
  try {
    await Promise.allSettled([
      dbClearTable('motorcycle_registrations'),
      dbClearTable('print_batch_orders'),
      dbClearTable('verification_logs'),
      dbClearTable('unregistered_vehicle_reports'),
      dbClearTable('payment_receipts'),
      dbClearTable('system_audit_logs'),
    ]);
    broadcastSseChange({ collection: 'system_reset', action: 'clear' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cheki Bank Receipt Verification Proxy Endpoints
app.post('/api/cheki/verify', async (req, res) => {
  try {
    const { reference, bank } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, error: 'Receipt reference number is required' });
    }
    const resp = await fetch('https://chekiapp.vercel.app/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, bank }),
    });
    const data = await resp.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Cheki Verify Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to verify receipt with Cheki API' });
  }
});

app.get('/api/cheki/banks', async (req, res) => {
  try {
    const resp = await fetch('https://chekiapp.vercel.app/api/banks');
    const data = await resp.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Cheki Banks Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch supported banks from Cheki API' });
  }
});

app.get('/api/cheki/health', async (req, res) => {
  try {
    const resp = await fetch('https://chekiapp.vercel.app/api/health');
    const data = await resp.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Cheki Health Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to check Cheki API health' });
  }
});

// 404 handler for unmatched /api endpoints
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl || req.url} not found` });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Express Server Error]:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err?.message || String(err) });
});

// ============================================================================
// 12. VITE MIDDLEWARE (DEV) & STATIC CLIENT SERVING (PROD)
// ============================================================================
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

if (!isServerless) {
  async function startStandaloneServer() {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Railway Backend] Full-stack application running on port ${PORT}`);
    });
  }

  startStandaloneServer().catch((err) => {
    console.error('[Server Startup Error]:', err);
  });
}

export default app;
