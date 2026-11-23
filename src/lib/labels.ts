import type { AccountStatus, BulletinStatus, EvaluationType, GradeEntryStatus, TransmissionStatus, UserRole } from '../types.ts';

export const ROLE_LABELS: Record<UserRole, string> = {
  fondateur: 'Administrateur Fondateur',
  proviseur: 'Proviseur',
  censeur: 'Censeur',
  secretaire: 'Secrétariat',
  enseignant: 'Enseignant',
  surveillant: 'Surveillant',
  comptable: 'Comptable',
  economat: 'Économat',
  bibliothecaire: 'Bibliothécaire',
  informaticien: 'Informaticien',
  archiviste: 'Responsable des archives',
  medical: 'Personnel médical',
  agent_administratif: 'Agent administratif',
  eleve: 'Élève',
  parent: 'Parent',
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, { label: string; colorClass: string }> = {
  en_attente: { label: 'En attente', colorClass: 'text-amber-700 dark:text-amber-400' },
  approuve: { label: 'Approuvé', colorClass: 'text-blue-700 dark:text-blue-400' },
  actif: { label: 'Actif', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  refuse: { label: 'Refusé', colorClass: 'text-red-700 dark:text-red-400' },
  suspendu: { label: 'Suspendu', colorClass: 'text-amber-700 dark:text-amber-400' },
  desactive: { label: 'Désactivé', colorClass: 'text-slate-500 dark:text-slate-400' },
};

export const EVALUATION_TYPE_LABELS: Record<EvaluationType, string> = {
  devoir_surveille: 'Devoir surveillé',
  interrogation: 'Interrogation',
  composition: 'Composition',
  examen: 'Examen',
  pratique: 'Évaluation pratique',
};

export const GRADE_STATUS_LABELS: Record<GradeEntryStatus, string> = {
  note: 'Note saisie',
  absent_justifie: 'Absence justifiée',
  absent_non_justifie: 'Absence non justifiée',
  dispense: 'Dispensé',
  en_attente: 'Note en attente',
};

export const TRANSMISSION_STATUS_LABELS: Record<TransmissionStatus, { label: string; colorClass: string }> = {
  brouillon: { label: 'Brouillon', colorClass: 'text-slate-600 dark:text-slate-400' },
  transmis: { label: 'Transmis au secrétariat', colorClass: 'text-blue-700 dark:text-blue-400' },
  en_verification: { label: 'En vérification', colorClass: 'text-amber-700 dark:text-amber-400' },
  accepte: { label: 'Accepté', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  retourne: { label: 'Retourné', colorClass: 'text-red-700 dark:text-red-400' },
  correction_autorisee: { label: 'Correction autorisée', colorClass: 'text-amber-700 dark:text-amber-400' },
  nouvelle_transmission: { label: 'Nouvelle transmission', colorClass: 'text-blue-700 dark:text-blue-400' },
};

export const BULLETIN_STATUS_LABELS: Record<BulletinStatus, { label: string; colorClass: string }> = {
  brouillon: { label: 'Préparation secrétariat', colorClass: 'text-slate-600 dark:text-slate-400' },
  transmis_proviseur: { label: 'En attente signature proviseur', colorClass: 'text-amber-700 dark:text-amber-400' },
  signe_proviseur: { label: 'Signé proviseur · À vérifier (Censeur)', colorClass: 'text-blue-700 dark:text-blue-400' },
  retourne_proviseur: { label: 'Retourné par le proviseur', colorClass: 'text-red-700 dark:text-red-400' },
  valide_censeur: { label: 'Validé censeur', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  retourne_censeur: { label: 'Retourné par le censeur', colorClass: 'text-red-700 dark:text-red-400' },
  distribue: { label: 'Officiellement distribué', colorClass: 'text-emerald-700 dark:text-emerald-400' },
};

export const CLAIM_STATUS_LABELS: Record<string, { label: string; colorClass: string }> = {
  recue_secretariat: { label: 'Reçue au secrétariat', colorClass: 'text-slate-700 dark:text-slate-300' },
  transmise_censeur: { label: 'Transmise au censeur', colorClass: 'text-blue-700 dark:text-blue-400' },
  en_examen_censeur: { label: 'En examen (Censeur)', colorClass: 'text-amber-700 dark:text-amber-400' },
  soumise_proviseur: { label: 'Soumise au proviseur', colorClass: 'text-amber-700 dark:text-amber-400' },
  acceptee: { label: 'Acceptée', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  rejetee: { label: 'Rejetée', colorClass: 'text-red-700 dark:text-red-400' },
};

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DAYS_FR: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Lundi', short: 'Lun' },
  { value: 2, label: 'Mardi', short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi', short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi', short: 'Sam' },
];

export function getMentionInfo(
  moyenne: number | null | undefined,
  settings?: {
    seuil_reussite?: number;
    mention_tres_bien?: number;
    mention_bien?: number;
    mention_assez_bien?: number;
    mention_passable?: number;
  } | null
): { label: string; colorClass: string; passed: boolean } {
  if (moyenne === null || moyenne === undefined || Number.isNaN(moyenne)) {
    return { label: 'En attente', colorClass: 'text-slate-500 dark:text-slate-400', passed: false };
  }
  const tb = settings?.mention_tres_bien ?? 16;
  const b = settings?.mention_bien ?? 14;
  const ab = settings?.mention_assez_bien ?? 12;
  const pass = settings?.mention_passable ?? 10;
  const seuil = settings?.seuil_reussite ?? 10;

  if (moyenne >= tb) return { label: 'Très Bien · Tableau d’honneur', colorClass: 'text-emerald-700 dark:text-emerald-400', passed: moyenne >= seuil };
  if (moyenne >= b) return { label: 'Bien · Tableau d’honneur', colorClass: 'text-blue-700 dark:text-blue-400', passed: moyenne >= seuil };
  if (moyenne >= ab) return { label: 'Assez Bien', colorClass: 'text-indigo-700 dark:text-indigo-400', passed: moyenne >= seuil };
  if (moyenne >= pass) return { label: 'Passable', colorClass: 'text-slate-700 dark:text-slate-300', passed: moyenne >= seuil };
  return { label: 'Insuffisant', colorClass: 'text-red-700 dark:text-red-400', passed: false };
}

