import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Globe,
  Lock,
  Plus,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type {
  CalendarEventCategory,
  CalendarEventGroup,
  CalendarEventItem,
  UserAccount,
  UserRole,
} from '../types.ts';
import type { NavSectionId } from './LayoutShell.tsx';

export type CalendarFilterType = 'all' | CalendarEventGroup;

export type CalendarSpaceContext =
  | 'dashboard'
  | 'academic_setup'
  | 'evaluations_grades'
  | 'transmissions'
  | 'corrections'
  | 'bulletins'
  | 'results'
  | 'claims'
  | 'materials'
  | 'dossiers'
  | 'surveillance'
  | 'finance'
  | 'economat'
  | 'staff_modules'
  | 'archives'
  | 'governance_users'
  | 'inscriptions'
  | 'settings'
  | 'audit'
  | 'timetable'
  | 'communications'
  | 'profile';

interface SchoolCalendarProps {
  user: UserAccount;
  onNavigate?: (section: NavSectionId) => void;
  space?: CalendarSpaceContext;
  defaultFilter?: CalendarFilterType;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  refreshKey?: number;
}

interface ClassOption {
  id: number;
  nom: string;
}

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const GROUP_META: Record<
  CalendarEventGroup,
  {
    label: string;
    textClass: string;
    dotClass: string;
    bgTintClass: string;
  }
> = {
  evaluation: {
    label: 'Évaluations',
    textClass: 'text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-600 dark:bg-blue-400',
    bgTintClass: 'bg-blue-50/70 dark:bg-blue-950/30',
  },
  administratif: {
    label: 'Administratif',
    textClass: 'text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-600 dark:bg-amber-400',
    bgTintClass: 'bg-amber-50/70 dark:bg-amber-950/30',
  },
  vacances: {
    label: 'Vacances',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    bgTintClass: 'bg-emerald-50/70 dark:bg-emerald-950/30',
  },
};

function getCategoryDisplay(cat: CalendarEventCategory): {
  label: string;
  icon: React.FC<{ className?: string }>;
} {
  switch (cat) {
    case 'evaluation':
      return { label: 'Évaluation', icon: ClipboardCheck };
    case 'conseil_classe':
      return { label: 'Conseil de classe', icon: Users };
    case 'vacances':
      return { label: 'Vacances scolaires', icon: Sun };
    case 'administratif':
      return { label: 'Administratif', icon: Briefcase };
    default:
      return { label: 'Événement administratif', icon: CalendarDays };
  }
}

