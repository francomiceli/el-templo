/**
 * Unit tests for ROM session generator
 *
 * Tests the generateRomSession function and its body-zone
 * exercise selection, prescription, and session structure.
 *
 * Uses mocked DB queries to test pure generation logic.
 * INITIUM pipeline is mocked to isolate ROM zone generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DaySession,
  BlockPlan,
  BlockRole,
} from "../../src/modules/sessions/types";

// Mock INITIUM pipeline to avoid complex DB queries
const MOCK_INITIUM_BLOCK: BlockPlan = {
  blockId: "W1-sabado-alfa-INITIUM",
  role: "INITIUM" as BlockRole,
  route: "INITIUM",
  pattern: "FLOW",
  intensity: 30,
  repsBudget: 80,
  format: { formatId: 1, name: "Flow" },
  formatParams: { type: "standard" as const },
  exercises: [
    {
      exerciseId: 100,
      name: "Mock Warmup 1",
      contraction: "CON" as const,
      reps: 30,
      seconds: 0,
      rest: 45,
      dificultadLineal: 1,
    },
    {
      exerciseId: 101,
      name: "Mock Warmup 2",
      contraction: "CON" as const,
      reps: 30,
      seconds: 0,
      rest: 45,
      dificultadLineal: 2,
    },
    {
      exerciseId: 102,
      name: "Mock Warmup 3",
      contraction: "EXC" as const,
      reps: 30,
      seconds: 0,
      rest: 45,
      dificultadLineal: 1,
    },
    {
      exerciseId: 103,
      name: "Mock Warmup 4",
      contraction: "CON" as const,
      reps: 30,
      seconds: 0,
      rest: 45,
      dificultadLineal: 2,
    },
  ],
  trace: [],
};

vi.mock("../../src/modules/sessions/pipeline/initium-pipeline", () => ({
  runInitiumPipeline: vi.fn().mockResolvedValue(MOCK_INITIUM_BLOCK),
}));

vi.mock("../../src/modules/sessions/pipeline/context", () => ({
  createInitialContext: vi.fn().mockReturnValue({
    week: 1,
    day: "sabado",
    levelGroup: "alfa_delta",
    memberLevel: "alfa",
    blockId: "W1-sabado-alfa-INITIUM",
    role: "INITIUM",
    trace: [],
  }),
}));

// Mock exercise data matching real DB shape
const MOCK_EXERCISES = [
  // ROM_LOWER — LS ( LUNGES ) — 6 exercises (3 alfa, 3 delta)
  {
    id: 1,
    exercise: "Zancadas Laterales",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 1,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },
  {
    id: 2,
    exercise: "Estocadas Caminando",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 2,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },
  {
    id: 3,
    exercise: "Sentadilla Sumo",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 3,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },
  {
    id: 4,
    exercise: "Estocada Bulgara",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 4,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },
  {
    id: 5,
    exercise: "Pistol Squat Asistido",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 5,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },
  {
    id: 6,
    exercise: "Pistol Squat",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 6,
    mobilityRelated: "LS ( LUNGES )",
    route: "LS",
  },

  // ROM_CORE — FL — 3 alfa, 3 delta
  {
    id: 10,
    exercise: "Front Lever Tuck",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 1,
    mobilityRelated: "FL",
    route: "FL",
  },
  {
    id: 11,
    exercise: "Front Lever Raise",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 2,
    mobilityRelated: "FL",
    route: "FL",
  },
  {
    id: 12,
    exercise: "Hollow Body Hold",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 3,
    mobilityRelated: "TTB / HF",
    route: "TTB",
  },
  {
    id: 13,
    exercise: "Knee to Elbow",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 4,
    mobilityRelated: "MN",
    route: "MN",
  },
  {
    id: 14,
    exercise: "Toes to Bar",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 5,
    mobilityRelated: "TTB / HF",
    route: "TTB",
  },
  {
    id: 15,
    exercise: "Dragon Flag",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 6,
    mobilityRelated: "FL",
    route: "FL",
  },

  // ROM_UPPER — PL — 3 alfa, 3 delta
  {
    id: 20,
    exercise: "Planche Lean",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 1,
    mobilityRelated: "PL",
    route: "PL",
  },
  {
    id: 21,
    exercise: "Pseudo Planche Push-up",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 2,
    mobilityRelated: "PL",
    route: "PL",
  },
  {
    id: 22,
    exercise: "Tuck Planche",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 3,
    mobilityRelated: "PL",
    route: "PL",
  },
  {
    id: 23,
    exercise: "Advanced Tuck Planche",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 4,
    mobilityRelated: "PL",
    route: "PL",
  },
  {
    id: 24,
    exercise: "Straddle Planche",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 5,
    mobilityRelated: "PL",
    route: "PL",
  },
  {
    id: 25,
    exercise: "Full Planche",
    pattern: "MOVILIDAD",
    effort: "CON",
    dificultadLineal: 6,
    mobilityRelated: "PL",
    route: "PL",
  },

  // Non-CON exercise (should be filtered out)
  {
    id: 30,
    exercise: "Planche Hold",
    pattern: "MOVILIDAD",
    effort: "ISO",
    dificultadLineal: 3,
    mobilityRelated: "PL",
    route: "PL",
  },
];

// Mock DB that returns exercises when queried
function createMockDb(exercises = MOCK_EXERCISES) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(exercises),
    }),
  });

  return {
    select: mockSelect,
  } as unknown;
}

describe("ROM Generator", () => {
  describe("generateRomSession", () => {
    it("returns DaySession with session_mode='rom', INITIUM first, then 3 ROM blocks", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      expect(session.sessionMode).toBe("rom");
      expect(session.blocks).toHaveLength(4);

      const roles = session.blocks.map((b: BlockPlan) => b.role);
      expect(roles[0]).toBe("INITIUM");
      expect(roles).toContain("ROM_LOWER");
      expect(roles).toContain("ROM_CORE");
      expect(roles).toContain("ROM_UPPER");

      // No ATHLOS or EPIKOS
      expect(roles).not.toContain("ATHLOS");
      expect(roles).not.toContain("EPIKOS");
    });

    it("each ROM zone block has exactly 3 CON exercises with reps from [20, 30, 40]", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      expect(romBlocks).toHaveLength(3);

      for (const block of romBlocks) {
        expect(block.exercises).toHaveLength(3);

        // All exercises are CON
        for (const ex of block.exercises) {
          expect(ex.contraction).toBe("CON");
        }

        // All three rep values are used (20, 30, 40)
        const reps = block.exercises.map((ex: { reps: number }) => ex.reps);
        expect(reps.sort()).toEqual([20, 30, 40]);
      }
    });

    it("alfa tier ROM zone exercises have dificultadLineal <= 3", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      for (const block of romBlocks) {
        for (const ex of block.exercises) {
          expect(ex.dificultadLineal).toBeLessThanOrEqual(3);
        }
      }
    });

    it("delta tier ROM zone exercises have dificultadLineal > 3", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "delta",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      for (const block of romBlocks) {
        for (const ex of block.exercises) {
          expect(ex.dificultadLineal).toBeGreaterThan(3);
        }
      }
    });

    it("ROM zone blocks have format { type: 'rom', rounds: 3 } and rest=30", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      for (const block of romBlocks) {
        expect(block.formatParams).toEqual({
          type: "rom",
          rounds: 3,
          restSeconds: 30,
        });

        for (const ex of block.exercises) {
          expect(ex.rest).toBe(30);
        }
      }
    });

    it("exercises in each ROM zone block match body zone mapping", async () => {
      const { generateRomSession, ROM_ZONE_MOBILITY_MAP } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      for (const block of romBlocks) {
        const zoneKeys =
          ROM_ZONE_MOBILITY_MAP[
            block.role as keyof typeof ROM_ZONE_MOBILITY_MAP
          ];
        expect(zoneKeys).toBeDefined();

        // Each exercise should match one of the zone's mobility keys
        for (const ex of block.exercises) {
          const matchingExercise = MOCK_EXERCISES.find(
            (m) => m.id === ex.exerciseId,
          );
          expect(matchingExercise).toBeDefined();
          const hasMatch = zoneKeys.some((key: string) =>
            matchingExercise!.mobilityRelated.includes(key),
          );
          expect(hasMatch).toBe(true);
        }
      }
    });

    it("succeeds with graceful fallback when pool is thin", async () => {
      // Create exercises with very few PL entries for the alfa range
      const thinPoolExercises = MOCK_EXERCISES.filter(
        (ex) => ex.mobilityRelated !== "PL" || ex.dificultadLineal <= 3,
      );
      // Only 3 PL exercises with dificultadLineal <= 3 — exactly enough, no fallback needed
      // Test with just 2 to force fallback
      const thinnerPool = thinPoolExercises.filter(
        (ex) => !(ex.mobilityRelated === "PL" && ex.dificultadLineal === 3),
      );

      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb(thinnerPool);

      // Should not throw
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      expect(session.blocks).toHaveLength(4);
      // ROM_UPPER block should still have exercises (via fallback)
      const upperBlock = session.blocks.find(
        (b: BlockPlan) => b.role === "ROM_UPPER",
      );
      expect(upperBlock).toBeDefined();
      expect(upperBlock!.exercises.length).toBeGreaterThan(0);
    });

    it("sets correct session-level fields", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        3,
        "sabado",
        "delta",
      );

      expect(session.dayId).toBe("W3-sabado-delta");
      expect(session.week).toBe(3);
      expect(session.day).toBe("sabado");
      expect(session.levelGroup).toBe("alfa_delta");
      expect(session.memberLevel).toBe("delta");
      expect(session.goalPlanType).toBeNull();
    });

    it("sets correct block-level fields on ROM zone blocks", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        2,
        "sabado",
        "alfa",
      );

      const romBlocks = session.blocks.filter(
        (b: BlockPlan) => b.role !== "INITIUM",
      );
      for (const block of romBlocks) {
        expect(block.pattern).toBe("MOVILIDAD");
        expect(block.intensity).toBe(50);
        expect(block.repsBudget).toBe(270);
        expect(block.format).toEqual({ formatId: 0, name: "ROM" });
        expect(block.mobilityExercise).toBeUndefined();
        // Each exercise should have exerciseType 'main'
        for (const ex of block.exercises) {
          expect(ex.exerciseType).toBe("main");
        }
      }
    });

    it("INITIUM block is generated with warmup parameters", async () => {
      const { generateRomSession } =
        await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(
        db as Parameters<typeof generateRomSession>[0],
        1,
        "sabado",
        "alfa",
      );

      const initium = session.blocks[0];
      expect(initium.role).toBe("INITIUM");
      expect(initium.route).toBe("INITIUM");
      expect(initium.intensity).toBe(30);
      expect(initium.exercises.length).toBeGreaterThanOrEqual(1);
    });
  });
});
