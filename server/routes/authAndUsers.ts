import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  createSession,
  DEFAULT_ROLE_PERMISSIONS,
  hashPassword,
  logAudit,
  notifyRoles,
  notifyUser,
  requireAuth,
  requireRoles,
  verifyPassword,
  type AuthRequest,
} from '../auth.ts';
import { db, UPLOAD_DIR } from '../db.ts';
import type { UserRole } from '../../src/types.ts';

const router = express.Router();

const STAFF_ROLES: UserRole[] = [
  'censeur',
  'secretaire',
  'enseignant',
  'surveillant',
  'comptable',
  'economat',
  'bibliothecaire',
  'informaticien',
  'archiviste',
  'medical',
  'agent_administratif',
];

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'logo')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `etablissement_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) cb(null, true);
    else cb(new Error('Format d’image non autorisé (.png, .jpg, .jpeg, .webp uniquement).'));
  },
});

function sanitizeUser(row: Record<string, unknown>) {
  let permissions: string[] = [];
  let preferences: Record<string, unknown> = {};
  try {
    permissions = JSON.parse((row.permissions_json as string) || '[]');
  } catch {
    permissions = [];
  }
  try {
    preferences = JSON.parse((row.preferences_json as string) || '{}');
  } catch {
    preferences = {};
  }
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    email: row.email,
    telephone: row.telephone,
    role: row.role,
    statut: row.statut,
    origine: row.origine,
    motif_refus: row.motif_refus,
    demande_reexamen: row.demande_reexamen,
    permissions,
    preferences,
    last_login_at: row.last_login_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Public status check: does a Fondateur exist yet + non-sensitive institutional branding?
router.get('/auth/status', (_req, res) => {
  const fondateur = db.prepare(`SELECT id FROM users WHERE role = 'fondateur' LIMIT 1`).get();
  const settings = db
    .prepare(
      `SELECT nom_etablissement, devise, adresse, telephone, email, logo_path,
              autoriser_auto_inscription, message_accueil, couleur_accent
       FROM school_settings WHERE id = 1`
    )
    .get();
  const demoAccounts = db
    .prepare(
      `SELECT email, role, prenom || ' ' || nom AS nom
       FROM users
       WHERE email LIKE '%@lycee-pk.demo' AND statut = 'actif'
       ORDER BY id ASC`
    )
    .all();
  res.json({
    initialized: Boolean(fondateur),
    settings,
    demoAccounts,
  });
});

// Safe public logo endpoint (serves ONLY school_settings.logo_path if configured)
router.get('/auth/public-logo', (_req, res) => {
  const row = db.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as
    | { logo_path: string | null }
    | undefined;
  if (!row?.logo_path) {
    res.status(404).json({ error: 'Aucun logo configuré.' });
    return;
  }
  const logoRoot = path.join(UPLOAD_DIR, 'logo');
  const resolved = path.resolve(UPLOAD_DIR, row.logo_path.replace(/^\/+/, ''));
  if (!resolved.startsWith(logoRoot + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Logo introuvable.' });
    return;
  }
  res.sendFile(resolved);
});

// Safe read-only public feed for the institutional showcase website (zero private student/user PII)
router.get('/public/showcase', (_req, res) => {
  const settings = db
    .prepare(
      `SELECT nom_etablissement, devise, adresse, telephone, email, logo_path,
              autoriser_auto_inscription, message_accueil
       FROM school_settings WHERE id = 1`
    )
    .get() as Record<string, unknown> | undefined;

  const activeYear = db
    .prepare(`SELECT libelle, date_debut, date_fin FROM academic_years WHERE est_active = 1 LIMIT 1`)
    .get() as { libelle: string; date_debut: string; date_fin: string } | undefined;

  const classes = db
    .prepare(`SELECT id, nom, niveau, serie FROM classes ORDER BY nom ASC`)
    .all() as { id: number; nom: string; niveau: string; serie: string | null }[];

  const subjects = db
    .prepare(`SELECT code, nom FROM subjects ORDER BY nom ASC`)
    .all() as { code: string; nom: string }[];

  const announcements = db
    .prepare(
      `SELECT id, titre, contenu, priorite, created_at
       FROM announcements
       WHERE cible_role IN ('tous', 'eleves_parents')
         AND (expire_le IS NULL OR date(expire_le) >= date('now'))
       ORDER BY epingle DESC, id DESC LIMIT 4`
    )
    .all();

  const calendarEvents = db
    .prepare(
      `SELECT id, titre, categorie, date_debut, date_fin, description
       FROM calendar_events
       WHERE visibilite = 'etablissement'
       ORDER BY date_debut ASC LIMIT 6`
    )
    .all();

  const studentCountRow = db
    .prepare(`SELECT COUNT(*) AS c FROM students WHERE est_archive = 0`)
    .get() as { c: number };

  res.json({
    settings: settings || null,
    activeYear: activeYear || null,
    classes,
    subjects,
    announcements,
    calendarEvents,
    stats: {
      classesCount: classes.length,
      subjectsCount: subjects.length,
      studentsCount: studentCountRow?.c || 0,
    },
  });
});

// Public vitrine contact / information inquiry (transmits safely to Proviseur & Secrétariat)
router.post('/public/contact', (req, res) => {
  const { nom, contact, profil, message } = req.body as {
    nom?: string;
    contact?: string;
    profil?: string;
    message?: string;
  };
  if (!nom?.trim() || !contact?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'Veuillez renseigner votre nom, un moyen de contact et votre message.' });
    return;
  }
  const cleanName = nom.trim().slice(0, 120);
  const cleanContact = contact.trim().slice(0, 120);
  const cleanProfil = ['parent', 'eleve', 'visiteur'].includes(String(profil || '').toLowerCase())
    ? String(profil).toLowerCase()
    : 'visiteur';
  const cleanMsg = message.trim().slice(0, 1000);

  notifyRoles(
    ['proviseur', 'secretaire'],
    `Demande d’information vitrine (${cleanProfil})`,
    `${cleanName} (${cleanContact}) : ${cleanMsg}`,
    'communications'
  );

  logAudit({
    userId: null,
    userNom: cleanName,
    userRole: 'public',
    evenement: 'Contact vitrine',
    entite: 'Demande publique',
    description: `Message public (${cleanProfil}) de ${cleanName} (${cleanContact}) : ${cleanMsg}`,
  });

  res.status(201).json({
    message:
      'Votre demande d’information a bien été transmise au secrétariat de l’établissement. Nous vous répondrons dans les meilleurs délais.',
  });
});

// One-time bootstrap for the unique Administrateur Fondateur
router.post('/auth/bootstrap', (req, res) => {
  const existing = db.prepare(`SELECT id FROM users WHERE role = 'fondateur' LIMIT 1`).get();
  if (existing) {
    res.status(403).json({ error: 'Un administrateur fondateur existe déjà. La création d’un second fondateur est interdite.' });
    return;
  }

  const { nom, prenom, email, telephone, password } = req.body as Record<string, string>;
  if (!nom?.trim() || !prenom?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Nom, prénom, e-mail et mot de passe (8 caractères min.) sont obligatoires.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const perms = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.fondateur);

  const info = db
    .prepare(
      `INSERT INTO users (nom, prenom, email, telephone, password_hash, role, statut, origine, permissions_json)
       VALUES (?, ?, ?, ?, ?, 'fondateur', 'actif', 'fondateur_initial', ?)`
    )
    .run(nom.trim(), prenom.trim(), normalizedEmail, telephone?.trim() || null, passwordHash, perms);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as Record<string, unknown>;
  const token = createSession(Number(info.lastInsertRowid));

  logAudit({
    userId: Number(info.lastInsertRowid),
    userNom: `${prenom.trim()} ${nom.trim()}`,
    userRole: 'fondateur',
    evenement: 'Création',
    entite: 'Utilisateur',
    entiteId: info.lastInsertRowid,
    description: 'Initialisation du compte unique Administrateur Fondateur.',
  });

  res.status(201).json({ token, user: sanitizeUser(user) });
});

// Login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Veuillez saisir votre e-mail et votre mot de passe.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as
    | (Record<string, unknown> & { id: number; password_hash: string; statut: string; motif_refus: string | null })
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  if (user.statut === 'en_attente') {
    res.status(403).json({
      error: 'Votre demande d’auto-inscription est en attente de validation par le proviseur.',
      statut: 'en_attente',
    });
    return;
  }

  if (user.statut === 'refuse') {
    res.status(403).json({
      error: `Demande refusée : ${user.motif_refus || 'Motif non précisé.'}`,
      statut: 'refuse',
      motif_refus: user.motif_refus,
      demande_reexamen: user.demande_reexamen,
      user_id: user.id,
    });
    return;
  }

  if (user.statut === 'suspendu' || user.statut === 'desactive') {
    res.status(403).json({
      error: `Compte ${user.statut === 'suspendu' ? 'suspendu' : 'désactivé'}. Contactez la direction.`,
      statut: user.statut,
    });
    return;
  }

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>;
  const token = createSession(user.id);
  logAudit({
    userId: user.id,
    userNom: `${user.prenom} ${user.nom}`,
    userRole: String(user.role),
    evenement: 'Connexion',
    entite: 'Session',
    description: `Connexion réussie à l'espace ${user.role}.`,
  });

  res.json({ token, user: sanitizeUser(freshUser) });
});

