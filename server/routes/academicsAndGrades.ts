import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import * as XLSX from 'xlsx';
import { logAudit, notifyRoles, notifyUser, requireAuth, requireRoles, type AuthRequest } from '../auth.ts';
import { db, UPLOAD_DIR } from '../db.ts';
import type { GradeEntryStatus } from '../../src/types.ts';

const router = express.Router();

// Multer setups
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'photos')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `eleve_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) cb(null, true);
    else cb(new Error('Format photo invalide (.png, .jpg, .jpeg, .webp).'));
  },
});

const excelUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'imports')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `import_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Décision n°8: .xlsx and .xls accepted
    if (['.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Format Excel non autorisé. Formats acceptés : .xlsx et .xls.'));
  },
});

const materialUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'supports')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `support_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Décision n°9: PDF, Word (.doc, .docx), PowerPoint (.ppt, .pptx)
    if (['.pdf', '.doc', '.docx', '.ppt', '.pptx'].includes(ext)) cb(null, true);
    else cb(new Error('Format non autorisé. Extensions acceptées : .pdf, .doc, .docx, .ppt, .pptx.'));
  },
});

const ORDINARY_STUDENT_FIELDS = ['telephone', 'adresse', 'parent_nom', 'parent_telephone', 'parent_email'] as const;
const IMPORTANT_STUDENT_FIELDS = [
  'nom',
  'prenom',
  'sexe',
  'date_naissance',
  'lieu_naissance',
  'matricule',
  'classe_id',
  'statut_administratif',
] as const;

function isPeriodLocked(periodeId: number): boolean {
  const p = db.prepare('SELECT statut FROM school_periods WHERE id = ?').get(periodeId) as { statut: string } | undefined;
  return !p || p.statut === 'cloturee' || p.statut === 'archivee';
}

function isEvaluationTransmitted(evalId: number): boolean {
  const tr = db
    .prepare(
      `SELECT statut FROM grade_transmissions WHERE evaluation_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(evalId) as { statut: string } | undefined;
  return Boolean(tr && ['transmis', 'en_verification', 'accepte', 'nouvelle_transmission'].includes(tr.statut));
}

// ---------------- ACADEMIC YEARS ----------------
router.get('/academic-years', requireAuth, (_req, res) => {
  const years = db.prepare('SELECT * FROM academic_years ORDER BY date_debut DESC').all();
  res.json({ years });
});

router.post('/academic-years', requireAuth, requireRoles('fondateur', 'proviseur'), (req: AuthRequest, res) => {
  const { libelle, date_debut, date_fin, est_active } = req.body as {
    libelle: string;
    date_debut: string;
    date_fin: string;
    est_active?: boolean;
  };
  if (!libelle?.trim() || !date_debut || !date_fin) {
    res.status(400).json({ error: 'Libellé, date de début et date de fin requis.' });
    return;
  }
  if (est_active) {
    db.prepare('UPDATE academic_years SET est_active = 0').run();
  }
  const info = db
    .prepare('INSERT INTO academic_years (libelle, date_debut, date_fin, est_active) VALUES (?, ?, ?, ?)')
    .run(libelle.trim(), date_debut, date_fin, est_active ? 1 : 0);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Année scolaire',
    entiteId: info.lastInsertRowid,
    description: `Création de l’année scolaire ${libelle.trim()}.`,
  });

  res.status(201).json({ year: db.prepare('SELECT * FROM academic_years WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/academic-years/:id', requireAuth, requireRoles('fondateur', 'proviseur'), (req: AuthRequest, res) => {
  const { est_active, statut } = req.body as { est_active?: boolean; statut?: string };
  if (est_active) {
    db.prepare('UPDATE academic_years SET est_active = 0').run();
  }
  db.prepare(
    `UPDATE academic_years SET
      est_active = COALESCE(?, est_active),
      statut = COALESCE(?, statut)
     WHERE id = ?`
  ).run(est_active !== undefined ? (est_active ? 1 : 0) : null, statut || null, req.params.id);

  res.json({ year: db.prepare('SELECT * FROM academic_years WHERE id = ?').get(req.params.id) });
});

// ---------------- SCHOOL PERIODS (Décision n°2) ----------------
router.get('/periods', requireAuth, (req, res) => {
  const anneeId = req.query.annee_id ? Number(req.query.annee_id) : null;
  const rows = anneeId
    ? db
        .prepare(
          `SELECT p.*, y.libelle AS annee_libelle
           FROM school_periods p
           JOIN academic_years y ON y.id = p.annee_id
           WHERE p.annee_id = ?
           ORDER BY p.ordre, p.date_debut`
        )
        .all(anneeId)
    : db
        .prepare(
          `SELECT p.*, y.libelle AS annee_libelle
           FROM school_periods p
           JOIN academic_years y ON y.id = p.annee_id
           ORDER BY y.date_debut DESC, p.ordre, p.date_debut`
        )
        .all();
  res.json({ periods: rows });
});

router.post('/periods', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { annee_id, nom, type_decoupage, date_debut, date_fin, ordre } = req.body as {
    annee_id: number;
    nom: string;
    type_decoupage: string;
    date_debut: string;
    date_fin: string;
    ordre?: number;
  };
  if (!annee_id || !nom?.trim() || !date_debut || !date_fin) {
    res.status(400).json({ error: 'Année, nom de période et dates sont requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO school_periods (annee_id, nom, type_decoupage, date_debut, date_fin, statut, ordre)
       VALUES (?, ?, ?, ?, ?, 'planifiee', ?)`
    )
    .run(annee_id, nom.trim(), type_decoupage || 'trimestre', date_debut, date_fin, ordre || 1);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Période scolaire',
    entiteId: info.lastInsertRowid,
    description: `Création de la période "${nom.trim()}" (${date_debut} → ${date_fin}).`,
  });

  res.status(201).json({ period: db.prepare('SELECT * FROM school_periods WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/periods/:id', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM school_periods WHERE id = ?').get(id) as
    | { id: number; statut: string; nom: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Période introuvable.' });
    return;
  }

  const { nom, date_debut, date_fin, statut } = req.body as {
    nom?: string;
    date_debut?: string;
    date_fin?: string;
    statut?: string;
  };

  if ((existing.statut === 'cloturee' || existing.statut === 'archivee') && (nom || date_debut || date_fin)) {
    res.status(403).json({ error: 'Une période clôturée ou archivée ne peut plus être modifiée librement.' });
    return;
  }

  db.prepare(
    `UPDATE school_periods SET
      nom = COALESCE(?, nom),
      date_debut = COALESCE(?, date_debut),
      date_fin = COALESCE(?, date_fin),
      statut = COALESCE(?, statut)
     WHERE id = ?`
  ).run(nom?.trim() || null, date_debut || null, date_fin || null, statut || null, id);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Période scolaire',
    entiteId: id,
    description: `Mise à jour de la période "${existing.nom}" → statut: ${statut || existing.statut}.`,
    ancienneValeur: existing,
  });

  res.json({ period: db.prepare('SELECT * FROM school_periods WHERE id = ?').get(id) });
});

// ---------------- CLASSES, SUBJECTS, COEFFICIENTS & ASSIGNMENTS ----------------
router.get('/classes', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM students s WHERE s.classe_id = c.id AND s.est_archive = 0) AS effectif
       FROM classes c
       ORDER BY c.niveau, c.nom`
    )
    .all();
  res.json({ classes: rows });
});

router.post('/classes', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { annee_id, nom, niveau, serie, regle_notes_manquantes } = req.body as {
    annee_id: number;
    nom: string;
    niveau: string;
    serie?: string;
    regle_notes_manquantes?: string;
  };
  if (!annee_id || !nom?.trim() || !niveau?.trim()) {
    res.status(400).json({ error: 'Année, nom de classe et niveau requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO classes (annee_id, nom, niveau, serie, regle_notes_manquantes) VALUES (?, ?, ?, ?, ?)`
    )
    .run(annee_id, nom.trim(), niveau.trim(), serie?.trim() || null, regle_notes_manquantes || 'neutralise');

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Classe',
    entiteId: info.lastInsertRowid,
    description: `Création de la classe ${nom.trim()} (${niveau.trim()}).`,
  });
  res.status(201).json({ classe: db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/classes/:id/missing-rule', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { regle_notes_manquantes } = req.body as { regle_notes_manquantes: string };
  if (!['zero', 'neutralise', 'minimum'].includes(regle_notes_manquantes)) {
    res.status(400).json({ error: 'Règle invalide.' });
    return;
  }
  db.prepare('UPDATE classes SET regle_notes_manquantes = ? WHERE id = ?').run(regle_notes_manquantes, req.params.id);
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Règle absences/notes manquantes',
    entiteId: req.params.id,
    description: `Définition de la règle de notes manquantes : ${regle_notes_manquantes}.`,
  });
  res.json({ classe: db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id) });
});

router.get('/subjects', requireAuth, (_req, res) => {
  const subjects = db.prepare('SELECT * FROM subjects ORDER BY nom').all();
  const classSubjects = db
    .prepare(
      `SELECT cs.*, c.nom AS classe_nom, s.nom AS matiere_nom, s.code AS matiere_code
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.classe_id
       JOIN subjects s ON s.id = cs.matiere_id
       ORDER BY c.nom, s.nom`
    )
    .all();
  res.json({ subjects, classSubjects });
});

router.post('/subjects', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { code, nom } = req.body as { code: string; nom: string };
  if (!code?.trim() || !nom?.trim()) {
    res.status(400).json({ error: 'Code et nom de la matière requis.' });
    return;
  }
  const info = db.prepare('INSERT INTO subjects (code, nom) VALUES (?, ?)').run(code.trim().toUpperCase(), nom.trim());
  res.status(201).json({ subject: db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid) });
});

