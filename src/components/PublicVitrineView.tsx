import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  Mail,
  MapPin,
  Menu,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import heroCampusImg from '../assets/images/hero_lycee_campus_1795428353568.jpg';
import labSciencesImg from '../assets/images/lab_sciences_lycee_1795428353625.jpg';
import biblioEtudeImg from '../assets/images/biblio_etude_lycee_1795428353754.jpg';
import { apiFetch } from '../lib/api.ts';
import type { SchoolSettings } from '../types.ts';

interface PublicShowcaseResponse {
  settings: Partial<SchoolSettings> | null;
  activeYear: { libelle: string; date_debut: string; date_fin: string } | null;
  classes: { id: number; nom: string; niveau: string; serie: string | null }[];
  subjects: { code: string; nom: string }[];
  announcements: { id: number; titre: string; contenu: string; priorite: string; created_at: string }[];
  calendarEvents: {
    id: number;
    titre: string;
    categorie: string;
    date_debut: string;
    date_fin: string;
    description: string | null;
  }[];
  stats: {
    classesCount: number;
    subjectsCount: number;
    studentsCount: number;
  };
}

interface PublicVitrineViewProps {
  schoolName: string;
  schoolMotto: string;
  publicSettings: Partial<SchoolSettings> | null;
  darkMode: boolean;
  onToggleDark: () => void;
  onOpenPortal: (tab: 'login' | 'register' | 'forgot') => void;
}

interface FiliereTrack {
  id: 'toutes' | 'S1' | 'L2' | 'A';
  label: string;
  classeTitle: string;
  levelLabel: string;
  objective: string;
  hoursPerWeek: string;
  dominantSubjects: { name: string; coef: string }[];
  outcomes: string;
}

const FILIERE_TRACKS: FiliereTrack[] = [
  {
    id: 'S1',
    label: 'Terminale S1 · Sciences',
    classeTitle: 'Série Scientifique (Mathématiques & Physique)',
    levelLabel: 'Cycle Terminal · Baccalauréat S1',
    objective:
      'Préparation rigoureuse aux études supérieures d’ingénierie, de médecine, de mathématiques appliquées et de recherche scientifique par la pratique expérimentale.',
    hoursPerWeek: '32 h / semaine',
    dominantSubjects: [
      { name: 'Mathématiques', coef: 'Coef. 5' },
      { name: 'Physique-Chimie', coef: 'Coef. 5' },
      { name: 'Sciences de la Vie et de la Terre', coef: 'Coef. 4' },
      { name: 'Français & Philosophie', coef: 'Coef. 3 · 2' },
    ],
    outcomes: 'Classes préparatoires, facultés de médecine, écoles polytechniques et filières numériques.',
  },
  {
    id: 'L2',
    label: 'Première L2 · Lettres & Sciences Humaines',
    classeTitle: 'Série Littéraire & Humanités Classiques',
    levelLabel: 'Cycle Première · Baccalauréat L2',
    objective:
      'Maîtrise approfondie de l’expression écrite, de l’argumentation philosophique, de l’analyse historique et des langues vivantes pour les carrières juridiques et diplomatiques.',
    hoursPerWeek: '30 h / semaine',
    dominantSubjects: [
      { name: 'Français & Littérature', coef: 'Coef. 4' },
      { name: 'Philosophie', coef: 'Coef. 4' },
      { name: 'Histoire-Géographie', coef: 'Coef. 4' },
      { name: 'Langues Vivantes (Anglais)', coef: 'Coef. 3' },
    ],
    outcomes: 'Facultés de droit, sciences politiques, journalisme, enseignement supérieur et administration publique.',
  },
  {
    id: 'A',
    label: 'Seconde A · Tronc Commun',
    classeTitle: 'Cycle de Détermination & Méthodologie',
    levelLabel: 'Entrée au Lycée · Orientation progressive',
    objective:
      'Consolidation des savoirs fondamentaux en français, mathématiques, sciences expérimentales et informatique afin d’accompagner chaque élève vers son choix de série.',
    hoursPerWeek: '29 h / semaine',
    dominantSubjects: [
      { name: 'Mathématiques', coef: 'Coef. 3' },
      { name: 'Français', coef: 'Coef. 3' },
      { name: 'Physique-Chimie & SVT', coef: 'Coef. 2 · 2' },
      { name: 'Informatique & Méthodologie', coef: 'Coef. 2' },
    ],
    outcomes: 'Orientation accompagnée vers les séries S1, L2 ou filières technologiques à l’issue du conseil de classe.',
  },
];

function formatPublicDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const PublicVitrineView: React.FC<PublicVitrineViewProps> = ({
  schoolName,
  schoolMotto,
  publicSettings,
  darkMode,
  onToggleDark,
  onOpenPortal,
}) => {
  const [showcase, setShowcase] = useState<PublicShowcaseResponse | null>(null);
  const [activeTrack, setActiveTrack] = useState<'toutes' | 'S1' | 'L2' | 'A'>('toutes');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Public contact / information form state
  const [contactNom, setContactNom] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [contactProfil, setContactProfil] = useState<'parent' | 'eleve' | 'visiteur'>('parent');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<PublicShowcaseResponse>('/api/public/showcase')
      .then((res) => {
        if (active) setShowcase(res);
      })
      .catch(() => {
        // Fallback smoothly to props
      });
    return () => {
      active = false;
    };
  }, []);

  const effectiveSettings = showcase?.settings || publicSettings;
  const displaySchoolName = effectiveSettings?.nom_etablissement || schoolName || 'LYCÉE PROSPER KAMARA';
  const displayMotto = effectiveSettings?.devise || schoolMotto || 'Excellence · Discipline · Réussite';
  const displayAddress = effectiveSettings?.adresse || 'Avenue Prosper Kamara, Quartier Administratif, Bamako';
  const displayPhone = effectiveSettings?.telephone || '+223 20 22 45 80';
  const displayEmail = effectiveSettings?.email || 'direction@lycee-prosper-kamara.edu';
  const displayYear = showcase?.activeYear?.libelle || '2026-2027';
  const allowAutoRegister = effectiveSettings?.autoriser_auto_inscription !== 0;

  const visibleTracks = useMemo(() => {
    if (activeTrack === 'toutes') return FILIERE_TRACKS;
    return FILIERE_TRACKS.filter((t) => t.id === activeTrack);
  }, [activeTrack]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactFeedback(null);
    setContactSending(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          nom: contactNom,
          contact: contactInfo,
          profil: contactProfil,
          message: contactMessage,
        }),
      });
      setContactFeedback({ type: 'ok', text: res.message });
      setContactNom('');
      setContactInfo('');
      setContactMessage('');
    } catch (err) {
      setContactFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: EXACT 3 horizontal zones separated cleanly */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 dark:border-slate-800 bg-[#FAF9F6]/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark ONLY */}
          <a
            href="#accueil"
            className="font-editorial font-semibold text-xl sm:text-2xl tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
          >
            {displaySchoolName}
          </a>

          {/* Zone 2: Clean single-line text nav links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#presentation" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors">
              Présentation
            </a>
            <a href="#filieres" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors">
              Filières
            </a>
            <a href="#infrastructures" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors">
              Cadre d’étude
            </a>
            <a href="#vie-scolaire" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors">
              Vie scolaire
            </a>
            <a href="#contact" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors">
              Contact
            </a>
          </nav>

          {/* Zone 3: Single Primary CTA Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenPortal('login')}
              className="px-4 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-medium whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-2"
            >
              <span>Espace Connexion</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
              aria-label="Ouvrir le menu de navigation"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile navigation drawer */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-950 px-4 py-4 space-y-2 text-sm font-medium">
            {[
              ['#presentation', 'Présentation'],
              ['#filieres', 'Filières & Séries'],
              ['#infrastructures', 'Cadre d’étude'],
              ['#vie-scolaire', 'Vie scolaire & Calendrier'],
              ['#contact', 'Contact & Renseignements'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className="block py-2 text-slate-700 dark:text-slate-200 border-b border-slate-200/70 dark:border-slate-800/70"
              >
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                onOpenPortal('register');
              }}
              className="w-full mt-2 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-left px-3"
            >
              Pré-inscription Élève / Parent →
            </button>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section id="accueil" className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A8A] dark:text-blue-400">
                Établissement Secondaire Général · Année scolaire {displayYear}
              </p>

              <h1
                className="font-editorial font-semibold text-slate-950 dark:text-white leading-[1.06] tracking-tight"
                style={{ fontSize: 'clamp(2.35rem, 4.4vw, 3.85rem)' }}
              >
                Exigence académique, rigueur scientifique et avenir préparé.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                {displaySchoolName} forme les élèves de la Seconde à la Terminale dans un environnement
                structuré, discipliné et transparent pour les familles — entre tradition pédagogique et suivi
                numérique certifié.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenPortal('login')}
                  className="px-5 py-3 rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Accéder à mon espace interactif</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {allowAutoRegister && (
                  <button
                    type="button"
                    onClick={() => onOpenPortal('register')}
                    className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    Inscription Élève / Parent
                  </button>
                )}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{displayMotto}</span>
                <span>·</span>
                <a
                  href="./vitrine/"
                  className="underline underline-offset-4 hover:text-[#1E3A8A] dark:hover:text-blue-400 transition-colors"
                >
                  Ouvrir la version HTML / CSS / JS autonome
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <figure className="space-y-2.5">
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                  <img
                    src={heroCampusImg}
                    alt={`Cour d’honneur et bâtiments principaux du ${displaySchoolName}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <figcaption className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Cour centrale & galeries d’enseignement — {displaySchoolName}</span>
                  <span className="font-mono tabular-nums">{displayYear}</span>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Grounded 4-column Institutional KPI Strip */}
          <div className="mt-14 pt-8 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white tabular-nums">
                94,2 %
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Réussite au Baccalauréat
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white tabular-nums">
                {showcase?.stats?.classesCount ?? 3} séries
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Terminale S1 · Première L2 · Seconde A
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white tabular-nums">
                {showcase?.stats?.subjectsCount ?? 8} disciplines
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sciences, Lettres & Informatique
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white tabular-nums">
                100 %
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Bulletins signés & horodatés
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 01 · PRÉSENTATION & MOT DU PROVISEUR */}
      <section id="presentation" className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] dark:text-blue-400">
                01 · Mot du Proviseur & Projet Éducatif
              </p>
              <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-slate-950 dark:text-white leading-tight">
                Une maison d’étude fondée sur le travail régulier et le mérite.
              </h2>
              {effectiveSettings?.message_accueil && (
                <p className="pt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                  {effectiveSettings.message_accueil}
                </p>
              )}
            </div>

            <div className="lg:col-span-7 space-y-6">
              <blockquote className="font-editorial italic text-xl sm:text-2xl text-slate-800 dark:text-slate-200 leading-relaxed">
                « Former l’esprit critique, transmettre la rigueur scientifique et cultiver le respect mutuel :
                telle est la promesse quotidienne de notre équipe pédagogique envers chaque élève et sa famille. »
              </blockquote>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                M. Amadou Bah — Proviseur du {displaySchoolName}
              </p>

              <div className="grid sm:grid-cols-3 gap-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 dark:text-white font-semibold text-sm">
                    <GraduationCap className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                    <span>Encadrement continu</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Devoirs surveillés hebdomadaires, compositions trimestrielles et conseils de classe individualisés.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 dark:text-white font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                    <span>Transparence certifiée</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Chaque bulletin publié sur le portail est vérifié par le secrétariat, le proviseur et le censeur.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 dark:text-white font-semibold text-sm">
                    <BookOpen className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                    <span>Dialogue familles</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Parents et élèves consultent en ligne emplois du temps, cahiers de devoirs, reçus et résultats.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 · FILIÈRES & SÉRIES (Interactive Filter Tabs) */}
      <section id="filieres" className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] dark:text-blue-400">
                02 · Filières & Programmes d’Étude
              </p>
              <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-slate-950 dark:text-white">
                Parcours du second cycle adaptés aux vocations.
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les séries">
              {(
                [
                  ['toutes', 'Toutes les séries'],
                  ['S1', 'Terminale S1'],
                  ['L2', 'Première L2'],
                  ['A', 'Seconde A'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTrack === id}
                  onClick={() => setActiveTrack(id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    activeTrack === id
                      ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`grid gap-6 ${visibleTracks.length === 1 ? 'grid-cols-1 max-w-3xl' : 'lg:grid-cols-3'}`}>
            {visibleTracks.map((track) => (
              <article
                key={track.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {track.levelLabel} · {track.hoursPerWeek}
                    </p>
                    <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      {track.label}
                    </h3>
                    <p className="text-xs font-medium text-[#1E3A8A] dark:text-blue-400">{track.classeTitle}</p>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{track.objective}</p>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Dominantes & Coefficients
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      {track.dominantSubjects.map((subj) => (
                        <li key={subj.name} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span>{subj.name}</span>
                          <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">{subj.coef}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-900 dark:text-white font-semibold">Débouchés : </strong>
                  {track.outcomes}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 03 · INFRASTRUCTURES & CADRE D'ÉTUDE */}
      <section id="infrastructures" className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] dark:text-blue-400">
              03 · Cadre d’Étude & Équipements
            </p>
            <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-slate-950 dark:text-white">
              Des espaces conçus pour la concentration et l’expérimentation.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <figure className="space-y-3">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src={labSciencesImg}
                  alt="Laboratoire de Physique-Chimie et Sciences Expérimentales"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                  <FlaskConical className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                  <span>Laboratoires de Sciences Expérimentales</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Paillasses équipées en optique, chimie analytique et biologie cellulaire pour les travaux
                  pratiques hebdomadaires des séries S1 et Seconde.
                </p>
              </figcaption>
            </figure>

            <figure className="space-y-3">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src={biblioEtudeImg}
                  alt="Bibliothèque académique et salle d’étude silencieuse"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                  <BookOpen className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                  <span>Bibliothèque & Salle d’Étude</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Fonds documentaire classique et scientifique, accès aux annales préparatoires au baccalauréat et
                  études dirigées encadrées en fin de journée.
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 04 · VIE SCOLAIRE, ACTUALITÉS & CALENDRIER PUBLIC */}
      <section id="vie-scolaire" className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] dark:text-blue-400">
                04 · Vie Scolaire & Dates Clés {displayYear}
              </p>
              <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-slate-950 dark:text-white">
                Communiqués officiels et échéances de l’établissement.
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onOpenPortal('login')}
              className="text-sm font-medium text-[#1E3A8A] dark:text-blue-400 hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Consulter mes bulletins & devoirs personnels</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Public Announcements */}
            <div className="lg:col-span-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Notes d’information publiques
              </h3>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {(showcase?.announcements && showcase.announcements.length > 0
                  ? showcase.announcements
                  : [
                      {
                        id: 1,
                        titre: 'Calendrier des conseils de classe Trimestre 1',
                        contenu:
                          'Les conseils de classe se tiendront du 7 au 12 décembre 2026 en salle des professeurs avant la remise des bulletins.',
                        priorite: 'importante',
                        created_at: '2026-11-22',
                      },
                      {
                        id: 2,
                        titre: 'Permanences d’accueil des familles',
                        contenu:
                          'Le secrétariat et la direction reçoivent les parents d’élèves du lundi au vendredi de 08h00 à 16h00.',
                        priorite: 'normale',
                        created_at: '2026-11-18',
                      },
                    ]
                ).map((ann) => (
                  <article key={ann.id} className="p-5 space-y-1.5">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatPublicDate(ann.created_at)} · Direction
                    </p>
                    <h4 className="font-display font-semibold text-sm text-slate-950 dark:text-white">
                      {ann.titre}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{ann.contenu}</p>
                  </article>
                ))}
              </div>
            </div>

            {/* Public Establishment Calendar Events */}
            <div className="lg:col-span-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Échéances officielles du trimestre
              </h3>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {(showcase?.calendarEvents && showcase.calendarEvents.length > 0
                  ? showcase.calendarEvents
                  : [
                      {
                        id: 1,
                        titre: 'Conseils de classe · Trimestre 1',
                        categorie: 'conseil_classe',
                        date_debut: '2026-12-07',
                        date_fin: '2026-12-12',
                        description: 'Bilan pédagogique de fin de premier trimestre.',
                      },
                      {
                        id: 2,
                        titre: 'Remise officielle des bulletins',
                        categorie: 'administratif',
                        date_debut: '2026-12-15',
                        date_fin: '2026-12-16',
                        description: 'Publication sur l’espace interactif et retrait au secrétariat.',
                      },
                      {
                        id: 3,
                        titre: 'Congés de Noël & Fin d’année',
                        categorie: 'vacances',
                        date_debut: '2026-12-19',
                        date_fin: '2027-01-03',
                        description: 'Reprise des cours le lundi 4 janvier 2027.',
                      },
                    ]
                ).map((ev) => (
                  <div key={ev.id} className="p-5 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-display font-semibold text-sm text-slate-950 dark:text-white">{ev.titre}</p>
                      {ev.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">{ev.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right font-mono text-xs text-[#1E3A8A] dark:text-blue-400 tabular-nums flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>
                        {formatPublicDate(ev.date_debut)}
                        {ev.date_fin && ev.date_fin !== ev.date_debut ? ` — ${formatPublicDate(ev.date_fin)}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bridge Banner: Separation between Public Site & Interactive Member Portal */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#1E3A8A] dark:text-blue-400">
                Portail Numérique Sécurisé (Partie Interactive)
              </p>
              <h3 className="font-editorial text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white">
                Vous êtes élève, parent, enseignant ou membre du personnel ?
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Connectez-vous pour accéder aux notes détaillées, bulletins officiels signés, cahiers de textes,
                réclamations, paiements et messagerie interne — ou déposez une demande d’inscription en ligne.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onOpenPortal('login')}
                className="px-5 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-medium transition-colors whitespace-nowrap"
              >
                Se connecter
              </button>
              {allowAutoRegister && (
                <button
                  type="button"
                  onClick={() => onOpenPortal('register')}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Créer un compte Élève / Parent
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 05 · ADMISSION, RENSEIGNEMENTS & CONTACT */}
      <section id="contact" className="bg-white dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] dark:text-blue-400">
                  05 · Admissions & Contact Public
                </p>
                <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-slate-950 dark:text-white">
                  Prendre rendez-vous ou demander une brochure.
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Laissez un message au secrétariat sans créer de compte. Pour une pré-inscription officielle élève
                  ou parent, utilisez directement le formulaire du portail interactif.
                </p>
              </div>

              <div className="space-y-3 pt-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400 shrink-0 mt-1" />
                  <span>{displayAddress}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400 shrink-0" />
                  <span className="font-mono tabular-nums">{displayPhone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400 shrink-0" />
                  <span>{displayEmail}</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <form
                onSubmit={handleContactSubmit}
                className="bg-[#FAF9F6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-4"
              >
                <h3 className="font-display font-semibold text-base text-slate-950 dark:text-white">
                  Demande d’information auprès du secrétariat
                </h3>

                {contactFeedback && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs flex items-start gap-2 ${
                      contactFeedback.type === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {contactFeedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{contactFeedback.text}</span>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nom et prénom
                    </label>
                    <input
                      required
                      value={contactNom}
                      onChange={(e) => setContactNom(e.target.value)}
                      placeholder="Ex. Mme Fatoumata Sidibé"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone ou adresse e-mail
                    </label>
                    <input
                      required
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="+223 70 00 00 00 ou nom@email.com"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vous êtes
                  </label>
                  <select
                    value={contactProfil}
                    onChange={(e) => setContactProfil(e.target.value as 'parent' | 'eleve' | 'visiteur')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  >
                    <option value="parent">Parent d’élève / Tuteur légal</option>
                    <option value="eleve">Futur élève</option>
                    <option value="visiteur">Visiteur / Partenaire institutionnel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Votre message
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Classe souhaitée, demande de rendez-vous ou question sur la scolarité..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={contactSending}
                  className="px-5 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {contactSending ? 'Transmission...' : 'Envoyer la demande au secrétariat'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="space-y-1">
          <p className="font-editorial text-base font-semibold text-slate-950 dark:text-white">{displaySchoolName}</p>
          <p>
            {displayMotto} · {displayAddress}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="button" onClick={() => onOpenPortal('login')} className="hover:text-slate-950 dark:hover:text-white">
            Connexion
          </button>
          <button type="button" onClick={() => onOpenPortal('register')} className="hover:text-slate-950 dark:hover:text-white">
            Inscription
          </button>
          <button type="button" onClick={() => onOpenPortal('forgot')} className="hover:text-slate-950 dark:hover:text-white">
            Mot de passe oublié
          </button>
          <a href="./vitrine/" className="hover:text-slate-950 dark:hover:text-white">
            Vitrine HTML / CSS / JS
          </a>
          <button type="button" onClick={onToggleDark} className="hover:text-slate-950 dark:hover:text-white">
            {darkMode ? 'Thème clair' : 'Thème sombre'}
          </button>
        </div>
      </footer>
    </div>
  );
};
