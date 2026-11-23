import { useEffect, useState } from 'react';
import { AcademicSetupView } from './components/AcademicSetupView.tsx';
import { AuthPortal } from './components/AuthPortal.tsx';
import { BulletinsAndResultsView } from './components/BulletinsAndResultsView.tsx';
import { CommunicationsView } from './components/CommunicationsView.tsx';
import { CourseMaterialsView } from './components/CourseMaterialsView.tsx';
import { DashboardView, type DashboardData } from './components/DashboardView.tsx';
import { GovernanceUsersView } from './components/GovernanceUsersView.tsx';
import { GradesAndEvaluationsView } from './components/GradesAndEvaluationsView.tsx';
import { LayoutShell, type NavSectionId } from './components/LayoutShell.tsx';
import { OperationsModulesView } from './components/OperationsModulesView.tsx';
import { ProfileSettingsView } from './components/ProfileSettingsView.tsx';
import { PublicVitrineView } from './components/PublicVitrineView.tsx';
import { StudentsDossiersView } from './components/StudentsDossiersView.tsx';
import { TimetableAndHomeworkView } from './components/TimetableAndHomeworkView.tsx';
import { apiFetch, setAuthToken } from './lib/api.ts';
import type { NotificationItem, SchoolSettings, UserAccount } from './types.ts';

function getInitialPortalView(): 'vitrine' | 'login' | 'register' | 'forgot' {
  if (typeof window === 'undefined') return 'vitrine';
  const params = new URLSearchParams(window.location.search);
  const p = params.get('portail');
  if (p === 'login' || p === 'register' || p === 'forgot') return p;
  return 'vitrine';
}

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [portalView, setPortalView] = useState<'vitrine' | 'login' | 'register' | 'forgot'>(getInitialPortalView);

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<{ email: string; role: string; nom: string }[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const checkStatus = async () => {
    try {
      const res = await apiFetch<{
        initialized: boolean;
        settings: SchoolSettings | null;
        demoAccounts?: { email: string; role: string; nom: string }[];
      }>('/api/auth/status');
      setInitialized(res.initialized);
      if (res.settings) setSettings(res.settings);
      if (res.demoAccounts) setDemoAccounts(res.demoAccounts);
    } finally {
      setBootLoading(false);
    }
  };

  const loadWorkspaceData = async () => {
    try {
      const [sRes, nRes, dRes] = await Promise.all([
        apiFetch<{ settings: SchoolSettings }>('/api/settings'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<DashboardData>('/api/dashboard'),
      ]);
      setSettings(sRes.settings);
      setNotifications(nRes.notifications);
      setDashboardData(dRes);
    } catch {
      // handled gracefully
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (user) {
      setActiveSection('dashboard');
      loadWorkspaceData();
    }
  }, [user?.id]);

  const handleSelectSection = (id: NavSectionId) => {
    setActiveSection(id);
    setSearchQuery('');
    if (id === 'dashboard' && user) {
      loadWorkspaceData();
    }
  };

  const handleMarkNotificationRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, est_lu: 1 } : n)));
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, est_lu: 1 })));
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setDashboardData(null);
    setNotifications([]);
    setPortalView('vitrine');
  };

  const openPortalTab = (tab: 'vitrine' | 'login' | 'register' | 'forgot') => {
    setPortalView(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-xs text-slate-500">
        Chargement de PROSPER KAMARA – GESTION SCOLAIRE...
      </div>
    );
  }

  if (!user) {
    if (initialized && portalView === 'vitrine') {
      return (
        <PublicVitrineView
          schoolName={settings?.nom_etablissement || 'LYCÉE PROSPER KAMARA'}
          schoolMotto={settings?.devise || 'Excellence · Discipline · Réussite'}
          publicSettings={settings}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(!darkMode)}
          onOpenPortal={(tab) => openPortalTab(tab)}
        />
      );
    }

    return (
      <AuthPortal
        key={portalView}
        initialized={initialized}
        schoolName={settings?.nom_etablissement || 'LYCÉE PROSPER KAMARA'}
        schoolMotto={settings?.devise || 'Excellence · Discipline · Réussite'}
        publicSettings={settings}
        demoAccounts={demoAccounts}
        darkMode={darkMode}
        initialTab={portalView === 'vitrine' ? 'login' : portalView}
        onBackToVitrine={initialized ? () => openPortalTab('vitrine') : undefined}
        onToggleDark={() => setDarkMode(!darkMode)}
        onAuthenticated={(u) => setUser(u)}
        onInitialized={() => setInitialized(true)}
      />
    );
  }

  return (
    <LayoutShell
      user={user}
      settings={settings}
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      notifications={notifications}
      onMarkNotificationRead={handleMarkNotificationRead}
      onMarkAllRead={handleMarkAllRead}
      darkMode={darkMode}
      onToggleDark={() => setDarkMode(!darkMode)}
      onLogout={handleLogout}
    >
      {activeSection === 'dashboard' && (
        <DashboardView user={user} data={dashboardData} onNavigate={handleSelectSection} />
      )}

      {(activeSection === 'governance_users' ||
        activeSection === 'inscriptions' ||
        activeSection === 'settings' ||
        activeSection === 'audit') && (
        <GovernanceUsersView
          mode={activeSection}
          currentUser={user}
          settings={settings}
          searchQuery={searchQuery}
          onSettingsUpdated={loadWorkspaceData}
        />
      )}

      {activeSection === 'academic_setup' && (
        <AcademicSetupView currentUser={user} searchQuery={searchQuery} />
      )}

      {activeSection === 'timetable' && (
        <TimetableAndHomeworkView currentUser={user} searchQuery={searchQuery} />
      )}

      {activeSection === 'dossiers' && (
        <StudentsDossiersView currentUser={user} searchQuery={searchQuery} />
      )}

      {(activeSection === 'evaluations_grades' ||
        activeSection === 'transmissions' ||
        activeSection === 'corrections') && (
        <GradesAndEvaluationsView mode={activeSection} currentUser={user} />
      )}

      {activeSection === 'materials' && (
        <CourseMaterialsView currentUser={user} searchQuery={searchQuery} />
      )}

      {(activeSection === 'bulletins' ||
        activeSection === 'results' ||
        activeSection === 'claims') && (
        <BulletinsAndResultsView
          mode={activeSection}
          currentUser={user}
          settings={settings}
          searchQuery={searchQuery}
        />
      )}

      {(activeSection === 'surveillance' ||
        activeSection === 'finance' ||
        activeSection === 'economat' ||
        activeSection === 'staff_modules' ||
        activeSection === 'archives') && (
        <OperationsModulesView mode={activeSection} currentUser={user} settings={settings} />
      )}

      {activeSection === 'communications' && (
        <CommunicationsView currentUser={user} searchQuery={searchQuery} />
      )}

      {activeSection === 'profile' && (
        <ProfileSettingsView
          currentUser={user}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(!darkMode)}
          onUserUpdated={(updated) => setUser(updated)}
        />
      )}
    </LayoutShell>
  );
}
