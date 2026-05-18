---
status: resolved
trigger: "bot-3min-response-latency: WhatsApp bot took ~3 minutes to respond during live test (22:23-22:26, ~2026-04-16)"
created: 2026-05-05
updated: 2026-05-18
resolved_by: "Phase 94 (LAT-01..03) — explicit OpenAI timeout=45000 + maxRetries=0 (94-02 CR-02 closure) + interim UX + graceful fallback. Real worst-case per provider.chat = 45s; end-to-end ≤ 395s ≤ 600s DEBOUNCE_TTL. Pending v5.4.0 live smoke test (HUMAN-UAT)."
mode: symptoms_prefilled, find_root_cause, defer_to_milestone
---

## Current Focus

hypothesis: Code-only static analysis is sufficient to identify the latency surface area; logs are unrecoverable but not needed because the failure mode is structural, not data-dependent
test: Static read of handler.ts, openai.ts, routes.ts, session.ts, index.ts
expecting: Identify all blocking await points and any missing timeouts
next_action: (none — root cause identified)

## Symptoms

expected: WhatsApp bot responds within reasonable time (<30s for chat completion + tool calls)
actual: ~3 minute latency. User sent "Hola?" then "Holaaaaa" before any reply came back
errors: None reported. Response did eventually arrive, just very late
reproduction: One incident at 22:23-22:26, ~2026-04-16. Frequency unknown
started: During team live test post-v5.3.2 (v5.3.2 marked complete 2026-04-17)

## Environment Context

- Local dev environment (NOT production)
- Node/TypeScript (`el-templo-bot`)
- ngrok tunneling local webhook → WhatsApp Cloud API
- Meta TEMPORARY tokens, TEST number
- Pino logs (location TBD — file vs stdout vs rotation unknown)
- Today is 2026-05-05; window is ~3 weeks old

## Pivot Rule

If logs from 22:23-22:26 window no longer exist locally → do NOT chase missing logs.
Pivot to fresh dev reproduction with logging enabled.

## Investigation Priorities (4 scenarios)

1. OpenAI API slowness (upstream) → no real fix; document, add timeout/UX
2. Serial tool calls → parallelize tool invocations
3. Handler queueing/blocking → architectural fix in handler.ts (PAIRS with BUG-01)
4. Cloudflare/network/ngrok → infra fix or won't-fix

Verdict MUST map to one of these 4 scenarios.

## Eliminated

- hypothesis: Recoverable Pino logs from 22:23-22:26 window can drive root-cause analysis
  evidence: Every `pino(...)` call in src/ uses default config (stdout only). No `pino.destination(...)`, no transport, no rotation, no `logs/` dir on disk. `Fastify({ logger: true })` (index.ts:29) writes to process stdout. The bot is run via `tsx watch` in dev — logs are ephemeral terminal output. Window is ~3 weeks old. Logs are gone. Per pivot rule: do NOT chase missing logs.
  timestamp: 2026-05-05

- hypothesis: BUG-02 is caused by the 3s debounce sleep introduced in quick-16 fix 2
  evidence: handler.ts:95 sets `DEBOUNCE_DELAY_MS = 3000`. Even worst-case interaction with a stalled handler bounded by `DEBOUNCE_TTL_SECONDS = 10` (debounce key auto-expires after 10s regardless of in-flight handler state). 3s sleep + 10s TTL ceiling cannot account for ~180s observed latency. Debounce contributes deterministic ~3s baseline, NOT minutes.
  timestamp: 2026-05-05

- hypothesis: BUG-02 is silent retries inside the OpenAI SDK
  evidence: openai.ts:55 calls `this.client.chat.completions.create(...)` with no per-call retry override. OpenAI SDK default is 2 retries, exponential backoff, but each retry inherits the same default 600s timeout. Retries amplify latency multiplicatively with timeout, not additively in seconds. Without a timeout, retries are not the dominant factor — the timeout is.
  timestamp: 2026-05-05

## Evidence

- 2026-05-05: backlog entry confirms symptoms-only — no error captured, no diagnostic data, just UX observation
- 2026-05-05: index.ts:29 uses `Fastify({ logger: true })` → default Pino → stdout. No file destination configured anywhere in the bot. Logs from 22:23-22:26 are unrecoverable.
- 2026-05-05: handler.ts has TWO awaited OpenAI calls per turn: (1) main `provider.chat(messages, BOT_TOOLS)` at line 584 with up to 5 tool-loop iterations (line 589, `MAX_TOOL_ITERATIONS = 5`), each iteration adding another `provider.chat(...)` at line 641. (2) Profile extraction at line 1391 inside `extractAndUpdateProfile` — but this is fire-and-forget via `.catch()` chaining (line 831), runs AFTER `replyText` is assigned, does NOT block the user-facing reply. So profile extraction is exonerated as a latency cause for the visible response delay.
- 2026-05-05: openai.ts:24-32 — `OpenAiProvider` constructor does `this.client = new OpenAI()` with NO options. No `timeout` configured. OpenAI SDK default request timeout is **600 seconds (10 minutes)**. A single hung OpenAI request can stall the entire handler for up to 10 minutes silently with no observable error. THIS is the specific structural defect that allows ~3-minute latencies.
- 2026-05-05: handler.ts:589-642 — tool loop is fully serial. Each iteration sequentially: (a) `for (const toolCall of response.toolCalls)` awaits each tool (b) calls `provider.chat()` again. Up to 5 iterations × (multiple tool exec times + 1 OpenAI round-trip). Worst-case multiplication: 5 × 30s = 150s before even hitting the per-call timeout ceiling. Plausible contributor to long latencies, but on its own a healthy gpt-4o-mini round-trip is ~1-3s — five healthy iterations = ~10s, not 180s.
- 2026-05-05: Tool calls (`book_class`, etc.) hit el-templo-api over localhost HTTP (per el-templo-bot/CLAUDE.md). Those calls are also unbounded — no axios/fetch timeout in `executeTool` paths. Compounds the problem if API is slow, but nothing in the observed symptom (silent ~3min wait, then arrival) points to the booking tools specifically — the reported turn was just "Hola" (no tool calls expected).
- 2026-05-05: Webhook ack ordering (routes.ts:54) is correct — `void reply.code(200).send(...)` runs before async handler. Meta is not retrying due to slow handler. So the latency is purely Mica's reply being slow, NOT compounded by Meta-side retries.
- 2026-05-05: Debounce flow (handler.ts:359-384). The `DEBOUNCE_TTL_SECONDS = 10` Redis TTL acts as a dead-man switch: even if the AI call hangs, the debounce key auto-expires after 10s, after which subsequent inbounds will start NEW handler instances (with their own 3s sleep + their own AI call). For "Hola"→"Hola?"→"Holaaaaa" sent ~30-60s apart on a stalled handler: first inbound hangs in OpenAI; debounce expires at 10s; second/third inbounds each spawn parallel handlers each making their own OpenAI calls. Result: when the original eventually completes (or one of the parallel ones does), the user finally sees a reply ~3 min later. The "first reply Mica sent" the user observed could plausibly have been from any of the in-flight handlers, not necessarily the first one — irrelevant to root-cause but worth noting if the team wants to reproduce.

