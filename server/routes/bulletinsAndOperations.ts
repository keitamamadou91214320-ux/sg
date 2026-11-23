import crypto from 'crypto';
import express from 'express';
import { logAudit, notifyRoles, notifyUser, requireAuth, requireRoles, type AuthRequest } from '../auth.ts';
import { autoAppreciation, computePeriodResultsForClass } from '../calculations.ts';
import { db } from '../db.ts';

const router = express.Router();

// ---------------- BULLETINS WORKFLOW (Décisions n°4, n°5, n°10 & PDF §3) ----------------
router.get('/bulletins', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const classeId = req.query.classe_id ? Number(req.query.classe_id) : null;
  const periodeId = req.query.periode_id ? Number(req.query.periode_id) : null;

  let sql = `
    SELECT b.*,
           s.nom AS eleve_nom, s.prenom AS eleve_prenom, s.matricule AS eleve_matricule, s.photo_path AS eleve_photo,
           s.date_naissance AS eleve_date_naissance, s.lieu_naissance AS eleve_lieu_naissance, s.sexe AS eleve_sexe,
           (SELECT COUNT(*) FROM attendance a WHERE a.eleve_id = b.eleve_id AND a.type = 'retard' AND a.date_evenement >= p.date_debut AND a.date_evenement <= p.date_fin) AS retards_count,
           (SELECT COUNT(*) FROM attendance a WHERE a.eleve_id = b.eleve_id AND a.type = 'absence' AND a.date_evenement >= p.date_debut AND a.date_evenement <= p.date_fin) AS absences_count,
           c.nom AS classe_nom, y.libelle AS annee_libelle, p.nom AS periode_nom,
           up.prenom || ' ' || up.nom AS prepare_nom,
           upr.prenom || ' ' || upr.nom AS proviseur_nom,
           uc.prenom || ' ' || uc.nom AS censeur_nom
    FROM bulletins b
    JOIN students s ON s.id = b.eleve_id
    JOIN classes c ON c.id = b.classe_id
    JOIN academic_years y ON y.id = b.annee_id
    JOIN school_periods p ON p.id = b.periode_id
    JOIN users up ON up.id = b.prepare_par
    LEFT JOIN users upr ON upr.id = b.signe_par_proviseur
    LEFT JOIN users uc ON uc.id = b.verifie_par_censeur
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (role === 'eleve') {
    sql += ` AND s.user_id = ? AND b.statut = 'distribue'`;
    params.push(req.authUser!.id);
  } else if (role === 'parent') {
    sql += ` AND s.id IN (SELECT eleve_id FROM parent_student_links WHERE parent_user_id = ?) AND b.statut = 'distribue'`;
    params.push(req.authUser!.id);
  } else if (role === 'enseignant') {
    sql += ` AND b.statut = 'distribue'`;
  }

  if (classeId) {
    sql += ' AND b.classe_id = ?';
    params.push(classeId);
  }
  if (periodeId) {
    sql += ' AND b.periode_id = ?';
    params.push(periodeId);
  }

  sql += ' ORDER BY c.nom, b.rang, s.nom';
  const bulletins = db.prepare(sql).all(...params);
  res.json({ bulletins });
});

router.get('/bulletins/:id/versions', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT bv.*, u.prenom || ' ' || u.nom AS acteur_nom
       FROM bulletin_versions bv
       JOIN users u ON u.id = bv.acteur_id
       WHERE bv.bulletin_id = ?
       ORDER BY bv.version DESC`
    )
    .all(req.params.id);
  res.json({ versions: rows });
});

// Secretariat prepares/recalculates bulletins for a class & period
router.post('/bulletins/prepare', requireAuth, requireRoles('secretaire'), (req: AuthRequest, res) => {
  const { classe_id, periode_id } = req.body as { classe_id: number; periode_id: number };
  if (!classe_id || !periode_id) {
    res.status(400).json({ error: 'Classe et période scolaire requises.' });
    return;
  }

  const period = db.prepare('SELECT * FROM school_periods WHERE id = ?').get(periode_id) as
    | { id: number; annee_id: number; nom: string }
    | undefined;
  if (!period) {
    res.status(404).json({ error: 'Période introuvable.' });
    return;
  }

  const computed = computePeriodResultsForClass(classe_id, periode_id);
  if (computed.students.length === 0) {
    res.status(400).json({ error: 'Aucun élève inscrit dans cette classe.' });
    return;
  }

  let preparedCount = 0;

  db.transaction(() => {
    for (const st of computed.students) {
      const existing = db
        .prepare('SELECT * FROM bulletins WHERE eleve_id = ? AND periode_id = ?')
        .get(st.eleve_id, periode_id) as
        | { id: number; version: number; statut: string; signe_par_proviseur: number | null }
        | undefined;

      const lignesJson = JSON.stringify(st.lignes);
      const genAppreciation = autoAppreciation(st.moyenne_generale);

      if (!existing) {
        const info = db
          .prepare(
            `INSERT INTO bulletins (
              eleve_id, classe_id, annee_id, periode_id, version, statut,
              moyenne_generale, moyenne_classe, meilleure_moyenne, plus_faible_moyenne,
              rang, effectif_classe, appreciation_generale, lignes_json, prepare_par
            ) VALUES (?, ?, ?, ?, 1, 'brouillon', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            st.eleve_id,
            classe_id,
            period.annee_id,
            periode_id,
            st.moyenne_generale,
            computed.moyenne_classe,
            computed.meilleure_moyenne,
            computed.plus_faible_moyenne,
            st.rang,
            computed.effectif_classe,
            genAppreciation,
            lignesJson,
            req.authUser!.id
          );

        db.prepare(
          `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
           VALUES (?, 1, 'brouillon', ?, ?, 'Préparation initiale par le secrétariat')`
        ).run(info.lastInsertRowid, lignesJson, req.authUser!.id);
        preparedCount++;
      } else if (['brouillon', 'retourne_proviseur', 'retourne_censeur'].includes(existing.statut)) {
        // If it had been signed before and returned, create a new version and clear signature for re-signing (PDF §3)
        const needsNewVersion = Boolean(existing.signe_par_proviseur) || existing.statut.startsWith('retourne');
        const nextVersion = needsNewVersion ? existing.version + 1 : existing.version;

        db.prepare(
          `UPDATE bulletins SET
            version = ?,
            statut = 'brouillon',
            moyenne_generale = ?,
            moyenne_classe = ?,
            meilleure_moyenne = ?,
            plus_faible_moyenne = ?,
            rang = ?,
            effectif_classe = ?,
            appreciation_generale = COALESCE(appreciation_generale, ?),
            lignes_json = ?,
            prepare_par = ?,
            signe_par_proviseur = NULL,
            signature_proviseur_hash = NULL,
            cachet_appose = 0,
            signe_at = NULL,
            verifie_par_censeur = NULL,
            verifie_at = NULL,
            motif_retour = NULL,
            updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          nextVersion,
          st.moyenne_generale,
          computed.moyenne_classe,
          computed.meilleure_moyenne,
          computed.plus_faible_moyenne,
          st.rang,
          computed.effectif_classe,
          genAppreciation,
          lignesJson,
          req.authUser!.id,
          existing.id
        );

        db.prepare(
          `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
           VALUES (?, ?, 'brouillon', ?, ?, ?)`
        ).run(
          existing.id,
          nextVersion,
          lignesJson,
          req.authUser!.id,
          needsNewVersion ? 'Correction après retour (nouvelle version)' : 'Actualisation avant signature'
        );
        preparedCount++;
      }
    }
  })();

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Bulletin',
    entite: 'Préparation bulletins',
    description: `Préparation / mise à jour de ${preparedCount} bulletin(s) pour la classe #${classe_id}, période "${period.nom}".`,
  });

  res.json({ preparedCount });
});

