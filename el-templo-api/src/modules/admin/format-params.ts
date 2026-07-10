/**
 * Format Parameters Type System
 *
 * Defines the FormatParams discriminated union and default value factory
 * for configurable format parameters. These parameters describe the format
 * configuration (coach-visible metadata) and are stored in session_blocks.formatParams.
 *
 * Coverage: All 46 DB formats from the formats bible.
 */

// =============================================================================
// Type Definitions
// =============================================================================

export type FormatParams =
  // ── Time-based ──────────────────────────────────────────────────────────
  | { type: "amrap"; minutes: number }
  | { type: "amrap_series"; minutes: number; rounds: number }
  | { type: "emom"; intervalSeconds: number; totalMinutes: number }
  | { type: "tabata"; workSeconds: number; restSeconds: number; rounds: number }
  | {
      type: "interval";
      workSeconds: number;
      restSeconds: number;
      rounds: number;
    }
  | {
      type: "hiit";
      workSeconds: number;
      restSeconds: number;
      rounds: number;
    }
  | { type: "time_cap"; minutes: number }
  | {
      type: "every_x_seconds";
      intervalSeconds: number;
      totalMinutes: number;
    }
  | { type: "on_the_x"; intervalSeconds: number; rounds: number }
  | { type: "for_time"; timeCapMinutes?: number }
  | { type: "for_max_tiempo" }

  // ── Volume-based ────────────────────────────────────────────────────────
  | { type: "chipper" }
  | { type: "death_by"; timeCapMinutes?: number }
  | { type: "death_by_unbroken"; timeCapMinutes?: number }
  | {
      type: "ladder";
      direction: "ascending" | "descending";
      start: number;
      step: number;
      rounds: number;
    }
  | {
      type: "ladder_block";
      direction: "ascending" | "descending";
      start: number;
      step: number;
      blockSize: number;
    }
  | {
      type: "ladder_corta";
      direction: "ascending" | "descending";
      start: number;
      step: number;
      rounds: number;
    }
  | { type: "pyramid"; step?: number; peak?: number }
  | { type: "accumulate"; target: number; unit: "reps" | "seconds" }
  | { type: "for_max_reps"; timeCapMinutes?: number }
  | { type: "for_max_carga" }
  | { type: "for_max_distancia"; timeCapMinutes?: number }
  | { type: "unbroken_reps" }
  | { type: "unbroken_chipper" }
  | { type: "ub_test" }

  // ── ROM (Range of Motion) ────────────────────────────────────────────────
  | { type: "rom"; rounds: number; restSeconds: number }

  // ── Technical / Skill-focused ───────────────────────────────────────────
  | { type: "complex"; rounds: number }
  | { type: "combos"; rounds: number }
  | { type: "for_quality"; rounds: number }
  | { type: "for_tech"; minutes: number }
  | { type: "tempo_sets"; tempo: string }
  | { type: "flow_guiado" }
  | { type: "stretching" }
  | { type: "cluster"; clusterSize: number; restBetweenClusters: number }

  // ── Structure-based ─────────────────────────────────────────────────────
  | { type: "rounds_for_time"; rounds: number; timeCapMinutes?: number }
  | { type: "couplet" }
  | { type: "triplet" }
  | { type: "singlet" }
  | { type: "benchmark_wod" }
  | { type: "hero_wod" }
  | { type: "buy_in_cash_out"; rounds?: number }
  | { type: "i_go_you_go"; totalRounds?: number }
  | { type: "floater_wod" }
  | { type: "acropolis"; phases: number }

  // ── Hybrid / Mixed ──────────────────────────────────────────────────────
  | { type: "wave_loading"; waves: number }
  | { type: "drop_set"; drops: number }
  | { type: "rest_pause"; pauseSeconds: number }
  | { type: "open_style"; minutes?: number }
  | {
      type: "emom_for_time";
      emomMinutes: number;
      intervalSeconds: number;
    }
  | {
      type: "broken_ladder";
      direction: "ascending" | "descending";
      start: number;
      step: number;
      breakAfter: number;
    }
  | { type: "task_priority" }
  | { type: "circuito_cooperativo" }

  // ── Fallback ────────────────────────────────────────────────────────────
  | { type: "standard" };

// =============================================================================
// Default Value Constants
// =============================================================================

