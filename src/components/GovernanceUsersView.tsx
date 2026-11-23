import React, { useEffect, useState } from 'react';
import { Copy, Download, KeyRound, Shield, Upload, UserCheck, UserX } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { ACCOUNT_STATUS_LABELS, ROLE_LABELS, formatDateTimeFr } from '../lib/labels.ts';
import type { AuditLog, PasswordResetRequest, SchoolSettings, UserAccount, UserRole } from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface GovernanceUsersViewProps {
  mode: 'governance_users' | 'inscriptions' | 'settings' | 'audit';
  currentUser: UserAccount;
  settings: SchoolSettings | null;
  searchQuery: string;
  onSettingsUpdated: () => void;
}

const ALL_CREATABLE_STAFF_ROLES: UserRole[] = [
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

const PERMISSION_CATALOG = [
  { key: 'users.manage_staff', label: 'Gestion comptes personnel' },
  { key: 'users.manage_registrations', label: 'Validation inscriptions' },
  { key: 'academic.periods', label: 'Périodes scolaires' },
  { key: 'academic.classes', label: 'Classes & coefficients' },
  { key: 'dossiers.create', label: 'Création dossiers élèves' },
  { key: 'dossiers.edit_ordinary', label: 'Modification infos courantes' },
  { key: 'grades.receive', label: 'Réception & contrôle notes' },
  { key: 'grades.entry_assigned', label: 'Saisie notes affectées' },
  { key: 'grades.import_excel', label: 'Importation Excel' },
  { key: 'bulletins.prepare', label: 'Préparation bulletins' },
  { key: 'bulletins.sign', label: 'Signature & cachet bulletins' },
  { key: 'bulletins.verify', label: 'Vérification & distribution' },
  { key: 'discipline.manage', label: 'Absences & discipline' },
  { key: 'finance.payments', label: 'Paiements & reçus' },
  { key: 'finance.expenses', label: 'Dépenses & rapports' },
  { key: 'economat.inventory', label: 'Gestion stocks économat' },
  { key: 'archives.manage', label: 'Gestion archives' },
];

export const GovernanceUsersView: React.FC<GovernanceUsersViewProps> = ({
  mode,
  currentUser,
  settings,
  searchQuery,
  onSettingsUpdated,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [issuedCodeBanner, setIssuedCodeBanner] = useState<{ code: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create account form
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(currentUser.role === 'fondateur' ? 'proviseur' : 'enseignant');
  const [linkMatricule, setLinkMatricule] = useState('');

  // Refusal / approval modal state
  const [decisionTarget, setDecisionTarget] = useState<UserAccount | null>(null);
  const [refusalMotif, setRefusalMotif] = useState('');
  const [approvalMatricule, setApprovalMatricule] = useState('');

  // Permissions editor modal
  const [permTarget, setPermTarget] = useState<UserAccount | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Settings form
  const [nomEtab, setNomEtab] = useState(settings?.nom_etablissement || '');
  const [devise, setDevise] = useState(settings?.devise || '');
  const [adresse, setAdresse] = useState(settings?.adresse || '');
  const [telEtab, setTelEtab] = useState(settings?.telephone || '');
  const [emailEtab, setEmailEtab] = useState(settings?.email || '');
  const [retDocs, setRetDocs] = useState(settings?.retention_documents_jours ?? 365);
  const [retLogs, setRetLogs] = useState(settings?.retention_logs_jours ?? 730);
  const [seuilReussite, setSeuilReussite] = useState(settings?.seuil_reussite ?? 10);
  const [mentionTB, setMentionTB] = useState(settings?.mention_tres_bien ?? 16);
  const [mentionB, setMentionB] = useState(settings?.mention_bien ?? 14);
  const [mentionAB, setMentionAB] = useState(settings?.mention_assez_bien ?? 12);
  const [mentionP, setMentionP] = useState(settings?.mention_passable ?? 10);
  const [showRank, setShowRank] = useState(settings?.afficher_rang_bulletin !== 0);
  const [showClassAvg, setShowClassAvg] = useState(settings?.afficher_moyenne_classe !== 0);
  const [showApprec, setShowApprec] = useState(settings?.afficher_appreciation_bulletin !== 0);
  const [allowSelfReg, setAllowSelfReg] = useState(settings?.autoriser_auto_inscription !== 0);
  const [messageAccueil, setMessageAccueil] = useState(settings?.message_accueil || '');
  const [couleurAccent, setCouleurAccent] = useState<'blue' | 'emerald' | 'indigo' | 'amber' | 'slate'>(
    settings?.couleur_accent || 'blue'
  );

  const loadData = async () => {
    setLoading(true);
    try {
      if (mode === 'governance_users' || mode === 'inscriptions') {
        const [res, prRes] = await Promise.all([
          apiFetch<{ users: UserAccount[] }>('/api/users'),
          ['fondateur', 'proviseur', 'informaticien'].includes(currentUser.role)
            ? apiFetch<{ requests: PasswordResetRequest[] }>('/api/password-resets')
            : Promise.resolve({ requests: [] }),
        ]);
        setUsers(res.users);
        setResetRequests(prRes.requests);
      }
      if (mode === 'audit') {
        const res = await apiFetch<{ logs: AuditLog[] }>('/api/audit-logs?limit=250');
        setLogs(res.logs);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  useEffect(() => {
    if (settings) {
      setNomEtab(settings.nom_etablissement);
      setDevise(settings.devise);
      setAdresse(settings.adresse);
      setTelEtab(settings.telephone);
      setEmailEtab(settings.email);
      setRetDocs(settings.retention_documents_jours);
      setRetLogs(settings.retention_logs_jours);
      setSeuilReussite(settings.seuil_reussite ?? 10);
      setMentionTB(settings.mention_tres_bien ?? 16);
      setMentionB(settings.mention_bien ?? 14);
      setMentionAB(settings.mention_assez_bien ?? 12);
      setMentionP(settings.mention_passable ?? 10);
      setShowRank(settings.afficher_rang_bulletin !== 0);
      setShowClassAvg(settings.afficher_moyenne_classe !== 0);
      setShowApprec(settings.afficher_appreciation_bulletin !== 0);
      setAllowSelfReg(settings.autoriser_auto_inscription !== 0);
      setMessageAccueil(settings.message_accueil || '');
      setCouleurAccent(settings.couleur_accent || 'blue');
    }
  }, [settings]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          nom,
          prenom,
          email,
          telephone,
          password,
          role,
          eleve_matricule: linkMatricule || undefined,
        }),
      });
      setFeedback(`Compte créé et activé pour ${prenom} ${nom} (${ROLE_LABELS[role]}).`);
      setNom('');
      setPrenom('');
      setEmail('');
      setTelephone('');
      setPassword('');
      setLinkMatricule('');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleSuspend = async (u: UserAccount) => {
    setError(null);
    const nextStatut = u.statut === 'suspendu' ? 'actif' : 'suspendu';
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: nextStatut }),
      });
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleApproveRegistration = async (u: UserAccount, matricule?: string) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: 'actif', link_matricule: matricule }),
      });
      setDecisionTarget(null);
      setApprovalMatricule('');
      setFeedback(`Compte de ${u.prenom} ${u.nom} approuvé et activé.`);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRefuseRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionTarget) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${decisionTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: 'refuse', motif_refus: refusalMotif }),
      });
      setDecisionTarget(null);
      setRefusalMotif('');
      setFeedback('Demande refusée avec motif enregistré.');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSavePermissions = async () => {
    if (!permTarget) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${permTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: selectedPerms }),
      });
      setPermTarget(null);
      setFeedback('Permissions mises à jour côté serveur.');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleIssueResetCode = async (reqItem: PasswordResetRequest) => {
    setError(null);
    setIssuedCodeBanner(null);
    try {
      const res = await apiFetch<{ code: string; expires_at: string }>(`/api/password-resets/${reqItem.id}/issue`, {
        method: 'POST',
      });
      setIssuedCodeBanner({ code: res.code, email: reqItem.email_saisi });
      setFeedback(`Code temporaire émis pour ${reqItem.email_saisi} (valable 24h).`);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRefuseReset = async (reqId: number) => {
    setError(null);
    try {
      await apiFetch(`/api/password-resets/${reqId}/refuse`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          nom_etablissement: nomEtab,
          devise,
          adresse,
          telephone: telEtab,
          email: emailEtab,
          retention_documents_jours: Number(retDocs),
          retention_logs_jours: Number(retLogs),
          seuil_reussite: Number(seuilReussite),
          mention_tres_bien: Number(mentionTB),
          mention_bien: Number(mentionB),
          mention_assez_bien: Number(mentionAB),
          mention_passable: Number(mentionP),
          afficher_rang_bulletin: showRank ? 1 : 0,
          afficher_moyenne_classe: showClassAvg ? 1 : 0,
          afficher_appreciation_bulletin: showApprec ? 1 : 0,
          autoriser_auto_inscription: allowSelfReg ? 1 : 0,
          message_accueil: messageAccueil,
          couleur_accent: couleurAccent,
        }),
      });
      setFeedback('Paramètres généraux et pédagogiques enregistrés.');
      onSettingsUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUploadAsset = async (kind: 'logo' | 'cachet', file: File) => {
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiFetch(`/api/settings/upload/${kind}`, { method: 'POST', body: fd });
      setFeedback(`${kind === 'logo' ? 'Logo officiel' : 'Cachet officiel'} mis à jour.`);
      onSettingsUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const dump = await apiFetch<Record<string, unknown>>('/api/platform/backup');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sauvegarde_prosper_kamara_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = searchQuery.trim().toLowerCase();

  if (mode === 'settings') {
    const isFondateur = currentUser.role === 'fondateur';
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Paramètres de l’établissement & Personnalisation
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isFondateur
                ? 'Autorité technique complète de l’Administrateur Fondateur : identité, barèmes de mentions, bulletins et sauvegardes'
                : 'Paramètres pédagogiques, mentions de réussite et message d’accueil du lycée'}
            </p>
          </div>
          {isFondateur && (
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium flex items-center gap-2 hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Exporter une sauvegarde JSON</span>
            </button>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="settings"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
          >
            <div className="space-y-4">
              <h2 className="font-display font-semibold text-base">Identité & Portail d’accueil</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Nom de l’établissement</label>
                  <input
                    disabled={!isFondateur}
                    value={nomEtab}
                    onChange={(e) => setNomEtab(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Devise officielle</label>
                  <input
                    value={devise}
                    onChange={(e) => setDevise(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Adresse</label>
                  <input
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Téléphone</label>
                  <input
                    value={telEtab}
                    onChange={(e) => setTelEtab(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">E-mail officiel</label>
                  <input
                    value={emailEtab}
                    onChange={(e) => setEmailEtab(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Couleur d’accentuation</label>
                  <select
                    value={couleurAccent}
                    onChange={(e) =>
                      setCouleurAccent(e.target.value as 'blue' | 'emerald' | 'indigo' | 'amber' | 'slate')
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="blue">Bleu académique</option>
                    <option value="indigo">Indigo institutionnel</option>
                    <option value="emerald">Émeraude</option>
                    <option value="amber">Or / Ambre</option>
                    <option value="slate">Ardoise sobre</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Bandeau d’information affiché sur la page d’accueil / connexion
                </label>
                <input
                  value={messageAccueil}
                  onChange={(e) => setMessageAccueil(e.target.value)}
                  placeholder="Ex. Rentrée scolaire 2026–2027 · Dépôt des dossiers ouvert au secrétariat"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="font-display font-semibold text-base">
                Règles de réussite, mentions & bulletins officiels
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Seuil réussite</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={seuilReussite}
                    onChange={(e) => setSeuilReussite(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Très Bien (≥)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={mentionTB}
                    onChange={(e) => setMentionTB(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Bien (≥)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={mentionB}
                    onChange={(e) => setMentionB(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Assez Bien (≥)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={mentionAB}
                    onChange={(e) => setMentionAB(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Passable (≥)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={mentionP}
                    onChange={(e) => setMentionP(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input type="checkbox" checked={showRank} onChange={(e) => setShowRank(e.target.checked)} />
                  <span>Afficher le rang de l’élève sur les bulletins PDF</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showClassAvg}
                    onChange={(e) => setShowClassAvg(e.target.checked)}
                  />
                  <span>Afficher la moyenne, min et max de classe</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input type="checkbox" checked={showApprec} onChange={(e) => setShowApprec(e.target.checked)} />
                  <span>Afficher l’appréciation générale sur le bulletin</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSelfReg}
                    onChange={(e) => setAllowSelfReg(e.target.checked)}
                  />
                  <span>Autoriser l’auto-inscription en ligne (Élève / Parent)</span>
                </label>
              </div>
            </div>

            {isFondateur && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="font-display font-semibold text-base">Conservation technique (Décision n°14)</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Conservation autres documents (jours)</label>
                    <input
                      type="number"
                      min={30}
                      value={retDocs}
                      onChange={(e) => setRetDocs(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Conservation journaux techniques (jours)</label>
                    <input
                      type="number"
                      min={90}
                      value={retLogs}
                      onChange={(e) => setRetLogs(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Conformément à la Décision n°14, les dossiers scolaires et bulletins officiels bénéficient d’une
                  conservation durable sans suppression automatique.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
            >
              Enregistrer tous les paramètres
            </button>
          </form>

          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 h-fit">
            <h2 className="font-display font-semibold text-base">Logo & Cachet officiel</h2>
            {!isFondateur && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Le téléversement du logo et du cachet officiel est réservé à l’Administrateur Fondateur.
              </p>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium">Logo de l’établissement (accueil & bulletins)</p>
              {isFondateur && (
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-4 h-4" />
                  <span>Téléverser un logo (.png / .jpg)</span>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUploadAsset('logo', e.target.files[0])}
                  />
                </label>
              )}
              {settings?.logo_path ? (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Logo officiel configuré</p>
              ) : (
                <p className="text-[11px] text-slate-400">Aucun logo téléversé</p>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-medium">Cachet / Tampon officiel du lycée</p>
              {isFondateur && (
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-4 h-4" />
                  <span>Téléverser le cachet (.png)</span>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUploadAsset('cachet', e.target.files[0])}
                  />
                </label>
              )}
              {settings?.cachet_path ? (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Cachet officiel configuré</p>
              ) : (
                <p className="text-[11px] text-slate-400">Aucun cachet téléversé</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'audit') {
    const filteredLogs = logs.filter(
      (l) =>
        !q ||
        l.description.toLowerCase().includes(q) ||
        l.user_nom.toLowerCase().includes(q) ||
        l.evenement.toLowerCase().includes(q)
    );
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Journal complet & Audit</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Historique immuable : qui a fait quoi, sur quel élément et à quel moment (PDF §13)
          </p>
        </div>

        <SchoolCalendar
          user={currentUser}
          space="audit"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">Aucune trace disponible.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 font-semibold">Date & Heure</th>
                    <th className="py-3 px-4 font-semibold">Auteur</th>
                    <th className="py-3 px-4 font-semibold">Événement</th>
                    <th className="py-3 px-4 font-semibold">Élément</th>
                    <th className="py-3 px-4 font-semibold">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 tabular-nums whitespace-nowrap text-slate-500">{formatDateTimeFr(l.created_at)}</td>
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">
                        {l.user_nom} · <span className="text-slate-500">{l.user_role}</span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">{l.evenement}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {l.entite} {l.entite_id ? `#${l.entite_id}` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{l.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'inscriptions') {
    const selfRegs = users.filter((u) => u.origine === 'auto_inscription');
    const filtered = selfRegs.filter(
      (u) => !q || `${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(q)
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Inscriptions autonomes & Demandes de réexamen
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Validation des comptes élèves et parents auto-inscrits (refus avec motif obligatoire et réexamen traçable)
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="inscriptions"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Aucune demande d’auto-inscription enregistrée pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 font-semibold">Demandeur</th>
                    <th className="py-3 px-4 font-semibold">Rôle</th>
                    <th className="py-3 px-4 font-semibold">Statut</th>
                    <th className="py-3 px-4 font-semibold">Informations / Motif</th>
                    <th className="py-3 px-4 font-semibold text-right">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((u) => {
                    const st = ACCOUNT_STATUS_LABELS[u.statut];
                    return (
                      <tr key={u.id}>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {u.prenom} {u.nom}
                          </p>
                          <p className="text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-3 px-4">{ROLE_LABELS[u.role]}</td>
                        <td className={`py-3 px-4 font-medium ${st.colorClass}`}>{st.label}</td>
                        <td className="py-3 px-4 space-y-1">
                          {u.motif_refus && <p className="text-red-700 dark:text-red-400">Refus : {u.motif_refus}</p>}
                          {u.demande_reexamen && (
                            <p className="text-blue-700 dark:text-blue-400">Complément : {u.demande_reexamen}</p>
                          )}
                          {!u.motif_refus && !u.demande_reexamen && <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          {(u.statut === 'en_attente' || (u.statut === 'refuse' && u.demande_reexamen)) && (
                            <>
                              <button
                                type="button"
                                onClick={() => setDecisionTarget(u)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white font-medium hover:bg-slate-800"
                              >
                                Examiner
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {decisionTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
              <h2 className="font-display font-semibold text-base">
                Décision pour {decisionTarget.prenom} {decisionTarget.nom}
              </h2>
              <p className="text-xs text-slate-500">
                Rôle demandé : {ROLE_LABELS[decisionTarget.role]} · {decisionTarget.email}
              </p>

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-medium">
                  Rattacher à un matricule élève existant (optionnel)
                </label>
                <input
                  value={approvalMatricule}
                  onChange={(e) => setApprovalMatricule(e.target.value)}
                  placeholder="Ex. PK-2026-001"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => handleApproveRegistration(decisionTarget, approvalMatricule)}
                  className="w-full py-2 px-4 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-600 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Accepter et activer le compte</span>
                </button>
              </div>

              <form onSubmit={handleRefuseRegistration} className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-medium text-red-700 dark:text-red-400">
                  Ou refuser la demande (motif obligatoire)
                </label>
                <textarea
                  required
                  rows={2}
                  value={refusalMotif}
                  onChange={(e) => setRefusalMotif(e.target.value)}
                  placeholder="Indiquez le motif officiel du refus..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setDecisionTarget(null)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-600 flex items-center gap-1.5"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Refuser</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Password Reset Requests Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                Demandes de réinitialisation de mot de passe ({resetRequests.length})
              </h2>
            </div>
          </div>

          {issuedCodeBanner && (
            <div className="m-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-200">
                  Code temporaire à usage unique généré pour {issuedCodeBanner.email} :
                </p>
                <p className="font-mono text-base font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                  {issuedCodeBanner.code}
                </p>
                <p className="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5">
                  Transmettez ce code de manière sécurisée au demandeur. Il est valable 24 heures et ne sera plus affiché.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(issuedCodeBanner.code)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-xs font-medium flex items-center gap-1.5 shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </button>
            </div>
          )}

          {resetRequests.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Aucune demande de réinitialisation de mot de passe pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-semibold">Utilisateur</th>
                    <th className="py-2.5 px-4 font-semibold">Motif</th>
                    <th className="py-2.5 px-4 font-semibold">Statut</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {resetRequests.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{r.user_nom}</p>
                        <p className="text-slate-500">{r.email_saisi} · {r.user_role ? ROLE_LABELS[r.user_role] : ''}</p>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.motif || '—'}</td>
                      <td className="py-2.5 px-4 font-medium">
                        {r.statut === 'en_attente' && <span className="text-amber-700 dark:text-amber-400">En attente</span>}
                        {r.statut === 'code_emis' && <span className="text-blue-700 dark:text-blue-400">Code émis (24h)</span>}
                        {r.statut === 'utilise' && <span className="text-emerald-700 dark:text-emerald-400">Utilisé</span>}
                        {r.statut === 'refuse' && <span className="text-red-700 dark:text-red-400">Refusé</span>}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums text-slate-500">{formatDateTimeFr(r.created_at)}</td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                        {(r.statut === 'en_attente' || r.statut === 'code_emis') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleIssueResetCode(r)}
                              className="px-2.5 py-1 rounded bg-slate-900 dark:bg-blue-700 text-white font-medium hover:bg-slate-800"
                            >
                              {r.statut === 'code_emis' ? 'Réémettre code' : 'Émettre un code'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRefuseReset(r.id)}
                              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400"
                            >
                              Refuser
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // mode === 'governance_users'
  const creatableRoles: UserRole[] =
    currentUser.role === 'fondateur'
      ? ['proviseur']
      : [...ALL_CREATABLE_STAFF_ROLES, 'eleve', 'parent'];

  const filteredUsers = users.filter(
    (u) => !q || `${u.nom} ${u.prenom} ${u.email} ${ROLE_LABELS[u.role]}`.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {currentUser.role === 'fondateur'
            ? 'Gouvernance & Création du Proviseur'
            : 'Gestion du personnel, comptes & permissions'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {currentUser.role === 'fondateur'
            ? 'Le fondateur nomme le proviseur et supervise tous les comptes. Aucun autre fondateur ne peut être créé.'
            : 'Les comptes créés par le proviseur sont activés immédiatement sans approbation supplémentaire (PDF §4.2 & Décision n°16).'}
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="governance_users"
        defaultFilter="administratif"
        collapsible
        defaultExpanded={false}
      />

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Creation form */}
        <form
          onSubmit={handleCreateAccount}
          className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
        >
          <h2 className="font-display font-semibold text-base">
            {currentUser.role === 'fondateur' ? 'Nommer le Proviseur' : 'Créer un compte personnel / usager'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Nom</label>
              <input
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Prénom</label>
              <input
                required
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Adresse e-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Téléphone</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fonction / Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {creatableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {(role === 'parent' || role === 'eleve') && (
            <div>
              <label className="block text-xs font-medium mb-1">Matricule élève associé (optionnel)</label>
              <input
                value={linkMatricule}
                onChange={(e) => setLinkMatricule(e.target.value)}
                placeholder="Ex. PK-2026-001"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Mot de passe initial (8 car. min.)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
          >
            Créer et activer le compte
          </button>
        </form>

        {/* Users table */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-xs text-slate-500">Chargement...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Aucun compte enregistré.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 font-semibold">Utilisateur</th>
                    <th className="py-3 px-4 font-semibold">Rôle</th>
                    <th className="py-3 px-4 font-semibold">Statut</th>
                    <th className="py-3 px-4 font-semibold">Origine</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const st = ACCOUNT_STATUS_LABELS[u.statut];
                    const isProtectedFondateur = u.role === 'fondateur';
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {u.prenom} {u.nom}
                          </p>
                          <p className="text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">{ROLE_LABELS[u.role]}</td>
                        <td className={`py-2.5 px-4 font-medium whitespace-nowrap ${st.colorClass}`}>{st.label}</td>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{u.origine}</td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                          {isProtectedFondateur ? (
                            <span className="text-[11px] text-slate-400">Autorité suprême protégée</span>
                          ) : (
                            <>
                              {currentUser.role === 'proviseur' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPermTarget(u);
                                    setSelectedPerms(u.permissions || []);
                                  }}
                                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  Permissions
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleSuspend(u)}
                                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {u.statut === 'suspendu' ? 'Réactiver' : 'Suspendre'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Permissions Modal (Décision n°16) */}
      {permTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-base">
                Permissions de {permTarget.prenom} {permTarget.nom}
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto py-2">
              {PERMISSION_CATALOG.map((p) => {
                const checked = selectedPerms.includes(p.key);
                return (
                  <label key={p.key} className="flex items-center gap-2 text-xs p-2 rounded border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedPerms(
                          checked ? selectedPerms.filter((k) => k !== p.key) : [...selectedPerms, p.key]
                        )
                      }
                    />
                    <span>{p.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPermTarget(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium"
              >
                Enregistrer les permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
