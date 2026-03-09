/**
 * Journal question seed data for El Templo's lifestyle module.
 *
 * Extracted from arete-web/src/constants/journal-questions.ts (canonical source).
 * Filtered to simple-tier only (minLevel 1), from eligible brands ('both' + 'arete').
 *
 * 35 questions total:
 * - s01-s24 (brand: 'both'): 24 universal simple questions
 * - a01-a05 (brand: 'arete'): 5 body awareness / self-care questions
 * - a11-a16 (brand: 'arete'): 6 rituals / inner dialogue / nature questions
 *
 * Excluded:
 * - Deep tier (d01-d14, minLevel 3) -- deferred to v5.0
 * - Philosophical tier (p01-p08, minLevel 5) -- deferred to v5.0
 * - Arete deep (a06-a08, minLevel 3) and philosophical (a09-a10, a17-a24) -- deferred
 * - No 'aurea' branded content exists in arete-web
 *
 * Brand adaptations applied:
 * - Brand field dropped (all content is El Templo content now)
 * - Gendered "vos misma" -> gender-neutral "vos" where applicable
 * - Rioplatense tone preserved
 *
 * All questions designed for nightly reflection (El Espejo feature).
 * Tone: Argentine Spanish (rioplatense), contemplative, warm.
 *
 * @see Phase 46 -- Lifestyle Content Extraction (REDO from arete-web)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalQuestionSeed {
  readonly id: string;
  readonly text: string;
  readonly minLevel: number;
  readonly category: "simple" | "deep" | "philosophical";
}

// ---------------------------------------------------------------------------
// Catalog (35 simple-tier questions)
// ---------------------------------------------------------------------------

export const JOURNAL_QUESTION_SEEDS = [
  // ---------------------------------------------------------------------------
  // Universal simple questions (24) -- brand: 'both', already gender-neutral
  // ---------------------------------------------------------------------------
  {
    id: "s01",
    text: "Que momento del dia te hizo sentir mas presente?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s02",
    text: "Que habito te costo mas hoy y por que?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s03",
    text: "Si pudieras repetir un momento de hoy, cual seria?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s04",
    text: "Que aprendiste hoy que no sabias ayer?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s05",
    text: "Que te genero mas gratitud hoy?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s06",
    text: "En que momento del dia sentiste mas energia?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s07",
    text: "Hubo algo que evitaste hacer hoy? Por que?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s08",
    text: "Que conversacion de hoy te dejo pensando?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s09",
    text: "Si manana fuera identico a hoy, que cambiarias?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s10",
    text: "Que emocion predomino en tu dia y como la manejaste?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s11",
    text: "Que decision pequena de hoy podria tener consecuencias grandes?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s12",
    text: "En que momento te sentiste mas vos mismo hoy?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s13",
    text: "Que te diria tu version de hace un ano si viera tu dia de hoy?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s14",
    text: "Con que pensamiento te vas a dormir esta noche?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s15",
    text: "Que sensacion fisica notaste hoy que normalmente ignoras?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s16",
    text: "Que habito de hoy sentiste que hiciste en piloto automatico?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s17",
    text: "Que pequena victoria tuviste hoy que nadie mas noto?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s18",
    text: "En que momento del dia tu mente estuvo mas tranquila?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s19",
    text: "Que persona impacto tu dia de alguna forma, aunque sea minima?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s20",
    text: "Si tu dia fuera una cancion, cual seria y por que?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s21",
    text: "Que evitaste sentir hoy y como se manifesto en tu cuerpo?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s22",
    text: "Cual fue tu primer pensamiento al despertar y que dice sobre vos?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s23",
    text: "Que espacio fisico de hoy te dio mas paz o energia?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "s24",
    text: "Si pudieras darle un consejo a tu yo de esta manana, cual seria?",
    minLevel: 1,
    category: "simple",
  },

  // ---------------------------------------------------------------------------
  // Adapted from arete-specific simple (5) -- body awareness, self-care
  // Gendered language neutralized: "vos misma" -> "vos"
  // ---------------------------------------------------------------------------
  {
    id: "a01",
    text: "Que le pidio tu cuerpo hoy que realmente le diste?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a02",
    text: "Que gesto de cuidado tuviste hoy, por chiquito que sea?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a03",
    text: "Si tuvieras que agradecerle algo a tu cuerpo esta noche, que seria?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a04",
    text: "Que ritual de tu dia te dio mas calma o placer?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a05",
    text: "Que sabor, aroma o textura del dia te gustaria guardar en la memoria?",
    minLevel: 1,
    category: "simple",
  },

  // ---------------------------------------------------------------------------
  // Adapted from arete-specific simple (6) -- rituals, nutrition, inner
  // dialogue, nature, joy. Warm supportive tone preserved.
  // ---------------------------------------------------------------------------
  {
    id: "a11",
    text: "Que parte de tu rutina de hoy sentiste como un regalo y no como una obligacion?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a12",
    text: "Que alimento de hoy nutrio algo mas que tu cuerpo?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a13",
    text: "Como te trato tu dialogo interno hoy?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a14",
    text: "Que necesitas de tu dia de manana que hoy no tuviste?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a15",
    text: "Que te conecto con la naturaleza hoy, aunque sea un rayo de sol?",
    minLevel: 1,
    category: "simple",
  },
  {
    id: "a16",
    text: "Que te hizo reir hoy y por que fue importante?",
    minLevel: 1,
    category: "simple",
  },
] as const satisfies readonly JournalQuestionSeed[];
