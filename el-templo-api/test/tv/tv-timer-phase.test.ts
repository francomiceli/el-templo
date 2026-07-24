import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FormatParams } from "../../src/modules/admin/format-params";
import { toTimerSpec } from "../../src/modules/tv/timer-spec";
import { phaseAt } from "../../src/modules/tv/timer-phase";
import type { TimerSpec, TvTimerPhase } from "../../src/modules/tv/types";

/**
 * Pure unit test (no createTestApp / no MySQL) for the timer arithmetic, plus
 * the emission of the golden vectors the kiosk replays on the real TV.
 *
 * Two jobs:
 *
 *  1. Assert the exact transition borders (t = 0, 1 ms before and after every
 *     transition, last round, past the end) for the 4 shapes of `TimerSpec`.
 *  2. Emit `__fixtures__/timer-vectors.json` from the SAME expectations that
 *     were just asserted. The kiosk has no test runner: it loads that file with
 *     `?selftest=1` and re-runs its own port of `phaseAt` against it, which is
 *     the only automated verification that ever runs on the TV hardware. The
 *     file is generated here so the committed fixture and the implementation
 *     cannot drift apart.
 */

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "timer-vectors.json",
);

interface GoldenSample {
  elapsedMs: number;
  phase: TvTimerPhase;
  displayMs: number;
  round: number;
  totalRounds: number;
  finished: boolean;
}

interface GoldenVector {
  name: string;
  params: FormatParams | null;
  spec: TimerSpec;
  samples: GoldenSample[];
}

/**
 * The golden vectors. Every number here is hand-derived from the format
 * definition, NOT copied from an implementation run — that is what makes them
 * a regression net instead of a snapshot of whatever the code does today.
 */
