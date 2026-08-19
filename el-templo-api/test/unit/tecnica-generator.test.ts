/**
 * Unit tests for the Tecnica session generator (Phase 159, SEM-02/SEM-04)
 *
 * Mirrors combos-generator.test.ts's mocking strategy (mocks
 * `runSemanaNuevaBlockPipeline`, `selectStretchingExercises` and
 * `queryFormatByName`, keeps `resolveRoutePool` real) to isolate what
 * tecnica-generator.ts itself is responsible for: the SHARED route
 * resolution for TECNICA_I/TECNICA_II (D-08, the key differentiator vs.
 * combos), the quality/skill format (D-09), and STRETCHING determinism
 * across the 6 member levels (shared trunk with combos-generator.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BlockPlan, BlockRole, ExercisePrescription } from "../../src/modules/sessions/types";

const MOCK_INITIUM_BLOCK: BlockPlan = {
  blockId: "W21-jueves-alfa-INITIUM",
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
  TECNICA_I: 400,
  TECNICA_II: 500,
};

const MOCK_STRETCHING_EXERCISES: ExercisePrescription[] = [
  { exerciseId: 900, name: "Mock Stretch 1", contraction: "CON", reps: 10, seconds: 0, rest: 0 },
  { exerciseId: 901, name: "Mock Stretch 2", contraction: "ISO", reps: 0, seconds: 20, rest: 0 },
  { exerciseId: 902, name: "Mock Stretch 3", contraction: "CON", reps: 10, seconds: 0, rest: 0 },
  { exerciseId: 903, name: "Mock Stretch 4", contraction: "CON", reps: 10, seconds: 0, rest: 0 },
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
    // resolveRoutePool stays REAL (not mocked) — Test 2 (shared route, D-08)
    // needs the actual deterministic hash to prove both calls collide.
    runSemanaNuevaBlockPipeline: mockRunSemanaNuevaBlockPipeline,
  };
});

vi.mock("../../src/modules/sessions/pipeline/utils/stretching-selection", () => ({
  selectStretchingExercises: mockSelectStretchingExercises,
}));

vi.mock("../../src/modules/sessions/fallback/format-fallback", () => ({
  queryFormatByName: mockQueryFormatByName,
}));

vi.mock("../../src/modules/spom/service", () => ({
  SpomService: class MockSpomService {
    constructor(_db: unknown) {}
  },
}));

function createMockDb(): unknown {
  return {};
}

describe("Tecnica Generator", () => {
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
          formatParams: { type: "for_quality", rounds: 3 },
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
      if (name === "For Quality") return { formatId: 601, name: "For Quality", compatibility: 1 };
      if (name === "Stretching") return { formatId: 502, name: "Stretching", compatibility: 1 };
      return null;
    });
  });

  describe("generateTecnicaSession", () => {
    it("returns sessionMode='tecnica' with 4 blocks in order INITIUM->TECNICA_I->TECNICA_II->STRETCHING", async () => {
      const { generateTecnicaSession } = await import("../../src/modules/sessions/tecnica-generator");
      const db = createMockDb();

      const session = await generateTecnicaSession(
        db as Parameters<typeof generateTecnicaSession>[0],
        21,
        "jueves",
        "alfa_delta",
        "alfa",
      );

      expect(session.sessionMode).toBe("tecnica");
      expect(session.blocks).toHaveLength(4);
      expect(session.blocks.map((b) => b.role)).toEqual([
        "INITIUM",
        "TECNICA_I",
        "TECNICA_II",
        "STRETCHING",
      ]);
      expect(session.dayId).toBe("W21-jueves-alfa");
      expect(session.goalPlanType).toBeNull();
    });

    it("TECNICA_I and TECNICA_II resolve to the SAME route (D-08)", async () => {
      const { generateTecnicaSession } = await import("../../src/modules/sessions/tecnica-generator");
      const db = createMockDb();

      const session = await generateTecnicaSession(
        db as Parameters<typeof generateTecnicaSession>[0],
        21,
        "jueves",
        "alfa_delta",
        "alfa",
      );

      const tecnicaI = session.blocks.find((b) => b.role === "TECNICA_I")!;
      const tecnicaII = session.blocks.find((b) => b.role === "TECNICA_II")!;

      expect(tecnicaI.route).toBe(tecnicaII.route);

      // D-08: the hashInput used to resolve the shared route must exclude
      // the role — assert directly on what runSemanaNuevaBlockPipeline (the
      // mock) received as `options.route` for both calls.
      const roleBlockCalls = mockRunSemanaNuevaBlockPipeline.mock.calls.filter(
        (call) => (call[0] as { role: BlockRole }).role !== "INITIUM",
      );
      expect(roleBlockCalls).toHaveLength(2);
      const routesPassed = roleBlockCalls.map(
        (call) => (call[3] as { route: string }).route,
      );
      expect(routesPassed[0]).toBe(routesPassed[1]);
    });

    it("TECNICA_I/TECNICA_II use a quality/skill format (D-09), not 'Combos'", async () => {
      const { generateTecnicaSession } = await import("../../src/modules/sessions/tecnica-generator");
      const db = createMockDb();

      const session = await generateTecnicaSession(
        db as Parameters<typeof generateTecnicaSession>[0],
        21,
        "jueves",
        "alfa_delta",
        "alfa",
      );

      const tecnicaI = session.blocks.find((b) => b.role === "TECNICA_I")!;
      const tecnicaII = session.blocks.find((b) => b.role === "TECNICA_II")!;

      expect(["For Quality", "Cluster", "Accumulate X"]).toContain(tecnicaI.format.name);
      expect(tecnicaI.format.name).not.toBe("Combos");
      expect(tecnicaI.format.formatId).not.toBe(0);
      expect(tecnicaII.format.name).toBe(tecnicaI.format.name);
    });

    it("STRETCHING block is IDENTICAL across the 6 member levels of the same (week, day)", async () => {
      const { generateTecnicaSession } = await import("../../src/modules/sessions/tecnica-generator");
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
        const session = await generateTecnicaSession(
          db as Parameters<typeof generateTecnicaSession>[0],
          21,
          "jueves",
          levelGroup,
          memberLevel as Parameters<typeof generateTecnicaSession>[4],
        );
        const stretchingBlock = session.blocks.find((b) => b.role === "STRETCHING")!;
        stretchingIdSets.push(stretchingBlock.exercises.map((ex) => ex.exerciseId));
      }

      for (const ids of stretchingIdSets) {
        expect(ids).toEqual(stretchingIdSets[0]);
      }

      expect(mockSelectStretchingExercises).toHaveBeenCalledTimes(6);
      for (const call of mockSelectStretchingExercises.mock.calls) {
        expect(call).toEqual([db, 21, "jueves"]);
      }
    });

    it("validateSession reports no ERROR severity on the generated session", async () => {
      const { generateTecnicaSession } = await import("../../src/modules/sessions/tecnica-generator");
      const { validateSession } = await import(
        "../../src/modules/sessions/validators/session-validator"
      );
      const db = createMockDb();

      const session = await generateTecnicaSession(
        db as Parameters<typeof generateTecnicaSession>[0],
        21,
        "jueves",
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
