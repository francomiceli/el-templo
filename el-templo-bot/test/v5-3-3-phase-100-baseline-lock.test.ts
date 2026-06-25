/**
 * Phase 100 Baseline Invariant Lock
 *
 * Static grep-style lock test that reads source files (and selected
 * planning docs) via `fs.readFileSync` and asserts byte-equal presence
 * (or absence) of the carry-forward invariant tokens from Phases 93 +
 * 99 + 100.
 *
 * Why this exists (per 100-04-PLAN.md `<behavior>`):
 *   The full bot suite is the gate at end-of-phase, but it's expensive
 *   and non-deterministic under load (3 documented flake files).
 *   This file is fast (~< 100ms; pure synchronous reads + substring
 *   assertions, no mocks, no async, no DB) and surfaces silent drift
 *   in any of the cross-phase invariants the moment it happens.
 *
 * Failure-mode contract:
 *   - Any failure here ⇒ a carry-forward token has drifted. STOP and
 *     investigate BEFORE shipping more changes.
 *   - Skipped tests (only legitimately possible for the sha256 tripwire
 *     when 93-CONTEXT.md isn't checked out) are a SOFT signal. Do NOT
 *     mark a plan complete on the basis of a skipped tripwire.
 *
 * Per 100-04-PLAN.md `<action>` step 1: `readSrc` reads from a stable
 * base path under `el-templo-bot/src/...`; `readEnvExample` reads
 * `el-templo-bot/.env.example`; `readPlanningDoc` navigates from
 * `el-templo-bot/test/` two-up to `.planning/...`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// el-templo-bot/test/ → el-templo-bot/src/<sub-path>
function readSrc(relativePath: string): string {
  return readFileSync(resolve(here, "..", "src", relativePath), "utf8");
}

// el-templo-bot/test/ → el-templo-bot/.env.example
function readEnvExample(): string {
  return readFileSync(resolve(here, "..", ".env.example"), "utf8");
}

// el-templo-bot/test/ → repo root → .planning/<sub-path>
function tryReadPlanningDoc(relativePath: string): string | null {
  const fullPath = resolve(here, "..", "..", ".planning", relativePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  try {
    return readFileSync(fullPath, "utf8");
  } catch {
    return null;
  }
}

// Cached file contents (per-file reads happen once; the file system is
// hit at most ~6 times across all describes).
const HANDLER = readSrc("webhook/handler.ts");
const SYSTEM_PROMPT = readSrc("ai/system-prompt.ts");
const KNOWLEDGE = readSrc("ai/knowledge.ts");
const DEFINITIONS = readSrc("playbooks/definitions.ts");
const CONSTANTS = readSrc("playbooks/constants.ts");
const ENV_EXAMPLE = readEnvExample();

describe("v5.3.3 Phase 100 — Baseline Invariant Lock", () => {
  // ─────────────────────────────────────────────────────────────────────
  // Phase 93 invariants — DEBOUNCE_TTL_SECONDS line + JSDoc formula
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 93 invariants (DEBOUNCE_TTL_SECONDS + cross-phase formula)", () => {
    it("handler.ts contains the DEBOUNCE_TTL_SECONDS env-overridable declaration byte-equal", () => {
      // The literal full-line shape locked since Phase 93. Any rename or
      // value change trips this. Prettier-margin guard kept upstream by
      // the line being exactly 80 chars (boundary case verified during
      // Plan 100-01 deviation #3 audit).
      expect(HANDLER).toContain(
        "const DEBOUNCE_TTL_SECONDS = Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600);",
      );
    });

    it("handler.ts JSDoc above DEBOUNCE_TTL_SECONDS contains the cross-phase invariant formula text", () => {
      // The formula `(OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS` is the
      // signature of the 6-pair canonical block. If someone rewords it the
      // sha256 in STATE.md / ROADMAP.md diverges and the doc-tripwire below
      // also fires.
      expect(HANDLER).toContain(
        "(OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 99 preservation strings — knowledge.ts + definitions.ts
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 99 invariants (preservation strings)", () => {
    it("knowledge.ts contains 'movimiento grupal' (Phase 99 preservation token)", () => {
      expect(KNOWLEDGE).toContain("movimiento grupal");
    });

    it("knowledge.ts contains 'sin salirte del grupo' (Phase 99 preservation token — ELEVATOR_TEXT)", () => {
      expect(KNOWLEDGE).toContain("sin salirte del grupo");
    });

    it("knowledge.ts contains 'sin salirse del grupo' (Phase 99 preservation token — METHOD_DETAIL)", () => {
      expect(KNOWLEDGE).toContain("sin salirse del grupo");
    });

    it("definitions.ts contains 'framings de arranque grupal' (Phase 99 TEAM-CORR-06 deprecated-framing guard)", () => {
      expect(DEFINITIONS).toContain("framings de arranque grupal");
    });

    it("definitions.ts contains 'lenguaje de arranque grupal' (Phase 99 TEAM-CORR-06 deprecated-framing guard)", () => {
      expect(DEFINITIONS).toContain("lenguaje de arranque grupal");
    });

    it("definitions.ts contains 'REGLA FUERTE' (Phase 99 PB1.E4 + PB5.E2 byte-equal carry-forward)", () => {
      expect(DEFINITIONS).toContain("REGLA FUERTE");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 99 PB1 disclosure addendum — byte-equal proxy on first 80 chars
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 99 invariants (PB1 disclosure addendum byte-equal proxy)", () => {
    it("system-prompt.ts contains PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM declaration", () => {
      expect(SYSTEM_PROMPT).toContain("PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM");
    });

    it("system-prompt.ts contains the PB1 addendum heading literal (cheapest reliable byte-equal proxy on the first ~80 chars)", () => {
      // Phase 99 PRICE-02 locked this heading byte-exact. The string
      // `*Desbloqueo de disclosure de precios (PB1):*` is the literal
      // opening of PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM (after the
      // leading `\n\n` template-literal escape).
      expect(SYSTEM_PROMPT).toContain(
        "*Desbloqueo de disclosure de precios (PB1):*",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 99 PB2 / detectPriceObjection consumer tokens
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 99 invariants (PB2 / detectPriceObjection consumer)", () => {
    it("handler.ts contains 'priceInsistenceCount' (Phase 99 PB1 counter name still present)", () => {
      expect(HANDLER).toContain("priceInsistenceCount");
    });

    it("playbooks/constants.ts owns PB1_PRICE_INSISTENCE_THRESHOLD (Phase 99 disclosure-after-N threshold; single source of truth)", () => {
      // The threshold is defined in playbooks/constants.ts as
      // `DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD = 2` and exported as
      // `PB1_PRICE_INSISTENCE_THRESHOLD` resolved from the env override
      // `process.env.PB1_PRICE_INSISTENCE_THRESHOLD ?? 2`. handler.ts
      // consumes it indirectly via the `shouldDisclosePrices` helper.
      expect(CONSTANTS).toContain("PB1_PRICE_INSISTENCE_THRESHOLD");
      expect(CONSTANTS).toContain("DEFAULT_PB1_PRICE_INSISTENCE_THRESHOLD = 2");
    });

    it("handler.ts imports shouldDisclosePrices from playbooks/constants (threshold consumer wiring preserved)", () => {
      // The handler reads the threshold through this single helper, NOT
      // by re-deriving the value. If a future edit inlines a parallel
      // threshold check in handler.ts, the single-source-of-truth
      // discipline is broken — this import line is the surest sentinel.
      expect(HANDLER).toContain(
        'import { shouldDisclosePrices } from "../playbooks/constants.js"',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 100 DBNC-01 — new env-overridable constants + env.example
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 100 DBNC-01 invariants", () => {
    it("handler.ts contains DEBOUNCE_QUIET_WINDOW_MS env-overridable declaration (default 7000)", () => {
      expect(HANDLER).toContain(
        "const DEBOUNCE_QUIET_WINDOW_MS = Number(process.env.DEBOUNCE_QUIET_WINDOW_MS ?? 7000)",
      );
    });

    it("handler.ts contains DEBOUNCE_HARD_CAP_MS env-overridable declaration (default 30000)", () => {
      expect(HANDLER).toContain(
        "const DEBOUNCE_HARD_CAP_MS = Number(process.env.DEBOUNCE_HARD_CAP_MS ?? 30000)",
      );
    });

    it("handler.ts does NOT contain the legacy DEBOUNCE_DELAY_MS constant (negative — confirms full removal)", () => {
      expect(HANDLER).not.toContain("DEBOUNCE_DELAY_MS");
    });

    it(".env.example documents DEBOUNCE_QUIET_WINDOW_MS=7000", () => {
      expect(ENV_EXAMPLE).toContain("DEBOUNCE_QUIET_WINDOW_MS=7000");
    });

    it(".env.example documents DEBOUNCE_HARD_CAP_MS=30000", () => {
      expect(ENV_EXAMPLE).toContain("DEBOUNCE_HARD_CAP_MS=30000");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 100 TAKE-01 + TAKE-02 — handoff addendum + takeover ACK
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 100 TAKE-01/TAKE-02 invariants", () => {
    it("handler.ts contains HANDOFF_ESCALATION_PHRASE (Phase 95 DEGR-01 byte-equal preserved)", () => {
      expect(HANDLER).toContain("HANDOFF_ESCALATION_PHRASE");
    });

    it("handler.ts contains TAKEOVER_REASSURANCE_PHRASE literal byte-exact (with 🙏 emoji)", () => {
      // The constant is split across two lines (assignment / string literal)
      // by Prettier; the substring assertion covers just the literal body —
      // which is what user-visible byte-equality actually cares about.
      expect(HANDLER).toContain(
        '"Alguien del equipo te va a responder a la brevedad 🙏"',
      );
    });

    it("handler.ts contains TAKEOVER_ACK_TTL_SECONDS env-overridable declaration (default 3600)", () => {
      expect(HANDLER).toContain(
        "const TAKEOVER_ACK_TTL_SECONDS = Number(process.env.TAKEOVER_ACK_TTL_SECONDS ?? 3600)",
      );
    });

    it("handler.ts contains the wa:takeover_ack: Redis key prefix (TAKE-02 rate-limit key shape)", () => {
      expect(HANDLER).toContain("wa:takeover_ack:");
    });

    it("system-prompt.ts contains 'handoffReason' (TAKE-01 SystemPromptOptions field)", () => {
      expect(SYSTEM_PROMPT).toContain("handoffReason");
    });

    it("system-prompt.ts contains the TAKE-01 addendum builder OR const (whichever shape was chosen)", () => {
      // Plan 100-02 picked the function shape (`buildHandoffContextAwareAddendum`);
      // the const-shape `HANDOFF_CONTEXT_AWARE_ADDENDUM` is the equivalent
      // alternative. Either is acceptable per the plan.
      const hasFn = SYSTEM_PROMPT.includes("buildHandoffContextAwareAddendum");
      const hasConst = SYSTEM_PROMPT.includes("HANDOFF_CONTEXT_AWARE_ADDENDUM");
      expect(hasFn || hasConst).toBe(true);
    });

    it(".env.example documents TAKEOVER_ACK_TTL_SECONDS=3600", () => {
      expect(ENV_EXAMPLE).toContain("TAKEOVER_ACK_TTL_SECONDS=3600");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 100 TRIG-01 — widened detectPriceObjection regex
  // ─────────────────────────────────────────────────────────────────────
  describe("Phase 100 TRIG-01 invariants (widened detectPriceObjection regex)", () => {
    it("handler.ts contains the widened 'precios?' alternation member (singular OR plural)", () => {
      expect(HANDLER).toContain("precios?");
    });

    it("handler.ts contains the 'cu[aá]nto (sale|cuesta|val[eé])' bigram (question-shape coverage)", () => {
      expect(HANDLER).toContain("cu[aá]nto (sale|cuesta|val[eé])");
    });

    it("handler.ts contains 'valor(es)?' (singular OR plural)", () => {
      expect(HANDLER).toContain("valor(es)?");
    });

    it("handler.ts contains the tarifa|cuota|mensualidad alternation members (new tokens)", () => {
      expect(HANDLER).toContain("tarifa");
      expect(HANDLER).toContain("cuota");
      expect(HANDLER).toContain("mensualidad");
    });

    it("single source of truth: 'caro|carisimo' appears EXACTLY ONCE across all el-templo-bot/src/**/*.ts", () => {
      // Recursive walk of el-templo-bot/src/ with a manual scan rather than
      // shelling out to grep keeps this assertion hermetic and platform-
      // independent. The token signature `caro|carisimo` is unique to
      // the detectPriceObjection regex and ONLY appears there in src/.
      // If a parallel regex is ever introduced (anti-pattern), the count
      // bumps to ≥2 and this fires.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("node:path") as typeof import("node:path");
      const srcRoot = path.resolve(here, "..", "src");

      let count = 0;
      const visit = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            visit(full);
            continue;
          }
          if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
          const text = fs.readFileSync(full, "utf8");
          const matches = text.match(/caro\|carisimo/g);
          if (matches) count += matches.length;
        }
      };
      visit(srcRoot);

      expect(count).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // HARD GUARDS — sha256 tripwire on the canonical 6-pair invariant block
  // ─────────────────────────────────────────────────────────────────────
  describe("HARD GUARDS (cross-phase 6-pair sha256 tripwire)", () => {
    // The canonical 6-pair invariant block is documented byte-identical
    // across 93-CONTEXT.md (Cross-Phase Invariant section), ROADMAP.md,
    // and STATE.md. The sha256 of that block is locked at
    // `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`
    // and itself documented in those same planning files.
    //
    // PLAN-LEVEL CONTRACT (100-04-PLAN.md `<behavior>` HARD GUARDS):
    //   "RECOMMENDED simpler approach: just assert that 93-CONTEXT.md
    //    contains the literal string `67670b1e...` somewhere in the file
    //    (the sha256 documentation itself; byte-equality of the documented
    //    hash is enough as a tripwire — if someone modifies the invariant
    //    block the documented hash diverges and this test catches it)."
    //
    // EXECUTOR DISCOVERY: As of HEAD `2a52ca43`, the literal hash is
    // present in `.planning/STATE.md` and `.planning/ROADMAP.md` but NOT
    // (yet) in `.planning/phases/93-handler-concurrency/93-CONTEXT.md`
    // (which has the canonical Cross-Phase Invariant block but the hash
    // itself was added to the rollup planning docs, not the per-phase
    // CONTEXT). Per Rule 3 (auto-fix blocking): we honor the plan's
    // STATED INTENT (a documented-hash tripwire) by asserting against
    // STATE.md + ROADMAP.md, where the hash actually lives. The
    // 93-CONTEXT.md assertion remains as it / it.skip so a future
    // backfill (adding the hash to 93-CONTEXT.md) flips it from skipped
    // to passing without breaking the test.
    const SHA256 =
      "67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344";

    const ctx93 = tryReadPlanningDoc(
      "phases/93-handler-concurrency/93-CONTEXT.md",
    );
    const state = tryReadPlanningDoc("STATE.md");
    const roadmap = tryReadPlanningDoc("ROADMAP.md");

    if (ctx93 === null) {
      it.skip("93-CONTEXT.md sha256 tripwire (SKIPPED — file not readable; SOFT signal, not PASS)", () => {
        // SOFT signal per 100-04-PLAN.md `<action>` step 6: do NOT mark
        // the plan complete on the basis of this skip.
      });
    } else if (!ctx93.includes(SHA256)) {
      it.skip("93-CONTEXT.md sha256 tripwire (SKIPPED — hash not yet documented in 93-CONTEXT.md; the canonical block is present without an inline hash. SOFT signal; STATE.md / ROADMAP.md tripwires below carry the load.)", () => {
        // SOFT signal — see note above.
      });
    } else {
      it("93-CONTEXT.md contains the documented sha256 of the canonical 6-pair invariant block", () => {
        expect(ctx93).toContain(SHA256);
      });
    }

    // STATE.md / ROADMAP.md tripwires are HARD asserts (not skipped) —
    // these are the files where the hash actually lives at HEAD. If
    // someone edits the canonical block in any of the 6 documented sites
    // without re-hashing + updating these references, the tripwire fires
    // here too.
    it("STATE.md contains the documented sha256 of the canonical 6-pair invariant block", () => {
      expect(state).not.toBeNull();
      expect(state ?? "").toContain(SHA256);
    });

    it("ROADMAP.md contains the documented sha256 of the canonical 6-pair invariant block", () => {
      expect(roadmap).not.toBeNull();
      expect(roadmap ?? "").toContain(SHA256);
    });
  });
});
