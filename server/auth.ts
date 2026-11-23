import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { UserRole } from '../src/types.ts';

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  fondateur: [
    'platform.settings',
    'platform.backup',
    'platform.archives',
    'users.create_proviseur',
    'users.view_all',
    'audit.view',
    'academic.years',
    'reports.view_all',
  ],
  proviseur: [
    'users.manage_staff',
    'users.manage_registrations',
    'academic.periods',
    'academic.classes',
    'academic.subjects',
    'academic.assignments',
    'academic.missing_rules',
    'dossiers.approve_important',
    'grades.authorize_correction',
    'bulletins.sign',
    'claims.decide',
    'reports.view_all',
    'finance.view',
  ],
  censeur: [
    'results.view_all',
    'grades.verify_correction',
    'bulletins.verify',
    'discipline.view',
    'claims.examine',
    'reports.pedagogical',
    'classes.view_all',
  ],
  secretaire: [
    'dossiers.create',
    'dossiers.edit_ordinary',
    'dossiers.request_important',
    'grades.receive',
    'grades.control',
    'bulletins.prepare',
    'bulletins.transmit',
    'archives.manage',
    'claims.receive',
  ],
  enseignant: [
    'classes.view_all',
    'evaluations.manage_own',
    'grades.entry_assigned',
    'grades.import_excel',
    'grades.request_correction',
    'materials.manage_own',
    'results.view_published',
  ],
  surveillant: [
    'students.view',
    'attendance.manage',
    'discipline.manage',
    'discipline.report_censeur',
  ],
  comptable: [
    'finance.fees',
    'finance.payments',
    'finance.receipts',
    'finance.unpaid',
    'finance.expenses',
    'finance.reports',
  ],
  economat: [
    'economat.inventory',
    'economat.movements',
  ],
  bibliothecaire: ['staff.library'],
  informaticien: ['staff.it'],
  archiviste: ['archives.manage', 'staff.archives'],
  medical: ['staff.medical'],
  agent_administratif: ['staff.admin'],
  eleve: [
    'student.self_dossier',
    'student.materials',
    'student.published_results',
    'student.bulletins',
    'student.finance',
    'claims.submit',
  ],
  parent: [
    'parent.children',
    'parent.published_results',
    'parent.bulletins',
    'parent.finance',
    'claims.submit',
  ],
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface AuthenticatedUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: UserRole;
  statut: string;
  permissions: string[];
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
  authToken?: string;
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Jeton de session manquant.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT s.expires_at, u.id, u.nom, u.prenom, u.email, u.role, u.statut, u.permissions_json
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        expires_at: string;
        id: number;
        nom: string;
        prenom: string;
        email: string;
        role: UserRole;
        statut: string;
        permissions_json: string;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
    return;
  }

  if (row.statut !== 'actif') {
    res.status(403).json({ error: `Accès refusé : statut du compte (${row.statut}).` });
    return;
  }

  let parsedPerms: string[] = [];
  try {
    parsedPerms = JSON.parse(row.permissions_json || '[]');
  } catch {
    parsedPerms = [];
  }

  req.authUser = {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    email: row.email,
    role: row.role,
    statut: row.statut,
    permissions: parsedPerms,
  };
  req.authToken = token;
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Permission insuffisante pour cette opération.' });
      return;
    }
    next();
  };
}

export function hasPermission(user: AuthenticatedUser, perm: string): boolean {
  if (user.role === 'fondateur') return true;
  return user.permissions.includes(perm);
}

export function logAudit(params: {
  userId: number | null;
  userNom: string;
  userRole: string;
  evenement: string;
  entite: string;
  entiteId?: string | number | bigint | null;
  description: string;
  ancienneValeur?: unknown;
  nouvelleValeur?: unknown;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_nom, user_role, evenement, entite, entite_id, description, ancienne_valeur, nouvelle_valeur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId,
    params.userNom,
    params.userRole,
    params.evenement,
    params.entite,
    params.entiteId != null ? String(params.entiteId) : null,
    params.description,
    params.ancienneValeur !== undefined ? JSON.stringify(params.ancienneValeur) : null,
    params.nouvelleValeur !== undefined ? JSON.stringify(params.nouvelleValeur) : null
  );
}

export function notifyUser(userId: number, titre: string, message: string, lienModule?: string): void {
  db.prepare('INSERT INTO notifications (user_id, titre, message, lien_module) VALUES (?, ?, ?, ?)').run(
    userId,
    titre,
    message,
    lienModule ?? null
  );
}

export function notifyRoles(roles: UserRole[], titre: string, message: string, lienModule?: string): void {
  const placeholders = roles.map(() => '?').join(',');
  const users = db
    .prepare(`SELECT id FROM users WHERE role IN (${placeholders}) AND statut = 'actif'`)
    .all(...roles) as { id: number }[];
  for (const u of users) {
    notifyUser(u.id, titre, message, lienModule);
  }
}
