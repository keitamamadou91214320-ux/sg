import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import { ROLE_LABELS } from '../lib/labels.ts';
import type { SchoolSettings, UserAccount, UserRole } from '../types.ts';

interface AuthPortalProps {
  initialized: boolean;
  schoolName: string;
  schoolMotto: string;
  publicSettings: Partial<SchoolSettings> | null;
  demoAccounts?: { email: string; role: string; nom: string }[];
  darkMode: boolean;
  initialTab?: 'login' | 'register' | 'forgot';
  onBackToVitrine?: () => void;
  onToggleDark: () => void;
  onAuthenticated: (user: UserAccount) => void;
  onInitialized: () => void;
}

const PORTAL_SPACES = [
  {
    id: 'direction',
    title: 'Direction & Secrétariat',
    icon: ShieldCheck,
    summary:
      'Gouvernance, périodes scolaires configurables, validation des dossiers, signature numérique des bulletins et journal d’audit complet.',
    highlights: ['Double validation des corrections', 'Circuit Secrétariat → Proviseur → Censeur', 'Sauvegardes & paramètres'],
  },
  {
    id: 'enseignants',
    title: 'Corps Enseignant',
    icon: BookOpen,
    summary:
      'Évaluations à barème libre (/10, /20, /40, /100), importation Excel (.xlsx/.xls), cahier de textes, devoirs et supports pédagogiques versionnés.',
    highlights: ['Importation & validation Excel', 'Emploi du temps hebdomadaire', 'Corrections de notes traçables'],
  },
  {
    id: 'familles',
    title: 'Élèves & Parents',
    icon: GraduationCap,
    summary:
      'Consultation des résultats officiellement publiés, téléchargement des bulletins PDF signés, devoirs à rendre, calendrier et suivi financier.',
    highlights: ['Bulletins PDF avec cachet', 'Emploi du temps & devoirs', 'Réclamations & messagerie interne'],
  },
  {
    id: 'services',
    title: 'Surveillance, Finance & Services',
    icon: Building2,
    summary:
      'Suivi des absences et incidents disciplinaires, comptabilité avec reçus officiels, économat avec alertes de stock, bibliothèque, médical et archives.',
    highlights: ['Reçus PDF & suivi des impayés', 'Alertes de seuil d’inventaire', 'Archivage durable sécurisé'],
  },
] as const;

