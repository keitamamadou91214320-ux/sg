import type {
  AcademicYear,
  AnnouncementItem,
  AttendanceRecord,
  AuditLog,
  Bulletin,
  CalendarEventItem,
  ClassSubject,
  CourseMaterial,
  DisciplineIncident,
  DossierModificationRequest,
  Evaluation,
  ExpenseRecord,
  FeeSchedule,
  GradeCorrectionRequest,
  GradeTransmission,
  HomeworkAssignment,
  InternalMessage,
  InventoryItem,
  NotificationItem,
  PasswordResetRequest,
  PaymentRecord,
  ResultClaim,
  SchoolClass,
  SchoolPeriod,
  SchoolSettings,
  StudentDossier,
  Subject,
  TeacherAssignment,
  TimetableSlot,
  UserAccount,
  UserRole,
} from '../types.ts';

const ROLE_PERMS: Record<UserRole, string[]> = {
  fondateur: ['*'],
  proviseur: ['*'],
  censeur: ['bulletins.verify', 'grades.verify', 'academics.view'],
  secretaire: ['bulletins.prepare', 'students.manage', 'transmissions.control'],
  enseignant: ['evaluations.manage', 'grades.entry', 'materials.publish'],
  surveillant: ['surveillance.manage'],
  comptable: ['finance.manage'],
  economat: ['economat.manage'],
  bibliothecaire: ['staff.module'],
  informaticien: ['staff.module', 'password_resets.manage'],
  archiviste: ['archives.view'],
  medical: ['staff.module'],
  agent_administratif: ['students.view'],
  eleve: ['student.bulletins', 'student.results'],
  parent: ['parent.bulletins', 'parent.results'],
};

const now = '2026-11-22T09:00:00.000Z';

function makeUser(id: number, nom: string, prenom: string, email: string, role: UserRole, statut: UserAccount['statut'] = 'actif'): UserAccount {
  return {
    id,
    nom,
    prenom,
    email,
    telephone: '+223 70 00 00 00',
    role,
    statut,
    origine: 'creation_proviseur',
    motif_refus: null,
    demande_reexamen: null,
    permissions: ROLE_PERMS[role] || [],
    preferences: { compact_mode: false, email_alerts: true, calendar_default_filter: 'tous' },
    last_login_at: now,
    created_at: now,
    updated_at: now,
  };
}

const DEMO_USERS: UserAccount[] = [
  makeUser(1, 'Kamara', 'Fondateur', 'fondateur.demo@lycee-pk.demo', 'fondateur'),
  makeUser(2, 'Bah', 'Amadou', 'proviseur.demo@lycee-pk.demo', 'proviseur'),
  makeUser(3, 'Keïta', 'Fatoumata', 'censeur.demo@lycee-pk.demo', 'censeur'),
  makeUser(4, 'Coulibaly', 'Mariam', 'secretaire.demo@lycee-pk.demo', 'secretaire'),
  makeUser(5, 'Koné', 'Ibrahima', 'prof.maths@lycee-pk.demo', 'enseignant'),
  makeUser(6, 'Sow', 'Aïssatou', 'prof.lettres@lycee-pk.demo', 'enseignant'),
  makeUser(7, 'Diarra', 'Moussa', 'surveillant.demo@lycee-pk.demo', 'surveillant'),
  makeUser(8, 'Sangaré', 'Oumar', 'comptable.demo@lycee-pk.demo', 'comptable'),
  makeUser(9, 'Cissé', 'Kadiatou', 'economat.demo@lycee-pk.demo', 'economat'),
  makeUser(10, 'Touré', 'Boubacar', 'biblio.demo@lycee-pk.demo', 'bibliothecaire'),
  makeUser(11, 'Sidibé', 'Cheick', 'it.demo@lycee-pk.demo', 'informaticien'),
  makeUser(12, 'Camara', 'Aminata', 'archiviste.demo@lycee-pk.demo', 'archiviste'),
  makeUser(13, 'Kouyaté', 'Salif', 'medical.demo@lycee-pk.demo', 'medical'),
  makeUser(14, 'Traoré', 'Aminata', 'eleve.demo@lycee-pk.demo', 'eleve'),
  makeUser(15, 'Traoré', 'Mamadou', 'parent.demo@lycee-pk.demo', 'parent'),
  makeUser(16, 'Maïga', 'Hawa', 'hawa.maiga@lycee-pk.demo', 'eleve', 'en_attente'),
  makeUser(17, 'Fofana', 'Bakary', 'bakary.fofana@lycee-pk.demo', 'parent', 'en_attente'),
];

