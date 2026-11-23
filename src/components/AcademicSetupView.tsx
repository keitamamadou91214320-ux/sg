import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiFetch, downloadCsv } from '../lib/api.ts';
import type {
  AcademicYear,
  ClassSubject,
  MissingGradeRule,
  SchoolClass,
  SchoolPeriod,
  Subject,
  TeacherAssignment,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface AcademicSetupViewProps {
  currentUser: UserAccount;
  searchQuery: string;
}

const MISSING_RULE_LABELS: Record<MissingGradeRule, string> = {
  neutralise: 'Neutralisée (non comptée)',
  zero: 'Comptée comme 0',
  minimum: 'Note minimale de l’évaluation',
};

export const AcademicSetupView: React.FC<AcademicSetupViewProps> = ({ currentUser, searchQuery }) => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<SchoolPeriod[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<UserAccount[]>([]);

  const [tab, setTab] = useState<'periods' | 'classes' | 'subjects' | 'assignments' | 'calendar'>('periods');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Forms
  const [yearLibelle, setYearLibelle] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [yearActive, setYearActive] = useState(true);

  const [periodYearId, setPeriodYearId] = useState<number>(0);
  const [periodNom, setPeriodNom] = useState('');
  const [periodType, setPeriodType] = useState<'trimestre' | 'semestre' | 'sequence' | 'autre'>('trimestre');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [periodOrdre, setPeriodOrdre] = useState(1);

  const [classYearId, setClassYearId] = useState<number>(0);
  const [classNom, setClassNom] = useState('');
  const [classNiveau, setClassNiveau] = useState('');
  const [classSerie, setClassSerie] = useState('');
  const [classRule, setClassRule] = useState<MissingGradeRule>('neutralise');

  const [subCode, setSubCode] = useState('');
  const [subNom, setSubNom] = useState('');
  const [csClasseId, setCsClasseId] = useState<number>(0);
  const [csMatiereId, setCsMatiereId] = useState<number>(0);
  const [csCoeff, setCsCoeff] = useState<number>(2);

  const [asTeacherId, setAsTeacherId] = useState<number>(0);
  const [asClasseId, setAsClasseId] = useState<number>(0);
  const [asMatiereId, setAsMatiereId] = useState<number>(0);
  const [asYearId, setAsYearId] = useState<number>(0);

  const canManage = ['proviseur', 'fondateur'].includes(currentUser.role);

  const loadAll = async () => {
    try {
      const [yRes, pRes, cRes, sRes, aRes] = await Promise.all([
        apiFetch<{ years: AcademicYear[] }>('/api/academic-years'),
        apiFetch<{ periods: SchoolPeriod[] }>('/api/periods'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ subjects: Subject[]; classSubjects: ClassSubject[] }>('/api/subjects'),
        apiFetch<{ assignments: TeacherAssignment[] }>('/api/assignments'),
      ]);
      setYears(yRes.years);
      setPeriods(pRes.periods);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
      setClassSubjects(sRes.classSubjects);
      setAssignments(aRes.assignments);

      const active = yRes.years.find((y) => y.est_active) || yRes.years[0];
      if (active) {
        setPeriodYearId((prev) => prev || active.id);
        setClassYearId((prev) => prev || active.id);
        setAsYearId((prev) => prev || active.id);
      }
      if (cRes.classes[0]) {
        setCsClasseId((prev) => prev || cRes.classes[0].id);
        setAsClasseId((prev) => prev || cRes.classes[0].id);
      }
      if (sRes.subjects[0]) {
        setCsMatiereId((prev) => prev || sRes.subjects[0].id);
        setAsMatiereId((prev) => prev || sRes.subjects[0].id);
      }

      if (canManage) {
        const uRes = await apiFetch<{ users: UserAccount[] }>('/api/users?role=enseignant');
        setTeachers(uRes.users.filter((u) => u.statut === 'actif'));
        if (uRes.users[0]) setAsTeacherId((prev) => prev || uRes.users[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/academic-years', {
        method: 'POST',
        body: JSON.stringify({ libelle: yearLibelle, date_debut: yearStart, date_fin: yearEnd, est_active: yearActive }),
      });
      setYearLibelle('');
      setYearStart('');
      setYearEnd('');
      setFeedback('Année scolaire créée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/periods', {
        method: 'POST',
        body: JSON.stringify({
          annee_id: periodYearId,
          nom: periodNom,
          type_decoupage: periodType,
          date_debut: periodStart,
          date_fin: periodEnd,
          ordre: periodOrdre,
        }),
      });
      setPeriodNom('');
      setPeriodStart('');
      setPeriodEnd('');
      setFeedback('Période scolaire créée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePeriodStatus = async (id: number, statut: string) => {
    setError(null);
    try {
      await apiFetch(`/api/periods/${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          annee_id: classYearId,
          nom: classNom,
          niveau: classNiveau,
          serie: classSerie || undefined,
          regle_notes_manquantes: classRule,
        }),
      });
      setClassNom('');
      setClassNiveau('');
      setClassSerie('');
      setFeedback('Classe créée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUpdateMissingRule = async (classeId: number, regle: MissingGradeRule) => {
    try {
      await apiFetch(`/api/classes/${classeId}/missing-rule`, {
        method: 'PATCH',
        body: JSON.stringify({ regle_notes_manquantes: regle }),
      });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/subjects', { method: 'POST', body: JSON.stringify({ code: subCode, nom: subNom }) });
      setSubCode('');
      setSubNom('');
      setFeedback('Matière ajoutée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveClassCoeff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/class-subjects', {
        method: 'POST',
        body: JSON.stringify({ classe_id: csClasseId, matiere_id: csMatiereId, coefficient: Number(csCoeff) }),
      });
      setFeedback('Coefficient par classe enregistré.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          enseignant_id: asTeacherId,
          classe_id: asClasseId,
          matiere_id: asMatiereId,
          annee_id: asYearId,
        }),
      });
      setFeedback('Affectation enseignant enregistrée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = searchQuery.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Structure pédagogique, Périodes & Coefficients
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Périodes configurables (Décision n°2), coefficients par classe (Décision n°4) et règles de notes manquantes (Décision n°7)
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
          {[
            { id: 'periods', label: 'Années & Périodes' },
            { id: 'classes', label: 'Classes' },
            { id: 'subjects', label: 'Matières & Coeffs' },
            { id: 'assignments', label: 'Affectations' },
            { id: 'calendar', label: 'Calendrier scolaire' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      {tab === 'periods' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {canManage && (
            <div className="lg:col-span-4 space-y-6">
              <form
                onSubmit={handleCreateYear}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h2 className="font-display font-semibold text-base">Nouvelle année scolaire</h2>
                <input
                  required
                  value={yearLibelle}
                  onChange={(e) => setYearLibelle(e.target.value)}
                  placeholder="Ex. 2026-2027"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={yearStart}
                    onChange={(e) => setYearStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    required
                    value={yearEnd}
                    onChange={(e) => setYearEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={yearActive} onChange={(e) => setYearActive(e.target.checked)} />
                  <span>Définir comme année active</span>
                </label>
                <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Créer l’année scolaire
                </button>
              </form>

              <form
                onSubmit={handleCreatePeriod}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h2 className="font-display font-semibold text-base">Nouvelle période scolaire</h2>
                <select
                  required
                  value={periodYearId}
                  onChange={(e) => setPeriodYearId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Choisir une année...</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.libelle}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={periodNom}
                  onChange={(e) => setPeriodNom(e.target.value)}
                  placeholder="Ex. Trimestre 1, Semestre 1, Séquence 1"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="trimestre">Trimestre</option>
                    <option value="semestre">Semestre</option>
                    <option value="sequence">Séquence</option>
                    <option value="autre">Autre découpage</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={periodOrdre}
                    onChange={(e) => setPeriodOrdre(Number(e.target.value))}
                    placeholder="Ordre"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Créer la période
                </button>
              </form>
            </div>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            {periods.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucune période scolaire configurée.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">Année</th>
                      <th className="py-3 px-4 font-semibold">Période</th>
                      <th className="py-3 px-4 font-semibold">Dates</th>
                      <th className="py-3 px-4 font-semibold">Statut</th>
                      {canManage && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {periods.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-4 tabular-nums">{p.annee_libelle}</td>
                        <td className="py-2.5 px-4 font-semibold">
                          {p.nom} <span className="font-normal text-slate-500">({p.type_decoupage})</span>
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-slate-600 dark:text-slate-400">
                          {p.date_debut} → {p.date_fin}
                        </td>
                        <td className="py-2.5 px-4 font-medium">
                          <span
                            className={
                              p.statut === 'active'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : p.statut === 'cloturee'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500'
                            }
                          >
                            {p.statut}
                          </span>
                        </td>
                        {canManage && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                            {p.statut !== 'active' && p.statut !== 'archivee' && (
                              <button
                                type="button"
                                onClick={() => handlePeriodStatus(p.id, 'active')}
                                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Activer
                              </button>
                            )}
                            {p.statut === 'active' && (
                              <button
                                type="button"
                                onClick={() => handlePeriodStatus(p.id, 'cloturee')}
                                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400"
                              >
                                Clôturer
                              </button>
                            )}
                            {p.statut === 'cloturee' && (
                              <button
                                type="button"
                                onClick={() => handlePeriodStatus(p.id, 'archivee')}
                                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700"
                              >
                                Archiver
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateClass}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Nouvelle classe</h2>
              <select
                required
                value={classYearId}
                onChange={(e) => setClassYearId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Choisir une année...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.libelle}
                  </option>
                ))}
              </select>
              <input
                required
                value={classNom}
                onChange={(e) => setClassNom(e.target.value)}
                placeholder="Nom de la classe (ex. Terminale S1)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  value={classNiveau}
                  onChange={(e) => setClassNiveau(e.target.value)}
                  placeholder="Niveau (ex. Terminale)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  value={classSerie}
                  onChange={(e) => setClassSerie(e.target.value)}
                  placeholder="Série (ex. S, L)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Règle absences / notes manquantes (Décision n°7)</label>
                <select
                  value={classRule}
                  onChange={(e) => setClassRule(e.target.value as MissingGradeRule)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {Object.entries(MISSING_RULE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Créer la classe
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            {classes.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucune classe enregistrée.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">Classe</th>
                      <th className="py-3 px-4 font-semibold">Niveau / Série</th>
                      <th className="py-3 px-4 font-semibold">Effectif</th>
                      <th className="py-3 px-4 font-semibold">Règle notes manquantes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {classes
                      .filter((c) => !q || c.nom.toLowerCase().includes(q) || c.niveau.toLowerCase().includes(q))
                      .map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 px-4 font-semibold">{c.nom}</td>
                          <td className="py-2.5 px-4">
                            {c.niveau} {c.serie ? `· Série ${c.serie}` : ''}
                          </td>
                          <td className="py-2.5 px-4 tabular-nums">{c.effectif ?? 0}</td>
                          <td className="py-2.5 px-4">
                            {canManage ? (
                              <select
                                value={c.regle_notes_manquantes}
                                onChange={(e) => handleUpdateMissingRule(c.id, e.target.value as MissingGradeRule)}
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                              >
                                {Object.entries(MISSING_RULE_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{MISSING_RULE_LABELS[c.regle_notes_manquantes]}</span>
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
      )}

      {tab === 'subjects' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {canManage && (
            <div className="lg:col-span-4 space-y-6">
              <form
                onSubmit={handleCreateSubject}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h2 className="font-display font-semibold text-base">Nouvelle matière</h2>
                <input
                  required
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  placeholder="Code (ex. MATH)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  required
                  value={subNom}
                  onChange={(e) => setSubNom(e.target.value)}
                  placeholder="Nom (ex. Mathématiques)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Ajouter la matière
                </button>
              </form>

              <form
                onSubmit={handleSaveClassCoeff}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h2 className="font-display font-semibold text-base">Coefficient par classe (Décision n°4)</h2>
                <select
                  required
                  value={csClasseId}
                  onChange={(e) => setCsClasseId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Choisir une classe...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={csMatiereId}
                  onChange={(e) => setCsMatiereId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Choisir une matière...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom} ({s.code})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  required
                  value={csCoeff}
                  onChange={(e) => setCsCoeff(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
                <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Enregistrer le coefficient
                </button>
              </form>
            </div>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
            {classSubjects.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Somme totale des coefficients par classe
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Array.from(
                    classSubjects.reduce((acc, cs) => {
                      const cname = cs.classe_nom || 'Classe';
                      const prev = acc.get(cname) || { total: 0, count: 0 };
                      acc.set(cname, { total: prev.total + Number(cs.coefficient), count: prev.count + 1 });
                      return acc;
                    }, new Map<string, { total: number; count: number }>())
                  ).map(([classeNom, info]) => (
                    <div
                      key={classeNom}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 tabular-nums"
                    >
                      <span className="font-semibold">{classeNom}</span> : {info.total} ({info.count} mat.)
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {classSubjects.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Aucun coefficient configuré par classe.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <th className="py-3 px-4 font-semibold">Classe</th>
                        <th className="py-3 px-4 font-semibold">Code</th>
                        <th className="py-3 px-4 font-semibold">Matière</th>
                        <th className="py-3 px-4 font-semibold text-right">Coefficient</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {classSubjects.map((cs) => (
                        <tr key={cs.id}>
                          <td className="py-2.5 px-4 font-semibold">{cs.classe_nom}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{cs.matiere_code}</td>
                          <td className="py-2.5 px-4">{cs.matiere_nom}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{cs.coefficient}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'assignments' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateAssignment}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Affecter un enseignant</h2>
              <select
                required
                value={asYearId}
                onChange={(e) => setAsYearId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Année scolaire...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.libelle}
                  </option>
                ))}
              </select>
              <select
                required
                value={asTeacherId}
                onChange={(e) => setAsTeacherId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Choisir un enseignant...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.prenom} {t.nom}
                  </option>
                ))}
              </select>
              <select
                required
                value={asClasseId}
                onChange={(e) => setAsClasseId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Classe...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <select
                required
                value={asMatiereId}
                onChange={(e) => setAsMatiereId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Matière...</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
              <button type="submit" className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Enregistrer l’affectation
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
            {assignments.length > 0 && (
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {assignments.length} affectation(s) enregistrée(s)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `affectations_enseignants_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Enseignant', 'Classe', 'Matière'],
                      assignments.map((a) => [`${a.enseignant_prenom} ${a.enseignant_nom}`, a.classe_nom, a.matiere_nom])
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exporter CSV</span>
                </button>
              </div>
            )}
            {assignments.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucune affectation enseignant enregistrée.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">Enseignant</th>
                      <th className="py-3 px-4 font-semibold">Classe</th>
                      <th className="py-3 px-4 font-semibold">Matière</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5 px-4 font-semibold">
                          {a.enseignant_prenom} {a.enseignant_nom}
                        </td>
                        <td className="py-2.5 px-4">{a.classe_nom}</td>
                        <td className="py-2.5 px-4">{a.matiere_nom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <SchoolCalendar
          user={currentUser}
          space="academic_setup"
          defaultFilter="administratif"
          refreshKey={periods.length}
        />
      )}
    </div>
  );
};
