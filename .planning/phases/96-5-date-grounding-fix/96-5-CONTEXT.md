# Phase 96.5: Date Grounding Fix — Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot grounds today's date verbatim in the rendered system prompt instead of fabricating past dates. Closes Finding #2 from Phase 96 live UAT (2026-06-09): bot offered `date:"2023-11-06"` to `register_trial` when actual date was 2026-06-09 (~2.5 years in past). In production: zero successful trial bookings until fixed (backend rejects past `date` arg with `fetch failed`).

**HARD BLOCKER pre-v5.4.0 deploy.** Locked into v5.4.0 production-ready path step 1 per STATE.md 2026-06-10.

**Single deliverable:** a second `*Convención:*` line in `el-templo-bot/src/ai/system-prompt.ts` plus the parameterization infrastructure to keep the rendered snapshot fixture byte-equal across day boundaries. ~30 LOC production + ~5 LOC test = ~35 LOC total. No data, seed, API, tool-layer, or handler changes.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Directive wording

**Locked verbatim:** `*Convención:* Hoy es ${todayISO} (${todayDayName}). Nunca ofrezcas fechas anteriores a hoy.` (84 chars at worst-case day `miércoles`).

Variant chosen: hybrid grounding + specific past-date prohibition (Option D).

- **Rationale:** Finding #2's failure was specifically past-date hallucination (`date:"2023-11-06"`, ~2.5 years in past) — not generic miscalculation. The prohibition clause targets the exact empirical failure mode. Mirrors Phase 96 D-03 pattern (CTXT rule + explicit anti-pattern example).
- **Rejected alternatives:**
  - **Option A** (audit-verbatim minimal, 45 chars) — no prohibition; ships without defensive layer; no empirical evidence proves grounding alone is sufficient for past-date specifically.
  - **Option B** (generic prohibition "nunca inventes una fecha distinta", 79 chars) — vague; "distinta" could be parsed as wrong-format; doesn't target the observed failure mode.
  - **Option C** (day-name-first ordering, 42 chars) — no precedent; breaks structural parallel with the Sunday=0 line immediately above.
- **Fallback trim path under future KGATE budget pressure:** drop the prohibition clause → reverts to Option A's 45-char bare directive. The grounding anchor `Hoy es ${todayISO} (${todayDayName})` is **IRREDUCIBLE** — preserved under any trim. Mirrors Phase 96 D-11 fallback discipline.
- **Variable name convention:** camelCase `todayISO` and `todayDayName` matching `getSystemPrompt` opts naming (locked by D-02).

### D-02 — Date stub mechanism = render-time prompt args (Option (c))

**Locked:** `getSystemPrompt` gains 2 optional kwargs; defaults resolve to Argentine local date.

Function signature:

```ts
function getSystemPrompt(opts: {
  // ...existing fields unchanged...
  todayISO?: string;
  todayDayName?: string;
}): string;
```

Defaults inside function body:

```ts
const DAY_NAMES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const todayISO = opts.todayISO ?? <argentine_today_iso_expression>;
const todayDayName = opts.todayDayName ?? DAY_NAMES[<argentine_today_dow_expression>];
```

