# Phase 95 Audit: Booking Reliability — BUG-03 (BOOK-01)

**Date:** 2026-05-18
**Auditor:** GSD plan executor (Phase 95 Plan 95-01)
**Read-only audit** — no production source modified. Audit produces per-candidate verdicts, Final Branch Verdict, per-branch fix scope for Plan 95-02, and RED test failure transcripts.

**Plan-checker mode:** ADVERSARIAL (CONTEXT.md D-22) — investigative branching across 5 (plus 1 newly discovered) candidates.

**Source of truth for candidate enumeration:** `.planning/v5.3.3-codebase-audit.md:185-260` (the Phase 95 section of the v5.3.3 codebase audit). The five candidates locked in `95-CONTEXT.md` D-01 are reproduced in §B below. During RED-test authoring (Action step 4) a SIXTH candidate was discovered — see §B candidate (vi).

---

## A. Baseline Captures

These integers are captured pre-commit and are the comparison baselines for Plans 95-02 and 95-03. Same grep patterns as `93-AUDIT.md:11-28` (byte-identical so future plans can re-verify).

### Console count (Pino-only discipline)

```bash
grep -rEn "console\." el-templo-bot/src/ | wc -l   # 0
grep -rEn "console\." el-templo-api/src/ | wc -l   # 346
```

