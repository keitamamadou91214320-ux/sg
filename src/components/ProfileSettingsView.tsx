import React, { useEffect, useState } from 'react';
import { KeyRound, Laptop, ShieldCheck, Sliders, Trash2, User } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { ROLE_LABELS, formatDateTimeFr } from '../lib/labels.ts';
import type { SessionInfo, UserAccount, UserPreferences } from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface ProfileSettingsViewProps {
  currentUser: UserAccount;
  darkMode: boolean;
  onToggleDark: () => void;
  onUserUpdated: (user: UserAccount) => void;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  currentUser,
  darkMode,
  onToggleDark,
  onUserUpdated,
}) => {
  const [telephone, setTelephone] = useState(currentUser.telephone || '');
  const [prefs, setPrefs] = useState<UserPreferences>(currentUser.preferences || {});
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      const res = await apiFetch<{ sessions: SessionInfo[] }>('/api/auth/sessions');
      setSessions(res.sessions);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setTelephone(currentUser.telephone || '');
    setPrefs(currentUser.preferences || {});
    loadSessions();
  }, [currentUser.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{ user: UserAccount }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ telephone, preferences: prefs }),
      });
      onUserUpdated(res.user);
      setFeedback('Profil et préférences personnelles enregistrés.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (newPassword !== confirmPassword) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback(res.message);
      await loadSessions();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRevokeSession = async (prefix: string) => {
    setError(null);
    try {
      await apiFetch(`/api/auth/sessions/${prefix}`, { method: 'DELETE' });
      setFeedback('Session révoquée avec succès.');
      await loadSessions();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Mon Profil, Sécurité & Préférences
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Personnalisation de votre espace {ROLE_LABELS[currentUser.role]}, mot de passe et gestion des sessions
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="profile"
        defaultFilter={
          prefs.calendar_default_filter === 'tous' || !prefs.calendar_default_filter
            ? 'all'
            : prefs.calendar_default_filter
        }
        collapsible
        defaultExpanded={false}
      />

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Identity & Personal Preferences */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <User className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h2 className="font-display font-semibold text-base">Informations & Préférences</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Nom complet</p>
              <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {currentUser.prenom} {currentUser.nom}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Fonction / Rôle</p>
              <p className="font-semibold text-blue-700 dark:text-blue-400 mt-0.5">{ROLE_LABELS[currentUser.role]}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Adresse e-mail</p>
              <p className="font-medium text-slate-900 dark:text-white mt-0.5">{currentUser.email}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Dernière connexion</p>
              <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                {formatDateTimeFr(currentUser.last_login_at)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Téléphone personnel</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Ex. +225 07 00 00 00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Préférences de l’espace de travail</span>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Filtre par défaut du calendrier</label>
              <select
                value={prefs.calendar_default_filter || 'tous'}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    calendar_default_filter: e.target.value as 'tous' | 'evaluation' | 'administratif' | 'vacances',
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="tous">Tous les événements</option>
                <option value="evaluation">Évaluations</option>
                <option value="administratif">Administratif & Conseils</option>
                <option value="vacances">Vacances scolaires</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-xs font-medium">Apparence de l’interface</p>
                <p className="text-[11px] text-slate-500">Basculer entre le thème clair et le thème sombre</p>
              </div>
              <button
                type="button"
                onClick={onToggleDark}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {darkMode ? 'Passer au mode clair' : 'Passer au mode sombre'}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(prefs.compact_mode)}
                onChange={(e) => setPrefs({ ...prefs, compact_mode: e.target.checked })}
              />
              <span>Activer l’affichage compact dans les tableaux</span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.email_alerts !== false}
                onChange={(e) => setPrefs({ ...prefs, email_alerts: e.target.checked })}
              />
              <span>Recevoir les alertes d’annonces et messages internes</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
          >
            Enregistrer mes informations
          </button>
        </form>

        {/* Security: Change Password & Active Sessions */}
        <div className="lg:col-span-6 space-y-6">
          <form
            onSubmit={handleChangePassword}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="font-display font-semibold text-base">Modifier mon mot de passe</h2>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Mot de passe actuel</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nouveau mot de passe (8 car. min.)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Confirmer</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
            >
              Mettre à jour le mot de passe
            </button>
          </form>

          {/* Active Sessions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display font-semibold text-base">Sessions actives ({sessions.length})</h2>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>

            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune autre session enregistrée.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((s) => (
                  <div key={s.prefix} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-mono font-medium text-slate-900 dark:text-white">
                        Session #{s.prefix}…{' '}
                        {s.is_current && (
                          <span className="font-sans text-emerald-700 dark:text-emerald-400 font-semibold">
                            (Session actuelle)
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Ouverte le {formatDateTimeFr(s.created_at)} · Expire le {formatDateTimeFr(s.expires_at)}
                      </p>
                    </div>
                    {!s.is_current && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.prefix)}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Révoquer</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
