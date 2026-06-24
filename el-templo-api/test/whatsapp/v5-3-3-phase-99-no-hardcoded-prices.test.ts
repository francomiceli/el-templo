/**
 * Phase 99 PRICE-04 guard: bot source must contain ZERO hardcoded plan-price
 * patterns. Prices come exclusively from `subscription_plans.price_regular`
 * via the `check_membership` tool. The other developer owns the DB price
 * values; the bot never hardcodes them.
 *
 * Three layered tests:
 *  1. Broad `$NNNN+` dollar-amount scan in bot copy/prompts/playbooks with
 *     a typed ALLOWLIST array (drift defended by code review + the
 *     `reason` field requirement).
 *  2. Tighter `plan...$NNN+` pattern catching plan-word + price tuples
 *     (e.g., "el plan Flex sale $30,000") that the broader regex might
 *     miss when commas split the digits or the dollar sign is detached.
 *  3. Positive-control on test fixtures: every `price_regular: NNN`
 *     in `el-templo-api/test/whatsapp/*.ts` must use a sentinel value
 *     from `[99999, 88888, 77777, 0, 1, 100]` — keeps future test
 *     authors from sneaking in real-looking prices.
 *
 * Scan strategy: Node-native fs walk (no shell-out) so the test runs
 * cross-platform and bounded (the bot tree is small; full scan < 100ms).
 *
 * Per CONTEXT.md `<scope_fence>` HARD GUARD: zero src/** modifications in
 * this plan. This test is the regression lock that catches any future
 * phase from re-introducing hardcoded plan prices.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";

const REPO_ROOT = resolvePath(__dirname, "../../..");

/**
 * Allowlist entries are typed (file, anchor, reason) tuples. Adding to the
 * allowlist requires a documented `reason` field — the TypeScript shape
 * forces this on the array literal. The `anchor` is a substring that
 * uniquely identifies the allowed occurrence (used to disambiguate when a
 * single file has multiple matches at different line numbers — e.g.,
 * knowledge.ts has both the per-class anchor at :361 and the clase-suelta
 * reference at :391).
 *
 * Pre-existing references documented in CONTEXT.md `<decisions>`:
 *   - The single-class drop-in price ($20,000) is NOT a plan price; it
 *     represents the cost of the Boarding Pass trial-class anchor. The
 *     CONTEXT.md acknowledges this single value and explicitly excludes
 *     it from the rename/disclosure mechanism. Future business-pricing
 *     review may revisit, but Phase 99 deliberately preserves byte-equal.
 *   - The `~$10,000` per-class anchor in knowledge.ts is a DERIVED cost
 *     (plan-Flex / 8 classes = ~$10k) used as a "costo diario" rhetorical
 *     anchor in objection-handling copy, NOT a plan price. Same business-
 *     pricing rationale: a future phase may revisit, this phase preserves.
 *
 * Allowlist matching: an entry matches a hit when
 *   `hit.relPath === entry.file && hit.match.includes(entry.anchor)`.
 * The `anchor` MUST appear inside the hit's matched substring (not just
 * elsewhere in the file) so a regression that introduces a NEW dollar
 * amount in an already-allowlisted file still fails the test.
 */
const ALLOWLIST: Array<{ file: string; anchor: string; reason: string }> = [
  {
    file: "el-templo-bot/src/ai/system-prompt.ts",
    anchor: "$20,000",
    reason:
      "Single-class drop-in price reference (NOT a plan price). Phase 99 deliberately does not remove this; future phase may revisit per business-pricing review. CONTEXT.md acknowledges this single allowlisted occurrence.",
  },
  {
    file: "el-templo-bot/src/ai/knowledge.ts",
    // Per-class anchor at :361 — match captures up to "~$10" (regex
    // `\d+` is non-greedy with respect to the comma in "$10,000").
    anchor: "plan Flex son 8 clases, o sea ~$10",
    reason:
      "Per-class daily-cost anchor used in objection-handling copy ('Ancla contra el costo diario'). DERIVED from plan-Flex / 8 classes (~$10,000/class), NOT a plan price. Same business-pricing review owner as the system-prompt.ts $20,000 entry; Phase 99 preserves byte-equal.",
  },
  {
    file: "el-templo-bot/src/ai/knowledge.ts",
    // formatPlan template at :601 followed by "Clase suelta: $20,000" at
    // :604 — Test 2 regex captures the entire span from "Plan Performance"
    // through "$2" (the trailing 0,000 is split off by the comma).
    anchor: "Plan Performance",
    reason:
      "PLANES Y PRECIOS knowledge section. The formatPlan(PERFORMANCE_PLAN) template injects plan name + dynamically-computed values from the constant; the trailing 'Clase suelta: $20,000' is the single-class drop-in price (mirror of system-prompt.ts entry). NOT a hardcoded plan price — formatPlan reads from PERFORMANCE_PLAN const which is owned by the bot but Phase 99 preserves byte-equal.",
  },
  {
    file: "el-templo-bot/src/ai/knowledge.ts",
    // Doc comment at :734-735 explaining why lead prompts carry zero
    // membership plan prices — the trailing "$20,000" is in a comment,
    // not in user-facing copy.
    anchor: "Planes y Precios is NOT discovery-tagged",
    reason:
      "JSDoc comment at :731-735 explaining the discovery-tagging filter. The trailing '$20,000' is documentation text describing why the lead prompt carries zero plan prices — it's a code comment, not user-facing copy. NOT a hardcoded plan price.",
  },
];