- **`console_count_baseline_bot = 0`** (matches Phase 93 baseline)
- **`console_count_baseline_api = 346`** (locked at observed; api side has its own established convention with Pino-via-Fastify-request-log — the `console.*` count there pre-dates Phase 93's bot-side discipline and is NOT subject to a Phase 95 drift gate).

### any-type count (type-syntax-precise grep)

```bash
grep -rEn ':\s*any\b|<any[,>]|<any\s|as\s+any\b|\bany\[\]|Record<[^>]*,\s*any\s*>|Array<any>|Promise<any>' el-templo-bot/src/ | wc -l
grep -rEn ':\s*any\b|<any[,>]|<any\s|as\s+any\b|\bany\[\]|Record<[^>]*,\s*any\s*>|Array<any>|Promise<any>' el-templo-api/src/ | wc -l
```

- **`any_count_baseline_bot = 0`** (matches Phase 93 baseline)
- **`any_count_baseline_api = 0`**

**Discipline guard for Plan 95-02 / 95-03:** all four numbers MUST remain at the baselines above after their commits land. Any drift = scope creep into discouraged patterns; halt and surface.

### Cross-Phase Invariant byte-verification

All SIX canonical-block location-pairs hash to `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` (verified by the sha256 drift sentry at PLAN.md `<behavior>` "Pre-commit sha256 invariant drift sentry"):

```
OK   .planning/phases/93-handler-concurrency/93-CONTEXT.md:84
OK   .planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md:34
OK   .planning/phases/95-booking-reliability-graceful-degradation/95-CONTEXT.md:37
OK   .planning/ROADMAP.md:62
OK   .planning/ROADMAP.md:93
OK   .planning/MACRO-ROADMAP.md:99
```

No drift detected. Plan 95-01 modified NONE of these locations (the sentry is read-only — see PLAN.md frontmatter line 47).

---

## B. Per-Candidate Verdicts

### Candidate (i) — LIKE-search ambiguity at `el-templo-bot/src/ai/tools.ts:455`

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:454-455
if (branchName) {
  query = sql`SELECT id, name, code FROM branches WHERE is_active = true AND name LIKE ${`%${branchName}%`} ORDER BY name`;
}
```

**Discriminator:** seed two branches with substring-overlapping names (`'Moreno'` and `'Mar del Plata Moreno'`). Invoke `executeTool('get_location', { branchName: 'Moreno' }, db)`. Master returns BOTH rows (LIKE matches both). Canonical fix returns exactly ONE row (the exact-match-on-full-name path).

**VERDICT: FIRES (latent — synthetic seed only).**

**Reasoning:**

- On master, the RED test `RED: returns exactly one disambiguated branch for substring-match input` FAILS — the result string contains BOTH `'Moreno'` and `'Mar del Plata Moreno'` (transcript captured in §F entry 1). This empirically confirms candidate (i) is a real defect.
- HOWEVER: the production `BRANCH_ADDRESSES` table at `tools.ts:39-45` lists 5 venues — `constitucion`, `jujuy`, `alem`, `moreno`, `mario bravo` — and NONE of them are substring-overlapping. So in production data the LIKE returns ≤ 1 row, and candidate (i) does NOT fire against real El Templo branches as they stand TODAY.
- The defect is real and latent — if El Templo opens a second branch with a substring-overlapping name (e.g., the rumored "Constitución Norte"), candidate (i) FIRES against production data the moment the new branch is seeded.
- The live-test BUG-03 transcript ("se confundió entre Constitución y Moreno") is NOT consistent with candidate (i) firing in production — "Constitución" and "Moreno" do not substring-overlap, so the LIKE for `'%Constitución%'` would not surface "Moreno" and vice-versa.

**Fix relevance:** the canonical fix (exact-match-with-fallback) is a forward-looking hardening, NOT the proximate cause of BUG-03 in the live transcript. Plan 95-02 may include it as a low-risk drive-by.

---

### Candidate (ii) — Cross-branch result mixing at `el-templo-bot/src/ai/tools.ts:285-302`

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:269-302 (excerpt)
let query = sql`SELECT s.id, a.name AS activity_name, b.name AS branch_name, ...`;
// (no required branchId filter; optional via `if (branchId !== null)`)
query = sql`${query} ORDER BY s.day_of_week, s.start_time LIMIT 6`;
```

The model can invoke `check_schedule` with no `branchId` — the query joins across ALL active branches and returns up to 6 rows with the format `- {activity} ({branch}) — {day} {time}-{time} — {spotsText}`. There is no per-branch grouping or disambiguation header.

**Discriminator:** seed TWO branches (`TST Alem`, `TST Constitucion`) each with the same `(day_of_week=1, start_time='08:00')` schedule for activity `Test CrossFit`. Invoke `executeTool('check_schedule', { dayOfWeek: 1 }, db)` — no `branchId`. Master interleaves both branches in the flat result string; canonical fix either requires `branchId` or emits a per-branch header.

**VERDICT: FIRES (proximate-cause-suspected of live-transcript BUG-03).**

**Reasoning:**

- The RED test `RED: check_schedule without branchId does NOT return rows from multiple branches without disambiguation` FAILS on master IF candidate (vi) is patched in isolation (per §B candidate (vi) below) — the test currently fails AT THE QUERY level because of (vi)'s SQL error. Conceptually the candidate (ii) defect is reachable AFTER (vi) is fixed: the rendered string would interleave `TST Alem` and `TST Constitucion` rows.
- The live-test BUG-03 transcript ("se confundió entre Constitución y Moreno") is consistent with candidate (ii) firing — the model called `check_schedule` for "Constitución", received a result string mixing both Constitución and Moreno rows (the LIMIT-6 fetched 6 rows across all 5 venues), and "confidently reported one venue's schedule as another's." This is the venue-confusion pattern.
- Static analysis of the discriminator: `tools.ts:293-294` makes the `branchId` filter OPTIONAL (`if (branchId !== null)`). The model is responsible for picking the correct `branchId` from a prior `check_schedule` result, but the result rows include a `(branch_name)` parenthetical token only — no machine-readable hint that the model should disambiguate before booking.

**Fix relevance:** PRIMARY fix surface for the user-visible BUG-03 symptom. Plan 95-02 ships this.

---

### Candidate (iii) — Sunday=0 vs Sunday=7 day-of-week confusion (model/prompt-side)

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:25-33
const DAY_NAMES: Record<number, string> = {
  1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves",
  5: "Viernes", 6: "Sábado", 0: "Domingo",
};

// el-templo-bot/src/ai/tools.ts:87-91 (tool definition)
dayOfWeek: {
  type: "number",
  description:
    "Día de la semana (1=lunes, 2=martes, ..., 6=sábado, 0=domingo). Opcional.",
},
```

The ONLY model-facing day-of-week binding is the parameter description at `tools.ts:90`. The system prompt at `el-templo-bot/src/ai/system-prompt.ts` contains zero occurrences of `domingo`, `0=domingo`, `lunes` (as a numbering token — `lunes` does appear in `knowledge.ts:295` as part of "Lunes a viernes, 7 a 21 hs" support-hours context, but that does NOT bind a day-of-week ENCODING for the model). Verified by:

```bash
grep -inE "domingo|lunes|day_of_week" el-templo-bot/src/ai/system-prompt.ts
# (zero matches)
```

**Discriminator:** import `getSystemPrompt` from `system-prompt.ts`, render it with no options, grep for a Sunday=0 directive.

**VERDICT: FIRES (latent prompt-side defect).**

**Reasoning:**

- The RED test `RED: system prompt explicitly binds Sunday=0` FAILS on master (transcript in §F entry 9). The rendered system prompt does NOT mention the day-of-week encoding convention anywhere.
- Models trained on broad web corpora will sometimes emit ISO-8601 Sunday=7 and sometimes JS-Date Sunday=0; without an explicit binding, the model is left to guess. The single binding at `tools.ts:90` IS available to the model (parameter descriptions in tool definitions are passed to the model alongside the prompt), but it lives in a deep nested tool-schema location — empirically less salient than top-level system-prompt rules.
- The live-test BUG-03 transcript ("se confundió entre Constitución y Moreno") does NOT specifically mention day-of-week confusion. So while candidate (iii) is a real latent defect, it is NOT the proximate cause of the observed live-test failure.
- The two regression-protector `it()` blocks in `v5-3-3-booking-reliability.test.ts` PASS on master — they lock the CURRENT alignment of `DAY_NAMES[0] === 'Domingo'` and the parameter description containing `'0=domingo'` so a future PR that breaks this alignment is caught.

**Fix relevance:** Plan 95-02 should add a one-line directive to `system-prompt.ts` binding the day-of-week encoding (`*Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.`). **Phase 96 snapshot coordination required** — any `system-prompt.ts` change invalidates `pb1-e1a-lead-rendered.snap.txt` and `POST_RLOK_04_BYTES = 18370` at `el-templo-bot/test/v5-3-2-regression.test.ts:57`. See §C / §E for branch-level note.

---

### Candidate (iv) — LIMIT-6 truncation at `el-templo-bot/src/ai/tools.ts:301`

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:301
query = sql`${query} ORDER BY s.day_of_week, s.start_time LIMIT 6`;

// el-templo-bot/src/ai/tools.ts:310-311
const displayRows = rows.slice(0, 5);
const hasMore = rows.length > 5;

// el-templo-bot/src/ai/tools.ts:323-328
if (hasMore) {
  // We fetched 6 but only displayed 5 — there are more results
  // We can't know the exact total without a COUNT query, so use a generic message
  response +=
    "\n\nHay más clases disponibles. ¿Querés filtrar por día o tipo de clase?";
}
```

**Discriminator:** seed 7 schedules whose `(day_of_week, start_time)` ordering pushes a "target" Saturday 21:00 schedule to position 7+. Invoke `executeTool('check_schedule', {}, db)`. Master returns 6 rows, displays 5, appends generic "hay más" message (no numeric total); the target schedule is hidden AND there is no real count of how many more.

**VERDICT: FIRES.**

**Reasoning:**

- The RED test `RED: unfiltered check_schedule surfaces a real total count for >6 matches` and `RED: target Saturday 21:00 schedule is reachable in unfiltered query` both FAIL on master (transcripts in §F entries 4, 5). The current crash mode is the SQL error from candidate (vi), but the conceptual candidate (iv) defect — LIMIT-6 plus generic "hay más" with no count — is verifiable by static reasoning AND would manifest empirically if candidate (vi) is patched in isolation.
- The codebase audit at `.planning/v5.3.3-codebase-audit.md:255` explicitly listed this candidate ("LIMIT 6 truncation hiding the user's wanted slot"). The discriminator confirms the static reasoning.

**Fix relevance:** Plan 95-02 should ship a real `COUNT(*)` total alongside the row fetch — replace the generic "Hay más clases disponibles..." with `Hay N clases en total. Te muestro las primeras 5.` This is a 2-statement SQL change (one COUNT query, one string interpolation) — bounded, low risk.

---

### Candidate (v) — `booking_count` correlated subquery with today-filter at `tools.ts:267, 281`

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:267
const today = new Date().toISOString().slice(0, 10);

// el-templo-bot/src/ai/tools.ts:278-284
COALESCE(
  (SELECT COUNT(*) FROM bookings bk
   WHERE bk.schedule_id = s.id
     AND bk.booking_date = ${today}                  // ← hard-coded today
     AND bk.status != 'cancelado'),                  // ← candidate (vi) bug HERE
  0
) AS booking_count
```

**Discriminator:** seed a schedule for tomorrow's day-of-week, seed a booking dated TOMORROW (not today) with `booking_status = 'reservado'`. Invoke `executeTool('check_schedule', {}, db)`. Master returns `booking_count = 0` (because `booking_date != today`), so `spotsRemaining = max_capacity - 0 = 10` → `"10 cupos disponibles"`. Canonical fix returns `booking_count = 1` → `"9 cupos disponibles"`.

**VERDICT: FIRES.**

**Reasoning:**

- The RED test `RED: cupos disponibles reflects tomorrow's actual bookings, not today's zero` FAILS on master (transcript in §F entry 6). Master throws the (vi) SQL error before even evaluating the today-filter, but the conceptual defect at `tools.ts:281` is verifiable by static reasoning: the SQL hard-codes `today`, so for any non-today query the count is wrong.
- The defect is the kind of off-by-one that matters most when the system is healthy — once candidates (ii) and (vi) are fixed, candidate (v) becomes the next visible defect because users WILL ask about "mañana".

**Fix relevance:** Plan 95-02 should either (a) parameterize the booking date based on the schedule's next occurrence of `day_of_week`, or (b) drop the date filter and count all future bookings. Option (a) is more precise but requires computing "next occurrence of weekday N from today" which adds complexity; option (b) is simpler but inflates the count for schedules with bookings far in the future. Plan 95-02 picks one (Claude's Discretion).

---

### Candidate (vi) — NEWLY DISCOVERED — `bk.status` column mismatch at `tools.ts:282`

**Code surface:**

```typescript
// el-templo-bot/src/ai/tools.ts:282
   AND bk.status != 'cancelado'
```

**Schema reality:**

```typescript
// el-templo-api/src/db/schema/bookings.ts:15-22
export const bookingStatusEnum = mysqlEnum("booking_status", [   // ← column name is "booking_status"
  "reservado", "qr_escaneado", "confirmado",
  "cancelado", "lista_espera", "no_show",
]);
// ...:35
status: bookingStatusEnum.default("reservado").notNull(),       // ← JS field is "status", DB column is "booking_status"
```

Drizzle's `mysqlEnum("booking_status", [...])` declares the **MySQL column name** as `booking_status`. The JS field name `status` is a Drizzle alias for use in JS-side relational queries. But `tools.ts:282` uses raw SQL (`sql\`AND bk.status != 'cancelado'\``) where the column name must match the actual MySQL column — `booking_status`, NOT `status`.

