/**
 * Unit tests for the STRETCHING block selection (Phase 159, SEM-06)
 *
 * Anti Pitfall 1: the STRETCHING block is generated once per level (6 levels
 * per day) and MUST be identical across all of them for the same
 * (week, day). The old mobility-selection.ts uses Math.random(), which would
 * make each level diverge — this selector must be a pure function of
 * (week, day) instead.
 *
 * Uses a mocked DB (select().from().where() chain, same shape as
 * rom-generator.test.ts's createMockDb) to test the pure selection logic in
 * isolation.
 */
import { describe, it, expect, vi } from "vitest";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../src/db/schema";

// Mock pool of MOVILIDAD exercises, deliberately unsorted by id to exercise
// the "order by id ascending" step. Mixed CON/ISO effort to exercise the
// prescription branch (ISO -> seconds, else reps).
const MOCK_MOBILITY_POOL = [
  { id: 53, exercise: "Puente de Hombros", effort: "ISO" },
  { id: 12, exercise: "Rotacion de Cadera", effort: "CON" },
  { id: 40, exercise: "Estiramiento Isquios", effort: "ISO" },
  { id: 27, exercise: "Movilidad Tobillo", effort: "CON" },
  { id: 8, exercise: "Circulos de Hombro", effort: "CON" },
  { id: 61, exercise: "Gato-Camello", effort: "CON" },
];

const MOCK_THIN_POOL = [
  { id: 8, exercise: "Circulos de Hombro", effort: "CON" },
  { id: 12, exercise: "Rotacion de Cadera", effort: "ISO" },
];

// Mock DB that returns exercises when queried — same encadenado
// select().from().where() shape as rom-generator.test.ts:267-278.
function createMockDb(exercises: typeof MOCK_MOBILITY_POOL = MOCK_MOBILITY_POOL) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(exercises),
    }),
  });

  return { select: mockSelect } as unknown as MySql2Database<typeof schema>;
}

describe("selectStretchingExercises", () => {
  it("is deterministic: two calls with the same (week, day) return the same exercises", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    const first = await selectStretchingExercises(createMockDb(), 21, "jueves");
    const second = await selectStretchingExercises(createMockDb(), 21, "jueves");

    expect(first).toEqual(second);
  });

  it("does not accept memberLevel: two simulated 'levels' (identical calls) produce identical exercises across 6 invocations", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    // Simulate the 6 real member levels generating the same STRETCHING block
    // for the same (week, day) — none of them pass a level, because the
    // signature is (db, week, day) only.
    const results = await Promise.all(
      ["alfa", "delta", "kairos", "omega", "spartan", "sigma"].map(() =>
        selectStretchingExercises(createMockDb(), 26, "miercoles"),
      ),
    );

    const referenceIds = results[0].map((ex) => ex.exerciseId);
    for (const result of results) {
      expect(result.map((ex) => ex.exerciseId)).toEqual(referenceIds);
    }
  });

  it("returns ~4 exercises without duplicates when the pool has >= 4", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    const result = await selectStretchingExercises(createMockDb(), 21, "jueves");

    expect(result.length).toBe(4);
    const ids = result.map((ex) => ex.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns all available exercises without repeats when the pool has < 4", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    const result = await selectStretchingExercises(createMockDb(MOCK_THIN_POOL), 21, "jueves");

    expect(result.length).toBe(MOCK_THIN_POOL.length);
    const ids = result.map((ex) => ex.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty array when the pool is empty", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    const result = await selectStretchingExercises(createMockDb([]), 21, "jueves");

    expect(result).toEqual([]);
  });

  it("never calls Math.random (Pitfall 1)", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );
    const randomSpy = vi.spyOn(Math, "random");

    await selectStretchingExercises(createMockDb(), 21, "jueves");

    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it("prescribes ISO exercises with seconds and CON exercises with reps", async () => {
    const { selectStretchingExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/stretching-selection"
    );

    const result = await selectStretchingExercises(createMockDb(), 21, "jueves");

    for (const ex of result) {
      // Main-type on purpose (implicit): tagging the whole block "mobility"
      // made every renderer show it empty (UAT 2026-08-18).
      expect(ex.exerciseType).toBeUndefined();
      if (ex.contraction === "ISO") {
        expect(ex.seconds).toBeGreaterThan(0);
        expect(ex.reps).toBe(0);
      } else {
        expect(ex.reps).toBeGreaterThan(0);
        expect(ex.seconds).toBe(0);
      }
    }
  });
});