router.post('/class-subjects', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { classe_id, matiere_id, coefficient } = req.body as {
    classe_id: number;
    matiere_id: number;
    coefficient: number;
  };
  if (!classe_id || !matiere_id || !coefficient || coefficient <= 0) {
    res.status(400).json({ error: 'Classe, matière et coefficient (> 0) requis.' });
    return;
  }
  db.prepare(
    `INSERT INTO class_subjects (classe_id, matiere_id, coefficient)
     VALUES (?, ?, ?)
     ON CONFLICT(classe_id, matiere_id) DO UPDATE SET coefficient = excluded.coefficient`
  ).run(classe_id, matiere_id, coefficient);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Coefficient matière',
    description: `Coefficient ${coefficient} attribué pour classe #${classe_id}, matière #${matiere_id}.`,
  });
  res.json({ ok: true });
});

router.get('/assignments', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT ta.*, u.nom AS enseignant_nom, u.prenom AS enseignant_prenom, c.nom AS classe_nom, s.nom AS matiere_nom
       FROM teacher_assignments ta
       JOIN users u ON u.id = ta.enseignant_id
       JOIN classes c ON c.id = ta.classe_id
       JOIN subjects s ON s.id = ta.matiere_id
       ORDER BY c.nom, s.nom`
    )
    .all();
  res.json({ assignments: rows });
});

router.post('/assignments', requireAuth, requireRoles('proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const { enseignant_id, classe_id, matiere_id, annee_id } = req.body as Record<string, number>;
  if (!enseignant_id || !classe_id || !matiere_id || !annee_id) {
    res.status(400).json({ error: 'Enseignant, classe, matière et année scolaire requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO teacher_assignments (enseignant_id, classe_id, matiere_id, annee_id) VALUES (?, ?, ?, ?)`
    )
    .run(enseignant_id, classe_id, matiere_id, annee_id);
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------------- STUDENT DOSSIERS & MODIFICATION APPROVALS (Décision n°12) ----------------
router.get('/students', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const classeId = req.query.classe_id ? Number(req.query.classe_id) : null;
  const includeArchived = req.query.archived === '1';

  let sql = `
    SELECT s.*, c.nom AS classe_nom
    FROM students s
    LEFT JOIN classes c ON c.id = s.classe_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!includeArchived) {
    sql += ' AND s.est_archive = 0';
  }

  if (role === 'eleve') {
    sql += ' AND s.user_id = ?';
    params.push(req.authUser!.id);
  } else if (role === 'parent') {
    sql += ' AND s.id IN (SELECT eleve_id FROM parent_student_links WHERE parent_user_id = ?)';
    params.push(req.authUser!.id);
  } else if (classeId) {
    sql += ' AND s.classe_id = ?';
    params.push(classeId);
  }

  sql += ' ORDER BY s.nom, s.prenom';
  const students = db.prepare(sql).all(...params);
  res.json({ students });
});

router.post('/students', requireAuth, requireRoles('secretaire', 'proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const matricule = String(b.matricule || '').trim().toUpperCase();
  const nom = String(b.nom || '').trim();
  const prenom = String(b.prenom || '').trim();
  const date_naissance = String(b.date_naissance || '').trim();

  if (!matricule || !nom || !prenom || !date_naissance) {
    res.status(400).json({ error: 'Matricule, nom, prénom et date de naissance sont obligatoires.' });
    return;
  }

  if (db.prepare('SELECT id FROM students WHERE matricule = ?').get(matricule)) {
    res.status(409).json({ error: 'Un dossier élève existe déjà avec ce matricule.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO students (
        matricule, nom, prenom, sexe, date_naissance, lieu_naissance, classe_id, annee_id,
        telephone, adresse, parent_nom, parent_telephone, parent_email, statut_administratif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inscrit')`
    )
    .run(
      matricule,
      nom,
      prenom,
      b.sexe === 'F' ? 'F' : 'M',
      date_naissance,
      b.lieu_naissance ? String(b.lieu_naissance).trim() : null,
      b.classe_id ? Number(b.classe_id) : null,
      b.annee_id ? Number(b.annee_id) : null,
      b.telephone ? String(b.telephone).trim() : null,
      b.adresse ? String(b.adresse).trim() : null,
      b.parent_nom ? String(b.parent_nom).trim() : null,
      b.parent_telephone ? String(b.parent_telephone).trim() : null,
      b.parent_email ? String(b.parent_email).trim() : null
    );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Dossier élève',
    entiteId: info.lastInsertRowid,
    description: `Création du dossier élève ${prenom} ${nom} (${matricule}).`,
  });

  res.status(201).json({ student: db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid) });
});