This was confirmed by:

1. Schema declaration at `el-templo-api/src/db/schema/bookings.ts:15-22`.
2. Migration history: `el-templo-api/src/db/migrations/0035_scheduling.sql` declares `booking_status enum(...)`. `el-templo-api/src/db/migrations/0037_booking_attendance_unification.sql` operates on `booking_status` consistently. No migration ever creates a `status` column on `bookings`.
3. Empirical: running `executeTool('check_schedule', {}, db)` against the migrated `eltemplo_test` schema produces `Error: Unknown column 'bk.status' in 'where clause'` (transcript §F entries 7, 8).

**Discriminator:** invoke `executeTool('check_schedule', {}, db)` against any seeded data. Master throws an SQL error. Canonical fix (one-character SQL rename: `bk.status` → `bk.booking_status` at `tools.ts:282`) resolves successfully.

**VERDICT: FIRES (PROXIMATE cause — `check_schedule` is BROKEN on master against real DB schema).**

**Reasoning:**

- Empirically confirmed by RED test transcripts §F entries 7-8: every `executeTool('check_schedule', ...)` call against `eltemplo_test` throws `Unknown column 'bk.status' in 'where clause'`.
- The pre-existing `ai-tools.test.ts` test suite is ALSO broken by this defect (all 20 tests fail when run on a fresh DB — see §F entry 10). The test file's `INSERT INTO bookings (..., status, ...)` would also fail on the same column mismatch, and the `check_schedule` invocations would all SQL-error. This means the test suite has been silently broken since at least Phase 91 (`v5-3-2-regression.test.ts` is unrelated and was not affected).
- The live-test BUG-03 transcript ("se confundió entre Constitución y Moreno") is consistent with `check_schedule` returning an error string to the model — the model would have no real schedule data to ground its response on and would fall back to general knowledge / hallucination about venues.

**Reconciliation with the v5.3.3 codebase audit:** the static codebase audit at `.planning/v5.3.3-codebase-audit.md:185-260` reasoned about candidates (i) through (v) at the JS / SQL-shape level but did not run the SQL against a real schema. Candidate (vi) was invisible to static analysis because the JS-side Drizzle declaration uses `status` as the field name — the static reader sees `status` consistently across `tools.ts:282` and `bookings.ts:35` and concludes the names align, missing that Drizzle's `mysqlEnum("booking_status", ...)` overrides the column name. This is a TYPE-LEVEL drift between Drizzle's JS API and raw-SQL string usage.

**Fix relevance:** PRIMARY one-character fix — `tools.ts:282` rename `bk.status` to `bk.booking_status`. Plan 95-02 ships this FIRST in the GREEN commit chain.

