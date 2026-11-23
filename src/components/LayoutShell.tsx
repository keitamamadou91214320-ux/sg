import React, { useState } from 'react';
import {
  Archive,
  Award,
  Bell,
  BookOpen,
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileSpreadsheet,
  FolderOpen,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareWarning,
  Moon,
  Package,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { ROLE_LABELS, formatDateTimeFr } from '../lib/labels.ts';
import type { NotificationItem, SchoolSettings, UserAccount, UserRole } from '../types.ts';

export type NavSectionId =
  | 'dashboard'
  | 'governance_users'
  | 'inscriptions'
  | 'academic_setup'
  | 'timetable'
  | 'dossiers'
  | 'evaluations_grades'
  | 'transmissions'
  | 'corrections'
  | 'materials'
  | 'bulletins'
  | 'results'
  | 'claims'
  | 'surveillance'
  | 'finance'
  | 'economat'
  | 'communications'
  | 'staff_modules'
  | 'archives'
  | 'audit'
  | 'settings'
  | 'profile';

export interface NavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function getNavItemsForRole(role: UserRole): NavItem[] {
  const all: Record<NavSectionId, NavItem> = {
    dashboard: { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    governance_users: { id: 'governance_users', label: 'Personnel & Comptes', icon: Users },
    inscriptions: { id: 'inscriptions', label: 'Inscriptions & Réexamens', icon: UserCheck },
    academic_setup: { id: 'academic_setup', label: 'Périodes & Classes', icon: Calendar },
    timetable: { id: 'timetable', label: 'Emploi du temps & Devoirs', icon: Clock },
    dossiers: { id: 'dossiers', label: 'Dossiers élèves', icon: GraduationCap },
    evaluations_grades: { id: 'evaluations_grades', label: 'Évaluations & Notes', icon: FileSpreadsheet },
    transmissions: { id: 'transmissions', label: 'Transmissions & Excel', icon: ClipboardCheck },
    corrections: { id: 'corrections', label: 'Corrections de notes', icon: History },
    materials: { id: 'materials', label: 'Supports de cours', icon: BookOpen },
    bulletins: { id: 'bulletins', label: 'Circuit des bulletins', icon: Award },
    results: { id: 'results', label: 'Résultats officiels', icon: FolderOpen },
    claims: { id: 'claims', label: 'Réclamations', icon: MessageSquareWarning },
    surveillance: { id: 'surveillance', label: 'Absences & Discipline', icon: ShieldAlert },
    finance: { id: 'finance', label: 'Comptabilité & Frais', icon: CreditCard },
    economat: { id: 'economat', label: 'Économat & Stocks', icon: Package },
    communications: { id: 'communications', label: 'Annonces & Messagerie', icon: Mail },
    staff_modules: { id: 'staff_modules', label: 'Missions spécifiques', icon: FolderOpen },
    archives: { id: 'archives', label: 'Archives', icon: Archive },
    audit: { id: 'audit', label: 'Journal & Audit', icon: History },
    settings: { id: 'settings', label: 'Paramètres & Sauvegardes', icon: Settings },
    profile: { id: 'profile', label: 'Mon Profil & Sécurité', icon: UserCog },
  };

  const roleMap: Record<UserRole, NavSectionId[]> = {
    fondateur: [
      'dashboard',
      'governance_users',
      'academic_setup',
      'timetable',
      'dossiers',
      'results',
      'finance',
      'communications',
      'archives',
      'audit',
      'settings',
      'profile',
    ],
    proviseur: [
      'dashboard',
      'governance_users',
      'inscriptions',
      'academic_setup',
      'timetable',
      'dossiers',
      'corrections',
      'bulletins',
      'results',
      'claims',
      'surveillance',
      'finance',
      'economat',
      'communications',
      'archives',
      'audit',
      'settings',
      'profile',
    ],
    censeur: [
      'dashboard',
      'academic_setup',
      'timetable',
      'evaluations_grades',
      'corrections',
      'bulletins',
      'results',
      'claims',
      'surveillance',
      'communications',
      'audit',
      'profile',
    ],
    secretaire: [
      'dashboard',
      'dossiers',
      'transmissions',
      'bulletins',
      'results',
      'claims',
      'communications',
      'archives',
      'audit',
      'profile',
    ],
    enseignant: [
      'dashboard',
      'academic_setup',
      'timetable',
      'evaluations_grades',
      'transmissions',
      'corrections',
      'materials',
      'results',
      'communications',
      'profile',
    ],
    surveillant: ['dashboard', 'dossiers', 'timetable', 'surveillance', 'communications', 'profile'],
    comptable: ['dashboard', 'finance', 'communications', 'profile'],
    economat: ['dashboard', 'economat', 'communications', 'profile'],
    bibliothecaire: ['dashboard', 'staff_modules', 'communications', 'profile'],
    informaticien: ['dashboard', 'staff_modules', 'communications', 'profile'],
    archiviste: ['dashboard', 'archives', 'staff_modules', 'communications', 'profile'],
    medical: ['dashboard', 'staff_modules', 'communications', 'profile'],
    agent_administratif: ['dashboard', 'staff_modules', 'communications', 'profile'],
    eleve: ['dashboard', 'timetable', 'materials', 'results', 'bulletins', 'claims', 'finance', 'communications', 'profile'],
    parent: ['dashboard', 'timetable', 'results', 'bulletins', 'claims', 'finance', 'communications', 'profile'],
  };

  return (roleMap[role] || ['dashboard', 'profile']).map((id) => all[id]);
}

interface LayoutShellProps {
  user: UserAccount;
  settings: SchoolSettings | null;
  activeSection: NavSectionId;
  onSelectSection: (id: NavSectionId) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: number) => void;
  onMarkAllRead: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({
  user,
  settings,
  activeSection,
  onSelectSection,
  searchQuery,
  onSearchChange,
  notifications,
  onMarkNotificationRead,
  onMarkAllRead,
  darkMode,
  onToggleDark,
  onLogout,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navItems = getNavItemsForRole(user.role);
  const unreadCount = notifications.filter((n) => !n.est_lu).length;
  const activeLabel = navItems.find((n) => n.id === activeSection)?.label || 'Tableau de bord';
  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const SidebarContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center font-display font-bold text-xs shrink-0">
            PK
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-white truncate">
              {settings?.nom_etablissement || 'PROSPER KAMARA'}
            </span>
          )}
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fermer le menu"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                if (isMobile) setMobileOpen(false);
              }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 dark:bg-blue-700 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        {(!collapsed || isMobile) && (
          <button
            type="button"
            onClick={() => {
              onSelectSection('profile');
              if (isMobile) setMobileOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {user.prenom} {user.nom}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{ROLE_LABELS[user.role]}</p>
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-150 ${collapsed ? 'w-16' : 'w-64'} no-print`}>
        <div className={`fixed top-0 left-0 bottom-0 ${collapsed ? 'w-16' : 'w-64'} z-30 transition-all duration-150`}>
          {SidebarContent(false)}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-[80vw] h-full z-10">{SidebarContent(true)}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (PDF §2: notifications, profil, recherche et date + mode clair/sombre) */}
        <header className="h-16 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {ROLE_LABELS[user.role]} / <span className="text-slate-900 dark:text-white font-medium">{activeLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <span className="hidden xl:inline-block text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
              {todayStr}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-700 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold">Notifications ({unreadCount})</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllRead}
                        className="text-xs text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Tout lire
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 dark:text-slate-400">Aucune notification disponible.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            onMarkNotificationRead(n.id);
                            if (n.lien_module) {
                              const target = navItems.find((i) => i.id.includes(n.lien_module!));
                              if (target) onSelectSection(target.id);
                            }
                            setNotifOpen(false);
                          }}
                          className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                            !n.est_lu ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">{n.titre}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">{formatDateTimeFr(n.created_at)}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Changer de thème"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onSelectSection('profile')}
              className={`p-2 rounded-lg border transition-colors ${
                activeSection === 'profile'
                  ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label="Mon Profil & Préférences"
              title="Mon Profil & Sécurité"
            >
              <UserCog className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