const DEFAULTS = {
  AMRAP_MINUTES: 10,
  AMRAP_SERIES_ROUNDS: 3,
  EMOM_INTERVAL_SECONDS: 60,
  COMPLEX_ROUNDS: 3,
  COMBOS_ROUNDS: 3,
  TABATA_WORK_SECONDS: 20,
  TABATA_REST_SECONDS: 10,
  TABATA_ROUNDS: 8,
  INTERVAL_HIGH_WORK: 30,
  INTERVAL_HIGH_REST: 30,
  INTERVAL_MEDIUM_WORK: 40,
  INTERVAL_MEDIUM_REST: 20,
  INTERVAL_LOW_WORK: 45,
  INTERVAL_LOW_REST: 15,
  INTERVAL_DEFAULT_ROUNDS: 8,
  CLUSTER_SIZE: 3,
  CLUSTER_REST_SECONDS: 90,
  PYRAMID_STEP: 2,
  PYRAMID_PEAK: 10,
  LADDER_START_ASC: 1,
  LADDER_START_DESC: 10,
  LADDER_STEP: 1,
  LADDER_ROUNDS: 10,
  LADDER_BLOCK_START: 2,
  LADDER_BLOCK_STEP: 2,
  LADDER_BLOCK_SIZE: 3,
  LADDER_CORTA_ROUNDS: 5,
  BROKEN_LADDER_START: 1,
  BROKEN_LADDER_STEP: 1,
  BROKEN_LADDER_BREAK_AFTER: 3,
  LADDER_HIGH_INTENSITY_THRESHOLD: 75,
  TIME_CAP_MINUTES: 10,
  FOR_QUALITY_ROUNDS: 3,
  FOR_TECH_MINUTES: 12,
  TEMPO_DEFAULT: "3-1-1-0",
  RFT_ROUNDS: 5,
  I_GO_YOU_GO_ROUNDS: 10,
  ACROPOLIS_PHASES: 3,
  WAVE_LOADING_WAVES: 2,
  DROP_SET_DROPS: 3,
  REST_PAUSE_SECONDS: 15,
  OPEN_STYLE_MINUTES: 20,
  EMOM_FOR_TIME_EMOM_MINUTES: 6,
  ACCUMULATE_TARGET: 50,
  ON_THE_X_INTERVAL: 120,
  ON_THE_X_ROUNDS: 6,
  EVERY_X_INTERVAL: 45,
  EVERY_X_TOTAL_MINUTES: 10,
} as const;

// =============================================================================
// Factory Function
// =============================================================================

export interface FormatParamsContext {
  intensity: number;
  exerciseCount: number;
}

/**
 * Exact-match map: normalized DB format name → factory function.
 * Checked first for O(1) lookup. Substring fallback only for unknowns.
 */
