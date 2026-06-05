/**
 * route-progression-map.ts — Single source of truth for the per-ROUTE progression
 * model (rework of the v5.1 sub-family decomposition).
 *
 * Replaces the old "sub-family" axis with: per route, an ordered PROGRESSION
 * (the difficulty ladder) plus optional parallel "Habilidad" variants. Decisions
 * are captured in PROGRESIONES-POR-RUTA-DRAFT.md (4 grupos cerrados con profes).
 *
 * MASTER RULE: a token that changes assistance/difficulty → Progression (a step);
 * the same difficulty with a different tool/form → Habilidad (a parallel variant).
 *
 * Three route strategies (chosen per the real catalog token data):
 *   - "token"   : token-rich routes (palanca / empuje / BL). The step is derived
 *                 from a position/name token; `progression_step` = the step rank.
 *                 A non-default variant token → Habilidad. No step token → unknown
 *                 (left pending for a profe).
 *   - "linear"  : token-poor routes (legs). No clean token ladder, so the catalog's
 *                 already-curated `dificultad_lineal` drives the order
 *                 (`progression_step` = null). Only intensity modifiers (W/OL/JUMP)
 *                 are pulled out as Habilidad.
 *   - "excluded": mobility + games — NOT part of the strength tree.
 *
 * DEFAULT VARIANT: the canonical grip/form of a route carries NO Habilidad (e.g.
 * Back Lever PRONE is the main line; SUPINE / PULL UP / WIDE are Habilidad). If the
 * default were also tagged, the backbone would be empty. So the `habilidades` list
 * holds only the NON-default variant tokens.
 *
 * Consumed by: bootstrap-dimensions.ts (classification), rebuild-progression-graph.ts
 * (ordering), and the admin review screen (via a read endpoint). Deterministic,
 * no LLM (consistent with the heuristic-v1 engine).
 */

export type RouteStrategy = "token" | "linear" | "excluded";

export interface RouteDefinition {
  readonly strategy: RouteStrategy;
  /** Ordered step tokens, easy→hard. Only for the "token" strategy. */
  readonly steps?: readonly string[];
  /** Non-default variant tokens → Habilidad (parallel, optional). */
  readonly habilidades?: readonly string[];
  /** Short note on the source decision (draft group). */
  readonly note?: string;
}

export type ClassifyKind = "step" | "linear" | "unknown" | "excluded";

export interface ClassifyResult {
  readonly kind: ClassifyKind;
  /** 0-based rank within steps[] for a matched "token" step; null otherwise. */
  readonly step: number | null;
  /** Detected non-default variant token, or null (default variant / none). */
  readonly habilidad: string | null;
}

/**
 * Word-level aliases applied during normalization (typos + abbreviations). Applied
 * to each whitespace-separated word AFTER uppercasing and punctuation stripping, so
 * only EXACT word matches are rewritten ("STR"→"STRADDLE" never touches "STRICT").
 */
const WORD_ALIASES: Readonly<Record<string, string>> = {
  STR: "STRADDLE", // FL/FLR/TTB/MN abbreviate Straddle as STR
  HOR: "HORIZONTAL", // OAPU abbreviates Horizontal as HOR
  HORZONTAL: "HORIZONTAL", // OAR typo
  ADVANCED: "ADV", // "SUPER ADVANCED TUCK" → "SUPER ADV TUCK"
  TYPWRITER: "TYPEWRITER", // OAPU typo
  ASISSTED: "ASSISTED", // OAPU typo
  ASSIST: "ASSISTED", // OAP/OAPU short form
};

/**
 * The per-route map. Keys are the exact catalog `route` value, upper-cased. Step
 * and Habilidad tokens are written in NORMALIZED form (upper-case, no dots, hyphens
 * as spaces) so they match `normalizeWords()` output directly.
 */
