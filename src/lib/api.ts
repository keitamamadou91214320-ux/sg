import { jsPDF } from 'jspdf';
import type { Bulletin, BulletinSubjectLine, PaymentRecord, SchoolSettings } from '../types.ts';
import { handleStaticDemoRequest } from './staticDemoFallback.ts';

let memoryToken: string | null = null;
let staticDemoActive = false;

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  if (!staticDemoActive && typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    staticDemoActive = true;
  }
  if (staticDemoActive) {
    return handleStaticDemoRequest<T>(url, options);
  }

  const headers = new Headers(options.headers || {});
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      staticDemoActive = true;
      return handleStaticDemoRequest<T>(url, options);
    }
    throw networkErr;
  }

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    if (!contentType.includes('application/json') && (url.startsWith('/api/auth/status') || (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')))) {
      staticDemoActive = true;
      return handleStaticDemoRequest<T>(url, options);
    }
    if (contentType.includes('application/json')) {
      const errBody = (await res.json()) as { error?: string; statut?: string; motif_refus?: string; demande_reexamen?: string };
      const err = new Error(errBody.error || `Erreur HTTP ${res.status}`) as Error & {
        statut?: string;
        motif_refus?: string;
        demande_reexamen?: string;
      };
      err.statut = errBody.statut;
      err.motif_refus = errBody.motif_refus;
      err.demande_reexamen = errBody.demande_reexamen;
      throw err;
    }
    throw new Error(`Erreur serveur (${res.status}).`);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  if (url.startsWith('/api/auth/status')) {
    staticDemoActive = true;
    return handleStaticDemoRequest<T>(url, options);
  }
  return (await res.blob()) as unknown as T;
}

export async function downloadProtectedFile(relPath: string, fileName: string): Promise<void> {
  const clean = relPath.replace(/^\/+/, '');
  const blob = await apiFetch<Blob>(`/api/files/${clean}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchProtectedImageDataUrl(relPath: string | null | undefined): Promise<string | null> {
  if (!relPath) return null;
  try {
    const clean = relPath.replace(/^\/+/, '');
    const blob = await apiFetch<Blob>(`/api/files/${clean}`);
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function fmtFrPdf(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  return Number(val.toFixed(2)).toString().replace('.', ',');
}

function fmtFrFixedPdf(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(2).replace('.', ',');
}

function formatBirthDatePdf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return iso;
}

export async function generateBulletinPdf(bulletin: Bulletin, settings: SchoolSettings | null): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 14;
  const right = 196;
  const width = right - left; // 182mm

  const [logoDataUrl, photoDataUrl, stampUrl] = await Promise.all([
    fetchProtectedImageDataUrl(settings?.logo_path),
    fetchProtectedImageDataUrl(bulletin.eleve_photo),
    bulletin.cachet_appose ? fetchProtectedImageDataUrl(settings?.cachet_path) : Promise.resolve(null),
  ]);

  // Top Header (2 columns)
  let headerTextX = left;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', left, 12, 14, 14);
      headerTextX = left + 17;
    } catch {
      // ignore invalid image
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text("MINISTÈRE DE L'ÉDUCATION NATIONALE", headerTextX, 15);
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text((settings?.nom_etablissement || 'Lycée Prosper Kamara').toUpperCase(), headerTextX, 20);
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  const subLine = [settings?.adresse, settings?.telephone ? `Tél : ${settings.telephone}` : ''].filter(Boolean).join(' · ');
  if (subLine) {
    doc.text(subLine.slice(0, 58), headerTextX, 24.5);
  }

  const rightTextX = photoDataUrl ? right - 20 : right;
  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, 'JPEG', right - 17, 11, 17, 20);
      doc.setDrawColor(0, 0, 0);
      doc.rect(right - 17, 11, 17, 20);
    } catch {
      // ignore invalid photo
    }
  }
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Année Scolaire : ${bulletin.annee_libelle || '—'}`, rightTextX, 16, { align: 'right' });
  doc.setFont('times', 'bold');
  doc.text(bulletin.periode_nom || '—', rightTextX, 21.5, { align: 'right' });

  // Double-rule Title Banner
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(left, 33, right, 33);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('BULLETIN DE NOTES', 105, 39, { align: 'center' });
  doc.line(left, 41.5, right, 41.5);
  doc.setLineWidth(0.25);

  // Student Identity Block (2 columns)
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text('Prénoms :', left, 48);
  doc.setFont('times', 'bold');
  doc.text(bulletin.eleve_prenom || '—', left + 22, 48);

  doc.setFont('times', 'normal');
  doc.text('Né (e) le :', left, 53.5);
  doc.setFont('times', 'bold');
  doc.text(formatBirthDatePdf(bulletin.eleve_date_naissance), left + 22, 53.5);
  doc.setFont('times', 'normal');
  doc.text('à :', left + 50, 53.5);
  doc.setFont('times', 'bold');
  doc.text((bulletin.eleve_lieu_naissance || '—').toUpperCase(), left + 56, 53.5);

  doc.setFont('times', 'normal');
  doc.text('Matricule :', left, 59);
  doc.setFont('times', 'bold');
  doc.text(bulletin.eleve_matricule || '—', left + 22, 59);

  const col2X = 112;
  doc.setFont('times', 'normal');
  doc.text('Nom :', col2X, 48);
  doc.setFont('times', 'bold');
  doc.text((bulletin.eleve_nom || '—').toUpperCase(), col2X + 26, 48);

  doc.setFont('times', 'normal');
  doc.text('Classe :', col2X, 53.5);
  doc.setFont('times', 'bold');
  doc.text(bulletin.classe_nom || '—', col2X + 26, 53.5);

  doc.setFont('times', 'normal');
  doc.text("Nbre d'élèves :", col2X, 59);
  doc.setFont('times', 'bold');
  doc.text(String(bulletin.effectif_classe), col2X + 26, 59);
  doc.setFont('times', 'normal');
  doc.text('Classe Redoublée :', col2X + 42, 59);
  doc.setFont('times', 'bold');
  doc.text('0', col2X + 74, 59);

  // 9-Column Grades Table (total width = 182mm)
  // [DISCIPLINES: 46, Devoir: 14, Comp: 14, Moy/20: 15, Coef: 11, Moy x: 16, T.H: 10, Rang: 11, Appréciations: 45]
  const colWidths = [46, 14, 14, 15, 11, 16, 10, 11, 45];
  const headers = ['DISCIPLINES', 'Devoir', 'Comp', 'Moy/20', 'Coef', 'Moy x', 'T.H', 'Rang', 'Appréciations'];
  let y = 64;
  const rowH = 6.8;

  const drawRowCells = (yPos: number, h: number, values: string[], opts?: { boldAll?: boolean; fillHeader?: boolean }) => {
    let x = left;
    for (let i = 0; i < colWidths.length; i++) {
      const w = colWidths[i];
      if (opts?.fillHeader) {
        doc.setFillColor(242, 242, 242);
        doc.rect(x, yPos, w, h, 'FD');
      } else {
        doc.rect(x, yPos, w, h);
      }
      const isLeft = i === 0;
      doc.setFont('times', opts?.boldAll || i === 0 ? 'bold' : 'normal');
      doc.setFontSize(opts?.fillHeader ? 8.5 : 8.5);
      const txt = values[i] || '';
      if (isLeft) {
        doc.text(txt.slice(0, 24), x + 1.8, yPos + h * 0.68);
      } else {
        doc.text(txt.slice(0, 24), x + w / 2, yPos + h * 0.68, { align: 'center' });
      }
      x += w;
    }
  };

  drawRowCells(y, 7.5, headers, { boldAll: true, fillHeader: true });
  y += 7.5;

  let lines: BulletinSubjectLine[] = [];
  try {
    lines = JSON.parse(bulletin.lignes_json || '[]') as BulletinSubjectLine[];
  } catch {
    lines = [];
  }

  const showRank = settings?.afficher_rang_bulletin !== 0;
  const showClassAvg = settings?.afficher_moyenne_classe !== 0;
  const showApprec = settings?.afficher_appreciation_bulletin !== 0;

  let totalCoef = 0;
  let totalWeighted = 0;

  for (const line of lines) {
    if (y > 235) {
      doc.addPage();
      y = 18;
    }
    if (line.moyenne_sur_20 !== null) totalCoef += line.coefficient;
    if (line.note_ponderee !== null) totalWeighted += line.note_ponderee;

    const thVal = line.th ?? (line.moyenne_sur_20 !== null && line.moyenne_sur_20 >= 12 ? 'TH' : '');
    drawRowCells(y, rowH, [
      line.matiere_nom.toUpperCase(),
      fmtFrPdf(line.devoir_moy),
      fmtFrPdf(line.comp_note),
      fmtFrPdf(line.moyenne_sur_20),
      String(line.coefficient),
      fmtFrPdf(line.note_ponderee),
      thVal,
      line.rang_matiere !== null && line.rang_matiere !== undefined ? String(line.rang_matiere) : '-',
      showApprec ? String(line.appreciation || '—') : '—',
    ]);
    y += rowH;
  }

  // TOTAL Row
  const wTotalLabel = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]; // 89
  const wCoef = colWidths[4]; // 11
  const wMoyX = colWidths[5]; // 16
  const wRest = colWidths[6] + colWidths[7] + colWidths[8]; // 66
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.rect(left, y, wTotalLabel, 7.2);
  doc.text('TOTAL', left + 2, y + 5);
  doc.rect(left + wTotalLabel, y, wCoef, 7.2);
  doc.text(String(totalCoef), left + wTotalLabel + wCoef / 2, y + 5, { align: 'center' });
  doc.rect(left + wTotalLabel + wCoef, y, wMoyX, 7.2);
  doc.text(fmtFrFixedPdf(totalWeighted), left + wTotalLabel + wCoef + wMoyX / 2, y + 5, { align: 'center' });
  doc.rect(left + wTotalLabel + wCoef + wMoyX, y, wRest, 7.2);
  y += 7.2;

  // Bottom Summary Bar (Moyenne | XX,XX /20 | Rang | X | Retards | X | Absences | X)
  const moy = bulletin.moyenne_generale;
  const barCols = [
    { label: 'Moyenne', w: 24, bold: true, center: false },
    { label: moy !== null ? `${fmtFrFixedPdf(moy)} /20` : '—', w: 28, bold: true, center: true },
    { label: 'Rang', w: 18, bold: false, center: false },
    { label: showRank ? (bulletin.rang !== null ? String(bulletin.rang) : '—') : 'Masqué', w: 18, bold: true, center: true },
    { label: 'Retards', w: 24, bold: false, center: false },
    { label: String(bulletin.retards_count ?? 0), w: 22, bold: true, center: true },
    { label: 'Absences', w: 26, bold: false, center: false },
    { label: String(bulletin.absences_count ?? 0), w: 22, bold: true, center: true },
  ];
  let bx = left;
  for (const c of barCols) {
    doc.rect(bx, y, c.w, 7.5);
    doc.setFont('times', c.bold ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    if (c.center) {
      doc.text(c.label, bx + c.w / 2, y + 5.2, { align: 'center' });
    } else {
      doc.text(c.label, bx + 2, y + 5.2);
    }
    bx += c.w;
  }
  y += 7.5;

  if (showClassAvg) {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(
      `Moyenne de classe : ${fmtFrFixedPdf(bulletin.moyenne_classe)} /20  ·  Meilleure : ${fmtFrFixedPdf(bulletin.meilleure_moyenne)}  ·  Plus faible : ${fmtFrFixedPdf(bulletin.plus_faible_moyenne)}`,
      right,
      y + 4.5,
      { align: 'right' }
    );
    doc.setTextColor(0, 0, 0);
    y += 6;
  } else {
    y += 4;
  }

  // Side-by-side Decision & Distinction Tables
  const tb = settings?.mention_tres_bien ?? 16;
  const bien = settings?.mention_bien ?? 14;
  const ab = settings?.mention_assez_bien ?? 12;
  const pass = settings?.mention_passable ?? 10;

  const leftBoxRows = [
    { label: 'Satisfaisant doit continuer', checked: moy !== null && moy >= ab },
    { label: 'Peut Mieux Faire', checked: moy !== null && moy >= pass && moy < ab },
    { label: 'Insuffisant', checked: moy !== null && moy >= 8 && moy < pass },
    { label: 'Risque de Redoubler', checked: moy !== null && moy >= 6 && moy < 8 },
    { label: "Risque l'exclusion", checked: moy !== null && moy < 6 },
  ];
  const rightBoxRows = [
    { label: 'Félicitations', checked: moy !== null && moy >= tb },
    { label: 'Encouragement', checked: moy !== null && moy >= bien && moy < tb },
    { label: "Tableau d'honneur", checked: moy !== null && moy >= ab },
    { label: 'Avertissement', checked: moy !== null && moy < 8 },
    { label: 'Blâme', checked: moy !== null && moy < 6 },
  ];

  const boxRowH = 5.5;
  const boxStartY = y + 2;
  for (let i = 0; i < 5; i++) {
    const ry = boxStartY + i * boxRowH;
    // Left table (x=left, widths 64 + 12)
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.rect(left, ry, 64, boxRowH);
    doc.text(leftBoxRows[i].label, left + 1.8, ry + 3.9);
    doc.rect(left + 64, ry, 12, boxRowH);
    if (leftBoxRows[i].checked) {
      doc.setFont('times', 'bold');
      doc.text('X', left + 70, ry + 3.9, { align: 'center' });
    }

    // Right table (x=120, widths 64 + 12)
    doc.setFont('times', 'normal');
    doc.rect(120, ry, 64, boxRowH);
    doc.text(rightBoxRows[i].label, 121.8, ry + 3.9);
    doc.rect(184, ry, 12, boxRowH);
    if (rightBoxRows[i].checked) {
      doc.setFont('times', 'bold');
      doc.text('X', 190, ry + 3.9, { align: 'center' });
    }
  }

  y = boxStartY + 5 * boxRowH + 8;

  // Footer: Observations Box (left) + Chef d'Établissement / Round Blue Stamp (right)
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.text('Observations du conseil des professeurs', left, y);
  doc.text("Le Chef d'Établissement", 162, y, { align: 'center' });

  doc.rect(left, y + 2.5, 96, 26);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  if (showApprec && bulletin.appreciation_generale) {
    const obsLines = doc.splitTextToSize(bulletin.appreciation_generale, 90);
    doc.text(obsLines.slice(0, 4), left + 3, y + 8);
  }

  if (bulletin.cachet_appose) {
    if (stampUrl) {
      try {
        doc.addImage(stampUrl, 'PNG', 148, y + 3, 28, 28);
      } catch {
        // fallback below
      }
    } else {
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.5);
      doc.circle(162, y + 17, 13.5);
      doc.setLineWidth(0.25);
      doc.circle(162, y + 17, 9);
      doc.setTextColor(29, 78, 216);
      doc.setFont('times', 'bold');
      doc.setFontSize(6.5);
      doc.text((settings?.nom_etablissement || 'LYCÉE PROSPER KAMARA').toUpperCase().slice(0, 22), 162, y + 6.8, {
        align: 'center',
      });
      doc.setFontSize(8.5);
      doc.text('Le Proviseur', 162, y + 16.5, { align: 'center' });
      doc.setFont('times', 'italic');
      doc.setFontSize(6.5);
      doc.text('Visa officiel', 162, y + 20.5, { align: 'center' });
      doc.setFont('times', 'normal');
      doc.setFontSize(6);
      doc.text('DIRECTION GÉNÉRALE', 162, y + 28.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }

    if (bulletin.proviseur_nom) {
      doc.setFont('times', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(29, 78, 216);
      doc.text(bulletin.proviseur_nom, 162, y + 33.5, { align: 'center' });
    }
    if (bulletin.signature_proviseur_hash) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.text(`Réf : ${bulletin.signature_proviseur_hash}`, 162, y + 37, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
  } else {
    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('En attente de signature', 162, y + 16, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // Subtle circuit trace line at very bottom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Secrétariat : ${bulletin.prepare_nom || '—'}   ·   Censeur : ${bulletin.censeur_nom || 'En attente'}   ·   Proviseur : ${bulletin.proviseur_nom || 'En attente'}`,
    left,
    284
  );
  doc.text(`v${bulletin.version} · ${width}mm`, right, 284, { align: 'right' });

  doc.save(`bulletin_${bulletin.eleve_matricule || bulletin.id}_${bulletin.periode_nom || 'periode'}.pdf`);
}

export function generateReceiptPdf(payment: PaymentRecord, settings: SchoolSettings | null): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(settings?.nom_etablissement || 'LYCÉE PROSPER KAMARA', 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('REÇU OFFICIEL DE PAIEMENT DE SCOLARITÉ', 14, 16);
  doc.text(`N° ${payment.numero_recu}`, 196, 13, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Élève : ${payment.eleve_nom || '—'}`, 14, 34);
  doc.text(`Matricule : ${payment.eleve_matricule || '—'}`, 14, 42);
  doc.text(`Classe : ${payment.classe_nom || '—'}`, 14, 50);
  doc.text(`Objet du paiement : ${payment.frais_libelle || '—'}`, 14, 58);
  doc.text(`Mode de règlement : ${payment.mode_paiement}`, 14, 66);
  doc.text(`Date de paiement : ${payment.date_paiement}`, 14, 74);

  doc.setFillColor(241, 245, 249);
  doc.rect(14, 84, 182, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Montant encaissé : ${Number(payment.montant_paye).toLocaleString('fr-FR')} FCFA`, 20, 94);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Enregistré par : ${payment.enregistre_nom || 'Comptabilité'}`, 14, 114);
  doc.text('Signature & Cachet Comptabilité', 196, 114, { align: 'right' });

  doc.save(`recu_${payment.numero_recu}.pdf`);
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escape = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