// Self-registration for students and parents (strictly pending Proviseur validation)
router.post('/auth/register', (req, res) => {
  const fondateur = db.prepare(`SELECT id FROM users WHERE role = 'fondateur' LIMIT 1`).get();
  if (!fondateur) {
    res.status(400).json({ error: 'La plateforme doit d’abord être initialisée par le fondateur.' });
    return;
  }

  const setting = db.prepare('SELECT autoriser_auto_inscription FROM school_settings WHERE id = 1').get() as
    | { autoriser_auto_inscription: number }
    | undefined;
  if (setting && setting.autoriser_auto_inscription === 0) {
    res.status(403).json({
      error: 'L’auto-inscription en ligne est temporairement suspendue par la direction. Veuillez contacter le secrétariat.',
    });
    return;
  }

  const { nom, prenom, email, telephone, password, role, matricule_eleve } = req.body as Record<string, string>;
  if (!['eleve', 'parent'].includes(role)) {
    res.status(400).json({ error: 'L’auto-inscription est réservée uniquement aux élèves et aux parents.' });
    return;
  }
  if (!nom?.trim() || !prenom?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Nom, prénom, e-mail et mot de passe (8 caractères min.) sont requis.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const duplicate = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (duplicate) {
    res.status(409).json({ error: 'Un compte existe déjà avec cette adresse e-mail.' });
    return;
  }

  const perms = JSON.stringify(DEFAULT_ROLE_PERMISSIONS[role as UserRole]);
  const info = db
    .prepare(
      `INSERT INTO users (nom, prenom, email, telephone, password_hash, role, statut, origine, demande_reexamen, permissions_json)
       VALUES (?, ?, ?, ?, ?, ?, 'en_attente', 'auto_inscription', ?, ?)`
    )
    .run(
      nom.trim(),
      prenom.trim(),
      normalizedEmail,
      telephone?.trim() || null,
      hashPassword(password),
      role,
      matricule_eleve?.trim() ? `Matricule déclaré : ${matricule_eleve.trim()}` : null,
      perms
    );

  notifyRoles(
    ['proviseur'],
    'Nouvelle demande d’auto-inscription',
    `${prenom.trim()} ${nom.trim()} (${role === 'eleve' ? 'Élève' : 'Parent'}) attend votre décision.`,
    'inscriptions'
  );

  logAudit({
    userId: Number(info.lastInsertRowid),
    userNom: `${prenom.trim()} ${nom.trim()}`,
    userRole: role,
    evenement: 'Inscription',
    entite: 'Compte',
    entiteId: info.lastInsertRowid,
    description: `Auto-inscription soumise en attente de validation du proviseur (rôle: ${role}).`,
  });

  res.status(201).json({
    message: 'Votre demande d’inscription a été enregistrée. Elle reste en attente de décision du proviseur.',
  });
});

// Request re-examination after refusal (does NOT auto-activate account)
router.post('/auth/reexamen', (req, res) => {
  const { email, password, complement } = req.body as Record<string, string>;
  if (!email?.trim() || !password || !complement?.trim()) {
    res.status(400).json({ error: 'E-mail, mot de passe et informations complémentaires requis.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | (Record<string, unknown> & { id: number; password_hash: string; statut: string; role: string })
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }

  if (user.statut !== 'refuse') {
    res.status(400).json({ error: 'Le réexamen s’applique uniquement aux demandes refusées.' });
    return;
  }

  db.prepare(`UPDATE users SET demande_reexamen = ?, updated_at = datetime('now') WHERE id = ?`).run(
    complement.trim(),
    user.id
  );

  notifyRoles(
    ['proviseur'],
    'Demande de réexamen d’inscription',
    `${user.prenom} ${user.nom} a soumis des éléments complémentaires pour réexamen.`,
    'inscriptions'
  );

  logAudit({
    userId: user.id,
    userNom: `${user.prenom} ${user.nom}`,
    userRole: String(user.role),
    evenement: 'Inscription',
    entite: 'Réexamen',
    entiteId: user.id,
    description: `Demande de réexamen déposée : ${complement.trim()}`,
  });

  res.json({
    message: 'Demande de réexamen transmise au proviseur. Le compte reste inactif jusqu’à nouvelle décision.',
  });
});

router.post('/auth/logout', requireAuth, (req: AuthRequest, res) => {
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser!.id) as Record<string, unknown>;
  res.json({ user: sanitizeUser(row) });
});

// ---------------- FORGOT PASSWORD / SECURE RESET WORKFLOW ----------------
function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

// Public: submit a password reset request (non-enumerating response)
router.post('/auth/forgot-password', (req, res) => {
  const { email, motif } = req.body as { email?: string; motif?: string };
  if (!email?.trim() || !email.includes('@')) {
    res.status(400).json({ error: 'Veuillez saisir une adresse e-mail valide.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, nom, prenom, role, statut FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | { id: number; nom: string; prenom: string; role: UserRole; statut: string }
    | undefined;

  if (user && user.statut === 'actif') {
    const existingPending = db
      .prepare(`SELECT id FROM password_reset_requests WHERE user_id = ? AND statut = 'en_attente'`)
      .get(user.id);
    if (!existingPending) {
      const info = db
        .prepare(
          `INSERT INTO password_reset_requests (user_id, email_saisi, motif, statut)
           VALUES (?, ?, ?, 'en_attente')`
        )
        .run(user.id, normalizedEmail, motif?.trim() || null);

      notifyRoles(
        ['fondateur', 'proviseur', 'informaticien'],
        'Demande de réinitialisation de mot de passe',
        `${user.prenom} ${user.nom} (${user.role}) demande un code de réinitialisation.`,
        'governance_users'
      );

      logAudit({
        userId: user.id,
        userNom: `${user.prenom} ${user.nom}`,
        userRole: user.role,
        evenement: 'Sécurité',
        entite: 'Mot de passe',
        entiteId: info.lastInsertRowid,
        description: 'Demande de réinitialisation de mot de passe soumise.',
      });
    }
  }

  res.json({
    message:
      'Si un compte actif correspond à cette adresse e-mail, votre demande a été transmise à la direction / au support informatique pour émission d’un code à usage unique.',
  });
});

// Public: complete password reset using email + one-time code issued by direction
router.post('/auth/reset-password', (req, res) => {
  const { email, code, new_password } = req.body as {
    email?: string;
    code?: string;
    new_password?: string;
  };
  if (!email?.trim() || !code?.trim() || !new_password || new_password.length < 8) {
    res.status(400).json({
      error: 'Adresse e-mail, code de réinitialisation et nouveau mot de passe (8 caractères min.) sont requis.',
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, nom, prenom, role, statut FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | { id: number; nom: string; prenom: string; role: UserRole; statut: string }
    | undefined;

  if (!user || user.statut !== 'actif') {
    res.status(400).json({ error: 'Code de réinitialisation invalide ou expiré.' });
    return;
  }

  const reqRow = db
    .prepare(
      `SELECT id, code_hash, expires_at
       FROM password_reset_requests
       WHERE user_id = ? AND statut = 'code_emis'
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id) as { id: number; code_hash: string | null; expires_at: string | null } | undefined;

  if (!reqRow || !reqRow.code_hash || !reqRow.expires_at) {
    res.status(400).json({ error: 'Code de réinitialisation invalide ou expiré.' });
    return;
  }

  if (new Date(reqRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Ce code de réinitialisation a expiré. Veuillez soumettre une nouvelle demande.' });
    return;
  }

  const submittedHash = hashResetCode(code);
  const expectedBuf = Buffer.from(reqRow.code_hash, 'hex');
  const submittedBuf = Buffer.from(submittedHash, 'hex');
  if (expectedBuf.length !== submittedBuf.length || !crypto.timingSafeEqual(expectedBuf, submittedBuf)) {
    res.status(400).json({ error: 'Code de réinitialisation incorrect.' });
    return;
  }

  const newHash = hashPassword(new_password);
  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, user.id);
    db.prepare(`UPDATE password_reset_requests SET statut = 'utilise', used_at = datetime('now') WHERE id = ?`).run(
      reqRow.id
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  })();

  logAudit({
    userId: user.id,
    userNom: `${user.prenom} ${user.nom}`,
    userRole: user.role,
    evenement: 'Sécurité',
    entite: 'Mot de passe',
    entiteId: reqRow.id,
    description: 'Mot de passe réinitialisé avec succès via code à usage unique. Sessions précédentes révoquées.',
  });

  res.json({ message: 'Mot de passe mis à jour avec succès. Vous pouvez maintenant vous connecter.' });
});

// Admin: view password reset requests (never exposes code_hash)
router.get(
  '/password-resets',
  requireAuth,
  requireRoles('fondateur', 'proviseur', 'informaticien'),
  (_req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.user_id, r.email_saisi, r.motif, r.statut, r.expires_at, r.created_at, r.resolved_at, r.used_at,
                u.prenom || ' ' || u.nom AS user_nom, u.role AS user_role,
                ib.prenom || ' ' || ib.nom AS issued_by_nom
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users ib ON ib.id = r.issued_by
         ORDER BY r.id DESC LIMIT 100`
      )
      .all();
    res.json({ requests: rows });
  }
);

// Admin: issue a one-time reset code (returned ONCE to issuing admin)
router.post(
  '/password-resets/:id/issue',
  requireAuth,
  requireRoles('fondateur', 'proviseur', 'informaticien'),
  (req: AuthRequest, res) => {
    const reqId = Number(req.params.id);
    const target = db
      .prepare(
        `SELECT r.id, r.user_id, u.prenom, u.nom, u.role
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ?`
      )
      .get(reqId) as
      | { id: number; user_id: number; prenom: string; nom: string; role: UserRole }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'Demande introuvable.' });
      return;
    }

    if (target.role === 'fondateur' && req.authUser!.role !== 'fondateur') {
      res.status(403).json({ error: 'Seul le fondateur peut émettre un code pour son propre compte.' });
      return;
    }

    const rawCode = `PK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const codeHash = hashResetCode(rawCode);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `UPDATE password_reset_requests
       SET code_hash = ?, expires_at = ?, statut = 'code_emis', issued_by = ?, resolved_at = datetime('now')
       WHERE id = ?`
    ).run(codeHash, expiresAt, req.authUser!.id, reqId);

    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Sécurité',
      entite: 'Mot de passe',
      entiteId: reqId,
      description: `Émission d’un code de réinitialisation temporaire (24h) pour ${target.prenom} ${target.nom}.`,
    });

    res.json({ code: rawCode, expires_at: expiresAt });
  }
);

router.post(
  '/password-resets/:id/refuse',
  requireAuth,
  requireRoles('fondateur', 'proviseur', 'informaticien'),
  (req: AuthRequest, res) => {
    const reqId = Number(req.params.id);
    db.prepare(
      `UPDATE password_reset_requests SET statut = 'refuse', issued_by = ?, resolved_at = datetime('now') WHERE id = ?`
    ).run(req.authUser!.id, reqId);
    res.json({ ok: true });
  }
);

// ---------------- SELF-SERVICE PROFILE, PASSWORD & SESSIONS ----------------
router.put('/auth/profile', requireAuth, (req: AuthRequest, res) => {
  const { telephone, preferences } = req.body as {
    telephone?: string | null;
    preferences?: Record<string, unknown>;
  };

  const existing = db.prepare('SELECT preferences_json FROM users WHERE id = ?').get(req.authUser!.id) as {
    preferences_json: string;
  };
  let nextPrefs = existing?.preferences_json || '{}';
  if (preferences && typeof preferences === 'object') {
    nextPrefs = JSON.stringify(preferences);
  }

  db.prepare(
    `UPDATE users SET telephone = ?, preferences_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(telephone !== undefined ? (telephone?.trim() || null) : null, nextPrefs, req.authUser!.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser!.id) as Record<string, unknown>;
  res.json({ user: sanitizeUser(updated) });
});

router.post('/auth/change-password', requireAuth, (req: AuthRequest, res) => {
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };
  if (!current_password || !new_password || new_password.length < 8) {
    res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe (8 caractères min.) requis.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as
    | { password_hash: string }
    | undefined;
  if (!row || !verifyPassword(current_password, row.password_hash)) {
    res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    return;
  }

  const nextHash = hashPassword(new_password);
  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      nextHash,
      req.authUser!.id
    );
    // Revoke all other sessions except current
    if (req.authToken) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.authUser!.id, req.authToken);
    }
  })();

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Sécurité',
    entite: 'Mot de passe',
    description: 'Changement volontaire de mot de passe depuis le profil personnel.',
  });

  res.json({ message: 'Mot de passe modifié avec succès. Les autres sessions actives ont été déconnectées.' });
});

