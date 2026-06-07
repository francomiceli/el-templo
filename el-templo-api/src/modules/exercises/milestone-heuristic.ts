/**
 * milestone-heuristic.ts — R1-HEUR (phase 133): deterministic milestone
 * proposal engine over the exercise catalog (movimiento × escalón).
 *
 * Within each `(route × effort)` partition, every exercise is classified along
 * two axes:
 *   - MOVEMENT: the first token of the route's `MOVEMENT_VOCAB` that appears
 *     (as a contiguous whole-word phrase) in the normalized name. The vocab is
 *     declared most-specific-first, so declaration order IS the priority
 *     ("OA" must be checked before "TTB" because every one-arm TTB name also
 *     contains "TTB").
 *   - STEP: `acceptedStep` (the profe-corrected `proposed_step` of an ACCEPTED
 *     dimension proposal) when present, otherwise `classify(name, route).step`
 *     LIVE — the truth column `progression_step` has 0 populated rows
 *     (Pitfall 6), so the engine must never read it.
 *
 * Exercises sharing (movement × step) form one group; the engine proposes
 * exactly ONE milestone per group — the most canonical name: fewest normalized
 * tokens, tie-break lower `dificultad_lineal`, then lower id. Every other
 * member is proposed as a VARIANT pointing at the milestone's id.
 *
 * Exercises with NO detected movement (name matches no token, or the route has
 * no vocabulary yet) are NOT grouped: each is proposed as its own milestone
 * with LOW confidence — the profe decides in the review drawer.
 *
 * PURE module: no DB access, no side effects (catalog loading lives in the
 * CLI `bootstrap-milestones.ts`). The truth column
 * `exercises.milestone_exercise_id` is NEVER written from a proposal — only
 * the profe's transactional accept does that (phase-125 boundary).
 *
 * Extending `MOVEMENT_VOCAB` with more routes/tokens is cheap and EXPECTED:
 * the seed below covers the long partitions verified in 133-RESEARCH (TTB,
 * FL, OAP, OAPU). A route absent from the vocab simply yields movement = null
 * for all its exercises (each proposed as milestone, profe curates).
 */

import {
  classify,
  normalizeRoute,
  normalizeWords,
  phraseAppears,
} from "./route-progression-map";

/** A catalog row the engine consumes (loaded by the bootstrap CLI, never here). */
export interface CatalogRow {
  id: number;
  name: string;
  route: string;
  effort: string;
  dificultadLineal: number;
  /**
   * `proposed_step` from `exercise_dimension_proposals` ONLY when the proposal
   * status is 'accepted' (profe-corrected step); otherwise null.
   */
  acceptedStep: number | null;
}

/** One milestone proposal emitted per catalog row. */
export interface MilestoneProposal {
  exerciseId: number;
  /** NULL = proposed as MILESTONE (backbone); NOT NULL = variant of that id. */
  proposedMilestoneExerciseId: number | null;
  movementToken: string | null;
  stepRank: number | null;
  confidence: number;
}

/**
 * Declarative movement-family vocabulary per route, MOST-SPECIFIC-FIRST: the
 * engine returns the FIRST declared token that appears in the normalized name,
 * so order encodes priority (e.g. "OA TTB Tuck" must classify as OA, not TTB).
 * Keys are normalized route codes. Adding routes/tokens here is the expected
 * cheap way to widen coverage.
 */
export const MOVEMENT_VOCAB: Readonly<Record<string, readonly string[]>> = {
  // TTB CON is the longest partition (102 ejercicios, 133-RESEARCH §R1).
  TTB: ["ATW", "WINDSHIELD", "BENT ARM", "OA", "90", "TTB"],
  FL: [
    "ICE CREAM MAKER",
    "PULL UP",
    "RAISE",
    "TOUCH",
    "PRESS",
    "FRONT LEVER",
    "FL",
  ],
  OAP: ["CHIN UP", "PULL UP", "OAP"],
  OAPU: ["PUSH UP", "OAPU"],
};

/** Confidence per proposal kind (the profe re-reviews regardless). */
const CONFIDENCE = {
  /** Movement detected and the group has >1 member — real grouping signal. */
  grouped: 80,
  /** Movement detected but the exercise is alone on its (movement, step). */
  singletonWithMovement: 60,
  /** No movement detected — proposed as milestone, profe decides. */
  noMovement: 40,
} as const;

