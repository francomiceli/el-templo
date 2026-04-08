/**
 * Shared avatar keyword contract for v5.3 AVAT-05.
 *
 * Source of truth for the per-avatar tone keywords that AVATAR_TONE_GUIDES
 * in `src/ai/system-prompt.ts` MUST contain verbatim. Extracted from
 * `avatar-tone-guide.test.ts` in phase 85-02 (DRY — both that suite and
 * `playbook-flow-coverage.test.ts` import from here). If a tone guide is
 * reworded in the source prose, update this map in lockstep and both
 * suites will catch any drift.
 *
 * The phrases must be:
 *   (a) unique per avatar (no cross-avatar overlap),
 *   (b) lowercase so WhatsApp bold asterisks don't fragment substring
 *       matches,
 *   (c) substantive enough that a reworded sentence would genuinely lose
 *       the intended tone (not just incidental filler words).
 *
 * Pure module: no imports beyond the AvatarProfile type, no runtime
 * behavior, safe to import from any pure test.
 */

import type { AvatarProfile } from "../../src/playbooks/types.js";

export const ALL_AVATARS: AvatarProfile[] = [
  "cero_absoluto",
  "gym_crossover",
  "intermedio",
  "retorna",
];

export const AVATAR_KEYWORDS: Record<AvatarProfile, [string, string]> = {
  cero_absoluto: ["primer paso", "sin saber nada"],
  gym_crossover: ["ya tenés base", "cambio de estímulo"],
  intermedio: ["siguiente nivel", "afinar técnica"],
  retorna: ["volver con cabeza", "retomar sin romperte"],
};

export const ALL_AVATAR_KEYWORDS: string[] = ALL_AVATARS.flatMap(
  (a) => AVATAR_KEYWORDS[a],
);