router.get('/auth/sessions', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT token, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.authUser!.id) as { token: string; created_at: string; expires_at: string }[];

  res.json({
    sessions: rows.map((s) => ({
      prefix: s.token.slice(0, 12),
      created_at: s.created_at,
      expires_at: s.expires_at,
      is_current: s.token === req.authToken,
    })),
  });
});

router.delete('/auth/sessions/:prefix', requireAuth, (req: AuthRequest, res) => {
  const prefix = String(req.params.prefix || '');
  if (prefix.length < 8) {
    res.status(400).json({ error: 'Identifiant de session invalide.' });
    return;
  }
  const sessions = db
    .prepare('SELECT token FROM sessions WHERE user_id = ?')
    .all(req.authUser!.id) as { token: string }[];
  const target = sessions.find((s) => s.token.startsWith(prefix));
  if (!target) {
    res.status(404).json({ error: 'Session introuvable.' });
    return;
  }
  if (target.token === req.authToken) {
    res.status(400).json({ error: 'Utilisez le bouton Déconnexion pour fermer votre session courante.' });
    return;
  }
  db.prepare('DELETE FROM sessions WHERE token = ? AND user_id = ?').run(target.token, req.authUser!.id);
  res.json({ ok: true });
});

// Notifications
router.get('/notifications', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.authUser!.id);
  res.json({ notifications: rows });
});