function getPasswordStrength(pw: string): { label: string; score: number; barClass: string } {
  if (!pw) return { label: '', score: 0, barClass: 'bg-slate-200 dark:bg-slate-800' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Faible', score: 1, barClass: 'bg-red-600' };
  if (score === 2) return { label: 'Moyen', score: 2, barClass: 'bg-amber-600' };
  if (score === 3) return { label: 'Bon', score: 3, barClass: 'bg-blue-600' };
  return { label: 'Robustesse élevée', score: 4, barClass: 'bg-emerald-600' };
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  initialized,
  schoolName,
  schoolMotto,
  publicSettings,
  demoAccounts = [],
  darkMode,
  initialTab = 'login',
  onBackToVitrine,
  onToggleDark,
  onAuthenticated,
  onInitialized,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>(initialTab);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [activeSpaceIdx, setActiveSpaceIdx] = useState(0);
  const [logoError, setLogoError] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Refused account re-examination inline state
  const [refusedState, setRefusedState] = useState<{
    email: string;
    password: string;
    motif: string;
    existingReexamen?: string;
  } | null>(null);
  const [reexamenText, setReexamenText] = useState('');

  // Form fields
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'eleve' | 'parent'>('eleve');
  const [matriculeEleve, setMatriculeEleve] = useState('');

  // Forgot password fields
  const [forgotMotif, setForgotMotif] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const allowSelfRegister = publicSettings?.autoriser_auto_inscription !== 0;
  const activeSpace = PORTAL_SPACES[activeSpaceIdx];
  const pwStrength = useMemo(
    () => getPasswordStrength(tab === 'forgot' ? newPassword : password),
    [tab, newPassword, password]
  );

  const switchTab = (next: 'login' | 'register' | 'forgot') => {
    setTab(next);
    setError(null);
    setSuccessMsg(null);
    setRefusedState(null);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: UserAccount }>('/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ nom, prenom, email, telephone, password }),
      });
      setAuthToken(data.token);
      onInitialized();
      onAuthenticated(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setRefusedState(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: UserAccount }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      const typed = err as Error & { statut?: string; motif_refus?: string; demande_reexamen?: string };
      if (typed.statut === 'refuse') {
        setRefusedState({
          email,
          password,
          motif: typed.motif_refus || 'Motif non précisé',
          existingReexamen: typed.demande_reexamen,
        });
      }
      setError(typed.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nom,
          prenom,
          email,
          telephone,
          password,
          role,
          matricule_eleve: matriculeEleve,
        }),
      });
      setSuccessMsg(data.message);
      setNom('');
      setPrenom('');
      setPassword('');
      setMatriculeEleve('');
      setTab('login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReexamen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refusedState) return;
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/reexamen', {
        method: 'POST',
        body: JSON.stringify({
          email: refusedState.email,
          password: refusedState.password,
          complement: reexamenText,
        }),
      });
      setSuccessMsg(data.message);
      setRefusedState(null);
      setReexamenText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, motif: forgotMotif }),
      });
      setSuccessMsg(data.message);
      setForgotMotif('');
      setForgotStep('reset');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code: resetCode, new_password: newPassword }),
      });
      setSuccessMsg(data.message);
      setResetCode('');
      setNewPassword('');
      setPassword('');
      setTab('login');
      setForgotStep('request');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top institutional header */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {publicSettings?.logo_path && !logoError ? (
            <img
              src="/api/auth/public-logo"
              alt={schoolName}
              onError={() => setLogoError(true)}
              className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center font-display font-bold text-sm tracking-tight shrink-0">
              PK
            </div>
          )}
          <div className="min-w-0">
            <span className="font-display font-semibold text-sm sm:text-base tracking-tight block truncate">
              {schoolName}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">
              {schoolMotto}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {publicSettings?.telephone && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <Phone className="w-3.5 h-3.5" />
              {publicSettings.telephone}
            </span>
          )}
          {onBackToVitrine && (
            <button
              type="button"
              onClick={onBackToVitrine}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Site vitrine public</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDark}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{darkMode ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
        </div>
      </header>

      {/* Optional custom welcome announcement banner set by Direction */}
      {initialized && publicSettings?.message_accueil && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/60 px-6 py-2.5">
          <p className="max-w-6xl mx-auto text-xs font-medium text-blue-900 dark:text-blue-200 text-center">
            {publicSettings.message_accueil}
          </p>
        </div>
      )}

      <main className="flex-1 grid lg:grid-cols-12 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 gap-8 lg:gap-12 items-start lg:items-center">
        {/* Institutional presentation & interactive role space explorer */}
        <section className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              {schoolName} · {schoolMotto}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {!initialized
                ? 'Initialisation de la plateforme officielle'
                : 'Portail unifié de gestion scolaire et académique'}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              {!initialized
                ? 'La base de données démarre vierge, sans aucune donnée fictive. Créez l’unique compte Administrateur Fondateur pour configurer l’établissement et déléguer la gestion quotidienne au proviseur.'
                : 'Chaque utilisateur accède à son espace métier sécurisé : direction, censeur, secrétariat, enseignants, surveillance, comptabilité, économat, élèves et parents.'}
            </p>
          </div>

          {/* Interactive Role Spaces Explorer */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PORTAL_SPACES.map((sp, idx) => {
                const Icon = sp.icon;
                const active = idx === activeSpaceIdx;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setActiveSpaceIdx(idx)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-colors flex items-center gap-2 ${
                      active
                        ? 'bg-slate-900 dark:bg-blue-700 border-slate-900 dark:border-blue-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] font-medium truncate">{sp.title.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5">
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                {activeSpace.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{activeSpace.summary}</p>
              <div className="grid sm:grid-cols-3 gap-2 pt-1">
                {activeSpace.highlights.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(publicSettings?.adresse || publicSettings?.email) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
              {publicSettings.adresse && <span>Adresse : {publicSettings.adresse}</span>}
              {publicSettings.email && <span>Contact : {publicSettings.email}</span>}
            </div>
          )}
        </section>

        {/* Auth Form Column */}
        <section className="lg:col-span-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
            {!initialized ? (
              <form onSubmit={handleBootstrap} className="space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
                  <div>
                    <h2 className="font-display font-semibold text-lg text-slate-900 dark:text-white">
                      Création de l’Administrateur Fondateur
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Compte unique et irrévocable du créateur de la plateforme
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nom</label>
                    <input
                      required
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      placeholder="Kamara"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Prénom</label>
                    <input
                      required
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      placeholder="Prosper"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="fondateur@lycee-pk.edu"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone
                    </label>
                    <input
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      placeholder="Optionnel"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mot de passe (8 caractères minimum)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      aria-label="Afficher le mot de passe"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Initialisation en cours...' : 'Créer le compte Fondateur et ouvrir la plateforme'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                {/* Segmented 3-mode switch */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      tab === 'login'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      tab === 'register'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Inscription
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('forgot')}
                    className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      tab === 'forgot'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Mot de passe oublié
                  </button>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                    {successMsg}
                  </div>
                )}

                {tab === 'login' && (
                  <>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Adresse e-mail
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nom@lycee-pk.edu"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Mot de passe
                          </label>
                          <button
                            type="button"
                            onClick={() => switchTab('forgot')}
                            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Mot de passe oublié ?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                            aria-label="Afficher le mot de passe"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        {loading ? 'Vérification...' : 'Se connecter à mon espace'}
                      </button>
                    </form>

                    {refusedState && (
                      <form
                        onSubmit={handleReexamen}
                        className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Demander un réexamen auprès du proviseur
                        </p>
                        {refusedState.existingReexamen && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Dernier complément envoyé : {refusedState.existingReexamen}
                          </p>
                        )}
                        <textarea
                          required
                          rows={2}
                          value={reexamenText}
                          onChange={(e) => setReexamenText(e.target.value)}
                          placeholder="Précisez vos informations complémentaires (matricule, justificatif, classe)..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Envoyer la demande de réexamen
                        </button>
                      </form>
                    )}

                    {demoAccounts.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setShowDemoAccounts((v) => !v)}
                            className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            {showDemoAccounts ? '▾' : '▸'} Comptes de démonstration ({demoAccounts.length})
                          </button>
                          <span className="text-[11px] font-mono text-slate-500">
                            Mot de passe : <strong>Demo2026!</strong>
                          </span>
                        </div>
                        {showDemoAccounts && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                            {demoAccounts.map((acc) => (
                              <button
                                key={acc.email}
                                type="button"
                                onClick={() => {
                                  setEmail(acc.email);
                                  setPassword('Demo2026!');
                                  setError(null);
                                  setSuccessMsg(`Identifiants de démonstration chargés (${ROLE_LABELS[acc.role as UserRole] || acc.role}).`);
                                }}
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-colors"
                              >
                                <p className="text-[11px] font-semibold text-slate-900 dark:text-white truncate">
                                  {ROLE_LABELS[acc.role as UserRole] || acc.role}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">{acc.nom}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {tab === 'register' && (
                  <>
                    {!allowSelfRegister ? (
                      <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 space-y-2">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Auto-inscription temporairement fermée
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          La direction a désactivé l’inscription autonome en ligne pour le moment. Veuillez vous adresser
                          directement au secrétariat du lycée pour obtenir vos identifiants.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleRegister} className="space-y-4">
                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <UserPlus className="w-4 h-4 shrink-0 text-blue-700 dark:text-blue-400" />
                          <span>Votre demande restera en attente jusqu’à la décision du proviseur.</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setRole('eleve')}
                            className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                              role === 'eleve'
                                ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Je suis Élève
                          </button>
                          <button
                            type="button"
                            onClick={() => setRole('parent')}
                            className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                              role === 'parent'
                                ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Je suis Parent
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nom</label>
                            <input
                              required
                              value={nom}
                              onChange={(e) => setNom(e.target.value)}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Prénom
                            </label>
                            <input
                              required
                              value={prenom}
                              onChange={(e) => setPrenom(e.target.value)}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              E-mail
                            </label>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Téléphone
                            </label>
                            <input
                              value={telephone}
                              onChange={(e) => setTelephone(e.target.value)}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Matricule élève concerné (si déjà attribué)
                          </label>
                          <input
                            value={matriculeEleve}
                            onChange={(e) => setMatriculeEleve(e.target.value)}
                            placeholder="Ex. PK-2026-001"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Mot de passe (8 caractères min.)
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                              aria-label="Afficher le mot de passe"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {password && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${pwStrength.barClass}`}
                                  style={{ width: `${(pwStrength.score / 4) * 100}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-500">{pwStrength.label}</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                          {loading ? 'Envoi...' : 'Soumettre la demande d’inscription'}
                        </button>
                      </form>
                    )}
                  </>
                )}

                {tab === 'forgot' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Récupération sécurisée d’accès
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForgotStep(forgotStep === 'request' ? 'reset' : 'request')}
                        className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {forgotStep === 'request' ? 'J’ai déjà un code →' : '← Nouvelle demande'}
                      </button>
                    </div>

                    {forgotStep === 'request' ? (
                      <form onSubmit={handleForgotRequest} className="space-y-4">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Saisissez votre adresse e-mail. La direction ou le support informatique émettra un code
                          temporaire à usage unique (valide 24h) pour réinitialiser votre mot de passe.
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Adresse e-mail du compte
                          </label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nom@lycee-pk.edu"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Précision / Téléphone de contact (optionnel)
                          </label>
                          <input
                            value={forgotMotif}
                            onChange={(e) => setForgotMotif(e.target.value)}
                            placeholder="Ex. Classe de Terminale · joignable par SMS"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                          {loading ? 'Envoi...' : 'Transmettre la demande de réinitialisation'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleResetComplete} className="space-y-4">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Saisissez le code temporaire remis par l’administration (format <span className="font-mono">PK-XXXXXX</span>) et choisissez votre nouveau mot de passe.
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Adresse e-mail
                          </label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Code temporaire à usage unique
                          </label>
                          <input
                            required
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                            placeholder="PK-A1B2C3"
                            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Nouveau mot de passe (8 caractères min.)
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                              aria-label="Afficher le mot de passe"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {newPassword && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${pwStrength.barClass}`}
                                  style={{ width: `${(pwStrength.score / 4) * 100}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-500">{pwStrength.label}</span>
                            </div>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                          {loading ? 'Validation...' : 'Valider le nouveau mot de passe'}
                        </button>
                      </form>
                    )}

                    <button
                      type="button"
                      onClick={() => switchTab('login')}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Retour à la connexion</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