// Secretariat updates appreciation BEFORE signature
router.patch('/bulletins/:id', requireAuth, requireRoles('secretaire'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const b = db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) as
    | { id: number; statut: string; version: number; lignes_json: string }
    | undefined;
  if (!b) {
    res.status(404).json({ error: 'Bulletin introuvable.' });
    return;
  }
  if (!['brouillon', 'retourne_proviseur', 'retourne_censeur'].includes(b.statut)) {
    res.status(403).json({
      error: 'Un bulletin signé ou en cours de validation ne peut jamais être modifié directement (PDF §3).',
    });
    return;
  }

  const { appreciation_generale, lignes } = req.body as { appreciation_generale?: string; lignes?: unknown[] };
  const nextLignes = Array.isArray(lignes) ? JSON.stringify(lignes) : b.lignes_json;

  db.prepare(
    `UPDATE bulletins SET appreciation_generale = COALESCE(?, appreciation_generale), lignes_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(appreciation_generale?.trim() ?? null, nextLignes, id);

  res.json({ bulletin: db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) });
});

// Step 1 -> Transmit to Proviseur (Secrétariat → Proviseur)
router.post('/bulletins/:id/transmit-proviseur', requireAuth, requireRoles('secretaire'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const b = db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) as { id: number; statut: string; version: number } | undefined;
  if (!b || !['brouillon', 'retourne_proviseur', 'retourne_censeur'].includes(b.statut)) {
    res.status(400).json({ error: 'Ce bulletin n’est pas dans un état transmissible au proviseur.' });
    return;
  }

  db.prepare(`UPDATE bulletins SET statut = 'transmis_proviseur', updated_at = datetime('now') WHERE id = ?`).run(id);
  notifyRoles(['proviseur'], 'Bulletin à examiner et signer', `Le bulletin #${id} (v${b.version}) a été transmis par le secrétariat.`, 'bulletins');

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Bulletin',
    entite: 'Bulletin',
    entiteId: id,
    description: `Transmission du bulletin #${id} (v${b.version}) au proviseur pour signature et cachet.`,
  });

  res.json({ ok: true });
});

// Step 2 -> Proviseur signs digitally & applies stamp OR returns to Secretariat (Proviseur → Censeur)
router.post('/bulletins/:id/proviseur-decision', requireAuth, requireRoles('proviseur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { decision, motif_retour } = req.body as { decision: 'signer' | 'retourner'; motif_retour?: string };
  const b = db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) as
    | { id: number; statut: string; version: number; eleve_id: number; prepare_par: number; lignes_json: string }
    | undefined;

  if (!b || b.statut !== 'transmis_proviseur') {
    res.status(400).json({ error: 'Ce bulletin n’est pas en attente de signature du proviseur.' });
    return;
  }

  if (decision === 'retourner') {
    if (!motif_retour?.trim()) {
      res.status(400).json({ error: 'Un motif de retour est obligatoire.' });
      return;
    }
    db.prepare(
      `UPDATE bulletins SET statut = 'retourne_proviseur', motif_retour = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(motif_retour.trim(), id);
    db.prepare(
      `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
       VALUES (?, ?, 'retourne_proviseur', ?, ?, ?)`
    ).run(id, b.version, b.lignes_json, req.authUser!.id, motif_retour.trim());

    notifyUser(b.prepare_par, 'Bulletin retourné par le proviseur', `Bulletin #${id} retourné : ${motif_retour}`, 'bulletins');
  } else {
    const sigHash = crypto
      .createHash('sha256')
      .update(`${id}:${b.version}:${req.authUser!.id}:${Date.now()}`)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();

    db.prepare(
      `UPDATE bulletins
       SET statut = 'signe_proviseur', signe_par_proviseur = ?, signature_proviseur_hash = ?, cachet_appose = 1, signe_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(req.authUser!.id, sigHash, id);

    db.prepare(
      `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
       VALUES (?, ?, 'signe_proviseur', ?, ?, ?)`
    ).run(id, b.version, b.lignes_json, req.authUser!.id, `Signature numérique (${sigHash}) et cachet officiel apposé.`);

    notifyRoles(['censeur'], 'Bulletin signé à vérifier', `Le bulletin #${id} (v${b.version}) signé par le proviseur attend votre vérification.`, 'bulletins');
  }

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Bulletin',
    entite: 'Bulletin',
    entiteId: id,
    description:
      decision === 'signer'
        ? `Signature numérique et apposition du cachet officiel sur le bulletin #${id} (v${b.version}).`
        : `Retour au secrétariat par le proviseur : ${motif_retour}`,
  });

  res.json({ ok: true });
});

// Step 3 -> Censeur verifies & authorizes distribution OR returns to Secretariat (Censeur → Élève)
router.post('/bulletins/:id/censeur-decision', requireAuth, requireRoles('censeur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { decision, motif_retour } = req.body as { decision: 'distribuer' | 'retourner'; motif_retour?: string };
  const b = db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) as
    | { id: number; statut: string; version: number; eleve_id: number; prepare_par: number; lignes_json: string }
    | undefined;

  if (!b || b.statut !== 'signe_proviseur') {
    res.status(400).json({ error: 'Le bulletin doit d’abord être signé et tamponné par le proviseur.' });
    return;
  }

  if (decision === 'retourner') {
    if (!motif_retour?.trim()) {
      res.status(400).json({ error: 'Un motif de retour est obligatoire.' });
      return;
    }
    db.prepare(
      `UPDATE bulletins SET statut = 'retourne_censeur', motif_retour = ?, verifie_par_censeur = ?, verifie_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(motif_retour.trim(), req.authUser!.id, id);

    db.prepare(
      `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
       VALUES (?, ?, 'retourne_censeur', ?, ?, ?)`
    ).run(id, b.version, b.lignes_json, req.authUser!.id, motif_retour.trim());

    notifyUser(
      b.prepare_par,
      'Bulletin retourné par le censeur',
      `Bulletin #${id} retourné pour correction (nouvelle version et nouvelle signature requises) : ${motif_retour}`,
      'bulletins'
    );
  } else {
    db.prepare(
      `UPDATE bulletins SET statut = 'distribue', verifie_par_censeur = ?, verifie_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(req.authUser!.id, id);

    db.prepare(
      `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
       VALUES (?, ?, 'distribue', ?, ?, 'Vérification censeur validée — Distribution autorisée')`
    ).run(id, b.version, b.lignes_json, req.authUser!.id);

    // Notify student & linked parents
    const st = db.prepare('SELECT user_id FROM students WHERE id = ?').get(b.eleve_id) as { user_id: number | null } | undefined;
    if (st?.user_id) {
      notifyUser(st.user_id, 'Bulletin officiel disponible', 'Votre bulletin officiel a été validé et publié.', 'bulletins');
    }
    const parents = db
      .prepare('SELECT parent_user_id FROM parent_student_links WHERE eleve_id = ?')
      .all(b.eleve_id) as { parent_user_id: number }[];
    for (const p of parents) {
      notifyUser(p.parent_user_id, 'Bulletin officiel disponible', 'Le bulletin officiel de votre enfant est disponible.', 'bulletins');
    }
  }

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Bulletin',
    entite: 'Bulletin',
    entiteId: id,
    description:
      decision === 'distribuer'
        ? `Vérification censeur validée et distribution officielle autorisée (#${id}, v${b.version}).`
        : `Retour au secrétariat par le censeur après signature : ${motif_retour}`,
  });

  res.json({ ok: true });
});

