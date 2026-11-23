import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEFAULT_ROLE_PERMISSIONS, hashPassword } from './auth.ts';
import { computePeriodResultsForClass } from './calculations.ts';
import { db, initSchema, UPLOAD_DIR } from './db.ts';
import type { UserRole } from '../src/types.ts';

export const DEMO_PASSWORD = 'Demo2026!';

function buildMinimalPdfBuffer(title: string, bodyLines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ' ');
  const textOps = [
    'BT',
    '/F1 14 Tf',
    '50 760 Td',
    `(${esc(title)}) Tj`,
    '/F1 10 Tf',
    '0 -26 Td',
    ...bodyLines.flatMap((line) => [`(${esc(line)}) Tj`, '0 -16 Td']),
    'ET',
  ].join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj');
  objects.push(`4 0 obj << /Length ${Buffer.byteLength(textOps, 'utf8')} >> stream\n${textOps}\nendstream endobj`);
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export function seedDemoData(): { summary: Record<string, number> } {
  initSchema();

  const summary: Record<string, number> = {
    users: 0,
    students: 0,
    evaluations: 0,
    bulletins: 0,
    payments: 0,
    events: 0,
  };

  const passwordHash = hashPassword(DEMO_PASSWORD);

  // 1. Update school settings cleanly if still blank defaults
  const currentSettings = db.prepare('SELECT * FROM school_settings WHERE id = 1').get() as {
    adresse: string;
    telephone: string;
    email: string;
    message_accueil: string;
  };
  if (!currentSettings.adresse && !currentSettings.message_accueil) {
    db.prepare(
      `UPDATE school_settings
       SET adresse = ?, telephone = ?, email = ?, message_accueil = ?,
           seuil_reussite = 10, mention_tres_bien = 16, mention_bien = 14,
           mention_assez_bien = 12, mention_passable = 10, updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      'Avenue de l’Indépendance, Quartier du Fleuve · BP 1420',
      '+223 20 22 45 80',
      'direction@lycee-prosper-kamara.edu',
      'Année scolaire 2026-2027 · Les conseils de classe du Trimestre 1 débutent le 7 décembre. Consultez vos emplois du temps et résultats publiés.'
    );
  }

  // 2. Helper to ensure demo user exists
  const ensureUser = (u: {
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    role: UserRole;
    statut?: string;
    origine?: string;
  }): number => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email.toLowerCase()) as
      | { id: number }
      | undefined;
    if (existing) return existing.id;

    const perms = JSON.stringify(DEFAULT_ROLE_PERMISSIONS[u.role] || []);
    const info = db
      .prepare(
        `INSERT INTO users (nom, prenom, email, telephone, password_hash, role, statut, origine, permissions_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        u.nom,
        u.prenom,
        u.email.toLowerCase(),
        u.telephone,
        passwordHash,
        u.role,
        u.statut || 'actif',
        u.origine || 'creation_proviseur',
        perms
      );
    summary.users++;
    return Number(info.lastInsertRowid);
  };

  // Ensure a Fondateur exists if somehow empty (never overwrite existing Fondateur)
  const fondateur = db.prepare(`SELECT id FROM users WHERE role = 'fondateur' LIMIT 1`).get() as { id: number } | undefined;
  const proviseurId = ensureUser({
    nom: 'Bah',
    prenom: 'Amadou',
    email: 'proviseur.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 01',
    role: 'proviseur',
  });
  const censeurId = ensureUser({
    nom: 'Keïta',
    prenom: 'Fatoumata',
    email: 'censeur.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 02',
    role: 'censeur',
  });
  const secretaireId = ensureUser({
    nom: 'Coulibaly',
    prenom: 'Mariam',
    email: 'secretaire.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 03',
    role: 'secretaire',
  });
  const profMathsId = ensureUser({
    nom: 'Koné',
    prenom: 'Ibrahima',
    email: 'prof.maths@lycee-pk.demo',
    telephone: '+223 76 11 20 04',
    role: 'enseignant',
  });
  const profLettresId = ensureUser({
    nom: 'Sow',
    prenom: 'Aïssatou',
    email: 'prof.lettres@lycee-pk.demo',
    telephone: '+223 76 11 20 05',
    role: 'enseignant',
  });
  const surveillantId = ensureUser({
    nom: 'Diarra',
    prenom: 'Moussa',
    email: 'surveillant.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 06',
    role: 'surveillant',
  });
  const comptableId = ensureUser({
    nom: 'Sangaré',
    prenom: 'Oumar',
    email: 'comptable.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 07',
    role: 'comptable',
  });
  const economatId = ensureUser({
    nom: 'Cissé',
    prenom: 'Kadiatou',
    email: 'economat.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 08',
    role: 'economat',
  });
  const biblioId = ensureUser({
    nom: 'Touré',
    prenom: 'Boubacar',
    email: 'biblio.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 09',
    role: 'bibliothecaire',
  });
  const itId = ensureUser({
    nom: 'Sidibé',
    prenom: 'Cheick',
    email: 'it.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 10',
    role: 'informaticien',
  });
  const archivisteId = ensureUser({
    nom: 'Camara',
    prenom: 'Aminata',
    email: 'archiviste.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 11',
    role: 'archiviste',
  });
  const medicalId = ensureUser({
    nom: 'Kouyaté',
    prenom: 'Salif',
    email: 'medical.demo@lycee-pk.demo',
    telephone: '+223 76 11 20 12',
    role: 'medical',
  });
  const eleveDemoUserId = ensureUser({
    nom: 'Traoré',
    prenom: 'Aminata',
    email: 'eleve.demo@lycee-pk.demo',
    telephone: '+223 75 44 10 01',
    role: 'eleve',
    origine: 'auto_inscription',
  });
  const parentDemoUserId = ensureUser({
    nom: 'Traoré',
    prenom: 'Mamadou',
    email: 'parent.demo@lycee-pk.demo',
    telephone: '+223 66 44 10 00',
    role: 'parent',
    origine: 'auto_inscription',
  });
  // Pending self-registrations so Proviseur sees requests to process
  ensureUser({
    nom: 'Maïga',
    prenom: 'Hawa',
    email: 'hawa.maiga@lycee-pk.demo',
    telephone: '+223 77 90 12 34',
    role: 'eleve',
    statut: 'en_attente',
    origine: 'auto_inscription',
  });
  ensureUser({
    nom: 'Fofana',
    prenom: 'Bakary',
    email: 'bakary.fofana@lycee-pk.demo',
    telephone: '+223 65 88 45 21',
    role: 'parent',
    statut: 'en_attente',
    origine: 'auto_inscription',
  });

  // 3. Academic Year & School Periods
  const ensureYear = (libelle: string, start: string, end: string, active: number): number => {
    const ex = db.prepare('SELECT id FROM academic_years WHERE libelle = ?').get(libelle) as { id: number } | undefined;
    if (ex) return ex.id;
    const info = db
      .prepare('INSERT INTO academic_years (libelle, date_debut, date_fin, est_active, statut) VALUES (?, ?, ?, ?, ?)')
      .run(libelle, start, end, active, 'active');
    return Number(info.lastInsertRowid);
  };
  const yearId = ensureYear('2026-2027', '2026-09-15', '2027-06-30', 1);

  const ensurePeriod = (nom: string, type: string, start: string, end: string, statut: string, ordre: number): number => {
    const ex = db.prepare('SELECT id FROM school_periods WHERE annee_id = ? AND nom = ?').get(yearId, nom) as
      | { id: number }
      | undefined;
    if (ex) return ex.id;
    const info = db
      .prepare(
        `INSERT INTO school_periods (annee_id, nom, type_decoupage, date_debut, date_fin, statut, ordre)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(yearId, nom, type, start, end, statut, ordre);
    return Number(info.lastInsertRowid);
  };
  const trim1Id = ensurePeriod('Trimestre 1', 'trimestre', '2026-09-15', '2026-12-20', 'active', 1);
  ensurePeriod('Trimestre 2', 'trimestre', '2027-01-05', '2027-03-31', 'planifiee', 2);
  ensurePeriod('Trimestre 3', 'trimestre', '2027-04-12', '2027-06-25', 'planifiee', 3);

  // 4. Classes
  const ensureClass = (nom: string, niveau: string, serie: string, regle: string): number => {
    const ex = db.prepare('SELECT id FROM classes WHERE annee_id = ? AND nom = ?').get(yearId, nom) as
      | { id: number }
      | undefined;
    if (ex) return ex.id;
    const info = db
      .prepare('INSERT INTO classes (annee_id, nom, niveau, serie, regle_notes_manquantes) VALUES (?, ?, ?, ?, ?)')
      .run(yearId, nom, niveau, serie, regle);
    return Number(info.lastInsertRowid);
  };
  const termS1Id = ensureClass('Terminale S1', 'Terminale', 'S', 'neutralise');
  const premL2Id = ensureClass('Première L2', 'Première', 'L', 'neutralise');
  const secAId = ensureClass('Seconde A', 'Seconde', 'Générale', 'minimum');

  // 5. Subjects & Class Coefficients
  const ensureSubject = (code: string, nom: string): number => {
    const ex = db.prepare('SELECT id FROM subjects WHERE code = ?').get(code) as { id: number } | undefined;
    if (ex) return ex.id;
    const info = db.prepare('INSERT INTO subjects (code, nom) VALUES (?, ?)').run(code, nom);
    return Number(info.lastInsertRowid);
  };
  const mathId = ensureSubject('MATH', 'Mathématiques');
  const physId = ensureSubject('PHYS', 'Physique-Chimie');
  const svtId = ensureSubject('SVT', 'Sciences de la Vie et de la Terre');
  const franId = ensureSubject('FRAN', 'Français');
  const philId = ensureSubject('PHIL', 'Philosophie');
  const histId = ensureSubject('HIST', 'Histoire-Géographie');
  const anglId = ensureSubject('ANGL', 'Anglais');
  const infoId = ensureSubject('INFO', 'Informatique');

  const ensureCoeff = (cid: number, mid: number, coeff: number) => {
    db.prepare('INSERT OR IGNORE INTO class_subjects (classe_id, matiere_id, coefficient) VALUES (?, ?, ?)').run(
      cid,
      mid,
      coeff
    );
  };
  // Terminale S1 coefficients
  ensureCoeff(termS1Id, mathId, 5);
  ensureCoeff(termS1Id, physId, 5);
  ensureCoeff(termS1Id, svtId, 4);
  ensureCoeff(termS1Id, franId, 3);
  ensureCoeff(termS1Id, philId, 2);
  ensureCoeff(termS1Id, anglId, 2);
  ensureCoeff(termS1Id, infoId, 2);
  // Première L2 coefficients
  ensureCoeff(premL2Id, franId, 5);
  ensureCoeff(premL2Id, philId, 4);
  ensureCoeff(premL2Id, histId, 4);
  ensureCoeff(premL2Id, anglId, 3);
  ensureCoeff(premL2Id, mathId, 2);
  // Seconde A coefficients
  ensureCoeff(secAId, mathId, 4);
  ensureCoeff(secAId, franId, 4);
  ensureCoeff(secAId, physId, 3);
  ensureCoeff(secAId, histId, 3);
  ensureCoeff(secAId, anglId, 2);

  // Teacher assignments
  const ensureAssign = (tid: number, cid: number, mid: number) => {
    db.prepare(
      'INSERT OR IGNORE INTO teacher_assignments (enseignant_id, classe_id, matiere_id, annee_id) VALUES (?, ?, ?, ?)'
    ).run(tid, cid, mid, yearId);
  };
  ensureAssign(profMathsId, termS1Id, mathId);
  ensureAssign(profMathsId, termS1Id, physId);
  ensureAssign(profMathsId, termS1Id, svtId);
  ensureAssign(profMathsId, termS1Id, infoId);
  ensureAssign(profMathsId, premL2Id, mathId);
  ensureAssign(profMathsId, secAId, mathId);
  ensureAssign(profMathsId, secAId, physId);

  ensureAssign(profLettresId, termS1Id, franId);
  ensureAssign(profLettresId, termS1Id, philId);
  ensureAssign(profLettresId, termS1Id, anglId);
  ensureAssign(profLettresId, premL2Id, franId);
  ensureAssign(profLettresId, premL2Id, philId);
  ensureAssign(profLettresId, premL2Id, histId);
  ensureAssign(profLettresId, premL2Id, anglId);
  ensureAssign(profLettresId, secAId, franId);
  ensureAssign(profLettresId, secAId, histId);
  ensureAssign(profLettresId, secAId, anglId);

  // 6. Student Dossiers (link existing active eleve users id:3 & id:6 if present + create demo students)
  const ensureStudent = (s: {
    user_id?: number | null;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: 'M' | 'F';
    date_naissance: string;
    lieu_naissance: string;
    classe_id: number;
    telephone?: string;
    adresse?: string;
    parent_nom?: string;
    parent_telephone?: string;
    est_archive?: number;
    statut_administratif?: string;
  }): number => {
    const ex = db.prepare('SELECT id FROM students WHERE matricule = ?').get(s.matricule) as { id: number } | undefined;
    if (ex) return ex.id;
    let uid = s.user_id ?? null;
    if (uid) {
      const uidTaken = db.prepare('SELECT id FROM students WHERE user_id = ?').get(uid);
      if (uidTaken) uid = null;
    }
    const info = db
      .prepare(
        `INSERT INTO students (
          user_id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance,
          classe_id, annee_id, telephone, adresse, parent_nom, parent_telephone,
          statut_administratif, est_archive
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uid,
        s.matricule,
        s.nom,
        s.prenom,
        s.sexe,
        s.date_naissance,
        s.lieu_naissance,
        s.classe_id,
        yearId,
        s.telephone || null,
        s.adresse || null,
        s.parent_nom || null,
        s.parent_telephone || null,
        s.statut_administratif || 'inscrit',
        s.est_archive || 0
      );
    summary.students++;
    return Number(info.lastInsertRowid);
  };

  // Check existing active eleve accounts (id 3 and id 6) so their logins see full dossiers too
  const existingEleve3 = db.prepare(`SELECT id FROM users WHERE id = 3 AND role = 'eleve' AND statut = 'actif'`).get() as
    | { id: number }
    | undefined;
  const existingEleve6 = db.prepare(`SELECT id FROM users WHERE id = 6 AND role = 'eleve' AND statut = 'actif'`).get() as
    | { id: number }
    | undefined;
  const existingParent4 = db.prepare(`SELECT id FROM users WHERE id = 4 AND role = 'parent' AND statut = 'actif'`).get() as
    | { id: number }
    | undefined;

  const st1Id = ensureStudent({
    user_id: eleveDemoUserId,
    matricule: 'PK-2026-001',
    nom: 'Traoré',
    prenom: 'Aminata',
    sexe: 'F',
    date_naissance: '2008-04-14',
    lieu_naissance: 'Bamako',
    classe_id: termS1Id,
    telephone: '+223 75 44 10 01',
    adresse: 'Hamdallaye ACI 2000',
    parent_nom: 'Mamadou Traoré',
    parent_telephone: '+223 66 44 10 00',
  });

  const st2Id = ensureStudent({
    user_id: existingEleve3 ? existingEleve3.id : null,
    matricule: 'PK-2026-002',
    nom: 'Diallo',
    prenom: 'Seydou',
    sexe: 'M',
    date_naissance: '2008-09-21',
    lieu_naissance: 'Ségou',
    classe_id: termS1Id,
    telephone: '+223 74 30 11 02',
    adresse: 'Badalabougou',
    parent_nom: 'Seydou Diallo (Parent)',
    parent_telephone: '+223 65 30 11 00',
  });

  const st3Id = ensureStudent({
    matricule: 'PK-2026-003',
    nom: 'Konaté',
    prenom: 'Ousmane',
    sexe: 'M',
    date_naissance: '2007-11-03',
    lieu_naissance: 'Sikasso',
    classe_id: termS1Id,
    telephone: '+223 78 21 33 04',
    adresse: 'Kalaban Coura',
    parent_nom: 'Bintou Konaté',
    parent_telephone: '+223 66 21 33 00',
  });

  const st4Id = ensureStudent({
    matricule: 'PK-2026-004',
    nom: 'Sissoko',
    prenom: 'Djénéba',
    sexe: 'F',
    date_naissance: '2008-01-19',
    lieu_naissance: 'Kayes',
    classe_id: termS1Id,
    telephone: '+223 79 12 45 05',
    adresse: 'Lafiabougou',
    parent_nom: 'Modibo Sissoko',
    parent_telephone: '+223 65 12 45 00',
  });

  const st5Id = ensureStudent({
    matricule: 'PK-2026-005',
    nom: 'Doumbia',
    prenom: 'Moussa',
    sexe: 'M',
    date_naissance: '2008-07-28',
    lieu_naissance: 'Mopti',
    classe_id: termS1Id,
    telephone: '+223 71 09 87 06',
    adresse: 'Magnambougou',
    parent_nom: 'Adama Doumbia',
    parent_telephone: '+223 64 09 87 00',
  });

  const st6Id = ensureStudent({
    user_id: existingEleve6 ? existingEleve6.id : null,
    matricule: 'PK-2026-006',
    nom: 'Dembélé',
    prenom: 'Kadiatou',
    sexe: 'F',
    date_naissance: '2009-02-11',
    lieu_naissance: 'Koutiala',
    classe_id: premL2Id,
    telephone: '+223 72 55 18 07',
    adresse: 'Sabalibougou',
    parent_nom: 'Souleymane Dembélé',
    parent_telephone: '+223 67 55 18 00',
  });

  const st7Id = ensureStudent({
    matricule: 'PK-2026-007',
    nom: 'Kébé',
    prenom: 'Fanta',
    sexe: 'F',
    date_naissance: '2009-06-05',
    lieu_naissance: 'Bamako',
    classe_id: premL2Id,
    telephone: '+223 73 41 22 08',
    adresse: 'Niamakoro',
    parent_nom: 'Awa Kébé',
    parent_telephone: '+223 66 41 22 00',
  });

  const st8Id = ensureStudent({
    matricule: 'PK-2026-008',
    nom: 'Samaké',
    prenom: 'Youssouf',
    sexe: 'M',
    date_naissance: '2010-03-17',
    lieu_naissance: 'Bougouni',
    classe_id: secAId,
    telephone: '+223 75 62 19 09',
    adresse: 'Baco-Djicoroni',
    parent_nom: 'Lassina Samaké',
    parent_telephone: '+223 65 62 19 00',
  });

  ensureStudent({
    matricule: 'PK-2025-099',
    nom: 'Sanogo',
    prenom: 'Boukary',
    sexe: 'M',
    date_naissance: '2006-12-09',
    lieu_naissance: 'Bamako',
    classe_id: termS1Id,
    statut_administratif: 'archive',
    est_archive: 1,
    parent_nom: 'Issa Sanogo',
    parent_telephone: '+223 66 99 01 00',
  });

  // Parent-student links
  db.prepare('INSERT OR IGNORE INTO parent_student_links (parent_user_id, eleve_id, lien) VALUES (?, ?, ?)').run(
    parentDemoUserId,
    st1Id,
    'Père'
  );
  db.prepare('INSERT OR IGNORE INTO parent_student_links (parent_user_id, eleve_id, lien) VALUES (?, ?, ?)').run(
    parentDemoUserId,
    st7Id,
    'Tuteur'
  );
  if (existingParent4) {
    db.prepare('INSERT OR IGNORE INTO parent_student_links (parent_user_id, eleve_id, lien) VALUES (?, ?, ?)').run(
      existingParent4.id,
      st2Id,
      'Parent'
    );
  }

  // Pending important dossier modification request (Décision n°12)
  const modExists = db
    .prepare('SELECT id FROM dossier_modification_requests WHERE eleve_id = ? AND champ = ?')
    .get(st3Id, 'lieu_naissance');
  if (!modExists) {
    db.prepare(
      `INSERT INTO dossier_modification_requests (eleve_id, demandeur_id, champ, ancienne_valeur, nouvelle_valeur, motif, statut)
       VALUES (?, ?, 'lieu_naissance', 'Sikasso', 'Kadiolo (Sikasso)', 'Précision conforme à l’extrait d’acte de naissance présenté par la famille.', 'en_attente')`
    ).run(st3Id, secretaireId);
  }

  // 7. Evaluations, Grades (provisional + accepted), Transmissions, Correction Requests & History
  const ensureEvaluation = (ev: {
    classe_id: number;
    matiere_id: number;
    enseignant_id: number;
    titre: string;
    type: string;
    date_evaluation: string;
    bareme_max: number;
    statut: string;
    description: string;
  }): number => {
    const ex = db
      .prepare('SELECT id FROM evaluations WHERE classe_id = ? AND periode_id = ? AND titre = ?')
      .get(ev.classe_id, trim1Id, ev.titre) as { id: number } | undefined;
    if (ex) return ex.id;
    const info = db
      .prepare(
        `INSERT INTO evaluations (annee_id, periode_id, classe_id, matiere_id, enseignant_id, titre, type, date_evaluation, bareme_max, regle_notes_manquantes, description, statut)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'neutralise', ?, ?)`
      )
      .run(
        yearId,
        trim1Id,
        ev.classe_id,
        ev.matiere_id,
        ev.enseignant_id,
        ev.titre,
        ev.type,
        ev.date_evaluation,
        ev.bareme_max,
        ev.description,
        ev.statut
      );
    summary.evaluations++;
    return Number(info.lastInsertRowid);
  };

  const evMath1 = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: mathId,
    enseignant_id: profMathsId,
    titre: 'Devoir n°1 · Nombres complexes & Suites',
    type: 'devoir_surveille',
    date_evaluation: '2026-10-16',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Épreuve écrite de 2h sur les suites numériques et complexes.',
  });
  const evPhys1 = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: physId,
    enseignant_id: profMathsId,
    titre: 'Composition Physique-Chimie · Cinématique',
    type: 'composition',
    date_evaluation: '2026-11-04',
    bareme_max: 40,
    statut: 'accepte',
    description: 'Composition notée sur 40 avec convertisseur automatique sur 20 (Décision n°1).',
  });
  const evAngl1 = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: anglId,
    enseignant_id: profLettresId,
    titre: 'Interrogation écrite · Comprehension',
    type: 'interrogation',
    date_evaluation: '2026-11-10',
    bareme_max: 10,
    statut: 'accepte',
    description: 'Évaluation rapide sur 10 points.',
  });
  const evMathComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: mathId,
    enseignant_id: profMathsId,
    titre: 'Composition de Mathématiques · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-16',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition trimestrielle sur les suites, limites et complexes.',
  });
  const evPhysDevoir = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: physId,
    enseignant_id: profMathsId,
    titre: 'Devoir n°1 · Mécanique & Dynamique',
    type: 'devoir_surveille',
    date_evaluation: '2026-10-22',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Devoir surveillé de Physique-Chimie.',
  });
  const evSvtDev = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: svtId,
    enseignant_id: profMathsId,
    titre: 'Devoir n°1 · Génétique & Division cellulaire',
    type: 'devoir_surveille',
    date_evaluation: '2026-10-24',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Devoir surveillé de SVT.',
  });
  const evSvtComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: svtId,
    enseignant_id: profMathsId,
    titre: 'Composition SVT · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-17',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition trimestrielle de SVT.',
  });
  const evFranComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: franId,
    enseignant_id: profLettresId,
    titre: 'Composition de Français · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-14',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition trimestrielle de Français.',
  });
  const evPhilDev = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: philId,
    enseignant_id: profLettresId,
    titre: 'Devoir de Philosophie · La Conscience',
    type: 'devoir_surveille',
    date_evaluation: '2026-10-29',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Dissertation philosophique.',
  });
  const evPhilComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: philId,
    enseignant_id: profLettresId,
    titre: 'Composition de Philosophie · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-15',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition trimestrielle de Philosophie.',
  });
  const evAnglComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: anglId,
    enseignant_id: profLettresId,
    titre: 'Composition d’Anglais · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-19',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition écrite d’Anglais.',
  });
  const evInfoDev = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: infoId,
    enseignant_id: profMathsId,
    titre: 'TP Algorithmique · Programmation',
    type: 'pratique',
    date_evaluation: '2026-10-30',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Travaux pratiques d’algorithmique.',
  });
  const evInfoComp = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: infoId,
    enseignant_id: profMathsId,
    titre: 'Composition Informatique · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-20',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition d’Informatique.',
  });
  const evFran1 = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: franId,
    enseignant_id: profLettresId,
    titre: 'Devoir de Dissertation littéraire',
    type: 'devoir_surveille',
    date_evaluation: '2026-11-18',
    bareme_max: 20,
    statut: 'transmis',
    description: 'Transmis au secrétariat pour contrôle.',
  });
  const evMath2 = ensureEvaluation({
    classe_id: termS1Id,
    matiere_id: mathId,
    enseignant_id: profMathsId,
    titre: 'Devoir n°2 · Fonctions exponentielles',
    type: 'devoir_surveille',
    date_evaluation: '2026-11-28',
    bareme_max: 20,
    statut: 'brouillon',
    description: 'Prochaine évaluation à saisir ou importer via Excel.',
  });
  const evPremFran = ensureEvaluation({
    classe_id: premL2Id,
    matiere_id: franId,
    enseignant_id: profLettresId,
    titre: 'Commentaire composé · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-12',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Commentaire littéraire sur œuvre intégrale.',
  });
  const evPremFranDev = ensureEvaluation({
    classe_id: premL2Id,
    matiere_id: franId,
    enseignant_id: profLettresId,
    titre: 'Devoir de Français · Dissertation',
    type: 'devoir_surveille',
    date_evaluation: '2026-10-18',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Devoir surveillé de Français.',
  });
  const evPremHistComp = ensureEvaluation({
    classe_id: premL2Id,
    matiere_id: histId,
    enseignant_id: profLettresId,
    titre: 'Composition Histoire-Géographie · Trimestre 1',
    type: 'composition',
    date_evaluation: '2026-11-15',
    bareme_max: 20,
    statut: 'accepte',
    description: 'Composition trimestrielle.',
  });

  const seedGrade = (
    evalId: number,
    eleveId: number,
    valeur: number | null,
    statutNote: string,
    appreciation: string,
    estProvisoire: number,
    actorId: number
  ) => {
    db.prepare(
      `INSERT OR IGNORE INTO grades (evaluation_id, eleve_id, valeur, statut_note, appreciation, est_provisoire, version, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(evalId, eleveId, valeur, statutNote, appreciation, estProvisoire, actorId);
  };

  // Accepted Math (/20)
  seedGrade(evMath1, st1Id, 17.5, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evMath1, st2Id, 15.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evMath1, st3Id, 13.0, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evMath1, st4Id, 11.5, 'note', 'Peut mieux faire', 0, profMathsId);
  seedGrade(evMath1, st5Id, 8.5, 'note', 'Insuffisant', 0, profMathsId);

  seedGrade(evMathComp, st1Id, 18.0, 'note', 'Excellent travail', 0, profMathsId);
  seedGrade(evMathComp, st2Id, 16.0, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evMathComp, st3Id, 14.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evMathComp, st4Id, 12.0, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evMathComp, st5Id, 9.5, 'note', 'Insuffisant', 0, profMathsId);

  // Accepted Physics (Devoir /20 + Composition /40)
  seedGrade(evPhysDevoir, st1Id, 16.5, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evPhysDevoir, st2Id, 14.5, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evPhysDevoir, st3Id, 12.5, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evPhysDevoir, st4Id, 11.0, 'note', 'Passable', 0, profMathsId);
  seedGrade(evPhysDevoir, st5Id, 8.5, 'note', 'Insuffisant', 0, profMathsId);

  seedGrade(evPhys1, st1Id, 34, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evPhys1, st2Id, 31, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evPhys1, st3Id, 26, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evPhys1, st4Id, null, 'absent_justifie', 'Abs. justifiée', 0, profMathsId);
  seedGrade(evPhys1, st5Id, 19, 'note', 'Insuffisant', 0, profMathsId);

  // Accepted SVT (/20)
  seedGrade(evSvtDev, st1Id, 16.0, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evSvtDev, st2Id, 14.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evSvtDev, st3Id, 13.5, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evSvtDev, st4Id, 12.0, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evSvtDev, st5Id, 10.0, 'note', 'Passable', 0, profMathsId);

  seedGrade(evSvtComp, st1Id, 17.5, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evSvtComp, st2Id, 15.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evSvtComp, st3Id, 14.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evSvtComp, st4Id, 11.5, 'note', 'Passable', 0, profMathsId);
  seedGrade(evSvtComp, st5Id, 9.0, 'note', 'Insuffisant', 0, profMathsId);

  // Accepted Français Comp (/20)
  seedGrade(evFranComp, st1Id, 16.0, 'note', 'Très Bon Travail', 0, profLettresId);
  seedGrade(evFranComp, st2Id, 14.5, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evFranComp, st3Id, 12.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evFranComp, st4Id, 13.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evFranComp, st5Id, 10.5, 'note', 'Passable', 0, profLettresId);

  // Accepted Philosophie (/20)
  seedGrade(evPhilDev, st1Id, 15.5, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evPhilDev, st2Id, 13.5, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPhilDev, st3Id, 12.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPhilDev, st4Id, 11.0, 'note', 'Passable', 0, profLettresId);
  seedGrade(evPhilDev, st5Id, 9.5, 'note', 'Insuffisant', 0, profLettresId);

  seedGrade(evPhilComp, st1Id, 16.5, 'note', 'Très Bon Travail', 0, profLettresId);
  seedGrade(evPhilComp, st2Id, 14.0, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evPhilComp, st3Id, 13.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPhilComp, st4Id, 12.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPhilComp, st5Id, 10.0, 'note', 'Passable', 0, profLettresId);

  // Accepted Anglais (/10 & /20)
  seedGrade(evAngl1, st1Id, 9.0, 'note', 'Excellent travail', 0, profLettresId);
  seedGrade(evAngl1, st2Id, 7.5, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evAngl1, st3Id, 6.5, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evAngl1, st4Id, 8.0, 'note', 'Très Bon Travail', 0, profLettresId);
  seedGrade(evAngl1, st5Id, 5.5, 'note', 'Passable', 0, profLettresId);

  seedGrade(evAnglComp, st1Id, 18.0, 'note', 'Excellent travail', 0, profLettresId);
  seedGrade(evAnglComp, st2Id, 15.5, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evAnglComp, st3Id, 13.5, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evAnglComp, st4Id, 15.0, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evAnglComp, st5Id, 11.0, 'note', 'Passable', 0, profLettresId);

  // Accepted Informatique (/20)
  seedGrade(evInfoDev, st1Id, 18.5, 'note', 'Excellent travail', 0, profMathsId);
  seedGrade(evInfoDev, st2Id, 16.5, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evInfoDev, st3Id, 15.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evInfoDev, st4Id, 14.0, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evInfoDev, st5Id, 12.0, 'note', 'Assez bien', 0, profMathsId);

  seedGrade(evInfoComp, st1Id, 19.0, 'note', 'Excellent travail', 0, profMathsId);
  seedGrade(evInfoComp, st2Id, 17.0, 'note', 'Très Bon Travail', 0, profMathsId);
  seedGrade(evInfoComp, st3Id, 14.5, 'note', 'Bon Travail', 0, profMathsId);
  seedGrade(evInfoComp, st4Id, 13.5, 'note', 'Assez bien', 0, profMathsId);
  seedGrade(evInfoComp, st5Id, 11.5, 'note', 'Passable', 0, profMathsId);

  // Pending Secretariat control French (/20)
  seedGrade(evFran1, st1Id, 16.0, 'note', 'Style fluide et structuré', 1, profLettresId);
  seedGrade(evFran1, st2Id, 14.5, 'note', 'Bonne analyse', 1, profLettresId);
  seedGrade(evFran1, st3Id, 12.0, 'note', 'Correct', 1, profLettresId);
  seedGrade(evFran1, st4Id, 13.5, 'note', 'Progrès notables', 1, profLettresId);
  seedGrade(evFran1, st5Id, 10.0, 'note', 'Passable', 1, profLettresId);

  // Première L2 French & Histoire-Géo (/20)
  seedGrade(evPremFranDev, st6Id, 15.0, 'note', 'Bon Travail', 0, profLettresId);
  seedGrade(evPremFranDev, st7Id, 13.0, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPremFran, st6Id, 15.5, 'note', 'Très Bon Travail', 0, profLettresId);
  seedGrade(evPremFran, st7Id, 13.5, 'note', 'Assez bien', 0, profLettresId);
  seedGrade(evPremHistComp, st6Id, 16.0, 'note', 'Très Bon Travail', 0, profLettresId);
  seedGrade(evPremHistComp, st7Id, 14.0, 'note', 'Bon Travail', 0, profLettresId);

  // Transmissions
  const ensureTransmission = (evalId: number, teacherId: number, methode: string, statut: string) => {
    const ex = db.prepare('SELECT id FROM grade_transmissions WHERE evaluation_id = ?').get(evalId);
    if (ex) return;
    db.prepare(
      `INSERT INTO grade_transmissions (evaluation_id, enseignant_id, methode, statut, verifie_at, verifie_par)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      evalId,
      teacherId,
      methode,
      statut,
      statut === 'accepte' ? new Date().toISOString() : null,
      statut === 'accepte' ? secretaireId : null
    );
  };
  ensureTransmission(evMath1, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evMathComp, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evPhysDevoir, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evPhys1, profMathsId, 'import_excel', 'accepte');
  ensureTransmission(evSvtDev, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evSvtComp, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evFranComp, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evPhilDev, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evPhilComp, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evAngl1, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evAnglComp, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evInfoDev, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evInfoComp, profMathsId, 'saisie_directe', 'accepte');
  ensureTransmission(evFran1, profLettresId, 'saisie_directe', 'transmis');
  ensureTransmission(evPremFran, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evPremFranDev, profLettresId, 'saisie_directe', 'accepte');
  ensureTransmission(evPremHistComp, profLettresId, 'saisie_directe', 'accepte');

  // Double-validation Grade Correction Requests (Décision n°6)
  const corr1Ex = db
    .prepare('SELECT id FROM grade_correction_requests WHERE evaluation_id = ? AND eleve_id = ?')
    .get(evMath1, st3Id);
  if (!corr1Ex) {
    db.prepare(
      `INSERT INTO grade_correction_requests (evaluation_id, eleve_id, enseignant_id, ancienne_valeur, ancien_statut, nouvelle_valeur, nouveau_statut, motif, statut)
       VALUES (?, ?, ?, 13.0, 'note', 14.0, 'note', 'Erreur de report d’un point sur l’exercice 2 après recomptage de copie.', 'soumise')`
    ).run(evMath1, st3Id, profMathsId);
  }
  const corr2Ex = db
    .prepare('SELECT id FROM grade_correction_requests WHERE evaluation_id = ? AND eleve_id = ?')
    .get(evPhys1, st5Id);
  if (!corr2Ex) {
    db.prepare(
      `INSERT INTO grade_correction_requests (evaluation_id, eleve_id, enseignant_id, ancienne_valeur, ancien_statut, nouvelle_valeur, nouveau_statut, motif, statut, censeur_id, censeur_commentaire, censeur_at)
       VALUES (?, ?, ?, 19.0, 'note', 22.0, 'note', 'Copie vérifiée avec le chef de travaux : +3 points sur le barème /40.', 'validee_censeur', ?, 'Justification vérifiée sur copie physique.', datetime('now'))`
    ).run(evPhys1, st5Id, profMathsId, censeurId);
  }
  const histEx = db.prepare('SELECT id FROM grade_history WHERE evaluation_id = ? AND eleve_id = ?').get(evMath1, st2Id);
  if (!histEx) {
    db.prepare(
      `INSERT INTO grade_history (evaluation_id, eleve_id, ancienne_valeur, ancien_statut, nouvelle_valeur, nouveau_statut, motif, acteur_id, autorite_id)
       VALUES (?, ?, 14.5, 'note', 15.0, 'note', 'Correction validée par Censeur et autorisée par le Proviseur suite à erreur d’addition.', ?, ?)`
    ).run(evMath1, st2Id, profMathsId, proviseurId);
  }

  // 8. Bulletins across all circuit states (Décision n°5 & §3)
  const existingBulletinCount = (db.prepare('SELECT COUNT(*) AS c FROM bulletins').get() as { c: number }).c;
  if (existingBulletinCount === 0) {
    const computedS1 = computePeriodResultsForClass(termS1Id, trim1Id);
    const statusByStudentId: Record<number, string> = {
      [st1Id]: 'distribue',
      [st2Id]: 'distribue',
      [st3Id]: 'distribue',
      [st4Id]: 'signe_proviseur',
      [st5Id]: 'transmis_proviseur',
    };

    computedS1.students.forEach((stRes) => {
      const targetStatut = statusByStudentId[stRes.eleve_id] || 'brouillon';
      const isSigned = ['distribue', 'signe_proviseur'].includes(targetStatut);
      const isVerified = targetStatut === 'distribue';
      const sigHash = isSigned ? crypto.createHash('sha256').update(`demo:${stRes.eleve_id}:${trim1Id}`).digest('hex').slice(0, 16) : null;

      const info = db
        .prepare(
          `INSERT INTO bulletins (
            eleve_id, classe_id, annee_id, periode_id, version, statut,
            moyenne_generale, moyenne_classe, meilleure_moyenne, plus_faible_moyenne,
            rang, effectif_classe, appreciation_generale, lignes_json,
            prepare_par, signe_par_proviseur, signature_proviseur_hash, cachet_appose,
            signe_at, verifie_par_censeur, verifie_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          stRes.eleve_id,
          termS1Id,
          yearId,
          trim1Id,
          targetStatut,
          stRes.moyenne_generale,
          computedS1.moyenne_classe,
          computedS1.meilleure_moyenne,
          computedS1.plus_faible_moyenne,
          stRes.rang,
          computedS1.effectif_classe,
          stRes.moyenne_generale !== null && stRes.moyenne_generale >= 14
            ? 'Félicitations du conseil pour votre sérieux et votre régularité.'
            : 'Efforts encourageants à poursuivre sur les matières scientifiques.',
          JSON.stringify(stRes.lignes),
          secretaireId,
          isSigned ? proviseurId : null,
          sigHash,
          isSigned ? 1 : 0,
          isSigned ? new Date().toISOString() : null,
          isVerified ? censeurId : null,
          isVerified ? new Date().toISOString() : null
        );
      summary.bulletins++;

      db.prepare(
        `INSERT INTO bulletin_versions (bulletin_id, version, statut, snapshot_json, acteur_id, motif)
         VALUES (?, 1, ?, ?, ?, ?)`
      ).run(
        info.lastInsertRowid,
        targetStatut,
        JSON.stringify({ moyenne_generale: stRes.moyenne_generale, rang: stRes.rang }),
        isVerified ? censeurId : isSigned ? proviseurId : secretaireId,
        isVerified ? 'Vérifié et distribué aux familles' : isSigned ? 'Signé numériquement avec cachet' : 'Préparation secrétariat'
      );
    });

    // Also distribute Première L2 bulletins
    const computedL2 = computePeriodResultsForClass(premL2Id, trim1Id);
    for (const stRes of computedL2.students) {
      const sigHash = crypto.createHash('sha256').update(`demo:${stRes.eleve_id}:${trim1Id}`).digest('hex').slice(0, 16);
      db.prepare(
        `INSERT INTO bulletins (
          eleve_id, classe_id, annee_id, periode_id, version, statut,
          moyenne_generale, moyenne_classe, meilleure_moyenne, plus_faible_moyenne,
          rang, effectif_classe, appreciation_generale, lignes_json,
          prepare_par, signe_par_proviseur, signature_proviseur_hash, cachet_appose,
          signe_at, verifie_par_censeur, verifie_at
        ) VALUES (?, ?, ?, ?, 1, 'distribue', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?, datetime('now'))`
      ).run(
        stRes.eleve_id,
        premL2Id,
        yearId,
        trim1Id,
        stRes.moyenne_generale,
        computedL2.moyenne_classe,
        computedL2.meilleure_moyenne,
        computedL2.plus_faible_moyenne,
        stRes.rang,
        computedL2.effectif_classe,
        'Très bon premier trimestre en lettres.',
        JSON.stringify(stRes.lignes),
        secretaireId,
        proviseurId,
        sigHash,
        censeurId
      );
      summary.bulletins++;
    }
  } else {
    // Upgrade legacy demo bulletin snapshots so Devoir / Comp / T.H / Rang par matière appear cleanly
    for (const cid of [termS1Id, premL2Id]) {
      const computed = computePeriodResultsForClass(cid, trim1Id);
      for (const stRes of computed.students) {
        const existingB = db
          .prepare('SELECT id, lignes_json FROM bulletins WHERE eleve_id = ? AND periode_id = ?')
          .get(stRes.eleve_id, trim1Id) as { id: number; lignes_json: string } | undefined;
        if (existingB && !existingB.lignes_json.includes('"rang_matiere"')) {
          db.prepare(
            `UPDATE bulletins SET
              moyenne_generale = ?,
              moyenne_classe = ?,
              meilleure_moyenne = ?,
              plus_faible_moyenne = ?,
              rang = ?,
              effectif_classe = ?,
              lignes_json = ?
             WHERE id = ?`
          ).run(
            stRes.moyenne_generale,
            computed.moyenne_classe,
            computed.meilleure_moyenne,
            computed.plus_faible_moyenne,
            stRes.rang,
            computed.effectif_classe,
            JSON.stringify(stRes.lignes),
            existingB.id
          );
        }
      }
    }
  }

  // Claims (Décision n°13)
  const claimEx = db.prepare('SELECT id FROM result_claims WHERE eleve_id = ?').get(st2Id);
  if (!claimEx) {
    db.prepare(
      `INSERT INTO result_claims (eleve_id, periode_id, matiere_id, auteur_id, objet, description, statut, note_secretariat)
       VALUES (?, ?, ?, ?, 'Vérification du coefficient de Physique', 'Merci de confirmer la prise en compte du coefficient 5 pour la série S1.', 'transmise_censeur', 'Dossier transmis avec relevé de notes vérifié.')`
    ).run(st2Id, trim1Id, physId, st2Id);
  }

  // 9. Course Materials (real PDF files in uploads/supports)
  const ensureMaterial = (
    teacherId: number,
    cid: number,
    mid: number,
    titre: string,
    chapitre: string,
    fileName: string,
    lines: string[]
  ) => {
    const ex = db.prepare('SELECT id FROM course_materials WHERE titre = ? AND classe_id = ?').get(titre, cid);
    if (ex) return;
    const diskName = `demo_${fileName}`;
    const fullPath = path.join(UPLOAD_DIR, 'supports', diskName);
    const pdfBuf = buildMinimalPdfBuffer(titre, lines);
    fs.writeFileSync(fullPath, pdfBuf);

    const info = db
      .prepare(
        `INSERT INTO course_materials (enseignant_id, classe_id, matiere_id, titre, chapitre, description, fichier_nom, fichier_path, extension, taille_octets, version, statut)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '.pdf', ?, 1, 'publie')`
      )
      .run(teacherId, cid, mid, titre, chapitre, lines[0] || titre, fileName, `supports/${diskName}`, pdfBuf.length);
    db.prepare(
      `INSERT INTO course_material_versions (material_id, version, fichier_nom, fichier_path, modifie_par) VALUES (?, 1, ?, ?, ?)`
    ).run(info.lastInsertRowid, fileName, `supports/${diskName}`, teacherId);
  };

  ensureMaterial(
    profMathsId,
    termS1Id,
    mathId,
    'Fiche de cours : Nombres complexes & Géométrie',
    'Chapitre 2 · Algèbre',
    'cours_nombres_complexes_ts1.pdf',
    [
      'Lycee Prosper Kamara - Terminale S1 - Mathematiques',
      'Forme algebrique z = a + ib, module |z| et argument.',
      'Formule de Moivre et formules d Euler pour la linearisation.',
      'Exercices corriges d entrainement pour la composition.',
    ]
  );
  ensureMaterial(
    profLettresId,
    termS1Id,
    franId,
    'Méthodologie de la Dissertation littéraire',
    'Méthodologie BAC',
    'methodologie_dissertation_ts1.pdf',
    [
      'Lycee Prosper Kamara - Methodologie Francais',
      '1. Analyser les mots-cles du sujet et formuler la problematique.',
      '2. Construire un plan dialectique ou thematique equilibre.',
      '3. Rediger introduction, transitions et conclusion.',
    ]
  );

  // 10. Timetable & Homework
  const slotCount = (db.prepare('SELECT COUNT(*) AS c FROM timetable_slots').get() as { c: number }).c;
  if (slotCount === 0) {
    const insertSlot = db.prepare(
      `INSERT INTO timetable_slots (annee_id, classe_id, matiere_id, enseignant_id, jour_semaine, heure_debut, heure_fin, salle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // Terminale S1 Mon-Sat (1..6)
    insertSlot.run(yearId, termS1Id, mathId, profMathsId, 1, '08:00', '10:00', 'Salle B1');
    insertSlot.run(yearId, termS1Id, franId, profLettresId, 1, '10:15', '12:15', 'Salle B1');
    insertSlot.run(yearId, termS1Id, physId, profMathsId, 2, '08:00', '10:00', 'Labo Physique');
    insertSlot.run(yearId, termS1Id, anglId, profLettresId, 2, '10:15', '12:00', 'Salle B1');
    insertSlot.run(yearId, termS1Id, svtId, profMathsId, 3, '08:00', '10:00', 'Labo SVT');
    insertSlot.run(yearId, termS1Id, philId, profLettresId, 3, '10:15', '12:15', 'Salle B1');
    insertSlot.run(yearId, termS1Id, mathId, profMathsId, 4, '08:00', '10:00', 'Salle B1');
    insertSlot.run(yearId, termS1Id, infoId, profMathsId, 4, '15:00', '17:00', 'Salle Info');
    insertSlot.run(yearId, termS1Id, physId, profMathsId, 5, '08:00', '10:00', 'Labo Physique');
    insertSlot.run(yearId, termS1Id, franId, profLettresId, 5, '10:15', '12:00', 'Salle B1');
    insertSlot.run(yearId, termS1Id, mathId, profMathsId, 6, '08:30', '10:30', 'Salle B1');
    // Première L2 (non-overlapping teacher hours)
    insertSlot.run(yearId, premL2Id, franId, profLettresId, 1, '08:00', '10:00', 'Salle A2');
    insertSlot.run(yearId, premL2Id, mathId, profMathsId, 1, '10:15', '12:15', 'Salle A2');
    insertSlot.run(yearId, premL2Id, histId, profLettresId, 2, '08:00', '10:00', 'Salle A2');
    insertSlot.run(yearId, premL2Id, philId, profLettresId, 4, '08:00', '10:00', 'Salle A2');
  }

  const hwCount = (db.prepare('SELECT COUNT(*) AS c FROM homework_assignments').get() as { c: number }).c;
  if (hwCount === 0) {
    const insHw = db.prepare(
      `INSERT INTO homework_assignments (classe_id, matiere_id, enseignant_id, titre, consignes, date_limite, bareme)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insHw.run(
      termS1Id,
      mathId,
      profMathsId,
      'Série d’exercices · Fonctions exponentielles',
      'Résoudre les exercices 14, 17 et 22 page 84 du manuel et tracer la courbe asymptotique.',
      '2026-11-26',
      20
    );
    insHw.run(
      termS1Id,
      philId,
      profLettresId,
      'Plan détaillé · La liberté et la responsabilité',
      'Rédiger l’introduction complète et le plan détaillé en trois parties avec deux références philosophiques par partie.',
      '2026-11-29',
      20
    );
    insHw.run(
      premL2Id,
      franId,
      profLettresId,
      'Fiche de lecture · Une si longue lettre',
      'Présenter les thèmes majeurs et analyser la structure épistolaire.',
      '2026-12-01',
      20
    );
  }

  // 11. Announcements & Internal Messages
  const annCount = (db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as { c: number }).c;
  if (annCount === 0) {
    const insAnn = db.prepare(
      `INSERT INTO announcements (titre, contenu, priorite, cible_role, auteur_id, epingle, expire_le)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insAnn.run(
      'Calendrier des conseils de classe du Trimestre 1',
      'Les conseils de classe se tiendront du 7 au 12 décembre 2026 en salle des professeurs. Les bulletins vérifiés seront publiés sur la plateforme dès le 15 décembre.',
      'importante',
      'tous',
      proviseurId,
      1,
      '2026-12-20'
    );
    insAnn.run(
      'Date limite de transmission des notes au secrétariat',
      'Mesdames et Messieurs les enseignants sont priés de transmettre toutes les grilles de notes (saisie directe ou import Excel) avant le vendredi 4 décembre à 17h00.',
      'urgente',
      'enseignants',
      censeurId,
      1,
      '2026-12-06'
    );
    insAnn.run(
      'Ouverture de la bibliothèque aux révisions du samedi',
      'La bibliothèque reste ouverte chaque samedi de 08h30 à 13h00 pour les élèves de Première et Terminale préparant les compositions.',
      'normale',
      'eleves_parents',
      proviseurId,
      0,
      null
    );
  }

  const msgCount = (db.prepare('SELECT COUNT(*) AS c FROM internal_messages').get() as { c: number }).c;
  if (msgCount === 0) {
    const insMsg = db.prepare('INSERT INTO internal_messages (sender_id, recipient_id, sujet, contenu, est_lu) VALUES (?, ?, ?, ?, ?)');
    insMsg.run(
      censeurId,
      proviseurId,
      'Point d’avancement des bulletins Terminale S1',
      'Monsieur le Proviseur, les notes de Mathématiques, Physique et Anglais sont validées. Un lot de bulletins est prêt pour votre signature numérique.',
      0
    );
    insMsg.run(
      profMathsId,
      eleveDemoUserId,
      'Félicitations pour votre 1er devoir de Mathématiques',
      'Bonjour Aminata, votre copie de devoir n°1 est excellente. N’hésitez pas à consulter la fiche de cours sur les complexes publiée dans vos supports.',
      0
    );
    insMsg.run(
      comptableId,
      parentDemoUserId,
      'Rappel échéance Tranche 2 de scolarité',
      'Bonjour Monsieur Traoré, votre reçu de la Tranche 1 est disponible en PDF dans votre espace Finance. La Tranche 2 est attendue pour le 15 janvier 2027.',
      0
    );
    if (fondateur) {
      insMsg.run(
        proviseurId,
        fondateur.id,
        'Synthèse hebdomadaire de l’établissement',
        'Monsieur le Fondateur, l’ensemble des espaces (pédagogie, surveillance, comptabilité, économat) est opérationnel pour la démonstration.',
        0
      );
    }
  }

  // 12. Calendar Events (School-wide by Proviseur)
  const ensureCalEvent = (
    titre: string,
    categorie: string,
    dateDebut: string,
    dateFin: string,
    classeId: number | null,
    description: string
  ) => {
    const ex = db.prepare('SELECT id FROM calendar_events WHERE titre = ?').get(titre);
    if (ex) return;
    db.prepare(
      `INSERT INTO calendar_events (titre, categorie, date_debut, date_fin, classe_id, description, visibilite, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'etablissement', ?)`
    ).run(titre, categorie, dateDebut, dateFin, classeId, description, proviseurId);
    summary.events++;
  };

  ensureCalEvent(
    'Conseil de classe Terminale S1',
    'conseil_classe',
    '2026-12-08',
    '2026-12-08',
    termS1Id,
    'Bilan pédagogique du Trimestre 1 et attribution des mentions.'
  );
  ensureCalEvent(
    'Journée Portes Ouvertes & Rencontre Parents',
    'administratif',
    '2026-11-28',
    '2026-11-28',
    null,
    'Accueil des familles, présentation des résultats et suivi personnalisé.'
  );
  ensureCalEvent(
    'Remise officielle des bulletins Trimestre 1',
    'administratif',
    '2026-12-16',
    '2026-12-16',
    null,
    'Publication officielle et téléchargement PDF sur l’espace Élèves & Parents.'
  );
  ensureCalEvent(
    'Congés de fin du Trimestre 1',
    'vacances',
    '2026-12-21',
    '2027-01-04',
    null,
    'Vacances scolaires de fin d’année.'
  );

  // 13. Surveillance (Attendance & Discipline Incidents)
  const attCount = (db.prepare('SELECT COUNT(*) AS c FROM attendance').get() as { c: number }).c;
  if (attCount === 0) {
    const insAtt = db.prepare(
      `INSERT INTO attendance (eleve_id, date_evenement, type, duree_minutes, est_justifie, justificatif, signale_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insAtt.run(st4Id, '2026-11-04', 'absence', null, 1, 'Certificat médical déposé à l’infirmerie', surveillantId);
    insAtt.run(st5Id, '2026-11-12', 'retard', 15, 0, null, surveillantId);
    insAtt.run(st3Id, '2026-11-19', 'retard', 10, 1, 'Retard transport scolaire signalé par le parent', surveillantId);

    db.prepare(
      `INSERT INTO discipline_incidents (eleve_id, date_incident, gravite, description, sanction, transmis_censeur, signale_par)
       VALUES (?, '2026-11-14', 'mineure', 'Utilisation non autorisée du téléphone en étude surveillée.', 'Avertissement oral et retenue de 1h', 1, ?)`
    ).run(st5Id, surveillantId);
  }

  // 14. Finance (Fee Schedules, Payments, Expenses)
  const feeCount = (db.prepare('SELECT COUNT(*) AS c FROM fee_schedules').get() as { c: number }).c;
  if (feeCount === 0) {
    const f1 = Number(
      db
        .prepare('INSERT INTO fee_schedules (annee_id, classe_id, libelle, montant, date_echeance) VALUES (?, NULL, ?, ?, ?)')
        .run(yearId, 'Frais d’inscription & Dossier', 25000, '2026-09-30').lastInsertRowid
    );
    const f2 = Number(
      db
        .prepare('INSERT INTO fee_schedules (annee_id, classe_id, libelle, montant, date_echeance) VALUES (?, NULL, ?, ?, ?)')
        .run(yearId, 'Scolarité Tranche 1', 120000, '2026-10-31').lastInsertRowid
    );
    db.prepare('INSERT INTO fee_schedules (annee_id, classe_id, libelle, montant, date_echeance) VALUES (?, NULL, ?, ?, ?)').run(
      yearId,
      'Scolarité Tranche 2',
      120000,
      '2027-01-15'
    );

    const insPay = db.prepare(
      `INSERT INTO payments (eleve_id, frais_id, montant_paye, mode_paiement, numero_recu, date_paiement, enregistre_par)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insPay.run(st1Id, f1, 25000, 'especes', 'REC-2026-0001', '2026-09-18', comptableId);
    insPay.run(st1Id, f2, 120000, 'virement', 'REC-2026-0002', '2026-10-12', comptableId);
    insPay.run(st2Id, f1, 25000, 'mobile_money', 'REC-2026-0003', '2026-09-20', comptableId);
    insPay.run(st2Id, f2, 80000, 'mobile_money', 'REC-2026-0004', '2026-10-25', comptableId);
    insPay.run(st3Id, f1, 25000, 'especes', 'REC-2026-0005', '2026-09-22', comptableId);
    insPay.run(st6Id, f1, 25000, 'cheque', 'REC-2026-0006', '2026-09-25', comptableId);
    summary.payments = 6;

    const insExp = db.prepare(
      `INSERT INTO expenses (categorie, libelle, montant, date_depense, beneficiaire, enregistre_par)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insExp.run('Pédagogie', 'Acquisition matériel laboratoire Physique-Chimie', 185000, '2026-10-08', 'EquipSciences SARL', comptableId);
    insExp.run('Informatique', 'Renouvellement fibre optique & maintenance réseau', 95000, '2026-11-02', 'Malitel Pro', comptableId);
    insExp.run('Énergie & Eau', 'Facture électricité campus (Octobre)', 112000, '2026-11-05', 'EDM SA', comptableId);
  }

  // 15. Économat Inventory (including 2 items below seuil_alerte to showcase alerts)
  const invCount = (db.prepare('SELECT COUNT(*) AS c FROM inventory_items').get() as { c: number }).c;
  if (invCount === 0) {
    const insInv = db.prepare(
      'INSERT INTO inventory_items (code, designation, categorie, quantite, seuil_alerte, unite) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const i1 = Number(insInv.run('PAP-A4-80', 'Rames de papier A4 80g (carton)', 'Fournitures', 4, 10, 'Carton').lastInsertRowid);
    const i2 = Number(insInv.run('CRAIE-BL', 'Boîtes de craie blanche sans poussière', 'Fournitures', 38, 15, 'Boîte').lastInsertRowid);
    insInv.run('MARQ-TAB', 'Marqueurs tableau blanc (lot de 12)', 'Fournitures', 3, 8, 'Lot');
    insInv.run('CAH-TXT', 'Cahiers de textes reliés grand format', 'Pédagogie', 24, 5, 'Unité');
    insInv.run('TROUS-MED', 'Kits premiers secours infirmerie', 'Médical', 6, 3, 'Kit');

    db.prepare(
      'INSERT INTO inventory_movements (item_id, type_mouvement, quantite, motif, acteur_id) VALUES (?, ?, ?, ?, ?)'
    ).run(i1, 'sortie', 6, 'Dotation secrétariat pour impression des bulletins Trimestre 1', economatId);
    db.prepare(
      'INSERT INTO inventory_movements (item_id, type_mouvement, quantite, motif, acteur_id) VALUES (?, ?, ?, ?, ?)'
    ).run(i2, 'entree', 40, 'Réception commande fournitures rentrée', economatId);
  }

  // 16. Other Staff Records (Bibliothèque, Informatique, Médical, Archiviste)
  const staffRecCount = (db.prepare('SELECT COUNT(*) AS c FROM other_staff_records').get() as { c: number }).c;
  if (staffRecCount === 0) {
    const insRec = db.prepare(
      'INSERT INTO other_staff_records (module_type, titre, reference, details, auteur_id) VALUES (?, ?, ?, ?, ?)'
    );
    insRec.run('bibliothecaire', 'Prêt manuel Annales Baccalauréat Mathématiques', 'BIB-2026-104', 'Prêté à Aminata Traoré (PK-2026-001) jusqu’au 10/12/2026.', biblioId);
    insRec.run('informaticien', 'Vérification poste salle informatique B2', 'IT-TICKET-19', 'Mise à jour des postes élèves et test import Excel LibreOffice/XLSX.', itId);
    insRec.run('medical', 'Visite médicale d’aptitude sportive', 'MED-2026-042', 'Contrôle effectué pour la classe Terminale S1 — RAS.', medicalId);
    insRec.run('archiviste', 'Indexation des registres d’archives 2025-2026', 'ARC-2026-01', 'Classement complet des dossiers transférés et bulletins signés.', archivisteId);
  }

  // 17. One pending Password Reset Request so Proviseur / Fondateur / IT can demonstrate issuing a PK-XXXXXX code
  const prCount = (db.prepare('SELECT COUNT(*) AS c FROM password_reset_requests').get() as { c: number }).c;
  if (prCount === 0) {
    db.prepare(
      `INSERT INTO password_reset_requests (user_id, email_saisi, motif, statut)
       VALUES (?, 'eleve.demo@lycee-pk.demo', 'Démonstration : demande d’émission de code temporaire par la direction.', 'en_attente')`
    ).run(eleveDemoUserId);
  }

  // 18. Welcome notification for Proviseur & Demo users
  const notifCount = (db.prepare('SELECT COUNT(*) AS c FROM notifications').get() as { c: number }).c;
  if (notifCount === 0) {
    db.prepare('INSERT INTO notifications (user_id, titre, message, lien_module) VALUES (?, ?, ?, ?)').run(
      proviseurId,
      'Espace de démonstration prêt',
      'Les classes, élèves, évaluations, bulletins et données financières de démonstration sont chargés.',
      'dashboard'
    );
    db.prepare('INSERT INTO notifications (user_id, titre, message, lien_module) VALUES (?, ?, ?, ?)').run(
      censeurId,
      'Bulletin prêt pour vérification',
      'Un bulletin de Terminale S1 signé par le proviseur attend votre vérification finale.',
      'bulletins'
    );
  }

  return { summary };
}

// Allow direct execution via: npx tsx server/seedDemo.ts
const isCli = process.argv[1] && process.argv[1].endsWith('seedDemo.ts');
if (isCli) {
  const result = seedDemoData();
  console.log('Données de démonstration générées avec succès :', result.summary);
  process.exit(0);
}
