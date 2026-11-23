import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Download, KeyRound } from 'lucide-react';
import { apiFetch, downloadCsv, generateBulletinPdf, generateReceiptPdf } from '../lib/api.ts';
import { ROLE_LABELS, formatDateTimeFr } from '../lib/labels.ts';
import type {
  AcademicYear,
  AttendanceRecord,
  Bulletin,
  DisciplineIncident,
  ExpenseRecord,
  FeeSchedule,
  InventoryItem,
  PasswordResetRequest,
  PaymentRecord,
  SchoolClass,
  SchoolSettings,
  StudentDossier,
  UserAccount,
} from '../types.ts';
import { SchoolCalendar } from './SchoolCalendar.tsx';

interface OperationsModulesViewProps {
  mode: 'surveillance' | 'finance' | 'economat' | 'staff_modules' | 'archives';
  currentUser: UserAccount;
  settings: SchoolSettings | null;
}

export const OperationsModulesView: React.FC<OperationsModulesViewProps> = ({ mode, currentUser, settings }) => {
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Shared lists
  const [students, setStudents] = useState<StudentDossier[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  // Surveillance state
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([]);
  const [attEleveId, setAttEleveId] = useState(0);
  const [attType, setAttType] = useState<'absence' | 'retard'>('absence');
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attDuree, setAttDuree] = useState('');
  const [attJustif, setAttJustif] = useState('');
  const [incEleveId, setIncEleveId] = useState(0);
  const [incDate, setIncDate] = useState(new Date().toISOString().slice(0, 10));
  const [incGravite, setIncGravite] = useState<'mineure' | 'moyenne' | 'grave'>('mineure');
  const [incDesc, setIncDesc] = useState('');
  const [incSanction, setIncSanction] = useState('');

  // Finance state (Décision n°11)
  const [financeTab, setFinanceTab] = useState<'payments' | 'unpaid' | 'fees' | 'expenses'>('payments');
  const [fees, setFees] = useState<FeeSchedule[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [unpaid, setUnpaid] = useState<
    {
      eleve_id: number;
      eleve_nom: string;
      eleve_matricule: string;
      classe_nom: string | null;
      frais_id: number;
      frais_libelle: string;
      montant_du: number;
      montant_paye: number;
      reste_a_payer: number;
      date_echeance: string;
    }[]
  >([]);
  const [feeYearId, setFeeYearId] = useState(0);
  const [feeClassId, setFeeClassId] = useState(0);
  const [feeLibelle, setFeeLibelle] = useState('');
  const [feeMontant, setFeeMontant] = useState('');
  const [feeEcheance, setFeeEcheance] = useState('');
  const [payEleveId, setPayEleveId] = useState(0);
  const [payFraisId, setPayFraisId] = useState(0);
  const [payMontant, setPayMontant] = useState('');
  const [payMode, setPayMode] = useState<'especes' | 'virement' | 'mobile_money' | 'cheque'>('especes');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCat, setExpCat] = useState('Fonctionnement');
  const [expLib, setExpLib] = useState('');
  const [expMontant, setExpMontant] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expBenef, setExpBenef] = useState('');

  // Economat state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<
    { id: number; designation: string; type_mouvement: string; quantite: number; motif: string; acteur_nom: string; created_at: string }[]
  >([]);
  const [itemCode, setItemCode] = useState('');
  const [itemDesig, setItemDesig] = useState('');
  const [itemCat, setItemCat] = useState('Fournitures');
  const [itemQty, setItemQty] = useState(0);
  const [movItemId, setMovItemId] = useState(0);
  const [movType, setMovType] = useState<'entree' | 'sortie'>('entree');
  const [movQty, setMovQty] = useState(1);
  const [movMotif, setMovMotif] = useState('');

  // Other staff records & archives
  const [staffRecords, setStaffRecords] = useState<
    { id: number; module_type: string; titre: string; reference: string | null; details: string; auteur_nom: string; created_at: string }[]
  >([]);
  const [recTitre, setRecTitre] = useState('');
  const [recRef, setRecRef] = useState('');
  const [recDetails, setRecDetails] = useState('');
  const [archivedStudents, setArchivedStudents] = useState<StudentDossier[]>([]);
  const [archivedBulletins, setArchivedBulletins] = useState<Bulletin[]>([]);
  const [passwordResets, setPasswordResets] = useState<PasswordResetRequest[]>([]);
  const [issuedResetCode, setIssuedResetCode] = useState<{ code: string; email: string; nom: string } | null>(null);

  const loadAll = async () => {
    setError(null);
    try {
      if (mode === 'surveillance') {
        const [stRes, svRes] = await Promise.all([
          apiFetch<{ students: StudentDossier[] }>('/api/students'),
          apiFetch<{ attendance: AttendanceRecord[]; incidents: DisciplineIncident[] }>('/api/surveillance'),
        ]);
        setStudents(stRes.students);
        setAttendance(svRes.attendance);
        setIncidents(svRes.incidents);
        if (stRes.students[0]) {
          setAttEleveId((p) => p || stRes.students[0].id);
          setIncEleveId((p) => p || stRes.students[0].id);
        }
      } else if (mode === 'finance') {
        const [fRes, stRes, yRes, cRes] = await Promise.all([
          apiFetch<{ fees: FeeSchedule[]; payments: PaymentRecord[]; expenses: ExpenseRecord[]; unpaid: typeof unpaid }>('/api/finance'),
          apiFetch<{ students: StudentDossier[] }>('/api/students'),
          apiFetch<{ years: AcademicYear[] }>('/api/academic-years'),
          apiFetch<{ classes: SchoolClass[] }>('/api/classes'),
        ]);
        setFees(fRes.fees);
        setPayments(fRes.payments);
        setExpenses(fRes.expenses);
        setUnpaid(fRes.unpaid);
        setStudents(stRes.students);
        setYears(yRes.years);
        setClasses(cRes.classes);
        const activeY = yRes.years.find((y) => y.est_active) || yRes.years[0];
        if (activeY) setFeeYearId((p) => p || activeY.id);
        if (stRes.students[0]) setPayEleveId((p) => p || stRes.students[0].id);
        if (fRes.fees[0]) setPayFraisId((p) => p || fRes.fees[0].id);
      } else if (mode === 'economat') {
        const res = await apiFetch<{ items: InventoryItem[]; movements: typeof movements }>('/api/economat');
        setItems(res.items);
        setMovements(res.movements);
        if (res.items[0]) setMovItemId((p) => p || res.items[0].id);
      } else if (mode === 'staff_modules') {
        const res = await apiFetch<{ records: typeof staffRecords }>(`/api/staff-records?module_type=${currentUser.role}`);
        setStaffRecords(res.records);
        if (currentUser.role === 'informaticien') {
          const prRes = await apiFetch<{ requests: PasswordResetRequest[] }>('/api/password-resets');
          setPasswordResets(prRes.requests);
        }
      } else if (mode === 'archives') {
        const res = await apiFetch<{ archivedStudents: StudentDossier[]; archivedBulletins: Bulletin[] }>('/api/archives');
        setArchivedStudents(res.archivedStudents);
        setArchivedBulletins(res.archivedBulletins);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [mode]);

  // ---------------- SURVEILLANCE ----------------
  if (mode === 'surveillance') {
    const canEdit = ['surveillant', 'proviseur'].includes(currentUser.role);
    const submitAttendance = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/surveillance/attendance', {
          method: 'POST',
          body: JSON.stringify({
            eleve_id: attEleveId,
            date_evenement: attDate,
            type: attType,
            duree_minutes: attDuree ? Number(attDuree) : null,
            est_justifie: Boolean(attJustif.trim()),
            justificatif: attJustif,
          }),
        });
        setAttDuree('');
        setAttJustif('');
        setFeedback('Événement enregistré.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    const submitIncident = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/surveillance/incidents', {
          method: 'POST',
          body: JSON.stringify({
            eleve_id: incEleveId,
            date_incident: incDate,
            gravite: incGravite,
            description: incDesc,
            sanction: incSanction,
          }),
        });
        setIncDesc('');
        setIncSanction('');
        setFeedback('Incident disciplinaire enregistré et transmis au censeur.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Surveillance : Absences, Retards & Discipline
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Suivi quotidien et transmission des rapports au censeur (Décision n°16 · Non affichés sur les bulletins officiels)
          </p>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="surveillance"
          defaultFilter="all"
          collapsible
          defaultExpanded={false}
        />

        {canEdit && (
          <div className="grid lg:grid-cols-2 gap-6">
            <form
              onSubmit={submitAttendance}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h2 className="font-display font-semibold text-base">Enregistrer une absence ou un retard</h2>
              <select
                required
                value={attEleveId}
                onChange={(e) => setAttEleveId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Choisir un élève...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.matricule} — {s.nom} {s.prenom} ({s.classe_nom})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={attType}
                  onChange={(e) => setAttType(e.target.value as 'absence' | 'retard')}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="absence">Absence</option>
                  <option value="retard">Retard</option>
                </select>
                <input
                  type="date"
                  required
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  placeholder="Min. retard"
                  value={attDuree}
                  onChange={(e) => setAttDuree(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
              </div>
              <input
                value={attJustif}
                onChange={(e) => setAttJustif(e.target.value)}
                placeholder="Justificatif (laisser vide si non justifié)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Enregistrer
              </button>
            </form>

            <form
              onSubmit={submitIncident}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h2 className="font-display font-semibold text-base">Signaler un incident disciplinaire</h2>
              <select
                required
                value={incEleveId}
                onChange={(e) => setIncEleveId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Choisir un élève...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.matricule} — {s.nom} {s.prenom}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <select
                  value={incGravite}
                  onChange={(e) => setIncGravite(e.target.value as 'mineure' | 'moyenne' | 'grave')}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="mineure">Gravité mineure</option>
                  <option value="moyenne">Gravité moyenne</option>
                  <option value="grave">Gravité grave</option>
                </select>
              </div>
              <input
                required
                value={incDesc}
                onChange={(e) => setIncDesc(e.target.value)}
                placeholder="Description des faits"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                value={incSanction}
                onChange={(e) => setIncSanction(e.target.value)}
                placeholder="Sanction / mesure prise (optionnel)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                Transmettre au censeur
              </button>
            </form>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-base">Absences & Retards ({attendance.length})</h2>
              {attendance.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `absences_retards_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Matricule', 'Élève', 'Type', 'Date', 'Durée (min)', 'Justifié', 'Justificatif'],
                      attendance.map((a) => [
                        a.eleve_matricule || '',
                        a.eleve_nom || '',
                        a.type,
                        a.date_evenement,
                        a.duree_minutes ?? '',
                        a.est_justifie ? 'Oui' : 'Non',
                        a.justificatif || '',
                      ])
                    )
                  }
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              )}
            </div>
            {attendance.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune absence ou retard enregistré.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto">
                {attendance.map((a) => (
                  <div key={a.id} className="py-2.5 flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {a.eleve_nom} ({a.eleve_matricule}) · {a.type === 'absence' ? 'Absence' : `Retard ${a.duree_minutes || ''} min`}
                      </p>
                      <p className="text-slate-500">
                        {a.date_evenement} · {a.est_justifie ? `Justifié : ${a.justificatif}` : 'Non justifié'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-base">Incidents disciplinaires ({incidents.length})</h2>
              {incidents.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `incidents_discipline_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Matricule', 'Élève', 'Date', 'Gravité', 'Description', 'Sanction', 'Signalé par'],
                      incidents.map((d) => [
                        d.eleve_matricule || '',
                        d.eleve_nom || '',
                        d.date_incident,
                        d.gravite,
                        d.description,
                        d.sanction || '',
                        d.signale_nom || '',
                      ])
                    )
                  }
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              )}
            </div>
            {incidents.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun incident signalé.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto">
                {incidents.map((d) => (
                  <div key={d.id} className="py-2.5">
                    <p className="font-semibold">
                      {d.eleve_nom} ({d.eleve_matricule}) · {d.gravite}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">{d.description}</p>
                    <p className="text-[11px] text-slate-400">
                      {d.date_incident} · Sanction : {d.sanction || 'Aucune'} · Signalé par {d.signale_nom}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- FINANCE & ACCOUNTING (Décision n°11) ----------------
  if (mode === 'finance') {
    const isStaffFinance = ['comptable', 'proviseur'].includes(currentUser.role);
    const canReadOnlyFinance = currentUser.role === 'fondateur';
    const totalEncaisse = payments.reduce((s, p) => s + Number(p.montant_paye), 0);
    const totalDepenses = expenses.reduce((s, e) => s + Number(e.montant), 0);
    const totalImpayes = unpaid.reduce((s, u) => s + Number(u.reste_a_payer), 0);

    const handleAddFee = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/finance/fees', {
          method: 'POST',
          body: JSON.stringify({
            annee_id: feeYearId,
            classe_id: feeClassId || null,
            libelle: feeLibelle,
            montant: Number(feeMontant),
            date_echeance: feeEcheance,
          }),
        });
        setFeeLibelle('');
        setFeeMontant('');
        setFeedback('Frais de scolarité enregistré.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    const handleAddPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const res = await apiFetch<{ numero_recu: string }>('/api/finance/payments', {
          method: 'POST',
          body: JSON.stringify({
            eleve_id: payEleveId,
            frais_id: payFraisId,
            montant_paye: Number(payMontant),
            mode_paiement: payMode,
            date_paiement: payDate,
          }),
        });
        setPayMontant('');
        setFeedback(`Paiement enregistré. Reçu officiel : ${res.numero_recu}`);
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/finance/expenses', {
          method: 'POST',
          body: JSON.stringify({
            categorie: expCat,
            libelle: expLib,
            montant: Number(expMontant),
            date_depense: expDate,
            beneficiaire: expBenef,
          }),
        });
        setExpLib('');
        setExpMontant('');
        setExpBenef('');
        setFeedback('Dépense enregistrée.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Gestion financière & Comptabilité
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Scolarité, paiements, reçus PDF, impayés, dépenses et rapports financiers (Décision n°11)
            </p>
          </div>
          {(isStaffFinance || canReadOnlyFinance) && (
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              {[
                { id: 'payments', label: 'Paiements & Reçus' },
                { id: 'unpaid', label: 'Impayés' },
                { id: 'fees', label: 'Frais & Échéances' },
                { id: 'expenses', label: 'Dépenses' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFinanceTab(t.id as typeof financeTab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    financeTab === t.id ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="finance"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        {(isStaffFinance || canReadOnlyFinance) && (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total encaissé</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1">{totalEncaisse.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total dépenses</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1">{totalDepenses.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Reste à recouvrer (Impayés)</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1 text-amber-700 dark:text-amber-400">
                {totalImpayes.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
          </div>
        )}

        {financeTab === 'payments' && (
          <div className="grid lg:grid-cols-12 gap-6">
            {isStaffFinance && (
              <form
                onSubmit={handleAddPayment}
                className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
              >
                <h2 className="font-display font-semibold text-base">Enregistrer un paiement</h2>
                <select
                  required
                  value={payEleveId}
                  onChange={(e) => setPayEleveId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Élève...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.matricule} — {s.nom} {s.prenom}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={payFraisId}
                  onChange={(e) => setPayFraisId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Type de frais...</option>
                  {fees.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.libelle} ({Number(f.montant).toLocaleString('fr-FR')} FCFA)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  min={1}
                  value={payMontant}
                  onChange={(e) => setPayMontant(e.target.value)}
                  placeholder="Montant payé (FCFA)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as typeof payMode)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="especes">Espèces</option>
                    <option value="virement">Virement</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="cheque">Chèque</option>
                  </select>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Valider & Générer le reçu
                </button>
              </form>
            )}

            <div className={`${isStaffFinance ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
              {payments.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {payments.length} paiement(s) encaissé(s)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `paiements_scolarite_${new Date().toISOString().slice(0, 10)}.csv`,
                        ['N° Reçu', 'Matricule', 'Élève', 'Libellé', 'Mode', 'Date', 'Montant (FCFA)'],
                        payments.map((p) => [
                          p.numero_recu,
                          p.eleve_matricule || '',
                          p.eleve_nom || '',
                          p.frais_libelle || '',
                          p.mode_paiement,
                          p.date_paiement,
                          p.montant_paye,
                        ])
                      )
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" /> Exporter CSV
                  </button>
                </div>
              )}
              {payments.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Aucun paiement enregistré.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                        <th className="py-3 px-4 font-semibold">Reçu N°</th>
                        <th className="py-3 px-4 font-semibold">Élève</th>
                        <th className="py-3 px-4 font-semibold">Libellé</th>
                        <th className="py-3 px-4 font-semibold text-right">Montant</th>
                        <th className="py-3 px-4 font-semibold text-right">Reçu PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 px-4 font-mono">{p.numero_recu}</td>
                          <td className="py-2.5 px-4 font-semibold">
                            {p.eleve_nom} ({p.eleve_matricule})
                          </td>
                          <td className="py-2.5 px-4">
                            {p.frais_libelle} · {p.date_paiement}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                            {Number(p.montant_paye).toLocaleString('fr-FR')} FCFA
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => generateReceiptPdf(p, settings)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 dark:bg-blue-700 text-white font-medium"
                            >
                              <Download className="w-3.5 h-3.5" /> Reçu
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {financeTab === 'unpaid' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {unpaid.length > 0 && (
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {unpaid.length} dossier(s) présentant un solde à recouvrer
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `impayes_scolarite_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Matricule', 'Élève', 'Classe', 'Frais', 'Échéance', 'Dû', 'Payé', 'Reste à payer'],
                      unpaid.map((u) => [
                        u.eleve_matricule,
                        u.eleve_nom,
                        u.classe_nom || '',
                        u.frais_libelle,
                        u.date_echeance,
                        u.montant_du,
                        u.montant_paye,
                        u.reste_a_payer,
                      ])
                    )
                  }
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" /> Exporter CSV
                </button>
              </div>
            )}
            {unpaid.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Aucun impayé constaté.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                      <th className="py-3 px-4 font-semibold">Élève</th>
                      <th className="py-3 px-4 font-semibold">Frais & Échéance</th>
                      <th className="py-3 px-4 font-semibold text-right">Dû</th>
                      <th className="py-3 px-4 font-semibold text-right">Payé</th>
                      <th className="py-3 px-4 font-semibold text-right">Reste à payer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {unpaid.map((u, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-4 font-semibold">
                          {u.eleve_nom} ({u.eleve_matricule})
                        </td>
                        <td className="py-2.5 px-4">
                          {u.frais_libelle} · Échéance : {u.date_echeance}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{u.montant_du.toLocaleString('fr-FR')}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{u.montant_paye.toLocaleString('fr-FR')}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-red-700 dark:text-red-400">
                          {u.reste_a_payer.toLocaleString('fr-FR')} FCFA
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {financeTab === 'fees' && (
          <div className="grid lg:grid-cols-12 gap-6">
            {isStaffFinance && (
              <form
                onSubmit={handleAddFee}
                className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
              >
                <h2 className="font-display font-semibold text-base">Configurer un frais scolaire</h2>
                <select
                  required
                  value={feeYearId}
                  onChange={(e) => setFeeYearId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Année scolaire...</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.libelle}
                    </option>
                  ))}
                </select>
                <select
                  value={feeClassId}
                  onChange={(e) => setFeeClassId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value={0}>Toutes les classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={feeLibelle}
                  onChange={(e) => setFeeLibelle(e.target.value)}
                  placeholder="Libellé (ex. Inscription, Tranche 1)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  required
                  min={1}
                  value={feeMontant}
                  onChange={(e) => setFeeMontant(e.target.value)}
                  placeholder="Montant (FCFA)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
                <input
                  type="date"
                  required
                  value={feeEcheance}
                  onChange={(e) => setFeeEcheance(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Enregistrer le frais
                </button>
              </form>
            )}

            <div className={`${isStaffFinance ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
              {fees.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Aucun frais défini.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <th className="py-3 px-4 font-semibold">Libellé</th>
                        <th className="py-3 px-4 font-semibold">Classe</th>
                        <th className="py-3 px-4 font-semibold">Échéance</th>
                        <th className="py-3 px-4 font-semibold text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {fees.map((f) => (
                        <tr key={f.id}>
                          <td className="py-2.5 px-4 font-semibold">{f.libelle}</td>
                          <td className="py-2.5 px-4">{f.classe_nom || 'Toutes'}</td>
                          <td className="py-2.5 px-4 tabular-nums">{f.date_echeance}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                            {Number(f.montant).toLocaleString('fr-FR')} FCFA
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {financeTab === 'expenses' && (
          <div className="grid lg:grid-cols-12 gap-6">
            {isStaffFinance && (
              <form
                onSubmit={handleAddExpense}
                className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
              >
                <h2 className="font-display font-semibold text-base">Enregistrer une dépense</h2>
                <input
                  required
                  value={expCat}
                  onChange={(e) => setExpCat(e.target.value)}
                  placeholder="Catégorie"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  required
                  value={expLib}
                  onChange={(e) => setExpLib(e.target.value)}
                  placeholder="Objet de la dépense"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  required
                  min={1}
                  value={expMontant}
                  onChange={(e) => setExpMontant(e.target.value)}
                  placeholder="Montant (FCFA)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
                <input
                  required
                  value={expBenef}
                  onChange={(e) => setExpBenef(e.target.value)}
                  placeholder="Bénéficiaire / Fournisseur"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">
                  Enregistrer la dépense
                </button>
              </form>
            )}

            <div className={`${isStaffFinance ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}>
              {expenses.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {expenses.length} dépense(s) enregistrée(s)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `depenses_etablissement_${new Date().toISOString().slice(0, 10)}.csv`,
                        ['Date', 'Catégorie', 'Libellé', 'Bénéficiaire', 'Montant (FCFA)'],
                        expenses.map((ex) => [ex.date_depense, ex.categorie, ex.libelle, ex.beneficiaire, ex.montant])
                      )
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" /> Exporter CSV
                  </button>
                </div>
              )}
              {expenses.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Aucune dépense enregistrée.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <th className="py-3 px-4 font-semibold">Date</th>
                        <th className="py-3 px-4 font-semibold">Libellé</th>
                        <th className="py-3 px-4 font-semibold">Bénéficiaire</th>
                        <th className="py-3 px-4 font-semibold text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {expenses.map((ex) => (
                        <tr key={ex.id}>
                          <td className="py-2.5 px-4 tabular-nums">{ex.date_depense}</td>
                          <td className="py-2.5 px-4 font-semibold">
                            {ex.libelle} <span className="font-normal text-slate-500">({ex.categorie})</span>
                          </td>
                          <td className="py-2.5 px-4">{ex.beneficiaire}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                            {Number(ex.montant).toLocaleString('fr-FR')} FCFA
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- ECONOMAT / STOCKS ----------------
  if (mode === 'economat') {
    const canManage = ['economat', 'proviseur'].includes(currentUser.role);
    const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/economat/items', {
          method: 'POST',
          body: JSON.stringify({ code: itemCode, designation: itemDesig, categorie: itemCat, quantite: itemQty }),
        });
        setItemCode('');
        setItemDesig('');
        setItemQty(0);
        setFeedback('Article ajouté au stock.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    const handleMovement = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/economat/movements', {
          method: 'POST',
          body: JSON.stringify({ item_id: movItemId, type_mouvement: movType, quantite: movQty, motif: movMotif }),
        });
        setMovMotif('');
        setFeedback('Mouvement de stock enregistré.');
        await loadAll();
      } catch (err) {
        setError((err as Error).message);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Économat : Fournitures, Stocks & Matériels
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gestion des stocks et mouvements d’inventaire (Décision n°16)</p>
        </div>
        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
        {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

        <SchoolCalendar
          user={currentUser}
          space="economat"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        {canManage && (
          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={handleAddItem} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="font-display font-semibold text-base">Nouvel article en stock</h2>
              <div className="grid grid-cols-2 gap-2">
                <input required value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Code (ex. CRAIE-01)" className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
                <input required value={itemCat} onChange={(e) => setItemCat(e.target.value)} placeholder="Catégorie" className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input required value={itemDesig} onChange={(e) => setItemDesig(e.target.value)} placeholder="Désignation" className="col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
                <input type="number" min={0} value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))} placeholder="Qté" className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums" />
              </div>
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">Ajouter l’article</button>
            </form>

            <form onSubmit={handleMovement} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="font-display font-semibold text-base">Mouvement d’entrée / sortie</h2>
              <select required value={movItemId} onChange={(e) => setMovItemId(Number(e.target.value))} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value={0}>Choisir un article...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.designation} (Stock : {it.quantite})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={movType} onChange={(e) => setMovType(e.target.value as 'entree' | 'sortie')} className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <option value="entree">Entrée</option>
                  <option value="sortie">Sortie</option>
                </select>
                <input type="number" min={1} required value={movQty} onChange={(e) => setMovQty(Number(e.target.value))} className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums" />
              </div>
              <input required value={movMotif} onChange={(e) => setMovMotif(e.target.value)} placeholder="Motif / Service demandeur" className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">Valider le mouvement</button>
            </form>
          </div>
        )}

        {items.some((it) => it.quantite <= it.seuil_alerte) && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Alerte seuil de stock critique</p>
              <p className="text-[11px] mt-0.5">
                {items.filter((it) => it.quantite <= it.seuil_alerte).length} article(s) ont atteint ou sont sous leur seuil minimal :{' '}
                {items
                  .filter((it) => it.quantite <= it.seuil_alerte)
                  .map((it) => `${it.designation} (${it.quantite})`)
                  .join(', ')}
                .
              </p>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {items.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                Inventaire ({items.length} article(s))
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `inventaire_economat_${new Date().toISOString().slice(0, 10)}.csv`,
                    ['Code', 'Désignation', 'Catégorie', 'Quantité', 'Seuil alerte'],
                    items.map((it) => [it.code, it.designation, it.categorie, it.quantite, it.seuil_alerte])
                  )
                }
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" /> Exporter CSV
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Aucun article en stock.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <th className="py-3 px-4 font-semibold">Code</th>
                    <th className="py-3 px-4 font-semibold">Désignation</th>
                    <th className="py-3 px-4 font-semibold">Catégorie</th>
                    <th className="py-3 px-4 font-semibold text-right">Seuil</th>
                    <th className="py-3 px-4 font-semibold text-right">Quantité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it) => {
                    const low = it.quantite <= it.seuil_alerte;
                    return (
                      <tr key={it.id}>
                        <td className="py-2.5 px-4 font-mono">{it.code}</td>
                        <td className="py-2.5 px-4 font-semibold">{it.designation}</td>
                        <td className="py-2.5 px-4">{it.categorie}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">{it.seuil_alerte}</td>
                        <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${low ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {it.quantite} {low ? '· Stock bas' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- ARCHIVES (Décision n°14) ----------------
  if (mode === 'archives') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Archives durables de l’établissement</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Conservation durable des dossiers scolaires et bulletins officiels sans suppression automatique (Décision n°14)
          </p>
        </div>

        <SchoolCalendar
          user={currentUser}
          space="archives"
          defaultFilter="administratif"
          collapsible
          defaultExpanded={false}
        />

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display font-semibold text-base">Dossiers élèves archivés ({archivedStudents.length})</h2>
            {archivedStudents.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun dossier archivé.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {archivedStudents.map((s) => (
                  <div key={s.id} className="py-2.5">
                    <p className="font-semibold">{s.nom} {s.prenom} ({s.matricule})</p>
                    <p className="text-slate-500">Classe : {s.classe_nom || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display font-semibold text-base">Bulletins officiels archivés ({archivedBulletins.length})</h2>
            {archivedBulletins.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun bulletin officiel archivé.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {archivedBulletins.map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{b.eleve_nom} {b.eleve_prenom} ({b.eleve_matricule})</p>
                      <p className="text-slate-500">{b.classe_nom} · {b.periode_nom} · v{b.version}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => generateBulletinPdf(b, settings)}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700"
                    >
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- OTHER STAFF MODULES ----------------
  const submitStaffRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/staff-records', {
        method: 'POST',
        body: JSON.stringify({
          module_type: currentUser.role,
          titre: recTitre,
          reference: recRef,
          details: recDetails,
        }),
      });
      setRecTitre('');
      setRecRef('');
      setRecDetails('');
      setFeedback('Rapport / opération enregistré(e).');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleIssueReset = async (id: number) => {
    setError(null);
    setIssuedResetCode(null);
    try {
      const res = await apiFetch<{ temp_code: string; user_email: string; user_nom: string }>(
        `/api/password-resets/${id}/issue`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setIssuedResetCode({ code: res.temp_code, email: res.user_email, nom: res.user_nom });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRefuseReset = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/password-resets/${id}/refuse`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Refusé par le support informatique.' }),
      });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Espace {ROLE_LABELS[currentUser.role]}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Enregistrement des opérations et production de rapports liés à votre mission (Décision n°16)
        </p>
      </div>
      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">{error}</div>}
      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</div>}

      <SchoolCalendar
        user={currentUser}
        space="staff_modules"
        defaultFilter="administratif"
        collapsible
        defaultExpanded={false}
      />

      {currentUser.role === 'informaticien' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Support comptes · Réinitialisations de mot de passe ({passwordResets.filter((r) => r.statut === 'en_attente').length} en attente)
            </h2>
          </div>

          {issuedResetCode && (
            <div className="p-3.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-200">
                  Code temporaire généré pour {issuedResetCode.nom} ({issuedResetCode.email})
                </p>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                  Communiquez ce code à l’utilisateur (valable 24 h). Il ne sera plus affiché après fermeture.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <code className="px-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 font-mono font-bold text-sm text-slate-900 dark:text-white select-all">
                  {issuedResetCode.code}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(issuedResetCode.code)}
                  className="px-2.5 py-1.5 rounded border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 text-xs font-medium inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copier
                </button>
              </div>
            </div>
          )}

          {passwordResets.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune demande de réinitialisation de mot de passe.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {passwordResets.map((pr) => (
                <div key={pr.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {pr.user_nom || pr.email_saisi} · {pr.user_role ? ROLE_LABELS[pr.user_role] || pr.user_role : 'Compte'}
                    </p>
                    <p className="text-slate-500">
                      {pr.email_saisi} · Motif : {pr.motif || 'Non précisé'} · {formatDateTimeFr(pr.created_at)}
                    </p>
                    <p className="text-[11px] font-medium mt-0.5 text-slate-600 dark:text-slate-400">
                      Statut : {pr.statut} {pr.issued_by_nom ? `· Traité par ${pr.issued_by_nom}` : ''}
                    </p>
                  </div>
                  {pr.statut === 'en_attente' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleIssueReset(pr.id)}
                        className="px-3 py-1.5 rounded bg-slate-900 dark:bg-blue-700 text-white font-medium"
                      >
                        Générer code temporaire
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefuseReset(pr.id)}
                        className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400 font-medium"
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        <form onSubmit={submitStaffRecord} className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit">
          <h2 className="font-display font-semibold text-base">Nouvel enregistrement</h2>
          <input required value={recTitre} onChange={(e) => setRecTitre(e.target.value)} placeholder="Titre / Objet" className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <input value={recRef} onChange={(e) => setRecRef(e.target.value)} placeholder="Référence (livre, ticket, dossier...)" className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <textarea required rows={3} value={recDetails} onChange={(e) => setRecDetails(e.target.value)} placeholder="Détails de l’intervention ou du rapport..." className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <button type="submit" className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-medium">Enregistrer</button>
        </form>

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display font-semibold text-base">Registre ({staffRecords.length})</h2>
          {staffRecords.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune opération enregistrée.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {staffRecords.map((r) => (
                <div key={r.id} className="py-3">
                  <p className="font-semibold">{r.titre} {r.reference ? `· Réf: ${r.reference}` : ''}</p>
                  <p className="text-slate-600 dark:text-slate-400 mt-0.5">{r.details}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{r.auteur_nom} · {formatDateTimeFr(r.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