const VECTORS: GoldenVector[] = [
  {
    name: "tabata 20s/10s x8",
    params: { type: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 },
    spec: { kind: "work_rest", workMs: 20_000, restMs: 10_000, rounds: 8 },
    samples: [
      // arranque: TRABAJO con los 20" completos
      {
        elapsedMs: 0,
        phase: "work",
        displayMs: 20_000,
        round: 1,
        totalRounds: 8,
        finished: false,
      },
      // 1 ms antes del cambio a DESCANSO
      {
        elapsedMs: 19_999,
        phase: "work",
        displayMs: 1,
        round: 1,
        totalRounds: 8,
        finished: false,
      },
      // borde exacto: entra DESCANSO con los 10" completos
      {
        elapsedMs: 20_000,
        phase: "rest",
        displayMs: 10_000,
        round: 1,
        totalRounds: 8,
        finished: false,
      },
      // borde exacto del ciclo: ronda 2
      {
        elapsedMs: 30_000,
        phase: "work",
        displayMs: 20_000,
        round: 2,
        totalRounds: 8,
        finished: false,
      },
      // ultimo milisegundo de la ronda 8
      {
        elapsedMs: 239_999,
        phase: "rest",
        displayMs: 1,
        round: 8,
        totalRounds: 8,
        finished: false,
      },
      // BLOQUE COMPLETO
      {
        elapsedMs: 240_000,
        phase: "done",
        displayMs: 0,
        round: 8,
        totalRounds: 8,
        finished: true,
      },
    ],
  },
  {
    name: "emom 60s x 10min",
    params: { type: "emom", intervalSeconds: 60, totalMinutes: 10 },
    spec: { kind: "interval", intervalMs: 60_000, rounds: 10 },
    samples: [
      {
        elapsedMs: 0,
        phase: "work",
        displayMs: 60_000,
        round: 1,
        totalRounds: 10,
        finished: false,
      },
      {
        elapsedMs: 59_999,
        phase: "work",
        displayMs: 1,
        round: 1,
        totalRounds: 10,
        finished: false,
      },
      {
        elapsedMs: 60_000,
        phase: "work",
        displayMs: 60_000,
        round: 2,
        totalRounds: 10,
        finished: false,
      },
      {
        elapsedMs: 599_999,
        phase: "work",
        displayMs: 1,
        round: 10,
        totalRounds: 10,
        finished: false,
      },
      {
        elapsedMs: 600_000,
        phase: "done",
        displayMs: 0,
        round: 10,
        totalRounds: 10,
        finished: true,
      },
    ],
  },
  {
    name: "on the 2:00 x5",
    params: { type: "on_the_x", intervalSeconds: 120, rounds: 5 },
    spec: { kind: "interval", intervalMs: 120_000, rounds: 5 },
    samples: [
      {
        elapsedMs: 0,
        phase: "work",
        displayMs: 120_000,
        round: 1,
        totalRounds: 5,
        finished: false,
      },
      {
        elapsedMs: 120_000,
        phase: "work",
        displayMs: 120_000,
        round: 2,
        totalRounds: 5,
        finished: false,
      },
      {
        elapsedMs: 125_000,
        phase: "work",
        displayMs: 115_000,
        round: 2,
        totalRounds: 5,
        finished: false,
      },
      {
        elapsedMs: 600_000,
        phase: "done",
        displayMs: 0,
        round: 5,
        totalRounds: 5,
        finished: true,
      },
    ],
  },
  {
    name: "amrap 12min",
    params: { type: "amrap", minutes: 12 },
    spec: { kind: "countdown", totalMs: 720_000 },
    samples: [
      {
        elapsedMs: 0,
        phase: "run",
        displayMs: 720_000,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      {
        elapsedMs: 1,
        phase: "run",
        displayMs: 719_999,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      {
        elapsedMs: 719_999,
        phase: "run",
        displayMs: 1,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      {
        elapsedMs: 720_000,
        phase: "done",
        displayMs: 0,
        round: 1,
        totalRounds: 1,
        finished: true,
      },
    ],
  },
  {
    name: "for time sin cap (cronometro libre)",
    params: { type: "for_time" },
    spec: { kind: "countup" },
    samples: [
      // guard de reloj corrido (Pitfall 8): negativo colapsa a 0
      {
        elapsedMs: -1_000,
        phase: "run",
        displayMs: 0,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      {
        elapsedMs: 0,
        phase: "run",
        displayMs: 0,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      {
        elapsedMs: 1_000,
        phase: "run",
        displayMs: 1_000,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
      // nunca termina: el profe avanza de bloque a mano
      {
        elapsedMs: 3_600_000,
        phase: "run",
        displayMs: 3_600_000,
        round: 1,
        totalRounds: 1,
        finished: false,
      },
    ],
  },
  {
    name: "rom 4 rondas / 45s de descanso (sabado)",
    params: { type: "rom", rounds: 4, restSeconds: 45 },
    spec: { kind: "work_rest", workMs: 0, restMs: 45_000, rounds: 4 },
    samples: [
      // workMs = 0: la fase se queda en TRABAJO y los digitos suben
      {
        elapsedMs: 0,
        phase: "work",
        displayMs: 0,
        round: 1,
        totalRounds: 4,
        finished: false,
      },
      {
        elapsedMs: 44_999,
        phase: "work",
        displayMs: 44_999,
        round: 1,
        totalRounds: 4,
        finished: false,
      },
      {
        elapsedMs: 45_000,
        phase: "work",
        displayMs: 0,
        round: 2,
        totalRounds: 4,
        finished: false,
      },
      {
        elapsedMs: 179_999,
        phase: "work",
        displayMs: 44_999,
        round: 4,
        totalRounds: 4,
        finished: false,
      },
      {
        elapsedMs: 180_000,
        phase: "done",
        displayMs: 0,
        round: 4,
        totalRounds: 4,
        finished: true,
      },
    ],
  },
];

function sampleOf(elapsedMs: number, spec: TimerSpec): GoldenSample {
  const frame = phaseAt(elapsedMs, spec);
  return {
    elapsedMs,
    phase: frame.phase,
    displayMs: frame.displayMs,
    round: frame.round,
    totalRounds: frame.totalRounds,
    finished: frame.finished,
  };
}

describe("phaseAt — work_rest (tabata)", () => {
  const spec: TimerSpec = {
    kind: "work_rest",
    workMs: 20_000,
    restMs: 10_000,
    rounds: 8,
  };

  it("starts in TRABAJO with the full work duration", () => {
    expect(phaseAt(0, spec)).toEqual({
      phase: "work",
      displayMs: 20_000,
      round: 1,
      totalRounds: 8,
      progress: 0,
      finished: false,
    });
  });

  it("switches to DESCANSO exactly at workMs, not 1 ms earlier", () => {
    expect(phaseAt(19_999, spec).phase).toBe("work");
    expect(phaseAt(20_000, spec).phase).toBe("rest");
    expect(phaseAt(20_000, spec).displayMs).toBe(10_000);
  });

  it("advances the round exactly at the cycle border", () => {
    expect(phaseAt(29_999, spec).round).toBe(1);
    expect(phaseAt(30_000, spec).round).toBe(2);
    expect(phaseAt(30_000, spec).phase).toBe("work");
  });

  it("stays inside the last round until the very last millisecond", () => {
    expect(phaseAt(239_999, spec)).toMatchObject({
      phase: "rest",
      displayMs: 1,
      round: 8,
      finished: false,
    });
  });

  it("reports BLOQUE COMPLETO once every round elapsed", () => {
    expect(phaseAt(240_000, spec)).toEqual({
      phase: "done",
      displayMs: 0,
      round: 8,
      totalRounds: 8,
      progress: 1,
      finished: true,
    });
    expect(phaseAt(999_999, spec).finished).toBe(true);
  });

  it("counts UP inside the round when workMs is 0 (rom)", () => {
    const rom: TimerSpec = {
      kind: "work_rest",
      workMs: 0,
      restMs: 45_000,
      rounds: 4,
    };
    expect(phaseAt(0, rom)).toMatchObject({
      phase: "work",
      displayMs: 0,
      round: 1,
    });
    expect(phaseAt(44_999, rom)).toMatchObject({
      phase: "work",
      displayMs: 44_999,
      round: 1,
    });
    expect(phaseAt(45_000, rom)).toMatchObject({
      phase: "work",
      displayMs: 0,
      round: 2,
    });
  });

  it("degrades to a stopwatch instead of dividing by a zero-length cycle", () => {
    const broken: TimerSpec = {
      kind: "work_rest",
      workMs: 0,
      restMs: 0,
      rounds: 8,
    };
    expect(phaseAt(5_000, broken)).toMatchObject({
      phase: "run",
      displayMs: 5_000,
      finished: false,
    });
  });
});

describe("phaseAt — interval (emom)", () => {
  const spec: TimerSpec = { kind: "interval", intervalMs: 60_000, rounds: 10 };

  it("counts the interval down and rolls over at the border", () => {
    expect(phaseAt(0, spec)).toMatchObject({ displayMs: 60_000, round: 1 });
    expect(phaseAt(59_999, spec)).toMatchObject({ displayMs: 1, round: 1 });
    expect(phaseAt(60_000, spec)).toMatchObject({
      displayMs: 60_000,
      round: 2,
    });
  });

  it("stays in the work phase for the whole block", () => {
    expect(phaseAt(0, spec).phase).toBe("work");
    expect(phaseAt(300_000, spec).phase).toBe("work");
  });

  it("finishes exactly at intervalMs * rounds", () => {
    expect(phaseAt(599_999, spec).finished).toBe(false);
    expect(phaseAt(600_000, spec)).toMatchObject({
      phase: "done",
      displayMs: 0,
      round: 10,
      finished: true,
    });
  });
});

describe("phaseAt — countdown (amrap)", () => {
  const spec: TimerSpec = { kind: "countdown", totalMs: 720_000 };

  it("counts down from the total", () => {
    expect(phaseAt(0, spec)).toMatchObject({
      phase: "run",
      displayMs: 720_000,
    });
    expect(phaseAt(1, spec).displayMs).toBe(719_999);
    expect(phaseAt(719_999, spec).displayMs).toBe(1);
  });

  it("reports progress over the whole countdown", () => {
    expect(phaseAt(360_000, spec).progress).toBeCloseTo(0.5, 6);
  });

  it("finishes at zero and never goes negative", () => {
    expect(phaseAt(720_000, spec)).toMatchObject({
      phase: "done",
      displayMs: 0,
      finished: true,
    });
    expect(phaseAt(5_000_000, spec).displayMs).toBe(0);
  });
});

describe("phaseAt — countup (formato sin tiempos)", () => {
  const spec: TimerSpec = { kind: "countup" };

  it("counts elapsed time forward and never finishes", () => {
    expect(phaseAt(0, spec)).toEqual({
      phase: "run",
      displayMs: 0,
      round: 1,
      totalRounds: 1,
      progress: 0,
      finished: false,
    });
    expect(phaseAt(3_600_000, spec)).toMatchObject({
      displayMs: 3_600_000,
      finished: false,
    });
  });
});

describe("phaseAt — clock guards (Pitfall 8 / T-164-07)", () => {
  const tabata: TimerSpec = {
    kind: "work_rest",
    workMs: 20_000,
    restMs: 10_000,
    rounds: 8,
  };

  it("collapses a negative elapsed time to the t=0 frame", () => {
    expect(phaseAt(-1, tabata)).toEqual(phaseAt(0, tabata));
    expect(phaseAt(-86_400_000, tabata)).toEqual(phaseAt(0, tabata));
    expect(phaseAt(-5_000, { kind: "countup" }).displayMs).toBe(0);
  });

  it("collapses an elapsed time beyond 24 h to the t=0 frame", () => {
    const overADay = 24 * 60 * 60 * 1000 + 1;
    expect(phaseAt(overADay, tabata)).toEqual(phaseAt(0, tabata));
    expect(phaseAt(overADay, { kind: "countup" }).displayMs).toBe(0);
    expect(phaseAt(overADay, { kind: "countdown", totalMs: 720_000 })).toEqual(
      phaseAt(0, { kind: "countdown", totalMs: 720_000 }),
    );
  });

  it("collapses NaN and Infinity to the t=0 frame", () => {
    expect(phaseAt(Number.NaN, tabata)).toEqual(phaseAt(0, tabata));
    expect(phaseAt(Number.POSITIVE_INFINITY, tabata)).toEqual(
      phaseAt(0, tabata),
    );
  });
});

describe("golden vectors — el selftest del kiosco en el TV real", () => {
  it("toTimerSpec produces the spec declared by every vector", () => {
    for (const vector of VECTORS) {
      expect(toTimerSpec(vector.params), vector.name).toEqual(vector.spec);
    }
  });

  it("phaseAt matches every hand-derived golden sample", () => {
    for (const vector of VECTORS) {
      for (const expected of vector.samples) {
        expect(
          sampleOf(expected.elapsedMs, vector.spec),
          `${vector.name} @ ${expected.elapsedMs}ms`,
        ).toEqual(expected);
      }
    }
  });

  it("emits the fixture the kiosk replays with ?selftest=1", () => {
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(VECTORS, null, 2) + "\n",
      "utf8",
    );

    const onDisk: GoldenVector[] = JSON.parse(
      fs.readFileSync(FIXTURE_PATH, "utf8"),
    );

    // The committed file and the asserted expectations cannot diverge.
    expect(onDisk).toEqual(VECTORS);
    expect(onDisk.length).toBeGreaterThanOrEqual(6);
    for (const vector of onDisk) {
      expect(vector.samples.length, vector.name).toBeGreaterThanOrEqual(4);
      expect(Object.keys(vector).sort()).toEqual([
        "name",
        "params",
        "samples",
        "spec",
      ]);
    }
  });
});
