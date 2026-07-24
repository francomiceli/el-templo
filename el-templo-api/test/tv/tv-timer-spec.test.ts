import { describe, it, expect } from "vitest";
import type { FormatParams } from "../../src/modules/admin/format-params";
import { toTimerSpec } from "../../src/modules/tv/timer-spec";
import type { TimerSpec } from "../../src/modules/tv/types";

/**
 * Pure unit test (no createTestApp / no MySQL): `toTimerSpec` is the whole
 * Pattern 5 normalization of phase 164 — the ~50 variants of `FormatParams`
 * collapsing into the 4 shapes the branch TV can render.
 *
 * This is the only automated coverage the timer logic will ever get: the kiosk
 * bundle has no test runner, so anything not asserted here ships blind to a TV
 * hanging on a wall in a branch.
 */

const VALID_KINDS = ["work_rest", "interval", "countdown", "countup"];

/**
 * One sample per variant of the union. Typed as `Record<FormatParams["type"],
 * ...>` on purpose: if someone adds a format to the catalog, THIS object fails
 * to compile too, not only the `never` guard inside `toTimerSpec`.
 */
const SAMPLES: Record<FormatParams["type"], FormatParams> = {
  amrap: { type: "amrap", minutes: 12 },
  amrap_series: { type: "amrap_series", minutes: 5, rounds: 3 },
  emom: { type: "emom", intervalSeconds: 60, totalMinutes: 10 },
  tabata: { type: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 },
  interval: { type: "interval", workSeconds: 30, restSeconds: 30, rounds: 6 },
  hiit: { type: "hiit", workSeconds: 40, restSeconds: 20, rounds: 5 },
  time_cap: { type: "time_cap", minutes: 15 },
  every_x_seconds: {
    type: "every_x_seconds",
    intervalSeconds: 90,
    totalMinutes: 9,
  },
  on_the_x: { type: "on_the_x", intervalSeconds: 120, rounds: 5 },
  for_time: { type: "for_time" },
  for_max_tiempo: { type: "for_max_tiempo" },
  chipper: { type: "chipper" },
  death_by: { type: "death_by" },
  death_by_unbroken: { type: "death_by_unbroken" },
  ladder: {
    type: "ladder",
    direction: "ascending",
    start: 1,
    step: 1,
    rounds: 5,
  },
  ladder_block: {
    type: "ladder_block",
    direction: "descending",
    start: 10,
    step: 2,
    blockSize: 3,
  },
  ladder_corta: {
    type: "ladder_corta",
    direction: "ascending",
    start: 2,
    step: 2,
    rounds: 4,
  },
  pyramid: { type: "pyramid", step: 2, peak: 10 },
  accumulate: { type: "accumulate", target: 100, unit: "reps" },
  for_max_reps: { type: "for_max_reps" },
  for_max_carga: { type: "for_max_carga" },
  for_max_distancia: { type: "for_max_distancia" },
  unbroken_reps: { type: "unbroken_reps" },
  unbroken_chipper: { type: "unbroken_chipper" },
  ub_test: { type: "ub_test" },
  rom: { type: "rom", rounds: 4, restSeconds: 45 },
  complex: { type: "complex", rounds: 3 },
  combos: { type: "combos", rounds: 3 },
  for_quality: { type: "for_quality", rounds: 3 },
  for_tech: { type: "for_tech", minutes: 8 },
  tempo_sets: { type: "tempo_sets", tempo: "3-1-1-0" },
  flow_guiado: { type: "flow_guiado" },
  stretching: { type: "stretching" },
  cluster: { type: "cluster", clusterSize: 3, restBetweenClusters: 20 },
  rounds_for_time: { type: "rounds_for_time", rounds: 5 },
  couplet: { type: "couplet" },
  triplet: { type: "triplet" },
  singlet: { type: "singlet" },
  benchmark_wod: { type: "benchmark_wod" },
  hero_wod: { type: "hero_wod" },
  buy_in_cash_out: { type: "buy_in_cash_out" },
  i_go_you_go: { type: "i_go_you_go" },
  floater_wod: { type: "floater_wod" },
  acropolis: { type: "acropolis", phases: 3 },
  wave_loading: { type: "wave_loading", waves: 3 },
  drop_set: { type: "drop_set", drops: 3 },
  rest_pause: { type: "rest_pause", pauseSeconds: 15 },
  open_style: { type: "open_style" },
  emom_for_time: {
    type: "emom_for_time",
    emomMinutes: 12,
    intervalSeconds: 60,
  },
  broken_ladder: {
    type: "broken_ladder",
    direction: "ascending",
    start: 1,
    step: 1,
    breakAfter: 3,
  },
  task_priority: { type: "task_priority" },
  circuito_cooperativo: { type: "circuito_cooperativo" },
  standard: { type: "standard" },
};