function buildExactMap(
  context: FormatParamsContext,
): Record<string, () => FormatParams> {
  const { intensity, exerciseCount } = context;

  const ladderDirection = (): "ascending" | "descending" =>
    intensity >= DEFAULTS.LADDER_HIGH_INTENSITY_THRESHOLD
      ? "descending"
      : "ascending";

  const intervalDefaults = () => {
    if (intensity >= 80)
      return {
        workSeconds: DEFAULTS.INTERVAL_HIGH_WORK,
        restSeconds: DEFAULTS.INTERVAL_HIGH_REST,
      };
    if (intensity >= 70)
      return {
        workSeconds: DEFAULTS.INTERVAL_MEDIUM_WORK,
        restSeconds: DEFAULTS.INTERVAL_MEDIUM_REST,
      };
    return {
      workSeconds: DEFAULTS.INTERVAL_LOW_WORK,
      restSeconds: DEFAULTS.INTERVAL_LOW_REST,
    };
  };

  return {
    // Time-based
    amrap: () => ({ type: "amrap", minutes: DEFAULTS.AMRAP_MINUTES }),
    amrap_series: () => ({
      type: "amrap_series",
      minutes: DEFAULTS.AMRAP_MINUTES,
      rounds: DEFAULTS.AMRAP_SERIES_ROUNDS,
    }),
    emom: () => ({
      type: "emom",
      intervalSeconds: DEFAULTS.EMOM_INTERVAL_SECONDS,
      totalMinutes: exerciseCount || 5,
    }),
    tabata: () => ({
      type: "tabata",
      workSeconds: DEFAULTS.TABATA_WORK_SECONDS,
      restSeconds: DEFAULTS.TABATA_REST_SECONDS,
      rounds: DEFAULTS.TABATA_ROUNDS,
    }),
    interval_training: () => ({
      type: "interval",
      ...intervalDefaults(),
      rounds: DEFAULTS.INTERVAL_DEFAULT_ROUNDS,
    }),
    hiit: () => ({
      type: "hiit",
      ...intervalDefaults(),
      rounds: DEFAULTS.INTERVAL_DEFAULT_ROUNDS,
    }),
    time_cap: () => ({
      type: "time_cap",
      minutes: DEFAULTS.TIME_CAP_MINUTES,
    }),
    every_x_seconds: () => ({
      type: "every_x_seconds",
      intervalSeconds: DEFAULTS.EVERY_X_INTERVAL,
      totalMinutes: DEFAULTS.EVERY_X_TOTAL_MINUTES,
    }),
    "on_the_2:00_/_3:00": () => ({
      type: "on_the_x",
      intervalSeconds: DEFAULTS.ON_THE_X_INTERVAL,
      rounds: DEFAULTS.ON_THE_X_ROUNDS,
    }),
    for_time: () => ({ type: "for_time" }),
    "for_max_(tiempo)": () => ({ type: "for_max_tiempo" }),

    // Volume-based
    chipper: () => ({ type: "chipper" }),
    death_by: () => ({ type: "death_by" }),
    death_by_unbroken: () => ({ type: "death_by_unbroken" }),
    ladder: () => {
      const dir = ladderDirection();
      return {
        type: "ladder",
        direction: dir,
        start:
          dir === "ascending"
            ? DEFAULTS.LADDER_START_ASC
            : DEFAULTS.LADDER_START_DESC,
        step: DEFAULTS.LADDER_STEP,
        rounds: DEFAULTS.LADDER_ROUNDS,
      };
    },
    ladder_block: () => {
      const dir = ladderDirection();
      return {
        type: "ladder_block",
        direction: dir,
        start: DEFAULTS.LADDER_BLOCK_START,
        step: DEFAULTS.LADDER_BLOCK_STEP,
        blockSize: DEFAULTS.LADDER_BLOCK_SIZE,
      };
    },
    ladder_corta: () => {
      const dir = ladderDirection();
      return {
        type: "ladder_corta",
        direction: dir,
        start:
          dir === "ascending"
            ? DEFAULTS.LADDER_START_ASC
            : DEFAULTS.LADDER_START_DESC,
        step: DEFAULTS.LADDER_STEP,
        rounds: DEFAULTS.LADDER_CORTA_ROUNDS,
      };
    },
    pyramid: () => ({
      type: "pyramid",
      step: DEFAULTS.PYRAMID_STEP,
      peak: DEFAULTS.PYRAMID_PEAK,
    }),
    accumulate_x: () => ({
      type: "accumulate",
      target: DEFAULTS.ACCUMULATE_TARGET,
      unit: "reps",
    }),
    "for_max_(reps)": () => ({ type: "for_max_reps" }),
    "for_max_(carga)": () => ({ type: "for_max_carga" }),
    "for_max_(distancia)": () => ({ type: "for_max_distancia" }),
    unbroken_reps: () => ({ type: "unbroken_reps" }),
    unbroken_chipper: () => ({ type: "unbroken_chipper" }),
    ub_test: () => ({ type: "ub_test" }),

    // ROM
    rom: () => ({ type: "rom", rounds: 3, restSeconds: 30 }),

    // Technical
    complex: () => ({ type: "complex", rounds: DEFAULTS.COMPLEX_ROUNDS }),
    combos: () => ({ type: "combos", rounds: DEFAULTS.COMBOS_ROUNDS }),
    for_quality: () => ({
      type: "for_quality",
      rounds: DEFAULTS.FOR_QUALITY_ROUNDS,
    }),
    for_tech: () => ({
      type: "for_tech",
      minutes: DEFAULTS.FOR_TECH_MINUTES,
    }),
    tempo_sets: () => ({
      type: "tempo_sets",
      tempo: DEFAULTS.TEMPO_DEFAULT,
    }),
    flow_guiado: () => ({ type: "flow_guiado" }),
    stretching: () => ({ type: "stretching" }),
    cluster: () => ({
      type: "cluster",
      clusterSize: DEFAULTS.CLUSTER_SIZE,
      restBetweenClusters: DEFAULTS.CLUSTER_REST_SECONDS,
    }),

    // Structure-based
    rounds_for_time: () => ({
      type: "rounds_for_time",
      rounds: DEFAULTS.RFT_ROUNDS,
    }),
    couplet: () => ({ type: "couplet" }),
    triplet: () => ({ type: "triplet" }),
    singlet: () => ({ type: "singlet" }),
    benchmark: () => ({ type: "benchmark_wod" }),
    benchmark_wod: () => ({ type: "benchmark_wod" }),
    hero_wod: () => ({ type: "hero_wod" }),
    "buy-in_/_cash-out": () => ({ type: "buy_in_cash_out" }),
    // I Go You Go: una sola ronda (las cantidades van en las reps por ejercicio),
    // así que no se setea totalRounds — el coach no elige rondas.
    "i_go,_you_go": () => ({ type: "i_go_you_go" }),
    floater_wod: () => ({ type: "floater_wod" }),
    acropolis: () => ({
      type: "acropolis",
      phases: DEFAULTS.ACROPOLIS_PHASES,
    }),

    // Hybrid
    wave_loading: () => ({
      type: "wave_loading",
      waves: DEFAULTS.WAVE_LOADING_WAVES,
    }),
    drop_set: () => ({ type: "drop_set", drops: DEFAULTS.DROP_SET_DROPS }),
    "rest-pause": () => ({
      type: "rest_pause",
      pauseSeconds: DEFAULTS.REST_PAUSE_SECONDS,
    }),
    // Open Style: el tiempo lo decide el profe sobre la marcha (final de clase),
    // no se configura ni se imprime un valor fijo.
    open_style: () => ({ type: "open_style" }),
    "emom_+_for_time": () => ({
      type: "emom_for_time",
      emomMinutes: DEFAULTS.EMOM_FOR_TIME_EMOM_MINUTES,
      intervalSeconds: DEFAULTS.EMOM_INTERVAL_SECONDS,
    }),
    broken_ladder: () => {
      const dir = ladderDirection();
      return {
        type: "broken_ladder",
        direction: dir,
        start: DEFAULTS.BROKEN_LADDER_START,
        step: DEFAULTS.BROKEN_LADDER_STEP,
        breakAfter: DEFAULTS.BROKEN_LADDER_BREAK_AFTER,
      };
    },
    task_priority: () => ({ type: "task_priority" }),
    task_priority_vs_time_priority: () => ({ type: "task_priority" }),
    circuito_cooperativo: () => ({ type: "circuito_cooperativo" }),
  };
}

