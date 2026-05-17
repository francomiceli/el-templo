---
status: partial
phase: 94-openai-latency-graceful-failure
source: [94-VERIFICATION.md]
started: 2026-05-17T23:08:47Z
updated: 2026-05-17T23:08:47Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. CR-02 disposition — SDK retries break the canonical invariant formula

expected: User decides one of: (a) explicit `maxRetries: 0` on the OpenAI client + add SC#5 test + tighten formula (preferred — bot already has WhatsApp webhook redelivery semantics); (b) keep `maxRetries: 2`, update the invariant formula + .env.example comment block + 4 canonical-doc invariant blocks + check-debounce-invariant.sh to use TIMEOUT_S*(1+maxRetries)*MAX_TOOL_ITERATIONS = 675s and re-derive DEBOUNCE_TTL_SECONDS floor; (c) accept the gap with documented rationale (e.g., 5xx retries empirically rare in production) — record as Phase 94 deviation override.
result: [pending]

### 2. CR-01 disposition — Anthropic provider path

expected: User decides: (a) accept — production is locked to AI_PROVIDER=openai per .env.example line 21, Anthropic path is dormant; document as known limitation; (b) add provider-agnostic isProviderApiError helper in provider.ts and rewire handler discriminator.
result: [pending]

### 3. WR-01 disposition — back-to-back UX contradiction

expected: User decides: (a) accept — the goal is graceful failure, not UX polish; (b) suppress the apology when interimSent === true by lifting the interimSent flag to handleInboundMessage scope. Tests SC#2 + SC#3 both assert this back-to-back sequence.
result: [pending]

### 4. Live BUG-02 smoke test

expected: End-to-end: interim message arrives within ~45s of upstream stall; graceful fallback arrives once SDK throws; no process exit / no infinite loop / no double-handling of next inbound.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