router.post(
  '/students/:id/photo',
  requireAuth,
  requireRoles('secretaire', 'proviseur', 'fondateur'),
  photoUpload.single('photo'),
  (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier photo fourni.' });
      return;
    }
    const relPath = `photos/${req.file.filename}`;
    db.prepare(`UPDATE students SET photo_path = ?, updated_at = datetime('now') WHERE id = ?`).run(
      relPath,
      req.params.id
    );
    res.json({ photo_path: relPath });
  }
);

// Décision n°12: Ordinary fields updated directly by Secretariat; Important fields require Proviseur approval + motif
router.patch('/students/:id', requireAuth, requireRoles('secretaire', 'proviseur', 'fondateur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!student) {
    res.status(404).json({ error: 'Dossier élève introuvable.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const motif = String(body.motif || '').trim();
  const isProviseurOrFondateur = ['proviseur', 'fondateur'].includes(req.authUser!.role);

  const directUpdates: Record<string, unknown> = {};
  const pendingImportant: { champ: string; ancienne: string; nouvelle: string }[] = [];

  for (const field of ORDINARY_STUDENT_FIELDS) {
    if (body[field] !== undefined && String(body[field] ?? '') !== String(student[field] ?? '')) {
      directUpdates[field] = body[field] || null;
    }
  }

  for (const field of IMPORTANT_STUDENT_FIELDS) {
    if (body[field] !== undefined && String(body[field] ?? '') !== String(student[field] ?? '')) {
      if (isProviseurOrFondateur) {
        directUpdates[field] = body[field];
      } else {
        pendingImportant.push({
          champ: field,
          ancienne: String(student[field] ?? ''),
          nouvelle: String(body[field] ?? ''),
        });
      }
    }
  }

  if (pendingImportant.length > 0 && !motif) {
    res.status(400).json({
      error: 'Un motif obligatoire est requis pour toute modification importante (identité, naissance, matricule, classe, statut).',
    });
    return;
  }

  // Apply ordinary updates immediately
  const keys = Object.keys(directUpdates);
  if (keys.length > 0) {
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE students SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
      ...keys.map((k) => directUpdates[k]),
      id
    );
    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Modification',
      entite: 'Dossier élève',
      entiteId: id,
      description: `Modification directe sur le dossier ${student.matricule} (${keys.join(', ')}).`,
      ancienneValeur: student,
      nouvelleValeur: directUpdates,
    });
  }

  // Create approval requests for important fields
  for (const item of pendingImportant) {
    db.prepare(
      `INSERT INTO dossier_modification_requests (eleve_id, demandeur_id, champ, ancienne_valeur, nouvelle_valeur, motif)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, req.authUser!.id, item.champ, item.ancienne, item.nouvelle, motif);
  }

  if (pendingImportant.length > 0) {
    notifyRoles(
      ['proviseur'],
      'Demande de modification de dossier élève',
      `Le secrétariat demande une modification importante pour ${student.prenom} ${student.nom} (${student.matricule}).`,
      'dossiers'
    );
    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Modification',
      entite: 'Demande modification dossier',
      entiteId: id,
      description: `Demande d'approbation au proviseur pour ${student.matricule} : ${pendingImportant
        .map((p) => `${p.champ} (${p.ancienne} → ${p.nouvelle})`)
        .join(', ')}. Motif : ${motif}`,
    });
  }

  res.json({
    student: db.prepare('SELECT * FROM students WHERE id = ?').get(id),
    demandes_creees: pendingImportant.length,
  });
});

router.get('/student-modification-requests', requireAuth, requireRoles('proviseur', 'fondateur', 'secretaire'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule,
              u.prenom || ' ' || u.nom AS demandeur_nom
       FROM dossier_modification_requests r
       JOIN students s ON s.id = r.eleve_id
       JOIN users u ON u.id = r.demandeur_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ requests: rows });
});

router.post(
  '/student-modification-requests/:id/decide',
  requireAuth,
  requireRoles('proviseur'),
  (req: AuthRequest, res) => {
    const reqId = Number(req.params.id);
    const { decision, motif_decision } = req.body as { decision: 'approuvee' | 'refusee'; motif_decision?: string };
    const reqRow = db.prepare('SELECT * FROM dossier_modification_requests WHERE id = ?').get(reqId) as
      | {
          id: number;
          eleve_id: number;
          demandeur_id: number;
          champ: string;
          ancienne_valeur: string;
          nouvelle_valeur: string;
          statut: string;
        }
      | undefined;

    if (!reqRow || reqRow.statut !== 'en_attente') {
      res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
      return;
    }

    if (!['approuvee', 'refusee'].includes(decision)) {
      res.status(400).json({ error: 'Décision invalide.' });
      return;
    }

    if (decision === 'approuvee') {
      if (!IMPORTANT_STUDENT_FIELDS.includes(reqRow.champ as (typeof IMPORTANT_STUDENT_FIELDS)[number])) {
        res.status(400).json({ error: 'Champ non autorisé.' });
        return;
      }
      const val = reqRow.champ === 'classe_id' ? (reqRow.nouvelle_valeur ? Number(reqRow.nouvelle_valeur) : null) : reqRow.nouvelle_valeur;
      db.prepare(`UPDATE students SET ${reqRow.champ} = ?, updated_at = datetime('now') WHERE id = ?`).run(
        val,
        reqRow.eleve_id
      );
    }

    db.prepare(
      `UPDATE dossier_modification_requests
       SET statut = ?, decideur_id = ?, motif_decision = ?, decided_at = datetime('now')
       WHERE id = ?`
    ).run(decision, req.authUser!.id, motif_decision?.trim() || null, reqId);

    notifyUser(
      reqRow.demandeur_id,
      'Décision sur modification de dossier',
      `Votre demande sur le champ "${reqRow.champ}" a été ${decision === 'approuvee' ? 'approuvée' : 'refusée'}.`,
      'dossiers'
    );

    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Modification',
      entite: 'Décision dossier élève',
      entiteId: reqRow.eleve_id,
      description: `Décision du proviseur (${decision}) pour le champ ${reqRow.champ}.`,
      ancienneValeur: reqRow.ancienne_valeur,
      nouvelleValeur: reqRow.nouvelle_valeur,
    });

    res.json({ ok: true });
  }
);

// ---------------- EVALUATIONS (Décisions n°1, n°2, n°3) ----------------
router.get('/evaluations', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, p.nom AS periode_nom, c.nom AS classe_nom, s.nom AS matiere_nom,
              u.prenom || ' ' || u.nom AS enseignant_nom,
              (SELECT gt.statut FROM grade_transmissions gt WHERE gt.evaluation_id = e.id ORDER BY gt.id DESC LIMIT 1) AS transmission_statut
       FROM evaluations e
       JOIN school_periods p ON p.id = e.periode_id
       JOIN classes c ON c.id = e.classe_id
       JOIN subjects s ON s.id = e.matiere_id
       JOIN users u ON u.id = e.enseignant_id
       ORDER BY e.date_evaluation DESC, e.id DESC`
    )
    .all();
  res.json({ evaluations: rows });
});

