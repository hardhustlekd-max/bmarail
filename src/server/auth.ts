import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import express from 'express';
import { dbGetById, dbGetAll, dbUpsert, dbUpdateFields, dbDelete } from './db.ts';
import { SystemUser, UserRole } from '../types.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'bma-permit-railway-jwt-secret-key-2026-prod';
const JWT_EXPIRES_IN = '7d';

export interface JwtPayload {
  uid: string;
  badgeId: string;
  role: UserRole;
  email: string;
  fullName: string;
}

export const PRESET_USERS: Record<UserRole, { badgeId: string; email: string; fullName: string; role: UserRole }> = {
  clerk: {
    badgeId: 'CLERK-001',
    email: 'clerk@permit.gov.et',
    fullName: 'Abebe Bekele (Clerk)',
    role: 'clerk',
  },
  officer: {
    badgeId: 'OFFICER-8842',
    email: 'officer@permit.gov.et',
    fullName: 'Officer Solomon Desta',
    role: 'officer',
  },
  admin: {
    badgeId: 'ADMIN-PRO-1',
    email: 'admin@permit.gov.et',
    fullName: 'Tigist Alemu (System Admin)',
    role: 'admin',
  },
  superadmin: {
    badgeId: 'SUPER-ADMIN-01',
    email: 'superadmin@permit.gov.et',
    fullName: 'Kaleb Tadesse (Chief Super Admin)',
    role: 'superadmin',
  },
};

/**
 * Hash a plain text password with bcrypt
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

/**
 * Verify a plain text password against a bcrypt hash
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  if (!hash) return true; // Graceful fallback if user had no password set
  return bcrypt.compare(plainText, hash);
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: { uid: string; badgeId: string; role: UserRole; email: string; fullName: string }): string {
  const payload: JwtPayload = {
    uid: user.uid,
    badgeId: user.badgeId,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Express middleware to authenticate JWT token from Authorization header or cookies
 */
export function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : (req as any).cookies?.token;

  if (!token) {
    // If no token, allow request to proceed but without req.user
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as any).user = decoded;
    next();
  } catch (err) {
    // Invalid or expired token
    next();
  }
}

/**
 * Middleware to enforce required roles
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

/**
 * Ensure default system role users are seeded
 */
export async function ensureDefaultUsers(): Promise<void> {
  try {
    const existingUsers = await dbGetAll('system_users');
    if (!existingUsers || existingUsers.length === 0) {
      console.log('[Auth] Seeding default system users into PostgreSQL...');
      for (const [roleKey, cred] of Object.entries(PRESET_USERS)) {
        const defaultHash = await hashPassword(`${cred.role}123!`);
        const userId = `user-${cred.role}-${cred.badgeId}`;
        const userRecord = {
          id: userId,
          uid: userId,
          badgeId: cred.badgeId,
          email: cred.email,
          passwordHash: defaultHash,
          role: cred.role,
          fullName: cred.fullName,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbUpsert('system_users', userId, userRecord);
      }
    }
  } catch (err) {
    console.warn('[Auth] Notice on default users check:', err);
  }
}
