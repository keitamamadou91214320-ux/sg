import express from 'express';
import { logAudit, notifyRoles, notifyUser, requireAuth, requireRoles, type AuthRequest } from '../auth.ts';
import { computePeriodResultsForClass } from '../calculations.ts';
import { db } from '../db.ts';
import type { UserRole } from '../../src/types.ts';

const router = express.Router();

function getAllowedClassIdsForUser(userId: number, role: UserRole): number[] | null {
  if (role === 'eleve') {
    const st = db
      .prepare('SELECT classe_id FROM students WHERE user_id = ? AND est_archive = 0 LIMIT 1')
      .get(userId) as { classe_id: number | null } | undefined;
    return st?.classe_id ? [st.classe_id] : [];
  }
  if (role === 'parent') {
    const rows = db
      .prepare(
        `SELECT DISTINCT s.classe_id
         FROM parent_student_links psl
         JOIN students s ON s.id = psl.eleve_id
         WHERE psl.parent_user_id = ? AND s.est_archive = 0 AND s.classe_id IS NOT NULL`
      )
      .all(userId) as { classe_id: number }[];
    return rows.map((r) => r.classe_id);
  }
  return null;
}

// ---------------- OFFICIAL ANNOUNCEMENTS / NOTES DE SERVICE ----------------
router.get('/announcements', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const today = new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT a.*, u.prenom || ' ' || u.nom AS auteur_nom, u.role AS auteur_role
       FROM announcements a
       JOIN users u ON u.id = a.auteur_id
       WHERE (a.expire_le IS NULL OR a.expire_le = '' OR a.expire_le >= ?)
       ORDER BY a.epingle DESC, a.created_at DESC, a.id DESC`
    )
    .all(today) as Array<{
    id: number;
    titre: string;
    contenu: string;
    priorite: string;
    cible_role: string;
    auteur_id: number;
    auteur_nom: string;
    auteur_role: UserRole;
    epingle: number;
    expire_le: string | null;
    created_at: string;
  }>;

  const isStaff = !['eleve', 'parent'].includes(role);
  const filtered = rows.filter((r) => {
    if (r.auteur_id === req.authUser!.id || role === 'fondateur' || role === 'proviseur') return true;
    if (r.cible_role === 'tous') return true;
    if (r.cible_role === 'personnel') return isStaff;
    if (r.cible_role === 'enseignants') return role === 'enseignant' || role === 'censeur';
    if (r.cible_role === 'eleves_parents') return role === 'eleve' || role === 'parent';
    return false;
  });

  res.json({ announcements: filtered });
});

router.post(
  '/announcements',
  requireAuth,
  requireRoles('fondateur', 'proviseur', 'censeur', 'secretaire'),
  (req: AuthRequest, res) => {
    const { titre, contenu, priorite, cible_role, epingle, expire_le } = req.body as Record<string, unknown>;
    const cleanTitre = String(titre || '').trim();
    const cleanContenu = String(contenu || '').trim();
    if (!cleanTitre || !cleanContenu) {
      res.status(400).json({ error: 'Titre et contenu de la note de service sont obligatoires.' });
      return;
    }

    const validPriorite = ['normale', 'importante', 'urgente'].includes(String(priorite))
      ? String(priorite)
      : 'normale';
    const validCible = ['tous', 'personnel', 'enseignants', 'eleves_parents'].includes(String(cible_role))
      ? String(cible_role)
      : 'tous';
    const isPinned = epingle ? 1 : 0;
    const expireStr = expire_le ? String(expire_le).trim() : null;

    const info = db
      .prepare(
        `INSERT INTO announcements (titre, contenu, priorite, cible_role, auteur_id, epingle, expire_le)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(cleanTitre, cleanContenu, validPriorite, validCible, req.authUser!.id, isPinned, expireStr || null);

    // Notify targeted roles
    const staffRoles: UserRole[] = [
      'proviseur',
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
    let targets: UserRole[] = [];
    if (validCible === 'tous') targets = [...staffRoles, 'eleve', 'parent'];
    else if (validCible === 'personnel') targets = staffRoles;
    else if (validCible === 'enseignants') targets = ['enseignant', 'censeur'];
    else if (validCible === 'eleves_parents') targets = ['eleve', 'parent'];

    if (targets.length > 0) {
      notifyRoles(targets, `Annonce : ${cleanTitre}`, cleanContenu.slice(0, 120), 'communications');
    }

    logAudit({
      userId: req.authUser!.id,
      userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
      userRole: req.authUser!.role,
      evenement: 'Publication',
      entite: 'Annonce',
      entiteId: info.lastInsertRowid,
      description: `Publication de l’annonce "${cleanTitre}" (cible: ${validCible}, priorité: ${validPriorite}).`,
    });

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }
);