router.post('/evaluations', requireAuth, requireRoles('enseignant', 'proviseur', 'censeur'), (req: AuthRequest, res) => {
  const { annee_id, periode_id, classe_id, matiere_id, titre, type, date_evaluation, bareme_max, regle_notes_manquantes, description } =
    req.body as Record<string, unknown>;

  if (!annee_id || !periode_id || !classe_id || !matiere_id || !String(titre || '').trim() || !date_evaluation) {
    res.status(400).json({ error: 'Année, période, classe, matière, titre et date sont requis.' });
    return;
  }

  const bareme = Number(bareme_max);
  if (!Number.isFinite(bareme) || bareme <= 0) {
    res.status(400).json({ error: 'Le barème maximal doit être un nombre strictement positif (ex. 10, 20, 40, 100).' });
    return;
  }

  if (isPeriodLocked(Number(periode_id))) {
    res.status(403).json({ error: 'Impossible de créer une évaluation dans une période clôturée ou archivée.' });
    return;
  }

  // If teacher, verify assignment (Decision 9.1 / PDF)
  if (req.authUser!.role === 'enseignant') {
    const assigned = db
      .prepare(
        `SELECT id FROM teacher_assignments WHERE enseignant_id = ? AND classe_id = ? AND matiere_id = ?`
      )
      .get(req.authUser!.id, Number(classe_id), Number(matiere_id));
    if (!assigned) {
      res.status(403).json({ error: 'Vous ne pouvez créer une évaluation que pour les classes et matières qui vous sont affectées.' });
      return;
    }
  }

  const cls = db.prepare('SELECT regle_notes_manquantes FROM classes WHERE id = ?').get(Number(classe_id)) as
    | { regle_notes_manquantes: string }
    | undefined;

  const info = db
    .prepare(
      `INSERT INTO evaluations (annee_id, periode_id, classe_id, matiere_id, enseignant_id, titre, type, date_evaluation, bareme_max, regle_notes_manquantes, description, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'programmee')`
    )
    .run(
      Number(annee_id),
      Number(periode_id),
      Number(classe_id),
      Number(matiere_id),
      req.authUser!.id,
      String(titre).trim(),
      String(type || 'devoir_surveille'),
      String(date_evaluation),
      bareme,
      String(regle_notes_manquantes || cls?.regle_notes_manquantes || 'neutralise'),
      description ? String(description).trim() : null
    );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Évaluation',
    entiteId: info.lastInsertRowid,
    description: `Création de l’évaluation "${String(titre).trim()}" (barème /${bareme}).`,
  });

  res.status(201).json({ evaluation: db.prepare('SELECT * FROM evaluations WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/evaluations/:id', requireAuth, requireRoles('enseignant', 'proviseur'), (req: AuthRequest, res) => {
  const evalId = Number(req.params.id);
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) as
    | { id: number; enseignant_id: number; periode_id: number; titre: string; bareme_max: number }
    | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  if (req.authUser!.role === 'enseignant') {
    if (ev.enseignant_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres évaluations.' });
      return;
    }
    if (isEvaluationTransmitted(evalId)) {
      res.status(403).json({ error: 'Évaluation verrouillée après transmission au secrétariat (Décision n°3).' });
      return;
    }
  }

  if (isPeriodLocked(ev.periode_id)) {
    res.status(403).json({ error: 'La période est clôturée : modification bloquée.' });
    return;
  }

  const { titre, type, date_evaluation, bareme_max, description, regle_notes_manquantes } = req.body as Record<string, unknown>;
  if (bareme_max !== undefined && Number(bareme_max) <= 0) {
    res.status(400).json({ error: 'Le barème maximal doit être positif.' });
    return;
  }

  db.prepare(
    `UPDATE evaluations SET
      titre = COALESCE(?, titre),
      type = COALESCE(?, type),
      date_evaluation = COALESCE(?, date_evaluation),
      bareme_max = COALESCE(?, bareme_max),
      description = COALESCE(?, description),
      regle_notes_manquantes = COALESCE(?, regle_notes_manquantes)
     WHERE id = ?`
  ).run(
    titre ? String(titre).trim() : null,
    type ? String(type) : null,
    date_evaluation ? String(date_evaluation) : null,
    bareme_max !== undefined ? Number(bareme_max) : null,
    description !== undefined ? String(description) : null,
    regle_notes_manquantes ? String(regle_notes_manquantes) : null,
    evalId
  );

  res.json({ evaluation: db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) });
});

router.delete('/evaluations/:id', requireAuth, requireRoles('enseignant', 'proviseur'), (req: AuthRequest, res) => {
  const evalId = Number(req.params.id);
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) as
    | { id: number; enseignant_id: number; periode_id: number; titre: string }
    | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  if (req.authUser!.role === 'enseignant') {
    if (ev.enseignant_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Suppression réservée à l’enseignant auteur.' });
      return;
    }
    if (isEvaluationTransmitted(evalId)) {
      res.status(403).json({ error: 'Évaluation déjà transmise au secrétariat : suppression interdite (Décision n°3).' });
      return;
    }
  }

  db.prepare('DELETE FROM evaluations WHERE id = ?').run(evalId);
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Suppression',
    entite: 'Évaluation',
    entiteId: evalId,
    description: `Suppression de l’évaluation "${ev.titre}" avant transmission.`,
  });
  res.json({ ok: true });
});

// ---------------- GRADES ENTRY, EXCEL TEMPLATE/IMPORT & TRANSMISSIONS ----------------
router.get('/evaluations/:id/grades', requireAuth, (req: AuthRequest, res) => {
  const evalId = Number(req.params.id);
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) as
    | { id: number; classe_id: number; matiere_id: number; bareme_max: number; enseignant_id: number }
    | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  const students = db
    .prepare(
      `SELECT s.id AS eleve_id, s.matricule, s.nom, s.prenom,
              g.id AS grade_id, g.valeur, COALESCE(g.statut_note, 'en_attente') AS statut_note,
              g.appreciation, COALESCE(g.est_provisoire, 1) AS est_provisoire, g.updated_at
       FROM students s
       LEFT JOIN grades g ON g.eleve_id = s.id AND g.evaluation_id = ?
       WHERE s.classe_id = ? AND s.est_archive = 0
       ORDER BY s.nom, s.prenom`
    )
    .all(evalId, ev.classe_id);

  const transmission = db
    .prepare('SELECT * FROM grade_transmissions WHERE evaluation_id = ? ORDER BY id DESC LIMIT 1')
    .get(evalId);

  res.json({ evaluation: ev, rows: students, transmission });
});

