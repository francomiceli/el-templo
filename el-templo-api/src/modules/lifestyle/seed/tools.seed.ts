/**
 * Philosophical tool definitions for El Templo lifestyle module.
 *
 * 5 El Templo philosophical frameworks -- original conceptual tools
 * that don't exist as structured data in arete-web (which has a different
 * diagnostic concept). These are curated frameworks for self-examination:
 *
 * - Las 4 Pruebas: belief examination against 4 criteria
 * - Mapa de Friccion: friction source identification and pattern finding
 * - Tabla de Poder: decision evaluation from 4 dimensions
 * - Tabla del Estratega: side-by-side options comparison
 * - Test de Virtud: habit motivation examination
 *
 * Each tool is captured as a conceptual framework (questions/dimensions)
 * without any UI concerns. All prompts in rioplatense Spanish.
 *
 * @see Phase 46 -- Lifestyle Content Extraction (REDO from arete-web)
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
        "Resumen de las cuatro respuestas junto a la creencia original para reflexion",
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
      input: "Tres fuentes actuales de friccion, tension o desgaste silencioso",
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
        "Resumen mostrando fuentes de friccion, el patron que las conecta, y una accion concreta para la semana",
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
      input: "Una decision que necesitas tomar",
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
        "Recomendacion basada en los puntajes: actuar con determinacion, experimentar sin miedo, proceder con cautela, o reflexionar mas",
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
      input: "Dos opciones que estas considerando",
      steps: [
        {
          name: "Riesgo",
          prompt: "Puntua cada opcion en riesgo (1-10)",
        },
        {
          name: "Beneficio",
          prompt: "Puntua cada opcion en beneficio (1-10)",
        },
        {
          name: "Viabilidad",
          prompt: "Puntua cada opcion en viabilidad (1-10)",
        },
        {
          name: "Impacto",
          prompt: "Puntua cada opcion en impacto (1-10)",
        },
      ],
      output:
        "Comparacion de puntajes con ganador claro o veredicto equilibrado, mas fortalezas por dimension de cada opcion",
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
      input: "La lista de habitos activos del usuario",
      steps: [
        {
          name: "Examen de motivacion",
          prompt:
            "Por que practicas este habito? Es por conviccion, obligacion, o miedo?",
        },
      ],
      output:
        "Resumen de todos los habitos con sus motivaciones, destacando cuales nacen de la conviccion vs la obligacion o el miedo",
    },
  },
] as const satisfies readonly PhilosophicalToolSeed[];