/**
 * Get default format parameters for a given format name
 *
 * Uses an explicit map for O(1) lookup, with substring fallback for
 * format names that don't match exactly.
 */
export function getDefaultFormatParams(
  formatName: string,
  context: FormatParamsContext,
): FormatParams {
  const normalized = formatName.toLowerCase().trim().replace(/\s+/g, "_");
  const map = buildExactMap(context);

  // Exact match first
  if (map[normalized]) {
    return map[normalized]();
  }

  // Substring fallback for unknown/variant names
  if (normalized.includes("amrap") && normalized.includes("series")) {
    return map["amrap_series"]();
  }
  if (normalized.includes("amrap")) {
    return map["amrap"]();
  }
  if (normalized.includes("emom") && normalized.includes("for_time")) {
    return map["emom_+_for_time"]();
  }
  if (normalized.includes("emom")) {
    return map["emom"]();
  }
  if (normalized.includes("tabata")) {
    return map["tabata"]();
  }
  if (normalized.includes("interval") || normalized.includes("hiit")) {
    return map["interval_training"]();
  }
  if (normalized.includes("for_time")) {
    return map["for_time"]();
  }
  if (normalized.includes("death_by") && normalized.includes("unbroken")) {
    return map["death_by_unbroken"]();
  }
  if (normalized.includes("death_by")) {
    return map["death_by"]();
  }
  if (normalized.includes("broken_ladder")) {
    return map["broken_ladder"]();
  }
  if (normalized.includes("ladder_block")) {
    return map["ladder_block"]();
  }
  if (normalized.includes("ladder")) {
    return map["ladder"]();
  }
  if (normalized.includes("buy") || normalized.includes("cash")) {
    return map["buy-in_/_cash-out"]();
  }
  if (normalized.includes("i_go") || normalized.includes("i go")) {
    return map["i_go,_you_go"]();
  }
  if (normalized.includes("cluster")) {
    return map["cluster"]();
  }
  if (normalized.includes("complex")) {
    return map["complex"]();
  }
  if (normalized.includes("combo")) {
    return map["combos"]();
  }
  if (normalized.includes("stretch")) {
    return map["stretching"]();
  }
  if (normalized.includes("tempo")) {
    return map["tempo_sets"]();
  }
  if (normalized.includes("time_cap")) {
    return map["time_cap"]();
  }
  if (normalized.includes("for_max") && normalized.includes("reps")) {
    return map["for_max_(reps)"]();
  }
  if (normalized.includes("for_max") && normalized.includes("carga")) {
    return map["for_max_(carga)"]();
  }
  if (normalized.includes("for_max")) {
    return map["for_max_(reps)"]();
  }
  if (normalized.includes("unbroken")) {
    return map["unbroken_reps"]();
  }
  if (normalized.includes("chipper")) {
    return map["chipper"]();
  }
  if (normalized.includes("accumulate")) {
    return map["accumulate_x"]();
  }

  return { type: "standard" };
}