// Save draft or transmit grades directly (Décisions n°1, n°3, n°7, n°10.2)
router.post('/evaluations/:id/grades', requireAuth, requireRoles('enseignant', 'secretaire'), (req: AuthRequest, res) => {
  const evalId = Number(req.params.id);
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) as
    | {
        id: number;
        classe_id: number;
        matiere_id: number;
        periode_id: number;
        bareme_max: number;
        titre: string;
        enseignant_id: number;
      }
    | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  if (isPeriodLocked(ev.periode_id)) {
    res.status(403).json({ error: 'Période clôturée ou archivée : saisie impossible.' });
    return;
  }

  if (req.authUser!.role === 'enseignant') {
    const assigned = db
      .prepare('SELECT id FROM teacher_assignments WHERE enseignant_id = ? AND classe_id = ? AND matiere_id = ?')
      .get(req.authUser!.id, ev.classe_id, ev.matiere_id);
    if (!assigned) {
      res.status(403).json({ error: 'Classe/matière non affectée à cet enseignant.' });
      return;
    }
    if (isEvaluationTransmitted(evalId)) {
      res.status(403).json({
        error: 'Les notes ont déjà été transmises au secrétariat et sont verrouillées. Soumettez une demande de correction.',
      });
      return;
    }
  }

  const { entries, action } = req.body as {
    entries: { eleve_id: number; valeur: number | null; statut_note: GradeEntryStatus; appreciation?: string }[];
    action: 'brouillon' | 'transmettre';
  };

  if (!Array.isArray(entries)) {
    res.status(400).json({ error: 'Liste des notes invalide.' });
    return;
  }

  // Validate every grade against bareme_max (Décision n°1) and class membership
  const validStudentIds = new Set(
    (db.prepare('SELECT id FROM students WHERE classe_id = ? AND est_archive = 0').all(ev.classe_id) as { id: number }[]).map(
      (s) => s.id
    )
  );

  for (const item of entries) {
    if (!validStudentIds.has(item.eleve_id)) {
      res.status(400).json({ error: `Élève #${item.eleve_id} n’appartient pas à cette classe.` });
      return;
    }
    if (item.statut_note === 'note') {
      if (item.valeur === null || !Number.isFinite(Number(item.valeur))) {
        res.status(400).json({ error: 'Une note numérique valide est requise pour le statut "Note".' });
        return;
      }
      if (Number(item.valeur) < 0 || Number(item.valeur) > ev.bareme_max) {
        res.status(400).json({
          error: `Note refusée (${item.valeur}) : elle doit être comprise entre 0 et le barème autorisé (${ev.bareme_max}).`,
        });
        return;
      }
    }
  }

  const upsert = db.prepare(
    `INSERT INTO grades (evaluation_id, eleve_id, valeur, statut_note, appreciation, est_provisoire, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
     ON CONFLICT(evaluation_id, eleve_id) DO UPDATE SET
       valeur = excluded.valeur,
       statut_note = excluded.statut_note,
       appreciation = excluded.appreciation,
       updated_by = excluded.updated_by,
       version = grades.version + 1,
       updated_at = datetime('now')`
  );

  const runTx = db.transaction(() => {
    for (const item of entries) {
      const val = item.statut_note === 'note' ? Number(item.valeur) : null;
      upsert.run(evalId, item.eleve_id, val, item.statut_note || 'en_attente', item.appreciation?.trim() || null, req.authUser!.id);
    }

    if (action === 'transmettre') {
      const lastTr = db
        .prepare('SELECT statut FROM grade_transmissions WHERE evaluation_id = ? ORDER BY id DESC LIMIT 1')
        .get(evalId) as { statut: string } | undefined;
      const nextTrStatut = lastTr?.statut === 'retourne' ? 'nouvelle_transmission' : 'transmis';

      db.prepare(
        `INSERT INTO grade_transmissions (evaluation_id, enseignant_id, methode, statut, snapshot_json)
         VALUES (?, ?, 'saisie_directe', ?, ?)`
      ).run(evalId, req.authUser!.id, nextTrStatut, JSON.stringify(entries));
      db.prepare(`UPDATE evaluations SET statut = 'terminee' WHERE id = ?`).run(evalId);
    }
  });

  runTx();

  if (action === 'transmettre') {
    notifyRoles(
      ['secretaire'],
      'Nouvelle transmission de notes',
      `${req.authUser!.prenom} ${req.authUser!.nom} a transmis les notes pour "${ev.titre}".`,
      'transmissions'
    );
    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Transmission de notes',
      entite: 'Évaluation',
      entiteId: evalId,
      description: `Transmission directe de ${entries.length} lignes de notes pour "${ev.titre}" (barème /${ev.bareme_max}).`,
    });
  }

  res.json({ ok: true, action });
});

