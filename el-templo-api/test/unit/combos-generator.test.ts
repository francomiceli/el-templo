/**
 * Unit tests for the Combos session generator (Phase 159, SEM-02/SEM-03)
 *
 * `generateCombosSession` reuses the shared SPOM pipeline (stages 2-7) via
 * `runSemanaNuevaBlockPipeline` for COMBOS_I/COMBOS_II, so — like
 * `rom-generator.test.ts` mocks `runInitiumPipeline` to isolate ROM's own
 * assembly logic — this suite mocks `runSemanaNuevaBlockPipeline`,
 * `selectFullBodyCircuitExercises` and `queryFormatByName` to isolate what
 * combos-generator.ts itself is responsible for: route pool selection
 * (D-05), format resolution (D-06), block ordering, and the full-body
 * "Circuito cooperativo" close (UAT 2026-08-18: ATHLOS/EPIKOS por paridad,
 * ruta FB, per-level).
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
  COMBOS_II_ALT: 350,
};

const MOCK_FULL_BODY_EXERCISES: ExercisePrescription[] = [
  { exerciseId: 910, name: "Mock FB Push", contraction: "CON", reps: 100, seconds: 0, rest: 60, dificultadLineal: 2 },
  { exerciseId: 911, name: "Mock FB Lower", contraction: "CON", reps: 100, seconds: 0, rest: 60, dificultadLineal: 2 },
  { exerciseId: 912, name: "Mock FB Core", contraction: "ISO", reps: 0, seconds: 200, rest: 60, dificultadLineal: 1 },
];

const {
  mockRunSemanaNuevaBlockPipeline,
  mockSelectStretchingExercises,
  mockSelectFullBodyCircuitExercises,
  mockQueryFormatByName,
} = vi.hoisted(() => ({
  mockRunSemanaNuevaBlockPipeline: vi.fn(),
  mockSelectStretchingExercises: vi.fn(),
  mockSelectFullBodyCircuitExercises: vi.fn(),
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

vi.mock("../../src/modules/sessions/pipeline/utils/full-body-selection", () => ({
  selectFullBodyCircuitExercises: mockSelectFullBodyCircuitExercises,
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

    mockSelectFullBodyCircuitExercises.mockReset();
    mockSelectFullBodyCircuitExercises.mockResolvedValue(MOCK_FULL_BODY_EXERCISES);

    mockQueryFormatByName.mockReset();
    mockQueryFormatByName.mockImplementation(async (_db: unknown, name: string) => {
      if (name === "Combos") return { formatId: 501, name: "Combos", compatibility: 1 };
      if (name === "Stretching") return { formatId: 502, name: "Stretching", compatibility: 1 };
      if (name === "Circuito cooperativo") return { formatId: 503, name: "Circuito cooperativo", compatibility: 1 };
      return null;
    });
  });

  describe("generateCombosSession", () => {
    it("returns sessionMode='combos' with 5 blocks closing in ATHLOS (odd week) full-body circuit", async () => {
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
      expect(session.blocks).toHaveLength(5);
      expect(session.blocks.map((b) => b.role)).toEqual([
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "COMBOS_II_ALT",
        "ATHLOS",
      ]);
      expect(session.dayId).toBe("W21-miercoles-alfa");
      expect(session.goalPlanType).toBeNull();
      // Combos days no longer produce STRETCHING (tecnica-only close).
      expect(mockSelectStretchingExercises).not.toHaveBeenCalled();
    });

    it("closes with EPIKOS on even weeks (regular pipeline's final-role parity)", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        22,
        "jueves",
        "alfa_delta",
        "alfa",
      );

      expect(session.blocks.map((b) => b.role)).toEqual([
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "COMBOS_II_ALT",
        "EPIKOS",
      ]);
    });

    it("COMBOS_II_ALT reuses COMBOS_II's pool but resolves a distinct route/exercises (T-178-03)", async () => {
      const { generateCombosSession, COMBOS_ROUTE_POOLS } = await import(
        "../../src/modules/sessions/combos-generator"
      );
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const comboII = session.blocks.find((b) => b.role === "COMBOS_II")!;
      const comboIIAlt = session.blocks.find((b) => b.role === "COMBOS_II_ALT")!;

      // Same pool as COMBOS_II (tren_inferior), same forced format.
      expect(COMBOS_ROUTE_POOLS.COMBOS_II).toContain(comboIIAlt.route);
      expect(comboIIAlt.format.name).toBe("Combos");
      expect(comboIIAlt.format.formatId).not.toBe(0);

      // Distinct route (pool has >=2 members) and distinct exercise set.
      expect(comboIIAlt.route).not.toBe(comboII.route);
      const comboIIIds = new Set(comboII.exercises.map((ex) => ex.exerciseId));
      const comboIIAltIds = new Set(comboIIAlt.exercises.map((ex) => ex.exerciseId));
      expect(comboIIAltIds).not.toEqual(comboIIIds);
    });

    it("COMBOS_II_ALT sits between COMBOS_II and the FB close, immediately after the role blocks", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const roles = session.blocks.map((b) => b.role);
      expect(roles.indexOf("COMBOS_II_ALT")).toBe(roles.indexOf("COMBOS_II") + 1);
      expect(roles.indexOf("COMBOS_II_ALT")).toBe(roles.length - 2);
    });

    it("full-body close uses route FB, format 'Circuito cooperativo' and mirrors COMBOS_II numbers", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      const fullBody = session.blocks.find((b) => b.role === "ATHLOS")!;
      const comboII = session.blocks.find((b) => b.role === "COMBOS_II")!;

      expect(fullBody.route).toBe("FB");
      expect(fullBody.format.name).toBe("Circuito cooperativo");
      expect(fullBody.format.formatId).not.toBe(0);
      expect(fullBody.formatParams).toEqual({ type: "circuito_cooperativo" });
      expect(fullBody.intensity).toBe(comboII.intensity);
      expect(fullBody.repsBudget).toBe(comboII.repsBudget);
      expect(fullBody.exercises.map((ex) => ex.exerciseId)).toEqual([910, 911, 912]);
      // The selector is per-level: it must receive memberLevel.
      expect(mockSelectFullBodyCircuitExercises).toHaveBeenCalledWith(db, 21, "miercoles", "alfa");
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

    it("the full-body selector runs once per level with that level's memberLevel", async () => {
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

      for (const { levelGroup, memberLevel } of levels) {
        await generateCombosSession(
          db as Parameters<typeof generateCombosSession>[0],
          21,
          "miercoles",
          levelGroup,
          memberLevel as Parameters<typeof generateCombosSession>[4],
        );
      }

      expect(mockSelectFullBodyCircuitExercises).toHaveBeenCalledTimes(6);
      expect(mockSelectFullBodyCircuitExercises.mock.calls.map((c) => c[3])).toEqual([
        "alfa",
        "delta",
        "kairos",
        "sigma",
        "omega",
        "spartan",
      ]);
    });

    it("succeeds with graceful degradation when the full-body pool is thin", async () => {
      const { generateCombosSession } = await import("../../src/modules/sessions/combos-generator");
      const db = createMockDb();

      mockSelectFullBodyCircuitExercises.mockResolvedValueOnce(MOCK_FULL_BODY_EXERCISES.slice(0, 1));

      const session = await generateCombosSession(
        db as Parameters<typeof generateCombosSession>[0],
        21,
        "miercoles",
        "alfa_delta",
        "alfa",
      );

      expect(session.blocks).toHaveLength(5);
      const fullBody = session.blocks.find((b) => b.role === "ATHLOS")!;
      expect(fullBody.exercises).toHaveLength(1);
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