router.post('/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET est_lu = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET est_lu = 1 WHERE user_id = ?').run(req.authUser!.id);
  res.json({ ok: true });
});

// School settings (read by all authenticated users, updated strictly by Fondateur)
router.get('/settings', requireAuth, (_req, res) => {
  const settings = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  res.json({ settings });
});

router.put('/settings', requireAuth, requireRoles('fondateur', 'proviseur'), (req: AuthRequest, res) => {
  const {
    nom_etablissement,
    devise,
    adresse,
    telephone,
    email,
    retention_documents_jours,
    retention_logs_jours,
    seuil_reussite,
    mention_tres_bien,
    mention_bien,
    mention_assez_bien,
    mention_passable,
    afficher_rang_bulletin,
    afficher_moyenne_classe,
    afficher_appreciation_bulletin,
    autoriser_auto_inscription,
    message_accueil,
    couleur_accent,
  } = req.body as Record<string, unknown>;

  const isFondateur = req.authUser!.role === 'fondateur';
  const oldSettings = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  const validAccent = ['blue', 'emerald', 'indigo', 'amber', 'slate'].includes(String(couleur_accent || ''))
    ? String(couleur_accent)
    : null;

  db.prepare(
    `UPDATE school_settings SET
      nom_etablissement = COALESCE(?, nom_etablissement),
      devise = COALESCE(?, devise),
      adresse = COALESCE(?, adresse),
      telephone = COALESCE(?, telephone),
      email = COALESCE(?, email),
      retention_documents_jours = COALESCE(?, retention_documents_jours),
      retention_logs_jours = COALESCE(?, retention_logs_jours),
      seuil_reussite = COALESCE(?, seuil_reussite),
      mention_tres_bien = COALESCE(?, mention_tres_bien),
      mention_bien = COALESCE(?, mention_bien),
      mention_assez_bien = COALESCE(?, mention_assez_bien),
      mention_passable = COALESCE(?, mention_passable),
      afficher_rang_bulletin = COALESCE(?, afficher_rang_bulletin),
      afficher_moyenne_classe = COALESCE(?, afficher_moyenne_classe),
      afficher_appreciation_bulletin = COALESCE(?, afficher_appreciation_bulletin),
      autoriser_auto_inscription = COALESCE(?, autoriser_auto_inscription),
      message_accueil = COALESCE(?, message_accueil),
      couleur_accent = COALESCE(?, couleur_accent),
      updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    isFondateur && typeof nom_etablissement === 'string' && nom_etablissement.trim() ? nom_etablissement.trim() : null,
    typeof devise === 'string' ? devise.trim() : null,
    typeof adresse === 'string' ? adresse.trim() : null,
    typeof telephone === 'string' ? telephone.trim() : null,
    typeof email === 'string' ? email.trim() : null,
    isFondateur && typeof retention_documents_jours === 'number' ? retention_documents_jours : null,
    isFondateur && typeof retention_logs_jours === 'number' ? retention_logs_jours : null,
    typeof seuil_reussite === 'number' && seuil_reussite >= 0 && seuil_reussite <= 20 ? seuil_reussite : null,
    typeof mention_tres_bien === 'number' ? mention_tres_bien : null,
    typeof mention_bien === 'number' ? mention_bien : null,
    typeof mention_assez_bien === 'number' ? mention_assez_bien : null,
    typeof mention_passable === 'number' ? mention_passable : null,
    typeof afficher_rang_bulletin === 'number' ? (afficher_rang_bulletin ? 1 : 0) : null,
    typeof afficher_moyenne_classe === 'number' ? (afficher_moyenne_classe ? 1 : 0) : null,
    typeof afficher_appreciation_bulletin === 'number' ? (afficher_appreciation_bulletin ? 1 : 0) : null,
    typeof autoriser_auto_inscription === 'number' ? (autoriser_auto_inscription ? 1 : 0) : null,
    typeof message_accueil === 'string' ? message_accueil.trim() : null,
    validAccent
  );

  const updated = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Paramètres',
    entiteId: 1,
    description: 'Mise à jour des paramètres généraux et pédagogiques de l’établissement.',
    ancienneValeur: oldSettings,
    nouvelleValeur: updated,
  });

  res.json({ settings: updated });
});

router.post(
  '/settings/upload/:kind',
  requireAuth,
  requireRoles('fondateur'),
  uploadLogo.single('file'),
  (req: AuthRequest, res) => {
    const kind = req.params.kind;
    if (!['logo', 'cachet'].includes(kind) || !req.file) {
      res.status(400).json({ error: 'Fichier ou type invalide.' });
      return;
    }
    const relPath = `logo/${req.file.filename}`;
    const col = kind === 'logo' ? 'logo_path' : 'cachet_path';
    db.prepare(`UPDATE school_settings SET ${col} = ?, updated_at = datetime('now') WHERE id = 1`).run(relPath);

    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Modification',
      entite: 'Paramètres',
      description: `Téléversement officiel (${kind}).`,
    });

    res.json({ settings: db.prepare('SELECT * FROM school_settings WHERE id = 1').get() });
  }
);

// Users management (Fondateur creates Proviseur; Proviseur creates staff & direct students/parents)
router.get('/users', requireAuth, requireRoles('fondateur', 'proviseur', 'censeur', 'secretaire'), (req: AuthRequest, res) => {
  const roleFilter = req.query.role ? String(req.query.role) : null;
  let rows: Record<string, unknown>[];
  if (roleFilter) {
    rows = db.prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC').all(roleFilter) as Record<
      string,
      unknown
    >[];
  } else {
    rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[];
  }
  res.json({ users: rows.map(sanitizeUser) });
});

router.post('/users', requireAuth, requireRoles('fondateur', 'proviseur'), (req: AuthRequest, res) => {
  const { nom, prenom, email, telephone, password, role, permissions, eleve_matricule } = req.body as {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    password: string;
    role: UserRole;
    permissions?: string[];
    eleve_matricule?: string;
  };

  if (role === 'fondateur') {
    res.status(403).json({ error: 'Un deuxième administrateur fondateur ne peut jamais être créé.' });
    return;
  }

  if (req.authUser!.role === 'fondateur') {
    // Fondateur creates Proviseur (or can also provision initial accounts if needed, except no 2nd fondateur)
    if (role !== 'proviseur' && !STAFF_ROLES.includes(role)) {
      res.status(403).json({ error: 'Le fondateur crée le compte du proviseur et délègue la gestion courante.' });
      return;
    }
  } else if (req.authUser!.role === 'proviseur') {
    if (role === 'proviseur') {
      res.status(403).json({ error: 'Seul le fondateur peut créer un compte proviseur.' });
      return;
    }
  }

  if (!nom?.trim() || !prenom?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Nom, prénom, e-mail et mot de passe (8 caractères min.) sont requis.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
    res.status(409).json({ error: 'Adresse e-mail déjà utilisée.' });
    return;
  }

  const assignedPerms =
    Array.isArray(permissions) && permissions.length > 0
      ? permissions
      : DEFAULT_ROLE_PERMISSIONS[role] || [];
  const origine = req.authUser!.role === 'fondateur' ? 'creation_fondateur' : 'creation_proviseur';

  const info = db
    .prepare(
      `INSERT INTO users (nom, prenom, email, telephone, password_hash, role, statut, origine, permissions_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'actif', ?, ?, ?)`
    )
    .run(
      nom.trim(),
      prenom.trim(),
      normalizedEmail,
      telephone?.trim() || null,
      hashPassword(password),
      role,
      origine,
      JSON.stringify(assignedPerms),
      req.authUser!.id
    );

  // If creating a parent with a student matricule, link immediately
  if (role === 'parent' && eleve_matricule?.trim()) {
    const student = db
      .prepare('SELECT id FROM students WHERE matricule = ?')
      .get(eleve_matricule.trim()) as { id: number } | undefined;
    if (student) {
      db.prepare('INSERT OR IGNORE INTO parent_student_links (parent_user_id, eleve_id) VALUES (?, ?)').run(
        info.lastInsertRowid,
        student.id
      );
    }
  }

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as Record<string, unknown>;
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Utilisateur',
    entiteId: info.lastInsertRowid,
    description: `Création directe du compte ${prenom.trim()} ${nom.trim()} (${role}) — activé sans validation supplémentaire.`,
  });

  res.status(201).json({ user: sanitizeUser(created) });
});

// Update user status / permissions (Fondateur protected from everyone!)
router.patch('/users/:id', requireAuth, requireRoles('fondateur', 'proviseur'), (req: AuthRequest, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
    | (Record<string, unknown> & { id: number; role: UserRole; statut: string; nom: string; prenom: string })
    | undefined;

  if (!target) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  if (target.role === 'fondateur' && req.authUser!.id !== target.id) {
    res.status(403).json({ error: 'Impossible de modifier, suspendre ou rétrograder l’administrateur fondateur.' });
    return;
  }

  const { statut, motif_refus, permissions, role, link_matricule } = req.body as {
    statut?: string;
    motif_refus?: string;
    permissions?: string[];
    role?: UserRole;
    link_matricule?: string;
  };

  if (role === 'fondateur' && target.role !== 'fondateur') {
    res.status(403).json({ error: 'Impossible d’attribuer le rôle d’administrateur fondateur.' });
    return;
  }

  if (statut === 'refuse' && (!motif_refus || !motif_refus.trim())) {
    res.status(400).json({ error: 'Un motif est obligatoire en cas de refus d’inscription.' });
    return;
  }

  const nextStatut = statut || target.statut;
  const nextPerms = Array.isArray(permissions) ? JSON.stringify(permissions) : (target.permissions_json as string);
  const nextRole = role && target.role !== 'fondateur' ? role : target.role;

  db.prepare(
    `UPDATE users SET
      statut = ?,
      motif_refus = ?,
      permissions_json = ?,
      role = ?,
      demande_reexamen = CASE WHEN ? = 'actif' THEN NULL ELSE demande_reexamen END,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextStatut,
    statut === 'refuse' ? motif_refus!.trim() : statut === 'actif' ? null : (target.motif_refus as string | null),
    nextPerms,
    nextRole,
    nextStatut,
    targetId
  );

  // Optional parent/student linkage during approval
  if (link_matricule?.trim()) {
    const st = db.prepare('SELECT id FROM students WHERE matricule = ?').get(link_matricule.trim()) as
      | { id: number }
      | undefined;
    if (st) {
      if (nextRole === 'parent') {
        db.prepare('INSERT OR IGNORE INTO parent_student_links (parent_user_id, eleve_id) VALUES (?, ?)').run(
          targetId,
          st.id
        );
      } else if (nextRole === 'eleve') {
        db.prepare('UPDATE students SET user_id = ? WHERE id = ?').run(targetId, st.id);
      }
    }
  }

  if (nextStatut === 'suspendu' || nextStatut === 'desactive') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  }

  notifyUser(
    targetId,
    'Décision sur votre compte',
    nextStatut === 'actif'
      ? 'Votre compte a été activé par la direction.'
      : `Statut du compte mis à jour : ${nextStatut}${motif_refus ? ` (${motif_refus})` : ''}.`
  );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Utilisateur',
    entiteId: targetId,
    description: `Mise à jour du compte ${target.prenom} ${target.nom} : statut ${target.statut} → ${nextStatut}.`,
    ancienneValeur: { statut: target.statut, role: target.role },
    nouvelleValeur: { statut: nextStatut, role: nextRole, motif_refus },
  });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as Record<string, unknown>;
  res.json({ user: sanitizeUser(updated) });
});

