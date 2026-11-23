import React, { useEffect, useState } from 'react';
import { Award, BarChart3, CheckCircle2, Download, Eye, History, Printer, RotateCcw, Send } from 'lucide-react';
import { apiFetch, downloadCsv, fetchProtectedImageDataUrl, generateBulletinPdf } from '../lib/api.ts';
import { BULLETIN_STATUS_LABELS, CLAIM_STATUS_LABELS, formatDateTimeFr, getMentionInfo } from '../lib/labels.ts';
import type {
  Bulletin,
  BulletinSubjectLine,
  ResultClaim,
  SchoolClass,
  SchoolPeriod,
  SchoolSettings,
  StudentDossier,
  Subject,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';
import { OfficialBulletinSheet } from './OfficialBulletinSheet.tsx';

interface BulletinsAndResultsViewProps {
  mode: 'bulletins' | 'results' | 'claims';
  currentUser: UserAccount;
  settings: SchoolSettings | null;
  searchQuery: string;
}

export const BulletinsAndResultsView: React.FC<BulletinsAndResultsViewProps> = ({
  mode,
  currentUser,
  settings,
  searchQuery,
}) => {
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [periods, setPeriods] = useState<SchoolPeriod[]>([]);
  const [students, setStudents] = useState<StudentDossier[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [claims, setClaims] = useState<ResultClaim[]>([]);

  const [selectedClasse, setSelectedClasse] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Bulletin preview / edit / return modals
  const [inspectBulletin, setInspectBulletin] = useState<Bulletin | null>(null);
  const [inspectPhotoUrl, setInspectPhotoUrl] = useState<string | null>(null);
  const [inspectLogoUrl, setInspectLogoUrl] = useState<string | null>(null);
  const [inspectStampUrl, setInspectStampUrl] = useState<string | null>(null);
  const [inspectVersions, setInspectVersions] = useState<
    { id: number; version: number; statut: string; acteur_nom: string; motif: string | null; created_at: string }[]
  >([]);
  const [editAppreciation, setEditAppreciation] = useState('');
  const [returnBulletin, setReturnBulletin] = useState<{ id: number; actor: 'proviseur' | 'censeur' } | null>(null);
  const [returnMotif, setReturnMotif] = useState('');

  // Claim form (Student/Parent) & Claim decision modal
  const [claimStudentId, setClaimStudentId] = useState(0);
  const [claimPeriodId, setClaimPeriodId] = useState(0);
  const [claimSubjectId, setClaimSubjectId] = useState(0);
  const [claimObjet, setClaimObjet] = useState('');
  const [claimDescription, setClaimDescription] = useState('');
  const [claimModal, setClaimModal] = useState<{ id: number; statut: string; title: string } | null>(null);
  const [claimComment, setClaimComment] = useState('');

  // Class period analytics & honor roll
  const [classSummary, setClassSummary] = useState<{
    effectif_classe: number;
    effectif_evalue: number;
    moyenne_classe: number | null;
    meilleure_moyenne: number | null;
    plus_faible_moyenne: number | null;
    taux_reussite: number | null;
    seuil_reussite: number;
    honorRoll: { eleve_id: number; matricule: string; nom: string; prenom: string; moyenne_generale: number | null; rang: number | null }[];
  } | null>(null);

  const loadAll = async () => {
    try {
      const [bRes, cRes, pRes, sRes, subRes] = await Promise.all([
        apiFetch<{ bulletins: Bulletin[] }>('/api/bulletins'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ periods: SchoolPeriod[] }>('/api/periods'),
        apiFetch<{ students: StudentDossier[] }>('/api/students'),
        apiFetch<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setBulletins(bRes.bulletins);
      setClasses(cRes.classes);
      setPeriods(pRes.periods);
      setStudents(sRes.students);
      setSubjects(subRes.subjects);

      if (cRes.classes[0]) setSelectedClasse((p) => p || cRes.classes[0].id);
      const activePeriod = pRes.periods.find((p) => p.statut === 'active') || pRes.periods[0];
      if (activePeriod) {
        setSelectedPeriod((p) => p || activePeriod.id);
        setClaimPeriodId((p) => p || activePeriod.id);
      }
      if (sRes.students[0]) setClaimStudentId((p) => p || sRes.students[0].id);

      if (mode === 'claims') {
        const clRes = await apiFetch<{ claims: ResultClaim[] }>('/api/claims');
        setClaims(clRes.claims);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [mode]);

  useEffect(() => {
    if (
      mode === 'claims' ||
      !selectedClasse ||
      !selectedPeriod ||
      ['eleve', 'parent'].includes(currentUser.role)
    ) {
      setClassSummary(null);
      return;
    }
    apiFetch<{
      effectif_classe: number;
      effectif_evalue: number;
      moyenne_classe: number | null;
      meilleure_moyenne: number | null;
      plus_faible_moyenne: number | null;
      taux_reussite: number | null;
      seuil_reussite: number;
      honorRoll: { eleve_id: number; matricule: string; nom: string; prenom: string; moyenne_generale: number | null; rang: number | null }[];
    }>(`/api/analytics/class-summary?classe_id=${selectedClasse}&periode_id=${selectedPeriod}`)
      .then((res) => setClassSummary(res))
      .catch(() => setClassSummary(null));
  }, [mode, selectedClasse, selectedPeriod, currentUser.role, bulletins.length]);

  const openBulletinModal = async (b: Bulletin) => {
    setInspectBulletin(b);
    setEditAppreciation(b.appreciation_generale || '');
    setInspectPhotoUrl(null);
    setInspectLogoUrl(null);
    setInspectStampUrl(null);
    const [photoUrl, logoUrl, stampUrl, vRes] = await Promise.all([
      fetchProtectedImageDataUrl(b.eleve_photo),
      fetchProtectedImageDataUrl(settings?.logo_path),
      fetchProtectedImageDataUrl(settings?.cachet_path),
      apiFetch<{
        versions: { id: number; version: number; statut: string; acteur_nom: string; motif: string | null; created_at: string }[];
      }>(`/api/bulletins/${b.id}/versions`),
    ]);
    setInspectPhotoUrl(photoUrl);
    setInspectLogoUrl(logoUrl);
    setInspectStampUrl(stampUrl);
    setInspectVersions(vRes.versions);
  };

  const handlePrepareBulletins = async () => {
    if (!selectedClasse || !selectedPeriod) {
      setError('Sélectionnez une classe et une période scolaire.');
      return;
    }
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{ preparedCount: number }>('/api/bulletins/prepare', {
        method: 'POST',
        body: JSON.stringify({ classe_id: selectedClasse, periode_id: selectedPeriod }),
      });
      setFeedback(`${res.preparedCount} bulletin(s) calculé(s) et préparé(s) pour la classe.`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveAppreciation = async () => {
    if (!inspectBulletin) return;
    try {
      await apiFetch(`/api/bulletins/${inspectBulletin.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ appreciation_generale: editAppreciation }),
      });
      setFeedback('Appréciation enregistrée.');
      await loadAll();
      setInspectBulletin({ ...inspectBulletin, appreciation_generale: editAppreciation });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleTransmitProviseur = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/bulletins/${id}/transmit-proviseur`, { method: 'POST' });
      setFeedback('Bulletin transmis au proviseur pour signature et cachet.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleProviseurSign = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/bulletins/${id}/proviseur-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'signer' }),
      });
      setFeedback('Bulletin signé numériquement, cachet officiel apposé, transmis au censeur.');
      setInspectBulletin(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCenseurDistribute = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/bulletins/${id}/censeur-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'distribuer' }),
      });
      setFeedback('Bulletin vérifié et officiellement distribué aux élèves et parents.');
      setInspectBulletin(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnBulletin) return;
    setError(null);
    try {
      const endpoint =
        returnBulletin.actor === 'proviseur'
          ? `/api/bulletins/${returnBulletin.id}/proviseur-decision`
          : `/api/bulletins/${returnBulletin.id}/censeur-decision`;
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ decision: 'retourner', motif_retour: returnMotif }),
      });
      setReturnBulletin(null);
      setReturnMotif('');
      setInspectBulletin(null);
      setFeedback('Bulletin retourné au secrétariat avec motif.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/claims', {
        method: 'POST',
        body: JSON.stringify({
          eleve_id: claimStudentId,
          periode_id: claimPeriodId,
          matiere_id: claimSubjectId || null,
          objet: claimObjet,
          description: claimDescription,
        }),
      });
      setClaimObjet('');
      setClaimDescription('');
      setFeedback('Votre réclamation a été déposée auprès du secrétariat.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirmProcessClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModal) return;
    setError(null);
    try {
      await apiFetch(`/api/claims/${claimModal.id}/process`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: claimModal.statut, commentaire: claimComment.trim() }),
      });
      setClaimModal(null);
      setClaimComment('');
      setFeedback('Décision enregistrée sur la réclamation.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ---------------- CLAIMS VIEW (Décision n°13) ----------------
  if (mode === 'claims') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Réclamations & Demandes de réexamen des résultats
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Circuit : Secrétariat (réception) → Censeur (examen) → Proviseur (décision finale) · Suivi transparent (Décision n°13)
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="claims"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        <div className="grid lg:grid-cols-12 gap-6">
          {['eleve', 'parent'].includes(currentUser.role) && (
            <form
              onSubmit={handleSubmitClaim}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Déposer une réclamation</h2>
              <select
                required
                value={claimStudentId}
                onChange={(e) => setClaimStudentId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Dossier élève...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} {s.prenom} ({s.matricule})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={claimPeriodId}
                  onChange={(e) => setClaimPeriodId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Période...</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
                <select
                  value={claimSubjectId}
                  onChange={(e) => setClaimSubjectId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Matière (opt.)...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              <input
                required
                value={claimObjet}
                onChange={(e) => setClaimObjet(e.target.value)}
                placeholder="Objet (ex. Vérification moyenne Mathématiques)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <textarea
                required
                rows={3}
                value={claimDescription}
                onChange={(e) => setClaimDescription(e.target.value)}
                placeholder="Expliquez les éléments à réexaminer..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Envoyer la réclamation
              </button>
            </form>
          )}

          <div
            className={`${['eleve', 'parent'].includes(currentUser.role) ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            {claims.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucune réclamation enregistrée.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {claims.map((cl) => {
                  const st = CLAIM_STATUS_LABELS[cl.statut] || { label: cl.statut, colorClass: 'text-slate-600' };
                  return (
                    <div key={cl.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {cl.objet} · {cl.eleve_nom} ({cl.eleve_matricule})
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">{cl.description}</p>
                        <p className={`font-medium ${st.colorClass}`}>
                          État : {st.label} · Période : {cl.periode_nom} {cl.matiere_nom ? `· ${cl.matiere_nom}` : ''}
                        </p>
                        {cl.note_secretariat && <p className="text-[11px] text-slate-500">Secrétariat : {cl.note_secretariat}</p>}
                        {cl.avis_censeur && <p className="text-[11px] text-slate-500">Censeur : {cl.avis_censeur}</p>}
                        {cl.decision_proviseur && (
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                            Décision Proviseur : {cl.decision_proviseur}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {currentUser.role === 'secretaire' && cl.statut === 'recue_secretariat' && (
                          <button
                            type="button"
                            onClick={() => {
                              setClaimComment('');
                              setClaimModal({ id: cl.id, statut: 'transmise_censeur', title: 'Transmettre au censeur' });
                            }}
                            className="px-3 py-1.5 rounded bg-slate-900 dark:bg-blue-700 text-white font-medium"
                          >
                            Transmettre au censeur
                          </button>
                        )}
                        {currentUser.role === 'censeur' && cl.statut === 'transmise_censeur' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setClaimComment('');
                                setClaimModal({ id: cl.id, statut: 'soumise_proviseur', title: 'Soumettre au proviseur' });
                              }}
                              className="px-3 py-1.5 rounded bg-amber-700 text-white font-medium"
                            >
                              Soumettre au proviseur
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClaimComment('');
                                setClaimModal({ id: cl.id, statut: 'acceptee', title: 'Valider la réclamation' });
                              }}
                              className="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium"
                            >
                              Valider
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClaimComment('');
                                setClaimModal({ id: cl.id, statut: 'rejetee', title: 'Rejeter la réclamation' });
                              }}
                              className="px-3 py-1.5 rounded bg-red-700 text-white font-medium"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                        {currentUser.role === 'proviseur' && cl.statut === 'soumise_proviseur' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setClaimComment('');
                                setClaimModal({ id: cl.id, statut: 'acceptee', title: 'Accepter définitivement' });
                              }}
                              className="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium"
                            >
                              Accepter (Final)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClaimComment('');
                                setClaimModal({ id: cl.id, statut: 'rejetee', title: 'Rejeter définitivement' });
                              }}
                              className="px-3 py-1.5 rounded bg-red-700 text-white font-medium"
                            >
                              Rejeter (Final)
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {claimModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
            <form
              onSubmit={handleConfirmProcessClaim}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4"
            >
              <h2 className="font-display font-semibold text-base">{claimModal.title}</h2>
              <textarea
                rows={3}
                value={claimComment}
                onChange={(e) => setClaimComment(e.target.value)}
                placeholder="Commentaire ou motif de la décision (recommandé)..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClaimModal(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ---------------- BULLETINS & PUBLISHED RESULTS ----------------
  const q = searchQuery.trim().toLowerCase();
  const visibleBulletins = bulletins.filter((b) => {
    if (mode === 'results' && ['eleve', 'parent', 'enseignant'].includes(currentUser.role) && b.statut !== 'distribue') {
      return false;
    }
    if (selectedClasse && !['eleve', 'parent'].includes(currentUser.role) && b.classe_id !== selectedClasse) return false;
    if (selectedPeriod && b.periode_id !== selectedPeriod) return false;
    if (q && !`${b.eleve_nom} ${b.eleve_prenom} ${b.eleve_matricule}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const isPrivilegedViewer = !['eleve', 'parent'].includes(currentUser.role);

  const exportBulletinsCsv = () => {
    downloadCsv(
      `bulletins_prosper_kamara_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Matricule', 'Nom', 'Prénom', 'Classe', 'Période', 'Moyenne /20', 'Mention', 'Rang', 'Effectif', 'Version', 'Statut'],
      visibleBulletins.map((b) => [
        b.eleve_matricule,
        b.eleve_nom,
        b.eleve_prenom,
        b.classe_nom,
        b.periode_nom,
        b.moyenne_generale !== null ? b.moyenne_generale.toFixed(2) : '',
        getMentionInfo(b.moyenne_generale, settings).label,
        b.rang ?? '',
        b.effectif_classe,
        `v${b.version}`,
        BULLETIN_STATUS_LABELS[b.statut]?.label || b.statut,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'results' ? 'Résultats scolaires officiels' : 'Circuit officiel des bulletins scolaires'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'results'
              ? 'Les résultats ne sont accessibles aux élèves, parents et enseignants qu’après publication officielle (Décision n°5).'
              : 'Ordre officiel : Secrétariat → Proviseur (signature et cachet) → Censeur (vérification) → Distribution élève (PDF §3 & Décision n°10).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPrivilegedViewer && (
            <select
              value={selectedClasse}
              onChange={(e) => setSelectedClasse(Number(e.target.value))}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value={0}>Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          )}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(Number(e.target.value))}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value={0}>Toutes les périodes</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>

          {visibleBulletins.length > 0 && (
            <button
              type="button"
              onClick={exportBulletinsCsv}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter CSV</span>
            </button>
          )}

          {currentUser.role === 'secretaire' && mode === 'bulletins' && (
            <button
              type="button"
              onClick={handlePrepareBulletins}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
            >
              Calculer & Préparer les bulletins
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space={mode}
        defaultFilter="administratif"
        collapsible
        defaultExpanded={false}
      />

      {classSummary && classSummary.effectif_classe > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                Statistiques de période & Tableau d’honneur
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">
              Seuil de réussite configuré : {classSummary.seuil_reussite}/20 · Évalués : {classSummary.effectif_evalue}/{classSummary.effectif_classe}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Taux de réussite</p>
              <p className="font-display text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {classSummary.taux_reussite !== null ? `${classSummary.taux_reussite}%` : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Moyenne de classe</p>
              <p className="font-display text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {classSummary.moyenne_classe !== null ? `${classSummary.moyenne_classe.toFixed(2)}/20` : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Meilleure moyenne</p>
              <p className="font-display text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">
                {classSummary.meilleure_moyenne !== null ? `${classSummary.meilleure_moyenne.toFixed(2)}/20` : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Plus faible moyenne</p>
              <p className="font-display text-lg font-bold tabular-nums text-slate-700 dark:text-slate-300">
                {classSummary.plus_faible_moyenne !== null ? `${classSummary.plus_faible_moyenne.toFixed(2)}/20` : '—'}
              </p>
            </div>
          </div>

          {classSummary.honorRoll.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Tableau d’honneur (≥ {settings?.mention_bien ?? 14}/20) · {classSummary.honorRoll.length} élève(s)
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {classSummary.honorRoll.map((hr) => (
                  <div
                    key={hr.eleve_id}
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">
                      {hr.rang ? `${hr.rang}e · ` : ''}
                      {hr.nom} {hr.prenom}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                      {hr.moyenne_generale !== null ? `${hr.moyenne_generale.toFixed(2)}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {visibleBulletins.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Award className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Aucun bulletin disponible</p>
            <p className="text-xs text-slate-500">
              {currentUser.role === 'secretaire'
                ? 'Sélectionnez une classe et une période puis cliquez sur "Calculer & Préparer les bulletins" après réception des notes.'
                : 'Les bulletins apparaîtront ici dès leur publication officielle par la direction.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                  <th className="py-3 px-4 font-semibold">Élève</th>
                  <th className="py-3 px-4 font-semibold">Classe · Période</th>
                  <th className="py-3 px-4 font-semibold text-right">Moyenne</th>
                  <th className="py-3 px-4 font-semibold text-right">Rang</th>
                  <th className="py-3 px-4 font-semibold">Version & Statut</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleBulletins.map((b) => {
                  const st = BULLETIN_STATUS_LABELS[b.statut];
                  const mention = getMentionInfo(b.moyenne_generale, settings);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {b.eleve_nom} {b.eleve_prenom}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">{b.eleve_matricule}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        {b.classe_nom} · {b.periode_nom}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        <p className="font-semibold">{b.moyenne_generale !== null ? `${b.moyenne_generale.toFixed(2)}/20` : '—'}</p>
                        <p className={`text-[10px] font-sans font-medium ${mention.colorClass}`}>{mention.label}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {settings?.afficher_rang_bulletin !== 0
                          ? b.rang !== null
                            ? `${b.rang}e / ${b.effectif_classe}`
                            : '—'
                          : 'Masqué'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`font-medium ${st.colorClass}`}>
                          v{b.version} · {st.label}
                        </span>
                        {b.motif_retour && <p className="text-[11px] text-red-600">Motif retour : {b.motif_retour}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openBulletinModal(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Consulter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateBulletinPdf(b, settings)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 dark:bg-blue-700 text-white font-medium"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        {currentUser.role === 'secretaire' &&
                          ['brouillon', 'retourne_proviseur', 'retourne_censeur'].includes(b.statut) && (
                            <button
                              type="button"
                              onClick={() => handleTransmitProviseur(b.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 text-white font-medium"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Au Proviseur</span>
                            </button>
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

      {/* Official Bulletin Modal modeled on classic printed lycée report card */}
      {inspectBulletin && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-4xl w-full p-4 sm:p-6 space-y-4 my-4">
            {/* Modal action bar (hidden on print) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 no-print">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Aperçu du bulletin scolaire · {inspectBulletin.eleve_prenom} {inspectBulletin.eleve_nom}
                </p>
                <p className="text-[11px] text-slate-500">
                  Version v{inspectBulletin.version} · {BULLETIN_STATUS_LABELS[inspectBulletin.statut]?.label || inspectBulletin.statut}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => generateBulletinPdf(inspectBulletin, settings)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer</span>
                </button>
              </div>
            </div>

            {/* Classic Printed Bulletin Sheet */}
            <OfficialBulletinSheet
              bulletin={inspectBulletin}
              settings={settings}
              photoUrl={inspectPhotoUrl}
              logoUrl={inspectLogoUrl}
              stampUrl={inspectStampUrl}
              canEditAppreciation={
                currentUser.role === 'secretaire' &&
                ['brouillon', 'retourne_proviseur', 'retourne_censeur'].includes(inspectBulletin.statut)
              }
              editAppreciation={editAppreciation}
              onChangeAppreciation={setEditAppreciation}
              onSaveAppreciation={handleSaveAppreciation}
            />

            {/* Version Audit Trail */}
            {inspectVersions.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Historique des versions & décisions
                </p>
                {inspectVersions.map((v) => (
                  <p key={v.id}>
                    v{v.version} ({v.statut}) · {v.acteur_nom} · {v.motif || '—'} · {formatDateTimeFr(v.created_at)}
                  </p>
                ))}
              </div>
            )}

            {/* Official Action Buttons by Role */}
            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 no-print">
              {currentUser.role === 'proviseur' && inspectBulletin.statut === 'transmis_proviseur' && (
                <>
                  <button
                    type="button"
                    onClick={() => setReturnBulletin({ id: inspectBulletin.id, actor: 'proviseur' })}
                    className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retourner au secrétariat
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviseurSign(inspectBulletin.id)}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Signer numériquement & Apposer le cachet
                  </button>
                </>
              )}

              {currentUser.role === 'censeur' && inspectBulletin.statut === 'signe_proviseur' && (
                <>
                  <button
                    type="button"
                    onClick={() => setReturnBulletin({ id: inspectBulletin.id, actor: 'censeur' })}
                    className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retourner pour correction
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCenseurDistribute(inspectBulletin.id)}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Valider & Autoriser la distribution
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setInspectBulletin(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return with mandatory motif modal */}
      {returnBulletin && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReturn}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h2 className="font-display font-semibold text-base">Retourner le bulletin au secrétariat</h2>
            <p className="text-xs text-slate-500">
              Un bulletin retourné déclenchera une nouvelle version et nécessitera une nouvelle signature du proviseur (PDF §3).
            </p>
            <textarea
              required
              rows={3}
              value={returnMotif}
              onChange={(e) => setReturnMotif(e.target.value)}
              placeholder="Indiquez le motif précis de la correction demandée..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnBulletin(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Annuler
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-medium">
                Confirmer le retour
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