router.delete('/announcements/:id', requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, titre, auteur_id FROM announcements WHERE id = ?').get(id) as
    | { id: number; titre: string; auteur_id: number }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Annonce introuvable.' });
    return;
  }
  const canDelete =
    row.auteur_id === req.authUser!.id || ['fondateur', 'proviseur'].includes(req.authUser!.role);
  if (!canDelete) {
    res.status(403).json({ error: 'Permission insuffisante pour supprimer cette annonce.' });
    return;
  }
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- TIMETABLE / EMPLOI DU TEMPS ----------------
router.get('/timetable', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const classeFilter = req.query.classe_id ? Number(req.query.classe_id) : null;
  const allowedClasses = getAllowedClassIdsForUser(req.authUser!.id, role);

  let sql = `
    SELECT ts.*, c.nom AS classe_nom, s.nom AS matiere_nom, s.code AS matiere_code,
           u.prenom || ' ' || u.nom AS enseignant_nom
    FROM timetable_slots ts
    JOIN classes c ON c.id = ts.classe_id
    JOIN subjects s ON s.id = ts.matiere_id
    JOIN users u ON u.id = ts.enseignant_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (allowedClasses !== null) {
    if (allowedClasses.length === 0) {
      res.json({ slots: [] });
      return;
    }
    const placeholders = allowedClasses.map(() => '?').join(',');
    sql += ` AND ts.classe_id IN (${placeholders})`;
    params.push(...allowedClasses);
  }

  if (classeFilter) {
    sql += ' AND ts.classe_id = ?';
    params.push(classeFilter);
  }

  sql += ' ORDER BY ts.jour_semaine ASC, ts.heure_debut ASC';
  const slots = db.prepare(sql).all(...params);
  res.json({ slots });
});

router.post('/timetable', requireAuth, requireRoles('proviseur', 'censeur'), (req: AuthRequest, res) => {
  const { annee_id, classe_id, matiere_id, enseignant_id, jour_semaine, heure_debut, heure_fin, salle } =
    req.body as Record<string, unknown>;

  const cid = Number(classe_id);
  const mid = Number(matiere_id);
  const eid = Number(enseignant_id);
  const day = Number(jour_semaine);
  const start = String(heure_debut || '').trim();
  const end = String(heure_fin || '').trim();

  if (!cid || !mid || !eid || day < 1 || day > 6 || !start || !end) {
    res.status(400).json({ error: 'Classe, matière, enseignant, jour (Lun-Sam) et horaires requis.' });
    return;
  }
  if (end <= start) {
    res.status(400).json({ error: 'L’heure de fin doit être postérieure à l’heure de début.' });
    return;
  }

  const cls = db.prepare('SELECT id, annee_id, nom FROM classes WHERE id = ?').get(cid) as
    | { id: number; annee_id: number; nom: string }
    | undefined;
  if (!cls) {
    res.status(404).json({ error: 'Classe introuvable.' });
    return;
  }

  const yearId = annee_id ? Number(annee_id) : cls.annee_id;

  // Check teacher or class time-slot overlap
  const classConflict = db
    .prepare(
      `SELECT id FROM timetable_slots
       WHERE classe_id = ? AND jour_semaine = ? AND NOT (heure_fin <= ? OR heure_debut >= ?)`
    )
    .get(cid, day, start, end);
  if (classConflict) {
    res.status(409).json({ error: 'Conflit horaire : cette classe a déjà un cours programmé sur ce créneau.' });
    return;
  }

  const teacherConflict = db
    .prepare(
      `SELECT id FROM timetable_slots
       WHERE enseignant_id = ? AND jour_semaine = ? AND NOT (heure_fin <= ? OR heure_debut >= ?)`
    )
    .get(eid, day, start, end);
  if (teacherConflict) {
    res.status(409).json({ error: 'Conflit horaire : cet enseignant intervient déjà dans une autre classe à cette heure.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO timetable_slots (annee_id, classe_id, matiere_id, enseignant_id, jour_semaine, heure_debut, heure_fin, salle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(yearId, cid, mid, eid, day, start, end, salle ? String(salle).trim() : null);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Emploi du temps',
    entiteId: info.lastInsertRowid,
    description: `Ajout créneau ${cls.nom} · jour ${day} (${start}–${end}).`,
  });

  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.delete('/timetable/:id', requireAuth, requireRoles('proviseur', 'censeur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM timetable_slots WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Créneau introuvable.' });
    return;
  }
  db.prepare('DELETE FROM timetable_slots WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- HOMEWORK / CAHIER DE TEXTES ----------------
router.get('/homework', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const classeFilter = req.query.classe_id ? Number(req.query.classe_id) : null;
  const allowedClasses = getAllowedClassIdsForUser(req.authUser!.id, role);

  let sql = `
    SELECT h.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
    FROM homework_assignments h
    JOIN classes c ON c.id = h.classe_id
    JOIN subjects s ON s.id = h.matiere_id
    JOIN users u ON u.id = h.enseignant_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (allowedClasses !== null) {
    if (allowedClasses.length === 0) {
      res.json({ homework: [] });
      return;
    }
    const placeholders = allowedClasses.map(() => '?').join(',');
    sql += ` AND h.classe_id IN (${placeholders})`;
    params.push(...allowedClasses);
  }
  if (classeFilter) {
    sql += ' AND h.classe_id = ?';
    params.push(classeFilter);
  }

  sql += ' ORDER BY h.date_limite ASC, h.id DESC';
  const homework = db.prepare(sql).all(...params);
  res.json({ homework });
});

