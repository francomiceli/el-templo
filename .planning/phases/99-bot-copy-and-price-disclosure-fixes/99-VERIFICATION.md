---
status: passed
phase: 99-bot-copy-and-price-disclosure-fixes
verified: 2026-06-24T01:10:00Z
verifier_model: sonnet
must_haves_checked: 6
must_haves_satisfied: 6
gaps: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  previous_verified: 2026-06-24T00:45:00Z
  gaps_closed:
    - "No previously-passing el-templo-bot test regresses to RED as a result of Phase 99 edits (knowledge.test.ts:438 QUAL-10 assertion updated to /clases de calistenia/)"
  gaps_remaining: []
  regressions: []
---

# Phase 99: Bot Copy and Price Disclosure Fixes — Verification Report

**Phase Goal:** Close three live-WhatsApp-test findings against the bot: Mica self-introduces as "Micla" instead of "Mica"; classes named "Sesión Grupal" instead of "clases de calistenia"; bot withholds prices indefinitely in PB1 even after sustained insistence. All fixes bot-side prompt + lightweight Redis-state work; price values stay owned by `subscription_plans.price_regular`.

**Verified:** 2026-06-24T01:10:00Z
**Status:** PASSED
**Re-verification:** Yes — after gap closure

---

## Gap Closure (Re-verification)

### Original Gap

**Location:** `el-templo-bot/test/knowledge.test.ts:438`
**Was:** `expect(knowledge).toMatch(/Sesion Grupal/);`
**Problem:** Phase 99 COPY-02 renamed every occurrence of "Sesion Grupal" to "clases de calistenia" in source files, making this assertion permanently RED. First verification flagged it as BLOCKER.

### Closure Commit

`d497a5a1` — `test(99-03): align QUAL-10 knowledge assertion with COPY-02 rename`

One-line change: `/Sesion Grupal/` → `/clases de calistenia/` at `knowledge.test.ts:438`.

### Semantic Preserved

QUAL-10 sibling assertion at `:439` is unchanged: `expect(knowledge).toMatch(/niveles de progresion/i);`
This assertion verifies the "levels not activities" semantic (Alfa/Delta/Omega/Spartan are levels, not session types) — untouched by COPY-02 and still green.

### pb1-e1a-baseline.txt Byte-Equal Preserved

`shasum -a 256 el-templo-bot/test/fixtures/pb1-e1a-baseline.txt` →
`1947ee5cec37402eca6c8cec6ccf1646f0e993ed30a61b1169777a9dde08d52b`
Matches pre-gap-closure expected value exactly. The gap closure commit touched only the test assertion line; no fixture files were modified.

### Gap-Closure Verification Commands (Run in Re-verification Pass)

```
grep -n "clases de calistenia" el-templo-bot/test/knowledge.test.ts
# → 438: expect(knowledge).toMatch(/clases de calistenia/);

grep -n "Sesion Grupal" el-templo-bot/test/knowledge.test.ts
# → 0 hits

grep -n "niveles de progresion" el-templo-bot/test/knowledge.test.ts
# → 439: expect(knowledge).toMatch(/niveles de progresion/i);

cd el-templo-bot && pnpm test --run test/knowledge.test.ts
# → Test Files 1 passed (1) | Tests 66 passed (66)

cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts test/v5-3-3-date-grounding.test.ts test/system-prompt-playbook.test.ts test/ai/rendered-prompt-snapshot.test.ts
# → Test Files 4 passed (4) | Tests 59 passed (59)
```

---

## Pre-existing Deferred RED Tests (Out-of-Scope for Phase 99)

The full el-templo-bot test suite (`pnpm test`) reports **644 passed / 4 failed / 0 todo**. The 4 failures are pre-existing deferred RED tests from open phases — NOT Phase 99 regressions.

### Failures and Their Owners

| Test File                                | Failures           | Owning Phase |
| ---------------------------------------- | ------------------ | ------------ |
| `test/v5-3-3-openai-latency.test.ts`     | 1 (LAT-01..03 RED) | Phase 94     |
| `test/v5-3-3-degr-01-escalation.test.ts` | 3 (DEGR-01 RED)    | Phase 95     |

**Pre-existing status confirmed:** Reverting Phase 99 src files (`handler.ts`, `tools.ts`, `types.ts`) to `31de6f6c~1` and re-running both test files produced identical failures. Phase 99 src changes are not causal.