/** A vocab token compiled to normalized words for phrase matching. */
interface CompiledMovementToken {
  readonly token: string;
  readonly words: string[];
}

/** MOVEMENT_VOCAB compiled once at module load (pattern: COMPILED in the map). */
const COMPILED_VOCAB: ReadonlyMap<string, readonly CompiledMovementToken[]> =
  new Map(
    Object.entries(MOVEMENT_VOCAB).map(([route, tokens]) => [
      normalizeRoute(route),
      tokens.map((t) => ({ token: t, words: normalizeWords(t) })),
    ]),
  );

/** First declared vocab token appearing in the name words, or null. */
function detectMovement(nameWords: string[], routeKey: string): string | null {
  const candidates = COMPILED_VOCAB.get(routeKey);
  if (!candidates) return null;
  for (const c of candidates) {
    if (phraseAppears(nameWords, c.words)) return c.token;
  }
  return null;
}

/** One row enriched with its derived movement/step axes. */
interface ClassifiedRow {
  readonly row: CatalogRow;
  readonly movement: string | null;
  readonly step: number | null;
  /** Normalized token count of the name — canonicality metric. */
  readonly tokenCount: number;
}

/**
 * "More canonical" comparator winner: fewest normalized tokens, then lower
 * dificultad_lineal, then lower id. Total order → deterministic regardless of
 * input order.
 */
function moreCanonical(a: ClassifiedRow, b: ClassifiedRow): ClassifiedRow {
  if (a.tokenCount !== b.tokenCount) {
    return a.tokenCount < b.tokenCount ? a : b;
  }
  if (a.row.dificultadLineal !== b.row.dificultadLineal) {
    return a.row.dificultadLineal < b.row.dificultadLineal ? a : b;
  }
  return a.row.id <= b.row.id ? a : b;
}

/**
 * Pure grouping engine — proposes one milestone per (movement × step) group
 * within each (route × effort) partition. Output is sorted by exerciseId so
 * two runs over the same input (in any order) are byte-identical.
 */
export function proposeMilestones(rows: CatalogRow[]): MilestoneProposal[] {
  // 1. Partition by (route × effort) — partitions never mix.
  const partitions = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const routeKey = normalizeRoute(row.route);
    const nameWords = normalizeWords(row.name);
    const classified: ClassifiedRow = {
      row,
      movement: detectMovement(nameWords, routeKey),
      // acceptedStep (profe-corrected) wins; otherwise classify() LIVE.
      step: row.acceptedStep ?? classify(row.name, row.route).step,
      tokenCount: nameWords.length,
    };
    const partitionKey = `${routeKey}|${row.effort.trim().toUpperCase()}`;
    const partition = partitions.get(partitionKey);
    if (partition) {
      partition.push(classified);
    } else {
      partitions.set(partitionKey, [classified]);
    }
  }

  const proposals: MilestoneProposal[] = [];

  // 2. Within each partition: group by (movement, step) and pick milestones.
  for (const partition of partitions.values()) {
    const groups = new Map<string, ClassifiedRow[]>();
    for (const cr of partition) {
      if (cr.movement === null) {
        // No movement detected → ungrouped milestone, low confidence.
        proposals.push({
          exerciseId: cr.row.id,
          proposedMilestoneExerciseId: null,
          movementToken: null,
          stepRank: cr.step,
          confidence: CONFIDENCE.noMovement,
        });
        continue;
      }
      const groupKey = `${cr.movement}|${cr.step ?? "none"}`;
      const group = groups.get(groupKey);
      if (group) {
        group.push(cr);
      } else {
        groups.set(groupKey, [cr]);
      }
    }

    for (const group of groups.values()) {
      const milestone = group.reduce(moreCanonical);
      const confidence =
        group.length > 1
          ? CONFIDENCE.grouped
          : CONFIDENCE.singletonWithMovement;
      for (const cr of group) {
        proposals.push({
          exerciseId: cr.row.id,
          proposedMilestoneExerciseId:
            cr.row.id === milestone.row.id ? null : milestone.row.id,
          movementToken: cr.movement,
          stepRank: cr.step,
          confidence,
        });
      }
    }
  }

  // 3. Deterministic output order.
  proposals.sort((a, b) => a.exerciseId - b.exerciseId);
  return proposals;
}