router.post('/homework', requireAuth, requireRoles('enseignant', 'proviseur', 'censeur'), (req: AuthRequest, res) => {
  const { classe_id, matiere_id, titre, consignes, date_limite, bareme } = req.body as Record<string, unknown>;
  const cid = Number(classe_id);
  const mid = Number(matiere_id);
  const cleanTitre = String(titre || '').trim();
  const cleanConsignes = String(consignes || '').trim();
  const due = String(date_limite || '').trim();

  if (!cid || !mid || !cleanTitre || !cleanConsignes || !due) {
    res.status(400).json({ error: 'Classe, matière, titre, consignes et date limite sont requis.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO homework_assignments (classe_id, matiere_id, enseignant_id, titre, consignes, date_limite, bareme)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cid, mid, req.authUser!.id, cleanTitre, cleanConsignes, due, bareme ? Number(bareme) : null);

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Devoir / Cahier de texte',
    entiteId: info.lastInsertRowid,
    description: `Publication du devoir "${cleanTitre}" (échéance ${due}).`,
  });

  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.delete('/homework/:id', requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, enseignant_id FROM homework_assignments WHERE id = ?').get(id) as
    | { id: number; enseignant_id: number }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Devoir introuvable.' });
    return;
  }
  const canDelete = row.enseignant_id === req.authUser!.id || ['proviseur', 'censeur'].includes(req.authUser!.role);
  if (!canDelete) {
    res.status(403).json({ error: 'Permission insuffisante.' });
    return;
  }
  db.prepare('DELETE FROM homework_assignments WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- INTERNAL MESSAGING ----------------
router.get('/messages/recipients', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, nom, prenom, role
       FROM users
       WHERE statut = 'actif' AND id != ?
       ORDER BY role, nom, prenom`
    )
    .all(req.authUser!.id);
  res.json({ recipients: rows });
});

router.get('/messages', requireAuth, (req: AuthRequest, res) => {
  const uid = req.authUser!.id;
  const inbox = db
    .prepare(
      `SELECT m.*, us.prenom || ' ' || us.nom AS sender_nom, us.role AS sender_role,
              ur.prenom || ' ' || ur.nom AS recipient_nom, ur.role AS recipient_role
       FROM internal_messages m
       JOIN users us ON us.id = m.sender_id
       JOIN users ur ON ur.id = m.recipient_id
       WHERE m.recipient_id = ?
       ORDER BY m.id DESC LIMIT 100`
    )
    .all(uid);

  const sent = db
    .prepare(
      `SELECT m.*, us.prenom || ' ' || us.nom AS sender_nom, us.role AS sender_role,
              ur.prenom || ' ' || ur.nom AS recipient_nom, ur.role AS recipient_role
       FROM internal_messages m
       JOIN users us ON us.id = m.sender_id
       JOIN users ur ON ur.id = m.recipient_id
       WHERE m.sender_id = ?
       ORDER BY m.id DESC LIMIT 100`
    )
    .all(uid);

  res.json({ inbox, sent });
});

router.post('/messages', requireAuth, (req: AuthRequest, res) => {
  const { recipient_id, sujet, contenu } = req.body as {
    recipient_id?: number;
    sujet?: string;
    contenu?: string;
  };
  const rid = Number(recipient_id);
  if (!rid || !sujet?.trim() || !contenu?.trim()) {
    res.status(400).json({ error: 'Destinataire, sujet et message requis.' });
    return;
  }
  if (rid === req.authUser!.id) {
    res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message à vous-même.' });
    return;
  }

  const recipient = db.prepare(`SELECT id FROM users WHERE id = ? AND statut = 'actif'`).get(rid);
  if (!recipient) {
    res.status(404).json({ error: 'Destinataire actif introuvable.' });
    return;
  }

  const info = db
    .prepare(`INSERT INTO internal_messages (sender_id, recipient_id, sujet, contenu) VALUES (?, ?, ?, ?)`)
    .run(req.authUser!.id, rid, sujet.trim(), contenu.trim());

  notifyUser(
    rid,
    `Nouveau message de ${req.authUser!.prenom} ${req.authUser!.nom}`,
    sujet.trim(),
    'communications'
  );

  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.post('/messages/:id/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE internal_messages SET est_lu = 1 WHERE id = ? AND recipient_id = ?').run(
    Number(req.params.id),
    req.authUser!.id
  );
  res.json({ ok: true });
});

// ---------------- CLASS ANALYTICS & TABLEAU D'HONNEUR ----------------
router.get(
  '/analytics/class-summary',
  requireAuth,
  requireRoles('fondateur', 'proviseur', 'censeur', 'secretaire', 'enseignant'),
  (req, res) => {
    const classeId = Number(req.query.classe_id);
    const periodeId = Number(req.query.periode_id);
    if (!classeId || !periodeId) {
      res.status(400).json({ error: 'classe_id et periode_id requis.' });
      return;
    }

    const settings = db.prepare('SELECT * FROM school_settings WHERE id = 1').get() as {
      seuil_reussite: number;
      mention_tres_bien: number;
      mention_bien: number;
    };
    const seuil = settings?.seuil_reussite ?? 10;
    const honorThreshold = settings?.mention_bien ?? 14;

    const computed = computePeriodResultsForClass(classeId, periodeId);
    const classStudents = db
      .prepare('SELECT id, matricule, nom, prenom FROM students WHERE classe_id = ?')
      .all(classeId) as { id: number; matricule: string; nom: string; prenom: string }[];
    const studentMap = new Map(classStudents.map((st) => [st.id, st]));

    const ranked = computed.students.filter((s) => s.moyenne_generale !== null);
    const passedCount = ranked.filter((s) => (s.moyenne_generale ?? 0) >= seuil).length;
    const honorRoll = ranked
      .filter((s) => (s.moyenne_generale ?? 0) >= honorThreshold)
      .map((s) => {
        const info = studentMap.get(s.eleve_id);
        return {
          eleve_id: s.eleve_id,
          matricule: info?.matricule || '',
          nom: info?.nom || '',
          prenom: info?.prenom || '',
          moyenne_generale: s.moyenne_generale,
          rang: s.rang,
        };
      });

    res.json({
      effectif_classe: computed.effectif_classe,
      effectif_evalue: ranked.length,
      moyenne_classe: computed.moyenne_classe,
      meilleure_moyenne: computed.meilleure_moyenne,
      plus_faible_moyenne: computed.plus_faible_moyenne,
      taux_reussite: ranked.length > 0 ? Math.round((passedCount / ranked.length) * 100) : null,
      seuil_reussite: seuil,
      honorRoll,
    });
  }
);

export default router;
