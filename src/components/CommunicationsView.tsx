import React, { useEffect, useState } from 'react';
import { Mail, Megaphone, Pin, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { ROLE_LABELS, formatDateFr, formatDateTimeFr } from '../lib/labels.ts';
import type { AnnouncementItem, InternalMessage, UserAccount, UserRole } from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface CommunicationsViewProps {
  currentUser: UserAccount;
  searchQuery: string;
}

export const CommunicationsView: React.FC<CommunicationsViewProps> = ({ currentUser, searchQuery }) => {
  const [tab, setTab] = useState<'announcements' | 'messages'>('announcements');
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [inbox, setInbox] = useState<InternalMessage[]>([]);
  const [sent, setSent] = useState<InternalMessage[]>([]);
  const [recipients, setRecipients] = useState<{ id: number; nom: string; prenom: string; role: UserRole }[]>([]);
  const [msgBox, setMsgBox] = useState<'inbox' | 'sent'>('inbox');

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Announcement form
  const [annTitre, setAnnTitre] = useState('');
  const [annContenu, setAnnContenu] = useState('');
  const [annPriorite, setAnnPriorite] = useState<'normale' | 'importante' | 'urgente'>('normale');
  const [annCible, setAnnCible] = useState<'tous' | 'personnel' | 'enseignants' | 'eleves_parents'>('tous');
  const [annEpingle, setAnnEpingle] = useState(false);
  const [annExpire, setAnnExpire] = useState('');

  // Message compose form
  const [recipientId, setRecipientId] = useState<number>(0);
  const [msgSujet, setMsgSujet] = useState('');
  const [msgContenu, setMsgContenu] = useState('');

  const canPublishAnnouncement = ['fondateur', 'proviseur', 'censeur', 'secretaire'].includes(currentUser.role);

  const loadAll = async () => {
    setError(null);
    try {
      const [annRes, msgRes, recRes] = await Promise.all([
        apiFetch<{ announcements: AnnouncementItem[] }>('/api/announcements'),
        apiFetch<{ inbox: InternalMessage[]; sent: InternalMessage[] }>('/api/messages'),
        apiFetch<{ recipients: { id: number; nom: string; prenom: string; role: UserRole }[] }>('/api/messages/recipients'),
      ]);
      setAnnouncements(annRes.announcements);
      setInbox(msgRes.inbox);
      setSent(msgRes.sent);
      setRecipients(recRes.recipients);
      if (recRes.recipients[0]) setRecipientId((p) => p || recRes.recipients[0].id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          titre: annTitre,
          contenu: annContenu,
          priorite: annPriorite,
          cible_role: annCible,
          epingle: annEpingle,
          expire_le: annExpire || null,
        }),
      });
      setAnnTitre('');
      setAnnContenu('');
      setAnnEpingle(false);
      setAnnExpire('');
      setFeedback('Note de service / annonce publiée.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ recipient_id: recipientId, sujet: msgSujet, contenu: msgContenu }),
      });
      setMsgSujet('');
      setMsgContenu('');
      setFeedback('Message transmis dans l’espace du destinataire.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleMarkMessageRead = async (id: number) => {
    await apiFetch(`/api/messages/${id}/read`, { method: 'POST' });
    setInbox((prev) => prev.map((m) => (m.id === id ? { ...m, est_lu: 1 } : m)));
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredAnnouncements = announcements.filter(
    (a) => !q || `${a.titre} ${a.contenu} ${a.auteur_nom || ''}`.toLowerCase().includes(q)
  );
  const unreadCount = inbox.filter((m) => !m.est_lu).length;
  const activeMessages = (msgBox === 'inbox' ? inbox : sent).filter(
    (m) =>
      !q ||
      `${m.sujet} ${m.contenu} ${m.sender_nom || ''} ${m.recipient_nom || ''}`.toLowerCase().includes(q)
  );

  const cibleLabels: Record<string, string> = {
    tous: 'Tout l’établissement',
    personnel: 'Personnel uniquement',
    enseignants: 'Corps enseignant',
    eleves_parents: 'Élèves & Parents',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Annonces officielles & Messagerie interne
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Notes de service de la direction et correspondance sécurisée entre acteurs du lycée
        </p>
      </div>

      <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
        <button
          type="button"
          onClick={() => setTab('announcements')}
          className={`px-4 py-2 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${
            tab === 'announcements'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Notes de service ({filteredAnnouncements.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('messages')}
          className={`px-4 py-2 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${
            tab === 'messages'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Messagerie interne ({unreadCount > 0 ? `${unreadCount} non lu(s)` : inbox.length})</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar user={currentUser} space="communications" collapsible defaultExpanded={false} />

      {tab === 'announcements' ? (
        <div className="grid lg:grid-cols-12 gap-6">
          {canPublishAnnouncement && (
            <form
              onSubmit={handlePublishAnnouncement}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-display font-semibold text-base">Publier une note de service</h2>
              <div>
                <label className="block text-xs font-medium mb-1">Titre</label>
                <input
                  required
                  value={annTitre}
                  onChange={(e) => setAnnTitre(e.target.value)}
                  placeholder="Ex. Réunion pédagogique générale"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Priorité</label>
                  <select
                    value={annPriorite}
                    onChange={(e) => setAnnPriorite(e.target.value as 'normale' | 'importante' | 'urgente')}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="normale">Normale</option>
                    <option value="importante">Importante</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Public cible</label>
                  <select
                    value={annCible}
                    onChange={(e) =>
                      setAnnCible(e.target.value as 'tous' | 'personnel' | 'enseignants' | 'eleves_parents')
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="tous">Tout l’établissement</option>
                    <option value="personnel">Personnel uniquement</option>
                    <option value="enseignants">Corps enseignant</option>
                    <option value="eleves_parents">Élèves & Parents</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Date d’expiration (optionnel)</label>
                <input
                  type="date"
                  value={annExpire}
                  onChange={(e) => setAnnExpire(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={annEpingle}
                  onChange={(e) => setAnnEpingle(e.target.checked)}
                />
                <span>Épingler sur le tableau de bord</span>
              </label>
              <div>
                <label className="block text-xs font-medium mb-1">Contenu officiel</label>
                <textarea
                  required
                  rows={4}
                  value={annContenu}
                  onChange={(e) => setAnnContenu(e.target.value)}
                  placeholder="Rédigez le message officiel..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800"
              >
                Diffuser la note de service
              </button>
            </form>
          )}

          <div
            className={`${
              canPublishAnnouncement ? 'lg:col-span-8' : 'lg:col-span-12'
            } space-y-3`}
          >
            {filteredAnnouncements.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500">
                Aucune annonce ou note de service active pour votre espace.
              </div>
            ) : (
              filteredAnnouncements.map((a) => {
                const canDel =
                  a.auteur_id === currentUser.id || ['fondateur', 'proviseur'].includes(currentUser.role);
                const priorityColor =
                  a.priorite === 'urgente'
                    ? 'text-red-700 dark:text-red-400'
                    : a.priorite === 'importante'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400';

                return (
                  <article
                    key={a.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {Boolean(a.epingle) && <Pin className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />}
                          <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                            {a.titre}
                          </h3>
                          <span className={`text-[11px] font-semibold uppercase ${priorityColor}`}>{a.priorite}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Par {a.auteur_nom} ({a.auteur_role ? ROLE_LABELS[a.auteur_role] : ''}) · Cible :{' '}
                          {cibleLabels[a.cible_role] || a.cible_role} · {formatDateTimeFr(a.created_at)}
                          {a.expire_le ? ` · Valable jusqu'au ${formatDateFr(a.expire_le)}` : ''}
                        </p>
                      </div>
                      {canDel && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(a.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                          aria-label="Supprimer l’annonce"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {a.contenu}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSendMessage}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h2 className="font-display font-semibold text-base">Nouveau message interne</h2>
            <div>
              <label className="block text-xs font-medium mb-1">Destinataire</label>
              <select
                required
                value={recipientId}
                onChange={(e) => setRecipientId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {recipients.length === 0 ? (
                  <option value={0}>Aucun autre utilisateur actif</option>
                ) : (
                  recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.prenom} {r.nom} · {ROLE_LABELS[r.role]}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Objet</label>
              <input
                required
                value={msgSujet}
                onChange={(e) => setMsgSujet(e.target.value)}
                placeholder="Objet de votre correspondance"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={msgContenu}
                onChange={(e) => setMsgContenu(e.target.value)}
                placeholder="Votre message..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              disabled={recipients.length === 0}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Envoyer le message</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMsgBox('inbox')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  msgBox === 'inbox'
                    ? 'bg-slate-900 dark:bg-blue-700 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Reçus ({inbox.length})
              </button>
              <button
                type="button"
                onClick={() => setMsgBox('sent')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  msgBox === 'sent'
                    ? 'bg-slate-900 dark:bg-blue-700 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Envoyés ({sent.length})
              </button>
            </div>

            {activeMessages.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucun message dans cette boîte.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-4 space-y-1.5 ${
                      msgBox === 'inbox' && !m.est_lu ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{m.sujet}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {msgBox === 'inbox'
                            ? `De : ${m.sender_nom} (${m.sender_role ? ROLE_LABELS[m.sender_role] : ''})`
                            : `À : ${m.recipient_nom} (${m.recipient_role ? ROLE_LABELS[m.recipient_role] : ''})`}
                          {' · '}
                          {formatDateTimeFr(m.created_at)}
                        </p>
                      </div>
                      {msgBox === 'inbox' && !m.est_lu && (
                        <button
                          type="button"
                          onClick={() => handleMarkMessageRead(m.id)}
                          className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline shrink-0"
                        >
                          Marquer comme lu
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">{m.contenu}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