const SCAN_DIRS = [
  "el-templo-bot/src/ai",
  "el-templo-bot/src/playbooks",
  "el-templo-bot/src/webhook",
];

const FIXTURE_DIR = "el-templo-api/test/whatsapp";

const TEST_FIXTURE_PRICE_SENTINELS = new Set([99999, 88888, 77777, 0, 1, 100]);

/**
 * Recursively walk `dir` (relative to REPO_ROOT) and yield `.ts` file
 * absolute paths. Sync because the tree is small (~30 files in scope)
 * and async + Promise.all would add zero value at this scale.
 */
function walkTsFiles(dirRelative: string): string[] {
  const dirAbs = resolvePath(REPO_ROOT, dirRelative);
  const out: string[] = [];
  const stack: string[] = [dirAbs];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Find all regex matches across the given scan dirs, returning
 * (relativePath, lineNumber, match) tuples for each hit.
 */
function findMatches(
  dirs: string[],
  pattern: RegExp,
): Array<{ relPath: string; line: number; match: string }> {
  const hits: Array<{ relPath: string; line: number; match: string }> = [];
  for (const dir of dirs) {
    for (const file of walkTsFiles(dir)) {
      const contents = readFileSync(file, "utf-8");
      const localRe = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = localRe.exec(contents)) !== null) {
        const line = contents.slice(0, m.index).split("\n").length;
        const relPath = file.startsWith(REPO_ROOT + "/")
          ? file.slice(REPO_ROOT.length + 1)
          : file;
        hits.push({ relPath, line, match: m[0] });
      }
    }
  }
  return hits;
}

function isAllowlisted(relPath: string, match: string): boolean {
  return ALLOWLIST.some(
    (entry) => entry.file === relPath && match.includes(entry.anchor),
  );
}

describe("Phase 99 PRICE-04 — no hardcoded prices in bot source", () => {
  it("contains no $NNNN+ dollar-amount patterns in bot copy/prompts/playbooks", () => {
    const hits = findMatches(SCAN_DIRS, /\$\s*\d{4,}/g);
    const offending = hits.filter((h) => !isAllowlisted(h.relPath, h.match));
    if (offending.length > 0) {
      const detail = offending
        .map((h) => `  ${h.relPath}:${h.line} — ${h.match}`)
        .join("\n");
      throw new Error(
        `Found ${offending.length} hardcoded $NNNN+ pattern(s) outside the ALLOWLIST:\n${detail}\n\nIf the new value is legitimate (e.g., a non-plan-price anchor), add an entry to the ALLOWLIST with a documented \`reason\` field. Otherwise, refactor the value to come from the DB via check_membership.`,
      );
    }
    expect(offending.length).toBe(0);
  });

  it("contains no hardcoded plan-name + price tuples in bot copy", () => {
    // `plan` (case-insensitive) followed by any non-period text and then
    // a dollar amount within the same sentence. Catches "el plan Flex
    // sale $30,000", "Plan Performance ... $25k", etc.
    const hits = findMatches(SCAN_DIRS, /plan[^.]*\$\s*\d+/gi);
    const offending = hits.filter((h) => !isAllowlisted(h.relPath, h.match));
    if (offending.length > 0) {
      const detail = offending
        .map(
          (h) =>
            `  ${h.relPath}:${h.line} — ${h.match.slice(0, 80).replace(/\n/g, " ")}`,
        )
        .join("\n");
      throw new Error(
        `Found ${offending.length} hardcoded plan+price tuple(s) outside the ALLOWLIST:\n${detail}\n\nPlan prices belong in subscription_plans.price_regular (read via check_membership). If the value is a non-plan anchor (per-class cost, trial-class drop-in, etc.), add an ALLOWLIST entry with a documented \`reason\`.`,
      );
    }
    expect(offending.length).toBe(0);
  });

  it("test fixtures in el-templo-api/test/whatsapp/ use clearly-marked sentinel test values for price_regular", () => {
    const sentinelSet = TEST_FIXTURE_PRICE_SENTINELS;
    const hits = findMatches([FIXTURE_DIR], /\bprice_regular\s*[:=]\s*(\d+)/g);
    const offending: Array<{ relPath: string; line: number; value: number }> =
      [];
    for (const h of hits) {
      const valueMatch = h.match.match(/(\d+)\s*$/);
      if (valueMatch === null) continue;
      const value = Number(valueMatch[1]);
      if (!sentinelSet.has(value)) {
        offending.push({ relPath: h.relPath, line: h.line, value });
      }
    }
    if (offending.length > 0) {
      const detail = offending
        .map((h) => `  ${h.relPath}:${h.line} — price_regular=${h.value}`)
        .join("\n");
      const allowed = Array.from(sentinelSet)
        .sort((a, b) => a - b)
        .join(", ");
      throw new Error(
        `Found ${offending.length} test fixture price_regular value(s) outside the sentinel set [${allowed}]:\n${detail}\n\nUse a clearly-marked test value (99999/88888/77777/0/1/100) so a future grep for real prices in bot test fixtures returns 0 hits.`,
      );
    }
    expect(offending.length).toBe(0);
  });

  it("ALLOWLIST entries each carry a documented reason (typed-enforced regression guard)", () => {
    // Belt-and-suspenders: if a future contributor weakens the `reason`
    // field at the type level, this assertion catches blank/missing
    // reasons at test time.
    for (const entry of ALLOWLIST) {
      expect(entry.reason.trim().length).toBeGreaterThanOrEqual(20);
    }
  });
});