export const ROUTE_PROGRESSION_MAP: Readonly<Record<string, RouteDefinition>> =
  {
    // ── Palanca: escala universal Tuck → Adv Tuck → Super Adv → Straddle → Half → Full
    FL: {
      strategy: "token",
      steps: [
        "TUCK",
        "ADV TUCK",
        "SUPER ADV",
        "STRADDLE",
        "HALF LAYOUT",
        "FULL",
      ],
      habilidades: ["VERTICAL", "PIKE", "HORIZONTAL", "INV", "OL"],
      note: "Grupo A. Orientación (vertical/pike/horizontal/inv/o.l) = Habilidad.",
    },
    FLR: {
      strategy: "token",
      steps: [
        "TUCK",
        "ADV TUCK",
        "SUPER ADV",
        "STRADDLE",
        "HALF LAYOUT",
        "FULL",
      ],
      habilidades: ["INCLINED", "HORIZONTAL", "PIKE"],
      note: "Grupo A. Misma palanca que FL.",
    },
    BL: {
      strategy: "token",
      steps: [
        "TUCK",
        "ADV TUCK",
        "SUPER ADV",
        "STRADDLE",
        "HALF LAYOUT",
        "FULL",
      ],
      habilidades: ["SUPINE", "PULL UP", "WIDE", "ASSISTED"],
      note: "Grupo A. PRONE = agarre default (sin tag); supine/pull-up/wide = Habilidad. Entradas (skin the cat, german hang) → pending.",
    },
    PLPU: {
      strategy: "token",
      steps: ["PSEUDO", "TUCK", "ADV TUCK", "SUPER ADV", "STRADDLE", "FULL"],
      habilidades: ["PROTRACTED", "CASETA"],
      note: "Grupo A. Pendiente menor: orden de pseudo/caseta (el profe ajusta).",
    },
    "MN/RP": {
      strategy: "token",
      steps: ["TUCK", "TUCK STRADDLE", "STRADDLE", "L SIT", "V SIT"],
      habilidades: ["SIT"],
      note: "Grupo A (Manna). Tuck → Tuck Str → Straddle → L-Sit → V-Sit.",
    },
    TTB: {
      strategy: "token",
      steps: ["TUCK", "STRADDLE", "FULL"],
      habilidades: ["PIKE", "CRUNCH", "VERTICAL"],
      note: "Grupo A. Tuck → Str → Full; crunch/pike = variante.",
    },
    PL: {
      strategy: "token",
      steps: ["FLOOR", "TUCK", "ADV TUCK", "STRADDLE", "FULL"],
      habilidades: ["PSEUDO", "OL", "BLACK WIDOW"],
      note: "Grupo A. Pocos datos en position (muchos → pending).",
    },
    "REVERSE HYPER": {
      strategy: "token",
      steps: ["TUCK", "HALF STRADDLE", "STRADDLE", "FULL"],
      habilidades: [],
      note: "Grupo A. Tuck → Half Str → Str → Full.",
    },

    // ── Empuje a una mano / variantes: asistencia + ángulo + variante
    OAP: {
      strategy: "token",
      steps: ["ASSISTED", "STRICT", "ARCHER", "TYPEWRITER"],
      habilidades: [
        "WIDE",
        "FINGERS",
        "COMMANDO",
        "AUSTRALIAN",
        "L SIT",
        "BULGARIAN",
        "RACK",
        "VERTICAL",
        "JUMPING",
        "EXPLOSIVE",
      ],
      note: "Grupo B. assisted → strict → archer → typewriter → one arm. Implemento/forma = Habilidad.",
    },
    OAPU: {
      strategy: "token",
      steps: [
        "KNEE",
        "INCLINED",
        "HORIZONTAL",
        "DECLINED",
        "ARCHER",
        "TYPEWRITER",
        "DEEP",
        "STRADDLE",
      ],
      habilidades: [
        "BULGARIAN",
        "SPARTAN",
        "SUPERMAN",
        "FLY",
        "PELICAN",
        "TEMPO",
        "ASSISTED",
      ],
      note: "Grupo B. Asistencia + ángulo (inclined→declined) + archer→typewriter→deep. Rarezas = Habilidad/revisar.",
    },
    MU: {
      strategy: "token",
      steps: [
        "INCLINED",
        "RACK",
        "VERTICAL",
        "ASSISTED",
        "EXPLOSIVE",
        "WEIGHTED",
      ],
      habilidades: ["FALSE GRIP", "RINGS", "BAR", "WIDE", "SLOW", "ARCHER"],
      note: "Grupo B. Implemento (bar/rings) + variante = Habilidad.",
    },

    // ── Empuje invertido: el setup ES la progresión (asistencia)
    HSPU: {
      strategy: "token",
      steps: ["KNEE", "PIKE", "BOX", "WALL", "FREE"],
      habilidades: ["QUAD", "BEAR"],
      note: "Grupo C. knee → pike → box → wall → free.",
    },
    PHS: {
      strategy: "token",
      steps: ["FLOOR", "BOX", "WALL", "FREE", "P BARS"],
      habilidades: ["PIKE"],
      note: "Grupo C. Floor → Box → Wall → Free → P-Bars.",
    },
    OAR: {
      strategy: "token",
      steps: ["INCLINED", "HORIZONTAL", "DECLINED"],
      habilidades: ["STANDING", "BULGARO"],
      note: "Grupo A/B. Ángulo: inclined → horizontal → declined.",
    },
    // Dips/fondos: implemento = Habilidad; P-BARS es el implemento default (sin tag).
    "HD/ID": {
      strategy: "linear",
      habilidades: [
        "RINGS",
        "SINGLE BAR",
        "BAR",
        "NEUTRAL",
        "BOX",
        "JUMPING",
        "WEIGHTED",
        "W",
      ],
      note: "Grupo C. Orden por dlin (asistencia/peso); implemento = Habilidad (P-Bars = default).",
    },

    // ── Piernas: rango (asistido→parcial→full rom) ya está en dlin → estrategia linear.
    //    Habilidad / intensidad aparte: una pierna (OL), peso (W), salto (JUMP).
    PS: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Pistol Squat.",
    },
    SU: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Step Up.",
    },
    NC: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Cadena posterior.",
    },
    L: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Lunge.",
    },
    DS: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Dragon Squat.",
    },
    SS: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Sissy Squat.",
    },
    QC: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. Cuádriceps.",
    },

    // ── Core oblicuo (ambigua, incluida por defecto; el profe puede excluir).
    "SIDE PCK": {
      strategy: "token",
      steps: ["BENT", "STRAIGHT", "OVERHEAD"],
      habilidades: ["WINDMILL", "W", "OL"],
      note: "Grupo D. bent → straight → overhead.",
    },
    // ── Ambigua sin semántica clara (incluida por defecto; el profe decide/excluye).
    HT: {
      strategy: "linear",
      habilidades: ["W", "OL", "JUMP"],
      note: "Grupo D. '? definir' — el profe decide.",
    },

    // ── Movilidad / skill: track aparte, FUERA del árbol de fuerza.
    SPAGAT: { strategy: "excluded", note: "Grupo D. Movilidad." },
    BRIDGE: { strategy: "excluded", note: "Grupo D. Movilidad." },
    PIKE: { strategy: "excluded", note: "Grupo D. Movilidad." },
    HS: {
      strategy: "excluded",
      note: "Grupo D. Handstand (skill/equilibrio).",
    },
    AF: { strategy: "excluded", note: "Grupo D. Animal Flow (movilidad)." },
    HR: { strategy: "excluded", note: "Grupo D. Movilidad/core." },
  };

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a raw position/name into upper-case words: strip dots (O.L → OL),
 * turn hyphens/slashes/underscores into spaces (P-BARS → P BARS), collapse
 * whitespace, then apply word-level aliases. Returns the word array used for
 * phrase matching.
 */