describe("toTimerSpec — work_rest family (tabata / interval / hiit)", () => {
  it("maps tabata work/rest/rounds to milliseconds", () => {
    expect(toTimerSpec(SAMPLES.tabata)).toEqual<TimerSpec>({
      kind: "work_rest",
      workMs: 20_000,
      restMs: 10_000,
      rounds: 8,
    });
  });

  it("maps interval with the same shape as tabata", () => {
    expect(toTimerSpec(SAMPLES.interval)).toEqual<TimerSpec>({
      kind: "work_rest",
      workMs: 30_000,
      restMs: 30_000,
      rounds: 6,
    });
  });

  it("maps hiit with the same shape as tabata", () => {
    expect(toTimerSpec(SAMPLES.hiit)).toEqual<TimerSpec>({
      kind: "work_rest",
      workMs: 40_000,
      restMs: 20_000,
      rounds: 5,
    });
  });

  it("degrades to countup when the whole cycle collapses to zero", () => {
    // Protects phaseAt from a zero-length cycle (division by zero).
    expect(
      toTimerSpec({
        type: "tabata",
        workSeconds: 0,
        restSeconds: 0,
        rounds: 8,
      }),
    ).toEqual<TimerSpec>({ kind: "countup" });
  });
});

describe("toTimerSpec — rom (Saturday, D-23)", () => {
  it("maps rom to work_rest with workMs = 0 (free work, prescribed rest)", () => {
    expect(toTimerSpec(SAMPLES.rom)).toEqual<TimerSpec>({
      kind: "work_rest",
      workMs: 0,
      restMs: 45_000,
      rounds: 4,
    });
  });

  it("degrades to countup when rom has no rest either", () => {
    expect(
      toTimerSpec({ type: "rom", rounds: 4, restSeconds: 0 }),
    ).toEqual<TimerSpec>({ kind: "countup" });
  });
});

describe("toTimerSpec — interval family (emom / every_x_seconds / on_the_x)", () => {
  it("derives emom rounds from totalMinutes / intervalSeconds", () => {
    expect(toTimerSpec(SAMPLES.emom)).toEqual<TimerSpec>({
      kind: "interval",
      intervalMs: 60_000,
      rounds: 10,
    });
  });

  it("derives every_x_seconds rounds the same way (90s over 9 min = 6)", () => {
    expect(toTimerSpec(SAMPLES.every_x_seconds)).toEqual<TimerSpec>({
      kind: "interval",
      intervalMs: 90_000,
      rounds: 6,
    });
  });

  it("uses the declared rounds for on_the_x", () => {
    expect(toTimerSpec(SAMPLES.on_the_x)).toEqual<TimerSpec>({
      kind: "interval",
      intervalMs: 120_000,
      rounds: 5,
    });
  });

  it("maps emom_for_time using emomMinutes as the total", () => {
    expect(toTimerSpec(SAMPLES.emom_for_time)).toEqual<TimerSpec>({
      kind: "interval",
      intervalMs: 60_000,
      rounds: 12,
    });
  });

  it("never derives fewer than 1 round", () => {
    expect(
      toTimerSpec({ type: "emom", intervalSeconds: 60, totalMinutes: 0 }),
    ).toEqual<TimerSpec>({ kind: "interval", intervalMs: 60_000, rounds: 1 });
  });
});

