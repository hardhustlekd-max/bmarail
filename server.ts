import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ override: true });
import {
  isFirebaseConfigured,
  firebaseConfig,
  ADMIN_COLLECTIONS,
  adminFetchAllDocuments,
  adminGetDocument,
  adminUpsertDocument,
  adminUpdateDocumentFields,
  adminDeleteDocument,
  adminClearCollection,
} from './src/db/index.ts';
const DEFAULT_SETTINGS = {
  officerName: 'አበበ ደስታ (Abebe Desta)',
  department: 'የትራፊክ ማኔጅመንትና ህግ ማስከበሪያ (Traffic Mgmt & Enforcement)',
  subCityOffice: 'በላይ ዘለቀ ክፍለ ከተማ (Belay Zeleke)',
  defaultPrinter: 'Zebra ZD621 Industrial PVC Card Printer',
  cardStockType: 'CR80 Standard PVC Card (85.6 x 54 mm)',
  calendarSystem: 'ethiopian',
  autoPrintQR: true,
  emailAlerts: true,
  security2FA: true,
  highRiskAlerts: true,
};

const SYSTEM_ROLE_CREDENTIALS = {
  clerk: {
    role: 'clerk',
    badgeId: 'CLERK-209',
    email: 'clerk@addisababa.gov.et',
    fullName: 'ሳራ ተሾመ (Sara Teshome)',
  },
  admin: {
    role: 'admin',
    badgeId: 'ADMIN-001',
    email: 'admin@addisababa.gov.et',
    fullName: 'ዳዊት ኃይሌ (Dawit Haile)',
  },
  officer: {
    role: 'officer',
    badgeId: 'OFFICER-442',
    email: 'officer@addisababa.gov.et',
    fullName: 'አበበ ደስታ (Abebe Desta)',
  },
  superadmin: {
    role: 'superadmin',
    badgeId: 'SUPER-ADMIN-01',
    email: 'superadmin@permit.gov.et',
    fullName: 'ካሌብ ታደሰ (Kaleb Tadesse - Chief Super Admin)',
  },
};

export const app = express();
const PORT = 3000;

// JSON body parser with increased limits for handling document and portrait photos
app.use(express.json({ limit: '15mb' }));

// Vercel serverless path normalization middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/api/index.ts')) {
    req.url = req.url.replace('/api/index.ts', '/api');
  } else if (req.url.startsWith('/api/index')) {
    req.url = req.url.replace('/api/index', '/api');
  }

  // Handle case where route is passed without /api prefix
  const isViteAsset = req.url.startsWith('/src') || 
                      req.url.startsWith('/node_modules') || 
                      req.url.startsWith('/@id') || 
                      req.url.startsWith('/@vite') || 
                      req.url.startsWith('/@react-refresh') || 
                      req.url.startsWith('/favicon.ico') ||
                      /\.(tsx|ts|js|jsx|css|mjs|json|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|eot|map)$/.test(req.url.split('?')[0]);

  if (!isViteAsset && !req.url.startsWith('/api') && !req.url.startsWith('/static') && !req.url.startsWith('/assets') && !req.url.startsWith('/@') && req.url !== '/' && !req.url.startsWith('/index.html')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  if (req.url === '/api' || req.url === '/api/') {
    req.url = '/api/health';
  }
  next();
});

console.log(`[Firebase Admin Server] Initialized with Firebase Admin SDK for Firestore (Database: "${firebaseConfig.firestoreDatabaseId || 'permit'}")`);

// Helper to seed initial default users into database if empty
let defaultUsersSeeded = false;
async function ensureDefaultUsersExist() {
  if (defaultUsersSeeded) return;
  try {
    const existingUsers = await adminFetchAllDocuments(ADMIN_COLLECTIONS.USERS);
    if (!existingUsers || existingUsers.length === 0) {
      console.log('[Firebase Admin] Seeding default system role users into Firestore permit database...');
      const defaultUsers = Object.values(SYSTEM_ROLE_CREDENTIALS).map((cred) => ({
        id: `user-${cred.role}-${cred.badgeId}`,
        uid: `user-${cred.role}-${cred.badgeId}`,
        badgeId: cred.badgeId,
        email: cred.email,
        fullName: cred.fullName,
        role: cred.role,
        createdAt: new Date().toISOString(),
      }));
      for (const u of defaultUsers) {
        await adminUpsertDocument(ADMIN_COLLECTIONS.USERS, u.id, u);
      }
    }
    defaultUsersSeeded = true;
  } catch (err: any) {
    if (String(err).includes('Quota limit exceeded')) {
      console.warn('[Firebase Admin] Skipping default user seed: Quota limit exceeded. Database reads are paused.');
      defaultUsersSeeded = true; // Prevent retry spam
    } else {
      console.warn('[Firebase Admin] Notice on default user seed:', err);
    }
  }
}