- **Rationale:** Single mechanism works across tests, snapshot regen, AND production. Production callers omit args → defaults to current Argentine date (zero behavioral change). Tests + regen pass explicit values → deterministic output. Forensic replay is one line. Regen↔test consistency guaranteed.
- **Rejected alternatives:**
  - **(a) `vi.useFakeTimers`** — vitest-bound; unavailable in `pnpm exec tsx -e` regen → dual implementation drift (exactly the pattern that contributed to Phase 96's 5.5h executor timeout).
  - **(b) `globalThis.Date` override at test boot** — broader blast radius (Phase 93/94/95 timer-heavy tests need audit; 95-03 DEGR-01 already flaky in the `vi.useFakeTimers + advanceTimersByTimeAsync` family); cannot do per-test forensic replay.
  - **(d) `getToday()` module export + `vi.spyOn`** — same vi-bound landmine as (a) for regen.
- **Aligns with Phase 96 D-12 precedent** — `parseExtractionResponse` helper added module-local API surface to `handler.ts` for testability; same trade-off, same conclusion.

#### D-02a — Argentine timezone resolution (DEFERRED to plan-phase)

The `<argentine_today_iso_expression>` and `<argentine_today_dow_expression>` placeholders must compute **Argentine local date** (`America/Argentina/Buenos_Aires`, UTC-3), NOT UTC. Production deploys to sa-east-1 per `deploy/DEPLOYMENT-CHECKLIST.md`; bot users are in Argentina.

Plan-phase decides between:

- **(preferred)** `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })` — native, robust, zero deps. Argentina has not observed DST since 2009, but `Intl` handles future-proofing for free.
- Hardcoded UTC-3 offset arithmetic — simpler, but brittle if DST policy ever changes.
- External lib (`date-fns-tz`) — overkill for one use case.

### D-03 — Frozen date for fixture + regen = 2026-06-10 (miércoles)

**Locked:** the canonical regen invocation passes `todayISO: '2026-06-10'`, `todayDayName: 'miércoles'`. The resulting `pb1-e1a-lead-rendered.snap.txt` becomes the byte-equal lock target.

- **Rationale:** `miércoles` is the longest Spanish day name (9 chars). Locking miércoles bakes **worst-case KGATE-05 stress** into the fixture: production renders with shorter day names always fit; future budget additions (Phase 97 ELEV-01/VOSEO-01, v5.4.0 hardening) trip CI BEFORE shipping if they crowd worst-case.
- **Semantic symmetry** with Phase 96's atomic ship date (2026-06-10 = `bea9a10a` GREEN + `4598dcea` SUMMARY) — readable lineage signal in future audits.
- **Rejected alternatives:** (i) today's actual ship date 2026-06-12 (viernes, 7 chars) — loses worst-case stress. (iii) generic 2026-01-01 (jueves, 6 chars) — same stress loss, plus no lineage. (iv) defer — same decision postponed; no benefit.

Regen invocation shape (plan-phase verifies exact `clientState`/`activePlaybook`/`currentStage` identifiers match `getSystemPrompt` signature):

```
pnpm exec tsx -e "
  import('./el-templo-bot/src/ai/system-prompt.ts').then(m =>
    process.stdout.write(m.getSystemPrompt({
      clientState: 'lead',
      activePlaybook: 'PB1',
      currentStage: 'E1A',
      todayISO: '2026-06-10',
      todayDayName: 'miércoles'
    }))
  )
" > el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
```

### D-04 — Test scope = 5 tests in new file `test/v5-3-3-date-grounding.test.ts`

**Locked:** Standard+1 — T1 + T2 + T3 + T4 + T5.

- **T1: Directive present** — regex match against rendered PB1.E1A lead prompt:
  `/\*Convención:\* Hoy es \d{4}-\d{2}-\d{2} \(\w+\)\. Nunca ofrezcas fechas anteriores a hoy\./`
  Locks substance via single regex covering grounding + prohibition.
- **T2: Snapshot fixture byte-equal** —
  `readFileSync(SNAP_PATH).toBe(getSystemPrompt({clientState:'lead', activePlaybook:'PB1', currentStage:'E1A', todayISO:'2026-06-10', todayDayName:'miércoles'}))`
  Locks complete prompt structure including all regions Phase 93/94/95/96 contributed.
- **T3: KGATE-05 worst-case budget** —
  `getSystemPrompt({..., todayDayName:'miércoles', todayISO:'2026-06-10'}).length <= 18916`
  **REQUIRED by D-03's miércoles-choice rationale.** Without T3, the worst-case stress decision is unenforced and a future regen on viernes could silently lose the guarantee.
- **T4: Default fallback verifies Argentine local date** — render with no `todayISO`/`todayDayName` args; assert the rendered prompt contains a `YYYY-MM-DD` pattern matching today in Argentine timezone AND a day name matching today in Argentine timezone. **Exact assertion implementation locked at plan-phase per D-02a resolution** (depends on which timezone mechanism is picked). Defensive against accidental refactor of the default fallback path.
- **T5: Forensic Lunes 2023-11-06 anchor (Finding #2 empirical replay)** — exact shape:

  ```ts
  it("renders directive with forensic Lunes 2023-11-06 anchor (Finding #2 empirical replay)", () => {
    const prompt = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      todayISO: "2023-11-06",
      todayDayName: "lunes",
    });
    expect(prompt).toContain(
      "*Convención:* Hoy es 2023-11-06 (lunes). Nunca ofrezcas fechas anteriores a hoy.",
    );
  });
  ```

  Locks parameterization with a SECOND data point AND anchors Finding #2's exact failure date in the test suite. Phase 96 T6 (`Nombre: Mati`) precedent — empirical anchor traceability for future audit readers.

- **Rejected:** T6 separate anti-hallucination clause assertion — over-precise; T1's regex already covers the prohibition string. Maintenance burden without coverage gain.
- **Test file location:** `el-templo-bot/test/v5-3-3-date-grounding.test.ts` (mirrors `v5-3-3-context-awareness.test.ts` and `v5-3-3-booking-reliability.test.ts` naming convention).

### Claude's Discretion

- **Exact test names + `describe` block structure** — follow Phase 96 `v5-3-3-context-awareness.test.ts` discipline; plan-phase authors specific identifiers.
- **Whether `DAY_NAMES` const lives module-private or is exported** — defer to plan-phase per Phase 95 D-16 / Phase 96 D-14 precedent (export only if a second consumer materializes; default file-private).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 96.5 scope locks

- `.planning/ROADMAP.md` Phase 96.5 section (Success Criteria SC#1..SC#6 + Notes; inserted 2026-06-12 commit `1d64c268`).
- `.planning/STATE.md` "v5.4.0 Production-Ready Path (LOCKED 2026-06-10)" path step 1 (execute-prompt guidance pre-flag; commit `c4697046`).
- `.planning/phases/96-context-awareness/96-CONTEXT.md` `<deferred>` section — Phase 96.5 scope verbatim.
- `.planning/phases/96-context-awareness/96-DISCUSSION-LOG.md` — Finding #2 investigation transcript + Hypothesis A verdict.

### Empirical evidence anchors (Finding #2 root-cause read)

- `el-templo-bot/src/ai/tools.ts:279-288` (`ScheduleRow` schema — no date column; only `day_of_week`).
- `el-templo-bot/src/ai/tools.ts:415` and `:426` (output formatters emit `${dayName} ${start_time}-${end_time}`, no date strings).
- `el-templo-bot/src/ai/tools.ts:691` (`book_class` accepts `date` from MODEL args verbatim).
- `el-templo-bot/src/ai/tools.ts:869` (`register_trial` same pattern).
- `el-templo-bot/src/ai/system-prompt.ts` — `grep "date|fecha|Hoy|today"` returned empty per Phase 96 discuss.

### Phase 96.5 implementation surfaces

- `el-templo-bot/src/ai/system-prompt.ts:217` — current first `*Convención:*` line (Sunday=0 directive from Phase 96 D-06). **Insertion point:** Phase 96.5 lands a SECOND `*Convención:*` line in the same region, before `*Reglas de uso de herramientas (CRITICO):*` at `:219`.
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — byte-equal lock target; wholly regenerated per D-03 invocation.
- `el-templo-bot/test/v5-3-2-regression.test.ts:6` — `POST_RLOK_04_BYTES = 18798`; bump to measured post-fix value per Phase 96 D-10 precedent.
- `el-templo-bot/test/fixtures/pb1-e1a-baseline.ts` — `BASELINE_CHARS = 23646`; **FROZEN, do not touch** (only `POST_RLOK_04_BYTES` advances).
- NEW: `el-templo-bot/test/v5-3-3-date-grounding.test.ts` — 5 tests per D-04.

### Carry-forward planning discipline

- `.planning/STATE.md` "Carry-forward planning constraints" — F-1/F-2 deprecation (DO NOT regenerate F-1 vitest RED grep / F-2 `pnpm lint` gates; substantive verify gates only per Engineering Learning 2026-05-18).
- `.planning/STATE.md` "v5.4.0 Production-Ready Path" Principle: 90-min execute hard cap; snapshot-regen executes MUST flag inline `pnpm exec tsx -e` + `Date.now()` stub approach in execute prompt.

### Deploy + timezone context

- `deploy/DEPLOYMENT-CHECKLIST.md` — production deploys to sa-east-1 (São Paulo); user base in Argentina; Argentine local date is the production-correct anchor.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `getSystemPrompt` in `el-templo-bot/src/ai/system-prompt.ts` already takes an options object; adding `todayISO?` / `todayDayName?` is backward-compatible. Existing callers in `handler.ts` need zero changes.
- Phase 96 atomic-commit cadence (RED → GREEN → SUMMARY) reused; same TDD discipline.
- Phase 96's snapshot-regen pattern (`pnpm exec tsx -e` + redirect to fixture) reused with two extra kwargs.

### Established Patterns

- **`*Convención:*` single-line markers** — Phase 96 D-06 established the pattern (`*Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.`). Phase 96.5 lands a second instance in the same region. No section refactor needed; the two markers coexist as parallel single-line directives.
- **KGATE-05 dual-threshold budget arithmetic** — cap is `floor(BASELINE_CHARS * 0.8) = 18916`. Phase 96 verified at 18798 (margin 118). Phase 96.5 estimate: directive 84 chars at worst-case day → expected `POST_RLOK_04_BYTES` ≈ 18840–18860 → margin ≈ 56–76 chars remaining for Phase 97 + v5.4.0.
- **Module-local helper externalization rule** — Phase 95 D-16 / Phase 96 D-14 precedent: co-locate helpers (e.g., `DAY_NAMES`) until a second consumer materializes.
- **F-1/F-2 verify gates are deprecated** — substantive verify gates only (sha256 drift sentry, `pnpm tsc --noEmit`, exact-file-count assertion, commit-subject regex, negative-assertion `git diff` guards, code-discipline grep on new files, explicit `<human-check>` checklist).

### Integration Points

- `getSystemPrompt` callers in `el-templo-bot/src/webhook/handler.ts` — UNCHANGED (omit new kwargs → defaults apply).
- Snapshot fixture readers (`test/ai/rendered-prompt-snapshot.test.ts`, `test/v5-3-2-regression.test.ts`) — unchanged behavior after fixture regen + `POST_RLOK_04_BYTES` bump.
- `register_trial` / `book_class` tools at `tools.ts:691` and `:869` — UNCHANGED. Phase 96.5 fixes the prompt-grounding root cause; tool-layer date validation is explicitly out of scope.

</code_context>

<specifics>
## Specific Ideas

### Finding #2 — empirical anchor (from `96-DISCUSSION-LOG.md`)

- 2026-06-09 live UAT: `register_trial` called with `date:"2023-11-06"`. Actual date 2026-06-09. Bot fabricated a date ~2.5 years in the past.
- 2023-11-06 was a Monday — so the day name matched the user's "lunes" preference. Failure was specifically past-date hallucination, NOT day-of-week miscalculation.
- Verdict locked at Hypothesis A (pure model hallucination) via tools.ts read + system-prompt grep empty. No data, seed, API, or tool-layer touches needed.

### Phase 96 ship pattern reuse

Phase 96 shipped via atomic RED → GREEN → SUMMARY chain (`071e53fa` → `bea9a10a` → `4598dcea`) over a 5.5h timed-out session + 30 min recovery. Phase 96.5 must avoid the timeout — the execute-prompt MUST explicitly pre-flag the `pnpm exec tsx -e` regen approach with the date-stub kwargs.

### Spanish day name reference

`miércoles` is the longest Spanish day name (9 chars). KGATE-05 measures JavaScript `.length` (UTF-16 code units), so accented `é` = 1 code unit; budget arithmetic uses `.length` consistently. UTF-8 byte counts are not used.

</specifics>

<deferred>
## Deferred Ideas

### To plan-phase (within Phase 96.5)

- **D-02a Argentine timezone resolution** — see D-02 above. Recommended: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`.
- **T4 exact assertion shape** — depends on D-02a resolution. Plan-phase locks the regex against the resolved timezone-aware default.
- **Whether `DAY_NAMES` is exported** — default file-private; export only if a second consumer materializes.
- **Exact test names + `describe` block structure** — follow Phase 96 conventions.

### Out of scope (HARD GUARDS)

- **Tool-layer date validation** (`tools.ts` rejecting past dates server-side) — defensive belt-and-suspenders; Phase 96.5 fixes the prompt-grounding root cause. Tool validation can be added as a v5.4.0 hardening item if Manual UAT Round 2 reveals residual hallucinations.
- **Phase 96 surfaces** — CTXT rule, `parseExtractionResponse` helper, SOFT_REJECTION region all UNCHANGED.
- **Phase 93/94/95 surfaces** — concurrency guard, OpenAI client, tool loop, retry counter, `withTimeout` helper UNCHANGED. Phase 96.5 modifies exactly one production surface: `system-prompt.ts` (directive insertion + `getSystemPrompt` opts addition).
- **`BASELINE_CHARS = 23646`** — FROZEN. Only `POST_RLOK_04_BYTES` advances.
- **Behavioral live-test for date grounding** — Phase 97 RGUARD-01 territory; Phase 96.5 ships structural assertions only.

### To v5.4.0 or later

- **Timezone deep dive** (UTC vs Argentine vs cross-timezone edge cases) — D-02a addresses the immediate need (Argentine local date). DST policy changes, multi-timezone users, etc. are v5.4+ territory.
- **Multi-day-simulation test** — exercise all 7 distinct day names to verify each renders correctly. T5's forensic replay already exercises one non-default day (`lunes`); broader coverage is v5.4+ if empirically needed.

</deferred>

<carry_forward_principles>

## Carry-Forward Principles (from STATE.md v5.4.0 Production-Ready Path)

### 6-pair sha256 invariant — UNCHANGED in Phase 96.5

The canonical `DEBOUNCE_TTL_SECONDS` block hashes byte-equal across all 6 anchors at:

`67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`

Phase 96.5 modifies zero terms in the invariant. **SC#5 verification:** `shasum -a 256` on the extracted block at each of the 6 anchors before and after Phase 96.5 ship — same hash.

### KGATE-05 arithmetic

- `BASELINE_CHARS = 23646` (FROZEN; from `pb1-e1a-baseline.ts`).
- Cap: `floor(BASELINE_CHARS * 0.8) = 18916`.
- Post-Phase-96 baseline: `POST_RLOK_04_BYTES = 18798` (margin 118 chars).
- Phase 96.5 directive: 84 chars worst-case (`miércoles`).
- Expected post-Phase-96.5 `POST_RLOK_04_BYTES`: ~18840–18860 (measured at plan-time + execute-time).
- Expected margin remaining: ~56–76 chars.

### Engineering discipline

- **No F-1/F-2 verify gate regeneration** — substantive gates only (Engineering Learning 2026-05-18 locked in STATE.md).
- **90-min hard cap per execute** — fallback to §9a before recurrence of Phase 96 5.5h timeout pattern.
- **Snapshot regen execute-prompt pre-flag** — MUST explicitly call out `pnpm exec tsx -e` + the Argentine-date stub approach inline in the execute prompt. The stub is the explicit `todayISO` / `todayDayName` kwargs passed to `getSystemPrompt`, NOT `vi.useFakeTimers` (that's vitest-only).
- **Atomic RED → GREEN → SUMMARY commit chain** — Phase 96 cadence reused.

</carry_forward_principles>

---

_Phase: 96.5-date-grounding-fix_
_Context gathered: 2026-06-12_