describe("toTimerSpec — countdown family (amrap / amrap_series / time_cap)", () => {
  it("maps amrap minutes to a total countdown", () => {
    expect(toTimerSpec(SAMPLES.amrap)).toEqual<TimerSpec>({
      kind: "countdown",
      totalMs: 720_000,
    });
  });

  it("maps amrap_series by its minutes (rounds are coach-paced)", () => {
    expect(toTimerSpec(SAMPLES.amrap_series)).toEqual<TimerSpec>({
      kind: "countdown",
      totalMs: 300_000,
    });
  });

  it("maps time_cap minutes to a total countdown", () => {
    expect(toTimerSpec(SAMPLES.time_cap)).toEqual<TimerSpec>({
      kind: "countdown",
      totalMs: 900_000,
    });
  });
});

describe("toTimerSpec — optional time cap", () => {
  it("death_by without cap counts up", () => {
    expect(toTimerSpec(SAMPLES.death_by)).toEqual<TimerSpec>({
      kind: "countup",
    });
  });

  it("death_by with cap counts the cap down", () => {
    expect(
      toTimerSpec({ type: "death_by", timeCapMinutes: 20 }),
    ).toEqual<TimerSpec>({ kind: "countdown", totalMs: 1_200_000 });
  });

  it("for_time without cap counts up", () => {
    expect(toTimerSpec(SAMPLES.for_time)).toEqual<TimerSpec>({
      kind: "countup",
    });
  });

  it("for_time with cap counts the cap down", () => {
    expect(
      toTimerSpec({ type: "for_time", timeCapMinutes: 12 }),
    ).toEqual<TimerSpec>({ kind: "countdown", totalMs: 720_000 });
  });

  it("rounds_for_time with cap counts the cap down", () => {
    expect(
      toTimerSpec({ type: "rounds_for_time", rounds: 5, timeCapMinutes: 18 }),
    ).toEqual<TimerSpec>({ kind: "countdown", totalMs: 1_080_000 });
  });
});

describe("toTimerSpec — free stopwatch", () => {
  it("standard counts up", () => {
    expect(toTimerSpec(SAMPLES.standard)).toEqual<TimerSpec>({
      kind: "countup",
    });
  });

  it("a block without params counts up", () => {
    expect(toTimerSpec(null)).toEqual<TimerSpec>({ kind: "countup" });
  });
});

describe("toTimerSpec — exhaustiveness and sanitization (T-164-06)", () => {
  it("maps every variant of FormatParams to one of the 4 shapes", () => {
    const types = Object.keys(SAMPLES) as FormatParams["type"][];
    expect(types.length).toBeGreaterThan(45);

    for (const type of types) {
      const spec = toTimerSpec(SAMPLES[type]);
      expect(VALID_KINDS, `${type} produced kind "${spec.kind}"`).toContain(
        spec.kind,
      );
    }
  });

  it("never produces NaN, negative milliseconds or fewer than 1 round", () => {
    const corrupt: FormatParams[] = [
      { type: "tabata", workSeconds: -20, restSeconds: 10, rounds: -3 },
      {
        type: "interval",
        workSeconds: Number.NaN,
        restSeconds: 30,
        rounds: Number.NaN,
      },
      { type: "amrap", minutes: -5 },
      { type: "emom", intervalSeconds: -60, totalMinutes: 10 },
      {
        type: "on_the_x",
        intervalSeconds: Number.POSITIVE_INFINITY,
        rounds: 5,
      },
      { type: "rom", rounds: 0, restSeconds: -1 },
    ];

    for (const params of corrupt) {
      const spec = toTimerSpec(params);
      expect(VALID_KINDS).toContain(spec.kind);
      if (spec.kind === "work_rest") {
        expect(spec.workMs).toBeGreaterThanOrEqual(0);
        expect(spec.restMs).toBeGreaterThanOrEqual(0);
        expect(spec.rounds).toBeGreaterThanOrEqual(1);
      }
      if (spec.kind === "interval") {
        expect(spec.intervalMs).toBeGreaterThan(0);
        expect(spec.rounds).toBeGreaterThanOrEqual(1);
      }
      if (spec.kind === "countdown") {
        expect(spec.totalMs).toBeGreaterThan(0);
      }
      // Nothing above may be NaN.
      for (const value of Object.values(spec)) {
        if (typeof value === "number") expect(Number.isNaN(value)).toBe(false);
      }
    }
  });
});