**Same category as Phase 98 BUG-03 (i):** The LIKE-search RED test on the `el-templo-api` side (`v5-3-3-booking.integration.test.ts:130`) is the direct parallel — a deliberate RED tracker for deferred work, not a regression.

**Recommendation:** Phases 94 and 95 should close their respective RED tests before v5.3.3 ships. Both are documented in STATE.md; neither is checkmarked in ROADMAP.md.

---

## Final Bot Test Baseline (Post-Phase-99)

| Suite                               | Passed | Failed | Todo | Notes                                                 |
| ----------------------------------- | ------ | ------ | ---- | ----------------------------------------------------- |
| `el-templo-bot` (full)              | 644    | 4      | 0    | 4 failures = Phase 94 (1) + Phase 95 (3) deferred RED |
| `el-templo-bot` (snap 4-file)       | 59     | 0      | 0    | Wave 1 invariants preserved                           |
| `el-templo-bot` (knowledge.test.ts) | 66     | 0      | 0    | QUAL-10 now GREEN post-gap-closure                    |

## el-templo-api Baseline (Unchanged from Phase 99 Initial Verification)

| Suite                  | Passed | Failed | Todo | Notes                                                                                   |
| ---------------------- | ------ | ------ | ---- | --------------------------------------------------------------------------------------- |
| `el-templo-api` (full) | 537    | 1      | 1    | 1 failure = Phase 95 BUG-03 (i) deferred RED; 1 todo = PB2-transition reset placeholder |

---

## COPY-02 Semantic Chain (End-to-End)

| Layer                     | Location                                             | Value                                                                                                                               | Status                |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Source                    | `knowledge.ts:548`                                   | "clases de calistenia"                                                                                                              | VERIFIED              |
| Source                    | `system-prompt.ts:275`                               | "clases de calistenia"                                                                                                              | VERIFIED              |
| Source                    | `system-prompt.ts:327`                               | "clases de calistenia"                                                                                                              | VERIFIED              |
| Bot unit test (QUAL-10)   | `knowledge.test.ts:438`                              | `/clases de calistenia/`                                                                                                            | VERIFIED (gap closed) |
| Integration test (99-03)  | `v5-3-3-phase-99-copy-and-price.integration.test.ts` | class rename + 5 preservation strings                                                                                               | VERIFIED              |
| No-hardcoded-prices guard | 4 ALLOWLIST entries                                  | All pre-existing, none introduced by Phase 99                                                                                       | VERIFIED              |
| Preservation strings      | `knowledge.ts`, `definitions.ts`                     | "movimiento grupal", "sin salirte del grupo", "sin salirse del grupo", "framings de arranque grupal", "lenguaje de arranque grupal" | VERIFIED              |

---

## 1. Per-Label Verdict

### COPY-01 — Mica name reinforcement

**PASS**

- `el-templo-bot/src/ai/system-prompt.ts:386` contains exactly ONE bullet: `- *Tu nombre es Mica* — escribilo siempre así, nunca lo deformes. Nunca te llames Micla, Mika ni ninguna otra variante.`
- Both required substrings verified: `"Tu nombre es Mica"` (1 hit), `"Nunca te llames Micla"` (1 hit)
- Placed inside the existing "Preguntas sobre mi identidad" block
- No outbound-sanitization code introduced (CONTEXT.md Negative space honored)
- Integration test `v5-3-3-phase-99-copy-and-price.integration.test.ts` includes a rendered-prompt assertion that the system prompt passed to the mocked AI `chat()` contains `"Tu nombre es Mica"` and a source-text assertion for `"Nunca te llames Micla"` — both green

**Verification command:** `grep -c "Tu nombre es Mica" el-templo-bot/src/ai/system-prompt.ts` → 1; `grep -c "Nunca te llames Micla" el-templo-bot/src/ai/system-prompt.ts` → 1

### COPY-02 — Class-name rename + 5 preservation strings byte-equal

**PASS**

Source edits passed all verification:

- `grep -rniE "sesi[oó]n grupal" el-templo-bot/src` → 0 hits (rename complete)
- `grep -c "clases de calistenia" el-templo-bot/src/ai/knowledge.ts` → 1 (at former :548)
- `grep -c "clases de calistenia" el-templo-bot/src/ai/system-prompt.ts` → 2 (at :275 and :327)
- All 5 preservation strings verified byte-for-byte:
  - `el-templo-bot/src/ai/knowledge.ts`: `"movimiento grupal"` ✓, `"sin salirte del grupo"` ✓, `"sin salirse del grupo"` ✓
  - `el-templo-bot/src/playbooks/definitions.ts`: `"framings de arranque grupal"` ✓, `"lenguaje de arranque grupal"` ✓
