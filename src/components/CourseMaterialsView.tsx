import React, { useEffect, useState } from 'react';
import { Download, History, Upload } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api.ts';
import { formatDateTimeFr } from '../lib/labels.ts';
import type { CourseMaterial, SchoolClass, Subject, UserAccount } from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface CourseMaterialsViewProps {
  currentUser: UserAccount;
  searchQuery: string;
}

export const CourseMaterialsView: React.FC<CourseMaterialsViewProps> = ({ currentUser, searchQuery }) => {
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [versionsModal, setVersionsModal] = useState<{
    material: CourseMaterial;
    versions: { id: number; version: number; fichier_nom: string; fichier_path: string; modifie_par_nom: string; created_at: string }[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [classeId, setClasseId] = useState(0);
  const [matiereId, setMatiereId] = useState(0);
  const [titre, setTitre] = useState('');
  const [chapitre, setChapitre] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const canUpload = ['enseignant', 'proviseur', 'censeur'].includes(currentUser.role);

  const loadAll = async () => {
    try {
      const [mRes, cRes, sRes] = await Promise.all([
        apiFetch<{ materials: CourseMaterial[] }>('/api/materials'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setMaterials(mRes.materials);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
      if (cRes.classes[0]) setClasseId((p) => p || cRes.classes[0].id);
      if (sRes.subjects[0]) setMatiereId((p) => p || sRes.subjects[0].id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Veuillez choisir un fichier (.pdf, .doc, .docx, .ppt, .pptx).');
      return;
    }
    setError(null);
    setFeedback(null);
    const fd = new FormData();
    fd.append('classe_id', String(classeId));
    fd.append('matiere_id', String(matiereId));
    fd.append('titre', titre);
    fd.append('chapitre', chapitre);
    fd.append('description', description);
    fd.append('file', file);

    try {
      await apiFetch('/api/materials', { method: 'POST', body: fd });
      setTitre('');
      setChapitre('');
      setDescription('');
      setFile(null);
      setFeedback('Support de cours publié.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReplace = async (materialId: number, newFile: File) => {
    setError(null);
    const fd = new FormData();
    fd.append('file', newFile);
    try {
      await apiFetch(`/api/materials/${materialId}/replace`, { method: 'POST', body: fd });
      setFeedback('Nouvelle version du support enregistrée (historique conservé).');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openVersions = async (m: CourseMaterial) => {
    try {
      const res = await apiFetch<{
        versions: { id: number; version: number; fichier_nom: string; fichier_path: string; modifie_par_nom: string; created_at: string }[];
      }>(`/api/materials/${m.id}/versions`);
      setVersionsModal({ material: m, versions: res.versions });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = materials.filter(
    (m) => !q || `${m.titre} ${m.chapitre} ${m.matiere_nom} ${m.classe_nom}`.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Supports de cours</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Formats autorisés : PDF (.pdf), Word (.doc, .docx) et PowerPoint (.ppt, .pptx) · Historique des versions conservé (Décision n°9)
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="materials"
        defaultFilter="evaluation"
        collapsible
        defaultExpanded={false}
      />

      <div className="grid lg:grid-cols-12 gap-6">
        {canUpload && (
          <form
            onSubmit={handleUpload}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h2 className="font-display font-semibold text-base">Déposer un support</h2>
            <div className="grid grid-cols-2 gap-2">
              <select
                required
                value={classeId}
                onChange={(e) => setClasseId(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
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
                value={matiereId}
                onChange={(e) => setMatiereId(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Matière...</option>
                {subjects.map((s) => (
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
              placeholder="Titre du cours"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              required
              value={chapitre}
              onChange={(e) => setChapitre(e.target.value)}
              placeholder="Chapitre / Thème"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="w-4 h-4" />
              <span className="truncate">{file ? file.name : 'Choisir (.pdf, .doc, .docx, .ppt, .pptx)'}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
              Publier le support
            </button>
          </form>
        )}

        <div className={`${canUpload ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">Aucun support de cours disponible.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m) => (
                <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.titre}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {m.classe_nom} · {m.matiere_nom} · Chapitre : {m.chapitre} · v{m.version} ({m.extension})
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Par {m.enseignant_nom} · {formatDateTimeFr(m.updated_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => downloadProtectedFile(m.fichier_path, m.fichier_nom)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white font-medium flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Télécharger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openVersions(m)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Versions</span>
                    </button>
                    {canUpload && (m.enseignant_id === currentUser.id || currentUser.role === 'proviseur') && (
                      <label className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span>Mettre à jour</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleReplace(m.id, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {versionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-display font-semibold text-base">Historique des versions — {versionsModal.material.titre}</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {versionsModal.versions.map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      Version v{v.version} · {v.fichier_nom}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {v.modifie_par_nom} · {formatDateTimeFr(v.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadProtectedFile(v.fichier_path, v.fichier_nom)}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700"
                  >
                    Télécharger
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setVersionsModal(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