export function normalizeWords(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => WORD_ALIASES[w] ?? w);
}

/** Normalize a route code for map lookup (upper-case, trimmed). */
export function normalizeRoute(rawRoute: string): string {
  return rawRoute.trim().toUpperCase();
}

// ── Compiled token index (precomputed once at module load) ───────────────────

interface CompiledToken {
  /** token split into words for phrase matching */
  readonly words: string[];
  /** the normalized token string (canonical) */
  readonly token: string;
  /** step index for step tokens; -1 for habilidad tokens */
  readonly stepIndex: number;
}

interface CompiledRoute {
  readonly strategy: RouteStrategy;
  /** step tokens, sorted most-specific-first (more words, then longer) */
  readonly steps: CompiledToken[];
  /** habilidad tokens, sorted most-specific-first */
  readonly habilidades: CompiledToken[];
}

function compileToken(token: string, stepIndex: number): CompiledToken {
  return { words: normalizeWords(token), token, stepIndex };
}

/** Sort most-specific-first: more words wins, then longer string. */
function bySpecificity(a: CompiledToken, b: CompiledToken): number {
  if (b.words.length !== a.words.length) return b.words.length - a.words.length;
  return b.token.length - a.token.length;
}

const COMPILED: Readonly<Record<string, CompiledRoute>> = Object.fromEntries(
  Object.entries(ROUTE_PROGRESSION_MAP).map(([route, def]) => {
    const steps = (def.steps ?? [])
      .map((t, i) => compileToken(t, i))
      .sort(bySpecificity);
    const habilidades = (def.habilidades ?? [])
      .map((t) => compileToken(t, -1))
      .sort(bySpecificity);
    return [route, { strategy: def.strategy, steps, habilidades }];
  }),
);