// =============================================================================
// Helper Functions
// =============================================================================

// =============================================================================
// Pattern Preview Generators
// =============================================================================

export function generatePyramidPattern(step: number, peak: number): string {
  const up: number[] = [];
  for (let i = step; i <= peak; i += step) up.push(i);
  const down = up.slice(0, -1).reverse();
  return [...up, ...down].join("-");
}

export function generateLadderPattern(
  start: number,
  step: number,
  rounds: number,
  direction: "ascending" | "descending",
): string {
  const values: number[] = [];
  for (let i = 0; i < rounds; i++) {
    values.push(
      direction === "ascending" ? start + i * step : start - i * step,
    );
  }
  return values.join("-");
}

export function generateLadderBlockPattern(
  start: number,
  step: number,
  blockSize: number,
  direction: "ascending" | "descending",
  levels = 4,
): string {
  const parts: string[] = [];
  for (let i = 0; i < levels; i++) {
    const reps =
      direction === "ascending" ? start + i * step : start - i * step;
    parts.push(`${reps}x${blockSize}`);
  }
  return parts.join("-") + "...";
}

export function generateBrokenLadderPattern(
  start: number,
  step: number,
  breakAfter: number,
  direction: "ascending" | "descending",
): string {
  const segments: string[] = [];
  for (let seg = 0; seg < 2; seg++) {
    const values: number[] = [];
    for (let i = 0; i < breakAfter; i++) {
      values.push(
        direction === "ascending" ? start + i * step : start - i * step,
      );
    }
    segments.push(values.join("-"));
  }
  return segments.join(" | ") + " | ...";
}

/**
 * Generate human-readable label from FormatParams
 */
