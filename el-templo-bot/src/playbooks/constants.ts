/**
 * Playbook Constants — Tunable PB1 Thresholds
 *
 * Holds tunable per-playbook behavior thresholds.
 *
 * v5.3.3 Phase 99 (PRICE-02): price-insistence disclosure unlock threshold.
 * Per CONTEXT.md PRICE-02 (Option B locked): hold prices for the first 2
 * price-insistences within PB1 (continue nudging the free trial), then on
 * the 3rd price request disclose real DB plan prices via the existing
 * check_membership available-plans path while still re-anchoring the free
 * trial.
 *
 * Env override `PB1_PRICE_INSISTENCE_THRESHOLD` is read once at module load
 * and parsed into a finite positive integer; invalid values (NaN, negative,
 * non-integer) fall through to the default 2 with a pino warn — we do NOT
 * throw at module load (mirrors the silent-degrade pattern used in
 * memory/playbook-state.ts and memory/session.ts).
 *
 * Sub-option A discipline (locked): the unlock is purely additive in
 * system-prompt.ts when `disclosureUnlocked` is true. The static PB1.E4
 * REGLA FUERTE in playbooks/definitions.ts is UNCHANGED — when the
 * addendum is NOT injected, the rendered prompt is byte-identical to
 * pre-Phase-99 state.
 */

import pino from "pino";

const log = pino({ name: "el-templo-bot:playbook-constants" });

/**
 * Default disclosure-unlock threshold when env override is absent or invalid.
 * Default 2 → disclose on the 3rd price-objection-style inbound
 * (see `shouldDisclosePrices` comparison rationale below).
 */
const DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD = 2;

/**
 * Parse the env override once at module load. Returns the default when the
 * value is missing, not a finite number, not an integer, or negative.
 */
function resolveThreshold(): number {
  const raw = process.env.PB1_PRICE_INSISTENCE_THRESHOLD;
  if (raw === undefined || raw === "") {
    return DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    log.warn(
      { raw, default: DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD },
      "Invalid PB1_PRICE_INSISTENCE_THRESHOLD env value; falling back to default",
    );
    return DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD;
  }
  return parsed;
}

/**
 * v5.3.3 Phase 99 (PRICE-02): single tunable threshold for PB1 price
 * disclosure. Default 2 means "disclose on the 3rd price request" — see
 * `shouldDisclosePrices` for the comparison contract.
 *
 * Resolved once at module load from `process.env.PB1_PRICE_INSISTENCE_THRESHOLD`
 * (validated to a finite non-negative integer; otherwise default 2).
 */
export const PB1_PRICE_INSISTENCE_THRESHOLD: number = resolveThreshold();

/**
 * v5.3.3 Phase 99 (PRICE-02): single source of truth for the
 * disclosure-unlock decision.
 *
 * Contract: returns `true` when the counter (post-increment value of
 * `priceInsistenceCount`) is STRICTLY GREATER than `PB1_PRICE_INSISTENCE_THRESHOLD`.
 *
 * Worked example with default threshold = 2:
 *   - 1st price objection: counter becomes 1. `1 > 2` is false → hold.
 *   - 2nd price objection: counter becomes 2. `2 > 2` is false → hold.
 *   - 3rd price objection: counter becomes 3. `3 > 2` is true  → disclose.
 *
 * This is the "disclose on the 3rd request" semantics locked in
 * CONTEXT.md PRICE-02 (Option B). The off-by-one rationale: the threshold
 * names how many insistences are tolerated (default 2 = "tolerate 2, unlock
 * on the 3rd"), so the comparison is strict-greater rather than
 * greater-or-equal.
 *
 * `undefined` is treated as 0 (matches the pre-99 backward-compat semantics
 * for the optional `priceInsistenceCount` field on PlaybookSessionState).
 */
export function shouldDisclosePrices(count: number | undefined): boolean {
  return (count ?? 0) > PB1_PRICE_INSISTENCE_THRESHOLD;
}
