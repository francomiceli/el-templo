# Phase 88: Quality Regression Lock - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Test-only phase. Certify that Phases 86 + 87 shipped safely and lock their combined behavior against future regression. No source changes in `el-templo-bot/src/`.

Deliverables:

1. Full bot suite run with pass/fail counts documented in SUMMARY.md.
2. Reconcile REQUIREMENTS.md wording for QREG-01 and QREG-03 to match post-Phase-86/87 reality.
3. Add a small set of boundary-case assertions + one surgical snapshot tripwire for the PB1.E1A lead rendered prompt.

Out of scope: source refactors, broader test-suite redesign, CI/CD changes, per-state snapshots beyond PB1.E1A lead.

</domain>

<decisions>
## Implementation Decisions

### QREG-01 reconciliation

- **Rewrite text** to match current reality:
  > "All bot tests pass (current count 534+); any test-assertion modifications required during Phase 86–87 execution are documented in the corresponding phase SUMMARY files with rationale."
- **AVAT-03 modification** (aligned in Phase 86-02): document as kept-as-is. Original assertion expected member-only tokens ("efectivo", "Ver membresia") to appear in a lead-state rendered prompt; post-gating those tokens correctly no longer reach leads. The aligned assertion covers both KGATE-02 and KGATE-03 paths. No code change in Phase 88 — only documentation.
- **Deliverable format**: plain `pnpm test` run results in SUMMARY.md, with a short subsection listing any modified/removed test assertions across Phase 86–87 and their rationale. No new CI automation.

### QREG-03 reconciliation

- **Align to KGATE-05 dual-threshold** wording:
  > "prompt-size regression test asserts the rendered PB1.E1A prompt is at least 20% smaller than the pre-refactor baseline, AND the knowledge block alone is at least 35% smaller than the full knowledge set."
- **Lean on existing `test/ai/prompt-size.test.ts`** as the QREG-03 artifact. No new test required — the file already asserts both thresholds.
- **Headroom watchdog**: Phase 88 SUMMARY.md includes the current rendered-lead char count and headroom against threshold. Flag as "under 100 chars of margin — next content addition should audit" when applicable. **No hard assertion** — existing `prompt-size.test.ts` fails loudly on breach; adding a minimum-headroom assertion would block justified additions.

### QREG-02 status

- Already satisfied by `el-templo-bot/test/knowledge-gating.test.ts` (Phase 86-03 + Phase 87-03 = 20+ per-state assertions). Phase 88 marks QREG-02 complete after verification.

### New boundary-case assertions

Add to `el-templo-bot/test/knowledge-gating.test.ts` (or a sibling file if structure demands):

1. **Unknown `ClientState` runtime string falls through to full set** — defensive safety net. Invalid string input (e.g., cast via `as ClientState`) returns byte-equal to full. Locks the current defensive behavior.
2. **`null` / `undefined` clientState returns full set** — KGATE-04 backward-compat explicit lock. Both code paths (`getBusinessKnowledge()`, `getBusinessKnowledge(undefined)`, `getBusinessKnowledge(null as unknown as ClientState)`) verified to equal full.
3. **AVAT-03 context anchor** — add a comment or test-block note explaining the alignment rationale (referencing Phase 86-02 SUMMARY). Either inline in the existing AVAT-03 test body or as a new "## Regression Context" block. This preserves the "why" so future readers don't revert the alignment.

### Surgical snapshot tripwire

- **Single snapshot** for the rendered PB1.E1A lead system prompt. Stored as a committed fixture file (`el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` or `.ts` equivalent), asserted byte-equal by a test.
- **No snapshots for other states.** Full-state suite would churn on legitimate content changes; the lead path is the critical one for v5.3.1 behavioral intent.
- **Update discipline**: snapshot updates require an explicit commit with justification in the message. Executor should document this rule in the test file header comment.

### Phase scope sizing

- Lightweight single-plan phase (or at most two small plans). Avoid multi-wave complexity — this is certify + small additions, not a build-out.
- Expected commit count: ~5–7 (reconciliation edits to REQUIREMENTS.md, boundary tests, snapshot + snapshot test, SUMMARY.md, phase completion).

### Claude's Discretion

- Exact wording of the reconciled QREG-01 and QREG-03 text (within the intent captured above).
- Whether boundary tests live in `knowledge-gating.test.ts` or a sibling file.
- Exact snapshot format (raw text vs TypeScript constant). Prefer whatever vitest + existing fixtures conventions already use.
- Whether to add a one-line NOTE/TODO in `prompt-size.test.ts` referencing Phase 88 and the headroom state.
- Whether to include an AVAT-03 context anchor as a separate test or inline comment.
- Test naming and describe-block organization.

</decisions>

<specifics>
## Specific Ideas

- Phase 88 is the last phase of v5.3.1. SUMMARY.md should serve as the milestone-exit artifact — a clear status line for each of the 16 v5.3.1 requirements is valuable (state: verified / modified-with-rationale / unaffected).
- The snapshot tripwire is a psychological safety net, not a correctness gate. The real correctness tests are the assertion-style ones. Snapshot exists so that any unintentional render change surfaces loudly in PR review.
- If the bot suite fails during Phase 88's certify run, that's a Phase 88 checkpoint — do NOT silently retry. Halt, diagnose, and surface to the user. A test-only phase shouldn't paper over real regressions.

</specifics>

<deferred>
## Deferred Ideas

- Snapshot suite for all ClientState × avatar combos — too much churn for v5.3.1; consider in v5.4 if content stability becomes a concern.
- Test-inventory CI step (track assertion additions/removals in PRs) — long-term value but scope creep for this phase.
- Broader integration testing across PB2–PB5 playbooks — belongs in a future phase focused on playbook maturity.
- Performance/latency regression tests for render time — unrelated to v5.3.1 prompt-quality goals.

</deferred>

---

_Phase: 88-quality-regression-lock_
_Context gathered: 2026-04-14_
