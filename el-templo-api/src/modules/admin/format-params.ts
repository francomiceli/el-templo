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
 * Display-name overrides applied before params are appended.
 *
 * ESPEJO A PROPOSITO de `displayFormatName` en
 * `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — misma regla,
 * misma razon (DB dice "Interval Training", el impreso/TV dicen "HIIT").
 */
function displayFormatName(name: string): string {
  if (name.toLowerCase() === "interval training") return "HIIT";
  // AMRAP y AMRAP Series se muestran ambos como "AMRAP": el "X<n>" de series ya
  // los distingue en los params, sin la palabra "SERIES" redundante.
  if (name.toLowerCase().includes("amrap")) return "AMRAP";
  return name;
}

/**
 * Compact block-title label: format name + params in the PDF's terse
 * notation (e.g. "AMRAP SERIES 10' X3", "TABATA 20"/10"", "EMOM 10' (60")").
 *
 * ESPEJO A PROPOSITO, CASO POR CASO, de `formatNameWithParams` en
 * `el-templo-admin/src/utils/pdf/session-data-transformer.ts` (la funcion que
 * arma el mismo texto para el PDF de planis). El TV y el PDF tienen que
 * mostrar exactamente lo mismo para el mismo bloque — cualquier cambio en la
 * funcion del PDF REQUIERE el cambio espejo aca, y viceversa.
 *
 * Tipos de `FormatParams` sin caso propio en el switch del PDF (chipper,
 * unbroken_reps, unbroken_chipper, ub_test, for_max_carga, for_max_tiempo,
 * flow_guiado, stretching, couplet, triplet, singlet, benchmark_wod,
 * hero_wod, floater_wod, task_priority, circuito_cooperativo, standard) caen
 * en el `default` de esa funcion, que devuelve el nombre tal cual — acá se
 * listan explicitamente con el mismo resultado para mantener el switch
 * exhaustivo.
 */
export function formatNameWithParams(
  formatName: string,
  formatParams: FormatParams | null,
): string {
  const name = displayFormatName(formatName);
  if (!formatParams) return name;

  switch (formatParams.type) {
    // Minutes-only formats
    case "amrap":
    case "time_cap":
    case "for_tech":
      return formatParams.minutes ? `${name} ${formatParams.minutes}'` : name;

    // Open Style: el tiempo lo decide el profe sobre la marcha — nunca se
    // imprime, aunque bloques viejos tengan minutes guardado en formatParams.
    case "open_style":
      return name;

    case "amrap_series": {
      const parts = [name];
      if (formatParams.minutes) parts.push(`${formatParams.minutes}'`);
      if (formatParams.rounds) parts.push(`X${formatParams.rounds}`);
      return parts.join(" ");
    }

    // EMOM-shape formats (intervalSeconds + totalMinutes)
    case "emom":
    case "every_x_seconds": {
      const parts = [name];
      if (formatParams.totalMinutes) parts.push(`${formatParams.totalMinutes}'`);
      if (formatParams.intervalSeconds)
        parts.push(`(${formatParams.intervalSeconds}")`);
      return parts.join(" ");
    }

    // On the X:00 (intervalSeconds + rounds)
    case "on_the_x": {
      const mins = Math.floor(formatParams.intervalSeconds / 60);
      return formatParams.rounds
        ? `${name} ${mins}:00 X${formatParams.rounds}`
        : name;
    }

    // Death By (optional time cap)
    case "death_by":
    case "death_by_unbroken":
      return formatParams.timeCapMinutes
        ? `${name} ${formatParams.timeCapMinutes}'`
        : name;

    // ROM: la etiqueta es solo el nombre del formato ("ROM"). Las rondas/hold
    // son parámetros informativos que NO van en el título del bloque (TV/PDF).
    // (Espejo en session-data-transformer.ts del admin.)
    case "rom":
      return name;

    // Rounds-only formats
    case "complex":
    case "combos":
    case "for_quality":
      return formatParams.rounds ? `${name} X${formatParams.rounds}` : name;

    // Tabata: las rondas son fijas y no se imprimen (ver espejo del PDF).
    case "tabata":
      return formatParams.workSeconds && formatParams.restSeconds
        ? `${name} ${formatParams.workSeconds}"/${formatParams.restSeconds}"`
        : name;

    // Work/rest/rounds formats — acá las rondas SÍ las configura el coach
    case "interval":
    case "hiit": {
      const parts = [name];
      if (formatParams.workSeconds && formatParams.restSeconds)
        parts.push(`${formatParams.workSeconds}"/${formatParams.restSeconds}"`);
      if (formatParams.rounds) parts.push(`X${formatParams.rounds}`);
      return parts.join(" ");
    }

    // Optional time cap formats
    case "for_time":
    case "for_max_reps":
    case "for_max_distancia":
      return formatParams.timeCapMinutes
        ? `${name} ${formatParams.timeCapMinutes}'`
        : name;

    // Rounds for Time (rounds + optional cap)
    case "rounds_for_time": {
      const parts = [`${formatParams.rounds || 5} RFT`];
      if (formatParams.timeCapMinutes) parts.push(`${formatParams.timeCapMinutes}'`);
      return parts.join(" ");
    }

    // Pyramid — per-exercise params now, no block-level pattern
    case "pyramid":
      return name;

    // Ladder formats: name only, per-exercise patterns shown on each exercise line
    case "ladder":
    case "ladder_corta":
    case "ladder_block":
    case "broken_ladder":
      return name;

    // No-params formats — name only
    case "cluster":
    case "accumulate":
    case "buy_in_cash_out":
      return name;

    // Tempo
    case "tempo_sets":
      return formatParams.tempo ? `${name} ${formatParams.tempo}` : name;

    // I Go, You Go: sin rondas en la etiqueta — el coach no las elige (las
    // cantidades van en las reps por ejercicio). Nombre solo.
    case "i_go_you_go":
      return name;

    // Wave Loading
    case "wave_loading":
      return formatParams.waves ? `${name} ${formatParams.waves} ondas` : name;

    // Drop Set
    case "drop_set":
      return formatParams.drops ? `${name} ${formatParams.drops} drops` : name;

    // Rest-Pause
    case "rest_pause":
      return formatParams.pauseSeconds ? `${name} ${formatParams.pauseSeconds}"` : name;

    // EMOM + For Time hybrid
    case "emom_for_time": {
      const parts = [name];
      if (formatParams.emomMinutes) parts.push(`${formatParams.emomMinutes}'`);
      if (formatParams.intervalSeconds)
        parts.push(`(${formatParams.intervalSeconds}")`);
      return parts.join(" ");
    }

    // Acropolis
    case "acropolis":
      return formatParams.phases ? `${name} ${formatParams.phases} fases` : name;

    // Sin caso propio en el PDF (caen en su `default` → name tal cual).
    case "for_max_tiempo":
    case "chipper":
    case "for_max_carga":
    case "unbroken_reps":
    case "unbroken_chipper":
    case "ub_test":
    case "flow_guiado":
    case "stretching":
    case "couplet":
    case "triplet":
    case "singlet":
    case "benchmark_wod":
    case "hero_wod":
    case "floater_wod":
    case "task_priority":
    case "circuito_cooperativo":
    case "standard":
      return name;

    default: {
      const _exhaustive: never = formatParams;
      return String((_exhaustive as { type: string }).type || name);
    }
  }
}
