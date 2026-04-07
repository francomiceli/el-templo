/**
 * Playbook Engine — Profile Tag Parser
 *
 * Pure module that parses and strips Mica's structured `<profile>VALUE</profile>`
 * tag from her assistant text during PB1 discovery. The handler reads the tag
 * to persist the detected `AvatarProfile` into Redis playbook state, then
 * strips it before sending the user-facing message.
 *
 * Why a structured tag instead of a tool call:
 * - Pure rule-based detection cannot handle Spanish nuance ("vengo de crossfit",
 *   "arranqué hace años pero paré").
 * - A dedicated tool would burn an extra model turn for a single enum write.
 * - A tag is parser-testable end-to-end, reuses the existing model turn, and
 *   degrades silently when the model forgets it (no false positives).
 *
 * Pure: no IO, no logger, no Date, no mutation of inputs. Idempotent.
 */

import type { AvatarProfile } from "./types.js";

/**
 * Valid avatar values that Mica is allowed to emit inside a `<profile>` tag.
 * Must match `AvatarProfile` exactly. The parity test in
 * `test/playbook-profile-tag.test.ts` asserts this list stays in sync.
 */
const VALID_AVATARS: readonly AvatarProfile[] = [
  "cero_absoluto",
  "gym_crossover",
  "intermedio",
  "retorna",
];

/**
 * Regex that matches a `<profile>VALUE</profile>` tag anywhere in the text.
 *
 * - Captures the value in group 1.
 * - Case-insensitive on the tag name (so `<Profile>` also matches).
 * - The captured value is lowercased before validation, so models that emit
 *   `<Profile>Intermedio</Profile>` still parse cleanly.
 * - Tolerates internal whitespace inside the tag (`<profile>  intermedio  </profile>`).
 * - Strict on the tag delimiters: `< profile >` (with spaces around the tag
 *   name) is REJECTED — the parser only accepts exact `<profile>` / `</profile>`.
 */
export const PROFILE_TAG_REGEX = /<profile>\s*([a-z_]+)\s*<\/profile>/i;

/**
 * Extract the FIRST valid avatar value from a `<profile>...</profile>` tag
 * in the assistant text. Returns `null` when no tag is present, the tag is
 * malformed, or the captured value is not a recognized avatar.
 *
 * Pure: no IO, no side effects, idempotent across repeated calls.
 */
export function extractProfileTag(text: string): AvatarProfile | null {
  const match = text.match(PROFILE_TAG_REGEX);
  if (!match || !match[1]) {
    return null;
  }
  const candidate = match[1].toLowerCase();
  return (VALID_AVATARS as readonly string[]).includes(candidate)
    ? (candidate as AvatarProfile)
    : null;
}

/**
 * Remove ALL `<profile>...</profile>` tags from the text and return a
 * cleaned-up string ready to send to the user. Also collapses any
 * trailing-whitespace-before-newline introduced by removing an inline tag,
 * and trims the result.
 *
 * Pure: does not mutate the input string.
 */
export function stripProfileTag(text: string): string {
  // Global variant of PROFILE_TAG_REGEX for full removal across the message.
  const globalRegex = /<profile>\s*[a-z_]+\s*<\/profile>/gi;
  return text
    .replace(globalRegex, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
