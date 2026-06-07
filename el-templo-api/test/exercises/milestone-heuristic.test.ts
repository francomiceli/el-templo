/**
 * Unit test for the milestone proposal engine (`milestone-heuristic.ts`, R1-HEUR
 * phase 133). PURE — no DB, no Fastify app: `proposeMilestones()` takes catalog
 * rows in memory and returns deterministic proposals.
 *
 * Contract under test:
 *   1. Grouping: a TTB-CON-style seed (~20 real-looking names across the
 *      movement families ATW/WINDSHIELD/BENT ARM/OA/90/TTB × steps
 *      TUCK/STRADDLE/FULL) groups by (movement × step); each group has exactly
 *      ONE milestone proposal (proposedMilestoneExerciseId = null) and every
 *      other member points at the milestone's id.
 *   2. Bound: the seed produces ≤13 proposed milestones (goal criterion: 8-13
 *      milestones for the long ladders).
 *   3. Determinism: same input (even reordered) → exactly the same output.
 *   4. No movement detected → movementToken null, proposed as milestone with
 *      LOW confidence (the profe decides).
 *   5. Step is derived LIVE via classify() over the name (the truth
 *      progression_step has 0 rows — Pitfall 6); a non-null acceptedStep
 *      (accepted dimension proposal) takes priority over classify().
 *   6. Milestone selection inside a group: fewest normalized name tokens wins;
 *      tie → lower dificultad_lineal; tie → lower id.
 */

import { describe, it, expect } from "vitest";
import {
  proposeMilestones,
  type CatalogRow,
  type MilestoneProposal,
} from "../../src/modules/exercises/milestone-heuristic";

/** Build one catalog row with sensible TTB CON defaults. */
function row(
  id: number,
  name: string,
  opts: {
    dl?: number;
    route?: string;
    effort?: string;
    acceptedStep?: number | null;
  } = {},
): CatalogRow {
  return {
    id,
    name,
    route: opts.route ?? "TTB",
    effort: opts.effort ?? "CON",
    dificultadLineal: opts.dl ?? 5,
    acceptedStep: opts.acceptedStep ?? null,
  };
}

/**
 * TTB CON seed: 20 real-looking names across 6 movement families × the TTB
 * steps TUCK(0)/STRADDLE(1)/FULL(2). Expected groups → 13 milestones:
 *   (TTB,0) ids 1,2,3      (TTB,1) ids 4,5       (TTB,2) ids 6,7,20
 *   (ATW,0) ids 8,9        (ATW,1) id 10         (ATW,2) id 11
 *   (WINDSHIELD,0) id 12   (WINDSHIELD,2) id 13
 *   (BENT ARM,0) id 14     (BENT ARM,2) id 15
 *   (OA,0) ids 16,17       (OA,1) id 18          (90,2) id 19
 */
function makeTtbSeed(): CatalogRow[] {
  return [
    row(1, "Tuck TTB", { dl: 3 }),
    row(2, "Tuck TTB Negative", { dl: 3 }),
    row(3, "Tuck TTB Hold", { dl: 3 }),
    row(4, "Straddle TTB", { dl: 5 }),
    row(5, "Straddle TTB Negative", { dl: 5 }),
    row(6, "Full TTB", { dl: 7 }),
    row(7, "Full TTB Slow", { dl: 7 }),
    row(8, "TTB ATW Tuck", { dl: 4 }),
    row(9, "TTB ATW Tuck Negative", { dl: 4 }),
    row(10, "TTB ATW Straddle", { dl: 6 }),
    row(11, "TTB ATW Full", { dl: 8 }),
    row(12, "TTB Windshield Tuck", { dl: 4 }),
    row(13, "TTB Windshield Full", { dl: 8 }),
    row(14, "TTB Bent Arm Tuck", { dl: 5 }),
    row(15, "TTB Bent Arm Full", { dl: 9 }),
    row(16, "OA TTB Tuck", { dl: 8 }),
    row(17, "OA TTB Tuck Negative", { dl: 8 }),
    row(18, "OA TTB Straddle", { dl: 10 }),
    row(19, "TTB 90 Full", { dl: 11 }),
    row(20, "Full TTB Negative", { dl: 7 }),
  ];
}

/** Index proposals by exerciseId for direct assertions. */
function byId(proposals: MilestoneProposal[]): Map<number, MilestoneProposal> {
  return new Map(proposals.map((p) => [p.exerciseId, p]));
}

