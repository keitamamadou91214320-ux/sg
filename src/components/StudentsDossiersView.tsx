import React, { useEffect, useState } from 'react';
import { Archive, Camera, Download, Edit3 } from 'lucide-react';
import { apiFetch, downloadCsv, fetchProtectedImageDataUrl } from '../lib/api.ts';
import type { AcademicYear, DossierModificationRequest, SchoolClass, StudentDossier, UserAccount } from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface StudentsDossiersViewProps {
  currentUser: UserAccount;
  searchQuery: string;
}

export const StudentsDossiersView: React.FC<StudentsDossiersViewProps> = ({ currentUser, searchQuery }) => {
  const [students, setStudents] = useState<StudentDossier[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [modRequests, setModRequests] = useState<DossierModificationRequest[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<number>(0);

  // Create form
  const [matricule, setMatricule] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [sexe, setSexe] = useState<'M' | 'F'>('M');
  const [dateNaissance, setDateNaissance] = useState('');
  const [lieuNaissance, setLieuNaissance] = useState('');
  const [classeId, setClasseId] = useState<number>(0);
  const [anneeId, setAnneeId] = useState<number>(0);
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [parentNom, setParentNom] = useState('');
  const [parentTel, setParentTel] = useState('');

  // Edit modal
  const [editing, setEditing] = useState<StudentDossier | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [editMotif, setEditMotif] = useState('');

  const canCreate = ['secretaire', 'proviseur', 'fondateur'].includes(currentUser.role);
  const canSeeModRequests = ['secretaire', 'proviseur', 'fondateur'].includes(currentUser.role);

  const loadAll = async () => {
    try {
      const [sRes, cRes, yRes] = await Promise.all([
        apiFetch<{ students: StudentDossier[] }>('/api/students'),
        apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        apiFetch<{ years: AcademicYear[] }>('/api/academic-years'),
      ]);
      setStudents(sRes.students);
      setClasses(cRes.classes);
      setYears(yRes.years);
      const active = yRes.years.find((y) => y.est_active) || yRes.years[0];
      if (active) setAnneeId((prev) => prev || active.id);
      if (cRes.classes[0]) setClasseId((prev) => prev || cRes.classes[0].id);

      if (canSeeModRequests) {
        const mRes = await apiFetch<{ requests: DossierModificationRequest[] }>('/api/student-modification-requests');
        setModRequests(mRes.requests);
      }

      // Load protected photos
      const map: Record<number, string> = {};
      await Promise.all(
        sRes.students
          .filter((st) => st.photo_path)
          .map(async (st) => {
            const url = await fetchProtectedImageDataUrl(st.photo_path);
            if (url) map[st.id] = url;
          })
      );
      setPhotoUrls(map);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          matricule,
          nom,
          prenom,
          sexe,
          date_naissance: dateNaissance,
          lieu_naissance: lieuNaissance,
          classe_id: classeId || null,
          annee_id: anneeId || null,
          telephone,
          adresse,
          parent_nom: parentNom,
          parent_telephone: parentTel,
        }),
      });
      setMatricule('');
      setNom('');
      setPrenom('');
      setDateNaissance('');
      setLieuNaissance('');
      setTelephone('');
      setAdresse('');
      setParentNom('');
      setParentTel('');
      setFeedback('Dossier élève enregistré.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePhotoUpload = async (studentId: number, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await apiFetch(`/api/students/${studentId}/photo`, { method: 'POST', body: fd });
      setFeedback('Photo du dossier élève mise à jour.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openEdit = (st: StudentDossier) => {
    setEditing(st);
    setEditFields({
      nom: st.nom,
      prenom: st.prenom,
      date_naissance: st.date_naissance,
      matricule: st.matricule,
      classe_id: st.classe_id ? String(st.classe_id) : '',
      telephone: st.telephone || '',
      adresse: st.adresse || '',
      parent_nom: st.parent_nom || '',
      parent_telephone: st.parent_telephone || '',
      statut_administratif: st.statut_administratif,
    });
    setEditMotif('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      const res = await apiFetch<{ demandes_creees: number }>(`/api/students/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editFields,
          classe_id: editFields.classe_id ? Number(editFields.classe_id) : null,
          motif: editMotif,
        }),
      });
      setEditing(null);
      setFeedback(
        res.demandes_creees > 0
          ? `Modifications courantes appliquées ; ${res.demandes_creees} modification(s) importante(s) soumise(s) au proviseur.`
          : 'Dossier élève mis à jour.'
      );
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDecideMod = async (id: number, decision: 'approuvee' | 'refusee') => {
    try {
      await apiFetch(`/api/student-modification-requests/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await apiFetch(`/api/archives/student/${id}`, { method: 'POST' });
      setFeedback('Dossier archivé durablement.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = students.filter(
    (s) =>
      (!classFilter || s.classe_id === classFilter) &&
      (!q || `${s.matricule} ${s.nom} ${s.prenom}`.toLowerCase().includes(q))
  );

  const garconsCount = filtered.filter((s) => s.sexe === 'M').length;
  const fillesCount = filtered.filter((s) => s.sexe === 'F').length;
  const nonAffectesCount = filtered.filter((s) => !s.classe_id).length;

  const exportDossiersCsv = () => {
    downloadCsv(
      `dossiers_eleves_prosper_kamara_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Date naissance', 'Lieu naissance', 'Classe', 'Téléphone', 'Parent', 'Tél. Parent', 'Statut'],
      filtered.map((s) => [
        s.matricule,
        s.nom,
        s.prenom,
        s.sexe,
        s.date_naissance,
        s.lieu_naissance || '',
        s.classe_nom || 'Non affecté',
        s.telephone || '',
        s.parent_nom || '',
        s.parent_telephone || '',
        s.statut_administratif,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Dossiers des élèves</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Modifications courantes par le secrétariat · Modifications importantes approuvées par le proviseur (Décision n°12)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(Number(e.target.value))}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-fit"
          >
            <option value={0}>Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={exportDossiersCsv}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter CSV</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500">Dossiers affichés</p>
          <p className="font-display text-lg font-bold tabular-nums mt-0.5">{filtered.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500">Garçons</p>
          <p className="font-display text-lg font-bold tabular-nums mt-0.5 text-blue-700 dark:text-blue-400">{garconsCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500">Filles</p>
          <p className="font-display text-lg font-bold tabular-nums mt-0.5 text-emerald-700 dark:text-emerald-400">{fillesCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500">Non affectés</p>
          <p className="font-display text-lg font-bold tabular-nums mt-0.5 text-amber-700 dark:text-amber-400">{nonAffectesCount}</p>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="dossiers"
        defaultFilter="administratif"
        collapsible
        defaultExpanded={false}
      />

      <div className="grid lg:grid-cols-12 gap-6">
        {canCreate && (
          <form
            onSubmit={handleCreate}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h2 className="font-display font-semibold text-base">Créer un dossier élève</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                placeholder="Matricule (PK-2026-001)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                value={sexe}
                onChange={(e) => setSexe(e.target.value as 'M' | 'F')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                required
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                placeholder="Prénom"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={dateNaissance}
                onChange={(e) => setDateNaissance(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                value={lieuNaissance}
                onChange={(e) => setLieuNaissance(e.target.value)}
                placeholder="Lieu de naissance"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={anneeId}
                onChange={(e) => setAnneeId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Année...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.libelle}
                  </option>
                ))}
              </select>
              <select
                value={classeId}
                onChange={(e) => setClasseId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Classe...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Téléphone"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Adresse"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={parentNom}
                onChange={(e) => setParentNom(e.target.value)}
                placeholder="Nom du parent"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                value={parentTel}
                onChange={(e) => setParentTel(e.target.value)}
                placeholder="Tél. parent"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
              Enregistrer le dossier
            </button>
          </form>
        )}

        <div className={`${canCreate ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucun dossier élève enregistré.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">Élève</th>
                      <th className="py-3 px-4 font-semibold">Matricule</th>
                      <th className="py-3 px-4 font-semibold">Classe</th>
                      <th className="py-3 px-4 font-semibold">Contact</th>
                      {canCreate && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            {photoUrls[s.id] ? (
                              <img
                                src={photoUrls[s.id]}
                                alt={`${s.prenom} ${s.nom}`}
                                className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-slate-500">
                                {s.prenom[0]}
                                {s.nom[0]}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {s.nom} {s.prenom}
                              </p>
                              <p className="text-[11px] text-slate-500 tabular-nums">Né(e) le {s.date_naissance}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums">{s.matricule}</td>
                        <td className="py-2.5 px-4">{s.classe_nom || 'Non affecté'}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                          {s.telephone || '—'} · Parent : {s.parent_telephone || '—'}
                        </td>
                        {canCreate && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                            <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                              <Camera className="w-3.5 h-3.5" />
                              <span>Photo</span>
                              <input
                                type="file"
                                accept=".png,.jpg,.jpeg,.webp"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handlePhotoUpload(s.id, e.target.files[0])}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Modifier</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(s.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {canSeeModRequests && modRequests.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="font-display font-semibold text-base">
                Demandes de modifications importantes (Approbation Proviseur)
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {modRequests.map((r) => (
                  <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {r.eleve_nom} ({r.eleve_matricule}) · Champ : {r.champ}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {r.ancienne_valeur || '—'} → <span className="font-semibold">{r.nouvelle_valeur}</span> · Motif : {r.motif}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Demandé par {r.demandeur_nom} · Statut : {r.statut}
                      </p>
                    </div>
                    {currentUser.role === 'proviseur' && r.statut === 'en_attente' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDecideMod(r.id, 'approuvee')}
                          className="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium"
                        >
                          Approuver
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecideMod(r.id, 'refusee')}
                          className="px-3 py-1.5 rounded bg-red-700 text-white font-medium"
                        >
                          Refuser
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dossier Modal (Décision n°12) */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4"
          >
            <h2 className="font-display font-semibold text-base">
              Modifier le dossier de {editing.prenom} {editing.nom}
            </h2>
            <p className="text-[11px] text-slate-500">
              Les champs courants (téléphone, adresse, contact parent) sont appliqués immédiatement. Les champs importants (identité, naissance, matricule, classe) sont soumis au proviseur avec motif obligatoire.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Nom (Important)</label>
                <input
                  value={editFields.nom || ''}
                  onChange={(e) => setEditFields({ ...editFields, nom: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Prénom (Important)</label>
                <input
                  value={editFields.prenom || ''}
                  onChange={(e) => setEditFields({ ...editFields, prenom: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Matricule (Important)</label>
                <input
                  value={editFields.matricule || ''}
                  onChange={(e) => setEditFields({ ...editFields, matricule: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Classe (Important)</label>
                <select
                  value={editFields.classe_id || ''}
                  onChange={(e) => setEditFields({ ...editFields, classe_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">Aucune</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Téléphone élève (Courant)</label>
                <input
                  value={editFields.telephone || ''}
                  onChange={(e) => setEditFields({ ...editFields, telephone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Téléphone parent (Courant)</label>
                <input
                  value={editFields.parent_telephone || ''}
                  onChange={(e) => setEditFields({ ...editFields, parent_telephone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="block font-medium mb-1">Adresse (Courant)</label>
              <input
                value={editFields.adresse || ''}
                onChange={(e) => setEditFields({ ...editFields, adresse: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="text-xs">
              <label className="block font-medium mb-1">Motif (obligatoire si modification importante)</label>
              <input
                value={editMotif}
                onChange={(e) => setEditMotif(e.target.value)}
                placeholder="Ex. Correction orthographique selon acte de naissance..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Annuler
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
