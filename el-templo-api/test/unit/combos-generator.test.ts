/**
 * Unit tests for the Combos session generator (Phase 159, SEM-02/SEM-03)
 *
 * `generateCombosSession` reuses the shared SPOM pipeline (stages 2-7) via
 * `runSemanaNuevaBlockPipeline` for COMBOS_I/COMBOS_II, so — like
 * `rom-generator.test.ts` mocks `runInitiumPipeline` to isolate ROM's own
 * assembly logic — this suite mocks `runSemanaNuevaBlockPipeline`,
 * `selectStretchingExercises` and `queryFormatByName` to isolate what
 * combos-generator.ts itself is responsible for: route pool selection
 * (D-05), format resolution (D-06), block ordering, and STRETCHING
 * determinism across the 6 member levels (D-11, anti Pitfall 1).
 *
 * `resolveRoutePool` (real, unmocked) is exercised as-is so the route
 * membership assertions (Test 2) reflect the actual deterministic hash.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BlockPlan, BlockRole, ExercisePrescription } from "../../src/modules/sessions/types";
import { GOAL_PLAN_ROUTE_MAP } from "../../src/modules/goal-plans/constants";

const MOCK_INITIUM_BLOCK: BlockPlan = {
  blockId: "W21-miercoles-alfa-INITIUM",
  role: "INITIUM",
  route: "INITIUM",
  pattern: "FLOW",
  intensity: 30,
  repsBudget: 80,
  format: { formatId: 1, name: "EMOM" },
  formatParams: { type: "standard" },
  exercises: [
    {
      exerciseId: 100,
      name: "Mock Warmup 1",
      contraction: "CON",
      reps: 30,
      seconds: 0,
      rest: 45,
      exerciseType: "main",
      dificultadLineal: 1,
    },
    {
      exerciseId: 101,
      name: "Mock Warmup 2",
      contraction: "CON",
      reps: 30,
      seconds: 0,
      rest: 45,
      exerciseType: "main",
      dificultadLineal: 2,
    },
  ],
  trace: [],
};

/** exerciseId offset per role block, to keep mock exercises non-colliding. */
const ROLE_ID_OFFSET: Partial<Record<BlockRole, number>> = {
  COMBOS_I: 200,
  COMBOS_II: 300,
};

const MOCK_STRETCHING_EXERCISES: ExercisePrescription[] = [
  { exerciseId: 900, name: "Mock Stretch 1", contraction: "CON", reps: 10, seconds: 0, rest: 0, exerciseType: "mobility" },
  { exerciseId: 901, name: "Mock Stretch 2", contraction: "ISO", reps: 0, seconds: 20, rest: 0, exerciseType: "mobility" },
  { exerciseId: 902, name: "Mock Stretch 3", contraction: "CON", reps: 10, seconds: 0, rest: 0, exerciseType: "mobility" },
  { exerciseId: 903, name: "Mock Stretch 4", contraction: "CON", reps: 10, seconds: 0, rest: 0, exerciseType: "mobility" },
];

const {
  mockRunSemanaNuevaBlockPipeline,
  mockSelectStretchingExercises,
  mockQueryFormatByName,
} = vi.hoisted(() => ({
  mockRunSemanaNuevaBlockPipeline: vi.fn(),
  mockSelectStretchingExercises: vi.fn(),
  mockQueryFormatByName: vi.fn(),
}));

vi.mock("../../src/modules/sessions/pipeline/semana-nueva-pipeline", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/sessions/pipeline/semana-nueva-pipeline")
  >("../../src/modules/sessions/pipeline/semana-nueva-pipeline");
  return {
    ...actual,
    // resolveRoutePool stays REAL (not mocked) — the route-pool assertions
    // (Test 2) need the actual deterministic hash.
    runSemanaNuevaBlockPipeline: mockRunSemanaNuevaBlockPipeline,
  };
});

vi.mock("../../src/modules/sessions/pipeline/utils/stretching-selection", () => ({
  selectStretchingExercises: mockSelectStretchingExercises,
}));

vi.mock("../../src/modules/sessions/fallback/format-fallback", () => ({
  queryFormatByName: mockQueryFormatByName,
}));

// Also avoid a real SpomService DB touch (it's only constructed and passed
// through — the mocked pipeline never calls into it — but keep it a no-op
// class for clarity/isolation).
vi.mock("../../src/modules/spom/service", () => ({
  SpomService: class MockSpomService {
    constructor(_db: unknown) {}
  },
}));

function createMockDb(): unknown {
  return {};
}