export function formatParamsLabel(params: FormatParams): string {
  switch (params.type) {
    // Time-based
    case "amrap":
      return `AMRAP - ${params.minutes} min`;
    case "amrap_series":
      return `AMRAP Series - ${params.minutes} min x ${params.rounds} rondas`;
    case "emom":
      return `EMOM - ${params.intervalSeconds}s / ${params.totalMinutes} min total`;
    case "tabata":
      return `Tabata - ${params.workSeconds}s/${params.restSeconds}s x ${params.rounds} rondas`;
    case "interval":
      return `HIIT - ${params.workSeconds}s/${params.restSeconds}s x ${params.rounds} rondas`;
    case "hiit":
      return `HIIT - ${params.workSeconds}s/${params.restSeconds}s x ${params.rounds} rondas`;
    case "time_cap":
      return `Time Cap - ${params.minutes} min`;
    case "every_x_seconds":
      return `E${params.intervalSeconds}s - ${params.totalMinutes} min total`;
    case "on_the_x":
      return `On the ${Math.floor(params.intervalSeconds / 60)}:00 - ${params.rounds} rondas`;
    case "for_time":
      return params.timeCapMinutes
        ? `For Time - ${params.timeCapMinutes} min cap`
        : "For Time";
    case "for_max_tiempo":
      return "For Max (Tiempo)";

    // Volume-based
    case "chipper":
      return "Chipper";
    case "death_by":
      return "Death By";
    case "death_by_unbroken":
      return "Death By Unbroken";
    case "ladder":
      return `Ladder ${params.direction === "ascending" ? "↑" : "↓"} — ${generateLadderPattern(params.start, params.step, params.rounds, params.direction)}`;
    case "ladder_block":
      return `Ladder Block ${params.direction === "ascending" ? "↑" : "↓"} — ${generateLadderBlockPattern(params.start, params.step, params.blockSize, params.direction)}`;
    case "ladder_corta":
      return `Ladder Corta ${params.direction === "ascending" ? "↑" : "↓"} — ${generateLadderPattern(params.start, params.step, params.rounds, params.direction)}`;
    case "pyramid":
      return params.step && params.peak
        ? `Pyramid — ${generatePyramidPattern(params.step, params.peak)}`
        : "Pyramid";
    case "accumulate":
      return `Acumular ${params.target} ${params.unit}`;
    case "for_max_reps":
      return params.timeCapMinutes
        ? `For Max Reps - ${params.timeCapMinutes} min`
        : "For Max Reps";
    case "for_max_carga":
      return "For Max (Carga)";
    case "for_max_distancia":
      return params.timeCapMinutes
        ? `For Max (Distancia) - ${params.timeCapMinutes} min`
        : "For Max (Distancia)";
    case "unbroken_reps":
      return "Unbroken Reps";
    case "unbroken_chipper":
      return "Unbroken Chipper";
    case "ub_test":
      return "UB Test";

    // ROM
    case "rom":
      return `ROM - ${params.rounds} rondas - ${params.restSeconds}s descanso`;

    // Technical
    case "complex":
      return `Complex - ${params.rounds} rondas`;
    case "combos":
      return `Combos - ${params.rounds} rondas`;
    case "for_quality":
      return `For Quality - ${params.rounds} rondas`;
    case "for_tech":
      return `For Tech - ${params.minutes} min`;
    case "tempo_sets":
      return `Tempo Sets - ${params.tempo}`;
    case "flow_guiado":
      return "Flow Guiado";
    case "stretching":
      return "Stretching";
    case "cluster":
      return `Cluster - ${params.clusterSize} reps, ${params.restBetweenClusters}s rest`;

    // Structure-based
    case "rounds_for_time":
      return params.timeCapMinutes
        ? `${params.rounds} RFT - ${params.timeCapMinutes} min cap`
        : `${params.rounds} Rounds for Time`;
    case "couplet":
      return "Couplet";
    case "triplet":
      return "Triplet";
    case "singlet":
      return "Singlet";
    case "benchmark_wod":
      return "Benchmark WOD";
    case "hero_wod":
      return "Hero WOD";
    case "buy_in_cash_out":
      return params.rounds
        ? `Buy-in/Cash-out - ${params.rounds} rondas`
        : "Buy-in/Cash-out";
    case "i_go_you_go":
      return params.totalRounds
        ? `I Go, You Go - ${params.totalRounds} rondas`
        : "I Go, You Go";
    case "floater_wod":
      return "Floater WOD";
    case "acropolis":
      return `Acropolis - ${params.phases} fases`;

    // Hybrid
    case "wave_loading":
      return `Wave Loading - ${params.waves} ondas`;
    case "drop_set":
      return `Drop Set - ${params.drops} drops`;
    case "rest_pause":
      return `Rest-Pause - ${params.pauseSeconds}s`;
    case "open_style":
      return params.minutes
        ? `Open Style - ${params.minutes} min`
        : "Open Style";
    case "emom_for_time":
      return `EMOM ${params.emomMinutes}' (${params.intervalSeconds}s) + For Time`;
    case "broken_ladder":
      return `Broken Ladder ${params.direction === "ascending" ? "↑" : "↓"} — ${generateBrokenLadderPattern(params.start, params.step, params.breakAfter, params.direction)}`;
    case "task_priority":
      return "Task Priority";
    case "circuito_cooperativo":
      return "Circuito Cooperativo";

    // Fallback
    case "standard":
      return "Standard";

    default: {
      const _exhaustive: never = params;
      return String((_exhaustive as { type: string }).type || "Unknown");
    }
  }
}