// Download official Excel template for evaluation (Décision n°8)
router.get('/evaluations/:id/excel-template', requireAuth, (req: AuthRequest, res) => {
  const evalId = Number(req.params.id);
  const ev = db
    .prepare(
      `SELECT e.*, c.nom AS classe_nom, s.nom AS matiere_nom
       FROM evaluations e
       JOIN classes c ON c.id = e.classe_id
       JOIN subjects s ON s.id = e.matiere_id
       WHERE e.id = ?`
    )
    .get(evalId) as { id: number; classe_id: number; classe_nom: string; matiere_nom: string; titre: string; bareme_max: number } | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  const students = db
    .prepare('SELECT matricule, nom, prenom FROM students WHERE classe_id = ? AND est_archive = 0 ORDER BY nom, prenom')
    .all(ev.classe_id) as { matricule: string; nom: string; prenom: string }[];

  const rows = students.map((st) => ({
    Matricule: st.matricule,
    Nom: st.nom,
    Prenom: st.prenom,
    Note: '',
    Statut: 'note',
    Appreciation: '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Matricule: '', Nom: '', Prenom: '', Note: '', Statut: 'note', Appreciation: '' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Notes');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="modele_${ev.classe_nom}_${ev.matiere_nom}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Import Excel (.xlsx / .xls) — preview validation report & save provisional + transmit (Décision n°8)
router.post(
  '/evaluations/:id/import-excel',
  requireAuth,
  requireRoles('enseignant', 'secretaire'),
  excelUpload.single('file'),
  (req: AuthRequest, res) => {
    const evalId = Number(req.params.id);
    const mode = String(req.body.mode || 'preview'); // 'preview' or 'confirm_transmit'
    const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId) as
      | { id: number; classe_id: number; matiere_id: number; periode_id: number; bareme_max: number; titre: string }
      | undefined;

    if (!ev) {
      res.status(404).json({ error: 'Évaluation introuvable.' });
      return;
    }

    if (isPeriodLocked(ev.periode_id)) {
      res.status(403).json({ error: 'Période clôturée : importation bloquée.' });
      return;
    }

    if (req.authUser!.role === 'enseignant') {
      const assigned = db
        .prepare('SELECT id FROM teacher_assignments WHERE enseignant_id = ? AND classe_id = ? AND matiere_id = ?')
        .get(req.authUser!.id, ev.classe_id, ev.matiere_id);
      if (!assigned) {
        res.status(403).json({ error: 'Vous n’êtes pas affecté à cette classe/matière.' });
        return;
      }
      if (isEvaluationTransmitted(evalId)) {
        res.status(403).json({ error: 'Évaluation déjà transmise et verrouillée.' });
        return;
      }
    }

    if (!req.file) {
      res.status(400).json({ error: 'Veuillez joindre un fichier Excel (.xlsx ou .xls).' });
      return;
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'Le fichier Excel ne contient aucune ligne de données.' });
      return;
    }

    const firstKeys = Object.keys(rawRows[0]).map((k) => k.trim().toLowerCase());
    if (!firstKeys.includes('matricule') || !firstKeys.includes('note')) {
      res.status(400).json({
        error: 'Structure invalide : les colonnes "Matricule" et "Note" sont obligatoires.',
      });
      return;
    }

    const classStudents = db
      .prepare('SELECT id, matricule, nom, prenom FROM students WHERE classe_id = ? AND est_archive = 0')
      .all(ev.classe_id) as { id: number; matricule: string; nom: string; prenom: string }[];
    const byMatricule = new Map(classStudents.map((s) => [s.matricule.toUpperCase(), s]));

    const seenMatricules = new Set<string>();
    const errors: { ligne: number; matricule: string; erreur: string }[] = [];
    const validEntries: {
      eleve_id: number;
      matricule: string;
      nom: string;
      prenom: string;
      valeur: number | null;
      statut_note: GradeEntryStatus;
      appreciation: string | null;
    }[] = [];

    rawRows.forEach((row, idx) => {
      const lineNum = idx + 2;
      const getCol = (name: string) => {
        const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name);
        return key ? row[key] : '';
      };

      const matricule = String(getCol('matricule') || '').trim().toUpperCase();
      const rawNote = getCol('note');
      const rawStatut = String(getCol('statut') || '').trim().toLowerCase();
      const appreciation = String(getCol('appreciation') || '').trim() || null;

      if (!matricule) {
        errors.push({ ligne: lineNum, matricule: '—', erreur: 'Matricule manquant.' });
        return;
      }
      if (seenMatricules.has(matricule)) {
        errors.push({ ligne: lineNum, matricule, erreur: 'Matricule en doublon dans le fichier.' });
        return;
      }
      seenMatricules.add(matricule);

      const student = byMatricule.get(matricule);
      if (!student) {
        errors.push({
          ligne: lineNum,
          matricule,
          erreur: 'Élève inconnu ou n’appartenant pas à cette classe (aucune création automatique autorisée).',
        });
        return;
      }

      const validStatuses: GradeEntryStatus[] = [
        'note',
        'absent_justifie',
        'absent_non_justifie',
        'dispense',
        'en_attente',
      ];
      let statut_note: GradeEntryStatus = validStatuses.includes(rawStatut as GradeEntryStatus)
        ? (rawStatut as GradeEntryStatus)
        : 'note';

      if (rawNote === '' || rawNote === null || rawNote === undefined) {
        if (!rawStatut || statut_note === 'note') {
          statut_note = 'en_attente';
        }
        validEntries.push({
          eleve_id: student.id,
          matricule: student.matricule,
          nom: student.nom,
          prenom: student.prenom,
          valeur: null,
          statut_note,
          appreciation,
        });
        return;
      }

      const num = Number(String(rawNote).replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) {
        errors.push({ ligne: lineNum, matricule, erreur: `Note invalide (${rawNote}).` });
        return;
      }
      if (num > ev.bareme_max) {
        errors.push({
          ligne: lineNum,
          matricule,
          erreur: `Note (${num}) supérieure au barème autorisé (${ev.bareme_max}).`,
        });
        return;
      }

      validEntries.push({
        eleve_id: student.id,
        matricule: student.matricule,
        nom: student.nom,
        prenom: student.prenom,
        valeur: num,
        statut_note: 'note',
        appreciation,
      });
    });

    const report = {
      total_lignes: rawRows.length,
      valides: validEntries.length,
      erreurs_count: errors.length,
      errors,
      preview: validEntries,
    };

    const relPath = `imports/${req.file.filename}`;
    const importInfo = db
      .prepare(
        `INSERT INTO excel_imports (evaluation_id, enseignant_id, fichier_nom, fichier_path, rapport_json, statut)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        evalId,
        req.authUser!.id,
        req.file.originalname,
        relPath,
        JSON.stringify({ total_lignes: report.total_lignes, valides: report.valides, erreurs_count: report.erreurs_count, errors }),
        mode === 'confirm_transmit' && errors.length === 0 ? 'transmis_provisoire' : 'apercu'
      );

    if (mode === 'confirm_transmit') {
      if (errors.length > 0) {
        res.status(400).json({ error: 'Corrigez les erreurs signalées avant de transmettre le fichier.', report });
        return;
      }

      const upsert = db.prepare(
        `INSERT INTO grades (evaluation_id, eleve_id, valeur, statut_note, appreciation, est_provisoire, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
         ON CONFLICT(evaluation_id, eleve_id) DO UPDATE SET
           valeur = excluded.valeur,
           statut_note = excluded.statut_note,
           appreciation = excluded.appreciation,
           est_provisoire = 1,
           updated_by = excluded.updated_by,
           version = grades.version + 1,
           updated_at = datetime('now')`
      );

      db.transaction(() => {
        for (const v of validEntries) {
          upsert.run(evalId, v.eleve_id, v.valeur, v.statut_note, v.appreciation, req.authUser!.id);
        }
        db.prepare(
          `INSERT INTO grade_transmissions (evaluation_id, enseignant_id, methode, statut, import_id, snapshot_json)
           VALUES (?, ?, 'import_excel', 'transmis', ?, ?)`
        ).run(evalId, req.authUser!.id, importInfo.lastInsertRowid, JSON.stringify(validEntries));
        db.prepare(`UPDATE evaluations SET statut = 'terminee' WHERE id = ?`).run(evalId);
      })();

      notifyRoles(
        ['secretaire'],
        'Importation Excel transmise',
        `${req.authUser!.prenom} ${req.authUser!.nom} a importé et transmis ${validEntries.length} notes pour "${ev.titre}".`,
        'transmissions'
      );

      logAudit({
        userId: req.authUser!.id,
        userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
        userRole: req.authUser!.role,
        evenement: 'Transmission de notes',
        entite: 'Import Excel',
        entiteId: importInfo.lastInsertRowid,
        description: `Importation Excel (${req.file.originalname}) transmise pour "${ev.titre}" (${validEntries.length} notes provisoires).`,
      });
    }

    res.json({ import_id: importInfo.lastInsertRowid, report });
  }
);

// List transmissions & Excel imports
router.get('/transmissions', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT gt.*, e.titre AS evaluation_titre, e.classe_id, c.nom AS classe_nom, s.nom AS matiere_nom,
              p.nom AS periode_nom, e.bareme_max, u.prenom || ' ' || u.nom AS enseignant_nom
       FROM grade_transmissions gt
       JOIN evaluations e ON e.id = gt.evaluation_id
       JOIN classes c ON c.id = e.classe_id
       JOIN subjects s ON s.id = e.matiere_id
       JOIN school_periods p ON p.id = e.periode_id
       JOIN users u ON u.id = gt.enseignant_id
       ORDER BY gt.id DESC`
    )
    .all();

  const imports = db
    .prepare(
      `SELECT ei.*, e.titre AS evaluation_titre, u.prenom || ' ' || u.nom AS enseignant_nom
       FROM excel_imports ei
       JOIN evaluations e ON e.id = ei.evaluation_id
       JOIN users u ON u.id = ei.enseignant_id
       ORDER BY ei.id DESC LIMIT 50`
    )
    .all();

  res.json({ transmissions: rows, imports });
});

// Secretariat verifies transmission (Accept -> grades become non-provisional; Return -> unlocks for teacher)
router.post('/transmissions/:id/control', requireAuth, requireRoles('secretaire'), (req: AuthRequest, res) => {
  const trId = Number(req.params.id);
  const { decision, motif_retour } = req.body as { decision: 'accepte' | 'retourne'; motif_retour?: string };

  const tr = db
    .prepare('SELECT * FROM grade_transmissions WHERE id = ?')
    .get(trId) as { id: number; evaluation_id: number; enseignant_id: number; statut: string } | undefined;
  if (!tr) {
    res.status(404).json({ error: 'Transmission introuvable.' });
    return;
  }

  if (decision === 'retourne' && !motif_retour?.trim()) {
    res.status(400).json({ error: 'Un motif de retour est obligatoire.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE grade_transmissions SET statut = ?, motif_retour = ?, verifie_at = datetime('now'), verifie_par = ? WHERE id = ?`
    ).run(decision, decision === 'retourne' ? motif_retour!.trim() : null, req.authUser!.id, trId);

    if (decision === 'accepte') {
      db.prepare('UPDATE grades SET est_provisoire = 0 WHERE evaluation_id = ?').run(tr.evaluation_id);
    }
  })();

  notifyUser(
    tr.enseignant_id,
    decision === 'accepte' ? 'Transmission de notes acceptée' : 'Transmission retournée par le secrétariat',
    decision === 'accepte'
      ? `Vos notes pour l’évaluation #${tr.evaluation_id} ont été validées par le secrétariat.`
      : `Le secrétariat a retourné votre transmission : ${motif_retour}`,
    'transmissions'
  );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Contrôle transmission',
    entite: 'Transmission de notes',
    entiteId: trId,
    description: `Contrôle secrétariat : ${decision}${motif_retour ? ` (${motif_retour})` : ''}.`,
  });

  res.json({ ok: true });
});

