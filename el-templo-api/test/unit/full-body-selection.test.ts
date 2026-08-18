/**
 * Unit tests for the full-body cooperative circuit selection (combos-day
 * closing block, UAT 2026-08-18).
 *
 * `pickFullBodyCircuitExercises` is a pure function over an in-memory pool —
 * no DB, runs in CI. The DB-facing wrapper (`selectFullBodyCircuitExercises`)
 * only fetches the pool via `queryFullBodyCircuitPool` and maps the picks to
 * the cooperative prescription (CON 100 / ISO 200s / rest 60), asserted here
 * through a mocked pool.
 */

import { describe, it, expect, vi } from "vitest";
import type { FullBodyPoolRow } from "../../src/modules/sessions/pipeline/utils/mobility-selection";

const { mockQueryFullBodyCircuitPool } = vi.hoisted(() => ({
  mockQueryFullBodyCircuitPool: vi.fn(),
}));

vi.mock("../../src/modules/sessions/pipeline/utils/mobility-selection", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/sessions/pipeline/utils/mobility-selection")
  >("../../src/modules/sessions/pipeline/utils/mobility-selection");
  return {
    ...actual,
    queryFullBodyCircuitPool: mockQueryFullBodyCircuitPool,
  };
});

const POOL: FullBodyPoolRow[] = [
  { id: 1, name: "Push Easy", effort: "CON", pattern: "PUSH", dificultadLineal: 1 },
  { id: 2, name: "Push Hard", effort: "CON", pattern: "PUSH", dificultadLineal: 9 },
  { id: 3, name: "Lower Easy", effort: "CON", pattern: "LOWER", dificultadLineal: 2 },
  { id: 4, name: "Lower Hard", effort: "CON", pattern: "LOWER", dificultadLineal: 11 },
  { id: 5, name: "Core Iso", effort: "ISO", pattern: "CORE", dificultadLineal: 1 },
  { id: 6, name: "Pull Mid", effort: "CON", pattern: "PULL", dificultadLineal: 5 },
];

describe("pickFullBodyCircuitExercises", () => {
  it("picks one exercise per movement group (PUSH / LOWER / CORE-or-PULL)", async () => {
    const { pickFullBodyCircuitExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/full-body-selection"
    );

    const picked = pickFullBodyCircuitExercises(POOL, 27, "miercoles", "spartan");
    expect(picked).toHaveLength(3);
    const patterns = picked.map((p) => p.pattern);
    expect(patterns.filter((p) => p === "PUSH")).toHaveLength(1);
    expect(patterns.filter((p) => p === "LOWER")).toHaveLength(1);
    expect(patterns.filter((p) => p === "CORE" || p === "PULL")).toHaveLength(1);
  });

  it("caps difficulty by member level (alfa never sees dificultadLineal > 3)", async () => {
    const { pickFullBodyCircuitExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/full-body-selection"
    );

    for (let week = 1; week <= 20; week++) {
      const picked = pickFullBodyCircuitExercises(POOL, week, "miercoles", "alfa");
      for (const ex of picked) {
        expect(ex.dificultadLineal).toBeLessThanOrEqual(3);
      }
    }
  });

  it("is deterministic for the same (week, day) and identical for levels sharing a cap (kairos = alfa)", async () => {
    const { pickFullBodyCircuitExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/full-body-selection"
    );

    const a = pickFullBodyCircuitExercises(POOL, 27, "miercoles", "alfa");
    const b = pickFullBodyCircuitExercises(POOL, 27, "miercoles", "alfa");
    const k = pickFullBodyCircuitExercises(POOL, 27, "miercoles", "kairos");
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(k.map((p) => p.id)).toEqual(a.map((p) => p.id));
  });

  it("skips a movement group whose pool is empty instead of failing", async () => {
    const { pickFullBodyCircuitExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/full-body-selection"
    );

    const noLower = POOL.filter((p) => p.pattern !== "LOWER");
    const picked = pickFullBodyCircuitExercises(noLower, 27, "miercoles", "spartan");
    expect(picked).toHaveLength(2);
    expect(picked.map((p) => p.pattern)).not.toContain("LOWER");
  });
});

describe("selectFullBodyCircuitExercises", () => {
  it("maps picks to the cooperative prescription: CON 100 reps / ISO 200s, rest 60, main type", async () => {
    mockQueryFullBodyCircuitPool.mockResolvedValue(POOL);
    const { selectFullBodyCircuitExercises } = await import(
      "../../src/modules/sessions/pipeline/utils/full-body-selection"
    );

    const result = await selectFullBodyCircuitExercises(
      {} as Parameters<typeof selectFullBodyCircuitExercises>[0],
      27,
      "miercoles",
      "spartan",
    );

    expect(result).toHaveLength(3);
    for (const ex of result) {
      expect(ex.rest).toBe(60);
      expect(ex.exerciseType).toBeUndefined();
      if (ex.contraction === "ISO") {
        expect(ex.seconds).toBe(200);
        expect(ex.reps).toBe(0);
      } else {
        expect(ex.contraction).toBe("CON");
        expect(ex.reps).toBe(100);
        expect(ex.seconds).toBe(0);
      }
    }
  });
});