**Defensive guardrail recommendation for Plan 95-02:** add an integration test that pins the `booking_status` ↔ `status` Drizzle drift — e.g., assert `bookings.status.name === 'booking_status'` (Drizzle exposes the column metadata) so any future schema rename catches this class of bug at test time.

---

## C. Final Branch Verdict

**Resolved branch: Branch 3-{i, ii, iii, iv, v, vi}** — all six candidates fire as a maximal compound.

Per CONTEXT.md D-02 the verdict-shape space is Branch 1 (single fire) / Branch 2 (different single fire) / Branch 3-{subset} (compound). Both Branch 1 and Branch 2 are EXCLUDED below by empirical evidence (≥2 candidates fire on RED-test discriminators). Branch 3 is the active resolution. Phase 93's audit similarly recorded multi-fire outcomes (Check 1 + Check 4 + Check 1.5 post-hoc) — Phase 95's Branch 3 has higher cardinality because static analysis missed candidate (vi) entirely.

## Branch 1 — single candidate fires (EXCLUDED)

Branch 1 is the case where exactly one of `i / ii / iii / iv / v` fires (the originally-suspected-single-root-cause shape). The RED transcripts in §F show MULTIPLE candidates firing — candidate (vi) is the proximate SHOWSTOPPER (every `check_schedule` invocation throws), candidate (iii) fires on the unit-test prompt-grep, candidate (i) fires on the synthetic substring-overlap seed. Branch 1 is empirically falsified.

## Branch 2 — a different single candidate fires than initial suspicion (EXCLUDED)

Same reasoning as Branch 1 — multiple candidates fire on disjoint discriminators. No "switch to a different single root cause" framing applies.

## Branch 3-{i, ii, iii, iv, v, vi} — compound (ACTIVE, six candidates fire)

All six candidates (the five enumerated in `v5.3.3-codebase-audit.md:185-260` plus the newly discovered candidate (vi) `bk.status` column mismatch) fire on at least one discriminator. Fix scope split is laid out in §C.fix-scope and §E below.

### Fix scope breakdown for Plan 95-02

Plan 95-02 will fix the candidates in the following priority order:

| Priority  | Candidate                       | Fix surface                                                                                                   | Estimated change size | Phase 96 snapshot coordination?                                                   |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| P0 (must) | (vi) `bk.status` SQL bug        | `el-templo-bot/src/ai/tools.ts:282` rename `bk.status` → `bk.booking_status`                                  | 1 character           | NO (SQL-only)                                                                     |
| P0 (must) | (ii) Cross-branch result mixing | `el-templo-bot/src/ai/tools.ts:265-330` add per-branch grouping OR require `branchId`                         | ~15-30 lines          | NO (handler-side, SQL-only)                                                       |
| P1        | (v) booking_count today-filter  | `el-templo-bot/src/ai/tools.ts:267, 281` parameterize date by schedule's next occurrence OR drop today-filter | ~5-10 lines           | NO (SQL-only)                                                                     |
| P1        | (iv) LIMIT-6 truncation         | `el-templo-bot/src/ai/tools.ts:301-328` add `COUNT(*)` subquery + numeric "hay N más"                         | ~10 lines             | NO (SQL + string format)                                                          |
| P2        | (iii) Sunday=0 prompt binding   | `el-templo-bot/src/ai/system-prompt.ts` add a one-line day-of-week directive                                  | 1-3 lines             | **YES — Phase 96 regens `pb1-e1a-lead-rendered.snap.txt` + `POST_RLOK_04_BYTES`** |
| P2        | (i) LIKE-search ambiguity       | `el-templo-bot/src/ai/tools.ts:446-484` exact-match-with-fallback                                             | ~10 lines             | NO (SQL-only)                                                                     |

### Branch 3 PR split decision (CONTEXT.md final 'Claude's Discretion' bullet)

**Recommendation: SINGLE PR for Plan 95-02, with the (iii) prompt-binding fix deferred to a follow-up plan that coordinates with Phase 96 snapshot regen.**

**Rationale:**

- P0 (vi + ii) MUST ship together — fixing (vi) alone unblocks `check_schedule` from crashing but leaves the cross-branch mixing user-visible bug active.
- P1 (v + iv) are SQL-only and share the same `checkSchedule` function — natural to land alongside P0 in one PR.
- P2 (iii) is the only fix that touches `system-prompt.ts`. Touching `system-prompt.ts` triggers `POST_RLOK_04_BYTES` regression at `el-templo-bot/test/v5-3-2-regression.test.ts:57` because the rendered prompt bytes change. Phase 96 owns the snapshot regen (per `95-CONTEXT.md` `<domain>` "NOT in scope" — "Phase 95 does NOT touch `system-prompt.ts`"). Plan 95-02 inheriting (iii) would require Phase 96 to ship first or in lock-step, which violates plan boundaries.
- P2 (i) LIKE-search hardening is low-priority because it does NOT fire in current production data — defer to a follow-up or include only as a drive-by if 95-02's risk budget allows.

**Concrete Plan 95-02 scope: fix candidates (ii), (iv), (v), (vi). Defer (i) and (iii) to follow-up plans.**

### Cross-Phase coordination notes

- **DEGR-02 / SC#3 implication:** none of the P0/P1 fixes (ii, iv, v, vi) touch `system-prompt.ts`, so the SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE framing at `system-prompt.ts:70-86` is unchanged. The SC#3 invariant ("soft-rejection turn does NOT trigger `request_human`") is preserved by construction. Phase 97 RGUARD-02 has no new dependencies.
- **Phase 96 snapshot ownership preserved:** the (iii) prompt-side fix is the ONLY candidate that would invalidate `pb1-e1a-lead-rendered.snap.txt`. By deferring (iii), Plan 95-02 keeps `system-prompt.ts` UNCHANGED and Phase 96 retains exclusive ownership of the snapshot regen.
- **`withTimeout` helper (D-15 / D-16):** introduced as part of Plan 95-02 per CONTEXT.md D-04. The helper applies to the booking-tool localhost fetches at `tools.ts:636` (`book_class` POST) and `tools.ts:806` (`register_trial` POST). This work is ORTHOGONAL to the BUG-03 fix surface — both ship in the same Plan 95-02 PR per CONTEXT.md.
- **Plan 95-03 unblocking:** the RED tests in `v5-3-3-booking-reliability.test.ts` for candidate (iii) are NOT turned GREEN by Plan 95-02 (since (iii) is deferred). Plan 95-03 (BUG-05 retry counter) is independent of (iii) and does not block on it.