// ---------------- DOUBLE-VALIDATION GRADE CORRECTIONS (Décision n°6) ----------------
router.get('/grade-corrections', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT gcr.*, e.titre AS evaluation_titre, e.bareme_max, c.nom AS classe_nom, s.nom AS matiere_nom,
              st.nom || ' ' || st.prenom AS eleve_nom, st.matricule AS eleve_matricule,
              u.prenom || ' ' || u.nom AS enseignant_nom
       FROM grade_correction_requests gcr
       JOIN evaluations e ON e.id = gcr.evaluation_id
       JOIN classes c ON c.id = e.classe_id
       JOIN subjects s ON s.id = e.matiere_id
       JOIN students st ON st.id = gcr.eleve_id
       JOIN users u ON u.id = gcr.enseignant_id
       ORDER BY gcr.id DESC`
    )
    .all();

  const history = db
    .prepare(
      `SELECT gh.*, e.titre AS evaluation_titre, st.nom || ' ' || st.prenom AS eleve_nom, st.matricule AS eleve_matricule,
              u.prenom || ' ' || u.nom AS acteur_nom
       FROM grade_history gh
       JOIN evaluations e ON e.id = gh.evaluation_id
       JOIN students st ON st.id = gh.eleve_id
       JOIN users u ON u.id = gh.acteur_id
       ORDER BY gh.id DESC LIMIT 100`
    )
    .all();

  res.json({ requests: rows, history });
});

// Step 1: Teacher submits correction request with motif
router.post('/grade-corrections', requireAuth, requireRoles('enseignant'), (req: AuthRequest, res) => {
  const { evaluation_id, eleve_id, nouvelle_valeur, nouveau_statut, motif } = req.body as {
    evaluation_id: number;
    eleve_id: number;
    nouvelle_valeur: number | null;
    nouveau_statut: GradeEntryStatus;
    motif: string;
  };

  if (!evaluation_id || !eleve_id || !motif?.trim()) {
    res.status(400).json({ error: 'Évaluation, élève et motif de correction sont obligatoires.' });
    return;
  }

  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluation_id) as
    | { id: number; bareme_max: number; titre: string }
    | undefined;
  if (!ev) {
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return;
  }

  if (nouveau_statut === 'note') {
    if (nouvelle_valeur === null || Number(nouvelle_valeur) < 0 || Number(nouvelle_valeur) > ev.bareme_max) {
      res.status(400).json({ error: `Nouvelle note invalide (doit être entre 0 et ${ev.bareme_max}).` });
      return;
    }
  }

  const currentGrade = db
    .prepare('SELECT valeur, statut_note FROM grades WHERE evaluation_id = ? AND eleve_id = ?')
    .get(evaluation_id, eleve_id) as { valeur: number | null; statut_note: string } | undefined;

  const info = db
    .prepare(
      `INSERT INTO grade_correction_requests (
        evaluation_id, eleve_id, enseignant_id, ancienne_valeur, ancien_statut,
        nouvelle_valeur, nouveau_statut, motif, statut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'soumise')`
    )
    .run(
      evaluation_id,
      eleve_id,
      req.authUser!.id,
      currentGrade?.valeur ?? null,
      currentGrade?.statut_note || 'en_attente',
      nouveau_statut === 'note' ? Number(nouvelle_valeur) : null,
      nouveau_statut || 'note',
      motif.trim()
    );

  notifyRoles(
    ['censeur'],
    'Demande de correction de note',
    `${req.authUser!.prenom} ${req.authUser!.nom} demande une correction pour "${ev.titre}".`,
    'corrections'
  );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Demande correction',
    entite: 'Note',
    entiteId: info.lastInsertRowid,
    description: `Demande de correction soumise (${currentGrade?.valeur ?? '—'} → ${nouvelle_valeur ?? nouveau_statut}). Motif : ${motif.trim()}`,
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

// Step 2: Censeur examines and verifies justification (NEVER modifies the grade directly!)
router.post('/grade-corrections/:id/censeur', requireAuth, requireRoles('censeur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { decision, commentaire } = req.body as { decision: 'validee_censeur' | 'refusee_censeur'; commentaire?: string };
  const row = db.prepare('SELECT * FROM grade_correction_requests WHERE id = ?').get(id) as
    | { id: number; statut: string; enseignant_id: number }
    | undefined;

  if (!row || row.statut !== 'soumise') {
    res.status(404).json({ error: 'Demande introuvable ou déjà examinée par le censeur.' });
    return;
  }
  if (decision === 'refusee_censeur' && !commentaire?.trim()) {
    res.status(400).json({ error: 'Un commentaire justificatif est requis en cas de refus.' });
    return;
  }

  db.prepare(
    `UPDATE grade_correction_requests
     SET statut = ?, censeur_id = ?, censeur_commentaire = ?, censeur_at = datetime('now')
     WHERE id = ?`
  ).run(decision, req.authUser!.id, commentaire?.trim() || null, id);

  if (decision === 'validee_censeur') {
    notifyRoles(
      ['proviseur'],
      'Correction de note vérifiée par le censeur',
      `Une demande de correction (#${id}) attend votre autorisation finale.`,
      'corrections'
    );
  } else {
    notifyUser(row.enseignant_id, 'Demande de correction refusée (Censeur)', commentaire || 'Refusée.', 'corrections');
  }

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Examen correction',
    entite: 'Correction de note',
    entiteId: id,
    description: `Avis du censeur : ${decision}.`,
  });

  res.json({ ok: true });
});

