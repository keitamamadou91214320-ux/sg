import React from 'react';
import type { Bulletin, BulletinSubjectLine, SchoolSettings } from '../types.ts';

interface OfficialBulletinSheetProps {
  bulletin: Bulletin;
  settings: SchoolSettings | null;
  photoUrl?: string | null;
  logoUrl?: string | null;
  stampUrl?: string | null;
  canEditAppreciation?: boolean;
  editAppreciation?: string;
  onChangeAppreciation?: (val: string) => void;
  onSaveAppreciation?: () => void;
}

function fmtFr(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  return Number(val.toFixed(2)).toString().replace('.', ',');
}

function fmtFrFixed(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(2).replace('.', ',');
}

function formatBirthDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
  }
  return iso;
}

export const OfficialBulletinSheet: React.FC<OfficialBulletinSheetProps> = ({
  bulletin,
  settings,
  photoUrl,
  logoUrl,
  stampUrl,
  canEditAppreciation = false,
  editAppreciation = '',
  onChangeAppreciation,
  onSaveAppreciation,
}) => {
  let lines: BulletinSubjectLine[] = [];
  try {
    lines = JSON.parse(bulletin.lignes_json || '[]') as BulletinSubjectLine[];
  } catch {
    lines = [];
  }

  const totalCoef = lines.reduce(
    (acc, l) => (l.moyenne_sur_20 !== null ? acc + l.coefficient : acc),
    0
  );
  const totalWeighted = lines.reduce(
    (acc, l) => (l.note_ponderee !== null ? acc + l.note_ponderee : acc),
    0
  );

  const moy = bulletin.moyenne_generale;
  const tbThreshold = settings?.mention_tres_bien ?? 16;
  const bienThreshold = settings?.mention_bien ?? 14;
  const abThreshold = settings?.mention_assez_bien ?? 12;
  const passThreshold = settings?.mention_passable ?? 10;

  const showRank = settings?.afficher_rang_bulletin !== 0;
  const showClassAvg = settings?.afficher_moyenne_classe !== 0;
  const showApprec = settings?.afficher_appreciation_bulletin !== 0;

  const decisionRows: { label: string; checked: boolean }[] = [
    { label: 'Satisfaisant doit continuer', checked: moy !== null && moy >= abThreshold },
    { label: 'Peut Mieux Faire', checked: moy !== null && moy >= passThreshold && moy < abThreshold },
    { label: 'Insuffisant', checked: moy !== null && moy >= 8 && moy < passThreshold },
    { label: 'Risque de Redoubler', checked: moy !== null && moy >= 6 && moy < 8 },
    { label: "Risque l'exclusion", checked: moy !== null && moy < 6 },
  ];

  const distinctionRows: { label: string; checked: boolean }[] = [
    { label: 'Félicitations', checked: moy !== null && moy >= tbThreshold },
    { label: 'Encouragement', checked: moy !== null && moy >= bienThreshold && moy < tbThreshold },
    { label: "Tableau d'honneur", checked: moy !== null && moy >= abThreshold },
    { label: 'Avertissement', checked: moy !== null && moy < 8 },
    { label: 'Blâme', checked: moy !== null && moy < 6 },
  ];

  const stampId = `pk-stamp-${bulletin.id}`;

  return (
    <div className="bg-white text-black font-serif border border-slate-300 shadow-sm px-5 py-6 sm:px-8 sm:py-7 select-text">
      {/* Top 2-column administrative header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 text-[12px] leading-snug">
        <div className="flex items-start gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo établissement"
              className="w-12 h-12 object-contain shrink-0"
            />
          )}
          <div className="space-y-0.5">
            <p className="uppercase tracking-wide font-semibold text-[11px]">
              MINISTÈRE DE L&apos;ÉDUCATION NATIONALE
            </p>
            <p className="font-bold uppercase text-[12.5px]">
              {settings?.nom_etablissement || 'Lycée Prosper Kamara'}
            </p>
            {settings?.adresse && <p className="text-[11px] text-slate-700">{settings.adresse}</p>}
            {settings?.telephone && <p className="text-[11px] text-slate-700">Tél : {settings.telephone}</p>}
          </div>
        </div>

        <div className="flex items-start gap-3 sm:text-right">
          <div className="space-y-0.5">
            <p className="font-medium">
              Année Scolaire : <span className="font-bold">{bulletin.annee_libelle || '—'}</span>
            </p>
            <p className="font-semibold">{bulletin.periode_nom || '—'}</p>
            <p className="text-[10.5px] text-slate-600">
              Version v{bulletin.version} · {bulletin.statut === 'distribue' ? 'Document officiel' : 'Aperçu administratif'}
            </p>
          </div>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={`${bulletin.eleve_prenom} ${bulletin.eleve_nom}`}
              className="w-14 h-16 object-cover border border-black shrink-0"
            />
          )}
        </div>
      </div>

      {/* Double-rule Title Banner */}
      <div className="border-t-2 border-b-2 border-black py-1 my-3 text-center">
        <h2 className="font-serif font-bold tracking-widest uppercase text-base sm:text-lg text-black">
          BULLETIN DE NOTES
        </h2>
      </div>

      {/* Student Identity Grid (2 columns like photo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[12.5px] mb-3 leading-snug">
        <div className="space-y-1">
          <p>
            <span className="inline-block w-24">Prénoms :</span>
            <strong className="font-bold">{bulletin.eleve_prenom || '—'}</strong>
          </p>
          <p className="flex flex-wrap gap-x-5">
            <span>
              <span className="inline-block w-24">Né (e) le :</span>
              <strong>{formatBirthDateFr(bulletin.eleve_date_naissance)}</strong>
            </span>
            <span>
              à : <strong className="uppercase">{bulletin.eleve_lieu_naissance || '—'}</strong>
            </span>
          </p>
          <p>
            <span className="inline-block w-24">Matricule :</span>
            <strong className="font-mono text-[12px]">{bulletin.eleve_matricule || '—'}</strong>
          </p>
        </div>

        <div className="space-y-1">
          <p>
            <span className="inline-block w-28">Nom :</span>
            <strong className="uppercase font-bold">{bulletin.eleve_nom || '—'}</strong>
          </p>
          <p>
            <span className="inline-block w-28">Classe :</span>
            <strong className="font-bold">{bulletin.classe_nom || '—'}</strong>
          </p>
          <p className="flex flex-wrap gap-x-5">
            <span>
              <span className="inline-block w-28">Nbre d&apos;élèves :</span>
              <strong className="tabular-nums">{bulletin.effectif_classe}</strong>
            </span>
            <span>
              Classe Redoublée : <strong>0</strong>
            </span>
          </p>
        </div>
      </div>

      {/* Main Disciplines Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-[11.5px] text-black">
          <thead>
            <tr className="bg-slate-100/70">
              <th className="border border-black px-2 py-1 text-left font-bold uppercase tracking-wide">
                DISCIPLINES
              </th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-14">Devoir</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-14">Comp</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-16">Moy/20</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-12">Coef</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-16">Moy x</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-10">T.H</th>
              <th className="border border-black px-1.5 py-1 text-center font-semibold w-12">Rang</th>
              <th className="border border-black px-2 py-1 text-center font-semibold">Appréciations</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.matiere_id}>
                <td className="border border-black px-2 py-1 font-semibold uppercase text-[11px]">
                  {l.matiere_nom}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                  {fmtFr(l.devoir_moy)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                  {fmtFr(l.comp_note)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums font-semibold">
                  {fmtFr(l.moyenne_sur_20)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                  {l.coefficient}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                  {fmtFr(l.note_ponderee)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-semibold text-[10.5px]">
                  {l.th ?? (l.moyenne_sur_20 !== null && l.moyenne_sur_20 >= 12 ? 'TH' : '')}
                </td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                  {l.rang_matiere ?? '-'}
                </td>
                <td className="border border-black px-2 py-1 text-center text-[11px]">
                  {showApprec ? l.appreciation || '—' : '—'}
                </td>
              </tr>
            ))}

            {/* TOTAL Row */}
            <tr className="font-bold">
              <td colSpan={4} className="border border-black px-2 py-1 uppercase text-left tracking-wide">
                TOTAL
              </td>
              <td className="border border-black px-1.5 py-1 text-center tabular-nums">{totalCoef}</td>
              <td className="border border-black px-1.5 py-1 text-center tabular-nums">
                {fmtFrFixed(totalWeighted)}
              </td>
              <td colSpan={3} className="border border-black px-2 py-1" />
            </tr>

            {/* Summary Bottom Bar inside exact table frame (Moyenne / Rang / Retards / Absences) */}
            <tr>
              <td colSpan={9} className="border border-black p-0">
                <div className="grid grid-cols-4 sm:grid-cols-8 divide-x divide-y sm:divide-y-0 divide-black text-[12px]">
                  <div className="px-2 py-1 font-bold">Moyenne</div>
                  <div className="px-2 py-1 font-bold text-center tabular-nums">
                    {moy !== null ? `${fmtFrFixed(moy)} /20` : '—'}
                  </div>
                  <div className="px-2 py-1 font-semibold">Rang</div>
                  <div className="px-2 py-1 font-bold text-center tabular-nums">
                    {showRank ? (bulletin.rang !== null ? bulletin.rang : '—') : 'Masqué'}
                  </div>
                  <div className="px-2 py-1 font-semibold">Retards</div>
                  <div className="px-2 py-1 font-bold text-center tabular-nums">
                    {bulletin.retards_count ?? 0}
                  </div>
                  <div className="px-2 py-1 font-semibold">Absences</div>
                  <div className="px-2 py-1 font-bold text-center tabular-nums">
                    {bulletin.absences_count ?? 0}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Optional compact class benchmark line (respects setting) */}
      {showClassAvg && (
        <p className="mt-1.5 text-[10.5px] text-slate-700 tabular-nums text-right">
          Moyenne de la classe : <strong>{fmtFrFixed(bulletin.moyenne_classe)} /20</strong> · Meilleure :{' '}
          <strong>{fmtFrFixed(bulletin.meilleure_moyenne)}</strong> · Plus faible :{' '}
          <strong>{fmtFrFixed(bulletin.plus_faible_moyenne)}</strong>
        </p>
      )}

      {/* Side-by-side Decision & Distinction Tables (exact layout from photo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 mt-4">
        <table className="w-full border-collapse border border-black text-[11.5px]">
          <tbody>
            {decisionRows.map((r) => (
              <tr key={r.label}>
                <td className="border border-black px-2 py-0.5">{r.label}</td>
                <td className="border border-black w-12 text-center font-bold py-0.5">
                  {r.checked ? 'X' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full border-collapse border border-black text-[11.5px]">
          <tbody>
            {distinctionRows.map((r) => (
              <tr key={r.label}>
                <td className="border border-black px-2 py-0.5">{r.label}</td>
                <td className="border border-black w-12 text-center font-bold py-0.5">
                  {r.checked ? 'X' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Footer: Observations Box (left) + Chef d'Établissement / Round Blue Stamp (right) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 mt-5 items-start">
        <div className="sm:col-span-7">
          <p className="font-bold text-[12px] mb-1">Observations du conseil des professeurs</p>
          {canEditAppreciation ? (
            <div className="border border-black p-2 space-y-2">
              <textarea
                rows={3}
                value={editAppreciation}
                onChange={(e) => onChangeAppreciation?.(e.target.value)}
                placeholder="Appréciation générale du conseil des professeurs..."
                className="w-full text-[12px] font-serif bg-white text-black border border-slate-300 p-1.5 focus:outline-none focus:border-black"
              />
              <div className="flex justify-end no-print">
                <button
                  type="button"
                  onClick={onSaveAppreciation}
                  className="px-3 py-1 bg-black text-white text-[11px] font-sans font-medium"
                >
                  Enregistrer l&apos;observation
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-black min-h-[82px] p-2.5 text-[12px] leading-relaxed">
              {showApprec ? bulletin.appreciation_generale || '—' : '—'}
            </div>
          )}
        </div>

        <div className="sm:col-span-5 flex flex-col items-center text-center">
          <p className="font-bold text-[12px] mb-1">Le Chef d&apos;Établissement</p>

          {bulletin.cachet_appose ? (
            stampUrl ? (
              <div className="flex flex-col items-center">
                <img src={stampUrl} alt="Cachet officiel" className="w-28 h-28 object-contain" />
                {bulletin.proviseur_nom && (
                  <p className="text-[10px] font-semibold mt-0.5">{bulletin.proviseur_nom}</p>
                )}
              </div>
            ) : (
              <div className="relative flex flex-col items-center">
                <svg
                  viewBox="0 0 160 160"
                  className="w-32 h-32 text-blue-700 select-none"
                  aria-label="Cachet officiel du Lycée Prosper Kamara"
                >
                  <defs>
                    <path
                      id={`${stampId}-top`}
                      d="M 24,80 A 56,56 0 1,1 136,80"
                    />
                    <path
                      id={`${stampId}-bot`}
                      d="M 24,86 A 56,56 0 0,0 136,86"
                    />
                  </defs>
                  <circle
                    cx="80"
                    cy="80"
                    r="72"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    opacity="0.85"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    opacity="0.75"
                  />
                  <text
                    fill="currentColor"
                    fontSize="10.5"
                    fontWeight="bold"
                    letterSpacing="1.2"
                  >
                    <textPath href={`#${stampId}-top`} startOffset="50%" textAnchor="middle">
                      {(settings?.nom_etablissement || 'LYCÉE PROSPER KAMARA').toUpperCase().slice(0, 26)}
                    </textPath>
                  </text>
                  <text
                    fill="currentColor"
                    fontSize="9.5"
                    fontWeight="bold"
                    letterSpacing="1.2"
                  >
                    <textPath href={`#${stampId}-bot`} startOffset="50%" textAnchor="middle">
                      DIRECTION GÉNÉRALE
                    </textPath>
                  </text>
                  <text
                    x="80"
                    y="73"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    Le Proviseur
                  </text>
                  <text
                    x="80"
                    y="90"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                    fontStyle="italic"
                  >
                    Visa officiel
                  </text>
                  {/* Handwritten ink signature flourish */}
                  <path
                    d="M 56 104 Q 68 94 76 105 T 104 98"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-[9.5px] font-sans text-blue-800 -mt-1 space-y-0.5">
                  {bulletin.proviseur_nom && <p className="font-semibold">{bulletin.proviseur_nom}</p>}
                  {bulletin.signature_proviseur_hash && (
                    <p className="font-mono text-[8.5px]">Réf : {bulletin.signature_proviseur_hash}</p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="mt-3 w-36 h-24 border border-dashed border-slate-400 rounded-full flex items-center justify-center px-3 text-[10px] font-sans text-slate-500">
              Cachet et signature en attente
            </div>
          )}
        </div>
      </div>

      {/* Compact circuit trace footer */}
      <div className="mt-4 pt-2 border-t border-slate-300 flex flex-wrap justify-between gap-2 text-[10px] font-sans text-slate-600">
        <span>Secrétariat : {bulletin.prepare_nom || '—'}</span>
        <span>Censeur : {bulletin.censeur_nom ? `Vérifié (${bulletin.censeur_nom})` : 'En attente'}</span>
        <span>Proviseur : {bulletin.proviseur_nom ? `Signé (${bulletin.proviseur_nom})` : 'En attente'}</span>
      </div>
    </div>
  );
};