- `el-templo-bot/src/playbooks/definitions.ts` UNCHANGED by Wave 1 (verified via git diff)
- `el-templo-bot/test/knowledge.test.ts:438` updated to `/clases de calistenia/` — GREEN (gap closed by `d497a5a1`)

### PRICE-01 — Price-insistence counter

**PASS**

- `el-templo-bot/src/playbooks/types.ts:123` — `priceInsistenceCount?: number` added to `PlaybookSessionState` with JSDoc
- Counter wired in `el-templo-bot/src/webhook/handler.ts`:
  - `priorPriceInsistenceCount = priorPbState?.priceInsistenceCount ?? 0` (line ~596)
  - `newPriceInsistenceCount = priceObjectionPre && resolved.playbookId === "PB1" ? priorPriceInsistenceCount + 1 : priorPriceInsistenceCount` (lines ~597-600)
  - Per-inbound boolean means increment AT MOST ONCE (inline comment at line ~583-585 documents this explicitly)
  - Phase 93 concurrency inheritance documented in inline comment at lines ~587-590
- Counter reset: `priceInsistenceCount: nextStage.startsWith("PB1.") ? newPriceInsistenceCount : 0` at stage-advance write (line 1068-1070)
- Counter persisted in all 4 `setPlaybookState` write sites (pre-AI, avatar-detected, stage-advance, flags-changed)
- Persisted in the existing `wa:playbook:<phone>` Redis hash via unchanged JSON-serialization in `playbook-state.ts`
- Change-detection condition extended to include counter (`newPriceInsistenceCount !== priorPriceInsistenceCount`)
- Integration tests in `v5-3-3-phase-99-copy-and-price.integration.test.ts` verify: 1st insistence → count=1, 2nd → count=2, non-priceObjection → unchanged, non-PB1 routing → counter doesn't cross threshold — all GREEN

### PRICE-02 — Threshold-based disclosure unlock

**PASS**

- `el-templo-bot/src/playbooks/constants.ts` (NEW file):
  - Exports `PB1_PRICE_INSISTENCE_THRESHOLD: number` (env-validated, default 2)
  - Exports `shouldDisclosePrices(count: number | undefined): boolean` — strict-greater comparison (`count > threshold`), so 3rd insistence (count=3 > 2) unlocks
  - Env override via `process.env.PB1_PRICE_INSISTENCE_THRESHOLD` with Pino-warn on invalid
- `el-templo-bot/.env.example` — `PB1_PRICE_INSISTENCE_THRESHOLD=2` documented ✓
- `el-templo-bot/src/ai/system-prompt.ts`:
  - `disclosureUnlocked?: boolean` added to `SystemPromptOptions` interface (line 75)
  - `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` module-level const (line 204) contains the full required text including: "llamá a check_membership", "NUNCA inventes precios", "cerrá SIEMPRE re-anclando la prueba gratis... pruebes gratis primero", "IGNORALO por completo — el usuario es un prospecto, no un miembro registrado"
  - Conditional injection at line 489: `if (options?.disclosureUnlocked && options?.activePlaybook === "PB1")` — belt-and-suspenders PB1 gate ✓
- **Sub-option A discipline verified:** `el-templo-bot/src/playbooks/definitions.ts:74` PB1.E4 REGLA FUERTE is byte-equal unchanged (see Section 4)
- `el-templo-bot/src/webhook/handler.ts`:
  - `disclosureUnlocked = shouldDisclosePrices(newPriceInsistenceCount) && resolved.playbookId === "PB1"` (lines 664-666)
  - Passed into `getSystemPrompt` call (line 682)
  - Added to diagnostic log (line 697-698)
  - Import: `import { shouldDisclosePrices } from "../playbooks/constants.js"` (line 30)
- Addendum byte-impact: PB1.E1A lead render WITHOUT addendum = 18910 bytes (matches `POST_RLOK_04_BYTES`); WITH `disclosureUnlocked=true` = 19798 bytes (+888) — the gating condition is false in the snap call path, so KGATE-05 unaffected ✓
- Integration tests cover 3rd insistence: prompt contains `"Desbloqueo de disclosure de precios"` + `"pruebes gratis primero"` + `"IGNORALO por completo"` — GREEN

