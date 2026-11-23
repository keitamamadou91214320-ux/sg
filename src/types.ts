export type UserRole =
  | 'fondateur'
  | 'proviseur'
  | 'censeur'
  | 'secretaire'
  | 'enseignant'
  | 'surveillant'
  | 'comptable'
  | 'economat'
  | 'bibliothecaire'
  | 'informaticien'
  | 'archiviste'
  | 'medical'
  | 'agent_administratif'
  | 'eleve'
  | 'parent';

export type AccountStatus =
  | 'en_attente'
  | 'approuve'
  | 'actif'
  | 'refuse'
  | 'suspendu'
  | 'desactive';

export type OriginType = 'fondateur_initial' | 'creation_fondateur' | 'creation_proviseur' | 'auto_inscription';

export type MissingGradeRule = 'zero' | 'neutralise' | 'minimum';

export type GradeEntryStatus =
  | 'note'
  | 'absent_justifie'
  | 'absent_non_justifie'
  | 'dispense'
  | 'en_attente';

export type EvaluationType =
  | 'devoir_surveille'
  | 'interrogation'
  | 'composition'
  | 'examen'
  | 'pratique';

export type EvaluationStatus = 'brouillon' | 'programmee' | 'en_cours' | 'terminee' | 'publiee';

export type TransmissionStatus =
  | 'brouillon'
  | 'transmis'
  | 'en_verification'
  | 'accepte'
  | 'retourne'
  | 'correction_autorisee'
  | 'nouvelle_transmission';

export type BulletinStatus =
  | 'brouillon'
  | 'transmis_proviseur'
  | 'signe_proviseur'
  | 'retourne_proviseur'
  | 'valide_censeur'
  | 'retourne_censeur'
  | 'distribue';

export interface UserPreferences {
  compact_mode?: boolean;
  email_alerts?: boolean;
  calendar_default_filter?: 'tous' | 'evaluation' | 'administratif' | 'vacances';
}