// ---------------- RESULT CLAIMS / RE-EXAMINATIONS (Décision n°13) ----------------
router.get('/claims', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  let sql = `
    SELECT rc.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule,
           p.nom AS periode_nom, sub.nom AS matiere_nom,
           u.prenom || ' ' || u.nom AS auteur_nom
    FROM result_claims rc
    JOIN students s ON s.id = rc.eleve_id
    JOIN school_periods p ON p.id = rc.periode_id
    LEFT JOIN subjects sub ON sub.id = rc.matiere_id
    JOIN users u ON u.id = rc.auteur_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (role === 'eleve' || role === 'parent') {
    sql += ' AND rc.auteur_id = ?';
    params.push(req.authUser!.id);
  }
  sql += ' ORDER BY rc.id DESC';
  res.json({ claims: db.prepare(sql).all(...params) });
});

router.post('/claims', requireAuth, requireRoles('eleve', 'parent'), (req: AuthRequest, res) => {
  const { eleve_id, bulletin_id, periode_id, matiere_id, objet, description } = req.body as Record<string, unknown>;
  if (!eleve_id || !periode_id || !String(objet || '').trim() || !String(description || '').trim()) {
    res.status(400).json({ error: 'Élève, période, objet et description sont obligatoires.' });
    return;
  }

  // Verify student belongs to this student/parent
  if (req.authUser!.role === 'eleve') {
    const st = db.prepare('SELECT id FROM students WHERE id = ? AND user_id = ?').get(Number(eleve_id), req.authUser!.id);
    if (!st) {
      res.status(403).json({ error: 'Accès non autorisé à ce dossier élève.' });
      return;
    }
  } else {
    const link = db
      .prepare('SELECT id FROM parent_student_links WHERE parent_user_id = ? AND eleve_id = ?')
      .get(req.authUser!.id, Number(eleve_id));
    if (!link) {
      res.status(403).json({ error: 'Cet élève n’est pas rattaché à votre compte parent.' });
      return;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO result_claims (eleve_id, bulletin_id, periode_id, matiere_id, auteur_id, objet, description, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'recue_secretariat')`
    )
    .run(
      Number(eleve_id),
      bulletin_id ? Number(bulletin_id) : null,
      Number(periode_id),
      matiere_id ? Number(matiere_id) : null,
      req.authUser!.id,
      String(objet).trim(),
      String(description).trim()
    );

  notifyRoles(['secretaire'], 'Nouvelle réclamation de résultats', `Réclamation déposée : ${String(objet).trim()}`, 'reclamations');

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Réclamation résultat',
    entiteId: info.lastInsertRowid,
    description: `Dépôt d’une demande de réexamen : ${String(objet).trim()}.`,
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/claims/:id/process', requireAuth, requireRoles('secretaire', 'censeur', 'proviseur'), (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { statut, commentaire } = req.body as { statut: string; commentaire?: string };
  const claim = db.prepare('SELECT * FROM result_claims WHERE id = ?').get(id) as
    | { id: number; auteur_id: number; statut: string }
    | undefined;
  if (!claim) {
    res.status(404).json({ error: 'Réclamation introuvable.' });
    return;
  }

  const role = req.authUser!.role;
  if (role === 'secretaire') {
    db.prepare(`UPDATE result_claims SET statut = 'transmise_censeur', note_secretariat = ?, updated_at = datetime('now') WHERE id = ?`).run(
      commentaire?.trim() || 'Transmise au censeur pour examen.',
      id
    );
    notifyRoles(['censeur'], 'Réclamation transmise par le secrétariat', `Réclamation #${id} à examiner.`, 'reclamations');
  } else if (role === 'censeur') {
    const nextSt = ['soumise_proviseur', 'acceptee', 'rejetee'].includes(statut) ? statut : 'soumise_proviseur';
    db.prepare(`UPDATE result_claims SET statut = ?, avis_censeur = ?, updated_at = datetime('now') WHERE id = ?`).run(
      nextSt,
      commentaire?.trim() || null,
      id
    );
    if (nextSt === 'soumise_proviseur') {
      notifyRoles(['proviseur'], 'Réclamation soumise au proviseur', `Le censeur soumet la réclamation #${id} pour décision finale.`, 'reclamations');
    }
  } else if (role === 'proviseur') {
    const nextSt = statut === 'acceptee' ? 'acceptee' : 'rejetee';
    db.prepare(`UPDATE result_claims SET statut = ?, decision_proviseur = ?, updated_at = datetime('now') WHERE id = ?`).run(
      nextSt,
      commentaire?.trim() || null,
      id
    );
  }

  notifyUser(claim.auteur_id, 'Mise à jour de votre réclamation', `Statut de votre demande #${id} mis à jour.`, 'reclamations');
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Modification',
    entite: 'Réclamation résultat',
    entiteId: id,
    description: `Traitement réclamation #${id} (${role}) → ${statut}.`,
  });

  res.json({ ok: true });
});

// ---------------- SURVEILLANCE: ATTENDANCE & DISCIPLINE (Décision n°16) ----------------
router.get('/surveillance', requireAuth, requireRoles('surveillant', 'censeur', 'proviseur', 'fondateur'), (_req, res) => {
  const attendance = db
    .prepare(
      `SELECT a.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule, c.nom AS classe_nom
       FROM attendance a
       JOIN students s ON s.id = a.eleve_id
       LEFT JOIN classes c ON c.id = s.classe_id
       ORDER BY a.date_evenement DESC, a.id DESC`
    )
    .all();

  const incidents = db
    .prepare(
      `SELECT d.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule, c.nom AS classe_nom,
              u.prenom || ' ' || u.nom AS signale_nom
       FROM discipline_incidents d
       JOIN students s ON s.id = d.eleve_id
       LEFT JOIN classes c ON c.id = s.classe_id
       JOIN users u ON u.id = d.signale_par
       ORDER BY d.date_incident DESC, d.id DESC`
    )
    .all();

  res.json({ attendance, incidents });
});