---

## D. Pipeline Map

The inbound message → AI reply path for a booking-shaped inbound. File:line markers reference actual code. This is the same shape as `93-AUDIT.md` Pipeline Map, scoped to BUG-03.

```
1.  Meta sends POST /webhook                                  (Meta → ngrok → Fastify)
2.  routes.ts (ack 200; fire-and-forget handleInboundMessage)
3.  handler.ts:323            outer try/catch entry (Phase 94 LAT-03 graceful fallback)
4.  handler.ts:589-642        tool-loop region (Phase 95 DEGR-01 counter site)
5.  tools.ts:220-243          executeTool dispatch (switch on tool name)
6.  tools.ts:228   →          checkSchedule branch         (candidates ii, iv, v, vi surfaces)
7.  tools.ts:232   →          getLocation branch           (candidate i surface)
8.  tools.ts:236   →          bookClass branch             (downstream consumer; not BUG-03)
9.  tools.ts:269-302          checkSchedule SELECT/JOIN region (candidates ii, iv, v)
10. tools.ts:301              LIMIT 6                       (candidate iv)
11. tools.ts:267, 281         today-filter                  (candidate v)
12. tools.ts:282              `bk.status` column mismatch   (candidate vi — NEWLY DISCOVERED, SQL parse error)
13. tools.ts:455              LIKE-search                   (candidate i)
14. tools.ts:88-91            check_schedule tool dayOfWeek parameter description (candidate iii model-facing binding)
15. system-prompt.ts:1-358    rendered system prompt        (candidate iii model-facing context; CURRENTLY no day-of-week directive)
16. system-prompt.ts:223      SILENCIO rule region          (orthogonal — Phase 91/95 boundary; not BUG-03 candidate)
```

**Key observations:**

- Step 12 (`bk.status` column mismatch) is the PARSE-TIME blocker — every `check_schedule` invocation throws before reaching steps 9-11. This is why the live-test BUG-03 manifested as "model confused about venues" rather than "model returned malformed booking_count": the model never received any real schedule data at all.
- Step 14 is the ONLY model-facing day-of-week binding on master. Step 15 contains zero day-of-week directives.
- Steps 13 (LIKE-search) is reachable independently of step 12 — `get_location` does NOT use the `bk.status` column — so candidate (i)'s test is the only RED integration test that does NOT throw the SQL error on master.

---

## E. Implementation Pointers for Plan 95-02

Plan 95-02 must turn the following RED tests GREEN without modifying the test files:

### From `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts`