function getSpaceMetadata(
  space: CalendarSpaceContext,
  role: UserRole
): {
  title: string;
  subtitle: string;
  recommendedFilter: CalendarFilterType;
  defaultFormCategory: 'conseil_classe' | 'administratif' | 'vacances';
} {
  switch (space) {
    case 'academic_setup':
      return {
        title: 'Calendrier des périodes, conseils de classe et vacances',
        subtitle:
          role === 'enseignant'
            ? 'Repères des périodes scolaires, conseils de classe et congés'
            : 'Synchronisé avec les périodes scolaires créées ; planifiez ici conseils et vacances',
        recommendedFilter: 'administratif',
        defaultFormCategory: 'vacances',
      };
    case 'evaluations_grades':
      return {
        title: 'Calendrier des évaluations',
        subtitle:
          role === 'enseignant'
            ? 'Visualisez vos évaluations programmées et évitez les chevauchements par classe'
            : 'Suivi mensuel des dates d’évaluations planifiées dans l’établissement',
        recommendedFilter: 'evaluation',
        defaultFormCategory: 'conseil_classe',
      };
    case 'transmissions':
    case 'corrections':
      return {
        title: 'Échéancier des évaluations et clôtures administratives',
        subtitle: 'Repérez les dates d’évaluations et les clôtures de périodes avant validation',
        recommendedFilter: 'evaluation',
        defaultFormCategory: 'administratif',
      };
    case 'bulletins':
    case 'results':
    case 'claims':
      return {
        title: 'Calendrier des conseils de classe et publications',
        subtitle:
          role === 'eleve' || role === 'parent'
            ? 'Dates de conseils de classe, périodes officielles et évaluations de la classe'
            : 'Planifiez et consultez les conseils de classe et échéances de publication des bulletins',
        recommendedFilter: 'administratif',
        defaultFormCategory: 'conseil_classe',
      };
    case 'materials':
      return {
        title: 'Calendrier des évaluations et révisions',
        subtitle:
          role === 'enseignant'
            ? 'Alignez le dépôt de vos supports de cours avec les prochaines évaluations'
            : 'Anticipez les prochaines évaluations et périodes de vacances pour vos révisions',
        recommendedFilter: 'evaluation',
        defaultFormCategory: 'administratif',
      };
    case 'surveillance':
      return {
        title: 'Calendrier scolaire · Jours d’évaluation et vacances',
        subtitle: 'Vérifiez les jours d’évaluations et de vacances lors du suivi des absences',
        recommendedFilter: 'all',
        defaultFormCategory: 'administratif',
      };
    case 'finance':
      return {
        title: 'Calendrier administratif et échéances scolaires',
        subtitle:
          role === 'eleve' || role === 'parent'
            ? 'Dates administratives clés et vacances scolaires de l’établissement'
            : 'Repères administratifs, périodes scolaires et vacances pour la gestion financière',
        recommendedFilter: 'administratif',
        defaultFormCategory: 'administratif',
      };
    case 'economat':
    case 'staff_modules':
    case 'archives':
    case 'dossiers':
    case 'governance_users':
    case 'inscriptions':
    case 'settings':
    case 'audit':
      return {
        title: 'Calendrier administratif de l’établissement',
        subtitle: 'Conseils de classe, ouvertures/clôtures de périodes et vacances scolaires',
        recommendedFilter: 'administratif',
        defaultFormCategory: 'administratif',
      };
    case 'dashboard':
    default: {
      if (role === 'enseignant') {
        return {
          title: 'Calendrier scolaire et dates clés',
          subtitle: 'Vos évaluations planifiées, conseils de classe et vacances scolaires',
          recommendedFilter: 'all',
          defaultFormCategory: 'conseil_classe',
        };
      }
      if (role === 'eleve' || role === 'parent') {
        return {
          title: 'Calendrier scolaire et dates clés',
          subtitle: 'Évaluations de la classe, conseils de classe, périodes et vacances scolaires',
          recommendedFilter: 'all',
          defaultFormCategory: 'conseil_classe',
        };
      }
      if (['fondateur', 'proviseur', 'censeur', 'secretaire'].includes(role)) {
        return {
          title: 'Calendrier scolaire et dates clés',
          subtitle: 'Pilotage des évaluations, conseils de classe, échéances administratives et vacances',
          recommendedFilter: 'all',
          defaultFormCategory: 'conseil_classe',
        };
      }
      return {
        title: 'Calendrier scolaire et dates clés',
        subtitle: 'Vue mensuelle des évaluations, dates administratives et vacances scolaires',
        recommendedFilter: 'all',
        defaultFormCategory: 'administratif',
      };
    }
  }
}