## Verdict

**Root cause:** The OpenAI SDK client has no explicit timeout (openai.ts:29: `new OpenAI()` with no options). The default SDK timeout is 600s (10 minutes), which means a single stalled OpenAI request — whether due to upstream API slowness, model congestion, or a momentary network blip on ngrok — can hang the handler for minutes with no error, no fallback, no user-visible feedback, and no retry boundary visible to the operator.

The exact distal trigger on 2026-04-16 22:23-22:26 (was OpenAI slow that minute? was ngrok jittery?) cannot be recovered because logs are stdout-only and the dev process has been restarted many times since. **But the proximate structural cause is identifiable from code alone** and matches the symptom shape exactly: silent 3-minute wait followed by eventual delivery is the canonical signature of an unbounded await on a slow upstream.

**This maps to scenario 1 (OpenAI API slowness) with a structural defect (no timeout) that converts a minor upstream blip into a ~3-minute UX failure.**

The fix has two layers:

- **Lower layer (openai.ts):** Add explicit `timeout` to `new OpenAI({ timeout: ... })` — e.g. 30-45s — so a stalled call surfaces as an error within a known bound instead of hanging.
- **Upper layer (handler.ts):** When the AI call errors or times out, send a graceful interim message ("Dame un segundo, ya te respondo" or similar) instead of silence. Optional: kick a background retry, but the priority is closing the silent-wait UX gap.

**Phase A pairing decision:** This does NOT meaningfully share code with BUG-01.

- BUG-01's fix is a debounce/lock in handler.ts processWithAi entry — concurrency control between concurrent handler invocations.
- BUG-02's fix is (a) timeout config in openai.ts (different file) and (b) interim-UX/error-path branch in handler.ts (different concern, different code region — the error handler around the `provider.chat(...)` calls, not the entry guard).

The two fixes touch handler.ts but operate on disjoint surfaces. They do not share invariants, they do not refactor the same lines, and one does not gate the other. **They should NOT be paired.**

## Recommendation

**Phase A scenario:** Scenario 1 (OpenAI API slowness) — but with a structural fix component. Per the v5.3.3 prework decision tree:

> "BUG-02 is OpenAI API latency or infra (no shared code path) → BUG-02 gets its own phase; BUG-01 stands alone in Phase A"

**Concrete recommendation: BUG-02 gets its own phase (Phase A2 or Phase E), separate from BUG-01.** Scope:

1. openai.ts — add explicit `timeout` to `new OpenAI({ timeout: 45_000 })` (45s; gpt-4o-mini p99 well under that). Update .env.example with optional `OPENAI_TIMEOUT_MS` override.
2. handler.ts — wrap the `provider.chat(...)` calls (line 584 and line 641 inside the tool loop) so that on `OpenAI.APIError` with timeout-shaped status (or generic timeout AbortError), Mica sends a single interim message ("Estoy procesando, dame un segundo 🙌") and either retries once or surfaces a graceful fallback ("Tuve un problemita técnico, ¿me lo escribís de nuevo?").
3. Same treatment likely warranted for the el-templo-api localhost calls inside `executeTool` (out-of-scope for BUG-02 but flag as follow-up).
4. Add a regression test that mocks OpenAI returning a slow response and asserts the handler bails within the timeout boundary.

**Defer-to-milestone confirmed.** No code changes from this debug session — fix lands in v5.3.3 Phase A2 (or whichever phase the orchestrator opens for BUG-02 standalone).

## Resolution

root_cause: OpenAI SDK client constructed with no explicit timeout (openai.ts:29). Default 600s timeout permits silent multi-minute hangs on any upstream slowness. No interim-UX in handler when AI call is slow. Logs from 22:23-22:26 incident are unrecoverable (stdout-only Pino), but the structural defect matches the symptom shape unambiguously.
fix: (deferred to v5.3.3 — own phase, NOT paired with BUG-01)
verification: (deferred — must include mocked-slow-OpenAI regression test)
files_changed: []
phase_a_scenario: 1 (OpenAI API slowness — with structural fix in client init + UX fix in handler error path)
phase_a_pairing_decision: BUG-02 standalone, NOT paired with BUG-01. They touch handler.ts but operate on disjoint surfaces (concurrency entry guard vs. AI-call error path).
