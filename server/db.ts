import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
for (const sub of ['photos', 'logo', 'imports', 'supports', 'justificatifs']) {
  const dir = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const DB_PATH = path.join(DATA_DIR, 'prosper_kamara.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nom_etablissement TEXT NOT NULL DEFAULT 'LYCÉE PROSPER KAMARA',
      devise TEXT NOT NULL DEFAULT 'Excellence · Discipline · Réussite',
      adresse TEXT NOT NULL DEFAULT '',
      telephone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      logo_path TEXT,
      cachet_path TEXT,
      retention_documents_jours INTEGER NOT NULL DEFAULT 365,
      retention_logs_jours INTEGER NOT NULL DEFAULT 730,
      seuil_reussite REAL NOT NULL DEFAULT 10,
      mention_tres_bien REAL NOT NULL DEFAULT 16,
      mention_bien REAL NOT NULL DEFAULT 14,
      mention_assez_bien REAL NOT NULL DEFAULT 12,
      mention_passable REAL NOT NULL DEFAULT 10,
      afficher_rang_bulletin INTEGER NOT NULL DEFAULT 1,
      afficher_moyenne_classe INTEGER NOT NULL DEFAULT 1,
      afficher_appreciation_bulletin INTEGER NOT NULL DEFAULT 1,
      autoriser_auto_inscription INTEGER NOT NULL DEFAULT 1,
      message_accueil TEXT NOT NULL DEFAULT '',
      couleur_accent TEXT NOT NULL DEFAULT 'blue',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO school_settings (id, nom_etablissement, devise)
    VALUES (1, 'LYCÉE PROSPER KAMARA', 'Excellence · Discipline · Réussite');

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telephone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'actif',
      origine TEXT NOT NULL DEFAULT 'creation_proviseur',
      motif_refus TEXT,
      demande_reexamen TEXT,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      preferences_json TEXT NOT NULL DEFAULT '{}',
      last_login_at TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email_saisi TEXT NOT NULL,
      motif TEXT,
      code_hash TEXT,
      expires_at TEXT,
      statut TEXT NOT NULL DEFAULT 'en_attente',
      issued_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      contenu TEXT NOT NULL,
      priorite TEXT NOT NULL DEFAULT 'normale',
      cible_role TEXT NOT NULL DEFAULT 'tous',
      auteur_id INTEGER NOT NULL,
      epingle INTEGER NOT NULL DEFAULT 0,
      expire_le TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auteur_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timetable_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      jour_semaine INTEGER NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      salle TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE CASCADE,
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (matiere_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (enseignant_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS homework_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      consignes TEXT NOT NULL,
      date_limite TEXT NOT NULL,
      bareme REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (matiere_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (enseignant_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS internal_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      sujet TEXT NOT NULL,
      contenu TEXT NOT NULL,
      est_lu INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parent_student_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_user_id INTEGER NOT NULL,
      eleve_id INTEGER NOT NULL,
      lien TEXT NOT NULL DEFAULT 'Parent / Tuteur',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_user_id, eleve_id),
      FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT NOT NULL UNIQUE,
      date_debut TEXT NOT NULL,
      date_fin TEXT NOT NULL,
      est_active INTEGER NOT NULL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS school_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_id INTEGER NOT NULL,
      nom TEXT NOT NULL,
      type_decoupage TEXT NOT NULL DEFAULT 'trimestre',
      date_debut TEXT NOT NULL,
      date_fin TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'planifiee',
      ordre INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_id INTEGER NOT NULL,
      nom TEXT NOT NULL,
      niveau TEXT NOT NULL,
      serie TEXT,
      regle_notes_manquantes TEXT NOT NULL DEFAULT 'neutralise',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(annee_id, nom),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      coefficient REAL NOT NULL DEFAULT 1,
      UNIQUE(classe_id, matiere_id),
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (matiere_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enseignant_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      annee_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(enseignant_id, classe_id, matiere_id, annee_id),
      FOREIGN KEY (enseignant_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (matiere_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      matricule TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      sexe TEXT NOT NULL DEFAULT 'M',
      date_naissance TEXT NOT NULL,
      lieu_naissance TEXT,
      classe_id INTEGER,
      annee_id INTEGER,
      telephone TEXT,
      adresse TEXT,
      parent_nom TEXT,
      parent_telephone TEXT,
      parent_email TEXT,
      photo_path TEXT,
      statut_administratif TEXT NOT NULL DEFAULT 'inscrit',
      est_archive INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE SET NULL,
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dossier_modification_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      demandeur_id INTEGER NOT NULL,
      champ TEXT NOT NULL,
      ancienne_valeur TEXT NOT NULL,
      nouvelle_valeur TEXT NOT NULL,
      motif TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'en_attente',
      decideur_id INTEGER,
      motif_decision TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (demandeur_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_id INTEGER NOT NULL,
      periode_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      type TEXT NOT NULL,
      date_evaluation TEXT NOT NULL,
      bareme_max REAL NOT NULL DEFAULT 20,
      regle_notes_manquantes TEXT NOT NULL DEFAULT 'neutralise',
      description TEXT,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id),
      FOREIGN KEY (periode_id) REFERENCES school_periods(id),
      FOREIGN KEY (classe_id) REFERENCES classes(id),
      FOREIGN KEY (matiere_id) REFERENCES subjects(id),
      FOREIGN KEY (enseignant_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      eleve_id INTEGER NOT NULL,
      valeur REAL,
      statut_note TEXT NOT NULL DEFAULT 'en_attente',
      appreciation TEXT,
      est_provisoire INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(evaluation_id, eleve_id),
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS excel_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      fichier_nom TEXT NOT NULL,
      fichier_path TEXT NOT NULL,
      rapport_json TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'provisoire',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grade_transmissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      methode TEXT NOT NULL DEFAULT 'saisie_directe',
      statut TEXT NOT NULL DEFAULT 'brouillon',
      motif_retour TEXT,
      import_id INTEGER,
      snapshot_json TEXT NOT NULL DEFAULT '[]',
      transmis_at TEXT NOT NULL DEFAULT (datetime('now')),
      verifie_at TEXT,
      verifie_par INTEGER,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grade_correction_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      eleve_id INTEGER NOT NULL,
      enseignant_id INTEGER NOT NULL,
      ancienne_valeur REAL,
      ancien_statut TEXT NOT NULL,
      nouvelle_valeur REAL,
      nouveau_statut TEXT NOT NULL,
      motif TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'soumise',
      censeur_id INTEGER,
      censeur_commentaire TEXT,
      censeur_at TEXT,
      proviseur_id INTEGER,
      proviseur_commentaire TEXT,
      proviseur_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      eleve_id INTEGER NOT NULL,
      ancienne_valeur REAL,
      ancien_statut TEXT,
      nouvelle_valeur REAL,
      nouveau_statut TEXT,
      motif TEXT NOT NULL,
      acteur_id INTEGER NOT NULL,
      autorite_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS course_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enseignant_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      matiere_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      chapitre TEXT NOT NULL,
      description TEXT,
      fichier_nom TEXT NOT NULL,
      fichier_path TEXT NOT NULL,
      extension TEXT NOT NULL,
      taille_octets INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      statut TEXT NOT NULL DEFAULT 'publie',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (enseignant_id) REFERENCES users(id),
      FOREIGN KEY (classe_id) REFERENCES classes(id),
      FOREIGN KEY (matiere_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS course_material_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      fichier_nom TEXT NOT NULL,
      fichier_path TEXT NOT NULL,
      modifie_par INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (material_id) REFERENCES course_materials(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bulletins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      annee_id INTEGER NOT NULL,
      periode_id INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      moyenne_generale REAL,
      moyenne_classe REAL,
      meilleure_moyenne REAL,
      plus_faible_moyenne REAL,
      rang INTEGER,
      effectif_classe INTEGER NOT NULL DEFAULT 0,
      appreciation_generale TEXT,
      lignes_json TEXT NOT NULL DEFAULT '[]',
      prepare_par INTEGER NOT NULL,
      signe_par_proviseur INTEGER,
      signature_proviseur_hash TEXT,
      cachet_appose INTEGER NOT NULL DEFAULT 0,
      signe_at TEXT,
      verifie_par_censeur INTEGER,
      verifie_at TEXT,
      motif_retour TEXT,
      est_archive INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (classe_id) REFERENCES classes(id),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id),
      FOREIGN KEY (periode_id) REFERENCES school_periods(id)
    );

    CREATE TABLE IF NOT EXISTS bulletin_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bulletin_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      statut TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      acteur_id INTEGER NOT NULL,
      motif TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bulletin_id) REFERENCES bulletins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS result_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      bulletin_id INTEGER,
      periode_id INTEGER NOT NULL,
      matiere_id INTEGER,
      auteur_id INTEGER NOT NULL,
      objet TEXT NOT NULL,
      description TEXT NOT NULL,
      justificatif_path TEXT,
      statut TEXT NOT NULL DEFAULT 'recue_secretariat',
      note_secretariat TEXT,
      avis_censeur TEXT,
      decision_proviseur TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      date_evenement TEXT NOT NULL,
      type TEXT NOT NULL,
      duree_minutes INTEGER,
      est_justifie INTEGER NOT NULL DEFAULT 0,
      justificatif TEXT,
      signale_par INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS discipline_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      date_incident TEXT NOT NULL,
      gravite TEXT NOT NULL DEFAULT 'mineure',
      description TEXT NOT NULL,
      sanction TEXT,
      transmis_censeur INTEGER NOT NULL DEFAULT 1,
      signale_par INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fee_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_id INTEGER NOT NULL,
      classe_id INTEGER,
      libelle TEXT NOT NULL,
      montant REAL NOT NULL,
      date_echeance TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (annee_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      frais_id INTEGER NOT NULL,
      montant_paye REAL NOT NULL,
      mode_paiement TEXT NOT NULL,
      numero_recu TEXT NOT NULL UNIQUE,
      date_paiement TEXT NOT NULL,
      enregistre_par INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eleve_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (frais_id) REFERENCES fee_schedules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categorie TEXT NOT NULL,
      libelle TEXT NOT NULL,
      montant REAL NOT NULL,
      date_depense TEXT NOT NULL,
      beneficiaire TEXT NOT NULL,
      reference TEXT,
      enregistre_par INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      categorie TEXT NOT NULL,
      quantite INTEGER NOT NULL DEFAULT 0,
      seuil_alerte INTEGER NOT NULL DEFAULT 5,
      unite TEXT NOT NULL DEFAULT 'Unité',
      emplacement TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type_mouvement TEXT NOT NULL,
      quantite INTEGER NOT NULL,
      motif TEXT NOT NULL,
      acteur_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS other_staff_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_type TEXT NOT NULL,
      titre TEXT NOT NULL,
      reference TEXT,
      details TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'actif',
      auteur_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      message TEXT NOT NULL,
      lien_module TEXT,
      est_lu INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      categorie TEXT NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin TEXT NOT NULL,
      classe_id INTEGER,
      description TEXT,
      visibilite TEXT NOT NULL DEFAULT 'personnel',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_nom TEXT NOT NULL,
      user_role TEXT NOT NULL,
      evenement TEXT NOT NULL,
      entite TEXT NOT NULL,
      entite_id TEXT,
      description TEXT NOT NULL,
      ancienne_valeur TEXT,
      nouvelle_valeur TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('calendar_events', 'visibilite', "TEXT NOT NULL DEFAULT 'personnel'");

  ensureColumn('school_settings', 'seuil_reussite', 'REAL NOT NULL DEFAULT 10');
  ensureColumn('school_settings', 'mention_tres_bien', 'REAL NOT NULL DEFAULT 16');
  ensureColumn('school_settings', 'mention_bien', 'REAL NOT NULL DEFAULT 14');
  ensureColumn('school_settings', 'mention_assez_bien', 'REAL NOT NULL DEFAULT 12');
  ensureColumn('school_settings', 'mention_passable', 'REAL NOT NULL DEFAULT 10');
  ensureColumn('school_settings', 'afficher_rang_bulletin', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('school_settings', 'afficher_moyenne_classe', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('school_settings', 'afficher_appreciation_bulletin', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('school_settings', 'autoriser_auto_inscription', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('school_settings', 'message_accueil', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('school_settings', 'couleur_accent', "TEXT NOT NULL DEFAULT 'blue'");

  ensureColumn('users', 'preferences_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('users', 'last_login_at', 'TEXT');
}