describe("milestone-heuristic (motor puro movimiento × escalón)", () => {
  it("1 — groups a TTB-like seed by (movement × step): one milestone per group, the rest point at it", () => {
    const proposals = proposeMilestones(makeTtbSeed());
    expect(proposals).toHaveLength(20);

    const map = byId(proposals);

    // Spot-check the (TTB, TUCK=0) group: milestone = "Tuck TTB" (id 1).
    expect(map.get(1)?.proposedMilestoneExerciseId).toBeNull();
    expect(map.get(1)?.movementToken).toBe("TTB");
    expect(map.get(1)?.stepRank).toBe(0);
    expect(map.get(2)?.proposedMilestoneExerciseId).toBe(1);
    expect(map.get(3)?.proposedMilestoneExerciseId).toBe(1);

    // Spot-check the (OA, TUCK=0) group: milestone = "OA TTB Tuck" (id 16).
    expect(map.get(16)?.proposedMilestoneExerciseId).toBeNull();
    expect(map.get(16)?.movementToken).toBe("OA");
    expect(map.get(17)?.proposedMilestoneExerciseId).toBe(16);

    // Confidence: grouped-with-movement = 80; singleton-with-movement = 60.
    expect(map.get(1)?.confidence).toBe(80);
    expect(map.get(10)?.confidence).toBe(60);

    // Generic invariant over EVERY (movement, step) group: exactly one
    // milestone, every variant points at exactly that milestone's id.
    const groups = new Map<string, MilestoneProposal[]>();
    for (const p of proposals) {
      expect(p.movementToken).not.toBeNull();
      const key = `${p.movementToken}|${p.stepRank}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      const milestones = group.filter(
        (p) => p.proposedMilestoneExerciseId === null,
      );
      expect(milestones).toHaveLength(1);
      for (const p of group) {
        if (p.proposedMilestoneExerciseId !== null) {
          expect(p.proposedMilestoneExerciseId).toBe(milestones[0].exerciseId);
        }
      }
    }
  });

  it("2 — the seed produces at most 13 proposed milestones (8-13 goal bound)", () => {
    const proposals = proposeMilestones(makeTtbSeed());
    const milestoneCount = proposals.filter(
      (p) => p.proposedMilestoneExerciseId === null,
    ).length;
    expect(milestoneCount).toBeLessThanOrEqual(13);
    expect(milestoneCount).toBeGreaterThanOrEqual(8);
  });

  it("3 — is deterministic: same input (even reordered) returns exactly the same output", () => {
    const first = proposeMilestones(makeTtbSeed());
    const second = proposeMilestones(makeTtbSeed());
    expect(second).toEqual(first);

    const reversed = proposeMilestones([...makeTtbSeed()].reverse());
    expect(reversed).toEqual(first);
  });

  it("4 — no vocab match → movementToken null, proposed as milestone with low confidence", () => {
    const proposals = proposeMilestones([
      // Name matches no TTB movement token.
      row(1, "Banana Hold", { dl: 2 }),
      // Route without a movement vocabulary at all (BL).
      row(2, "Straddle Back Lever", { dl: 6, route: "BL" }),
    ]);
    const map = byId(proposals);

    expect(map.get(1)?.movementToken).toBeNull();
    expect(map.get(1)?.proposedMilestoneExerciseId).toBeNull();
    expect(map.get(1)?.confidence).toBe(40);

    expect(map.get(2)?.movementToken).toBeNull();
    expect(map.get(2)?.proposedMilestoneExerciseId).toBeNull();
    expect(map.get(2)?.confidence).toBe(40);
  });

  it("5 — step comes from classify() live; acceptedStep takes priority when present", () => {
    const proposals = proposeMilestones([
      // acceptedStep (2) wins over classify() ("Tuck" would be step 0).
      row(1, "Tuck TTB", { dl: 3, acceptedStep: 2 }),
      // No acceptedStep → live classify(): STRADDLE = rank 1 in TTB.
      row(2, "Straddle TTB", { dl: 5 }),
    ]);
    const map = byId(proposals);

    expect(map.get(1)?.stepRank).toBe(2);
    expect(map.get(2)?.stepRank).toBe(1);
  });

  it("6 — milestone selection: fewest normalized tokens, then lower dl, then lower id", () => {
    // All four land in the (TTB, FULL=2) group.
    const proposals = proposeMilestones([
      row(1, "Full TTB Negative", { dl: 8 }), // 3 tokens → never the milestone
      row(2, "TTB Full", { dl: 8 }), // 2 tokens, dl 8, id 2 → WINNER
      row(3, "Full TTB", { dl: 9 }), // 2 tokens, dl 9 → loses dl tie-break
      row(4, "TTB Full", { dl: 8 }), // 2 tokens, dl 8, id 4 → loses id tie-break
    ]);
    const map = byId(proposals);

    expect(map.get(2)?.proposedMilestoneExerciseId).toBeNull();
    expect(map.get(1)?.proposedMilestoneExerciseId).toBe(2);
    expect(map.get(3)?.proposedMilestoneExerciseId).toBe(2);
    expect(map.get(4)?.proposedMilestoneExerciseId).toBe(2);
  });
});
