---
phase: 142-config-transicion-contabilium
plan: 02
subsystem: finance
tags:
  [docs, contabilium, transition, opening-balance, cutoff, migration-template]
requires:
  - "Phase 138: cash_registers.opening_balance / cutoff_date (per-caja), clean cutoff sin backfill (D-05/D-06)"
provides:
  - "MIG-02 transition doc: clean cutoff + qué dato manda (Admin=ingresos/caja, Contabilium=AFIP only) + opening-balance mechanism, cutoff date deferred to Franco"
  - "Opening-balance migration TEMPLATE kept OUTSIDE src/db/migrations/ (runner cannot execute placeholders); one UPDATE per caja, no ';' in SQL comments"
affects:
  - "Go-live ops runbook (Módulo Contable v5.2): how opening balances are loaded and what data is authoritative during Contabilium coexistence"
tech-stack:
  added: []
  patterns:
    - "Prod data via migration (not seed re-run / UI) — opening balances loaded once at go-live"
    - "Migration template kept outside the runner's path so placeholders cannot be auto-executed on deploy"
key-files:
  created:
    - .planning/phases/142-config-transici-n-contabilium/142-02-TRANSICION-CONTABILIUM.md
    - .planning/phases/142-config-transici-n-contabilium/142-02-opening-balance-migration-template.sql
    - .docs/modulo-contable/TRANSICION-CONTABILIUM.md
    - .docs/modulo-contable/opening-balance-migration-template.sql
  modified: []
decisions:
  - "Doc location: tracked authoritative copy under .planning/phases/142-.../ because .docs/ is gitignored; ops-facing copy kept on disk at .docs/modulo-contable/ (the discoverable location the plan intended)"
  - "Template uses 'punto y coma' (the words) instead of a literal ';' inside comment lines so the project's no-semicolon-in-SQL-comments rule holds even for the template"
metrics:
  duration: ~6min
  completed: 2026-06-24
---

# Phase 142 Plan 02: MIG-02 transición Contabilium + opening-balance template Summary

MIG-02 written deliverable closing the milestone v5.2 transition rule: a durable operations doc
documenting the clean cutoff (income/caja live ONLY in the Administrador from go-live; cajas start at
their physical-count opening_balance with no historical backfill), "qué dato manda" during Contabilium
coexistence (Admin = ingresos/caja source of truth; Contabilium = AFIP invoicing only, out of scope),
the cutoff strategy (single clean cutoff recommended, but the date is deferred to Franco at go-live),
and the opening-balance loading mechanism — plus a commented opening-balance migration TEMPLATE kept
deliberately OUTSIDE `src/db/migrations/` so the runner can never execute placeholder/zero values on
deploy. In 142 the cajas stay at 0.

## What Was Built

- **`TRANSICION-CONTABILIUM.md`** — covers all four D-07 contents in Spanish: (a) corte limpio (ingresos/caja
  solo en el Administrador desde el corte; sin backfill — ya implementado en 138 vía `cutoff_date` +
  `opening_balance`); (b) qué dato manda (Admin = ingresos+caja fuente de verdad; Contabilium = solo AFIP,
  fuera de scope, último escalón); (c) estrategia de corte (recomendación = corte limpio único, pero la
  fecha la define Franco al go-live — D-08); (d) mecanismo de apertura (saldos por migración, no por UI —
  D-09; en 142 cajas en 0; referencia al template).
- **`opening-balance-migration-template.sql`** — placeholder comentado con instrucciones para el operador al
  go-live (copiar a `src/db/migrations/NNNN_*.sql`, reemplazar `<CONTEO>`/`<YYYY-MM-DD>`/`<ID>`, correr
  `db:migrate`). Body = una `UPDATE cash_registers SET opening_balance=<CONTEO>, cutoff_date='<YYYY-MM-DD>'
WHERE id=<ID>;` por caja (efectivo×sucursal, central efectivo, banco ARS, banco EUR), con nota de que
  `cutoff_date` es por-caja (138). Reglas de migración en comentarios; sin `;` literal en líneas de comentario.
- **Copies in two locations:** version-controlled authoritative copies under the tracked phase directory
  (`.planning/phases/142-.../142-02-*`) + ops-facing copies on disk at `.docs/modulo-contable/` (the
  location the plan intended for Franco/ops discoverability).

## Verification

- Plan `<automated>` gate: both files exist under their dirs AND the template is NOT under
  `src/db/migrations/` → `VERIFY: OK`.
- No `;` inside any `--` comment line in the template (`! grep -nE '^\s*--.*;'`) → OK after rephrasing the
  no-semicolon rule to use the words "punto y coma".
- `contains` checks: `qué dato manda` present in the doc (case-sensitive, in body text); `opening_balance`
  and `UPDATE \`cash_registers\`` present in the template.
- Post-commit: no file deletions; gates re-verified green after Prettier reformatted the markdown.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.docs/` is gitignored — deliverable could not be committed at the planned path**

- **Found during:** Task 1 commit (`git add .docs/...` rejected: "paths are ignored by .gitignore"; `.gitignore:22 .docs/`). No `.docs` files are tracked anywhere in the repo.
- **Issue:** The plan placed the deliverable at `.docs/modulo-contable/` (Claude's-Discretion location), but that whole tree is gitignored — the version-controlled deliverable would be lost.
- **Fix:** Kept the on-disk `.docs/modulo-contable/` copies (ops-facing, as the plan intended) AND added version-controlled authoritative copies under the tracked phase directory `.planning/phases/142-.../142-02-*`. CONTEXT D-07/RESEARCH explicitly offered `.planning/` as the alternative location, so this honors the discretion while making the deliverable git-tracked. The `.docs/` copy note in the doc was updated to record this split.
- **Files modified:** added `.planning/.../142-02-TRANSICION-CONTABILIUM.md` and `.planning/.../142-02-opening-balance-migration-template.sql` (the committed artifacts).
- **Commit:** 8920aa72

**2. [Rule 1 - Correctness] Literal `;` inside SQL comment lines in the template**

- **Found during:** Task 1 self-verification (`grep -nE '^\s*--.*;'` flagged the lines describing the no-semicolon rule, which quoted a literal `';'`).
- **Issue:** The project rule (runner splits on `;` before stripping `--`) is literal; even a quoted `;` inside a comment would break the migration if this template were ever run as-is. The acceptance criterion requires no `;` in any comment line.
- **Fix:** Rephrased those comment lines to use the words "punto y coma" instead of the `;` character.
- **Files modified:** the template (`.docs/` + `.planning/` copies).
- **Commit:** 8920aa72

## Known Stubs

None. The cajas remaining at `opening_balance = 0` in 142 is **intentional and by design** (D-09: real
counts loaded by migration at go-live, not in this phase) — documented in the doc and the template
header, not an unresolved stub. The template is deliberately a fill-in-the-blanks placeholder.

## Self-Check: PASSED

- FOUND: .planning/phases/142-config-transici-n-contabilium/142-02-TRANSICION-CONTABILIUM.md
- FOUND: .planning/phases/142-config-transici-n-contabilium/142-02-opening-balance-migration-template.sql
- FOUND: .docs/modulo-contable/TRANSICION-CONTABILIUM.md (on disk, ops-facing)
- FOUND: .docs/modulo-contable/opening-balance-migration-template.sql (on disk, ops-facing)
- FOUND commit 8920aa72 (MIG-02 deliverable)
