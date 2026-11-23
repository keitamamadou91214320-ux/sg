import { db } from './db.ts';
import type { BulletinSubjectLine, GradeEntryStatus, MissingGradeRule } from '../src/types.ts';

interface ClassSubjectRow {
  matiere_id: number;
  matiere_nom: string;
  coefficient: number;
}

interface EvaluationRow {
  id: number;
  matiere_id: number;
  type: string;
  bareme_max: number;
  regle_notes_manquantes: MissingGradeRule;
  titre: string;
}

interface GradeRow {
  evaluation_id: number;
  eleve_id: number;
  valeur: number | null;
  statut_note: GradeEntryStatus;
  appreciation: string | null;
}

export interface ComputedStudentBulletin {
  eleve_id: number;
  lignes: BulletinSubjectLine[];
  moyenne_generale: number | null;
  rang: number | null;
}

export function computePeriodResultsForClass(
  classeId: number,
  periodeId: number
): {
  students: ComputedStudentBulletin[];
  moyenne_classe: number | null;
  meilleure_moyenne: number | null;
  plus_faible_moyenne: number | null;
  effectif_classe: number;
} {
  const students = db
    .prepare(
      `SELECT id FROM students WHERE classe_id = ? AND est_archive = 0 AND statut_administratif != 'transfere' ORDER BY nom, prenom`
    )
    .all(classeId) as { id: number }[];

  const classSubjects = db
    .prepare(
      `SELECT cs.matiere_id, s.nom AS matiere_nom, cs.coefficient
       FROM class_subjects cs
       JOIN subjects s ON s.id = cs.matiere_id
       WHERE cs.classe_id = ?
       ORDER BY s.nom`
    )
    .all(classeId) as ClassSubjectRow[];

  const evaluations = db
    .prepare(
      `SELECT id, matiere_id, type, bareme_max, regle_notes_manquantes, titre
       FROM evaluations
       WHERE classe_id = ? AND periode_id = ?`
    )
    .all(classeId, periodeId) as EvaluationRow[];

  // Only include grades from accepted transmissions or official grades (est_provisoire = 0)
  const evalIds = evaluations.map((e) => e.id);
  let grades: GradeRow[] = [];
  if (evalIds.length > 0) {
    const placeholders = evalIds.map(() => '?').join(',');
    grades = db
      .prepare(
        `SELECT g.evaluation_id, g.eleve_id, g.valeur, g.statut_note, g.appreciation
         FROM grades g
         WHERE g.evaluation_id IN (${placeholders}) AND g.est_provisoire = 0`
      )
      .all(...evalIds) as GradeRow[];
  }

  const gradeMap = new Map<string, GradeRow>();
  for (const g of grades) {
    gradeMap.set(`${g.evaluation_id}:${g.eleve_id}`, g);
  }

  // Compute minimum normalized score per evaluation if rule === 'minimum'
  const evalMinMap = new Map<number, number>();
  for (const ev of evaluations) {
    const scores = grades
      .filter((g) => g.evaluation_id === ev.id && g.statut_note === 'note' && g.valeur !== null)
      .map((g) => ((g.valeur as number) / ev.bareme_max) * 20);
    evalMinMap.set(ev.id, scores.length > 0 ? Math.min(...scores) : 0);
  }

  const results: ComputedStudentBulletin[] = students.map((st) => {
    const lignes: BulletinSubjectLine[] = [];
    let totalWeighted = 0;
    let totalCoeff = 0;

    for (const cs of classSubjects) {
      const subEvals = evaluations.filter((e) => e.matiere_id === cs.matiere_id);
      const normalizedValues: number[] = [];
      const devoirValues: number[] = [];
      const compValues: number[] = [];
      const baremeParts: string[] = [];
      const appreciations: string[] = [];

      const pushNormalizedScore = (ev: EvaluationRow, on20: number) => {
        normalizedValues.push(on20);
        if (ev.type === 'composition' || ev.type === 'examen') {
          compValues.push(on20);
        } else {
          devoirValues.push(on20);
        }
      };

      for (const ev of subEvals) {
        const g = gradeMap.get(`${ev.id}:${st.id}`);
        if (!g) {
          // Missing grade treated according to Proviseur rule on evaluation
          if (ev.regle_notes_manquantes === 'zero') {
            pushNormalizedScore(ev, 0);
            baremeParts.push(`0/${ev.bareme_max} (manquant)`);
          } else if (ev.regle_notes_manquantes === 'minimum') {
            const minVal = evalMinMap.get(ev.id) ?? 0;
            pushNormalizedScore(ev, minVal);
            baremeParts.push(`min/${ev.bareme_max}`);
          } else {
            baremeParts.push(`—/${ev.bareme_max}`);
          }
          continue;
        }

        if (g.appreciation) {
          appreciations.push(g.appreciation);
        }

        if (g.statut_note === 'note' && g.valeur !== null) {
          const on20 = (g.valeur / ev.bareme_max) * 20;
          pushNormalizedScore(ev, on20);
          baremeParts.push(`${Number(g.valeur.toFixed(2))}/${ev.bareme_max}`);
        } else if (g.statut_note === 'dispense' || g.statut_note === 'absent_justifie') {
          // Neutralized unless rule explicitly forces zero for absent_non_justifie
          baremeParts.push(g.statut_note === 'dispense' ? 'Dispensé' : 'Abs. just.');
        } else if (g.statut_note === 'absent_non_justifie') {
          if (ev.regle_notes_manquantes === 'zero') {
            pushNormalizedScore(ev, 0);
            baremeParts.push(`0/${ev.bareme_max} (abs. non just.)`);
          } else if (ev.regle_notes_manquantes === 'minimum') {
            pushNormalizedScore(ev, evalMinMap.get(ev.id) ?? 0);
            baremeParts.push(`min/${ev.bareme_max}`);
          } else {
            baremeParts.push('Abs. non just.');
          }
        } else {
          // en_attente
          baremeParts.push('En attente');
        }
      }

      const devoirMoy =
        devoirValues.length > 0
          ? Number((devoirValues.reduce((a, b) => a + b, 0) / devoirValues.length).toFixed(2))
          : null;
      const compNote =
        compValues.length > 0
          ? Number((compValues.reduce((a, b) => a + b, 0) / compValues.length).toFixed(2))
          : null;

      // Keep consistent average: if both Devoir & Comp exist, average all normalized evals (or keep exact normalized mean)
      const subjectAvg =
        normalizedValues.length > 0
          ? Number((normalizedValues.reduce((a, b) => a + b, 0) / normalizedValues.length).toFixed(2))
          : null;

      const notePonderee = subjectAvg !== null ? Number((subjectAvg * cs.coefficient).toFixed(2)) : null;

      if (subjectAvg !== null) {
        totalWeighted += subjectAvg * cs.coefficient;
        totalCoeff += cs.coefficient;
      }

      lignes.push({
        matiere_id: cs.matiere_id,
        matiere_nom: cs.matiere_nom,
        coefficient: cs.coefficient,
        devoir_moy: devoirMoy,
        comp_note: compNote,
        moyenne_sur_20: subjectAvg,
        note_ponderee: notePonderee,
        th: subjectAvg !== null && subjectAvg >= 12 ? 'TH' : '',
        rang_matiere: null,
        bareme_detail: baremeParts.join(' · ') || 'Aucune évaluation',
        appreciation: appreciations[0] || autoAppreciation(subjectAvg),
      });
    }

    const moyenne_generale = totalCoeff > 0 ? Number((totalWeighted / totalCoeff).toFixed(2)) : null;

    return {
      eleve_id: st.id,
      lignes,
      moyenne_generale,
      rang: null,
    };
  });

  // Compute per-subject rank across class
  for (const cs of classSubjects) {
    const subScores = results
      .map((r) => r.lignes.find((l) => l.matiere_id === cs.matiere_id)?.moyenne_sur_20 ?? null)
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a);
    for (const r of results) {
      const line = r.lignes.find((l) => l.matiere_id === cs.matiere_id);
      if (line && line.moyenne_sur_20 !== null) {
        line.rang_matiere = subScores.indexOf(line.moyenne_sur_20) + 1;
      }
    }
  }

  // Compute ranks & class summary from real averages
  const validAvgs = results
    .filter((r) => r.moyenne_generale !== null)
    .map((r) => r.moyenne_generale as number)
    .sort((a, b) => b - a);

  const moyenne_classe =
    validAvgs.length > 0
      ? Number((validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length).toFixed(2))
      : null;
  const meilleure_moyenne = validAvgs.length > 0 ? validAvgs[0] : null;
  const plus_faible_moyenne = validAvgs.length > 0 ? validAvgs[validAvgs.length - 1] : null;

  for (const r of results) {
    if (r.moyenne_generale !== null) {
      r.rang = validAvgs.indexOf(r.moyenne_generale) + 1;
    }
  }

  return {
    students: results,
    moyenne_classe,
    meilleure_moyenne,
    plus_faible_moyenne,
    effectif_classe: students.length,
  };
}

export function autoAppreciation(avg: number | null): string {
  if (avg === null) return 'Non évalué';
  if (avg >= 18) return 'Excellent travail';
  if (avg >= 16) return 'Très Bon Travail';
  if (avg >= 14) return 'Bon Travail';
  if (avg >= 12) return 'Assez bien';
  if (avg >= 10) return 'Passable';
  if (avg >= 8) return 'Insuffisant';
  return 'Faible';
}