const state = {
  currentUser: null as UserAccount | null,
  settings: {
    id: 1,
    nom_etablissement: 'LYCÉE PROSPER KAMARA',
    devise: 'Excellence · Discipline · Réussite',
    adresse: 'Avenue Prosper Kamara, Quartier Administratif, Bamako',
    telephone: '+223 20 22 45 80',
    email: 'direction@lycee-prosper-kamara.edu',
    logo_path: null,
    cachet_path: null,
    retention_documents_jours: 1825,
    retention_logs_jours: 1095,
    seuil_reussite: 10,
    mention_tres_bien: 16,
    mention_bien: 14,
    mention_assez_bien: 12,
    mention_passable: 10,
    afficher_rang_bulletin: 1,
    afficher_moyenne_classe: 1,
    afficher_appreciation_bulletin: 1,
    autoriser_auto_inscription: 1,
    message_accueil: 'Bienvenue sur le portail scolaire officiel du Lycée Prosper Kamara — Année scolaire 2026-2027.',
    couleur_accent: 'blue',
    updated_at: now,
  } as SchoolSettings,
  years: [
    { id: 1, libelle: '2026-2027', date_debut: '2026-09-14', date_fin: '2027-06-30', est_active: 1, statut: 'active', created_at: now },
  ] as AcademicYear[],
  periods: [
    { id: 1, annee_id: 1, annee_libelle: '2026-2027', nom: 'Trimestre 1', type_decoupage: 'trimestre', date_debut: '2026-09-14', date_fin: '2026-12-18', statut: 'active', ordre: 1, created_at: now },
    { id: 2, annee_id: 1, annee_libelle: '2026-2027', nom: 'Trimestre 2', type_decoupage: 'trimestre', date_debut: '2027-01-04', date_fin: '2027-03-26', statut: 'planifiee', ordre: 2, created_at: now },
    { id: 3, annee_id: 1, annee_libelle: '2026-2027', nom: 'Trimestre 3', type_decoupage: 'trimestre', date_debut: '2027-04-05', date_fin: '2027-06-25', statut: 'planifiee', ordre: 3, created_at: now },
  ] as SchoolPeriod[],
  classes: [
    { id: 1, annee_id: 1, nom: 'Terminale S1', niveau: 'Terminale', serie: 'S1', regle_notes_manquantes: 'neutralise', effectif: 5, created_at: now },
    { id: 2, annee_id: 1, nom: 'Première L2', niveau: 'Première', serie: 'L2', regle_notes_manquantes: 'neutralise', effectif: 2, created_at: now },
    { id: 3, annee_id: 1, nom: 'Seconde A', niveau: 'Seconde', serie: 'A', regle_notes_manquantes: 'zero', effectif: 1, created_at: now },
  ] as SchoolClass[],
  subjects: [
    { id: 1, code: 'MATH', nom: 'Mathématiques', created_at: now },
    { id: 2, code: 'PHYS', nom: 'Physique-Chimie', created_at: now },
    { id: 3, code: 'SVT', nom: 'Sciences de la Vie et de la Terre', created_at: now },
    { id: 4, code: 'FRAN', nom: 'Français', created_at: now },
    { id: 5, code: 'PHIL', nom: 'Philosophie', created_at: now },
    { id: 6, code: 'HIST', nom: 'Histoire-Géographie', created_at: now },
    { id: 7, code: 'ANGL', nom: 'Anglais', created_at: now },
    { id: 8, code: 'INFO', nom: 'Informatique', created_at: now },
  ] as Subject[],
  classSubjects: [
    { id: 1, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', matiere_code: 'MATH', coefficient: 5 },
    { id: 2, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 2, matiere_nom: 'Physique-Chimie', matiere_code: 'PHYS', coefficient: 5 },
    { id: 3, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 3, matiere_nom: 'Sciences de la Vie et de la Terre', matiere_code: 'SVT', coefficient: 4 },
    { id: 4, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 4, matiere_nom: 'Français', matiere_code: 'FRAN', coefficient: 3 },
    { id: 5, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 5, matiere_nom: 'Philosophie', matiere_code: 'PHIL', coefficient: 2 },
    { id: 6, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 7, matiere_nom: 'Anglais', matiere_code: 'ANGL', coefficient: 2 },
    { id: 7, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 8, matiere_nom: 'Informatique', matiere_code: 'INFO', coefficient: 2 },
  ] as ClassSubject[],
  assignments: [
    { id: 1, enseignant_id: 5, enseignant_nom: 'Koné', enseignant_prenom: 'Ibrahima', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', annee_id: 1, created_at: now },
    { id: 2, enseignant_id: 5, enseignant_nom: 'Koné', enseignant_prenom: 'Ibrahima', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 2, matiere_nom: 'Physique-Chimie', annee_id: 1, created_at: now },
    { id: 3, enseignant_id: 6, enseignant_nom: 'Sow', enseignant_prenom: 'Aïssatou', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 4, matiere_nom: 'Français', annee_id: 1, created_at: now },
  ] as TeacherAssignment[],
  students: [
    { id: 1, user_id: 14, matricule: 'PK-2026-001', nom: 'Traoré', prenom: 'Aminata', sexe: 'F', date_naissance: '2008-04-14', lieu_naissance: 'Bamako', classe_id: 1, classe_nom: 'Terminale S1', annee_id: 1, telephone: '+223 75 44 10 01', adresse: 'Hamdallaye ACI 2000', parent_nom: 'Mamadou Traoré', parent_telephone: '+223 66 44 10 00', parent_email: 'parent.demo@lycee-pk.demo', photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 2, user_id: null, matricule: 'PK-2026-002', nom: 'Diallo', prenom: 'Seydou', sexe: 'M', date_naissance: '2008-09-21', lieu_naissance: 'Ségou', classe_id: 1, classe_nom: 'Terminale S1', annee_id: 1, telephone: '+223 74 30 11 02', adresse: 'Badalabougou', parent_nom: 'Seydou Diallo', parent_telephone: '+223 65 30 11 00', parent_email: null, photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 3, user_id: null, matricule: 'PK-2026-003', nom: 'Konaté', prenom: 'Ousmane', sexe: 'M', date_naissance: '2007-11-03', lieu_naissance: 'Sikasso', classe_id: 1, classe_nom: 'Terminale S1', annee_id: 1, telephone: '+223 78 21 33 04', adresse: 'Kalaban Coura', parent_nom: 'Bintou Konaté', parent_telephone: '+223 66 21 33 00', parent_email: null, photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 4, user_id: null, matricule: 'PK-2026-004', nom: 'Sissoko', prenom: 'Djénéba', sexe: 'F', date_naissance: '2008-01-19', lieu_naissance: 'Kayes', classe_id: 1, classe_nom: 'Terminale S1', annee_id: 1, telephone: '+223 79 12 45 05', adresse: 'Lafiabougou', parent_nom: 'Modibo Sissoko', parent_telephone: '+223 65 12 45 00', parent_email: null, photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 5, user_id: null, matricule: 'PK-2026-005', nom: 'Doumbia', prenom: 'Moussa', sexe: 'M', date_naissance: '2008-07-28', lieu_naissance: 'Mopti', classe_id: 1, classe_nom: 'Terminale S1', annee_id: 1, telephone: '+223 71 09 87 06', adresse: 'Magnambougou', parent_nom: 'Adama Doumbia', parent_telephone: '+223 64 09 87 00', parent_email: null, photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 6, user_id: null, matricule: 'PK-2026-006', nom: 'Dembélé', prenom: 'Kadiatou', sexe: 'F', date_naissance: '2009-02-11', lieu_naissance: 'Koutiala', classe_id: 2, classe_nom: 'Première L2', annee_id: 1, telephone: '+223 72 55 18 07', adresse: 'Sabalibougou', parent_nom: 'Souleymane Dembélé', parent_telephone: '+223 67 55 18 00', parent_email: null, photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
    { id: 7, user_id: null, matricule: 'PK-2026-007', nom: 'Kébé', prenom: 'Fanta', sexe: 'F', date_naissance: '2009-06-05', lieu_naissance: 'Bamako', classe_id: 2, classe_nom: 'Première L2', annee_id: 1, telephone: '+223 73 41 22 08', adresse: 'Niamakoro', parent_nom: 'Mamadou Traoré', parent_telephone: '+223 66 44 10 00', parent_email: 'parent.demo@lycee-pk.demo', photo_path: null, statut_administratif: 'inscrit', est_archive: 0, created_at: now, updated_at: now },
  ] as StudentDossier[],
  bulletins: [
    {
      id: 1,
      eleve_id: 1,
      eleve_nom: 'Traoré',
      eleve_prenom: 'Aminata',
      eleve_matricule: 'PK-2026-001',
      eleve_photo: null,
      eleve_date_naissance: '2008-04-14',
      eleve_lieu_naissance: 'Bamako',
      eleve_sexe: 'F',
      retards_count: 0,
      absences_count: 0,
      classe_id: 1,
      classe_nom: 'Terminale S1',
      annee_id: 1,
      annee_libelle: '2026-2027',
      periode_id: 1,
      periode_nom: 'Trimestre 1',
      version: 1,
      statut: 'distribue',
      moyenne_generale: 17.09,
      moyenne_classe: 13.49,
      meilleure_moyenne: 17.09,
      plus_faible_moyenne: 9.76,
      rang: 1,
      effectif_classe: 5,
      appreciation_generale: 'Félicitations du conseil pour votre sérieux et votre régularité.',
      lignes_json: JSON.stringify([
        { matiere_id: 1, matiere_nom: 'Mathématiques', coefficient: 5, devoir_moy: 17.5, comp_note: 18, moyenne_sur_20: 17.75, note_ponderee: 88.75, th: 'TH', rang_matiere: 1, bareme_detail: '17.5/20 · 18/20', appreciation: 'Très Bon Travail' },
        { matiere_id: 2, matiere_nom: 'Physique-Chimie', coefficient: 5, devoir_moy: 16.5, comp_note: 17, moyenne_sur_20: 16.75, note_ponderee: 83.75, th: 'TH', rang_matiere: 1, bareme_detail: '16.5/20 · 34/40', appreciation: 'Très Bon Travail' },
        { matiere_id: 3, matiere_nom: 'Sciences de la Vie et de la Terre', coefficient: 4, devoir_moy: 16, comp_note: 17.5, moyenne_sur_20: 16.75, note_ponderee: 67, th: 'TH', rang_matiere: 1, bareme_detail: '16/20 · 17.5/20', appreciation: 'Très Bon Travail' },
        { matiere_id: 4, matiere_nom: 'Français', coefficient: 3, devoir_moy: 15.5, comp_note: 16, moyenne_sur_20: 15.75, note_ponderee: 47.25, th: 'TH', rang_matiere: 1, bareme_detail: '15.5/20 · 16/20', appreciation: 'Très Bon Travail' },
        { matiere_id: 5, matiere_nom: 'Philosophie', coefficient: 2, devoir_moy: 15.5, comp_note: 16.5, moyenne_sur_20: 16, note_ponderee: 32, th: 'TH', rang_matiere: 1, bareme_detail: '15.5/20 · 16.5/20', appreciation: 'Bon Travail' },
        { matiere_id: 7, matiere_nom: 'Anglais', coefficient: 2, devoir_moy: 18, comp_note: 18, moyenne_sur_20: 18, note_ponderee: 36, th: 'TH', rang_matiere: 1, bareme_detail: '9/10 · 18/20', appreciation: 'Excellent travail' },
        { matiere_id: 8, matiere_nom: 'Informatique', coefficient: 2, devoir_moy: 18.5, comp_note: 19, moyenne_sur_20: 18.75, note_ponderee: 37.5, th: 'TH', rang_matiere: 1, bareme_detail: '18.5/20 · 19/20', appreciation: 'Excellent travail' },
      ]),
      prepare_par: 4,
      prepare_nom: 'Mariam Coulibaly',
      signe_par_proviseur: 2,
      proviseur_nom: 'Amadou Bah',
      signature_proviseur_hash: '8E42B91F0C77A112',
      cachet_appose: 1,
      signe_at: now,
      verifie_par_censeur: 3,
      censeur_nom: 'Fatoumata Keïta',
      verifie_at: now,
      motif_retour: null,
      est_archive: 0,
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      eleve_id: 2,
      eleve_nom: 'Diallo',
      eleve_prenom: 'Seydou',
      eleve_matricule: 'PK-2026-002',
      eleve_photo: null,
      eleve_date_naissance: '2008-09-21',
      eleve_lieu_naissance: 'Ségou',
      eleve_sexe: 'M',
      retards_count: 1,
      absences_count: 0,
      classe_id: 1,
      classe_nom: 'Terminale S1',
      annee_id: 1,
      annee_libelle: '2026-2027',
      periode_id: 1,
      periode_nom: 'Trimestre 1',
      version: 1,
      statut: 'distribue',
      moyenne_generale: 15.02,
      moyenne_classe: 13.49,
      meilleure_moyenne: 17.09,
      plus_faible_moyenne: 9.76,
      rang: 2,
      effectif_classe: 5,
      appreciation_generale: 'Bon trimestre d’ensemble. Poursuivez vos efforts.',
      lignes_json: JSON.stringify([
        { matiere_id: 1, matiere_nom: 'Mathématiques', coefficient: 5, devoir_moy: 15, comp_note: 16, moyenne_sur_20: 15.5, note_ponderee: 77.5, th: 'TH', rang_matiere: 2, bareme_detail: '15/20 · 16/20', appreciation: 'Bon Travail' },
        { matiere_id: 2, matiere_nom: 'Physique-Chimie', coefficient: 5, devoir_moy: 14.5, comp_note: 15.5, moyenne_sur_20: 15, note_ponderee: 75, th: 'TH', rang_matiere: 2, bareme_detail: '14.5/20 · 31/40', appreciation: 'Bon Travail' },
        { matiere_id: 3, matiere_nom: 'Sciences de la Vie et de la Terre', coefficient: 4, devoir_moy: 14, comp_note: 15, moyenne_sur_20: 14.5, note_ponderee: 58, th: 'TH', rang_matiere: 2, bareme_detail: '14/20 · 15/20', appreciation: 'Bon Travail' },
        { matiere_id: 4, matiere_nom: 'Français', coefficient: 3, devoir_moy: 14, comp_note: 14.5, moyenne_sur_20: 14.25, note_ponderee: 42.75, th: 'TH', rang_matiere: 2, bareme_detail: '14/20 · 14.5/20', appreciation: 'Bon Travail' },
        { matiere_id: 5, matiere_nom: 'Philosophie', coefficient: 2, devoir_moy: 13.5, comp_note: 14, moyenne_sur_20: 13.75, note_ponderee: 27.5, th: 'TH', rang_matiere: 2, bareme_detail: '13.5/20 · 14/20', appreciation: 'Assez bien' },
        { matiere_id: 7, matiere_nom: 'Anglais', coefficient: 2, devoir_moy: 15, comp_note: 15.5, moyenne_sur_20: 15.25, note_ponderee: 30.5, th: 'TH', rang_matiere: 2, bareme_detail: '7.5/10 · 15.5/20', appreciation: 'Bon Travail' },
        { matiere_id: 8, matiere_nom: 'Informatique', coefficient: 2, devoir_moy: 16.5, comp_note: 17, moyenne_sur_20: 16.75, note_ponderee: 33.5, th: 'TH', rang_matiere: 2, bareme_detail: '16.5/20 · 17/20', appreciation: 'Très Bon Travail' },
      ]),
      prepare_par: 4,
      prepare_nom: 'Mariam Coulibaly',
      signe_par_proviseur: 2,
      proviseur_nom: 'Amadou Bah',
      signature_proviseur_hash: '7A33E01D4F12C902',
      cachet_appose: 1,
      signe_at: now,
      verifie_par_censeur: 3,
      censeur_nom: 'Fatoumata Keïta',
      verifie_at: now,
      motif_retour: null,
      est_archive: 0,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      eleve_id: 5,
      eleve_nom: 'Doumbia',
      eleve_prenom: 'Moussa',
      eleve_matricule: 'PK-2026-005',
      eleve_photo: null,
      eleve_date_naissance: '2008-07-28',
      eleve_lieu_naissance: 'Mopti',
      eleve_sexe: 'M',
      retards_count: 2,
      absences_count: 1,
      classe_id: 1,
      classe_nom: 'Terminale S1',
      annee_id: 1,
      annee_libelle: '2026-2027',
      periode_id: 1,
      periode_nom: 'Trimestre 1',
      version: 1,
      statut: 'transmis_proviseur',
      moyenne_generale: 9.76,
      moyenne_classe: 13.49,
      meilleure_moyenne: 17.09,
      plus_faible_moyenne: 9.76,
      rang: 5,
      effectif_classe: 5,
      appreciation_generale: 'Ensemble un peu juste en sciences. Doit redoubler d’efforts.',
      lignes_json: JSON.stringify([
        { matiere_id: 1, matiere_nom: 'Mathématiques', coefficient: 5, devoir_moy: 8.5, comp_note: 9.5, moyenne_sur_20: 9, note_ponderee: 45, th: '', rang_matiere: 5, bareme_detail: '8.5/20 · 9.5/20', appreciation: 'Insuffisant' },
        { matiere_id: 2, matiere_nom: 'Physique-Chimie', coefficient: 5, devoir_moy: 8.5, comp_note: 9.5, moyenne_sur_20: 9, note_ponderee: 45, th: '', rang_matiere: 5, bareme_detail: '8.5/20 · 19/40', appreciation: 'Insuffisant' },
        { matiere_id: 3, matiere_nom: 'Sciences de la Vie et de la Terre', coefficient: 4, devoir_moy: 10, comp_note: 9, moyenne_sur_20: 9.5, note_ponderee: 38, th: '', rang_matiere: 5, bareme_detail: '10/20 · 9/20', appreciation: 'Insuffisant' },
        { matiere_id: 4, matiere_nom: 'Français', coefficient: 3, devoir_moy: 10, comp_note: 10.5, moyenne_sur_20: 10.25, note_ponderee: 30.75, th: '', rang_matiere: 5, bareme_detail: '10/20 · 10.5/20', appreciation: 'Passable' },
        { matiere_id: 5, matiere_nom: 'Philosophie', coefficient: 2, devoir_moy: 9.5, comp_note: 10, moyenne_sur_20: 9.75, note_ponderee: 19.5, th: '', rang_matiere: 5, bareme_detail: '9.5/20 · 10/20', appreciation: 'Insuffisant' },
        { matiere_id: 7, matiere_nom: 'Anglais', coefficient: 2, devoir_moy: 11, comp_note: 11, moyenne_sur_20: 11, note_ponderee: 22, th: '', rang_matiere: 5, bareme_detail: '5.5/10 · 11/20', appreciation: 'Passable' },
        { matiere_id: 8, matiere_nom: 'Informatique', coefficient: 2, devoir_moy: 12, comp_note: 11.5, moyenne_sur_20: 11.75, note_ponderee: 23.5, th: '', rang_matiere: 5, bareme_detail: '12/20 · 11.5/20', appreciation: 'Passable' },
      ]),
      prepare_par: 4,
      prepare_nom: 'Mariam Coulibaly',
      signe_par_proviseur: null,
      proviseur_nom: null,
      signature_proviseur_hash: null,
      cachet_appose: 0,
      signe_at: null,
      verifie_par_censeur: null,
      censeur_nom: null,
      verifie_at: null,
      motif_retour: null,
      est_archive: 0,
      created_at: now,
      updated_at: now,
    },
  ] as Bulletin[],
  evaluations: [
    { id: 1, annee_id: 1, periode_id: 1, periode_nom: 'Trimestre 1', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', titre: 'Devoir n°1 · Nombres complexes & Suites', type: 'devoir_surveille', date_evaluation: '2026-10-16', bareme_max: 20, regle_notes_manquantes: 'neutralise', description: 'Épreuve écrite de 2h.', statut: 'publiee', transmission_statut: 'accepte', created_at: now },
    { id: 2, annee_id: 1, periode_id: 1, periode_nom: 'Trimestre 1', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 2, matiere_nom: 'Physique-Chimie', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', titre: 'Composition Physique-Chimie', type: 'composition', date_evaluation: '2026-11-04', bareme_max: 40, regle_notes_manquantes: 'neutralise', description: 'Composition sur 40 points.', statut: 'publiee', transmission_statut: 'accepte', created_at: now },
    { id: 3, annee_id: 1, periode_id: 1, periode_nom: 'Trimestre 1', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 7, matiere_nom: 'Anglais', enseignant_id: 6, enseignant_nom: 'Aïssatou Sow', titre: 'Interrogation écrite · Comprehension', type: 'interrogation', date_evaluation: '2026-11-10', bareme_max: 10, regle_notes_manquantes: 'neutralise', description: 'Évaluation rapide sur 10.', statut: 'publiee', transmission_statut: 'accepte', created_at: now },
  ] as Evaluation[],
  transmissions: [
    { id: 1, evaluation_id: 1, evaluation_titre: 'Devoir n°1 · Nombres complexes & Suites', classe_id: 1, classe_nom: 'Terminale S1', matiere_nom: 'Mathématiques', periode_nom: 'Trimestre 1', bareme_max: 20, enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', methode: 'saisie_directe', statut: 'accepte', motif_retour: null, import_id: null, lignes_count: 5, transmis_at: now, verifie_at: now, verifie_par: 4 },
  ] as GradeTransmission[],
  correctionRequests: [
    { id: 1, evaluation_id: 1, evaluation_titre: 'Devoir n°1 · Nombres complexes', classe_nom: 'Terminale S1', matiere_nom: 'Mathématiques', bareme_max: 20, eleve_id: 3, eleve_nom: 'Ousmane Konaté', eleve_matricule: 'PK-2026-003', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', ancienne_valeur: 13, ancien_statut: 'note', nouvelle_valeur: 14, nouveau_statut: 'note', motif: 'Erreur de report sur exercice 2.', statut: 'soumise', censeur_id: null, censeur_commentaire: null, censeur_at: null, proviseur_id: null, proviseur_commentaire: null, proviseur_at: null, created_at: now },
  ] as GradeCorrectionRequest[],
  calendarEvents: [
    { id: 'cal-1', source: 'calendar_event', source_id: 1, titre: 'Conseils de classe · Trimestre 1', categorie: 'conseil_classe', type_groupe: 'administratif', visibilite: 'etablissement', est_proprietaire: false, date_debut: '2026-12-07', date_fin: '2026-12-12', classe_id: null, classe_nom: null, matiere_nom: null, description: 'Conseils de classe de fin du 1er trimestre.', created_by_nom: 'Amadou Bah', created_at: now },
    { id: 'cal-2', source: 'calendar_event', source_id: 2, titre: 'Remise officielle des bulletins', categorie: 'administratif', type_groupe: 'administratif', visibilite: 'etablissement', est_proprietaire: false, date_debut: '2026-12-15', date_fin: '2026-12-16', classe_id: null, classe_nom: null, matiere_nom: null, description: 'Publication officielle des bulletins validés.', created_by_nom: 'Amadou Bah', created_at: now },
    { id: 'cal-3', source: 'calendar_event', source_id: 3, titre: 'Congés de Noël', categorie: 'vacances', type_groupe: 'vacances', visibilite: 'etablissement', est_proprietaire: false, date_debut: '2026-12-19', date_fin: '2027-01-03', classe_id: null, classe_nom: null, matiere_nom: null, description: 'Vacances de fin de premier trimestre.', created_by_nom: 'Amadou Bah', created_at: now },
  ] as CalendarEventItem[],
  timetable: [
    { id: 1, annee_id: 1, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', matiere_code: 'MATH', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', jour_semaine: 1, heure_debut: '08:00', heure_fin: '10:00', salle: 'Salle S1', created_at: now },
    { id: 2, annee_id: 1, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 2, matiere_nom: 'Physique-Chimie', matiere_code: 'PHYS', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', jour_semaine: 2, heure_debut: '08:00', heure_fin: '10:00', salle: 'Labo Physique', created_at: now },
    { id: 3, annee_id: 1, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 4, matiere_nom: 'Français', matiere_code: 'FRAN', enseignant_id: 6, enseignant_nom: 'Aïssatou Sow', jour_semaine: 3, heure_debut: '10:15', heure_fin: '12:15', salle: 'Salle S1', created_at: now },
  ] as TimetableSlot[],
  homework: [
    { id: 1, classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', titre: 'Exercices sur les suites récurrentes', consignes: 'Traiter les exercices 4, 7 et 9 du recueil.', date_limite: '2026-11-28', bareme: 20, created_at: now },
  ] as HomeworkAssignment[],
  announcements: [
    { id: 1, titre: 'Calendrier des conseils de classe Trimestre 1', contenu: 'Les conseils de classe se tiendront du 7 au 12 décembre 2026 en salle des professeurs.', priorite: 'importante', cible_role: 'tous', auteur_id: 2, auteur_nom: 'Amadou Bah', auteur_role: 'proviseur', epingle: 1, expire_le: null, created_at: now },
  ] as AnnouncementItem[],
  messages: [
    { id: 1, sender_id: 4, sender_nom: 'Mariam Coulibaly', sender_role: 'secretaire', recipient_id: 2, recipient_nom: 'Amadou Bah', recipient_role: 'proviseur', sujet: 'Point d’avancement des bulletins Terminale S1', contenu: 'Monsieur le Proviseur, un lot de bulletins est prêt pour votre signature.', est_lu: 0, created_at: now },
  ] as InternalMessage[],
  attendance: [
    { id: 1, eleve_id: 2, eleve_nom: 'Seydou Diallo', eleve_matricule: 'PK-2026-002', classe_nom: 'Terminale S1', date_evenement: '2026-11-10', type: 'retard', duree_minutes: 15, est_justifie: 1, justificatif: 'Motif familial', signale_par: 7, created_at: now },
  ] as AttendanceRecord[],
  incidents: [] as DisciplineIncident[],
  fees: [
    { id: 1, annee_id: 1, classe_id: 1, classe_nom: 'Terminale S1', libelle: 'Scolarité Annuelle Terminale S1', montant: 185000, date_echeance: '2026-12-15', created_at: now },
  ] as FeeSchedule[],
  payments: [
    { id: 1, eleve_id: 1, eleve_nom: 'Aminata Traoré', eleve_matricule: 'PK-2026-001', classe_nom: 'Terminale S1', frais_id: 1, frais_libelle: 'Scolarité Annuelle Terminale S1', montant_paye: 185000, mode_paiement: 'virement', numero_recu: 'REC-2026-0001', date_paiement: '2026-10-05', enregistre_par: 8, enregistre_nom: 'Oumar Sangaré', created_at: now },
  ] as PaymentRecord[],
  expenses: [
    { id: 1, categorie: 'Fournitures', libelle: 'Acquisition rames papier A4 & encres', montant: 95000, date_depense: '2026-11-02', beneficiaire: 'Papeterie du Mali', reference: 'FACT-2026-14', enregistre_par: 8, enregistre_nom: 'Oumar Sangaré', created_at: now },
  ] as ExpenseRecord[],
  inventory: [
    { id: 1, code: 'ECO-PAP-A4', designation: 'Rames de papier A4 80g', categorie: 'Papeterie', quantite: 18, seuil_alerte: 20, unite: 'rames', emplacement: 'Magasin A', updated_at: now },
    { id: 2, code: 'ECO-CRAIE', designation: 'Boîtes de craie blanche', categorie: 'Fournitures classe', quantite: 45, seuil_alerte: 15, unite: 'boîtes', emplacement: 'Magasin A', updated_at: now },
  ] as InventoryItem[],
  notifications: [
    { id: 1, user_id: 2, titre: 'Mode Démonstration GitHub Pages', message: 'Vous consultez l’aperçu interactif complet avec données de démonstration.', lien_module: 'dashboard', est_lu: 0, created_at: now },
  ] as NotificationItem[],
  claims: [
    { id: 1, eleve_id: 2, eleve_nom: 'Seydou Diallo', eleve_matricule: 'PK-2026-002', bulletin_id: 2, periode_id: 1, periode_nom: 'Trimestre 1', matiere_id: 2, matiere_nom: 'Physique-Chimie', auteur_id: 15, auteur_nom: 'Mamadou Traoré', objet: 'Vérification du coefficient de Physique', description: 'Merci de confirmer le coefficient 5 en Terminale S1.', justificatif_path: null, statut: 'transmise_censeur', note_secretariat: 'Dossier vérifié et transmis.', avis_censeur: null, decision_proviseur: null, created_at: now, updated_at: now },
  ] as ResultClaim[],
  materials: [
    { id: 1, enseignant_id: 5, enseignant_nom: 'Ibrahima Koné', classe_id: 1, classe_nom: 'Terminale S1', matiere_id: 1, matiere_nom: 'Mathématiques', titre: 'Cours Nombres Complexes & Suites', chapitre: 'Chapitre 1', description: 'Support de cours complet.', fichier_nom: 'cours_nombres_complexes.pdf', fichier_path: '', extension: '.pdf', taille_octets: 24500, version: 1, statut: 'publie', created_at: now, updated_at: now },
  ] as CourseMaterial[],
  auditLogs: [
    { id: 1, user_id: 2, user_nom: 'Amadou Bah', user_role: 'proviseur', evenement: 'Bulletin', entite: 'Bulletin', entite_id: '1', description: 'Signature numérique et apposition du cachet officiel sur le bulletin #1.', ancienne_valeur: null, nouvelle_valeur: null, created_at: now },
  ] as AuditLog[],
  modRequests: [] as DossierModificationRequest[],
  passwordResets: [] as PasswordResetRequest[],
};

export function handleStaticDemoRequest<T = unknown>(url: string, options: RequestInit = {}): T {
  const method = (options.method || 'GET').toUpperCase();
  const path = url.split('?')[0];
  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  if (path === '/api/public/showcase') {
    return {
      settings: state.settings,
      activeYear: { libelle: state.years[0].libelle, date_debut: state.years[0].date_debut, date_fin: state.years[0].date_fin },
      classes: state.classes.map((c) => ({ id: c.id, nom: c.nom, niveau: c.niveau, serie: c.serie })),
      subjects: state.subjects.map((s) => ({ code: s.code, nom: s.nom })),
      announcements: state.announcements.map((a) => ({
        id: a.id,
        titre: a.titre,
        contenu: a.contenu,
        priorite: a.priorite,
        created_at: a.created_at,
      })),
      calendarEvents: state.calendarEvents.map((e) => ({
        id: e.source_id,
        titre: e.titre,
        categorie: e.categorie,
        date_debut: e.date_debut,
        date_fin: e.date_fin,
        description: e.description,
      })),
      stats: {
        classesCount: state.classes.length,
        subjectsCount: state.subjects.length,
        studentsCount: state.students.length,
      },
    } as T;
  }

  if (path === '/api/public/contact' && method === 'POST') {
    return {
      message:
        'Votre demande d’information a bien été enregistrée (aperçu de démonstration). Le secrétariat répond sous 24h ouvrées.',
    } as T;
  }

  if (path === '/api/auth/status') {
    return {
      initialized: true,
      settings: state.settings,
      demoAccounts: DEMO_USERS.filter((u) => u.statut === 'actif' && u.role !== 'fondateur').map((u) => ({
        email: u.email,
        role: u.role,
        nom: `${u.prenom} ${u.nom}`,
      })),
    } as T;
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email);
    if (!user || password !== 'Demo2026!') {
      throw new Error('Identifiants invalides (en mode démonstration, utilisez Demo2026!).');
    }
    state.currentUser = user;
    return { token: `static-demo-token-${user.id}`, user } as T;
  }

  if (path === '/api/auth/logout') {
    state.currentUser = null;
    return { ok: true } as T;
  }

  if (path === '/api/auth/sessions') {
    return { sessions: [{ prefix: 'demo-static', created_at: now, expires_at: '2026-12-31T23:59:59Z', is_current: true }] } as T;
  }

  if (path === '/api/settings') {
    if (method === 'PATCH' || method === 'PUT') {
      state.settings = { ...state.settings, ...body, updated_at: new Date().toISOString() } as SchoolSettings;
    }
    return { settings: state.settings } as T;
  }

  if (path === '/api/notifications') {
    return { notifications: state.notifications } as T;
  }
  if (path.endsWith('/read') && path.startsWith('/api/notifications/')) {
    const id = Number(path.split('/')[3]);
    state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, est_lu: 1 } : n));
    return { ok: true } as T;
  }
  if (path === '/api/notifications/read-all') {
    state.notifications = state.notifications.map((n) => ({ ...n, est_lu: 1 }));
    return { ok: true } as T;
  }

  if (path === '/api/dashboard') {
    return {
      activeYear: state.years[0],
      activePeriod: state.periods[0],
      counts: {
        eleves: state.students.length,
        classes: state.classes.length,
        evaluations: state.evaluations.length,
        utilisateurs_actifs: DEMO_USERS.filter((u) => u.statut === 'actif').length,
        comptes_en_attente: 2,
        bulletins_distribues: state.bulletins.filter((b) => b.statut === 'distribue').length,
        bulletins_a_signer: state.bulletins.filter((b) => b.statut === 'transmis_proviseur').length,
        bulletins_a_verifier: state.bulletins.filter((b) => b.statut === 'signe_proviseur').length,
        transmissions_en_attente: 1,
        corrections_en_attente: state.correctionRequests.length,
        reclamations_ouvertes: state.claims.length,
        stock_alerte: state.inventory.filter((i) => i.quantite <= i.seuil_alerte).length,
      },
      finance: {
        totalEncaisse: state.payments.reduce((a, p) => a + p.montant_paye, 0),
        totalDepenses: state.expenses.reduce((a, e) => a + e.montant, 0),
      },
      classDistribution: state.classes.map((c) => ({ nom: c.nom, effectif: c.effectif || 0 })),
      recentLogs: state.auditLogs,
      todayTimetable: state.timetable,
      recentAnnouncements: state.announcements,
    } as T;
  }

  if (path === '/api/bulletins') {
    const role = state.currentUser?.role;
    let list = state.bulletins;
    if (role === 'eleve') list = list.filter((b) => b.eleve_id === 1 && b.statut === 'distribue');
    if (role === 'parent') list = list.filter((b) => b.eleve_id === 1 && b.statut === 'distribue');
    return { bulletins: list } as T;
  }
  if (path.startsWith('/api/bulletins/') && path.endsWith('/versions')) {
    return {
      versions: [{ id: 1, version: 1, statut: 'distribue', acteur_nom: 'Amadou Bah', motif: 'Signature et publication', created_at: now }],
    } as T;
  }
  if (path.startsWith('/api/bulletins/') && method === 'PATCH') {
    const id = Number(path.split('/')[3]);
    state.bulletins = state.bulletins.map((b) =>
      b.id === id ? { ...b, appreciation_generale: String(body.appreciation_generale ?? b.appreciation_generale) } : b
    );
    return { bulletin: state.bulletins.find((b) => b.id === id) } as T;
  }
  if (path.startsWith('/api/bulletins/') && path.endsWith('/proviseur-decision')) {
    const id = Number(path.split('/')[3]);
    state.bulletins = state.bulletins.map((b) =>
      b.id === id
        ? {
            ...b,
            statut: body.decision === 'signer' ? 'signe_proviseur' : 'retourne_proviseur',
            cachet_appose: body.decision === 'signer' ? 1 : 0,
            proviseur_nom: body.decision === 'signer' ? 'Amadou Bah' : null,
            signature_proviseur_hash: body.decision === 'signer' ? 'DEMO19F8A0023C44' : null,
          }
        : b
    );
    return { ok: true } as T;
  }
  if (path.startsWith('/api/bulletins/') && path.endsWith('/censeur-decision')) {
    const id = Number(path.split('/')[3]);
    state.bulletins = state.bulletins.map((b) =>
      b.id === id
        ? {
            ...b,
            statut: body.decision === 'distribuer' ? 'distribue' : 'retourne_censeur',
            censeur_nom: 'Fatoumata Keïta',
          }
        : b
    );
    return { ok: true } as T;
  }

  if (path === '/api/analytics/class-summary') {
    return {
      effectif_classe: 5,
      effectif_evalue: 5,
      moyenne_classe: 13.49,
      meilleure_moyenne: 17.09,
      plus_faible_moyenne: 9.76,
      taux_reussite: 80,
      seuil_reussite: 10,
      honorRoll: [
        { eleve_id: 1, matricule: 'PK-2026-001', nom: 'Traoré', prenom: 'Aminata', moyenne_generale: 17.09, rang: 1 },
        { eleve_id: 2, matricule: 'PK-2026-002', nom: 'Diallo', prenom: 'Seydou', moyenne_generale: 15.02, rang: 2 },
      ],
    } as T;
  }

  if (path === '/api/calendar') {
    if (method === 'POST') {
      const item: CalendarEventItem = {
        id: `cal-${Date.now()}`,
        source: 'calendar_event',
        source_id: Date.now(),
        titre: String(body.titre || 'Événement'),
        categorie: (body.categorie as CalendarEventItem['categorie']) || 'administratif',
        type_groupe: body.categorie === 'vacances' ? 'vacances' : body.categorie === 'evaluation' ? 'evaluation' : 'administratif',
        visibilite: state.currentUser?.role === 'proviseur' ? 'etablissement' : 'personnel',
        est_proprietaire: true,
        date_debut: String(body.date_debut || '2026-11-25'),
        date_fin: String(body.date_fin || body.date_debut || '2026-11-25'),
        classe_id: null,
        classe_nom: null,
        matiere_nom: null,
        description: body.description ? String(body.description) : null,
        created_by_nom: state.currentUser ? `${state.currentUser.prenom} ${state.currentUser.nom}` : 'Demo',
        created_at: new Date().toISOString(),
      };
      state.calendarEvents.push(item);
      return { event: item } as T;
    }
    return { events: state.calendarEvents, classes: state.classes.map((c) => ({ id: c.id, nom: c.nom })) } as T;
  }

  if (path === '/api/users') return { users: DEMO_USERS } as T;
  if (path === '/api/academic-years') return { years: state.years } as T;
  if (path === '/api/periods') return { periods: state.periods } as T;
  if (path === '/api/classes') return { classes: state.classes } as T;
  if (path === '/api/subjects') return { subjects: state.subjects, classSubjects: state.classSubjects } as T;
  if (path === '/api/assignments') return { assignments: state.assignments } as T;
  if (path === '/api/students') return { students: state.students } as T;
  if (path === '/api/student-modification-requests') return { requests: state.modRequests } as T;
  if (path === '/api/evaluations') return { evaluations: state.evaluations } as T;
  if (path === '/api/transmissions') return { transmissions: state.transmissions } as T;
  if (path === '/api/grade-corrections') return { requests: state.correctionRequests, history: [] } as T;
  if (path === '/api/materials') return { materials: state.materials } as T;
  if (path === '/api/claims') return { claims: state.claims } as T;
  if (path === '/api/timetable') return { slots: state.timetable } as T;
  if (path === '/api/homework') return { homework: state.homework } as T;
  if (path === '/api/announcements') return { announcements: state.announcements } as T;
  if (path === '/api/messages') return { inbox: state.messages, sent: state.messages } as T;
  if (path === '/api/messages/recipients') {
    return { recipients: DEMO_USERS.filter((u) => u.statut === 'actif').map((u) => ({ id: u.id, nom: u.nom, prenom: u.prenom, role: u.role })) } as T;
  }
  if (path === '/api/surveillance') return { attendance: state.attendance, incidents: state.incidents } as T;
  if (path === '/api/finance') return { fees: state.fees, payments: state.payments, expenses: state.expenses, unpaid: [] } as T;
  if (path === '/api/economat') return { items: state.inventory, movements: [] } as T;
  if (path === '/api/staff-records') return { records: [] } as T;
  if (path === '/api/password-resets') return { requests: state.passwordResets } as T;
  if (path === '/api/archives') return { archivedStudents: [], archivedBulletins: [] } as T;
  if (path === '/api/audit-logs') return { logs: state.auditLogs } as T;

  return { ok: true } as T;
}