describe("Combos Generator", () => {
  beforeEach(() => {
    mockRunSemanaNuevaBlockPipeline.mockReset();
    mockRunSemanaNuevaBlockPipeline.mockImplementation(
      async (
        ctx: { role: BlockRole; blockId: string },
        _spomService: unknown,
        _db: unknown,
        options: { route: string; forcedFormat?: { formatId: number; name: string } },
      ): Promise<BlockPlan> => {
        if (ctx.role === "INITIUM") return MOCK_INITIUM_BLOCK;

        const idOffset = ROLE_ID_OFFSET[ctx.role] ?? 700;
        return {
          blockId: ctx.blockId,
          role: ctx.role,
          route: options.route,
          pattern: "FUERZA",
          intensity: 60,
          repsBudget: 100,
          format: options.forcedFormat ?? { formatId: 1, name: "Straight Sets" },
          formatParams: { type: "combos", rounds: 3 },
          exercises: [
            {
              exerciseId: idOffset,
              name: `Mock ${ctx.role} 1`,
              contraction: "CON",
              reps: 10,
              seconds: 0,
              rest: 60,
              exerciseType: "main",
              dificultadLineal: 2,
            },
            {
              exerciseId: idOffset + 1,
              name: `Mock ${ctx.role} 2`,
              contraction: "CON",
              reps: 10,
              seconds: 0,
              rest: 60,
              exerciseType: "main",
              dificultadLineal: 3,
            },
          ],
          trace: [],
        };
      },
    );

    mockSelectStretchingExercises.mockReset();
    mockSelectStretchingExercises.mockResolvedValue(MOCK_STRETCHING_EXERCISES);

    mockQueryFormatByName.mockReset();
    mockQueryFormatByName.mockImplementation(async (_db: unknown, name: string) => {
      if (name === "Combos") return { formatId: 501, name: "Combos", compatibility: 1 };
      if (name === "Stretching") return { formatId: 502, name: "Stretching", compatibility: 1 };
      return null;
    });
  });

  describe("generateCombosSession", () => {
    it("returns sessionMode='combos' with 4 blocks in order INITIUM->COMBOS_I->COMBOS_II->STRETCHING", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      expect(session.sessionMode).toBe("combos");
      expect(session.blocks).toHaveLength(4);
      expect(session.blocks.map((b) => b.role)).toEqual([
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "STRETCHING",
      ]);
      expect(session.dayId).toBe("W21-miercoles-alfa");
      expect(session.goalPlanType).toBeNull();
    });

    it("COMBOS_I route belongs to tren_superior, COMBOS_II to tren_inferior (D-05)", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const comboI = session.blocks.find((b) => b.role === "COMBOS_I")!;
      const comboII = session.blocks.find((b) => b.role === "COMBOS_II")!;

      expect(GOAL_PLAN_ROUTE_MAP.tren_superior).toContain(comboI.route);
      expect(GOAL_PLAN_ROUTE_MAP.tren_inferior).toContain(comboII.route);
    });

    it("COMBOS_I and COMBOS_II use the real 'Combos' format (id != 0)", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const comboI = session.blocks.find((b) => b.role === "COMBOS_I")!;
      const comboII = session.blocks.find((b) => b.role === "COMBOS_II")!;

      expect(comboI.format.name).toBe("Combos");
      expect(comboI.format.formatId).not.toBe(0);
      expect(comboII.format.name).toBe("Combos");
      expect(comboII.format.formatId).not.toBe(0);
    });

    it("STRETCHING block is IDENTICAL across the 6 member levels of the same (week, day) — anti Pitfall 1", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const levels: Array<{ levelGroup: "alfa_delta" | "sigma" | "omega"; memberLevel: string }> = [
        { levelGroup: "alfa_delta", memberLevel: "alfa" },
        { levelGroup: "alfa_delta", memberLevel: "delta" },
        { levelGroup: "alfa_delta", memberLevel: "kairos" },
        { levelGroup: "sigma", memberLevel: "sigma" },
        { levelGroup: "omega", memberLevel: "omega" },
        { levelGroup: "omega", memberLevel: "spartan" },
      ];

      const stretchingIdSets: number[][] = [];
      for (const { levelGroup, memberLevel } of levels) {
        const session = await generateCombosSession(
          db as Parameters<typeof generateCombosSession>[0],
          21,
          "miercoles",
          levelGroup,
          memberLevel as Parameters<typeof generateCombosSession>[4],
        );
        const stretchingBlock = session.blocks.find((b) => b.role === "STRETCHING")!;
        stretchingIdSets.push(stretchingBlock.exercises.map((ex) => ex.exerciseId));
      }

      // All 6 levels produced the exact same STRETCHING exerciseId sequence.
      for (const ids of stretchingIdSets) {
        expect(ids).toEqual(stretchingIdSets[0]);
      }

      // The selector must never receive memberLevel/levelGroup — pure (db, week, day).
      expect(mockSelectStretchingExercises).toHaveBeenCalledTimes(6);
      for (const call of mockSelectStretchingExercises.mock.calls) {
        expect(call).toEqual([db, 21, "miercoles"]);
      }
    });

    it("succeeds with graceful degradation when the STRETCHING pool is thin", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      mockSelectStretchingExercises.mockResolvedValueOnce(MOCK_STRETCHING_EXERCISES.slice(0, 2));

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      expect(session.blocks).toHaveLength(4);
      const stretchingBlock = session.blocks.find((b) => b.role === "STRETCHING")!;
      expect(stretchingBlock.exercises).toHaveLength(2);
    });

    it("validateSession reports no ERROR severity on the generated session", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const { validateSession } = await import(
        "../../src/modules/sessions/validators/session-validator"
      );
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const result = validateSession(session);

      expect(result.sessionErrors).toEqual([]);
      for (const blockResult of result.blockResults) {
        expect(blockResult.errors).toEqual([]);
      }
    });
  });
});
