/**
 * Philosophical tool definitions for El Templo lifestyle module.
 *
 * 5 tools extracted from Arete's tools feature:
 * - Las 4 Pruebas: belief examination against 4 criteria
 * - Mapa de Friccion: friction source identification and pattern finding
 * - Tabla de Poder: decision evaluation from 4 dimensions
 * - Tabla del Estratega: side-by-side options comparison
 * - Test de Virtud: habit motivation examination
 *
 * Each tool is captured as a conceptual framework (questions/dimensions)
 * without any UI concerns.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single step/criterion within a tool's framework.
 */
interface FrameworkStep {
  readonly name: string;
  readonly prompt: string;
}

/**
 * Describes the conceptual model of a philosophical tool:
 * what it asks, what dimensions it evaluates, and how it produces insight.
 */
interface ToolFramework {
  /** What the user provides as input to start the tool */
  readonly input: string;
  /** The sequential steps, criteria, or dimensions the tool uses */
  readonly steps: readonly FrameworkStep[];
  /** How the tool produces its conclusion */
  readonly output: string;
}

export interface PhilosophicalToolSeed {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly framework: ToolFramework;
}

// ---------------------------------------------------------------------------
// Catalog (5 tools)
// ---------------------------------------------------------------------------

export const TOOL_SEEDS = [
  // -------------------------------------------------------------------------
  // TOOL-01: Las 4 Pruebas -- belief examination
  // -------------------------------------------------------------------------
  {
    id: "las4pruebas",
    name: "Las 4 Pruebas",
    description: "Examina una creencia contra cuatro criterios",
    framework: {
      input: "Una creencia sobre uno mismo o el mundo",
      steps: [
        {
          name: "Prueba de Verdad",
          prompt: "Es realmente verdad? Que evidencia tenes?",
        },
        {
          name: "Prueba de Utilidad",
          prompt:
            "Esta creencia te sirve? Te acerca o te aleja de quien queres ser?",
        },
        {
          name: "Prueba de Origen",
          prompt: "De donde viene esta creencia? Es tuya o la heredaste?",
        },
        {
          name: "Prueba de Inversion",
          prompt: "Que pasaria si creyeras lo opuesto? Como cambiaria tu vida?",
        },
      ],
      output:
        "Summary of all four responses alongside the original belief for reflection",
    },
  },

  // -------------------------------------------------------------------------
  // TOOL-02: Mapa de Friccion -- friction source identification
  // -------------------------------------------------------------------------
  {
    id: "mapafriccion",
    name: "Mapa de Friccion",
    description: "Identifica fuentes de friccion y encuentra patrones",
    framework: {
      input: "Three current sources of friction, tension, or silent wear",
      steps: [
        {
          name: "Identificar",
          prompt:
            "Nombra 3 fuentes de friccion en tu vida actual. Esas cosas que generan resistencia, tension o desgaste silencioso.",
        },
        {
          name: "Patron",
          prompt: "Que tienen en comun estas 3 fuentes? Que patron ves?",
        },
        {
          name: "Accion",
          prompt:
            "Que accion concreta podes tomar esta semana para reducir una de estas fricciones?",
        },
      ],
      output:
        "Summary showing friction sources, the connecting pattern, and one concrete weekly action",
    },
  },

  // -------------------------------------------------------------------------
  // TOOL-03: Tabla de Poder -- decision evaluation
  // -------------------------------------------------------------------------
  {
    id: "tablapoder",
    name: "Tabla de Poder",
    description: "Evalua una decision desde cuatro dimensiones",
    framework: {
      input: "A decision that needs to be made",
      steps: [
        {
          name: "Urgencia",
          prompt: "Que tan urgente es? (0-100)",
        },
        {
          name: "Impacto",
          prompt: "Cual es el impacto potencial? (0-100)",
        },
        {
          name: "Reversibilidad",
          prompt: "Que tan reversible es? (0-100)",
        },
        {
          name: "Alineamiento",
          prompt: "Que tan alineada esta con tus valores? (0-100)",
        },
      ],
      output:
        "Computed recommendation based on dimension scores: act with determination, experiment without fear, exercise caution, or reflect longer",
    },
  },

  // -------------------------------------------------------------------------
  // TOOL-04: Tabla del Estratega -- options comparison
  // -------------------------------------------------------------------------
  {
    id: "tablaestrategista",
    name: "Tabla del Estratega",
    description: "Compara dos opciones dimension por dimension",
    framework: {
      input: "Two options being considered",
      steps: [
        {
          name: "Riesgo",
          prompt: "Score each option on risk (1-10)",
        },
        {
          name: "Beneficio",
          prompt: "Score each option on benefit (1-10)",
        },
        {
          name: "Viabilidad",
          prompt: "Score each option on feasibility (1-10)",
        },
        {
          name: "Impacto",
          prompt: "Score each option on impact (1-10)",
        },
      ],
      output:
        "Total score comparison with clear winner or balanced verdict, plus per-dimension strengths for each option",
    },
  },

  // -------------------------------------------------------------------------
  // TOOL-05: Test de Virtud -- habit motivation examination
  // -------------------------------------------------------------------------
  {
    id: "testvirtud",
    name: "Test de Virtud",
    description: "Examina la motivacion detras de cada habito",
    framework: {
      input: "The user's active habits list",
      steps: [
        {
          name: "Examen de motivacion",
          prompt:
            "Por que practicas este habito? Es por conviccion, obligacion, o miedo?",
        },
      ],
      output:
        "Summary of all habits with their motivations, highlighting which arise from conviction versus obligation or fear",
    },
  },
] as const satisfies readonly PhilosophicalToolSeed[];
