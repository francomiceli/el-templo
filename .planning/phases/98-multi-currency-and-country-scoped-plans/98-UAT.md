# Phase 98 UAT — Multi-currency and country-scoped plans

**Created:** 2026-04-21
**Phase:** 98-multi-currency-and-country-scoped-plans
**Plan:** 98-12 (Wave 7 of 7)
**Status:** PENDING USER VERIFICATION — server/admin/member/test work complete, manual device + staging admin sign-off required before master merge
**Tester:** ********\_\_\_\_********
**UAT date:** ********\_\_\_\_********

---

## NON-NEGOTIABLE HALT GATE (D-19)

> This is the final non-negotiable gate before Phase 98 merges to master.
>
> If ANY item in Section A (deployed-app forward-compat) cannot be verified on real devices against a staging API carrying migrations **0091 + 0092**, the phase HALTS and requires user escalation.
>
> Substituting automated tests, promoted staging candidates, or unreleased app builds for real-device verification is **FORBIDDEN**. The automated forward-compat superset tests in Plan 11 are a pre-merge tripwire, **not** a substitute for running the currently-deployed App Store / Play Store builds against staging.
>
> Per 98-SPEC.md Acceptance Criterion "Currently-deployed production app build does not crash against the new API — MUST be verified on real device, no substitution allowed" and 98-CONTEXT.md D-19.

---

## Pre-UAT state (automated verification — PRE-VERIFIED)

Already verified during plan execution; user does not need to re-run these:

| Pre-verified item                                                                       | Evidence                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| All API integration tests green (733/733)                                               | Plan 11 SUMMARY + commit `826c6cf7` (gap-closing) brings full suite to green |
| `tsc --noEmit` green on admin + member app (no new errors in Phase 98 files)            | Plan 07/08/09/10 Self-Check sections                                         |
| `pnpm lint` clean on Phase 98 modified files                                            | Plan 07/08/09/10 Self-Check sections                                         |
| Schema migration 0091 applies cleanly (AR backfill + 12 ES plans seeded)                | Plan 01 SUMMARY, commit `7c19b713` + `8314b225` (semicolon fix)              |
| Scale normalization migration 0092 applied (whole pesos/euros, no cents)                | PICKUP-NOTES.md, commit `0477da3a`                                           |
| Server rejects cross-country plan assignment with 400 + "El plan no corresponde…"       | Plan 11 test #9 PASS (commit `9172f28e`)                                     |
| Server rejects cross-currency payments with BadRequestError + "moneda distinta"         | Plan 11 test #10 PASS                                                        |
| `attachCountryScope` preHandler registered on 7 country-scoped plugins                  | Plan 03 SUMMARY (commit `2c9ea1e4`)                                          |
| Non-owner cannot override `?country=` query param (preHandler collapses for non-owners) | Plan 11 test #5 PASS                                                         |
| AR admin cannot read ES member profile via `/admin/members/:userId` (gap fix)           | Commit `826c6cf7` (post-Plan-11 gap closure)                                 |
| Member `/subscription/plans` catalog now includes `currency` + `country` (superset)     | Commit `826c6cf7` — additive only, REQ-98-11                                 |
| Member `/subscription/me/subscription` now includes `currency` (superset)               | Commit `826c6cf7` — additive only, REQ-98-11                                 |
| Admin `/admin/subscriptions/plans` JSON schema includes `country` + `currency`          | Commit `826c6cf7` — fixes fast-json-stringify silent drop                    |

**Still requiring manual verification (this UAT):**