export interface UserAccount {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  role: UserRole;
  statut: AccountStatus;
  origine: OriginType;
  motif_refus: string | null;
  demande_reexamen: string | null;
  permissions: string[];
  preferences?: UserPreferences;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolSettings {
  id: number;
  nom_etablissement: string;
  devise: string;
  adresse: string;
  telephone: string;
  email: string;
  logo_path: string | null;
  cachet_path: string | null;
  retention_documents_jours: number;
  retention_logs_jours: number;
  seuil_reussite: number;
  mention_tres_bien: number;
  mention_bien: number;
  mention_assez_bien: number;
  mention_passable: number;
  afficher_rang_bulletin: number;
  afficher_moyenne_classe: number;
  afficher_appreciation_bulletin: number;
  autoriser_auto_inscription: number;
  message_accueil: string;
  couleur_accent: 'blue' | 'emerald' | 'indigo' | 'amber' | 'slate';
  updated_at: string;
}

export interface AcademicYear {
  id: number;
  libelle: string;
  date_debut: string;
  date_fin: string;
  est_active: number;
  statut: 'active' | 'cloturee' | 'archivee';
  created_at: string;
}

export interface SchoolPeriod {
  id: number;
  annee_id: number;
  annee_libelle?: string;
  nom: string;
  type_decoupage: 'trimestre' | 'semestre' | 'sequence' | 'autre';
  date_debut: string;
  date_fin: string;
  statut: 'planifiee' | 'active' | 'cloturee' | 'archivee';
  ordre: number;
  created_at: string;
}

export interface SchoolClass {
  id: number;
  annee_id: number;
  nom: string;
  niveau: string;
  serie: string | null;
  regle_notes_manquantes: MissingGradeRule;
  effectif?: number;
  created_at: string;
}

export interface Subject {
  id: number;
  code: string;
  nom: string;
  created_at: string;
}

export interface ClassSubject {
  id: number;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  matiere_code?: string;
  coefficient: number;
}

export interface TeacherAssignment {
  id: number;
  enseignant_id: number;
  enseignant_nom?: string;
  enseignant_prenom?: string;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  annee_id: number;
  created_at: string;
}

export interface StudentDossier {
  id: number;
  user_id: number | null;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string;
  lieu_naissance: string | null;
  classe_id: number | null;
  classe_nom?: string | null;
  annee_id: number | null;
  telephone: string | null;
  adresse: string | null;
  parent_nom: string | null;
  parent_telephone: string | null;
  parent_email: string | null;
  photo_path: string | null;
  statut_administratif: 'inscrit' | 'transfere' | 'suspendu' | 'archive';
  est_archive: number;
  created_at: string;
  updated_at: string;
}

export interface DossierModificationRequest {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  demandeur_id: number;
  demandeur_nom?: string;
  champ: string;
  ancienne_valeur: string;
  nouvelle_valeur: string;
  motif: string;
  statut: 'en_attente' | 'approuvee' | 'refusee';
  decideur_id: number | null;
  motif_decision: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface Evaluation {
  id: number;
  annee_id: number;
  periode_id: number;
  periode_nom?: string;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  enseignant_id: number;
  enseignant_nom?: string;
  titre: string;
  type: EvaluationType;
  date_evaluation: string;
  bareme_max: number;
  regle_notes_manquantes: MissingGradeRule;
  description: string | null;
  statut: EvaluationStatus;
  transmission_statut?: TransmissionStatus | null;
  created_at: string;
}

export interface GradeRecord {
  id: number;
  evaluation_id: number;
  eleve_id: number;
  matricule?: string;
  nom?: string;
  prenom?: string;
  valeur: number | null;
  statut_note: GradeEntryStatus;
  appreciation: string | null;
  est_provisoire: number;
  version: number;
  updated_by: number;
  updated_at: string;
}

export interface GradeTransmission {
  id: number;
  evaluation_id: number;
  evaluation_titre?: string;
  classe_id?: number;
  classe_nom?: string;
  matiere_nom?: string;
  periode_nom?: string;
  bareme_max?: number;
  enseignant_id: number;
  enseignant_nom?: string;
  methode: 'saisie_directe' | 'import_excel';
  statut: TransmissionStatus;
  motif_retour: string | null;
  import_id: number | null;
  lignes_count?: number;
  transmis_at: string;
  verifie_at: string | null;
  verifie_par: number | null;
}

export interface GradeCorrectionRequest {
  id: number;
  evaluation_id: number;
  evaluation_titre?: string;
  classe_nom?: string;
  matiere_nom?: string;
  bareme_max?: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  enseignant_id: number;
  enseignant_nom?: string;
  ancienne_valeur: number | null;
  ancien_statut: GradeEntryStatus;
  nouvelle_valeur: number | null;
  nouveau_statut: GradeEntryStatus;
  motif: string;
  statut: 'soumise' | 'validee_censeur' | 'refusee_censeur' | 'autorisee_proviseur' | 'refusee_proviseur' | 'appliquee';
  censeur_id: number | null;
  censeur_commentaire: string | null;
  censeur_at: string | null;
  proviseur_id: number | null;
  proviseur_commentaire: string | null;
  proviseur_at: string | null;
  created_at: string;
}

export interface CourseMaterial {
  id: number;
  enseignant_id: number;
  enseignant_nom?: string;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  titre: string;
  chapitre: string;
  description: string | null;
  fichier_nom: string;
  fichier_path: string;
  extension: string;
  taille_octets: number;
  version: number;
  statut: 'publie' | 'brouillon' | 'archive';
  created_at: string;
  updated_at: string;
}

export interface BulletinSubjectLine {
  matiere_id: number;
  matiere_nom: string;
  coefficient: number;
  devoir_moy?: number | null;
  comp_note?: number | null;
  moyenne_sur_20: number | null;
  note_ponderee: number | null;
  th?: string;
  rang_matiere?: number | null;
  bareme_detail: string;
  appreciation: string;
}

export interface Bulletin {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_prenom?: string;
  eleve_matricule?: string;
  eleve_photo?: string | null;
  eleve_date_naissance?: string | null;
  eleve_lieu_naissance?: string | null;
  eleve_sexe?: 'M' | 'F' | null;
  retards_count?: number;
  absences_count?: number;
  classe_id: number;
  classe_nom?: string;
  annee_id: number;
  annee_libelle?: string;
  periode_id: number;
  periode_nom?: string;
  version: number;
  statut: BulletinStatus;
  moyenne_generale: number | null;
  moyenne_classe: number | null;
  meilleure_moyenne: number | null;
  plus_faible_moyenne: number | null;
  rang: number | null;
  effectif_classe: number;
  appreciation_generale: string | null;
  lignes_json: string;
  prepare_par: number;
  prepare_nom?: string;
  signe_par_proviseur: number | null;
  proviseur_nom?: string | null;
  signature_proviseur_hash: string | null;
  cachet_appose: number;
  signe_at: string | null;
  verifie_par_censeur: number | null;
  censeur_nom?: string | null;
  verifie_at: string | null;
  motif_retour: string | null;
  est_archive: number;
  created_at: string;
  updated_at: string;
}

export interface ResultClaim {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  bulletin_id: number | null;
  periode_id: number;
  periode_nom?: string;
  matiere_id: number | null;
  matiere_nom?: string;
  auteur_id: number;
  auteur_nom?: string;
  objet: string;
  description: string;
  justificatif_path: string | null;
  statut: 'recue_secretariat' | 'transmise_censeur' | 'en_examen_censeur' | 'soumise_proviseur' | 'acceptee' | 'rejetee';
  note_secretariat: string | null;
  avis_censeur: string | null;
  decision_proviseur: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  classe_nom?: string;
  date_evenement: string;
  type: 'absence' | 'retard';
  duree_minutes: number | null;
  est_justifie: number;
  justificatif: string | null;
  signale_par: number;
  created_at: string;
}

export interface DisciplineIncident {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  classe_nom?: string;
  date_incident: string;
  gravite: 'mineure' | 'moyenne' | 'grave';
  description: string;
  sanction: string | null;
  transmis_censeur: number;
  signale_par: number;
  signale_nom?: string;
  created_at: string;
}

export interface FeeSchedule {
  id: number;
  annee_id: number;
  classe_id: number | null;
  classe_nom?: string;
  libelle: string;
  montant: number;
  date_echeance: string;
  created_at: string;
}

export interface PaymentRecord {
  id: number;
  eleve_id: number;
  eleve_nom?: string;
  eleve_matricule?: string;
  classe_nom?: string;
  frais_id: number;
  frais_libelle?: string;
  montant_paye: number;
  mode_paiement: 'especes' | 'virement' | 'mobile_money' | 'cheque';
  numero_recu: string;
  date_paiement: string;
  enregistre_par: number;
  enregistre_nom?: string;
  created_at: string;
}

export interface ExpenseRecord {
  id: number;
  categorie: string;
  libelle: string;
  montant: number;
  date_depense: string;
  beneficiaire: string;
  reference: string | null;
  enregistre_par: number;
  enregistre_nom?: string;
  created_at: string;
}

export interface InventoryItem {
  id: number;
  code: string;
  designation: string;
  categorie: string;
  quantite: number;
  seuil_alerte: number;
  unite: string;
  emplacement: string | null;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  titre: string;
  message: string;
  lien_module: string | null;
  est_lu: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_nom: string;
  user_role: string;
  evenement: string;
  entite: string;
  entite_id: string | null;
  description: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  created_at: string;
}

export type CalendarEventCategory = 'evaluation' | 'conseil_classe' | 'administratif' | 'vacances' | 'autre';
export type CalendarEventGroup = 'evaluation' | 'administratif' | 'vacances';

export interface CalendarEventItem {
  id: string;
  source: 'evaluation' | 'calendar_event' | 'school_period';
  source_id: number;
  titre: string;
  categorie: CalendarEventCategory;
  type_groupe: CalendarEventGroup;
  visibilite: 'etablissement' | 'personnel';
  est_proprietaire: boolean;
  date_debut: string;
  date_fin: string;
  classe_id: number | null;
  classe_nom: string | null;
  matiere_nom: string | null;
  description: string | null;
  created_by_nom?: string | null;
  created_at: string;
}

export interface PasswordResetRequest {
  id: number;
  user_id: number;
  user_nom?: string;
  user_role?: UserRole;
  email_saisi: string;
  motif: string | null;
  statut: 'en_attente' | 'code_emis' | 'utilise' | 'refuse';
  expires_at: string | null;
  issued_by_nom?: string | null;
  created_at: string;
  resolved_at: string | null;
  used_at: string | null;
}

export interface SessionInfo {
  prefix: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface AnnouncementItem {
  id: number;
  titre: string;
  contenu: string;
  priorite: 'normale' | 'importante' | 'urgente';
  cible_role: 'tous' | 'personnel' | 'enseignants' | 'eleves_parents';
  auteur_id: number;
  auteur_nom?: string;
  auteur_role?: UserRole;
  epingle: number;
  expire_le: string | null;
  created_at: string;
}

export interface TimetableSlot {
  id: number;
  annee_id: number;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  matiere_code?: string;
  enseignant_id: number;
  enseignant_nom?: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  created_at: string;
}

export interface HomeworkAssignment {
  id: number;
  classe_id: number;
  classe_nom?: string;
  matiere_id: number;
  matiere_nom?: string;
  enseignant_id: number;
  enseignant_nom?: string;
  titre: string;
  consignes: string;
  date_limite: string;
  bareme: number | null;
  created_at: string;
}

export interface InternalMessage {
  id: number;
  sender_id: number;
  sender_nom?: string;
  sender_role?: UserRole;
  recipient_id: number;
  recipient_nom?: string;
  recipient_role?: UserRole;
  sujet: string;
  contenu: string;
  est_lu: number;
  created_at: string;
}