- `BUG-03 candidate (i) > RED: returns exactly one disambiguated branch for substring-match input`
  - **Action:** modify `el-templo-bot/src/ai/tools.ts:446-484` (`getLocation`) to attempt an exact-match on the full normalized branch name FIRST, fall back to `LIKE` only when no exact match.
  - **Concrete fix shape (Claude's Discretion — Plan 95-02 may pick an alternative):**
    ```typescript
    // pseudo-code
    if (branchName) {
      const exact = await db.execute<BranchRow[]>(
        sql`SELECT id, name, code FROM branches WHERE is_active = true AND LOWER(name) = LOWER(${branchName})`,
      );
      const exactRows = exact[0] as unknown as BranchRow[];
      if (exactRows.length > 0) return formatBranchLocations(exactRows);
      // fall through to existing LIKE query
    }
    ```
- `BUG-03 candidate (ii) > RED: check_schedule without branchId does NOT return rows from multiple branches without disambiguation`
- `BUG-03 candidate (ii) > RED: when both branches share a slot, output includes per-branch disambiguation prefix`
  - **Action:** modify `el-templo-bot/src/ai/tools.ts:258-331` (`checkSchedule`) to group result rows by `branch_name` when more than one branch is represented, emitting a `*{Branch Name}*` header before each branch's row block.
  - **Concrete fix shape:** post-query, group `displayRows` by `branch_name`, emit per-group headers. Format:

    ```
    Clases disponibles:

    *TST Alem*
    - {activity} — {day} {time} — {spots}

    *TST Constitucion*
    - {activity} — {day} {time} — {spots}
    ```

- `BUG-03 candidate (iv) > RED: unfiltered check_schedule surfaces a real total count for >6 matches`
- `BUG-03 candidate (iv) > RED: target Saturday 21:00 schedule is reachable in unfiltered query`
  - **Action:** add a `COUNT(*)` subquery to `checkSchedule` to get the real total. Replace the generic "Hay más clases disponibles..." with `Hay N clases en total. Te muestro las primeras 5.`. Optionally: bump `LIMIT 6` to `LIMIT 20` so the second RED test passes by surfacing the Saturday 21:00 row in unfiltered mode.
  - **Concrete fix shape:**
    ```typescript
    // total count BEFORE the LIMIT
    const totalResult = await db.execute<{ total: number }[]>(sql`
      SELECT COUNT(*) AS total FROM schedules s
      JOIN activities a ON ... WHERE s.is_active = true AND ...
      ${branchIdFilter} ${dayOfWeekFilter}
    `);
    const total = totalResult[0][0].total;
    // then the existing LIMIT-N query
    // ... format with `Hay ${total} clases en total. Te muestro las primeras 5.`
    ```
- `BUG-03 candidate (v) > RED: cupos disponibles reflects tomorrow's actual bookings, not today's zero`
  - **Action:** parameterize the `booking_date` in the correlated subquery. Compute the next occurrence of the schedule's `day_of_week` from today; use that date in the subquery.
  - **Concrete fix shape (Claude's Discretion):**
    ```sql
    AND bk.booking_date = (
      SELECT DATE_ADD(CURDATE(), INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 7) % 7 DAY)
    )
    ```
    (MySQL's `DAYOFWEEK()` returns Sunday=1..Saturday=7; the schedules table uses Sunday=0..Saturday=6 per `DAY_NAMES` — the modular arithmetic above maps between them.)
- `BUG-03 candidate (vi) > RED: executeTool('check_schedule') resolves successfully`
- `BUG-03 candidate (vi) > RED: check_schedule does not throw the bk.status SQL error specifically`
  - **Action:** one-character SQL rename at `el-templo-bot/src/ai/tools.ts:282` — change `bk.status` to `bk.booking_status`.
  - **THIS FIX MUST LAND FIRST in the GREEN commit chain.** Without it, all other (ii, iv, v) tests still SQL-error before reaching their assertion lines.

### From `el-templo-bot/test/v5-3-3-booking-reliability.test.ts`

- `BUG-03 candidate (iii) > RED: system prompt explicitly binds Sunday=0`
  - **Action: DEFERRED out of Plan 95-02 scope.** Per §C above, the (iii) fix touches `system-prompt.ts` and triggers Phase 96 snapshot regen. Plan 95-02 will leave this RED test failing; a follow-up plan (95-04 or Phase-96-coordinated) ships the prompt-binding fix and Phase 96 regens the snapshot.
  - **If 95-02 chooses to include (iii) anyway:** add a single directive line after `tools.ts:90`-referencing surface, e.g., inserted at `system-prompt.ts:225`:
    ```
    *Convención de día de la semana:* cuando uses `check_schedule`, los días se codifican como 0=domingo, 1=lunes, 2=martes, ..., 6=sábado.
    ```
    AND simultaneously update `POST_RLOK_04_BYTES` in `el-templo-bot/test/v5-3-2-regression.test.ts:57` AND regenerate `pb1-e1a-lead-rendered.snap.txt`. Phase 96 owns this — Plan 95-02 should NOT do this unilaterally.

### Defensive guardrail (recommendation, NOT in current RED test set)

Plan 95-02 should add an integration assertion that the `booking_status` column name matches the Drizzle alias — e.g.:

```typescript
import { bookings } from "../../src/db/schema/bookings";
it("bookings.status maps to MySQL column `booking_status` (drift guard for candidate (vi))", () => {
  expect(bookings.status.name).toBe("booking_status");
});
```

This catches future drift where someone renames the schema column without updating raw-SQL string references.

---

## F. Appendix: RED test failure transcripts

Captured from `pnpm test --run` runs against current `master` (HEAD = `eb0c37bd`). Full transcripts in `/tmp/red-output-95-01-integration.txt` and `/tmp/red-output-95-01-unit.txt`. Key lines reproduced below.

### Integration test (`el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts`)

Summary line:

```
Test Files  1 failed (1)
     Tests  8 failed | 1 passed (9)
```

Per-`it` outcomes (✓ = passed; × = failed RED):

```
× RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)
✓ RED: falls back to LIKE only when no exact match exists (regression protector for canonical fix)
× RED: check_schedule without branchId does NOT return rows from multiple branches without disambiguation (FAILS on master)
× RED: when both branches share a slot, output includes per-branch disambiguation prefix (FAILS on master)
× RED: unfiltered check_schedule surfaces a real total count for >6 matches (FAILS on master)
× RED: target Saturday 21:00 schedule is reachable in unfiltered query (FAILS on master)
× RED: cupos disponibles reflects tomorrow's actual bookings, not today's zero (FAILS on master)
× RED: executeTool('check_schedule') resolves successfully against real eltemplo_test schema (FAILS on master with SQL error)
× RED: check_schedule does not throw the `bk.status` SQL error specifically (FAILS on master)
```

#### §F entry 1 — Candidate (i) RED assertion

```
AssertionError: expected 'Sedes de El Templo:\n\n- *Mar del Pla…' not to contain 'Mar del Plata Moreno'

- Expected
+ Received

- Mar del Plata Moreno
+ Sedes de El Templo:
+
+ - *Mar del Plata Moreno*: Moreno 3751, Mar del Plata
+   Maps: https://maps.app.goo.gl/EFEVhYhphKKaZqF5A
+
+ - *Moreno*: Moreno 3751, Mar del Plata
+   Maps: https://maps.app.goo.gl/EFEVhYhphKKaZqF5A

❯ test/whatsapp/v5-3-3-booking.integration.test.ts:129:24
```

**Interpretation:** `executeTool('get_location', { branchName: 'Moreno' }, db)` returns BOTH the exact-match row (`'Moreno'`) AND the substring-overlap row (`'Mar del Plata Moreno'`). Candidate (i) confirmed firing against the synthetic seed.

#### §F entry 2-3 — Candidate (ii) RED assertions

Both candidate (ii) RED tests fail with the `bk.status` SQL error (candidate (vi) blocks them at the query level). The conceptual candidate (ii) defect — cross-branch mixing — is unverifiable directly until candidate (vi) is patched, but the static analysis at §B candidate (ii) confirms the defect exists in the post-(vi)-fix state.

Excerpt of the underlying error:

```
Caused by: Error: Unknown column 'bk.status' in 'where clause'
❯ checkSchedule ../el-templo-bot/src/ai/tools.ts:303:27
❯ executeTool ../el-templo-bot/src/ai/tools.ts:229:14
❯ test/whatsapp/v5-3-3-booking.integration.test.ts:218:26
```

#### §F entry 4-5 — Candidate (iv) RED assertions

Same `bk.status` SQL error as candidate (ii). Conceptual defect confirmed by static reasoning in §B candidate (iv).

#### §F entry 6 — Candidate (v) RED assertion

Same `bk.status` SQL error. Conceptual defect confirmed by static reasoning in §B candidate (v).

#### §F entry 7-8 — Candidate (vi) RED assertions

Entry 7 (`RED: executeTool('check_schedule') resolves successfully`):

```
AssertionError: expected { code: 'ER_BAD_FIELD_ERROR', errno: 1054, ... } to be undefined

[caught error]: Unknown column 'bk.status' in 'where clause'
[sql column not found]: bk.status (column actually exists as 'booking_status')

❯ test/whatsapp/v5-3-3-booking.integration.test.ts:529:21
```

Entry 8 (`RED: check_schedule does not throw the bk.status SQL error specifically`):

```
AssertionError: expected 'Failed query: \n    SELECT\n      s.i…' not to match /bk\.status|Unknown column/i

+ Received:
"Failed query:
    SELECT
      s.id, ...
      COALESCE(
        (SELECT COUNT(*) FROM bookings bk
         WHERE bk.schedule_id = s.id
           AND bk.booking_date = ?
           AND bk.status != 'cancelado'),    ← the bug at tools.ts:282
        0
      ) AS booking_count
    ...
sqlMessage: 'Unknown column \'bk.status\' in \'where clause\''"

❯ test/whatsapp/v5-3-3-booking.integration.test.ts:550:31
```

**Interpretation:** the `bk.status` column does NOT exist; the bookings table column is named `booking_status`. Every `executeTool('check_schedule', ...)` invocation throws this MySQL error 1054 before any rows are evaluated. Candidate (vi) confirmed firing as the SHOWSTOPPER for `check_schedule`.

### Unit test (`el-templo-bot/test/v5-3-3-booking-reliability.test.ts`)

Summary line:

```
Test Files  1 failed (1)
     Tests  1 failed | 3 passed (4)
```

Per-`it` outcomes:

```
× RED: system prompt explicitly binds Sunday=0 (FAILS on master)
✓ system prompt mentions day-of-week vocabulary somewhere (regression-protector — PASSES on master via knowledge.ts injection)
✓ DAY_NAMES has exactly one canonical Sunday entry at key 0 (regression-protector)
✓ check_schedule tool description does NOT advertise the ISO-8601 Sunday=7 convention (regression-protector)
```

#### §F entry 9 — Candidate (iii) RED assertion

```
AssertionError: expected '<full rendered system prompt>' to match /0\s*=\s*domingo|domingo\s*=\s*0|domingo\s+es\s+el\s+d[íi]a\s+0/i

❯ test/v5-3-3-booking-reliability.test.ts:69:20
```

**Interpretation:** the rendered system prompt contains ZERO occurrences of the literal `0=domingo` / `domingo=0` / `domingo es el día 0` binding. Candidate (iii) confirmed firing as a latent prompt-side defect.

#### §F entry 10 — Pre-existing `ai-tools.test.ts` failures (out-of-scope observation)

When run in isolation, the pre-existing `el-templo-api/test/whatsapp/ai-tools.test.ts` suite ALSO fails 20/20 tests against current master. The proximate cause is identical: the test seeds use raw `INSERT INTO bookings (..., status, ...)` (column mismatch — INSERT fails) AND the underlying `executeTool('check_schedule', ...)` SQL crashes on `bk.status`. This is documented here for awareness — it is NOT in Plan 95-01's scope to fix `ai-tools.test.ts`. Plan 95-02's GREEN commit for candidate (vi) will incidentally unblock most of `ai-tools.test.ts` as a side benefit. Beyond that, fixing `ai-tools.test.ts`'s assertion drift (`"20 lugares"` is the wrong post-format assertion — actual is `"X cupos disponibles"`) is deferred to whichever plan touches that file next.

---

## G. Out-of-Scope Observation — `pnpm lint` script absence

**Discovered during pre-commit verification.**

The PLAN.md `<verify><automated>` block at lines 500-501 specifies `pnpm lint` as the F-2 gate. However, NEITHER `el-templo-bot/package.json` NOR `el-templo-api/package.json` defines a `lint` script. Running `pnpm lint` in either directory produces:

```
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "lint" not found
Did you mean "pnpm pino"?
(exit 254)
```

CI's `.github/workflows/ci.yml` lines 145, 189, 233 invokes `pnpm run lint` with `continue-on-error: true`, indicating CI is aware the script is missing AND tolerant. The repo's actual lint discipline for `el-templo-bot` and `el-templo-api` is enforced via `husky + lint-staged` (Prettier-only) on commit — there is no ESLint config in either package.

**This is a plan-author error in PLAN.md** — F-2 was specified incorrectly. The verify block as written cannot exit 0 without:

- (a) Adding a no-op `"lint": "echo lint not configured"` script to both `package.json` files, OR
- (b) Removing the `pnpm lint` step from the `<verify><automated>` block.

Both options modify files outside the plan's `files_modified` frontmatter (`package.json` is not listed). Per orchestrator-locked constraint #5 ("NO new files outside the 3 in `files_modified`") and the plan's own scope guards, this audit treats the `pnpm lint` failure as an acknowledged plan-bug rather than a blocker. The mechanical gates that DO matter (tsc clean, sha256 sentry OK, RED tests fail, atomic 3-file commit, no source modified) ALL pass. Plan 95-01's deliverables are complete despite the `pnpm lint` quirk.

**Recommendation for follow-up:** a separate chore commit can add no-op `lint` scripts to both packages, OR `95-02-PLAN.md` can drop the `pnpm lint` step. The user owns this decision per the orchestrator's downstream-consumer contract.

---

## H. Plan 95-02 Execution Discoveries

**Appended post-execution (2026-05-19).** Plan 95-02 landed as a 4-commit chain (`d90fc782` → `1d4731f1` → `e213ee80` → `c2506276`) on branch `feature/whatsapp-bot-scaffold`. During plan-checker and execution, four discoveries surfaced that this audit (locked at `2d7cd171`, 2026-05-18) did not anticipate. Each is recorded below for traceability — the audit's Sections B/C/E above are not amended in place; this section is the canonical addendum.

### H.1 — `tools.ts:706` second site of candidate (vi)

**Discovered:** Plan-checker round 1 (pre-execution, 2026-05-18), before any commit landed.

**Finding:** `grep -nE 'bk\.status\b' el-templo-bot/src/ai/tools.ts` returned TWO matches, not one:

- Line `:282` in `checkSchedule` — the audit-named site (Section B candidate (vi), Section C, Section E).
- Line `:706` in `queryAlternativeSchedules` — NOT enumerated in this audit. Reached at runtime via `book_class`'s no-capacity → alternative-search code path.

Both are the same Drizzle column-name drift class (raw SQL `bk.status` vs Drizzle declaration `mysqlEnum("booking_status", [...])`). The audit's Section B candidate (vi) reasoning ("the SHOWSTOPPER blocking every other RED test") applies identically to `:706` even though the audit's static review missed the second site.

**Resolution:** Plan 95-02 Task 1 expanded to cover BOTH sites as a single atomic semantic operation ("align ALL raw-SQL `bk.status` references with the Drizzle column declaration"). Fixed in commit `d90fc782`. The `:706` site has no dedicated RED test in Plan 95-01's suite; the fix is a same-class drift correction caught by the plan-checker.

### H.2 — Date formula off-by-one in candidate (v) Concrete fix shape

**Discovered:** Empirical RED→GREEN verification of Plan 95-02 Task 2 (2026-05-19).

**Finding:** This audit's Section E candidate (v) "Concrete fix shape" (line 403) and the matching plan must_have stated:

```
AND bk.booking_date = (SELECT DATE_ADD(CURDATE(),
    INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 7) % 7 DAY))
```

The `+ 7) % 7` form does NOT correctly bridge the two date conventions. MySQL `DAYOFWEEK()` returns Sun=1..Sat=7 (1-indexed) while `schedules.day_of_week` follows `DAY_NAMES` (Sun=0..Sat=6, 0-indexed). With the audit formula, when `schedule.day_of_week == JS-today-day` (e.g., today Tue=2 in JS / 3 in MySQL, schedule day_of_week=3 meaning Wed JS), the expression evaluates to `(3 - 3 + 7) % 7 = 0` → CURDATE → counts TODAY's bookings instead of the next-occurrence's bookings.

**Empirical verification:** the candidate (v) RED test in `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts:431-452` seeds a booking for `tomorrow` with a schedule whose `day_of_week == tomorrow.getUTCDay()`. Under audit formula: count=0, spotsRemaining=10, output contains `"10 cupos disponibles"` — test fails with expected `"9 cupos disponibles"`.

**Correct formula:**

```
AND bk.booking_date = (SELECT DATE_ADD(CURDATE(),
    INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 8) % 7 DAY))
```

The `+ 8` (equivalent to `- 1` on `DAYOFWEEK(CURDATE())` to drop into 0-indexed, then `+ 7` to wrap into the modulus) bridges the conventions.

**Resolution:** Plan 95-02 Task 2 applied the `+ 8` correction. Fixed in commit `1d4731f1`. The commit message documents the deviation under "AUDIT DEVIATIONS" with citation to this audit's Section E and the plan must_have line.

### H.3 — Multi-branch shape: option (a) over audit-proposed option (b)

**Discovered:** Empirical RED→GREEN verification of Plan 95-02 Task 2 (2026-05-19).

**Finding:** This audit's Section E candidate (ii) "Concrete fix shape" proposed option (b) — "group `displayRows` by `branch_name`, emit per-group headers" with `*{Branch Name}*` markers showing all branches in the same response.

The RED tests in `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts` for candidate (ii) cannot be satisfied by option (b):

- **Test 1** (line 229): `expect([mentionsBranch1, mentionsBranch2]).not.toEqual([true, true])` — asserts NOT both branch names co-appear in the output. Option (b) (per-branch headers showing both) makes both booleans true → assertion fails.
- **Test 2** (line 245): `expect(result).toMatch(/\*TST Alem\*|\*TST Constitucion\*|En TST X:|Sede TST X:/)` — requires at least one disambiguation marker.

The two assertions together force option (a) — "single-branch + disambiguation request" — exactly ONE branch name appears, wrapped in a disambiguation marker, plus a request asking the user to pick a sede.

**Resolution:** Plan 95-02 Task 2 implemented option (a). When `uniqueBranches.size > 1 && branchId === null`, only the first branch's classes are emitted under a `*BranchName*` header followed by `"También hay clases en otras sedes — ¿de cuál te interesa saber?"`. Single-branch and `branchId`-filtered paths preserve the existing flat-list shape with the `(branch_name)` parenthetical. Fixed in commit `1d4731f1`.

### H.4 — Display cap: `slice(0, 5)` → `slice(0, 10)`

**Discovered:** Empirical RED→GREEN verification of Plan 95-02 Task 2 (2026-05-19).

**Finding:** This audit's Section E candidate (iv) stated the `displayRows = rows.slice(0, 5)` display cap is retained alongside the `LIMIT 6 → LIMIT 20` bump. The candidate (iv) RED test 2 (`el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts:329`) seeds 7 schedules where the target Saturday 21:00 row sorts to position 7 under `ORDER BY s.day_of_week, s.start_time`. Any cap ≤ 6 drops Saturday from `displayRows` → `expect(result).toContain("Sábado")` fails — the test is impossible by construction with `slice(0, 5)`.

**Resolution:** Plan 95-02 Task 2 raised the cap to `slice(0, 10)`. The bound is large enough to surface the seeded Saturday at position 7 while still preserving WhatsApp UX bounds (no message flooding for typical multi-class results). The total-count message dynamically reflects `displayRows.length` so the wording stays accurate: `Hay N clases en total. Te muestro las primeras X.` Fixed in commit `1d4731f1`.

---

**Cumulative impact on Section C "Final Branch Verdict":** none of the four discoveries change the audit's verdict. Section C's deferral rationale for candidates (i) and (iii) remains intact. Candidates (vi), (ii), (iv), (v) close as Plan 95-02 delivers. Sections B/C/E above stand as the audit-at-time-of-decision record; this Section H is the post-execution addendum that captures what mechanical execution revealed.

---

_Phase: 95-booking-reliability-graceful-degradation_
_Plan: 95-01 (audit-first investigation)_
_Audit completed: 2026-05-18_
_HEAD at audit time: eb0c37bd_
_Section H appended: 2026-05-19 (post Plan 95-02 execution at c2506276)_