1. **Section A — Deployed app forward-compat on real devices (REQ-98-11 / D-19)** — automated superset tests are a pre-merge tripwire, not a substitute for real installed builds.
2. **Section B — Admin UI owner country selector (REQ-98-07)** — visual/functional check of the Argentina/España selector on 5 pages.
3. **Section C — Admin UI non-owner scoping** — role-gated behavior.
4. **Section D — Admin UI member creation plan filter (REQ-98-08)** — only same-country plans appear.
5. **Section E — Cross-country error UX (REQ-98-06, D-17)** — Spanish toast + dialog stays open on server 400.
6. **Section F — Exports (REQ-98-10)** — `Moneda` column populated.
7. **Section G — Price formatting (REQ-98-09)** — no hardcoded `$` prefixes, locale-correct.
8. **Section H — Post-UAT sign-off.**

---

## Environment prerequisites

Before starting UAT, confirm:

- [ ] Staging API is deployed with the Phase 98 branch (migrations **0091** AND **0092** applied). Verify via:
  ```
  mysql -h <staging-host> -u <user> -p eltemplo_staging -e "SELECT name FROM _migrations WHERE name LIKE '0091%' OR name LIKE '0092%';"
  ```
  (Ask before SSHing, per memory `always_ask_before_ssh`.)
- [ ] Staging admin is reachable at its public URL and you have credentials for: **owner**, **AR admin (non-owner)**, and (if available) **ES admin (non-owner)**.
- [ ] Currently-deployed iOS production build version recorded: **App Store version **\_\_** (build **\_\_**)**
- [ ] Currently-deployed Android production build version recorded: **Play Store version **\_\_** (build **\_\_**)**
- [ ] Physical test device (or simulator/emulator with production-signed build) available for BOTH iOS and Android.
- [ ] Mechanism to point the deployed app at staging API decided: (a) in-app dev menu, (b) Charles/mitmproxy URL override, or (c) `/etc/hosts` + staging DNS override. **Record which was used: **\_\_****

If none of (a)/(b)/(c) is feasible for a given platform, **STOP** and jump to the HALT section at the bottom of Section A.

---

## Section A — Deployed-app forward-compat (REQ-98-11) — HALT gate

**What:** Install the currently-deployed **production** iOS build (from App Store, not TestFlight) and currently-deployed **production** Android build (from Play Store, not internal testing) on physical test devices. Point each app at the staging API (migrations 0091+0092 applied). Exercise every screen that displays a price or touches plan/subscription/payment data. **No crash is acceptable.**

**Why this matters:** The API now returns `currency` and `country` fields additively on plans, subscriptions, and payments. Deployed apps must ignore unknown fields and continue rendering. If a deployed build crashes on any price-displaying screen, we cannot ship Phase 98 without also shipping a replacement app build — which defeats the phase's forward-compat goal.

**Rule:** If pointing the deployed production build at staging is infeasible on either platform, **HALT** — do not substitute automated tests, a newer staging-candidate build, or assumption-based reasoning. Fill out the HALT record at the end of this section and escalate.

### A.1 — iOS deployed-build verification

Device: **********\_\_********** iOS version: ******\_\_******

App Store build under test: version ****\_\_****, build ****\_\_****

Staging-redirect mechanism used (check one):

- [ ] In-app dev menu for API URL
- [ ] Charles / mitmproxy override (`api.eltemplo.org` → staging host)
- [ ] `/etc/hosts` or DNS override
- [ ] **INFEASIBLE — HALT (fill HALT record below)**