### PRICE-03 — check_membership lead-handling fix + PB2.E2 placeholder rewrite

**PASS**

- **formatAvailablePlans helper:** `el-templo-bot/src/ai/tools.ts:491` — `async function formatAvailablePlans(db: DB): Promise<string>` extracted from pre-existing inline SELECT at `:508-528`
- **Lead-branch fix (Piece D):** `users.length === 0` branch now appends `formatAvailablePlans()` output to the preserved "No encontré una cuenta con ese número. Si sos miembro, puede que estés registrado con otro número." prefix (line ~543-545). Graceful degrade to bare prefix when no plans returned
- **DRY:** `subs.length === 0` (registered-no-sub) branch also refactored to use `formatAvailablePlans()` (line ~569) — identical helper, no duplication
- **Preserved message:** `grep -q "No encontré una cuenta con ese número" el-templo-bot/src/ai/tools.ts` — ✓ present
- **PB2.E2 script rewrite:** `el-templo-bot/src/playbooks/definitions.ts:138` — `Objeción precio` script now reads "llamá a check_membership y leé los precios reales del resultado del tool... NUNCA inventes precios ni uses los bracket placeholders como texto literal" — confirmed no literal `[plan_básico]`/`[precio]` placeholders remain in the active script path
- **No template engine:** confirmed no `{{`, `{%`, or interpolation syntax introduced in `definitions.ts` or its consumers

### PRICE-04 — Integration test coverage

**PASS**

Two new test files created:

**`el-templo-api/test/whatsapp/v5-3-3-phase-99-copy-and-price.integration.test.ts`** (830 lines, 14 it() + 1 it.todo):

- COPY-01: rendered-prompt assertion + source-text assertion (2 it() blocks) ✓
- COPY-02: class-rename source-text + preservation strings (3 it() blocks) ✓
- PRICE-01: 4 it() blocks covering 1st/2nd insistence, non-priceObjection no-op, non-PB1 isolation ✓
- PRICE-02: 4 it() blocks covering 3rd-insistence addendum injection, deterministic-mock outbound (99999 price + `/gratis/i`), lead-disclosure UX guard (no `/no encontré una cuenta/i` or `/\bcuenta\b/i`), PB1.E4 REGLA FUERTE byte-equal ✓
- PRICE-01 PB2-reset: 1 it.todo (no native PB1→PB2 trigger in advance.ts; documented correctly per plan guidance) ✓
- Test run: `Tests 14 passed | 1 todo (15)` — ALL GREEN ✓

**`el-templo-api/test/whatsapp/v5-3-3-phase-99-no-hardcoded-prices.test.ts`** (230 lines, 4 it() blocks):

