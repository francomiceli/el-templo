/**
 * Unit tests for the Kairos generation gate (Phase 129, Plan 02)
 *
 * Proves the pipeline injection points (stage-3 budget, stage-5 format,
 * stage-6 exercises) behave correctly for memberLevel='kairos' AND — critically —
 * leave every non-kairos path byte-for-byte unchanged (D-07). The INITIUM
 * pipeline has NO kairos gate: INITIUM is the shared day warmup and must come
 * out identical for every level (asserted below).
 *
 * WHY this is a unit-level (mocked-DB) test, not full end-to-end generation:
 * Full SPOM-seeded session generation is NOT runnable in CI here. The SPOM CSVs
 * live in the git-ignored `.docs/` tree and `seedSPOM()` is mis-pathed, so a real
 * `generateDailySession()` cannot be exercised deterministically. We therefore
 * prove the gate at the same fidelity the existing generation tests use
 * (test/unit/rom-generator.test.ts): mock the DB + the fallback modules and call
 * each gated pipeline function directly, asserting the gate's decisions and the
 * exact arguments it forwards to the selectors. This isolates the kairos branch
 * from content/seed concerns while still proving KAIROS-02/03 + the D-07 invariant.
 *
 * The fallback modules are mocked; the gate functions under test are the REAL
 * implementations from the pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  BlockContextWithSpom,
  BlockContextWithContraction,
  BlockContext,
} from "../../src/modules/sessions/pipeline/context";
import type {
  ExerciseLevel,
  BlockRole,
  ContractionMix,
} from "../../src/modules/sessions/types";
import type { FormatCandidate } from "../../src/modules/sessions/fallback/format-fallback";
import type { ExerciseCandidate } from "../../src/modules/sessions/fallback/exercise-fallback";
import type { FallbackResult } from "../../src/modules/sessions/fallback/types";

// ---------------------------------------------------------------------------
// Mocks for the format/exercise fallback modules.
//
// These let us (a) observe the args the gate forwards, and (b) keep the test
// deterministic without a real DB. The gate functions themselves are real.
// ---------------------------------------------------------------------------

const queryFormatByNameMock =
  vi.fn<(db: unknown, name: string) => Promise<FormatCandidate | null>>();
const selectFormatWithFallbackMock =
  vi.fn<() => Promise<FallbackResult<FormatCandidate>>>();
const queryFormatsAnyLevelMock = vi.fn<() => Promise<FormatCandidate[]>>();
const selectBestFormatMock =
  vi.fn<(candidates: FormatCandidate[]) => FormatCandidate>();

vi.mock("../../src/modules/sessions/fallback/format-fallback", () => ({
  queryFormatByName: (db: unknown, name: string) =>
    queryFormatByNameMock(db, name),
  selectFormatWithFallback: () => selectFormatWithFallbackMock(),
  queryFormatsAnyLevel: () => queryFormatsAnyLevelMock(),
  selectBestFormat: (candidates: FormatCandidate[]) =>
    selectBestFormatMock(candidates),
}));

interface SelectExercisesArgs {
  readonly allowedLevels: readonly string[];
  readonly minDificultadLineal: number;
  readonly maxDificultadLineal: number;
  readonly memberLevel: string;
  readonly route: string;
  readonly count: number;
}

const selectExercisesWithFallbackMock =
  vi.fn<
    (
      req: SelectExercisesArgs,
      db?: unknown,
      policy?: { maxTier: number; relaxationOrder: readonly string[] },
    ) => Promise<FallbackResult<ExerciseCandidate>>
  >();
const selectKairosRescueExercisesMock =
  vi.fn<
    (req: SelectExercisesArgs) => Promise<FallbackResult<ExerciseCandidate>>
  >();
const queryCrossRouteExercisesMock =
  vi.fn<() => Promise<ExerciseCandidate[]>>();

vi.mock("../../src/modules/sessions/fallback/exercise-fallback", () => ({
  // Forward all args (req, db, policy) so tests can assert the kairos tight policy.
  selectExercisesWithFallback: (
    req: SelectExercisesArgs,
    db?: unknown,
    policy?: { maxTier: number; relaxationOrder: readonly string[] },
  ) => selectExercisesWithFallbackMock(req, db, policy),
  selectKairosRescueExercises: (req: SelectExercisesArgs) =>
    selectKairosRescueExercisesMock(req),
  queryCrossRouteExercises: () => queryCrossRouteExercisesMock(),
}));

// A db handle that is never actually touched (all DB access is mocked above).
const FAKE_DB = {} as never;

// ---------------------------------------------------------------------------
// Context builders — minimal, valid contexts for each gated stage.
// ---------------------------------------------------------------------------

function makeSpomCtx(
  memberLevel: ExerciseLevel,
  role: BlockRole = "NUCLEUS",
): BlockContextWithSpom {
  return {
    week: 1,
    day: "lunes",
    levelGroup: "alfa_delta",
    memberLevel,
    blockId: `W1-lunes-${memberLevel}-${role}`,
    role,
    trace: [],
    route: "PUSH",
    intensity: 70,
    pattern: "PUSH",
    pattern2: null,
    category: "Fuerza",
  };
}

function makeContractionCtx(
  memberLevel: ExerciseLevel,
  role: BlockRole = "NUCLEUS",
): BlockContextWithContraction {
  const mix: ContractionMix = { CON: 1, EXC: 0, ISO: 0 };
  return {
    ...makeSpomCtx(memberLevel, role),
    repsBudget: 100,
    exerciseCountMin: 2,
    exerciseCountMax: 3,
    difficultyBucket: "3",
    exerciseCount: 1,
    contractionMix: mix,
  };
}

function makeInitiumCtx(memberLevel: ExerciseLevel): BlockContext {
  return {
    week: 1,
    day: "lunes",
    levelGroup: "alfa_delta",
    memberLevel,
    blockId: `W1-lunes-${memberLevel}-INITIUM`,
    role: "INITIUM",
    trace: [],
  };
}

// Intensity rule shape returned by SpomService.getIntensityRule for stage-3.
const INTENSITY_RULE = {
  id: 1,
  intensity: 70,
  repsBudget: 100,
  exerciseCountMin: 1,
  exerciseCountMax: 3,
  difficulty: "3",
};

function makeSpomService(): {
  getIntensityRule: ReturnType<typeof vi.fn>;
} {
  return {
    getIntensityRule: vi.fn().mockResolvedValue(INTENSITY_RULE),
  };
}

const SINGLET_FORMAT: FormatCandidate = {
  formatId: 42,
  name: "Singlet",
  compatibility: 1,
};
const METCON_FORMAT: FormatCandidate = {
  formatId: 7,
  name: "AMRAP",
  compatibility: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: Singlet exists in the formats table.
  queryFormatByNameMock.mockResolvedValue(SINGLET_FORMAT);
  // Default non-kairos format ladder returns a metcon format.
  selectFormatWithFallbackMock.mockResolvedValue({
    status: "exact",
    data: [METCON_FORMAT],
    tier: 0,
    actions: [],
  });
  // Default exercise selection returns one alfa exercise.
  selectExercisesWithFallbackMock.mockResolvedValue({
    status: "exact",
    data: [
      {
        id: 1,
        name: "Push-up",
        dificultadLineal: 1,
        contraction: "CON",
        position: null,
      },
    ],
    tier: 0,
    actions: [],
  });
});

// ===========================================================================

describe("Kairos gate — isKairos predicate", () => {
  it("returns true only for 'kairos'", async () => {
    const { isKairos } =
      await import("../../src/modules/sessions/pipeline/utils/kairos");
    expect(isKairos("kairos")).toBe(true);
  });

  it("returns false for every other level", async () => {
    const { isKairos } =
      await import("../../src/modules/sessions/pipeline/utils/kairos");
    const others: ExerciseLevel[] = [
      "alfa",
      "delta",
      "sigma",
      "omega",
      "spartan",
    ];
    for (const lvl of others) {
      expect(isKairos(lvl)).toBe(false);
    }
  });
});

describe("Stage-3 budget gate (D-05: 2 exercises per non-INITIUM block)", () => {
  it("forces exactly {min:2, max:2} for a kairos non-INITIUM block", async () => {
    const { deriveBudget } =
      await import("../../src/modules/sessions/pipeline/stage-3-budget");
    const spom = makeSpomService();
    const ctx = await deriveBudget(
      makeSpomCtx("kairos", "NUCLEUS"),
      spom as never,
    );
    expect(ctx.exerciseCountMin).toBe(2);
    expect(ctx.exerciseCountMax).toBe(2);
    // Audit trace emitted for the forced size.
    expect(ctx.trace.some((t) => t.code === "KAIROS_BLOCK_SIZE_FORCED")).toBe(
      true,
    );
  });

  it("leaves the bounds UNCHANGED for an alfa non-INITIUM block (D-07)", async () => {
    const { deriveBudget } =
      await import("../../src/modules/sessions/pipeline/stage-3-budget");
    const spom = makeSpomService();
    const ctx = await deriveBudget(
      makeSpomCtx("alfa", "NUCLEUS"),
      spom as never,
    );
    // Non-INITIUM cap is min(ruleMin,3)/min(ruleMax,3) = 1 / 3 — unchanged.
    expect(ctx.exerciseCountMin).toBe(1);
    expect(ctx.exerciseCountMax).toBe(3);
    expect(ctx.trace.some((t) => t.code === "KAIROS_BLOCK_SIZE_FORCED")).toBe(
      false,
    );
  });
});

describe("Stage-5 format gate: kairos selects format like any other level", () => {
  it("uses the compatibility-matrix ladder for kairos (no linear format forced)", async () => {
    const { selectFormat } =
      await import("../../src/modules/sessions/pipeline/stage-5-format");
    const ctx = await selectFormat(makeContractionCtx("kairos"), FAKE_DB);
    // Kairos goes through the same fallback ladder as alfa — no Singlet forcing.
    expect(selectFormatWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(ctx.format.name).toBe("AMRAP");
    // The by-name linear lookup must NOT run, and no force trace is emitted.
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
    expect(ctx.trace.some((t) => t.code === "KAIROS_FORMAT_FORCED")).toBe(
      false,
    );
  });

  it("uses the compatibility-matrix ladder UNCHANGED for alfa (D-07)", async () => {
    const { selectFormat } =
      await import("../../src/modules/sessions/pipeline/stage-5-format");
    const ctx = await selectFormat(makeContractionCtx("alfa"), FAKE_DB);
    expect(ctx.format.name).toBe("AMRAP");
    expect(selectFormatWithFallbackMock).toHaveBeenCalledTimes(1);
    // The kairos by-name lookup must NOT run for alfa.
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
    expect(ctx.trace.some((t) => t.code === "KAIROS_FORMAT_FORCED")).toBe(
      false,
    );
  });
});

describe("Stage-6 exercise gate (D-03: Alfa exercises at dificultadLineal=1)", () => {
  it("forces allowedLevels=['alfa'] and min=max dificultadLineal=1 for kairos", async () => {
    const { selectExercises } =
      await import("../../src/modules/sessions/pipeline/stage-6-exercises");
    // selectExercises consumes BlockContextWithFormat — extend the contraction ctx.
    const ctx = {
      ...makeContractionCtx("kairos"),
      format: { formatId: 42, name: "Singlet" },
    };
    const result = await selectExercises(ctx, FAKE_DB);

    expect(selectExercisesWithFallbackMock).toHaveBeenCalled();
    const arg = selectExercisesWithFallbackMock.mock.calls[0][0];
    expect(arg.allowedLevels).toEqual(["alfa"]);
    expect(arg.minDificultadLineal).toBe(1);
    expect(arg.maxDificultadLineal).toBe(1);
    expect(arg.memberLevel).toBe("alfa"); // targetLevel forced to alfa
    expect(result.trace.some((t) => t.code === "KAIROS_INHERIT_ALFA")).toBe(
      true,
    );
    // The kairos selection runs a TIGHT policy (maxTier 1) so the generic ladder's
    // Tier-2 difficulty blowout (dl 1..999) can never pull a hard exercise in.
    const policy = selectExercisesWithFallbackMock.mock.calls[0][2];
    expect(policy?.maxTier).toBe(1);
  });

  it("kairos falls back to dificultadLineal=2 ONLY when no dl=1 candidate exists", async () => {
    const { selectExercises } =
      await import("../../src/modules/sessions/pipeline/stage-6-exercises");
    // Pass 1 (dl=1) finds nothing → failed; the code must retry at dl=2 (and never
    // widen past it). Subsequent calls use the default 'exact' from beforeEach.
    selectExercisesWithFallbackMock.mockResolvedValueOnce({
      status: "failed",
      data: [],
      tier: 1,
      actions: [],
    });
    const ctx = {
      ...makeContractionCtx("kairos"),
      format: { formatId: 42, name: "Singlet" },
    };
    await selectExercises(ctx, FAKE_DB);

    // Exactly two passes: dl=1, then dl=2 — both under the tight policy.
    expect(selectExercisesWithFallbackMock).toHaveBeenCalledTimes(2);
    const pass1 = selectExercisesWithFallbackMock.mock.calls[0];
    const pass2 = selectExercisesWithFallbackMock.mock.calls[1];
    expect(pass1[0].minDificultadLineal).toBe(1);
    expect(pass1[0].maxDificultadLineal).toBe(1);
    expect(pass2[0].minDificultadLineal).toBe(2);
    expect(pass2[0].maxDificultadLineal).toBe(2);
    expect(pass1[2]?.maxTier).toBe(1);
    expect(pass2[2]?.maxTier).toBe(1);
    // dl=2 succeeded — the rescue selector must NOT run.
    expect(selectKairosRescueExercisesMock).not.toHaveBeenCalled();
  });

  it("kairos calls the rescue selector (dl 1-2 strict) when both dl=1 and dl=2 fail", async () => {
    const { selectExercises } =
      await import("../../src/modules/sessions/pipeline/stage-6-exercises");
    // Both tight passes fail (route has no alfa dl 1-2 content — the FLR case).
    selectExercisesWithFallbackMock.mockResolvedValue({
      status: "failed",
      data: [],
      tier: 1,
      actions: [],
    });
    // The rescue finds a same-family candidate from another route.
    selectKairosRescueExercisesMock.mockResolvedValue({
      status: "fallback",
      data: [
        {
          id: 9,
          name: "Row Inclined",
          dificultadLineal: 1,
          contraction: "CON",
          position: null,
        },
      ],
      tier: 1,
      actions: [
        {
          type: "CATEGORY_MATCHED",
          tier: 1,
          category: "PULL HORIZONTAL/PULL VERTICAL",
          originalRoute: "FLR",
        },
      ],
    });
    const ctx = {
      ...makeContractionCtx("kairos"),
      format: { formatId: 42, name: "Singlet" },
    };
    const result = await selectExercises(ctx, FAKE_DB);

    // The rescue runs once per failing contraction, at dl 1-2 strict.
    expect(selectKairosRescueExercisesMock).toHaveBeenCalledTimes(1);
    const rescueReq = selectKairosRescueExercisesMock.mock.calls[0][0];
    expect(rescueReq.minDificultadLineal).toBe(1);
    expect(rescueReq.maxDificultadLineal).toBe(2);
    expect(rescueReq.allowedLevels).toEqual(["alfa"]);
    // The block no longer fails: the rescued exercise is selected and the
    // fallback action is traced (it surfaces as a generate warning upstream).
    expect(result.exercises.map((e) => e.name)).toContain("Row Inclined");
    expect(
      result.trace.some(
        (t) =>
          t.code === "EXERCISE_FALLBACK" &&
          (t.decision as Record<string, unknown>)?.action ===
            "CATEGORY_MATCHED",
      ),
    ).toBe(true);
  });

  it("uses getAllowedLevels + the linear difficulty target UNCHANGED for alfa (D-07)", async () => {
    const { selectExercises } =
      await import("../../src/modules/sessions/pipeline/stage-6-exercises");
    const ctx = {
      ...makeContractionCtx("alfa"),
      format: { formatId: 7, name: "AMRAP" },
    };
    const result = await selectExercises(ctx, FAKE_DB);

    const arg = selectExercisesWithFallbackMock.mock.calls[0][0];
    // alfa_delta allows both alfa and delta — kairos restriction did not leak.
    expect(arg.allowedLevels).toEqual(["alfa", "delta"]);
    // Difficulty is NOT clamped to 1/1 — it comes from the level linear range.
    expect(arg.maxDificultadLineal).toBeGreaterThan(1);
    expect(arg.memberLevel).toBe("alfa");
    expect(result.trace.some((t) => t.code === "KAIROS_INHERIT_ALFA")).toBe(
      false,
    );
    // D-07: non-kairos passes NO tight policy override (uses the default ladder)
    // and never reaches the kairos rescue selector.
    expect(selectExercisesWithFallbackMock.mock.calls[0][2]).toBeUndefined();
    expect(selectKairosRescueExercisesMock).not.toHaveBeenCalled();
  });
});

describe("INITIUM is the shared day warmup — identical for kairos and every other level", () => {
  // INITIUM queries the exercises table directly via db.select(); mock a pool
  // large enough that selectWithVariety can return the full count.
  function makeInitiumDb(): never {
    const pool = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Mobility ${i + 1}`,
      effort: "CON",
      difficulty: 1,
      pattern: "FLOW",
      category: "Movilidad",
      mobilityRelated: null,
    }));
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(pool),
            }),
          }),
        }),
      }),
    } as never;
  }

  it("selects 4 INITIUM exercises and the level-agnostic format for kairos (no kairos gate)", async () => {
    queryFormatsAnyLevelMock.mockResolvedValue([METCON_FORMAT]);
    selectBestFormatMock.mockReturnValue(METCON_FORMAT);
    const { runInitiumPipeline } =
      await import("../../src/modules/sessions/pipeline/initium-pipeline");

    const block = await runInitiumPipeline(
      makeInitiumCtx("kairos"),
      makeInitiumDb(),
    );
    expect(block.exercises).toHaveLength(4);
    expect(block.format.name).toBe("AMRAP");
    expect(queryFormatsAnyLevelMock).toHaveBeenCalledTimes(1);
    // No by-name linear-format lookup and no kairos traces: the gate is gone.
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
    expect(
      block.trace.some((t) => t.code === "KAIROS_INITIUM_SIZE_FORCED"),
    ).toBe(false);
    expect(
      block.trace.some((t) => t.code === "KAIROS_INITIUM_FORMAT_FORCED"),
    ).toBe(false);
  });

  it("produces an INITIUM identical to alfa's for the same week/day inputs", async () => {
    queryFormatsAnyLevelMock.mockResolvedValue([METCON_FORMAT]);
    selectBestFormatMock.mockReturnValue(METCON_FORMAT);
    const { runInitiumPipeline } =
      await import("../../src/modules/sessions/pipeline/initium-pipeline");

    const kairosBlock = await runInitiumPipeline(
      makeInitiumCtx("kairos"),
      makeInitiumDb(),
    );
    const alfaBlock = await runInitiumPipeline(
      makeInitiumCtx("alfa"),
      makeInitiumDb(),
    );

    // Same exercises, same prescriptions, same format — the printed sheet
    // renders INITIUM once for the whole day, so any divergence is a bug.
    expect(kairosBlock.exercises).toEqual(alfaBlock.exercises);
    expect(kairosBlock.format).toEqual(alfaBlock.format);
    expect(kairosBlock.formatParams).toEqual(alfaBlock.formatParams);
  });

  it("selects 4 INITIUM exercises and the level-agnostic format for alfa (D-07)", async () => {
    queryFormatsAnyLevelMock.mockResolvedValue([METCON_FORMAT]);
    selectBestFormatMock.mockReturnValue(METCON_FORMAT);
    const { runInitiumPipeline } =
      await import("../../src/modules/sessions/pipeline/initium-pipeline");

    const block = await runInitiumPipeline(
      makeInitiumCtx("alfa"),
      makeInitiumDb(),
    );
    expect(block.exercises).toHaveLength(4);
    expect(block.format.name).toBe("AMRAP");
    expect(queryFormatsAnyLevelMock).toHaveBeenCalledTimes(1);
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
    expect(
      block.trace.some((t) => t.code === "KAIROS_INITIUM_SIZE_FORCED"),
    ).toBe(false);
  });
});

describe("runBlockPipeline forcedFormat: kairos honors forcedFormat like any level", () => {
  // A full SpomService stub covering stages 1-4 so runBlockPipeline reaches
  // the stage-5 forcedFormat decision. The shapes mirror what the real stages
  // consume (rotator → route → spom rule → intensity rule → contraction rule).
  function makeFullSpomService(): unknown {
    return {
      getWeeklyRotator: vi.fn().mockResolvedValue({
        nucleusRouteId: 1,
        deuteros1RouteId: 1,
        deuteros2RouteId: 1,
        athlosRouteId: 1,
      }),
      getRouteById: vi.fn().mockResolvedValue({ code: "PUSH" }),
      getSpomRule: vi.fn().mockResolvedValue({
        id: 1,
        intensity: 70,
        pattern: "PUSH",
        pattern2: null,
        category: "Fuerza",
        wave: 1,
      }),
      getIntensityRule: vi.fn().mockResolvedValue(INTENSITY_RULE),
      getContractionRule: vi.fn().mockResolvedValue({
        concentrico: 1,
        excentrico: 0,
        isometrico: 0,
      }),
    };
  }

  // The format forced onto DEUTEROS_2 / via cross-level sharedFormats.
  const NON_LINEAR_FORCED = { formatId: 7, name: "AMRAP" };

  it("honors forcedFormat for a kairos block (no Singlet forcing)", async () => {
    const { runBlockPipeline } =
      await import("../../src/modules/sessions/pipeline");
    const ctx: BlockContext = {
      week: 1,
      day: "lunes",
      levelGroup: "alfa_delta",
      memberLevel: "kairos",
      blockId: "W1-lunes-kairos-DEUTEROS_2",
      role: "DEUTEROS_2",
      trace: [],
    };

    const block = await runBlockPipeline(
      ctx,
      makeFullSpomService() as never,
      FAKE_DB,
      { forcedFormat: NON_LINEAR_FORCED },
    );

    // Kairos honors the forced format like any other level — no Singlet forcing.
    expect(block.format.name).toBe("AMRAP");
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
    expect(block.trace.some((t) => t.code === "KAIROS_FORMAT_FORCED")).toBe(
      false,
    );
    expect(block.trace.some((t) => t.code === "FORMAT_FORCED")).toBe(true);
  });

  it("still honors forcedFormat for a non-kairos block (D-07 — forcedFormat unchanged)", async () => {
    const { runBlockPipeline } =
      await import("../../src/modules/sessions/pipeline");
    const ctx: BlockContext = {
      week: 1,
      day: "lunes",
      levelGroup: "alfa_delta",
      memberLevel: "alfa",
      blockId: "W1-lunes-alfa-DEUTEROS_2",
      role: "DEUTEROS_2",
      trace: [],
    };

    const block = await runBlockPipeline(
      ctx,
      makeFullSpomService() as never,
      FAKE_DB,
      { forcedFormat: NON_LINEAR_FORCED },
    );

    // alfa keeps the forced format — kairos gate did not leak.
    expect(block.format.name).toBe("AMRAP");
    expect(block.trace.some((t) => t.code === "FORMAT_FORCED")).toBe(true);
    expect(block.trace.some((t) => t.code === "KAIROS_FORMAT_FORCED")).toBe(
      false,
    );
    // The kairos linear by-name lookup must NOT run for alfa.
    expect(queryFormatByNameMock).not.toHaveBeenCalled();
  });
});

describe("D-07 regression invariant — kairos behavior never leaks to non-kairos", () => {
  it("alfa and delta take the unchanged branch at every gate point", async () => {
    const { deriveBudget } =
      await import("../../src/modules/sessions/pipeline/stage-3-budget");
    const { selectFormat } =
      await import("../../src/modules/sessions/pipeline/stage-5-format");
    const { selectExercises } =
      await import("../../src/modules/sessions/pipeline/stage-6-exercises");

    for (const level of ["alfa", "delta"] as const) {
      vi.clearAllMocks();
      queryFormatByNameMock.mockResolvedValue(SINGLET_FORMAT);
      selectFormatWithFallbackMock.mockResolvedValue({
        status: "exact",
        data: [METCON_FORMAT],
        tier: 0,
        actions: [],
      });
      selectExercisesWithFallbackMock.mockResolvedValue({
        status: "exact",
        data: [
          {
            id: 1,
            name: "Push-up",
            dificultadLineal: 2,
            contraction: "CON",
            position: null,
          },
        ],
        tier: 0,
        actions: [],
      });

      // Stage 3: bounds NOT forced to 2/2.
      const budgetCtx = await deriveBudget(
        makeSpomCtx(level, "NUCLEUS"),
        makeSpomService() as never,
      );
      expect(budgetCtx.exerciseCountMax).not.toBe(2);
      expect(
        budgetCtx.trace.some((t) => t.code === "KAIROS_BLOCK_SIZE_FORCED"),
      ).toBe(false);

      // Stage 5: linear-by-name lookup never runs; metcon ladder used.
      const formatCtx = await selectFormat(makeContractionCtx(level), FAKE_DB);
      expect(queryFormatByNameMock).not.toHaveBeenCalled();
      expect(formatCtx.format.name).toBe("AMRAP");

      // Stage 6: alfa-only restriction never applied.
      const exCtx = await selectExercises(
        {
          ...makeContractionCtx(level),
          format: { formatId: 7, name: "AMRAP" },
        },
        FAKE_DB,
      );
      const arg = selectExercisesWithFallbackMock.mock.calls[0][0];
      expect(arg.allowedLevels).toEqual(["alfa", "delta"]);
      expect(exCtx.trace.some((t) => t.code === "KAIROS_INHERIT_ALFA")).toBe(
        false,
      );
    }
  });
});