Screens to exercise (each must render without crash or JS/Swift exception; prices may still show in old format — that's the point, forward-compat means _not crashing_):

- [ ] Login → Home
- [ ] Plan catalog (`PlanesPage`) — list loads, no crash when prices render
- [ ] Current subscription / Mi Camino screen (any price visible)
- [ ] Upsell banner or upgrade screen (if one appears for this member)
- [ ] QR check-in flow (regression probe — heavy-traffic surface, hits subscription validation)
- [ ] Booking flow (if accessible to this member)
- [ ] Session detail or history screen (if it shows pricePaid)

Result: **PASS / FAIL** (circle one)
Notes: ********************************\_\_********************************

### A.2 — Android deployed-build verification

Device: **********\_\_********** Android version: ******\_\_******

Play Store build under test: version ****\_\_****, build ****\_\_****

Staging-redirect mechanism used (check one):

- [ ] In-app dev menu for API URL
- [ ] Proxy override
- [ ] DNS override
- [ ] **INFEASIBLE — HALT (fill HALT record below)**

Same screen list as A.1:

- [ ] Login → Home
- [ ] Plan catalog
- [ ] Current subscription / Mi Camino
- [ ] Upsell / upgrade surface
- [ ] QR check-in
- [ ] Booking flow
- [ ] Session detail / history

Result: **PASS / FAIL** (circle one)
Notes: ********************************\_\_********************************

### A.3 — HALT record (fill ONLY if verification was infeasible)

If either A.1 or A.2 is infeasible, complete this block and **do NOT sign off** at Section H:

| Field                                 | Value |
| ------------------------------------- | ----- |
| Platform that cannot be verified      |       |
| Exact reason (no dev menu? no proxy?) |       |
| Proposed remediation (next steps)     |       |
| ETA for remediation                   |       |
| Escalation target (user notified?)    |       |

**Escalation rule per D-19:** Phase does NOT merge to master while a HALT is active. Automated tests (Plan 11 supersets) and staging-candidate builds are explicitly NOT valid substitutes.

---

## Section B — Admin UI owner country selector (REQ-98-07)

**Precondition:** Logged in to staging admin as **owner**.

Commits delivering this section:

- Owner selector on PlanesPage: `2416b8e4` (Plan 07)
- Owner selector on CajaPage/ReportesPage/AnaliticasPage/FinanzasTab: `fc121797` (Plan 09)

### B.1 — PlanesPage

- [ ] Argentina/España QSelect visible at the top of the page
- [ ] Default value is **Argentina**
- [ ] Switching to **España**: plan list re-fetches and shows the 12 seeded ES plans with **€**-prefixed prices (Flex €70, Flex+ €90, Foundation €210, Foundation+ €300, Performance €500, Sesión de Prueba €0, 30 Días Online €20, Cero a Atleta €30, Foundation Online €30, Piernas y Glúteos €30, Promo Gratuito €0, Tu Primer Front Lever €30)
- [ ] Switching back to **Argentina**: plan list re-fetches and shows AR plans with **$**-prefixed prices
- [ ] No "Todos" / mixed-country option exists

### B.2 — CajaPage

- [ ] Argentina/España QSelect visible at top
- [ ] Default Argentina; totals use **$** formatting
- [ ] Switching to España: summary cards (cash/transfer/card/monthlyRevenue) re-compute (likely €0 if no ES payments yet — that's expected) and display **€**

### B.3 — ReportesPage

- [ ] Argentina/España QSelect visible at top
- [ ] Switching affects all 4 tabs (Accesos, Cobros, Vencimientos, Inactivos)
- [ ] Amount column in Cobros tab shows **$** for AR, **€** for ES

### B.4 — AnaliticasPage

- [ ] Argentina/España QSelect visible at top
- [ ] `monthlyRevenue` KPI card uses correct currency symbol per selection
- [ ] Charts re-render when country changes

### B.5 — FinanzasTab (child of AnaliticasPage)

- [ ] Tab receives `currency` prop from parent selector
- [ ] `revenueByMethod` cells (cash/transfer/card) use correct symbol
- [ ] Outstanding card uses correct symbol
- [ ] Chart tooltips (bar chart, branch chart) show correct currency in formatted amounts

Section B result: **PASS / FAIL**
Notes: ********************************\_\_********************************

---

## Section C — Admin UI non-owner scoping

### C.1 — As AR admin (role=`admin`, branch in Argentina)

Precondition: log in as an AR admin test user.

- [ ] PlanesPage: **NO** Argentina/España selector visible
- [ ] PlanesPage: list shows only AR plans
- [ ] CajaPage: no selector; all data AR-scoped
- [ ] ReportesPage: no selector; all 4 tabs AR-scoped
- [ ] AnaliticasPage: no selector; all charts/KPIs AR-scoped
- [ ] FinanzasTab: no selector (owned by parent); AR currency
- [ ] URL-escalation probe: manually visit `/admin/subscriptions/plans?country=ES` — server IGNORES the query param and returns AR plans only (preHandler collapses non-owner country override, verified by Plan 11 test #5)
- [ ] Admin Members page: AR admin cannot open an ES member's detail page (commit `826c6cf7` guard — should return 404)

### C.2 — As ES admin (role=`admin`, branch in Spain)

Precondition: log in as an ES admin test user **if such a fixture exists**. If no ES admin user exists in staging yet, mark this subsection **"PENDING — no ES admin fixture available"** and note it as a follow-up. Not a blocker for Phase 98 merge since no ES members exist in production yet either.

- [ ] PlanesPage: no selector; shows 12 ES plans only
- [ ] CajaPage: no selector; totals in **€** (or €0 if no ES payments)
- [ ] ReportesPage: no selector; all 4 tabs ES-scoped
- [ ] AnaliticasPage / FinanzasTab: no selector; all in **€**
- [ ] URL-escalation probe: visiting `?country=AR` does not reveal AR data

Section C result: **PASS / FAIL / PENDING (ES fixture)**
Notes: ********************************\_\_********************************

---

## Section D — Admin UI member creation plan filter (REQ-98-08)

**Precondition:** Logged in as owner in staging admin. `MemberFormDialog` create mode opens via the members page.

Commits delivering this section: `a72a6a36` (Plan 08 — stepper reorder Sede → Plan, watch-on-branchId).

### D.1 — Create member with BCN (ES) branch

- [ ] Open MemberFormDialog → create mode
- [ ] Step 1 = **Sede**: pick a BCN (Spain) branch
- [ ] Step 2 = **Plan**: dropdown shows ONLY the 12 EUR plans (no AR plans appear)
- [ ] Prices in the plan dropdown / preview render with **€** symbol

### D.2 — Create member with Chapadmalal (AR) branch

- [ ] Open MemberFormDialog → create mode
- [ ] Step 1 = Sede: pick Chapadmalal (or any AR branch)
- [ ] Step 2 = Plan: dropdown shows ONLY AR plans (no ES plans)
- [ ] Prices render with **$** symbol

### D.3 — Mid-flow branch change clears stale plan

- [ ] Pick Chapadmalal → pick an AR plan → go back, change Sede to BCN → confirm plan dropdown re-fetches to ES plans AND previously-selected planId is cleared (no stale cross-country plan survives the branch change)

Section D result: **PASS / FAIL**
Notes: ********************************\_\_********************************

---

## Section E — Cross-country error UX (REQ-98-06, D-17)

Commits delivering this section:

- Service-layer 400 with Spanish message: `1a4ecc5a` (Plan 04)
- Admin UI `$q.notify` + dialog-stays-open + `log.warn` via `isExpectedClientError`: `a72a6a36` (Plan 08)

### E.1 — Direct API probe (Postman/curl, as owner)

Since the admin UI blocks cross-country picks client-side (dropdowns filter by branch country), you need to drive the 400 via a direct API call.

As owner (so `attachCountryScope` does not auto-collapse your `?country=`):

```bash
# Attempt: assign an ES plan to an AR member
curl -X POST 'https://staging-api.eltemplo.org/api/admin/subscriptions/members/<AR_MEMBER_USER_ID>/subscription' \
  -H 'Authorization: Bearer <owner-token>' \
  -H 'Content-Type: application/json' \
  -d '{"planId": <ES_PLAN_ID>, "startDate": "2026-05-01", "pricePaid": 100, "paymentMethod": "cash"}'
```

- [ ] Response status: **400**
- [ ] Response body contains: `"El plan no corresponde al país de la sucursal"` (exact Spanish message)
- [ ] No subscription row created in DB

Repeat for cross-currency payment (assign an ARS subscription, then POST a payment with `currency: "EUR"`):

- [ ] Response body contains: `"moneda distinta"` or similar cross-currency Spanish message
- [ ] No payment row created

### E.2 — Admin UI probe (via devtools-forced race)

Since the UI pre-filters plan dropdowns, cross-country submission via normal clicks is impossible. If you can force it (e.g., swap the `planId` in the request payload via devtools network-replay), verify:

- [ ] Server returns 400
- [ ] Admin UI shows `$q.notify({ type: 'negative', ... })` with the Spanish server message
- [ ] Dialog does **NOT** auto-close on error (admin can correct and resubmit)
- [ ] Sentry dashboard shows a **warn**-level log entry (not error) for this 4xx — confirms D-17 Sentry-noise pattern

Section E result: **PASS / FAIL**
Notes: ********************************\_\_********************************

---

## Section F — Exports (REQ-98-10)

Commits delivering this section: `818fee7a` (Plan 06 — XLSX `Moneda` column + country filter), `fc121797` (Plan 09 — export plumbs `?country=`).

**Precondition:** Logged in as owner on staging admin.

### F.1 — ReportesPage Cobros export, Argentina selected

- [ ] Switch country selector to Argentina
- [ ] Click the Cobros tab → "Exportar" / download button
- [ ] Downloaded XLSX (or CSV) has a column named **`Moneda`**
- [ ] Every row has `Moneda = "ARS"` (non-empty on every row)
- [ ] No rows with `EUR` or blank currency in this file

### F.2 — ReportesPage Cobros export, España selected

- [ ] Switch country selector to España
- [ ] Cobros export → Moneda column exists, every row shows `EUR` (or file is empty if no ES payments exist yet — acceptable, document which)

### F.3 — ReportesPage Vencimientos (ExpiringReport) export

- [ ] AR: export has `Moneda` column populated (values should be `ARS`)
- [ ] ES: export has `Moneda` column (values `EUR` or empty file)

### F.4 — Other export routes (spot-check at least one)

- [ ] Accesos and Inactivos exports plumb `?country=` too (verify the downloaded file is scoped — e.g., AR export has no ES branch data). These reports may not include a Moneda column (they aren't financial) — that's expected.

Section F result: **PASS / FAIL**
Notes: ********************************\_\_********************************

---

## Section G — Price formatting (REQ-98-09)

Commits delivering this section: `944f4b89` (admin `formatPrice`), `2697f914` (member app `formatPrice`), `0477da3a` (scale normalization).

### G.1 — Admin spot-checks (3 surfaces)

- [ ] PlanesPage AR plan card: shows e.g. `$1.500` or `$15.000` (thousand separators via `es-AR`, no `$` literal prefix in template — the symbol comes from `formatPrice`)
- [ ] PlanesPage ES plan card: shows e.g. `€70`, `€300`, `€500` (via `es-ES` locale)
- [ ] AssignPlanDialog change-plan summary: AR member sees all proration lines in `$`; ES member (if available) sees all in `€` — no `$` leaks on ES views

### G.2 — Member app spot-checks (2 surfaces — via deployed build OR via web preview)

- [ ] Plan catalog badge on Planes Por Objetivos cards: renders via `formatPrice(exp.price, exp.currency ?? 'ARS')` — no bare `${{ price.toLocaleString() }}` text
- [ ] WhatsApp pre-filled message uses `formatPrice` (or correctly omits price if server withholds it per member-safe response)

### G.3 — Code-level grep (pre-verified but re-verifiable)

Expected in the following files: **zero** occurrences of `toLocaleString()` in a price context.

- [ ] `el-templo-admin/src/pages/PlanesPage.vue` — `grep -c "\.toLocaleString()"` → `0` (pre-verified Plan 07 SUMMARY)
- [ ] `el-templo-admin/src/components/AssignPlanDialog.vue` — `grep -c "\.toLocaleString()"` → `0` (pre-verified Plan 08)
- [ ] `el-templo-admin/src/pages/CajaPage.vue` — `0` (pre-verified Plan 09)
- [ ] `el-templo-admin/src/pages/ReportesPage.vue` — `0` (pre-verified Plan 09)
- [ ] `el-templo-admin/src/pages/AnaliticasPage.vue` — `0` (pre-verified Plan 09)
- [ ] `el-templo-app/src/modules/plan/pages/PlanesPage.vue` — `0` (pre-verified Plan 10)

Section G result: **PASS / FAIL**
Notes: ********************************\_\_********************************

---

## Section H — Post-UAT sign-off

Fill in outcomes per section:

| Section                                         | Result (PASS / FAIL / PENDING) | Date / initials |
| ----------------------------------------------- | ------------------------------ | --------------- |
| A.1 iOS deployed-build forward-compat           |                                |                 |
| A.2 Android deployed-build forward-compat       |                                |                 |
| A.3 HALT record (filled only if HALT triggered) |                                |                 |
| B Admin UI owner country selector               |                                |                 |
| C Admin UI non-owner scoping (AR admin)         |                                |                 |
| C ES admin (or PENDING if fixture absent)       |                                |                 |
| D Member creation plan filter                   |                                |                 |
| E Cross-country error UX                        |                                |                 |
| F Exports                                       |                                |                 |
| G Price formatting                              |                                |                 |

### Final sign-off

- [ ] All acceptance criteria verified **pass** (workarounds are NOT permitted for Section A per D-19; any unresolved Section A item = no sign-off)
- [ ] HALT record is empty, OR is present but explicitly documents that Phase 98 **must NOT merge** until resolved
- [ ] Safe to promote Phase 98 to master

**Tester:** ************\_\_************ **Date/time:** ************\_\_************

**Final verdict (circle one):**

- **APPROVED — merge Phase 98 to master**
- **BLOCKED — remediation required (list blocker below)**
- **HALTED per D-19 — deployed-build verification infeasible; see Section A.3 HALT record**

**Remediation plan (if BLOCKED or HALTED):**

---

---

---

---

## Reference — phase commits

| Plan  | Commit     | Description                                                         |
| ----- | ---------- | ------------------------------------------------------------------- |
| 98-01 | `7c19b713` | Schema + 0091 migration (AR/ARS backfill, 12 ES plans seeded)       |
| 98-01 | `8314b225` | Fix stray semicolons in 0091 that broke SQL parser                  |
| 98-02 | `c9ff757e` | `attachCountryScope` preHandler                                     |
| 98-02 | `944f4b89` | `formatPrice` utility (admin + member app)                          |
| 98-03 | `2c9ea1e4` | Register preHandler on 7 country-scoped route plugins               |
| 98-04 | `1a4ecc5a` | Service-layer cross-country / cross-currency validation             |
| 98-05 | `33ae84d8` | Plumb country through admin + member plan/members/gladius lists     |
| 98-06 | `818fee7a` | Country filter + Moneda column on reports/analytics + XLSX exports  |
| 98-07 | `2416b8e4` | PlanesPage country dropdown + PlanFormDialog country field          |
| -     | `0477da3a` | Normalize prices to whole currency units (migration 0092)           |
| 98-08 | `a72a6a36` | Member flows — branchId plan pickers + formatPrice + toast          |
| 98-09 | `fc121797` | Reports pages — dropdown + formatPrice + export country plumbing    |
| 98-10 | `2697f914` | Member app — formatPrice with ARS fallback                          |
| 98-11 | `9172f28e` | Integration tests (RBAC + cross-country + regression + supersets)   |
| -     | `826c6cf7` | Close gaps surfaced by Plan 11 (member GET scope, catalog superset) |

All commits on the current Phase 98 branch (local master per `v4.4 local-only workflow`). Not yet pushed.
