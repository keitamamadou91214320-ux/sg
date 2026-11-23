import React, { useEffect, useState } from 'react';
import { Check, Download, FileSpreadsheet, Lock, Send, Trash2, Upload, XCircle } from 'lucide-react';
import { apiFetch, downloadCsv, getAuthToken } from '../lib/api.ts';
import {
  EVALUATION_TYPE_LABELS,
  GRADE_STATUS_LABELS,
  TRANSMISSION_STATUS_LABELS,
  formatDateTimeFr,
} from '../lib/labels.ts';
import type {
  AcademicYear,
  Evaluation,
  EvaluationType,
  GradeCorrectionRequest,
  GradeEntryStatus,
  GradeTransmission,
  SchoolClass,
  SchoolPeriod,
  Subject,
  TeacherAssignment,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface GradesAndEvaluationsViewProps {
  mode: 'evaluations_grades' | 'transmissions' | 'corrections';
  currentUser: UserAccount;
}

interface GridRow {
  eleve_id: number;
  matricule: string;
  nom: string;
  prenom: string;
  valeur: number | null;
  statut_note: GradeEntryStatus;
  appreciation: string | null;
  est_provisoire: number;
}

interface ExcelReport {
  total_lignes: number;
  valides: number;
  erreurs_count: number;
  errors: { ligne: number; matricule: string; erreur: string }[];
  preview: {
    eleve_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    valeur: number | null;
    statut_note: GradeEntryStatus;
    appreciation: string | null;
  }[];
}

export const GradesAndEvaluationsView: React.FC<GradesAndEvaluationsViewProps> = ({ mode, currentUser }) => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<SchoolPeriod[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [transmissions, setTransmissions] = useState<GradeTransmission[]>([]);
  const [corrections, setCorrections] = useState<GradeCorrectionRequest[]>([]);
  const [gradeHistory, setGradeHistory] = useState<
    {
      id: number;
      evaluation_titre: string;
      eleve_nom: string;
      eleve_matricule: string;
      ancienne_valeur: number | null;
      ancien_statut: string;
      nouvelle_valeur: number | null;
      nouveau_statut: string;
      motif: string;
      acteur_nom: string;
      created_at: string;
    }[]
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create Evaluation Form
  const [anneeId, setAnneeId] = useState(0);
  const [periodeId, setPeriodeId] = useState(0);
  const [classeId, setClasseId] = useState(0);
  const [matiereId, setMatiereId] = useState(0);
  const [titre, setTitre] = useState('');
  const [evalType, setEvalType] = useState<EvaluationType>('devoir_surveille');
  const [dateEval, setDateEval] = useState(new Date().toISOString().slice(0, 10));
  const [baremeMax, setBaremeMax] = useState<number>(20);
  const [description, setDescription] = useState('');

  // Selected evaluation for grade entry / excel import
  const [selectedEval, setSelectedEval] = useState<Evaluation | null>(null);
  const [entryMethod, setEntryMethod] = useState<'direct' | 'excel'>('direct');
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [currentTransmission, setCurrentTransmission] = useState<GradeTransmission | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelReport, setExcelReport] = useState<ExcelReport | null>(null);

  // Return motif modal (Secretariat) & Censeur refusal modal
  const [returnTargetId, setReturnTargetId] = useState<number | null>(null);
  const [returnMotif, setReturnMotif] = useState('');
  const [censeurRefuseId, setCenseurRefuseId] = useState<number | null>(null);
  const [censeurRefuseMotif, setCenseurRefuseMotif] = useState('');

  // Correction request form (Teacher)
  const [corrEvalId, setCorrEvalId] = useState(0);
  const [corrStudents, setCorrStudents] = useState<GridRow[]>([]);
  const [corrEleveId, setCorrEleveId] = useState(0);
  const [corrNewVal, setCorrNewVal] = useState<string>('');
  const [corrNewStatut, setCorrNewStatut] = useState<GradeEntryStatus>('note');
  const [corrMotif, setCorrMotif] = useState('');

  const loadAll = async () => {
    try {
      const [yRes, pRes, cRes, sRes, aRes, eRes] = await Promise.all([
        apiFetch<{ years: AcademicYear[] }>('/api/academic-years'),
        apiFetch<{ periods: SchoolPeriod[] }>('/api/periods'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ subjects: Subject[] }>('/api/subjects'),
        apiFetch<{ assignments: TeacherAssignment[] }>('/api/assignments'),
        apiFetch<{ evaluations: Evaluation[] }>('/api/evaluations'),
      ]);
      setYears(yRes.years);
      setPeriods(pRes.periods);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
      setAssignments(aRes.assignments);
      setEvaluations(eRes.evaluations);

      const activeYear = yRes.years.find((y) => y.est_active) || yRes.years[0];
      if (activeYear) setAnneeId((prev) => prev || activeYear.id);
      const activePeriod = pRes.periods.find((p) => p.statut === 'active') || pRes.periods[0];
      if (activePeriod) setPeriodeId((prev) => prev || activePeriod.id);

      if (mode === 'transmissions') {
        const tRes = await apiFetch<{ transmissions: GradeTransmission[] }>('/api/transmissions');
        setTransmissions(tRes.transmissions);
      }
      if (mode === 'corrections') {
        const gcRes = await apiFetch<{ requests: GradeCorrectionRequest[]; history: typeof gradeHistory }>(
          '/api/grade-corrections'
        );
        setCorrections(gcRes.requests);
        setGradeHistory(gcRes.history);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [mode]);

  const loadEvalGrades = async (ev: Evaluation) => {
    setSelectedEval(ev);
    setExcelReport(null);
    setExcelFile(null);
    setError(null);
    try {
      const res = await apiFetch<{ evaluation: Evaluation; rows: GridRow[]; transmission: GradeTransmission | null }>(
        `/api/evaluations/${ev.id}/grades`
      );
      setGridRows(res.rows);
      setCurrentTransmission(res.transmission);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateEval = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          annee_id: anneeId,
          periode_id: periodeId,
          classe_id: classeId,
          matiere_id: matiereId,
          titre,
          type: evalType,
          date_evaluation: dateEval,
          bareme_max: Number(baremeMax),
          description,
        }),
      });
      setTitre('');
      setDescription('');
      setFeedback(`Évaluation créée avec barème sur ${baremeMax}.`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteEval = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/evaluations/${id}`, { method: 'DELETE' });
      if (selectedEval?.id === id) setSelectedEval(null);
      setFeedback('Évaluation supprimée avant transmission.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveGrades = async (action: 'brouillon' | 'transmettre') => {
    if (!selectedEval) return;
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/api/evaluations/${selectedEval.id}/grades`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          entries: gridRows.map((r) => ({
            eleve_id: r.eleve_id,
            valeur: r.statut_note === 'note' ? r.valeur : null,
            statut_note: r.statut_note,
            appreciation: r.appreciation || '',
          })),
        }),
      });
      setFeedback(
        action === 'transmettre'
          ? 'Notes transmises au secrétariat. La saisie est désormais verrouillée.'
          : 'Brouillon enregistré.'
      );
      await loadEvalGrades(selectedEval);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!selectedEval) return;
    const token = getAuthToken();
    const res = await fetch(`/api/evaluations/${selectedEval.id}/excel-template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modele_${selectedEval.classe_nom}_${selectedEval.matiere_nom}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelUpload = async (uploadMode: 'preview' | 'confirm_transmit') => {
    if (!selectedEval || !excelFile) return;
    setError(null);
    setFeedback(null);
    const fd = new FormData();
    fd.append('file', excelFile);
    fd.append('mode', uploadMode);
    try {
      const res = await apiFetch<{ report: ExcelReport }>(`/api/evaluations/${selectedEval.id}/import-excel`, {
        method: 'POST',
        body: fd,
      });
      setExcelReport(res.report);
      if (uploadMode === 'confirm_transmit') {
        setFeedback('Fichier Excel importé et transmis au secrétariat (données provisoires en attente de contrôle).');
        await loadEvalGrades(selectedEval);
        await loadAll();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSecretariatControl = async (id: number, decision: 'accepte' | 'retourne', motif?: string) => {
    setError(null);
    try {
      await apiFetch(`/api/transmissions/${id}/control`, {
        method: 'POST',
        body: JSON.stringify({ decision, motif_retour: motif }),
      });
      setReturnTargetId(null);
      setReturnMotif('');
      setFeedback(decision === 'accepte' ? 'Notes acceptées et validées.' : 'Transmission retournée à l’enseignant.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSelectCorrectionEval = async (evId: number) => {
    setCorrEvalId(evId);
    if (!evId) {
      setCorrStudents([]);
      return;
    }
    try {
      const res = await apiFetch<{ rows: GridRow[] }>(`/api/evaluations/${evId}/grades`);
      setCorrStudents(res.rows);
      if (res.rows[0]) setCorrEleveId(res.rows[0].eleve_id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/grade-corrections', {
        method: 'POST',
        body: JSON.stringify({
          evaluation_id: corrEvalId,
          eleve_id: corrEleveId,
          nouvelle_valeur: corrNewStatut === 'note' ? Number(corrNewVal) : null,
          nouveau_statut: corrNewStatut,
          motif: corrMotif,
        }),
      });
      setCorrMotif('');
      setCorrNewVal('');
      setFeedback('Demande de correction transmise au censeur pour examen.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCenseurDecision = async (
    id: number,
    decision: 'validee_censeur' | 'refusee_censeur',
    commentaire = 'Justification vérifiée'
  ) => {
    try {
      await apiFetch(`/api/grade-corrections/${id}/censeur`, {
        method: 'POST',
        body: JSON.stringify({ decision, commentaire }),
      });
      setCenseurRefuseId(null);
      setCenseurRefuseMotif('');
      setFeedback(decision === 'validee_censeur' ? 'Demande validée et transmise au proviseur.' : 'Demande refusée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleProviseurDecision = async (id: number, decision: 'autorisee_proviseur' | 'refusee_proviseur') => {
    try {
      await apiFetch(`/api/grade-corrections/${id}/proviseur`, {
        method: 'POST',
        body: JSON.stringify({ decision, commentaire: decision === 'autorisee_proviseur' ? 'Autorisé' : 'Refusé' }),
      });
      setFeedback(
        decision === 'autorisee_proviseur'
          ? 'Correction autorisée et appliquée. Ancienne note préservée dans l’historique.'
          : 'Correction refusée.'
      );
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ---------------- TRANSMISSIONS MODE ----------------
  if (mode === 'transmissions') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Transmissions de notes & Contrôle secrétariat
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Les données saisies ou importées restent provisoires jusqu’à leur contrôle et acceptation par le secrétariat (Décision n°8)
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="transmissions"
          defaultFilter="evaluation"
          collapsible
          defaultExpanded={false}
          refreshKey={evaluations.length}
        />

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {transmissions.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">Aucune transmission de notes enregistrée.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4 font-semibold">Évaluation</th>
                    <th className="py-3 px-4 font-semibold">Enseignant</th>
                    <th className="py-3 px-4 font-semibold">Méthode</th>
                    <th className="py-3 px-4 font-semibold">Statut</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    {currentUser.role === 'secretaire' && <th className="py-3 px-4 font-semibold text-right">Contrôle</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transmissions.map((t) => {
                    const st = TRANSMISSION_STATUS_LABELS[t.statut];
                    return (
                      <tr key={t.id}>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold">{t.evaluation_titre}</p>
                          <p className="text-[11px] text-slate-500">
                            {t.classe_nom} · {t.matiere_nom} · {t.periode_nom} · Barème /{t.bareme_max}
                          </p>
                        </td>
                        <td className="py-2.5 px-4">{t.enseignant_nom}</td>
                        <td className="py-2.5 px-4">
                          {t.methode === 'import_excel' ? 'Import Excel' : 'Saisie directe'}
                        </td>
                        <td className={`py-2.5 px-4 font-medium ${st.colorClass}`}>
                          {st.label}
                          {t.motif_retour && <p className="text-[11px] text-red-600 font-normal">Motif : {t.motif_retour}</p>}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-slate-500">{formatDateTimeFr(t.transmis_at)}</td>
                        {currentUser.role === 'secretaire' && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                            {['transmis', 'nouvelle_transmission', 'en_verification'].includes(t.statut) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSecretariatControl(t.id, 'accepte')}
                                  className="px-2.5 py-1 rounded bg-emerald-700 text-white font-medium"
                                >
                                  Accepter
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReturnTargetId(t.id)}
                                  className="px-2.5 py-1 rounded bg-red-700 text-white font-medium"
                                >
                                  Retourner
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {returnTargetId && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
              <h2 className="font-display font-semibold text-base">Retourner la transmission à l’enseignant</h2>
              <textarea
                required
                rows={3}
                value={returnMotif}
                onChange={(e) => setReturnMotif(e.target.value)}
                placeholder="Motif obligatoire du retour..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReturnTargetId(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleSecretariatControl(returnTargetId, 'retourne', returnMotif)}
                  className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-medium"
                >
                  Confirmer le retour
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- DOUBLE-VALIDATION CORRECTIONS MODE (Décision n°6) ----------------
  if (mode === 'corrections') {
    const transmittedEvals = evaluations.filter((e) => e.transmission_statut && e.transmission_statut !== 'retourne');

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Correction des notes après transmission (Double validation)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Circuit : Enseignant (demande motivée) → Censeur (vérification sans modification directe) → Proviseur (autorisation finale) · Historique conservé (Décision n°6)
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="corrections"
          defaultFilter="evaluation"
          collapsible
          defaultExpanded={false}
          refreshKey={evaluations.length}
        />

        <div className="grid lg:grid-cols-12 gap-6">
          {currentUser.role === 'enseignant' && (
            <form
              onSubmit={handleSubmitCorrection}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Soumettre une demande de correction</h2>
              <select
                required
                value={corrEvalId}
                onChange={(e) => handleSelectCorrectionEval(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Évaluation transmise...</option>
                {transmittedEvals
                  .filter((e) => e.enseignant_id === currentUser.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.titre} ({e.classe_nom} · /{e.bareme_max})
                    </option>
                  ))}
              </select>

              <select
                required
                value={corrEleveId}
                onChange={(e) => setCorrEleveId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Élève concerné...</option>
                {corrStudents.map((s) => (
                  <option key={s.eleve_id} value={s.eleve_id}>
                    {s.matricule} — {s.nom} {s.prenom} (actuelle : {s.valeur ?? s.statut_note})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={corrNewStatut}
                  onChange={(e) => setCorrNewStatut(e.target.value as GradeEntryStatus)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {Object.entries(GRADE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {corrNewStatut === 'note' && (
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    required
                    value={corrNewVal}
                    onChange={(e) => setCorrNewVal(e.target.value)}
                    placeholder="Nouvelle note"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                )}
              </div>

              <textarea
                required
                rows={3}
                value={corrMotif}
                onChange={(e) => setCorrMotif(e.target.value)}
                placeholder="Motif précis de la demande de correction..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Transmettre la demande
              </button>
            </form>
          )}

          <div className={`${currentUser.role === 'enseignant' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-display font-semibold text-sm">
                Demandes de correction en cours & traitées
              </div>
              {corrections.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Aucune demande de correction soumise.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {corrections.map((c) => (
                    <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {c.eleve_nom} ({c.eleve_matricule}) · {c.evaluation_titre} ({c.classe_nom})
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">
                          Ancienne :{' '}
                          <span className="font-mono font-semibold">
                            {c.ancienne_valeur !== null ? `${c.ancienne_valeur}/${c.bareme_max}` : c.ancien_statut}
                          </span>{' '}
                          → Nouvelle :{' '}
                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                            {c.nouvelle_valeur !== null ? `${c.nouvelle_valeur}/${c.bareme_max}` : c.nouveau_statut}
                          </span>
                        </p>
                        <p className="text-slate-500">Motif : {c.motif} · Enseignant : {c.enseignant_nom}</p>
                        <p className="text-[11px] font-medium">Statut : {c.statut}</p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {currentUser.role === 'censeur' && c.statut === 'soumise' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCenseurDecision(c.id, 'validee_censeur')}
                              className="px-3 py-1.5 rounded bg-blue-700 text-white font-medium flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Valider (Censeur)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCenseurRefuseMotif('');
                                setCenseurRefuseId(c.id);
                              }}
                              className="px-3 py-1.5 rounded bg-red-700 text-white font-medium flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Refuser
                            </button>
                          </>
                        )}
                        {currentUser.role === 'proviseur' && c.statut === 'validee_censeur' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleProviseurDecision(c.id, 'autorisee_proviseur')}
                              className="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Autoriser (Final)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProviseurDecision(c.id, 'refusee_proviseur')}
                              className="px-3 py-1.5 rounded bg-red-700 text-white font-medium flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Refuser
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-display font-semibold text-sm">
                Historique permanent des valeurs modifiées (jamais supprimées)
              </div>
              {gradeHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Aucune correction appliquée pour le moment.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <th className="py-2.5 px-4 font-semibold">Élève</th>
                        <th className="py-2.5 px-4 font-semibold">Évaluation</th>
                        <th className="py-2.5 px-4 font-semibold">Ancienne valeur</th>
                        <th className="py-2.5 px-4 font-semibold">Nouvelle valeur</th>
                        <th className="py-2.5 px-4 font-semibold">Motif & Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {gradeHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="py-2.5 px-4 font-semibold">
                            {h.eleve_nom} ({h.eleve_matricule})
                          </td>
                          <td className="py-2.5 px-4">{h.evaluation_titre}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums">{h.ancienne_valeur ?? h.ancien_statut}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                            {h.nouvelle_valeur ?? h.nouveau_statut}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {h.motif} · {formatDateTimeFr(h.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {censeurRefuseId && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!censeurRefuseMotif.trim()) return;
                handleCenseurDecision(censeurRefuseId, 'refusee_censeur', censeurRefuseMotif.trim());
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4"
            >
              <h2 className="font-display font-semibold text-base">Motif du refus (Censeur)</h2>
              <textarea
                required
                rows={3}
                value={censeurRefuseMotif}
                onChange={(e) => setCenseurRefuseMotif(e.target.value)}
                placeholder="Expliquez pourquoi la demande de correction est refusée..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCenseurRefuseId(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-medium">
                  Confirmer le refus
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ---------------- EVALUATIONS & GRADE ENTRY / EXCEL IMPORT ----------------
  const teacherAssignments =
    currentUser.role === 'enseignant'
      ? assignments.filter((a) => a.enseignant_id === currentUser.id)
      : assignments;

  const isLocked = Boolean(
    currentTransmission &&
      ['transmis', 'en_verification', 'accepte', 'nouvelle_transmission'].includes(currentTransmission.statut)
  );
  const canEditGrades =
    selectedEval &&
    !isLocked &&
    (currentUser.role === 'secretaire' ||
      (currentUser.role === 'enseignant' &&
        teacherAssignments.some(
          (a) => a.classe_id === selectedEval.classe_id && a.matiere_id === selectedEval.matiere_id
        )));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Évaluations, Saisie des notes & Importation Excel
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Barème configurable par évaluation (Décision n°1) · Verrouillage après transmission (Décision n°3) · Formats .xlsx et .xls acceptés (Décision n°8)
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="evaluations_grades"
        defaultFilter="evaluation"
        collapsible
        defaultExpanded={false}
        refreshKey={evaluations.length}
      />

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Create Evaluation + Evaluations list */}
        <div className="lg:col-span-4 space-y-6">
          {['enseignant', 'proviseur', 'censeur'].includes(currentUser.role) && (
            <form
              onSubmit={handleCreateEval}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h2 className="font-display font-semibold text-base">Créer une évaluation</h2>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={anneeId}
                  onChange={(e) => setAnneeId(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Année...</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.libelle}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={periodeId}
                  onChange={(e) => setPeriodeId(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Période...</option>
                  {periods
                    .filter((p) => p.statut !== 'cloturee' && p.statut !== 'archivee')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={classeId}
                  onChange={(e) => setClasseId(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Classe...</option>
                  {(currentUser.role === 'enseignant'
                    ? classes.filter((c) => teacherAssignments.some((a) => a.classe_id === c.id))
                    : classes
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={matiereId}
                  onChange={(e) => setMatiereId(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Matière...</option>
                  {(currentUser.role === 'enseignant'
                    ? subjects.filter((s) =>
                        teacherAssignments.some((a) => a.matiere_id === s.id && (!classeId || a.classe_id === classeId))
                      )
                    : subjects
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>

              <input
                required
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Titre (ex. Devoir n°1 Algèbre)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={evalType}
                  onChange={(e) => setEvalType(e.target.value as EvaluationType)}
                  className="col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {Object.entries(EVALUATION_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  step="1"
                  required
                  value={baremeMax}
                  onChange={(e) => setBaremeMax(Number(e.target.value))}
                  title="Barème maximal (10, 20, 40, 100...)"
                  placeholder="Barème"
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
              </div>

              <input
                type="date"
                required
                value={dateEval}
                onChange={(e) => setDateEval(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Créer l’évaluation (/{baremeMax})
              </button>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-display font-semibold text-sm">
              Évaluations ({evaluations.length})
            </div>
            {evaluations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Aucune évaluation créée.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
                {evaluations.map((ev) => {
                  const active = selectedEval?.id === ev.id;
                  const canDelete =
                    ev.enseignant_id === currentUser.id &&
                    (!ev.transmission_statut || ev.transmission_statut === 'retourne');
                  return (
                    <div
                      key={ev.id}
                      className={`p-3.5 flex items-start justify-between gap-2 cursor-pointer transition-colors ${
                        active ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                      onClick={() => loadEvalGrades(ev)}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{ev.titre}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {ev.classe_nom} · {ev.matiere_nom} · Barème /{ev.bareme_max}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {ev.periode_nom} · {ev.transmission_statut || 'Brouillon'}
                        </p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEval(ev.id);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                          title="Supprimer avant transmission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Grade Entry Grid or Excel Import */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          {!selectedEval ? (
            <div className="py-16 text-center space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Sélectionnez une évaluation pour saisir ou importer les notes
              </p>
              <p className="text-xs text-slate-500">
                Les contrôles vérifient automatiquement l’appartenance à la classe et le barème maximal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-semibold text-base">{selectedEval.titre}</h2>
                    {isLocked && <Lock className="w-4 h-4 text-amber-600" />}
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedEval.classe_nom} · {selectedEval.matiere_nom} · Barème maximal :{' '}
                    <span className="font-mono font-semibold">/{selectedEval.bareme_max}</span>
                  </p>
                </div>

                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setEntryMethod('direct')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                      entryMethod === 'direct' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Saisie directe
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMethod('excel')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                      entryMethod === 'excel' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Import Excel (.xlsx/.xls)
                  </button>
                </div>
              </div>

              {isLocked && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                  Cette évaluation a été transmise au secrétariat ({currentTransmission?.statut}). Toute modification nécessite désormais une demande de correction (Décision n°6).
                </div>
              )}

              {entryMethod === 'direct' ? (
                <>
                  {gridRows.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500">
                      Aucun élève inscrit dans la classe {selectedEval.classe_nom}.
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const numericGrades = gridRows
                          .filter((r) => r.statut_note === 'note' && r.valeur !== null && !Number.isNaN(r.valeur))
                          .map((r) => Number(r.valeur));
                        const avg =
                          numericGrades.length > 0
                            ? numericGrades.reduce((sum, v) => sum + v, 0) / numericGrades.length
                            : null;
                        const minVal = numericGrades.length > 0 ? Math.min(...numericGrades) : null;
                        const maxVal = numericGrades.length > 0 ? Math.max(...numericGrades) : null;
                        const missingCount = gridRows.filter((r) => r.statut_note !== 'note' || r.valeur === null).length;

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                            <div className="flex flex-wrap items-center gap-4 tabular-nums">
                              <span>
                                Saisies : <strong>{numericGrades.length}/{gridRows.length}</strong>
                              </span>
                              <span>
                                Moyenne :{' '}
                                <strong className="font-mono text-blue-700 dark:text-blue-400">
                                  {avg !== null ? `${avg.toFixed(2)}/${selectedEval.bareme_max}` : '—'}
                                </strong>
                              </span>
                              <span>
                                Min / Max :{' '}
                                <strong className="font-mono">
                                  {minVal !== null && maxVal !== null ? `${minVal} – ${maxVal}` : '—'}
                                </strong>
                              </span>
                              <span>
                                Absents / En attente : <strong className="text-amber-700 dark:text-amber-400">{missingCount}</strong>
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                downloadCsv(
                                  `notes_${selectedEval.classe_nom}_${selectedEval.matiere_nom}.csv`,
                                  ['Matricule', 'Nom', 'Prénom', 'Statut', `Note /${selectedEval.bareme_max}`, 'Appréciation'],
                                  gridRows.map((r) => [
                                    r.matricule,
                                    r.nom,
                                    r.prenom,
                                    GRADE_STATUS_LABELS[r.statut_note] || r.statut_note,
                                    r.statut_note === 'note' ? (r.valeur ?? '') : '',
                                    r.appreciation || '',
                                  ])
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Exporter CSV</span>
                            </button>
                          </div>
                        );
                      })()}

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                              <th className="py-2.5 px-3 font-semibold">Matricule</th>
                              <th className="py-2.5 px-3 font-semibold">Élève</th>
                              <th className="py-2.5 px-3 font-semibold">Statut</th>
                              <th className="py-2.5 px-3 font-semibold">Note /{selectedEval.bareme_max}</th>
                              <th className="py-2.5 px-3 font-semibold">Appréciation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {gridRows.map((row, idx) => (
                              <tr key={row.eleve_id}>
                                <td className="py-2 px-3 font-mono tabular-nums">{row.matricule}</td>
                                <td className="py-2 px-3 font-medium">
                                  {row.nom} {row.prenom}
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    disabled={!canEditGrades}
                                    value={row.statut_note}
                                    onChange={(e) => {
                                      const next = [...gridRows];
                                      next[idx] = { ...row, statut_note: e.target.value as GradeEntryStatus };
                                      setGridRows(next);
                                    }}
                                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs disabled:opacity-60"
                                  >
                                    {Object.entries(GRADE_STATUS_LABELS).map(([k, v]) => (
                                      <option key={k} value={k}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    step="0.25"
                                    min={0}
                                    max={selectedEval.bareme_max}
                                    disabled={!canEditGrades || row.statut_note !== 'note'}
                                    value={row.statut_note === 'note' ? (row.valeur ?? '') : ''}
                                    onChange={(e) => {
                                      const next = [...gridRows];
                                      next[idx] = {
                                        ...row,
                                        valeur: e.target.value === '' ? null : Number(e.target.value),
                                      };
                                      setGridRows(next);
                                    }}
                                    className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums disabled:opacity-50"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    disabled={!canEditGrades}
                                    value={row.appreciation || ''}
                                    onChange={(e) => {
                                      const next = [...gridRows];
                                      next[idx] = { ...row, appreciation: e.target.value };
                                      setGridRows(next);
                                    }}
                                    placeholder="Optionnel"
                                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {canEditGrades && (
                        <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleSaveGrades('brouillon')}
                            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Enregistrer le brouillon
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveGrades('transmettre')}
                            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 flex items-center gap-2"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Transmettre au secrétariat (verrouiller)</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Download className="w-4 h-4" />
                      <span>Télécharger le modèle officiel (.xlsx)</span>
                    </button>

                    {canEditGrades && (
                      <label className="px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs cursor-pointer flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Upload className="w-4 h-4" />
                        <span>{excelFile ? excelFile.name : 'Choisir un fichier (.xlsx ou .xls)'}</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            setExcelFile(e.target.files?.[0] || null);
                            setExcelReport(null);
                          }}
                        />
                      </label>
                    )}

                    {canEditGrades && excelFile && (
                      <button
                        type="button"
                        onClick={() => handleExcelUpload('preview')}
                        className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium"
                      >
                        Analyser le fichier
                      </button>
                    )}
                  </div>

                  {excelReport && (
                    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap gap-6 text-xs">
                        <span>Total lignes : <strong className="tabular-nums">{excelReport.total_lignes}</strong></span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Valides : <strong className="tabular-nums">{excelReport.valides}</strong>
                        </span>
                        <span className={excelReport.erreurs_count > 0 ? 'text-red-700 dark:text-red-400' : ''}>
                          Erreurs : <strong className="tabular-nums">{excelReport.erreurs_count}</strong>
                        </span>
                      </div>

                      {excelReport.errors.length > 0 && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs space-y-1 max-h-40 overflow-y-auto">
                          {excelReport.errors.map((er, i) => (
                            <p key={i} className="text-red-700 dark:text-red-300">
                              Ligne {er.ligne} ({er.matricule}) : {er.erreur}
                            </p>
                          ))}
                        </div>
                      )}

                      {excelReport.errors.length === 0 && excelReport.preview.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleExcelUpload('confirm_transmit')}
                            className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium flex items-center gap-2"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Confirmer l’importation et transmettre au secrétariat</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
