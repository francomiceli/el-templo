/**
 * Unit tests for selectKairosRescueExercises (fix W16-lunes-kairos, 2026-06-06)
 *
 * The kairos TIGHT selection (dl=1 → dl=2, route + literal SPOM category only)
 * fails the whole session when the block route has no alfa dl 1-2 content (FLR)
 * because SPOM categories ("SUP PULL", ...) don't exist in exercises.category.
 * The rescue translates the SPOM taxonomy to real exercise categories and, as a
 * last resort, drops the route — ALWAYS at strict dl 1-2 + alfa.
 *
 * DB access is mocked at the drizzle chain level (select → from → where), the
 * same approach as test/unit/kairos-gate.test.ts uses for the INITIUM pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectKairosRescueExercises } from "../../src/modules/sessions/fallback/exercise-fallback";
import type { ExerciseRequirements } from "../../src/modules/sessions/fallback/types";

/** Row shape returned by the drizzle select in the fallback queries */
interface MockRow {
  id: number;
  name: string;
  dificultadLineal: number;
  position: string | null;
}

const whereMock = vi.fn<() => Promise<MockRow[]>>();

const FAKE_DB = {
  select: () => ({
    from: () => ({
      where: whereMock,
    }),
  }),
} as never;

function makeRequirements(
  overrides: Partial<ExerciseRequirements> = {},
): ExerciseRequirements {
  return {
    route: "FLR",
    contraction: "EXC",
    minDificultadLineal: 1,
    maxDificultadLineal: 2,
    allowedLevels: ["alfa"],
    count: 1,
    levelGroup: "alfa_delta",
    memberLevel: "alfa",
    category: "SUP PULL",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectKairosRescueExercises — step 1: SPOM category translation", () => {
  it("finds same-family exercises via the translated categories (SUP PULL case)", async () => {
    // One query per mapped category: PULL HORIZONTAL, then PULL VERTICAL.
    whereMock
      .mockResolvedValueOnce([
        {
          id: 3325,
          name: "ROW HORIZONTAL",
          dificultadLineal: 1,
          position: null,
        },
        { id: 3329, name: "ROW DECLINED", dificultadLineal: 2, position: null },
      ])
      .mockResolvedValueOnce([]);

    const result = await selectKairosRescueExercises(
      makeRequirements(),
      FAKE_DB,
    );

    expect(result.status).toBe("fallback");
    expect(result.tier).toBe(1);
    expect(result.data).toHaveLength(1);
    // Easiest first: dl=1 beats dl=2.
    expect(result.data[0].name).toBe("ROW HORIZONTAL");
    expect(result.actions).toEqual([
      {
        type: "CATEGORY_MATCHED",
        tier: 1,
        category: "PULL HORIZONTAL/PULL VERTICAL",
        originalRoute: "FLR",
      },
    ]);
  });

  it("dedups exercises matched by both primary and secondary category", async () => {
    const row: MockRow = {
      id: 100,
      name: "ROW INCLINED",
      dificultadLineal: 1,
      position: null,
    };
    // Same exercise returned by both category queries (primary + secondary
    // match), then again by the any-route query.
    whereMock
      .mockResolvedValueOnce([row]) // PULL HORIZONTAL
      .mockResolvedValueOnce([row]) // PULL VERTICAL
      .mockResolvedValueOnce([row]); // any route

    const result = await selectKairosRescueExercises(
      makeRequirements({ count: 2 }),
      FAKE_DB,
    );

    // The duplicated row counts as ONE candidate, not two: step 1 is
    // insufficient for count=2, and the any-route pool (1 row) also fails.
    expect(whereMock).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("failed");
  });
});

describe("selectKairosRescueExercises — step 2: any route", () => {
  it("drops the route when the translated categories have nothing", async () => {
    whereMock
      .mockResolvedValueOnce([]) // PULL HORIZONTAL
      .mockResolvedValueOnce([]) // PULL VERTICAL
      .mockResolvedValueOnce([
        { id: 7, name: "SQUAT", dificultadLineal: 2, position: null },
        { id: 5, name: "PLANK", dificultadLineal: 1, position: null },
      ]); // any route

    const result = await selectKairosRescueExercises(
      makeRequirements(),
      FAKE_DB,
    );

    expect(result.status).toBe("fallback");
    expect(result.tier).toBe(6);
    // Easiest first across the whole pool.
    expect(result.data[0].name).toBe("PLANK");
    expect(result.actions).toEqual([
      { type: "ROUTE_DROPPED", tier: 6, originalRoute: "FLR" },
    ]);
  });

  it("skips straight to any-route when the SPOM category has no translation", async () => {
    whereMock.mockResolvedValueOnce([
      { id: 1, name: "ROW STANDING", dificultadLineal: 1, position: null },
    ]);

    const result = await selectKairosRescueExercises(
      makeRequirements({ category: "CATEGORIA INEXISTENTE" }),
      FAKE_DB,
    );

    // Single query (any-route) — no category queries ran.
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("fallback");
    expect(result.tier).toBe(6);
  });

  it("returns failed (never throws) when nothing exists at dl 1-2 + alfa", async () => {
    whereMock.mockResolvedValue([]);

    const result = await selectKairosRescueExercises(
      makeRequirements(),
      FAKE_DB,
    );

    expect(result.status).toBe("failed");
    expect(result.data).toEqual([]);
  });
});