function toYmd(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatYmdFr(ymd: string): string {
  const d = parseYmdLocal(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFullDateFr(ymd: string): string {
  const d = parseYmdLocal(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const SchoolCalendar: React.FC<SchoolCalendarProps> = ({
  user,
  onNavigate,
  space = 'dashboard',
  defaultFilter,
  collapsible = false,
  defaultExpanded = true,
  refreshKey = 0,
}) => {
  const meta = useMemo(() => getSpaceMetadata(space, user.role), [space, user.role]);
  const initialFilter = defaultFilter ?? meta.recommendedFilter;

  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(
    () => toYmd(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  );

  const [expanded, setExpanded] = useState<boolean>(collapsible ? defaultExpanded : true);
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd);
  const [filterGroup, setFilterGroup] = useState<CalendarFilterType>(initialFilter);

  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isProviseur = user.role === 'proviseur';
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState<'evaluation' | 'conseil_classe' | 'administratif' | 'vacances'>(
    meta.defaultFormCategory
  );
  const [visibilite, setVisibilite] = useState<'etablissement' | 'personnel'>(
    isProviseur ? 'etablissement' : 'personnel'
  );
  const [dateDebut, setDateDebut] = useState(todayYmd);
  const [dateFin, setDateFin] = useState(todayYmd);
  const [classeId, setClasseId] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setFilterGroup(defaultFilter ?? meta.recommendedFilter);
    setCategorie(meta.defaultFormCategory);
    setVisibilite(isProviseur ? 'etablissement' : 'personnel');
  }, [defaultFilter, meta.recommendedFilter, meta.defaultFormCategory, isProviseur]);

  const canOpenEvaluations = ['enseignant', 'proviseur', 'censeur', 'secretaire'].includes(user.role);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ events: CalendarEventItem[]; classes: ClassOption[] }>('/api/calendar');
      setEvents(res.events);
      setClasses(res.classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger le calendrier.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, refreshKey]);

  const monthTitle = useMemo(() => {
    const label = new Date(viewYear, viewMonth, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [viewYear, viewMonth]);

  const monthStartYmd = useMemo(() => toYmd(viewYear, viewMonth, 1), [viewYear, viewMonth]);
  const monthEndYmd = useMemo(() => {
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    return toYmd(viewYear, viewMonth, lastDay);
  }, [viewYear, viewMonth]);

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: Array<{ ymd: string; dayNumber: number; inCurrentMonth: boolean }> = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(viewYear, viewMonth, 1 - startOffset + i);
      cells.push({
        ymd: toYmd(d.getFullYear(), d.getMonth(), d.getDate()),
        dayNumber: d.getDate(),
        inCurrentMonth: d.getMonth() === viewMonth && d.getFullYear() === viewYear,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const filteredEvents = useMemo(() => {
    if (filterGroup === 'all') return events;
    return events.filter((ev) => ev.type_groupe === filterGroup);
  }, [events, filterGroup]);

  const monthEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.date_debut <= monthEndYmd && ev.date_fin >= monthStartYmd),
    [filteredEvents, monthStartYmd, monthEndYmd]
  );

  const selectedDayEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.date_debut <= selectedDate && ev.date_fin >= selectedDate),
    [filteredEvents, selectedDate]
  );

  const upcomingEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.date_fin >= todayYmd),
    [filteredEvents, todayYmd]
  );

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(todayYmd);
  };

  const handleOpenAddForm = () => {
    setDateDebut(selectedDate);
    setDateFin(selectedDate);
    setShowForm(true);
    setExpanded(true);
    setError(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/calendar', {
        method: 'POST',
        body: JSON.stringify({
          titre,
          categorie,
          visibilite: isProviseur ? visibilite : 'personnel',
          date_debut: dateDebut,
          date_fin: dateFin || dateDebut,
          classe_id: isProviseur && visibilite === 'etablissement' && classeId ? Number(classeId) : null,
          description: description || null,
        }),
      });
      setTitre('');
      setDescription('');
      setClasseId('');
      setShowForm(false);
      const target = parseYmdLocal(dateDebut);
      setViewYear(target.getFullYear());
      setViewMonth(target.getMonth());
      setSelectedDate(dateDebut);
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (sourceId: number) => {
    setError(null);
    try {
      await apiFetch(`/api/calendar/${sourceId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
      {/* Header & Controls */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${
          expanded ? 'pb-4 border-b border-slate-200 dark:border-slate-800' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white truncate">
              {meta.title}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {meta.subtitle}
            <span aria-hidden="true"> · </span>
            {upcomingEvents.length === 0
              ? '0 date à venir'
              : `${upcomingEvents.length} date(s) à venir (prochaine : ${formatYmdFr(upcomingEvents[0].date_debut)})`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {expanded && (
            <div
              role="group"
              aria-label="Filtrer par type d’événement"
              className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5"
            >
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'evaluation', label: 'Évaluations' },
                  { id: 'administratif', label: 'Administratif' },
                  { id: 'vacances', label: 'Vacances' },
                ] as const
              ).map((tab) => {
                const active = filterGroup === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterGroup(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={showForm ? () => setShowForm(false) : handleOpenAddForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? 'Fermer' : isProviseur ? 'Publier au calendrier' : 'Ajouter un événement'}
          </button>

          {user.role === 'enseignant' && space === 'dashboard' && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('evaluations_grades')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Planifier une évaluation
            </button>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Masquer le calendrier
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Afficher le calendrier
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Creation Form — School-wide for Proviseur, strictly private personal for all other users */}
          {showForm && (
            <form
              onSubmit={handleCreateEvent}
              className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {isProviseur
                    ? 'Nouvel événement officiel ou personnel'
                    : 'Nouvel événement personnel (privé)'}
                </h3>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isProviseur && visibilite === 'etablissement' ? (
                    <>
                      <Globe className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                      <span>Visible par tous les inscrits (administration, enseignants, élèves et parents)</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>Visible uniquement par vous sur votre calendrier</span>
                    </>
                  )}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Intitulé de l’événement
                  </label>
                  <input
                    type="text"
                    required
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder={
                      isProviseur
                        ? 'Ex. Trimestre 1, Conseil de classe ou Vacances de Noël'
                        : 'Ex. Révision maths, Rendez-vous scolaire ou Rappel personnel'
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Type d’événement
                  </label>
                  <select
                    value={categorie}
                    onChange={(e) =>
                      setCategorie(
                        e.target.value as 'evaluation' | 'conseil_classe' | 'administratif' | 'vacances'
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {isProviseur ? (
                      <>
                        <option value="administratif">Administratif · Trimestre / Période / Réunion</option>
                        <option value="conseil_classe">Administratif · Conseil de classe</option>
                        <option value="vacances">Vacances scolaires</option>
                        <option value="evaluation">Évaluation · Examen officiel</option>
                      </>
                    ) : (
                      <>
                        <option value="administratif">Administratif · Rappel / Échéance personnelle</option>
                        <option value="evaluation">Évaluation · Révision / Préparation</option>
                        <option value="vacances">Vacances · Congé / Indisponibilité</option>
                      </>
                    )}
                  </select>
                </div>

                {isProviseur ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Visibilité
                    </label>
                    <select
                      value={visibilite}
                      onChange={(e) => setVisibilite(e.target.value as 'etablissement' | 'personnel')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="etablissement">Tout l’établissement (public)</option>
                      <option value="personnel">Personnel uniquement (privé)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Confidentialité
                    </label>
                    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>Strictement personnel</span>
                    </div>
                  </div>
                )}

                {isProviseur && visibilite === 'etablissement' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Classe concernée (optionnel)
                    </label>
                    <select
                      value={classeId}
                      onChange={(e) => setClasseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Tout l’établissement</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date de début
                  </label>
                  <input
                    type="date"
                    required
                    value={dateDebut}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDateDebut(val);
                      if (dateFin < val) setDateFin(val);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date de fin
                  </label>
                  <input
                    type="date"
                    required
                    min={dateDebut}
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className={isProviseur && visibilite === 'etablissement' ? 'sm:col-span-1' : 'sm:col-span-2'}>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Précisions (horaire, salle, notes)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex. Salle des professeurs · 15h00"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer au calendrier'}
                </button>
              </div>
            </form>
          )}

          {/* Main Split: Calendar Grid + Day / Month Details */}
          <div className="grid lg:grid-cols-12 gap-6 mt-5">
            {/* Left: Interactive Monthly Grid */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    aria-label="Mois précédent"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-display font-semibold text-sm text-slate-900 dark:text-white min-w-[140px] text-center">
                    {monthTitle}
                  </span>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    aria-label="Mois suivant"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {monthEvents.length} ce mois
                  </span>
                  <button
                    type="button"
                    onClick={goToday}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Aujourd’hui
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                  {WEEKDAYS_FR.map((day) => (
                    <div
                      key={day}
                      className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800/80">
                  {calendarCells.map((cell) => {
                    const dayEvents = filteredEvents.filter(
                      (ev) => ev.date_debut <= cell.ymd && ev.date_fin >= cell.ymd
                    );
                    const hasVacances = dayEvents.some((ev) => ev.type_groupe === 'vacances');
                    const isToday = cell.ymd === todayYmd;
                    const isSelected = cell.ymd === selectedDate;

                    const distinctGroups = Array.from(
                      new Set(dayEvents.map((ev) => ev.type_groupe))
                    ) as CalendarEventGroup[];

                    return (
                      <button
                        key={cell.ymd}
                        type="button"
                        onClick={() => setSelectedDate(cell.ymd)}
                        className={`min-h-[60px] sm:min-h-[68px] p-1.5 flex flex-col justify-between text-left transition-colors focus:outline-none ${
                          isSelected
                            ? 'bg-slate-900 text-white dark:bg-blue-700 dark:text-white'
                            : hasVacances
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/25 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/40'
                            : cell.inCurrentMonth
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            : 'bg-slate-50/60 dark:bg-slate-950/40 text-slate-400 dark:text-slate-600 hover:bg-slate-100/60 dark:hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              isSelected
                                ? 'text-white font-semibold'
                                : isToday
                                ? 'text-blue-700 dark:text-blue-400 font-bold underline underline-offset-4'
                                : cell.inCurrentMonth
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                            }`}
                          >
                            {cell.dayNumber}
                          </span>
                          {dayEvents.length > 0 && (
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                isSelected ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {dayEvents.length}
                            </span>
                          )}
                        </div>

                        {dayEvents.length > 0 && (
                          <div className="space-y-0.5 mt-1 w-full">
                            <div className="flex items-center gap-1 flex-wrap">
                              {distinctGroups.map((grp) => (
                                <span
                                  key={grp}
                                  className={`w-2 h-2 rounded-full ${
                                    isSelected ? 'bg-white' : GROUP_META[grp].dotClass
                                  }`}
                                />
                              ))}
                            </div>
                            <p
                              className={`hidden sm:block text-[10px] truncate leading-tight ${
                                isSelected ? 'text-slate-100' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {dayEvents[0].titre}
                            </p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Unboxed Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
                {(['evaluation', 'administratif', 'vacances'] as CalendarEventGroup[]).map((grp) => (
                  <span key={grp} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${GROUP_META[grp].dotClass}`} />
                    <span>
                      {grp === 'administratif' ? 'Administratif (conseils & périodes)' : GROUP_META[grp].label}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Selected Day Details + Chronological Month Key Dates */}
            <div className="lg:col-span-5 flex flex-col divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              {/* Selected Day Panel */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {formatFullDateFr(selectedDate)}
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {selectedDayEvents.length} événement(s)
                  </span>
                </div>

                {loading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4">Chargement du calendrier...</p>
                ) : selectedDayEvents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                    Aucune date clé prévue pour ce jour.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {selectedDayEvents.map((ev) => {
                      const grpMeta = GROUP_META[ev.type_groupe];
                      const catDisp = getCategoryDisplay(ev.categorie);
                      const Icon = catDisp.icon;
                      return (
                        <div
                          key={ev.id}
                          className={`rounded-lg p-3 border border-slate-200/80 dark:border-slate-800 ${grpMeta.bgTintClass}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className={`inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold ${grpMeta.textClass}`}>
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                <span>{catDisp.label}</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-normal text-slate-500 dark:text-slate-400">
                                  {ev.visibilite === 'personnel' ? (
                                    <>
                                      <Lock className="w-3 h-3" />
                                      Personnel
                                    </>
                                  ) : (
                                    <>
                                      <Globe className="w-3 h-3" />
                                      Établissement
                                    </>
                                  )}
                                </span>
                                {ev.classe_nom && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{ev.classe_nom}</span>
                                  </>
                                )}
                                {ev.matiere_nom && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{ev.matiere_nom}</span>
                                  </>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">
                                {ev.titre}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                                {ev.date_debut === ev.date_fin
                                  ? formatYmdFr(ev.date_debut)
                                  : `Du ${formatYmdFr(ev.date_debut)} au ${formatYmdFr(ev.date_fin)}`}
                              </p>
                              {ev.description && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                                  {ev.description}
                                </p>
                              )}
                            </div>

                            {ev.source === 'calendar_event' &&
                              (ev.est_proprietaire || (isProviseur && ev.visibilite === 'etablissement')) && (
                              <div className="shrink-0">
                                {confirmDeleteId === ev.source_id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEvent(ev.source_id)}
                                      className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-medium hover:bg-red-700"
                                    >
                                      Supprimer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-1.5 py-0.5 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:underline"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(ev.source_id)}
                                    aria-label={`Supprimer ${ev.titre}`}
                                    className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {ev.source === 'evaluation' && canOpenEvaluations && onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate('evaluations_grades')}
                              className="mt-2 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              Ouvrir dans Évaluations &amp; Notes →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Month Chronological Agenda */}
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Agenda de {monthTitle.toLowerCase()}
                </h3>

                {monthEvents.length === 0 ? (
                  <div className="py-6 text-center space-y-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Aucune date clé programmée ce mois-ci
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Les évaluations créées, conseils de classe, périodes et vacances s’afficheront ici.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[220px] overflow-y-auto pr-1">
                    {monthEvents.map((ev) => {
                      const grpMeta = GROUP_META[ev.type_groupe];
                      const catDisp = getCategoryDisplay(ev.categorie);
                      const isActiveDay = ev.date_debut <= selectedDate && ev.date_fin >= selectedDate;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedDate(ev.date_debut)}
                          className={`w-full py-2.5 px-2 -mx-2 rounded-lg text-left flex items-start justify-between gap-3 transition-colors ${
                            isActiveDay
                              ? 'bg-slate-100/80 dark:bg-slate-800/70'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${grpMeta.dotClass}`} />
                              <span className={`text-[11px] font-medium ${grpMeta.textClass}`}>
                                {catDisp.label}
                              </span>
                              {ev.visibilite === 'personnel' && (
                                <Lock className="w-3 h-3 text-slate-400 shrink-0" aria-label="Événement personnel" />
                              )}
                              {ev.classe_nom && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  · {ev.classe_nom}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-slate-900 dark:text-white truncate mt-0.5">
                              {ev.titre}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            {ev.date_debut === ev.date_fin
                              ? formatYmdFr(ev.date_debut)
                              : `${formatYmdFr(ev.date_debut)} → ${formatYmdFr(ev.date_fin)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
