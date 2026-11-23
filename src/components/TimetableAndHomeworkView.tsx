import React, { useEffect, useState } from 'react';
import { BookOpenCheck, Clock, Download, Plus, Trash2 } from 'lucide-react';
import { apiFetch, downloadCsv } from '../lib/api.ts';
import { DAYS_FR, formatDateFr } from '../lib/labels.ts';
import type {
  AcademicYear,
  HomeworkAssignment,
  SchoolClass,
  Subject,
  TimetableSlot,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface TimetableAndHomeworkViewProps {
  currentUser: UserAccount;
  searchQuery: string;
}

export const TimetableAndHomeworkView: React.FC<TimetableAndHomeworkViewProps> = ({
  currentUser,
  searchQuery,
}) => {
  const [tab, setTab] = useState<'timetable' | 'homework'>('timetable');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<UserAccount[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Timetable creation form (Proviseur / Censeur)
  const [slotClassId, setSlotClassId] = useState<number>(0);
  const [slotSubjectId, setSlotSubjectId] = useState<number>(0);
  const [slotTeacherId, setSlotTeacherId] = useState<number>(0);
  const [slotDay, setSlotDay] = useState<number>(1);
  const [slotStart, setSlotStart] = useState('08:00');
  const [slotEnd, setSlotEnd] = useState('10:00');
  const [slotSalle, setSlotSalle] = useState('');

  // Homework creation form (Enseignant / Proviseur / Censeur)
  const [hwClassId, setHwClassId] = useState<number>(0);
  const [hwSubjectId, setHwSubjectId] = useState<number>(0);
  const [hwTitle, setHwTitle] = useState('');
  const [hwConsignes, setHwConsignes] = useState('');
  const [hwDateLimite, setHwDateLimite] = useState(new Date().toISOString().slice(0, 10));
  const [hwBareme, setHwBareme] = useState('');

  const canManageTimetable = ['proviseur', 'censeur'].includes(currentUser.role);
  const canManageHomework = ['enseignant', 'proviseur', 'censeur'].includes(currentUser.role);

  const loadAll = async () => {
    setError(null);
    try {
      const [ttRes, hwRes, cRes, sRes, yRes] = await Promise.all([
        apiFetch<{ slots: TimetableSlot[] }>('/api/timetable'),
        apiFetch<{ homework: HomeworkAssignment[] }>('/api/homework'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ subjects: Subject[] }>('/api/subjects'),
        apiFetch<{ years: AcademicYear[] }>('/api/academic-years'),
      ]);
      setSlots(ttRes.slots);
      setHomework(hwRes.homework);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
      setYears(yRes.years);

      if (cRes.classes[0]) {
        setSlotClassId((p) => p || cRes.classes[0].id);
        setHwClassId((p) => p || cRes.classes[0].id);
      }
      if (sRes.subjects[0]) {
        setSlotSubjectId((p) => p || sRes.subjects[0].id);
        setHwSubjectId((p) => p || sRes.subjects[0].id);
      }

      if (canManageTimetable) {
        try {
          const uRes = await apiFetch<{ users: UserAccount[] }>('/api/users?role=enseignant');
          setTeachers(uRes.users.filter((u) => u.statut === 'actif'));
          if (uRes.users[0]) setSlotTeacherId((p) => p || uRes.users[0].id);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    const activeYear = years.find((y) => y.est_active) || years[0];
    try {
      await apiFetch('/api/timetable', {
        method: 'POST',
        body: JSON.stringify({
          annee_id: activeYear?.id,
          classe_id: slotClassId,
          matiere_id: slotSubjectId,
          enseignant_id: slotTeacherId,
          jour_semaine: slotDay,
          heure_debut: slotStart,
          heure_fin: slotEnd,
          salle: slotSalle,
        }),
      });
      setSlotSalle('');
      setFeedback('Créneau ajouté à l’emploi du temps.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteSlot = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/timetable/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/homework', {
        method: 'POST',
        body: JSON.stringify({
          classe_id: hwClassId,
          matiere_id: hwSubjectId,
          titre: hwTitle,
          consignes: hwConsignes,
          date_limite: hwDateLimite,
          bareme: hwBareme ? Number(hwBareme) : null,
        }),
      });
      setHwTitle('');
      setHwConsignes('');
      setHwBareme('');
      setFeedback('Devoir / travail à faire publié dans le cahier de textes.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteHomework = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/homework/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredSlots = slots.filter((s) => {
    if (selectedClassId && s.classe_id !== selectedClassId) return false;
    if (q) {
      return `${s.classe_nom || ''} ${s.matiere_nom || ''} ${s.enseignant_nom || ''} ${s.salle || ''}`
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const filteredHomework = homework.filter((h) => {
    if (selectedClassId && h.classe_id !== selectedClassId) return false;
    if (q) {
      return `${h.titre} ${h.consignes} ${h.classe_nom || ''} ${h.matiere_nom || ''}`.toLowerCase().includes(q);
    }
    return true;
  });

  const handleExportTimetableCsv = () => {
    downloadCsv(
      'emploi_du_temps_prosper_kamara.csv',
      ['Jour', 'Début', 'Fin', 'Classe', 'Matière', 'Enseignant', 'Salle'],
      filteredSlots.map((s) => [
        DAYS_FR.find((d) => d.value === s.jour_semaine)?.label || String(s.jour_semaine),
        s.heure_debut,
        s.heure_fin,
        s.classe_nom || '',
        s.matiere_nom || '',
        s.enseignant_nom || '',
        s.salle || '',
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Emploi du temps & Cahier de textes
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Planning hebdomadaire des cours (Lundi–Samedi) et devoirs à faire par classe
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value={0}>Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportTimetableCsv}
            disabled={filteredSlots.length === 0}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
        <button
          type="button"
          onClick={() => setTab('timetable')}
          className={`px-4 py-2 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${
            tab === 'timetable'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Emploi du temps ({filteredSlots.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('homework')}
          className={`px-4 py-2 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${
            tab === 'homework'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BookOpenCheck className="w-3.5 h-3.5" />
          <span>Cahier de textes & Devoirs ({filteredHomework.length})</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar user={currentUser} space="timetable" collapsible defaultExpanded={false} />

      {tab === 'timetable' ? (
        <div className="space-y-6">
          {canManageTimetable && (
            <form
              onSubmit={handleAddSlot}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <h2 className="font-display font-semibold text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>Programmer un créneau hebdomadaire</span>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Classe</label>
                  <select
                    required
                    value={slotClassId}
                    onChange={(e) => setSlotClassId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Matière</label>
                  <select
                    required
                    value={slotSubjectId}
                    onChange={(e) => setSlotSubjectId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Enseignant</label>
                  <select
                    required
                    value={slotTeacherId}
                    onChange={(e) => setSlotTeacherId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.prenom} {t.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Jour</label>
                  <select
                    value={slotDay}
                    onChange={(e) => setSlotDay(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {DAYS_FR.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Heure début</label>
                  <input
                    type="time"
                    required
                    value={slotStart}
                    onChange={(e) => setSlotStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Heure fin</label>
                  <input
                    type="time"
                    required
                    value={slotEnd}
                    onChange={(e) => setSlotEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Salle (optionnel)</label>
                  <input
                    value={slotSalle}
                    onChange={(e) => setSlotSalle(e.target.value)}
                    placeholder="Ex. Salle B12"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
                  >
                    Ajouter le créneau
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Weekly Grid (Mon - Sat) */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {DAYS_FR.map((day) => {
              const daySlots = filteredSlots.filter((s) => s.jour_semaine === day.value);
              return (
                <section
                  key={day.value}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">{day.label}</h3>
                    <span className="text-[11px] text-slate-500 tabular-nums">{daySlots.length} cours</span>
                  </div>
                  {daySlots.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">Aucun cours programmé</p>
                  ) : (
                    <div className="space-y-2">
                      {daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {slot.matiere_nom}
                            </p>
                            <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 tabular-nums">
                              {slot.heure_debut} – {slot.heure_fin} · {slot.classe_nom}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {slot.enseignant_nom}
                              {slot.salle ? ` · ${slot.salle}` : ''}
                            </p>
                          </div>
                          {canManageTimetable && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                              aria-label="Supprimer ce créneau"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          {canManageHomework && (
            <form
              onSubmit={handleAddHomework}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Nouveau devoir / Cahier de textes</h2>
              <div>
                <label className="block text-xs font-medium mb-1">Classe</label>
                <select
                  required
                  value={hwClassId}
                  onChange={(e) => setHwClassId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Matière</label>
                <select
                  required
                  value={hwSubjectId}
                  onChange={(e) => setHwSubjectId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Titre du travail</label>
                <input
                  required
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                  placeholder="Ex. Exercices chap. 4 sur les équations"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date limite</label>
                  <input
                    type="date"
                    required
                    value={hwDateLimite}
                    onChange={(e) => setHwDateLimite(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Barème (optionnel)</label>
                  <input
                    type="number"
                    min={1}
                    value={hwBareme}
                    onChange={(e) => setHwBareme(e.target.value)}
                    placeholder="Ex. 20"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Consignes détaillées</label>
                <textarea
                  required
                  rows={4}
                  value={hwConsignes}
                  onChange={(e) => setHwConsignes(e.target.value)}
                  placeholder="Pages, exercices, matériel requis..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
              >
                Publier le travail à faire
              </button>
            </form>
          )}

          <div
            className={`${
              canManageHomework ? 'lg:col-span-8' : 'lg:col-span-12'
            } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            {filteredHomework.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucun devoir publié pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredHomework.map((hw) => {
                  const canDel =
                    hw.enseignant_id === currentUser.id || ['proviseur', 'censeur'].includes(currentUser.role);
                  return (
                    <div key={hw.id} className="p-5 flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">{hw.titre}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-blue-700 dark:text-blue-400 font-medium">
                            {hw.classe_nom} · {hw.matiere_nom}
                          </span>
                          {hw.bareme && (
                            <span className="text-slate-500 tabular-nums">· Sur /{hw.bareme}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{hw.consignes}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          Pour le {formatDateFr(hw.date_limite)} · Par {hw.enseignant_nom}
                        </p>
                      </div>
                      {canDel && (
                        <button
                          type="button"
                          onClick={() => handleDeleteHomework(hw.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                          aria-label="Supprimer ce devoir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
