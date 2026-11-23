import React from 'react';
import { ArrowRight, Clock, Mail, Megaphone, Pin } from 'lucide-react';
import { ROLE_LABELS, formatDateTimeFr } from '../lib/labels.ts';
import type {
  AcademicYear,
  AnnouncementItem,
  AuditLog,
  SchoolPeriod,
  TimetableSlot,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';
import type { NavSectionId } from './LayoutShell.tsx';

export interface DashboardData {
  activeYear: AcademicYear | null;
  activePeriod: SchoolPeriod | null;
  counts: {
    eleves: number;
    classes: number;
    enseignants: number;
    personnel: number;
    inscriptions_attente: number;
    reexamens: number;
    evaluations: number;
    transmissions_attente: number;
    bulletins_a_signer: number;
    bulletins_a_verifier: number;
    bulletins_distribues: number;
    corrections_en_cours: number;
    reclamations_ouvertes: number;
    absences: number;
    incidents: number;
    supports_cours: number;
    devoirs?: number;
    messages_non_lus?: number;
    resets_attente?: number;
    stock_alerte?: number;
  };
  finance: { totalPayments: number; totalExpenses: number; soldeNet: number } | null;
  classDistribution: { nom: string; effectif: number }[];
  recentLogs: AuditLog[];
  todayTimetable?: TimetableSlot[];
  recentAnnouncements?: AnnouncementItem[];
}

interface DashboardViewProps {
  user: UserAccount;
  data: DashboardData | null;
  onNavigate: (section: NavSectionId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, data, onNavigate }) => {
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const c = data.counts;
  const unreadMsgs = c.messages_non_lus ?? 0;

  // Role-tailored KPI cards (Décision n°15) — all values strictly from real SQLite DB
  const kpis: { label: string; value: number | string; target: NavSectionId }[] = (() => {
    switch (user.role) {
      case 'fondateur':
        return [
          { label: 'Élèves inscrits', value: c.eleves, target: 'dossiers' },
          { label: 'Classes ouvertes', value: c.classes, target: 'academic_setup' },
          { label: 'Personnel actif', value: c.personnel, target: 'governance_users' },
          { label: 'Bulletins distribués', value: c.bulletins_distribues, target: 'results' },
        ];
      case 'proviseur':
        return [
          {
            label: 'Inscriptions & accès en attente',
            value: c.inscriptions_attente + c.reexamens + (c.resets_attente ?? 0),
            target: 'inscriptions',
          },
          { label: 'Bulletins à signer', value: c.bulletins_a_signer, target: 'bulletins' },
          { label: 'Corrections à autoriser', value: c.corrections_en_cours, target: 'corrections' },
          { label: 'Personnel actif', value: c.personnel, target: 'governance_users' },
        ];
      case 'censeur':
        return [
          { label: 'Bulletins à vérifier', value: c.bulletins_a_verifier, target: 'bulletins' },
          { label: 'Corrections à examiner', value: c.corrections_en_cours, target: 'corrections' },
          { label: 'Incidents disciplinaires', value: c.incidents, target: 'surveillance' },
          { label: 'Réclamations ouvertes', value: c.reclamations_ouvertes, target: 'claims' },
        ];
      case 'secretaire':
        return [
          { label: 'Dossiers élèves', value: c.eleves, target: 'dossiers' },
          { label: 'Transmissions à contrôler', value: c.transmissions_attente, target: 'transmissions' },
          { label: 'Réclamations ouvertes', value: c.reclamations_ouvertes, target: 'claims' },
          { label: 'Bulletins distribués', value: c.bulletins_distribues, target: 'bulletins' },
        ];
      case 'enseignant':
        return [
          { label: 'Classes de l’établissement', value: c.classes, target: 'academic_setup' },
          { label: 'Évaluations enregistrées', value: c.evaluations, target: 'evaluations_grades' },
          { label: 'Devoirs actifs', value: c.devoirs ?? 0, target: 'timetable' },
          { label: 'Supports publiés', value: c.supports_cours, target: 'materials' },
        ];
      case 'surveillant':
        return [
          { label: 'Élèves suivis', value: c.eleves, target: 'dossiers' },
          { label: 'Absences enregistrées', value: c.absences, target: 'surveillance' },
          { label: 'Incidents signalés', value: c.incidents, target: 'surveillance' },
          { label: 'Classes actives', value: c.classes, target: 'timetable' },
        ];
      case 'comptable':
        return [
          {
            label: 'Encaissements',
            value: data.finance ? `${data.finance.totalPayments.toLocaleString('fr-FR')} FCFA` : '0 FCFA',
            target: 'finance',
          },
          {
            label: 'Dépenses',
            value: data.finance ? `${data.finance.totalExpenses.toLocaleString('fr-FR')} FCFA` : '0 FCFA',
            target: 'finance',
          },
          {
            label: 'Solde net',
            value: data.finance ? `${data.finance.soldeNet.toLocaleString('fr-FR')} FCFA` : '0 FCFA',
            target: 'finance',
          },
          { label: 'Élèves actifs', value: c.eleves, target: 'finance' },
        ];
      case 'economat':
        return [
          { label: 'Alertes seuil de stock', value: c.stock_alerte ?? 0, target: 'economat' },
          { label: 'Classes ouvertes', value: c.classes, target: 'economat' },
          { label: 'Élèves actifs', value: c.eleves, target: 'economat' },
          { label: 'Messages non lus', value: unreadMsgs, target: 'communications' },
        ];
      default:
        return [
          { label: 'Bulletins publiés', value: c.bulletins_distribues, target: 'bulletins' },
          { label: 'Devoirs à rendre', value: c.devoirs ?? 0, target: 'timetable' },
          { label: 'Supports de cours', value: c.supports_cours, target: 'materials' },
          { label: 'Messages non lus', value: unreadMsgs, target: 'communications' },
        ];
    }
  })();

  const primaryAction: { label: string; target: NavSectionId } | null = (() => {
    switch (user.role) {
      case 'fondateur':
        return { label: 'Gérer le proviseur et les comptes', target: 'governance_users' };
      case 'proviseur':
        return { label: 'Configurer périodes & classes', target: 'academic_setup' };
      case 'censeur':
        return { label: 'Vérifier les bulletins & corrections', target: 'bulletins' };
      case 'enseignant':
        return { label: 'Saisir ou importer des notes', target: 'evaluations_grades' };
      case 'secretaire':
        return { label: 'Ouvrir un dossier élève', target: 'dossiers' };
      case 'surveillant':
        return { label: 'Saisir absences & incidents', target: 'surveillance' };
      case 'comptable':
        return { label: 'Enregistrer un paiement', target: 'finance' };
      case 'economat':
        return { label: 'Gérer le stock économat', target: 'economat' };
      case 'eleve':
      case 'parent':
        return { label: 'Consulter résultats & bulletins', target: 'results' };
      default:
        return { label: 'Accéder à mon module', target: 'staff_modules' };
    }
  })();

  const maxClassEff = Math.max(1, ...data.classDistribution.map((cl) => cl.effectif));
  const todaySlots = data.todayTimetable || [];
  const announcements = data.recentAnnouncements || [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Espace {ROLE_LABELS[user.role]}
            <span aria-hidden="true"> · </span>
            Année : {data.activeYear ? data.activeYear.libelle : 'Aucune année active'}
            <span aria-hidden="true"> · </span>
            Période : {data.activePeriod ? data.activePeriod.nom : 'Aucune période active'}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Bienvenue, {user.prenom} {user.nom}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('communications')}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Messagerie{unreadMsgs > 0 ? ` (${unreadMsgs})` : ''}</span>
          </button>
          {primaryAction && (
            <button
              type="button"
              onClick={() => onNavigate(primaryAction.target)}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onNavigate(item.target)}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {item.value}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors shrink-0" />
            </div>
          </button>
        ))}
      </section>

      {/* Interactive School Calendar */}
      <SchoolCalendar
        user={user}
        onNavigate={onNavigate}
        space="dashboard"
        defaultFilter={
          user.preferences?.calendar_default_filter === 'tous' || !user.preferences?.calendar_default_filter
            ? 'all'
            : user.preferences.calendar_default_filter
        }
      />

      {/* Official Announcements + Today's Timetable */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Notes de service & Annonces
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('communications')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
            >
              Tout voir
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Aucune annonce publiée</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Les communications officielles de la direction s’afficheront ici.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {announcements.map((a) => (
                <div key={a.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                      {Boolean(a.epingle) && <Pin className="w-3 h-3 text-blue-700 dark:text-blue-400 shrink-0" />}
                      <span className="truncate">{a.titre}</span>
                    </p>
                    <span
                      className={`text-[10px] font-semibold uppercase shrink-0 ${
                        a.priorite === 'urgente'
                          ? 'text-red-700 dark:text-red-400'
                          : a.priorite === 'importante'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {a.priorite}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{a.contenu}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Cours programmés aujourd’hui
              </h2>
            </div>
            {['fondateur', 'proviseur', 'censeur', 'enseignant', 'surveillant', 'eleve', 'parent'].includes(
              user.role
            ) && (
              <button
                type="button"
                onClick={() => onNavigate('timetable')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
              >
                Emploi du temps complet
              </button>
            )}
          </div>

          {todaySlots.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Aucun cours prévu ce jour</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                L’emploi du temps journalier apparaîtra dès que les créneaux seront saisis.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {todaySlots.map((slot) => (
                <div key={slot.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {slot.matiere_nom} · {slot.classe_nom}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {slot.enseignant_nom}
                      {slot.salle ? ` · Salle ${slot.salle}` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-blue-700 dark:text-blue-400 tabular-nums shrink-0">
                    {slot.heure_debut}–{slot.heure_fin}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Two-Column Detail: Real Distribution Chart + Recent Audit Activity */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Répartition des effectifs par classe
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {c.eleves} élève(s) au total
            </span>
          </div>

          {data.classDistribution.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Aucune donnée disponible</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Les effectifs apparaîtront dès que les classes et les dossiers élèves seront enregistrés.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {data.classDistribution.map((cl) => (
                <div key={cl.nom} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{cl.nom}</span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {cl.effectif} élève(s)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-700 dark:bg-blue-500 rounded-full"
                      style={{ width: `${Math.round((cl.effectif / maxClassEff) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Activités récentes tracées
            </h2>
            {['fondateur', 'proviseur', 'censeur', 'secretaire'].includes(user.role) && (
              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
              >
                Voir le journal complet
              </button>
            )}
          </div>

          {data.recentLogs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Aucune opération enregistrée</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toutes les créations, validations et transmissions figureront ici avec auteur et horodatage.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white">{log.description}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {log.user_nom} ({log.user_role}) · {log.evenement}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {formatDateTimeFr(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