router.post('/surveillance/attendance', requireAuth, requireRoles('surveillant', 'proviseur'), (req: AuthRequest, res) => {
  const { eleve_id, date_evenement, type, duree_minutes, est_justifie, justificatif } = req.body as Record<string, unknown>;
  if (!eleve_id || !date_evenement || !['absence', 'retard'].includes(String(type))) {
    res.status(400).json({ error: 'Élève, date et type (absence/retard) requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO attendance (eleve_id, date_evenement, type, duree_minutes, est_justifie, justificatif, signale_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(eleve_id),
      String(date_evenement),
      String(type),
      duree_minutes ? Number(duree_minutes) : null,
      est_justifie ? 1 : 0,
      justificatif ? String(justificatif).trim() : null,
      req.authUser!.id
    );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/surveillance/attendance/:id/justify', requireAuth, requireRoles('surveillant', 'censeur', 'proviseur'), (req, res) => {
  const { est_justifie, justificatif } = req.body as { est_justifie: boolean; justificatif: string };
  db.prepare('UPDATE attendance SET est_justifie = ?, justificatif = ? WHERE id = ?').run(
    est_justifie ? 1 : 0,
    justificatif?.trim() || null,
    req.params.id
  );
  res.json({ ok: true });
});

router.post('/surveillance/incidents', requireAuth, requireRoles('surveillant', 'censeur', 'proviseur'), (req: AuthRequest, res) => {
  const { eleve_id, date_incident, gravite, description, sanction } = req.body as Record<string, unknown>;
  if (!eleve_id || !date_incident || !String(description || '').trim()) {
    res.status(400).json({ error: 'Élève, date et description sont requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO discipline_incidents (eleve_id, date_incident, gravite, description, sanction, transmis_censeur, signale_par)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      Number(eleve_id),
      String(date_incident),
      String(gravite || 'mineure'),
      String(description).trim(),
      sanction ? String(sanction).trim() : null,
      req.authUser!.id
    );

  notifyRoles(['censeur'], 'Nouvel incident disciplinaire signalé', String(description).trim(), 'surveillance');
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------------- FINANCE & ACCOUNTING (Décision n°11) ----------------
router.get('/finance', requireAuth, (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const isStaffFinance = ['comptable', 'proviseur', 'fondateur'].includes(role);
  if (!isStaffFinance && !['eleve', 'parent'].includes(role)) {
    res.status(403).json({ error: 'Accès financier strictement réservé au personnel autorisé (Décision n°11).' });
    return;
  }

  const fees = db
    .prepare(
      `SELECT f.*, c.nom AS classe_nom
       FROM fee_schedules f
       LEFT JOIN classes c ON c.id = f.classe_id
       ORDER BY f.date_echeance`
    )
    .all();

  if (role === 'eleve' || role === 'parent') {
    const studentIds =
      role === 'eleve'
        ? (db.prepare('SELECT id FROM students WHERE user_id = ?').all(req.authUser!.id) as { id: number }[]).map((s) => s.id)
        : (
            db.prepare('SELECT eleve_id AS id FROM parent_student_links WHERE parent_user_id = ?').all(req.authUser!.id) as {
              id: number;
            }[]
          ).map((s) => s.id);

    if (studentIds.length === 0) {
      res.json({ fees, payments: [], expenses: [], unpaid: [] });
      return;
    }
    const ph = studentIds.map(() => '?').join(',');
    const payments = db
      .prepare(
        `SELECT p.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule, f.libelle AS frais_libelle
         FROM payments p
         JOIN students s ON s.id = p.eleve_id
         JOIN fee_schedules f ON f.id = p.frais_id
         WHERE p.eleve_id IN (${ph})
         ORDER BY p.date_paiement DESC`
      )
      .all(...studentIds);
    res.json({ fees, payments, expenses: [], unpaid: [] });
    return;
  }

  const payments = db
    .prepare(
      `SELECT p.*, s.nom || ' ' || s.prenom AS eleve_nom, s.matricule AS eleve_matricule, c.nom AS classe_nom,
              f.libelle AS frais_libelle, u.prenom || ' ' || u.nom AS enregistre_nom
       FROM payments p
       JOIN students s ON s.id = p.eleve_id
       LEFT JOIN classes c ON c.id = s.classe_id
       JOIN fee_schedules f ON f.id = p.frais_id
       JOIN users u ON u.id = p.enregistre_par
       ORDER BY p.date_paiement DESC, p.id DESC`
    )
    .all();

  const expenses = db
    .prepare(
      `SELECT e.*, u.prenom || ' ' || u.nom AS enregistre_nom
       FROM expenses e
       JOIN users u ON u.id = e.enregistre_par
       ORDER BY e.date_depense DESC, e.id DESC`
    )
    .all();

  // Compute real unpaid balances per student & applicable fee
  const students = db
    .prepare(
      `SELECT s.id, s.matricule, s.nom, s.prenom, s.classe_id, c.nom AS classe_nom, s.annee_id
       FROM students s
       LEFT JOIN classes c ON c.id = s.classe_id
       WHERE s.est_archive = 0`
    )
    .all() as { id: number; matricule: string; nom: string; prenom: string; classe_id: number | null; classe_nom: string | null; annee_id: number | null }[];

  const unpaid: {
    eleve_id: number;
    eleve_nom: string;
    eleve_matricule: string;
    classe_nom: string | null;
    frais_id: number;
    frais_libelle: string;
    montant_du: number;
    montant_paye: number;
    reste_a_payer: number;
    date_echeance: string;
  }[] = [];

  for (const st of students) {
    for (const f of fees as { id: number; annee_id: number; classe_id: number | null; libelle: string; montant: number; date_echeance: string }[]) {
      const classMatch = f.classe_id === null || f.classe_id === st.classe_id;
      const yearMatch = st.annee_id === null || f.annee_id === st.annee_id;
      if (!classMatch || !yearMatch) continue;
      const paidRow = db
        .prepare('SELECT COALESCE(SUM(montant_paye), 0) AS total FROM payments WHERE eleve_id = ? AND frais_id = ?')
        .get(st.id, f.id) as { total: number };
      const reste = Number((f.montant - paidRow.total).toFixed(2));
      if (reste > 0) {
        unpaid.push({
          eleve_id: st.id,
          eleve_nom: `${st.nom} ${st.prenom}`,
          eleve_matricule: st.matricule,
          classe_nom: st.classe_nom,
          frais_id: f.id,
          frais_libelle: f.libelle,
          montant_du: f.montant,
          montant_paye: paidRow.total,
          reste_a_payer: reste,
          date_echeance: f.date_echeance,
        });
      }
    }
  }

  res.json({ fees, payments, expenses, unpaid });
});

router.post('/finance/fees', requireAuth, requireRoles('comptable', 'proviseur'), (req: AuthRequest, res) => {
  const { annee_id, classe_id, libelle, montant, date_echeance } = req.body as Record<string, unknown>;
  if (!annee_id || !String(libelle || '').trim() || !montant || Number(montant) <= 0 || !date_echeance) {
    res.status(400).json({ error: 'Année, libellé, montant (> 0) et échéance requis.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO fee_schedules (annee_id, classe_id, libelle, montant, date_echeance) VALUES (?, ?, ?, ?, ?)')
    .run(Number(annee_id), classe_id ? Number(classe_id) : null, String(libelle).trim(), Number(montant), String(date_echeance));

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Création',
    entite: 'Frais scolaire',
    entiteId: info.lastInsertRowid,
    description: `Définition des frais "${String(libelle).trim()}" (${montant}).`,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/finance/payments', requireAuth, requireRoles('comptable', 'proviseur'), (req: AuthRequest, res) => {
  const { eleve_id, frais_id, montant_paye, mode_paiement, date_paiement } = req.body as Record<string, unknown>;
  if (!eleve_id || !frais_id || !montant_paye || Number(montant_paye) <= 0 || !date_paiement) {
    res.status(400).json({ error: 'Élève, frais, montant positif et date requis.' });
    return;
  }
  const numero_recu = `REC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const info = db
    .prepare(
      `INSERT INTO payments (eleve_id, frais_id, montant_paye, mode_paiement, numero_recu, date_paiement, enregistre_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(eleve_id),
      Number(frais_id),
      Number(montant_paye),
      String(mode_paiement || 'especes'),
      numero_recu,
      String(date_paiement),
      req.authUser!.id
    );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Paiement',
    entite: 'Reçu de paiement',
    entiteId: info.lastInsertRowid,
    description: `Encaissement de ${montant_paye} (reçu ${numero_recu}) pour élève #${eleve_id}.`,
  });

  res.status(201).json({ id: info.lastInsertRowid, numero_recu });
});

router.post('/finance/expenses', requireAuth, requireRoles('comptable', 'proviseur'), (req: AuthRequest, res) => {
  const { categorie, libelle, montant, date_depense, beneficiaire, reference } = req.body as Record<string, unknown>;
  if (!categorie || !String(libelle || '').trim() || !montant || Number(montant) <= 0 || !date_depense || !String(beneficiaire || '').trim()) {
    res.status(400).json({ error: 'Catégorie, libellé, montant, date et bénéficiaire requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO expenses (categorie, libelle, montant, date_depense, beneficiaire, reference, enregistre_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(categorie),
      String(libelle).trim(),
      Number(montant),
      String(date_depense),
      String(beneficiaire).trim(),
      reference ? String(reference).trim() : null,
      req.authUser!.id
    );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Dépense',
    entite: 'Dépense établissement',
    entiteId: info.lastInsertRowid,
    description: `Enregistrement dépense "${String(libelle).trim()}" (${montant}).`,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------------- ECONOMAT / STOCKS (Décision n°16) ----------------
router.get('/economat', requireAuth, requireRoles('economat', 'proviseur', 'fondateur'), (_req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY designation').all();
  const movements = db
    .prepare(
      `SELECT m.*, i.designation, u.prenom || ' ' || u.nom AS acteur_nom
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.item_id
       JOIN users u ON u.id = m.acteur_id
       ORDER BY m.id DESC LIMIT 100`
    )
    .all();
  res.json({ items, movements });
});

router.post('/economat/items', requireAuth, requireRoles('economat', 'proviseur'), (req: AuthRequest, res) => {
  const { code, designation, categorie, quantite, seuil_alerte, unite, emplacement } = req.body as Record<string, unknown>;
  if (!String(code || '').trim() || !String(designation || '').trim()) {
    res.status(400).json({ error: 'Code et désignation requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO inventory_items (code, designation, categorie, quantite, seuil_alerte, unite, emplacement)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(code).trim().toUpperCase(),
      String(designation).trim(),
      String(categorie || 'Fournitures'),
      Number(quantite || 0),
      Number(seuil_alerte || 5),
      String(unite || 'Unité'),
      emplacement ? String(emplacement).trim() : null
    );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/economat/movements', requireAuth, requireRoles('economat', 'proviseur'), (req: AuthRequest, res) => {
  const { item_id, type_mouvement, quantite, motif } = req.body as {
    item_id: number;
    type_mouvement: 'entree' | 'sortie';
    quantite: number;
    motif: string;
  };
  if (!item_id || !['entree', 'sortie'].includes(type_mouvement) || !quantite || quantite <= 0 || !motif?.trim()) {
    res.status(400).json({ error: 'Article, type, quantité positive et motif requis.' });
    return;
  }
  const item = db.prepare('SELECT quantite FROM inventory_items WHERE id = ?').get(item_id) as { quantite: number } | undefined;
  if (!item) {
    res.status(404).json({ error: 'Article introuvable.' });
    return;
  }
  if (type_mouvement === 'sortie' && item.quantite < quantite) {
    res.status(400).json({ error: 'Stock insuffisant pour cette sortie.' });
    return;
  }
  const delta = type_mouvement === 'entree' ? quantite : -quantite;
  db.transaction(() => {
    db.prepare(`UPDATE inventory_items SET quantite = quantite + ?, updated_at = datetime('now') WHERE id = ?`).run(delta, item_id);
    db.prepare(
      `INSERT INTO inventory_movements (item_id, type_mouvement, quantite, motif, acteur_id) VALUES (?, ?, ?, ?, ?)`
    ).run(item_id, type_mouvement, quantite, motif.trim(), req.authUser!.id);
  })();
  res.json({ ok: true });
});

// ---------------- OTHER STAFF MODULES (Bibliothécaire, Informaticien, Archiviste, Médical, Agent) ----------------
router.get('/staff-records', requireAuth, (req: AuthRequest, res) => {
  const moduleType = req.query.module_type ? String(req.query.module_type) : null;
  const rows = moduleType
    ? db
        .prepare(
          `SELECT r.*, u.prenom || ' ' || u.nom AS auteur_nom
           FROM other_staff_records r
           JOIN users u ON u.id = r.auteur_id
           WHERE r.module_type = ?
           ORDER BY r.id DESC`
        )
        .all(moduleType)
    : db
        .prepare(
          `SELECT r.*, u.prenom || ' ' || u.nom AS auteur_nom
           FROM other_staff_records r
           JOIN users u ON u.id = r.auteur_id
           ORDER BY r.id DESC`
        )
        .all();
  res.json({ records: rows });
});

router.post('/staff-records', requireAuth, (req: AuthRequest, res) => {
  const { module_type, titre, reference, details } = req.body as Record<string, string>;
  if (!module_type || !titre?.trim() || !details?.trim()) {
    res.status(400).json({ error: 'Module, titre et détails requis.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO other_staff_records (module_type, titre, reference, details, auteur_id) VALUES (?, ?, ?, ?, ?)`
    )
    .run(module_type, titre.trim(), reference?.trim() || null, details.trim(), req.authUser!.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------------- ARCHIVES ----------------
router.get('/archives', requireAuth, requireRoles('fondateur', 'proviseur', 'secretaire', 'archiviste'), (_req, res) => {
  const archivedStudents = db
    .prepare(
      `SELECT s.*, c.nom AS classe_nom
       FROM students s
       LEFT JOIN classes c ON c.id = s.classe_id
       WHERE s.est_archive = 1
       ORDER BY s.updated_at DESC`
    )
    .all();

  const archivedBulletins = db
    .prepare(
      `SELECT b.*, s.nom AS eleve_nom, s.prenom AS eleve_prenom, s.matricule AS eleve_matricule,
              c.nom AS classe_nom, p.nom AS periode_nom
       FROM bulletins b
       JOIN students s ON s.id = b.eleve_id
       JOIN classes c ON c.id = b.classe_id
       JOIN school_periods p ON p.id = b.periode_id
       WHERE b.est_archive = 1 OR b.statut = 'distribue'
       ORDER BY b.updated_at DESC`
    )
    .all();

  res.json({ archivedStudents, archivedBulletins });
});

router.post('/archives/student/:id', requireAuth, requireRoles('secretaire', 'proviseur', 'archiviste'), (req: AuthRequest, res) => {
  db.prepare(`UPDATE students SET est_archive = 1, statut_administratif = 'archive', updated_at = datetime('now') WHERE id = ?`).run(
    req.params.id
  );
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Suppression ou archivage',
    entite: 'Dossier élève',
    entiteId: req.params.id,
    description: 'Archivage durable du dossier élève (sans suppression).',
  });
  res.json({ ok: true });
});

// ---------------- REAL-DATA DASHBOARD SUMMARY ----------------
router.get('/dashboard', requireAuth, (req: AuthRequest, res) => {
  const count = (table: string, where = '1=1') => {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number };
    return r.c;
  };

  const activeYear = db.prepare(`SELECT * FROM academic_years WHERE est_active = 1 LIMIT 1`).get();
  const activePeriod = db.prepare(`SELECT * FROM school_periods WHERE statut = 'active' LIMIT 1`).get();

  const classDistribution = db
    .prepare(
      `SELECT c.nom, COUNT(s.id) AS effectif
       FROM classes c
       LEFT JOIN students s ON s.classe_id = c.id AND s.est_archive = 0
       GROUP BY c.id
       ORDER BY c.niveau, c.nom`
    )
    .all();

  const totalPayments = (
    db.prepare('SELECT COALESCE(SUM(montant_paye), 0) AS t FROM payments').get() as { t: number }
  ).t;
  const totalExpenses = (
    db.prepare('SELECT COALESCE(SUM(montant), 0) AS t FROM expenses').get() as { t: number }
  ).t;

  const recentLogs = ['fondateur', 'proviseur', 'censeur', 'secretaire'].includes(req.authUser!.role)
    ? db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all()
    : db.prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(req.authUser!.id);

  // Today's day of week (1=Mon..6=Sat, 0=Sun)
  const jsDay = new Date().getDay();
  const todayDow = jsDay === 0 ? 7 : jsDay;
  const uid = req.authUser!.id;
  const role = req.authUser!.role;

  let todayTimetable: unknown[] = [];
  if (todayDow >= 1 && todayDow <= 6) {
    if (role === 'eleve') {
      todayTimetable = db
        .prepare(
          `SELECT ts.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
           FROM timetable_slots ts
           JOIN classes c ON c.id = ts.classe_id
           JOIN subjects s ON s.id = ts.matiere_id
           JOIN users u ON u.id = ts.enseignant_id
           JOIN students st ON st.classe_id = ts.classe_id
           WHERE st.user_id = ? AND st.est_archive = 0 AND ts.jour_semaine = ?
           ORDER BY ts.heure_debut ASC`
        )
        .all(uid, todayDow);
    } else if (role === 'enseignant') {
      todayTimetable = db
        .prepare(
          `SELECT ts.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
           FROM timetable_slots ts
           JOIN classes c ON c.id = ts.classe_id
           JOIN subjects s ON s.id = ts.matiere_id
           JOIN users u ON u.id = ts.enseignant_id
           WHERE ts.enseignant_id = ? AND ts.jour_semaine = ?
           ORDER BY ts.heure_debut ASC`
        )
        .all(uid, todayDow);
    } else if (role === 'parent') {
      todayTimetable = db
        .prepare(
          `SELECT DISTINCT ts.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
           FROM timetable_slots ts
           JOIN classes c ON c.id = ts.classe_id
           JOIN subjects s ON s.id = ts.matiere_id
           JOIN users u ON u.id = ts.enseignant_id
           JOIN students st ON st.classe_id = ts.classe_id
           JOIN parent_student_links psl ON psl.eleve_id = st.id
           WHERE psl.parent_user_id = ? AND st.est_archive = 0 AND ts.jour_semaine = ?
           ORDER BY ts.heure_debut ASC`
        )
        .all(uid, todayDow);
    } else {
      todayTimetable = db
        .prepare(
          `SELECT ts.*, c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
           FROM timetable_slots ts
           JOIN classes c ON c.id = ts.classe_id
           JOIN subjects s ON s.id = ts.matiere_id
           JOIN users u ON u.id = ts.enseignant_id
           WHERE ts.jour_semaine = ?
           ORDER BY ts.heure_debut ASC LIMIT 8`
        )
        .all(todayDow);
    }
  }

  const todayDate = new Date().toISOString().slice(0, 10);
  const allAnnouncements = db
    .prepare(
      `SELECT a.*, u.prenom || ' ' || u.nom AS auteur_nom, u.role AS auteur_role
       FROM announcements a
       JOIN users u ON u.id = a.auteur_id
       WHERE (a.expire_le IS NULL OR a.expire_le = '' OR a.expire_le >= ?)
       ORDER BY a.epingle DESC, a.id DESC LIMIT 10`
    )
    .all(todayDate) as Array<{ cible_role: string; auteur_id: number }>;

  const isStaff = !['eleve', 'parent'].includes(role);
  const recentAnnouncements = allAnnouncements
    .filter((a) => {
      if (a.auteur_id === uid || role === 'fondateur' || role === 'proviseur') return true;
      if (a.cible_role === 'tous') return true;
      if (a.cible_role === 'personnel') return isStaff;
      if (a.cible_role === 'enseignants') return role === 'enseignant' || role === 'censeur';
      if (a.cible_role === 'eleves_parents') return role === 'eleve' || role === 'parent';
      return false;
    })
    .slice(0, 4);

  const unreadMessages = (
    db.prepare('SELECT COUNT(*) AS c FROM internal_messages WHERE recipient_id = ? AND est_lu = 0').get(uid) as {
      c: number;
    }
  ).c;

  res.json({
    activeYear: activeYear || null,
    activePeriod: activePeriod || null,
    counts: {
      eleves: count('students', 'est_archive = 0'),
      classes: count('classes'),
      enseignants: count('users', `role = 'enseignant' AND statut = 'actif'`),
      personnel: count('users', `role NOT IN ('eleve', 'parent', 'fondateur') AND statut = 'actif'`),
      inscriptions_attente: count('users', `statut = 'en_attente'`),
      reexamens: count('users', `statut = 'refuse' AND demande_reexamen IS NOT NULL`),
      evaluations: count('evaluations'),
      transmissions_attente: count('grade_transmissions', `statut IN ('transmis', 'nouvelle_transmission', 'en_verification')`),
      bulletins_a_signer: count('bulletins', `statut = 'transmis_proviseur'`),
      bulletins_a_verifier: count('bulletins', `statut = 'signe_proviseur'`),
      bulletins_distribues: count('bulletins', `statut = 'distribue'`),
      corrections_en_cours: count('grade_correction_requests', `statut IN ('soumise', 'validee_censeur')`),
      reclamations_ouvertes: count('result_claims', `statut NOT IN ('acceptee', 'rejetee')`),
      absences: count('attendance', `type = 'absence'`),
      incidents: count('discipline_incidents'),
      supports_cours: count('course_materials', `statut = 'publie'`),
      devoirs: count('homework_assignments', `date_limite >= '${todayDate}'`),
      messages_non_lus: unreadMessages,
      resets_attente: count('password_reset_requests', `statut = 'en_attente'`),
      stock_alerte: count('inventory_items', `quantite <= seuil_alerte`),
    },
    finance: ['fondateur', 'proviseur', 'comptable'].includes(req.authUser!.role)
      ? { totalPayments, totalExpenses, soldeNet: Number((totalPayments - totalExpenses).toFixed(2)) }
      : null,
    classDistribution,
    recentLogs,
    todayTimetable,
    recentAnnouncements,
  });
});

// ---------------- CALENDRIER SCOLAIRE INTERACTIF ----------------
router.get('/calendar', requireAuth, (req: AuthRequest, res) => {
  const user = req.authUser!;
  const role = user.role;

  let allowedClassIds: number[] | null = null;
  if (role === 'eleve') {
    const st = db
      .prepare('SELECT classe_id FROM students WHERE user_id = ? AND est_archive = 0 LIMIT 1')
      .get(user.id) as { classe_id: number } | undefined;
    allowedClassIds = st ? [st.classe_id] : [];
  } else if (role === 'parent') {
    const rows = db
      .prepare(
        `SELECT DISTINCT s.classe_id
         FROM parent_student_links psl
         JOIN students s ON s.id = psl.eleve_id
         WHERE psl.parent_user_id = ? AND s.est_archive = 0`
      )
      .all(user.id) as { classe_id: number }[];
    allowedClassIds = rows.map((r) => r.classe_id);
  } else if (role === 'enseignant') {
    const rows = db
      .prepare('SELECT DISTINCT classe_id FROM teacher_assignments WHERE enseignant_id = ?')
      .all(user.id) as { classe_id: number }[];
    allowedClassIds = rows.map((r) => r.classe_id);
  }

  // Visibility rule:
  // - Events with visibilite = 'etablissement' (created by Proviseur) are visible to ALL registered users (filtered by class only if Proviseur targeted a specific class for students/parents).
  // - Personal events (visibilite = 'personnel') are strictly visible ONLY to their creator (ce.created_by = user.id).
  const manualRows = db
    .prepare(
      `SELECT ce.*, c.nom AS classe_nom, u.prenom || ' ' || u.nom AS created_by_nom
       FROM calendar_events ce
       LEFT JOIN classes c ON c.id = ce.classe_id
       LEFT JOIN users u ON u.id = ce.created_by
       WHERE ce.visibilite = 'etablissement' OR ce.created_by = ?
       ORDER BY ce.date_debut ASC, ce.id ASC`
    )
    .all(user.id) as Array<{
    id: number;
    titre: string;
    categorie: 'evaluation' | 'conseil_classe' | 'administratif' | 'vacances' | 'autre';
    date_debut: string;
    date_fin: string;
    classe_id: number | null;
    classe_nom: string | null;
    description: string | null;
    visibilite: 'etablissement' | 'personnel';
    created_by: number;
    created_by_nom: string | null;
    created_at: string;
  }>;

  const evalRows = db
    .prepare(
      `SELECT e.id, e.titre, e.type, e.date_evaluation, e.bareme_max, e.classe_id, e.enseignant_id, e.description, e.created_at,
              c.nom AS classe_nom, s.nom AS matiere_nom, u.prenom || ' ' || u.nom AS enseignant_nom
       FROM evaluations e
       JOIN classes c ON c.id = e.classe_id
       JOIN subjects s ON s.id = e.matiere_id
       JOIN users u ON u.id = e.enseignant_id
       ORDER BY e.date_evaluation ASC, e.id ASC`
    )
    .all() as Array<{
    id: number;
    titre: string;
    type: string;
    date_evaluation: string;
    bareme_max: number;
    classe_id: number;
    enseignant_id: number;
    description: string | null;
    created_at: string;
    classe_nom: string;
    matiere_nom: string;
    enseignant_nom: string;
  }>;

  const periodRows = db
    .prepare(
      `SELECT p.id, p.nom, p.type_decoupage, p.date_debut, p.date_fin, p.statut, p.created_at, y.libelle AS annee_libelle
       FROM school_periods p
       JOIN academic_years y ON y.id = p.annee_id
       ORDER BY p.date_debut ASC, p.id ASC`
    )
    .all() as Array<{
    id: number;
    nom: string;
    type_decoupage: string;
    date_debut: string;
    date_fin: string;
    statut: string;
    created_at: string;
    annee_libelle: string;
  }>;

  const filteredManual = manualRows.filter((row) => {
    if (row.created_by === user.id) return true;
    if (row.visibilite !== 'etablissement') return false;
    if (role === 'eleve' || role === 'parent') {
      if (row.classe_id === null) return true;
      return allowedClassIds ? allowedClassIds.includes(row.classe_id) : false;
    }
    return true;
  });

  const filteredEvals = evalRows.filter((ev) => {
    if (role === 'eleve' || role === 'parent') {
      return allowedClassIds ? allowedClassIds.includes(ev.classe_id) : false;
    }
    if (role === 'enseignant') {
      return ev.enseignant_id === user.id || (allowedClassIds ? allowedClassIds.includes(ev.classe_id) : false);
    }
    return true;
  });

  const resolveGroup = (cat: string): 'evaluation' | 'administratif' | 'vacances' => {
    if (cat === 'evaluation') return 'evaluation';
    if (cat === 'vacances') return 'vacances';
    return 'administratif';
  };

  const periodMilestones = periodRows.flatMap((p) => {
    const items = [];
    if (p.date_debut) {
      items.push({
        id: `period-start-${p.id}`,
        source: 'school_period' as const,
        source_id: p.id,
        titre: `Ouverture · ${p.nom}`,
        categorie: 'administratif' as const,
        type_groupe: 'administratif' as const,
        visibilite: 'etablissement' as const,
        est_proprietaire: false,
        date_debut: p.date_debut,
        date_fin: p.date_debut,
        classe_id: null,
        classe_nom: null,
        matiere_nom: null,
        description: `Début de période (${p.type_decoupage} · ${p.annee_libelle}) · Statut : ${p.statut}`,
        created_by_nom: 'Proviseur',
        created_at: p.created_at,
      });
    }
    if (p.date_fin) {
      items.push({
        id: `period-end-${p.id}`,
        source: 'school_period' as const,
        source_id: p.id,
        titre: `Clôture · ${p.nom}`,
        categorie: 'administratif' as const,
        type_groupe: 'administratif' as const,
        visibilite: 'etablissement' as const,
        est_proprietaire: false,
        date_debut: p.date_fin,
        date_fin: p.date_fin,
        classe_id: null,
        classe_nom: null,
        matiere_nom: null,
        description: `Fin de période (${p.type_decoupage} · ${p.annee_libelle}) · Statut : ${p.statut}`,
        created_by_nom: 'Proviseur',
        created_at: p.created_at,
      });
    }
    return items;
  });

  const events = [
    ...filteredManual.map((m) => ({
      id: `cal-${m.id}`,
      source: 'calendar_event' as const,
      source_id: m.id,
      titre: m.titre,
      categorie: m.categorie,
      type_groupe: resolveGroup(m.categorie),
      visibilite: m.visibilite,
      est_proprietaire: m.created_by === user.id,
      date_debut: m.date_debut,
      date_fin: m.date_fin,
      classe_id: m.classe_id,
      classe_nom: m.classe_nom,
      matiere_nom: null,
      description: m.description,
      created_by_nom: m.created_by_nom,
      created_at: m.created_at,
    })),
    ...filteredEvals.map((ev) => ({
      id: `eval-${ev.id}`,
      source: 'evaluation' as const,
      source_id: ev.id,
      titre: ev.titre,
      categorie: 'evaluation' as const,
      type_groupe: 'evaluation' as const,
      visibilite: 'etablissement' as const,
      est_proprietaire: ev.enseignant_id === user.id,
      date_debut: ev.date_evaluation,
      date_fin: ev.date_evaluation,
      classe_id: ev.classe_id,
      classe_nom: ev.classe_nom,
      matiere_nom: ev.matiere_nom,
      description: ev.description || `${ev.type} · Barème /${ev.bareme_max} · ${ev.enseignant_nom}`,
      created_by_nom: ev.enseignant_nom,
      created_at: ev.created_at,
    })),
    ...periodMilestones,
  ].sort((a, b) => a.date_debut.localeCompare(b.date_debut) || a.source_id - b.source_id);

  const classes = db.prepare('SELECT id, nom FROM classes ORDER BY niveau, nom').all();

  res.json({ events, classes });
});

router.post('/calendar', requireAuth, (req: AuthRequest, res) => {
  const { titre, categorie, date_debut, date_fin, classe_id, description, visibilite } = req.body as Record<string, unknown>;
  const cleanTitre = String(titre || '').trim();
  const cleanCat = String(categorie || '').trim();
  const start = String(date_debut || '').trim();
  const end = String(date_fin || date_debut || '').trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!cleanTitre) {
    res.status(400).json({ error: 'Le titre de la date clé est obligatoire.' });
    return;
  }
  if (!['conseil_classe', 'administratif', 'vacances', 'evaluation', 'autre'].includes(cleanCat)) {
    res.status(400).json({ error: 'Catégorie d’événement invalide.' });
    return;
  }
  if (!dateRegex.test(start) || !dateRegex.test(end)) {
    res.status(400).json({ error: 'Les dates doivent être au format AAAA-MM-JJ.' });
    return;
  }
  if (end < start) {
    res.status(400).json({ error: 'La date de fin ne peut pas être antérieure à la date de début.' });
    return;
  }

  // Strictly enforce visibility server-side:
  // Only the Proviseur can publish school-wide events ('etablissement').
  // Every other role (parent, eleve, enseignant, censeur, secretaire, fondateur, etc.) creates strictly private personal events ('personnel').
  const isProviseur = req.authUser!.role === 'proviseur';
  const finalVisibility: 'etablissement' | 'personnel' =
    isProviseur && visibilite !== 'personnel' ? 'etablissement' : 'personnel';

  let parsedClassId: number | null = null;
  if (isProviseur && finalVisibility === 'etablissement' && classe_id !== undefined && classe_id !== null && String(classe_id).trim() !== '') {
    const cid = Number(classe_id);
    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(cid);
    if (!cls) {
      res.status(404).json({ error: 'Classe sélectionnée introuvable.' });
      return;
    }
    parsedClassId = cid;
  }

  const info = db
    .prepare(
      `INSERT INTO calendar_events (titre, categorie, date_debut, date_fin, classe_id, description, visibilite, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cleanTitre,
      cleanCat,
      start,
      end,
      parsedClassId,
      description ? String(description).trim() : null,
      finalVisibility,
      req.authUser!.id
    );

  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: finalVisibility === 'etablissement' ? 'Ajout calendrier établissement' : 'Ajout calendrier personnel',
    entite: 'Calendrier',
    entiteId: info.lastInsertRowid,
    description: `Ajout (${finalVisibility} · ${cleanCat}) : ${cleanTitre} (${start}${end !== start ? ` au ${end}` : ''})`,
  });

  res.status(201).json({ id: Number(info.lastInsertRowid), visibilite: finalVisibility });
});

router.delete('/calendar/:id', requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, titre, categorie, created_by, visibilite FROM calendar_events WHERE id = ?')
    .get(id) as
    | { id: number; titre: string; categorie: string; created_by: number; visibilite: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }

  const isOwner = existing.created_by === req.authUser!.id;
  const isProviseurPublic = existing.visibilite === 'etablissement' && req.authUser!.role === 'proviseur';
  if (!isOwner && !isProviseurPublic) {
    res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres événements.' });
    return;
  }

  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  logAudit({
    userId: req.authUser!.id,
    userNom: `${req.authUser!.prenom} ${req.authUser!.nom}`,
    userRole: req.authUser!.role,
    evenement: 'Suppression calendrier scolaire',
    entite: 'Calendrier',
    entiteId: id,
    description: `Suppression de l’événement : ${existing.titre} (${existing.categorie})`,
  });

  res.json({ ok: true });
});

export default router;