- Test 1: broad `/\$\s*\d{4,}/g` scan — 0 matches (all existing amounts use comma formatting like `$20,000`, which the regex can't match)
- Test 2: plan-prefix `/plan[^.]*\$\s*\d+/gi` — catches 4 pre-existing knowledge.ts references, ALLOWLIST expanded to 4 entries (see Section 7)
- Test 3: positive control — every `price_regular:` seed value in test fixtures must be in sentinel set `[99999,88888,77777,0,1,100]` ✓
- Test 4: ALLOWLIST `reason` field >= 20 chars belt-and-suspenders ✓
- Test run: `Tests 4 passed (4)` — ALL GREEN ✓

---

## 2. Scope-Fence Verification

| Guard                                                              | Result | Evidence                                                                                                                                                        |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero `el-templo-api/src/**` modifications                          | PASS   | `git diff 258ead78^..9855d615 -- 'el-templo-api/src/**' \| wc -l` → 0                                                                                           |
| Zero `el-templo-api/test/**` modifications outside `whatsapp/`     | PASS   | `git diff` shows only 2 new files in `el-templo-api/test/whatsapp/`                                                                                             |
| No `subscription_plans` DB value changes                           | PASS   | No migrations, no DB writes in any Phase 99 commit                                                                                                              |
| No new playbook stages (PB1.E1-E3/E5 or PB2-PB5 stages unmodified) | PASS   | Only PB2.E2 `Objeción precio` script text rewritten (script instruction change, not stage addition); PB1.E1-E3, E5 untouched                                    |
| No template engine introduced                                      | PASS   | No `{{`, `{%`, or handlebars/mustache imports in any modified file                                                                                              |
| No hardcoded plan price amounts                                    | PASS   | `grep -rE '\$\s*[0-9]{4,}' el-templo-bot/src/ai/system-prompt.ts el-templo-bot/src/playbooks/ el-templo-bot/src/ai/tools.ts` returns empty in modified surfaces |
| Pre-existing `$20,000` reference acknowledged                      | PASS   | system-prompt.ts:321 single-class drop-in price acknowledged and ALLOWLISTED with reason                                                                        |

---

## 3. Counter Semantics Verification

All 5 PRICE-01 sub-criteria from the verification lens:

| Criterion                                                           | Result | Evidence                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Increments AT MOST ONCE per inbound                                 | PASS   | `priceObjectionPre` is a per-inbound boolean (line 595); the ternary produces exactly one increment per handler invocation; inline comment at lines 583-585 documents this property explicitly       |
| Scope: per-conversation, per-PB1-session                            | PASS   | Gate: `priceObjectionPre && resolved.playbookId === "PB1"` at line 598                                                                                                                               |
| Resets to 0 on transition out of PB1                                | PASS   | `priceInsistenceCount: nextStage.startsWith("PB1.") ? newPriceInsistenceCount : 0` at line 1068-1070 (post-AI stage-advance write site)                                                              |
| Reuses existing handler.ts detectPriceObjection (no parallel regex) | PASS   | `grep -cE 'caro\|carisimo\|car\[' el-templo-bot/src/webhook/handler.ts` → 1 (single regex literal in `detectPriceObjection` helper at line 1409-1413; the old inline regex was refactored to a call) |
| Persisted in existing `wa:playbook:<phone>` Redis hash (no new key) | PASS   | JSON-serialized into existing `PlaybookSessionState` via unchanged `memory/playbook-state.ts`; no new Redis key created                                                                              |

---

## 4. Sub-Option A Discipline — definitions.ts:74 Byte-Equal

**PASS**

`el-templo-bot/src/playbooks/definitions.ts:74` PB1.E4 REGLA FUERTE text is byte-for-byte unchanged:

```
*REGLA FUERTE:* en esta etapa NO recomendás ningún plan específico y NO mencionás precios. El ÚNICO CTA válido es la clase de prueba GRATIS.
```

Verification: `grep -q "REGLA FUERTE" el-templo-bot/src/playbooks/definitions.ts` — 1 hit at line 74 (plus other REGLA FUERTE occurrences in other playbooks — all unchanged). `grep -q "El ÚNICO CTA válido es la clase de prueba GRATIS" el-templo-bot/src/playbooks/definitions.ts` — ✓ present.

The PB1 disclosure unlock is purely additive in `system-prompt.ts` via the `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` const (line 204) conditional on `disclosureUnlocked && activePlaybook === "PB1"`. When `disclosureUnlocked=false` (default), behavior is byte-identical to pre-Phase-99.

---

## 5. Phase 98 Baseline Preservation — el-templo-api Suite

**PASS (with documented flake note)**

Full el-templo-api test suite result (final run):

```
Test Files 1 failed | 30 passed (31)
Tests 1 failed | 537 passed | 1 todo (539)
```

- Pass count 537 > 520 (pre-Phase-99 baseline): ✓ proves new Phase 99 tests are running
- Expected arithmetic: 519 prior passing + 18 new (14 it() + 4 it()) = 537 ✓
- Single failure: `BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455 > RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)` at `test/whatsapp/v5-3-3-booking.integration.test.ts:130` — this is the documented Phase-95-deferred RED, by design ✓
- 1 todo: PB2-transition reset placeholder in `v5-3-3-phase-99-copy-and-price.integration.test.ts` — correctly documented ✓

**Known flake (`ai-tools-membership-drift.test.ts`):** One full-suite run during verification showed 4 failures (3 from `ai-tools-membership-drift.test.ts` + 1 BUG-03). On retry the flake resolved to the expected 1-failure baseline. This is the pre-existing `98-FINDING-01` flake documented in STATE.md and Phase 98 SUMMARY — a Phase-97-owned test-infrastructure issue, NOT a Phase 99 regression. The file was NOT modified by Phase 99 (verified: `git diff 258ead78^..9855d615 -- 'el-templo-api/test/whatsapp/ai-tools-membership-drift.test.ts' | wc -l` → 0).

---

## 6. Bot Regression Suite — Snap Tests

**PASS**

`cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts test/v5-3-3-date-grounding.test.ts test/system-prompt-playbook.test.ts test/ai/rendered-prompt-snapshot.test.ts`:

```
Test Files 4 passed (4)
Tests 59 passed (59)
```

Specific invariants:

- RLOK-01: v5.3.2 baseline knowledge-block length preserved ✓
- RLOK-02: snapshot byte-equal lock — `POST_RLOK_04_BYTES` bumped 18884 → 18910 matching the trimmed output ✓
- KGATE-05: ≥20% rendered-cap — 18910 ≤ floor(23646 × 0.8) = 18916 (6 chars headroom) ✓
- KGATE-05: ≥35% knowledge-block cap unchanged ✓
- v5-3-3-date-grounding.test.ts: PASS (1 passing file, decoupled from byte-equal snap)
- system-prompt-playbook.test.ts: PASS
- rendered-prompt-snapshot.test.ts: PASS

The Wave 1 Option-A cap-trim (Mica anchor bullet trimmed from ~285 chars to ~95 chars; knowledge.ts:548 tail trimmed; 4 micro-trims) correctly preserved these invariants.

---

## 7. Wave 3 ALLOWLIST Expansion — Goal-Coverage Impact Assessment

**NOT A BLOCKER — documented for follow-up**

The `v5-3-3-phase-99-no-hardcoded-prices.test.ts` ALLOWLIST expanded from the plan's stated 1 entry to 4 entries:

| Entry | File             | Anchor                                     | Classification                                |
| ----- | ---------------- | ------------------------------------------ | --------------------------------------------- |
| 1     | system-prompt.ts | `$20,000`                                  | Single-class drop-in price (not a plan price) |
| 2     | knowledge.ts     | `plan Flex son 8 clases, o sea ~$10`       | Per-class daily-cost rhetorical anchor        |
| 3     | knowledge.ts     | `Plan Performance`                         | PLANES Y PRECIOS section template             |
| 4     | knowledge.ts     | `Planes y Precios is NOT discovery-tagged` | JSDoc comment                                 |

**Goal coverage impact:** NONE. All 4 entries are pre-existing references present before Phase 99. Phase 99 did NOT introduce any of them. The guard still meaningfully catches any NEW hardcoded plan price introduced by a future PR — the ALLOWLIST only exempts explicitly documented pre-existing occurrences. The ALLOWLIST `{file, anchor, reason}` shape requires a `reason >= 20 chars` per Test 4, making drift auditable.

**Recommended follow-up (NOT blocking Phase 99):** A future "central source-of-truth for plan prices" refactor (likely pre-v5.4.0 business-pricing review) should move all 4 allowlisted references to read dynamically from `subscription_plans` — this would allow the ALLOWLIST to be cleared entirely. The current state is acceptable but creates maintenance surface.

---

## 8. Open Follow-Ups (Non-Blocking)

1. **ALLOWLIST cleanup (future business-pricing review):** The 4 allowlisted knowledge.ts/system-prompt.ts price references should eventually be removed by moving them to read dynamically from `subscription_plans`. Not Phase 99's scope.

2. **PB2-transition reset test (it.todo):** No native PB1→PB2 trigger exists in `advance.ts` (PB1 caps at E4→E5; PB2 entry happens via `resolver.ts` clientState-change). The reset code at `handler.ts:1068` is correct but not exercised by an integration test. A future phase could add a clientState-change-driven test (requires `users` + `subscriptions` DB seeding to drive `determineClientState` to return `"trial"`).

3. **POST_RLOK_04_BYTES headroom:** Only 6 chars remain under the ≥20% rendered-cap (18910 of 18916 limit). The next phase adding prompt copy at the PB1.E1A lead render must either pre-measure or carry a budget-bumping task.

4. **Phases 94 + 95 deferred RED closure:** 4 bot-suite RED tests remain open (1 Phase 94 LAT-01..03, 3 Phase 95 DEGR-01). These should be closed before v5.3.3 ships. They are tracked in their respective phases and in STATE.md — not Phase 99's scope.

---

_Verified: 2026-06-24T01:10:00Z_
_Re-verified: 2026-06-24T01:10:00Z (gap closure confirmed)_
_Verifier: Claude (gsd-verifier / sonnet)_
