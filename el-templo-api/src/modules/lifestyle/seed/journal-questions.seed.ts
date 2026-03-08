/**
 * Journal question seed data for El Templo's lifestyle module.
 *
 * Extracted from the Arete codebase (journal-questions.ts),
 * filtered to simple-tier (Level 1), brand-adapted to El Templo voice.
 *
 * All questions are introspective but accessible, designed for nightly reflection.
 * Tone: Argentine Spanish (rioplatense), contemplative, warm.
 *
 * @see Phase 46 — Lifestyle Content Extraction
 */

export interface JournalQuestionSeed {
  readonly id: string;
  readonly text: string;
  readonly category: "simple";
}

/**
 * Simple-tier journal questions for nightly reflection.
 *
 * 19 questions total:
 * - 14 universal questions (s01-s14): already brand-neutral
 * - 5 adapted from Arete-specific (a01-a05): gendered language neutralized
 */
export const JOURNAL_QUESTION_SEEDS = [
  // ---------------------------------------------------------------------------
  // Universal simple questions (14) — already brand-neutral
  // ---------------------------------------------------------------------------
  {
    id: "s01",
    text: "Que momento del dia te hizo sentir mas presente?",
    category: "simple",
  },
  {
    id: "s02",
    text: "Que habito te costo mas hoy y por que?",
    category: "simple",
  },
  {
    id: "s03",
    text: "Si pudieras repetir un momento de hoy, cual seria?",
    category: "simple",
  },
  {
    id: "s04",
    text: "Que aprendiste hoy que no sabias ayer?",
    category: "simple",
  },
  {
    id: "s05",
    text: "Que te genero mas gratitud hoy?",
    category: "simple",
  },
  {
    id: "s06",
    text: "En que momento del dia sentiste mas energia?",
    category: "simple",
  },
  {
    id: "s07",
    text: "Hubo algo que evitaste hacer hoy? Por que?",
    category: "simple",
  },
  {
    id: "s08",
    text: "Que conversacion de hoy te dejo pensando?",
    category: "simple",
  },
  {
    id: "s09",
    text: "Si manana fuera identico a hoy, que cambiarias?",
    category: "simple",
  },
  {
    id: "s10",
    text: "Que emocion predomino en tu dia y como la manejaste?",
    category: "simple",
  },
  {
    id: "s11",
    text: "Que decision pequena de hoy podria tener consecuencias grandes?",
    category: "simple",
  },
  {
    id: "s12",
    text: "En que momento te sentiste mas vos mismo hoy?",
    category: "simple",
  },
  {
    id: "s13",
    text: "Que te diria tu version de hace un ano si viera tu dia de hoy?",
    category: "simple",
  },
  {
    id: "s14",
    text: "Con que pensamiento te vas a dormir esta noche?",
    category: "simple",
  },

  // ---------------------------------------------------------------------------
  // Adapted from Arete-specific (5) — gendered language neutralized
  // ---------------------------------------------------------------------------
  {
    id: "a01",
    text: "Que le pidio tu cuerpo hoy que realmente le diste?",
    category: "simple",
  },
  {
    id: "a02",
    text: "Que gesto de cuidado tuviste hoy, por chiquito que sea?",
    category: "simple",
  },
  {
    id: "a03",
    text: "Si tuvieras que agradecerle algo a tu cuerpo esta noche, que seria?",
    category: "simple",
  },
  {
    id: "a04",
    text: "Que ritual de tu dia te dio mas calma o placer?",
    category: "simple",
  },
  {
    id: "a05",
    text: "Que sabor, aroma o textura del dia te gustaria guardar en la memoria?",
    category: "simple",
  },
] as const satisfies readonly JournalQuestionSeed[];