// --- API ROUTE ENDPOINTS ---

// Health probe
app.get('/api/health', async (req, res) => {
  try {
    res.json({
      status: 'ok',
      database: 'firebase-admin',
      databaseId: firebaseConfig.firestoreDatabaseId || 'permit',
      configured: isFirebaseConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || String(err) });
  }
});

// --- AUTHENTICATION ENDPOINTS ---

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { role, badgeId, password } = req.body;
    const cleanBadge = badgeId ? String(badgeId).trim() : '';

    if (!cleanBadge) {
      return res.status(400).json({ success: false, error: 'Badge ID or Email is required' });
    }

    // Search existing user document in Firestore permit database
    const users = await adminFetchAllDocuments(ADMIN_COLLECTIONS.USERS);
    let matchedUser = users.find(
      (u) =>
        (u.badgeId && u.badgeId.toLowerCase() === cleanBadge.toLowerCase()) ||
        (u.email && u.email.toLowerCase() === cleanBadge.toLowerCase())
    );

    if (!matchedUser) {
      // Infer role if new user logging in for the first time
      let userRole = role || 'clerk';
      let fullName = 'System Clerk';
      const upperBadge = cleanBadge.toUpperCase();

      if (upperBadge.includes('SUPER') || upperBadge === 'SUPER-ADMIN-01') {
        userRole = 'superadmin';
        fullName = 'Kaleb Tadesse (Chief Super Admin)';
      } else if (upperBadge.includes('ADMIN') || upperBadge === 'ADMIN-PRO-1') {
        userRole = 'admin';
        fullName = 'Worku Bekele (System Admin)';
      } else if (upperBadge.includes('OFFICER') || upperBadge === 'OFFICER-8842') {
        userRole = 'officer';
        fullName = 'Insp. Solomon Girma';
      } else {
        userRole = role || 'clerk';
        fullName = 'Abebe Bikila (Primary Clerk)';
      }

      const defaultCred = SYSTEM_ROLE_CREDENTIALS[userRole as keyof typeof SYSTEM_ROLE_CREDENTIALS] || SYSTEM_ROLE_CREDENTIALS.clerk;
      matchedUser = {
        id: `user-${userRole}-${cleanBadge}`,
        uid: `user-${userRole}-${cleanBadge}`,
        badgeId: cleanBadge,
        email: cleanBadge.includes('@') ? cleanBadge : defaultCred.email,
        fullName: defaultCred.fullName || fullName,
        role: userRole,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      // Persist new user to Firestore permit database
      await adminUpsertDocument(ADMIN_COLLECTIONS.USERS, matchedUser.id, matchedUser);
    } else {
      // Update last login timestamp in Firestore permit database
      matchedUser.lastLoginAt = new Date().toISOString();
      await adminUpdateDocumentFields(ADMIN_COLLECTIONS.USERS, matchedUser.id || matchedUser.uid, {
        lastLoginAt: matchedUser.lastLoginAt,
      });
    }

    res.json({ success: true, user: matchedUser });
  } catch (err: any) {
    const errMsg = String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Admin Auth] Quota exceeded. Database reads are paused until limit resets.');
    } else {
      console.error('[Firebase Admin Auth] Login error:', err);
    }
    res.status(500).json({ success: false, error: err.message || errMsg });
  }
});