/** True when `tokenWords` appears as a contiguous whole-word phrase in `words`. */
function phraseAppears(words: string[], tokenWords: string[]): boolean {
  if (tokenWords.length === 0 || tokenWords.length > words.length) return false;
  for (let i = 0; i + tokenWords.length <= words.length; i++) {
    let all = true;
    for (let j = 0; j < tokenWords.length; j++) {
      if (words[i + j] !== tokenWords[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/** First (most-specific) compiled token that appears in `words`, or null. */
function firstMatch(
  words: string[],
  candidates: CompiledToken[],
): CompiledToken | null {
  for (const c of candidates) {
    if (phraseAppears(words, c.words)) return c;
  }
  return null;
}

// ── Public classification ────────────────────────────────────────────────────

const EXCLUDED: ClassifyResult = {
  kind: "excluded",
  step: null,
  habilidad: null,
};

/**
 * Classify one exercise (by its position OR name) within its route into a
 * progression step + optional Habilidad. The bootstrap calls this with
 * `position || name`.
 *
 *   - empty/blank route  → "excluded" (games / acondicionamiento).
 *   - unmapped route     → "unknown"  (left pending for a profe).
 *   - "excluded" route   → "excluded".
 *   - "linear" route     → step=null (engine orders by dificultad_lineal),
 *                          habilidad = detected intensity/variant token or null.
 *   - "token" route      → step=rank if a step token matched, else "unknown".
 *                          habilidad = detected non-default variant or null.
 */
export function classify(rawInput: string, rawRoute: string): ClassifyResult {
  const routeKey = normalizeRoute(rawRoute);
  if (routeKey === "") return EXCLUDED; // games / sin ruta
  const compiled = COMPILED[routeKey];
  if (!compiled) return { kind: "unknown", step: null, habilidad: null };
  if (compiled.strategy === "excluded") return EXCLUDED;

  const words = normalizeWords(rawInput);
  const habMatch = firstMatch(words, compiled.habilidades);
  const habilidad = habMatch ? habMatch.token : null;

  if (compiled.strategy === "linear") {
    return { kind: "linear", step: null, habilidad };
  }

  // token strategy
  const stepMatch = firstMatch(words, compiled.steps);
  if (stepMatch === null) {
    return { kind: "unknown", step: null, habilidad };
  }
  return { kind: "step", step: stepMatch.stepIndex, habilidad };
}

/** Routes that are excluded from the strength tree (mobility/games seed). */
export function excludedRoutes(): string[] {
  return Object.entries(ROUTE_PROGRESSION_MAP)
    .filter(([, def]) => def.strategy === "excluded")
    .map(([route]) => route);
}

/** Per-route info the admin review screen needs (steps + Habilidad vocab). */
export interface RouteReviewInfo {
  readonly strategy: RouteStrategy;
  /** Ordered step tokens (easy→hard); empty for linear/excluded routes. */
  readonly steps: string[];
  /** Non-default Habilidad variant tokens. */
  readonly habilidades: string[];
}

/**
 * Flatten the map into the review-screen shape (route code → strategy + step
 * tokens + Habilidad vocab). Served by GET /admin/exercises/route-progression-map
 * so the front consumes the SAME source of truth (DRY) instead of duplicating the
 * token lists.
 */
export function routeProgressionReviewMap(): Record<string, RouteReviewInfo> {
  return Object.fromEntries(
    Object.entries(ROUTE_PROGRESSION_MAP).map(([route, def]) => [
      route,
      {
        strategy: def.strategy,
        steps: [...(def.steps ?? [])],
        habilidades: [...(def.habilidades ?? [])],
      },
    ]),
  );
}