// Audit logs (read-only, immutable)
router.get('/audit-logs', requireAuth, requireRoles('fondateur', 'proviseur', 'censeur', 'secretaire'), (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 150, 500);
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ logs: rows });
});

// Fondateur backup export & restore (Decision 14)
router.get('/platform/backup', requireAuth, requireRoles('fondateur'), (req: AuthRequest, res) => {
  const tables = [
    'school_settings',
    'users',
    'academic_years',
    'school_periods',
    'classes',
    'subjects',
    'class_subjects',
    'teacher_assignments',
    'students',
    'parent_student_links',
    'evaluations',
    'grades',
    'grade_transmissions',
    'grade_correction_requests',
    'grade_history',
    'course_materials',
    'bulletins',
    'bulletin_versions',
    'result_claims',
    'attendance',
    'discipline_incidents',
    'fee_schedules',
    'payments',
    'expenses',
    'inventory_items',
    'inventory_movements',
    'calendar_events',
    'announcements',
    'timetable_slots',
    'homework_assignments',
    'internal_messages',
    'audit_logs',
  ];
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Téléchargement',
    entite: 'Sauvegarde',
    description: 'Exportation complète de la sauvegarde de la plateforme.',
  });

  res.json({
    exported_at: new Date().toISOString(),
    version: '1.0',
    data: dump,
  });
});

// Protected file viewer/downloader with strict path confinement
router.get('/files/*', requireAuth, (req: AuthRequest, res) => {
  const requested = String((req.params as Record<string, string>)[0] || '');
  const resolved = path.resolve(UPLOAD_DIR, requested);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Fichier introuvable.' });
    return;
  }
  res.sendFile(resolved);
});

export default router;