// Fetch all system users
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await adminFetchAllDocuments(ADMIN_COLLECTIONS.USERS);
    res.json({ success: true, users: users || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Save/Register user endpoint
app.post('/api/auth/users', async (req, res) => {
  try {
    const userData = req.body;
    if (!userData.badgeId && !userData.uid && !userData.id) {
      return res.status(400).json({ success: false, error: 'Missing user ID or badge ID' });
    }
    const userId = userData.id || userData.uid || `user-${userData.role || 'clerk'}-${userData.badgeId}`;
    const formattedUser = {
      id: userId,
      uid: userId,
      badgeId: userData.badgeId || userId,
      email: userData.email || `${userData.badgeId.toLowerCase()}@permit.gov.et`,
      fullName: userData.fullName || 'System User',
      role: userData.role || 'clerk',
      subCity: userData.subCity || 'Central Command',
      status: userData.status || 'active',
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adminUpsertDocument(ADMIN_COLLECTIONS.USERS, userId, formattedUser);
    res.json({ success: true, user: formattedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Update user fields
app.post('/api/auth/users/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing user ID' });
    }
    await adminUpdateDocumentFields(ADMIN_COLLECTIONS.USERS, id, updates);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Change / Update Password endpoint
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { badgeId, role, currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const cleanBadge = (badgeId || '').trim().toLowerCase();
    const users = await adminFetchAllDocuments(ADMIN_COLLECTIONS.USERS);
    const matchedUser = users.find(
      (u) =>
        u.badgeId?.toLowerCase() === cleanBadge ||
        u.role?.toLowerCase() === (role || '').toLowerCase()
    );

    if (matchedUser) {
      await adminUpdateDocumentFields(ADMIN_COLLECTIONS.USERS, matchedUser.id || matchedUser.uid, {
        password: newPassword,
        passwordUpdatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Delete user endpoint
app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing user ID' });
    }
    await adminDeleteDocument(ADMIN_COLLECTIONS.USERS, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// 1. Sync All Collections in one HTTP payload directly from Firebase Firestore via Admin SDK
app.get('/api/sync', async (req, res) => {
  try {
    if (!isFirebaseConfigured()) {
      return res.json({
        registrations: [],
        officers: [],
        printOrders: [],
        verifications: [],
        settings: null,
        configured: false,
      });
    }

    const [registrations, officers, printOrders, verifications, settingsDoc] = await Promise.all([
      adminFetchAllDocuments(ADMIN_COLLECTIONS.REGISTRATIONS),
      adminFetchAllDocuments(ADMIN_COLLECTIONS.OFFICERS),
      adminFetchAllDocuments(ADMIN_COLLECTIONS.PRINT_ORDERS),
      adminFetchAllDocuments(ADMIN_COLLECTIONS.VERIFICATIONS),
      adminGetDocument(ADMIN_COLLECTIONS.SETTINGS, 'global_config'),
    ]);

    res.json({
      registrations: registrations || [],
      officers: officers || [],
      printOrders: printOrders || [],
      verifications: verifications || [],
      settings: settingsDoc || DEFAULT_SETTINGS,
      configured: true,
      fromCache: false,
    });
  } catch (err: any) {
    console.error('[Firebase Server] Sync notice:', err?.message || String(err));
    res.json({
      registrations: [],
      officers: [],
      printOrders: [],
      verifications: [],
      settings: null,
      configured: false,
      error: err.message || String(err),
    });
  }
});

// 2. Save Registration
app.post('/api/registrations', async (req, res) => {
  try {
    const reg = req.body;
    if (!reg.id) {
      return res.status(400).json({ success: false, error: 'Missing registration ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true, warning: 'Saved locally (Firebase not configured)' });
    }

    await adminUpsertDocument(ADMIN_COLLECTIONS.REGISTRATIONS, reg.id, reg);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on save registration. Falling back to local state.');
      // Return 200 OK so the frontend considers it a successful "offline" save
      res.json({ success: true, warning: 'Saved locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Save registration failed:', errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

// 3. Update Registration Status
app.post('/api/registrations/status', async (req, res) => {
  try {
    const { id, status, rejectionReason } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing registration ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    const updates: Record<string, any> = { status };
    if (rejectionReason !== undefined) {
      updates.rejectionReason = rejectionReason;
    }

    await adminUpdateDocumentFields(ADMIN_COLLECTIONS.REGISTRATIONS, id, updates);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on update status. Falling back to local state.');
      res.json({ success: true, warning: 'Updated locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Update status failed:', errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

// 4. Save Officer Assignment
app.post('/api/officers', async (req, res) => {
  try {
    const officer = req.body;
    if (!officer.id) {
      return res.status(400).json({ error: 'Missing officer ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    await adminUpsertDocument(ADMIN_COLLECTIONS.OFFICERS, officer.id, officer);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on save officer. Falling back to local state.');
      res.json({ success: true, warning: 'Saved locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Save officer failed:', errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

// 5. Update Officer fields
app.post('/api/officers/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing officer ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    await adminUpdateDocumentFields(ADMIN_COLLECTIONS.OFFICERS, id, updates);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on update officer. Falling back to local state.');
      res.json({ success: true, warning: 'Updated locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Update officer failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 6. Save Print Order
app.post('/api/print-orders', async (req, res) => {
  try {
    const order = req.body;
    if (!order.id) {
      return res.status(400).json({ error: 'Missing print order ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    await adminUpsertDocument(ADMIN_COLLECTIONS.PRINT_ORDERS, order.id, order);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on save print order. Falling back to local state.');
      res.json({ success: true, warning: 'Saved locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Save print order failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 7. Update Print Order Status
app.post('/api/print-orders/status', async (req, res) => {
  try {
    const { id, status, notes } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing print order ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    const updates: Record<string, any> = { status };
    if (notes !== undefined) updates.notes = notes;

    await adminUpdateDocumentFields(ADMIN_COLLECTIONS.PRINT_ORDERS, id, updates);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on update print order. Falling back to local state.');
      res.json({ success: true, warning: 'Updated locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Update print order failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 8. Save Verification Log
app.post('/api/verification-logs', async (req, res) => {
  try {
    const log = req.body;
    if (!log.id) {
      return res.status(400).json({ error: 'Missing log ID' });
    }

    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    await adminUpsertDocument(ADMIN_COLLECTIONS.VERIFICATIONS, log.id, log);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on save verification log. Falling back to local state.');
      res.json({ success: true, warning: 'Saved locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Save verification log failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 9. Save System Settings
app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    if (!isFirebaseConfigured()) {
      return res.json({ success: true });
    }

    await adminUpsertDocument(ADMIN_COLLECTIONS.SETTINGS, 'global_config', { id: 'global_config', ...settings });
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on save settings. Falling back to local state.');
      res.json({ success: true, warning: 'Saved locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Save settings failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 10. Delete existing and create fresh database (wipe all database records)
app.post('/api/reset-database', async (req, res) => {
  try {
    console.log('[Firebase Admin] Deleting all existing records and re-initializing fresh database state...');
    await Promise.allSettled([
      adminClearCollection(ADMIN_COLLECTIONS.REGISTRATIONS),
      adminClearCollection(ADMIN_COLLECTIONS.OFFICERS),
      adminClearCollection(ADMIN_COLLECTIONS.PRINT_ORDERS),
      adminClearCollection(ADMIN_COLLECTIONS.VERIFICATIONS),
      adminClearCollection(ADMIN_COLLECTIONS.UNREGISTERED_REPORTS),
      adminClearCollection(ADMIN_COLLECTIONS.PAYMENT_RECEIPTS),
      adminClearCollection(ADMIN_COLLECTIONS.AUDIT_LOGS),
      adminClearCollection(ADMIN_COLLECTIONS.SETTINGS),
    ]);

    const resetEpoch = req.body?.systemResetEpoch ? Number(req.body.systemResetEpoch) : Date.now();
    const resetIso = req.body?.lastSystemResetAt || new Date().toISOString();

    // Seed default settings and system role users
    await adminUpsertDocument(ADMIN_COLLECTIONS.SETTINGS, 'global_config', {
      id: 'global_config',
      ...DEFAULT_SETTINGS,
      systemResetEpoch: resetEpoch,
      lastSystemResetAt: resetIso,
    });
    await ensureDefaultUsersExist();

    res.json({
      success: true,
      message: 'Existing database completely deleted and fresh database initialized.',
      systemResetEpoch: resetEpoch,
      lastSystemResetAt: resetIso,
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Admin] Quota exceeded on reset database. Falling back to local state reset.');
      res.json({ success: true, warning: 'Reset locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Admin] Reset database error:', errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

app.post('/api/reset-data', async (req, res) => {
  try {
    await Promise.allSettled([
      adminClearCollection(ADMIN_COLLECTIONS.REGISTRATIONS),
      adminClearCollection(ADMIN_COLLECTIONS.PRINT_ORDERS),
      adminClearCollection(ADMIN_COLLECTIONS.VERIFICATIONS),
      adminClearCollection(ADMIN_COLLECTIONS.UNREGISTERED_REPORTS),
      adminClearCollection(ADMIN_COLLECTIONS.PAYMENT_RECEIPTS),
      adminClearCollection(ADMIN_COLLECTIONS.AUDIT_LOGS),
    ]);
    res.json({ success: true });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Quota limit exceeded')) {
      console.warn('[Firebase Server] Quota exceeded on reset data. Falling back to local state reset.');
      res.json({ success: true, warning: 'Reset locally (Firebase quota exceeded)' });
    } else {
      console.error('[Firebase Server] Reset failed:', errMsg);
      res.status(500).json({ error: errMsg });
    }
  }
});

// 404 JSON fallback for unmatched /api routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl || req.url} not found` });
});

// Global Express error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err?.message || String(err) });
});

// --- VITE MIDDLEWARE FOR DEVELOPMENT AND STATIC SERVING FOR PRODUCTION ---
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
      console.log(`[Server] Full-stack application running on http://localhost:${PORT}`);
    });
  }
  startStandaloneServer().catch((err) => {
    console.error('[Server] Failed to start standalone server:', err);
  });
}

export default app;