// Step 3: Proviseur gives final authorization -> updates grade & permanently preserves old value in grade_history
router.post('/grade-corrections/:id/proviseur', requireAuth, requireRoles('proviseur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { decision, commentaire } = req.body as {
    decision: 'autorisee_proviseur' | 'refusee_proviseur';
    commentaire?: string;
  };
  const row = db.prepare('SELECT * FROM grade_correction_requests WHERE id = ?').get(id) as
    | {
        id: number;
        evaluation_id: number;
        eleve_id: number;
        enseignant_id: number;
        ancienne_valeur: number | null;
        ancien_statut: string;
        nouvelle_valeur: number | null;
        nouveau_statut: string;
        motif: string;
        statut: string;
      }
    | undefined;

  if (!row || row.statut !== 'validee_censeur') {
    res.status(400).json({ error: 'La demande doit d’abord être examinée et validée par le censeur.' });
    return;
  }

  db.transaction(() => {
    const finalStatus = decision === 'autorisee_proviseur' ? 'appliquee' : 'refusee_proviseur';
    db.prepare(
      `UPDATE grade_correction_requests
       SET statut = ?, proviseur_id = ?, proviseur_commentaire = ?, proviseur_at = datetime('now')
       WHERE id = ?`
    ).run(finalStatus, req.authUser!.id, commentaire?.trim() || null, id);

    if (decision === 'autorisee_proviseur') {
      db.prepare(
        `INSERT INTO grades (evaluation_id, eleve_id, valeur, statut_note, est_provisoire, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, datetime('now'))
         ON CONFLICT(evaluation_id, eleve_id) DO UPDATE SET
           valeur = excluded.valeur,
           statut_note = excluded.statut_note,
           version = grades.version + 1,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`
      ).run(row.evaluation_id, row.eleve_id, row.nouvelle_valeur, row.nouveau_statut, req.authUser!.id);

      // Permanent immutable history preserving old value (Décision n°6)
      db.prepare(
        `INSERT INTO grade_history (evaluation_id, eleve_id, ancienne_valeur, ancien_statut, nouvelle_valeur, nouveau_statut, motif, acteur_id, autorite_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        row.evaluation_id,
        row.eleve_id,
        row.ancienne_valeur,
        row.ancien_statut,
        row.nouvelle_valeur,
        row.nouveau_statut,
        row.motif,
        row.enseignant_id,
        req.authUser!.id
      );
    }
  })();

  notifyUser(
    row.enseignant_id,
    decision === 'autorisee_proviseur' ? 'Correction de note autorisée et appliquée' : 'Correction refusée (Proviseur)',
    decision === 'autorisee_proviseur'
      ? `Votre demande #${id} a été autorisée par le proviseur. L’historique complet a été conservé.`
      : `Demande #${id} refusée par le proviseur.`,
    'corrections'
  );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Autorisation correction',
    entite: 'Correction de note',
    entiteId: id,
    description: `Décision finale du proviseur : ${decision}.`,
    ancienneValeur: { valeur: row.ancienne_valeur, statut: row.ancien_statut },
    nouvelleValeur: { valeur: row.nouvelle_valeur, statut: row.nouveau_statut },
  });

  res.json({ ok: true });
});

// ---------------- COURSE MATERIALS (Décision n°9) ----------------
router.get('/materials', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  let sql = `
    SELECT m.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
    FROM course_materials m
    JOIN classes c ON c.id = m.classe_id
    JOIN subjects s ON s.id = m.matiere_id
    JOIN users u ON u.id = m.enseignant_id
    WHERE m.statut != 'archive'
  `;
  const params: unknown[] = [];

  if (role === 'eleve') {
    const st = db.prepare('SELECT classe_id FROM students WHERE user_id = ?').get(req.authUser!.id) as
      | { classe_id: number | null }
      | undefined;
    sql += ` AND m.statut = 'publie' AND m.classe_id = ?`;
    params.push(st?.classe_id ?? -1);
  } else if (role === 'parent') {
    sql += ` AND m.statut = 'publie' AND m.classe_id IN (
      SELECT s.classe_id FROM students s
      JOIN parent_student_links psl ON psl.eleve_id = s.id
      WHERE psl.parent_user_id = ?
    )`;
    params.push(req.authUser!.id);
  }

  sql += ' ORDER BY m.updated_at DESC';
  res.json({ materials: db.prepare(sql).all(...params) });
});

router.post('/materials', requireAuth, requireRoles('enseignant', 'proviseur', 'censeur'), materialUpload.single('file'), (req: AuthRequest, res) => {
  const { classe_id, matiere_id, titre, chapitre, description, statut } = req.body as Record<string, string>;
  if (!req.file || !classe_id || !matiere_id || !titre?.trim() || !chapitre?.trim()) {
    res.status(400).json({ error: 'Classe, matière, titre, chapitre et fichier (.pdf, .doc, .docx, .ppt, .pptx) sont requis.' });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const relPath = `supports/${req.file.filename}`;

  const info = db
    .prepare(
      `INSERT INTO course_materials (enseignant_id, classe_id, matiere_id, titre, chapitre, description, fichier_nom, fichier_path, extension, taille_octets, version, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      req.authUser!.id,
      Number(classe_id),
      Number(matiere_id),
      titre.trim(),
      chapitre.trim(),
      description?.trim() || null,
      req.file.originalname,
      relPath,
      ext,
      req.file.size,
      statut === 'brouillon' ? 'brouillon' : 'publie'
    );

  db.prepare(
    `INSERT INTO course_material_versions (material_id, version, fichier_nom, fichier_path, modifie_par) VALUES (?, 1, ?, ?, ?)`
  ).run(info.lastInsertRowid, req.file.originalname, relPath, req.authUser!.id);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Support de cours',
    entiteId: info.lastInsertRowid,
    description: `Dépôt du support "${titre.trim()}" (${ext}).`,
  });

  res.status(201).json({ material: db.prepare('SELECT * FROM course_materials WHERE id = ?').get(info.lastInsertRowid) });
});

router.post(
  '/materials/:id/replace',
  requireAuth,
  requireRoles('enseignant', 'proviseur'),
  materialUpload.single('file'),
  (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const mat = db.prepare('SELECT * FROM course_materials WHERE id = ?').get(id) as
      | { id: number; enseignant_id: number; version: number; titre: string }
      | undefined;
    if (!mat) {
      res.status(404).json({ error: 'Support introuvable.' });
      return;
    }
    if (req.authUser!.role === 'enseignant' && mat.enseignant_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Vous ne pouvez remplacer que vos propres supports.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Fichier requis.' });
      return;
    }

    const nextVer = mat.version + 1;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const relPath = `supports/${req.file.filename}`;

    db.prepare(
      `UPDATE course_materials SET fichier_nom = ?, fichier_path = ?, extension = ?, taille_octets = ?, version = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(req.file.originalname, relPath, ext, req.file.size, nextVer, id);

    db.prepare(
      `INSERT INTO course_material_versions (material_id, version, fichier_nom, fichier_path, modifie_par) VALUES (?, ?, ?, ?, ?)`
    ).run(id, nextVer, req.file.originalname, relPath, req.authUser!.id);

    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Modification',
      entite: 'Support de cours',
      entiteId: id,
      description: `Nouvelle version v${nextVer} du support "${mat.titre}".`,
    });

    res.json({ material: db.prepare('SELECT * FROM course_materials WHERE id = ?').get(id) });
  }
);

router.get('/materials/:id/versions', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT v.*, u.prenom || ' ' || u.nom AS modifie_par_nom
       FROM course_material_versions v
       JOIN users u ON u.id = v.modifie_par
       WHERE v.material_id = ?
       ORDER BY v.version DESC`
    )
    .all(req.params.id);
  res.json({ versions: rows });
});

export default router;
