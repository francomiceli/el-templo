# Phase 86: Knowledge Gating - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor `getBusinessKnowledge()` in `el-templo-bot/src/ai/knowledge.ts` to accept an optional `clientState` parameter and return only discovery-relevant sections when the state is `lead`. All other states (trial, active, inactive, expired) and null/undefined continue to receive the full 12-section set (no regression). Goal: PB1.E1A rendered prompt ≥35% smaller than pre-refactor baseline.

Out of scope: rewriting the base prompt, new playbook logic, audience modeling beyond lead-vs-rest, adding a method description section (Phase 87).

</domain>

<decisions>
## Implementation Decisions

### Section tagging mechanism

- Refactor sections into an array of objects with shape `{ title, body, tags: string[] }` (or equivalent), instead of the current inline `sections.push(...)` pattern.
- Tag vocabulary for v5.3.1: a single `'discovery'` tag. Presence = include for leads. Absence = member-only content.
- Non-lead states ignore tags entirely and receive every section (backward compat via filter semantics: no `clientState` → no filter).
- Whole-section gating only — no runtime sub-block stripping. Splits below handle the two cases where a single section straddled the discovery/member boundary.

### Section splits (required by gating model)

- **Split `Planes y Precios`** into two sections:
  - `Planes y Precios` (base pricing, Flex/Foundation/Performance, Zero) — tagged `discovery`.
  - `Mejora de plan` (upgrade paths) — untagged (full-set only).
- **Split `Manejo de Objeciones`** into two sections:
  - `Objeciones de venta` (caro, tiempo, lejos, etc.) — tagged `discovery`.
  - `Objeciones de retención` (aburrimiento, sin progreso, etc.) — untagged.

### Discovery-relevant sections (tag = 'discovery')

- `Que es El Templo`
- `Planes y Precios` (base, post-split)
- `Reglas Zero` (pricing discounts)
- `Horarios por Sede`
- `Clase de Prueba`
- `Tecnicas de Venta`
- `Objeciones de venta` (post-split)
- `Reglas de Oro` (universal behavioral rules — discovery AND full)

### Non-discovery sections (full-set only)

- `ROM` (secondary offering)
- `Mejora de plan` (post-split)
- `App (DeportNet)`
- `Politicas`
- `Objeciones de retención` (post-split)
- `Estrategias de Retencion`

### State → section-set mapping

- `ClientState === 'lead'` → discovery-tagged sections only.
- `ClientState` in { `trial`, `active`, `inactive`, `expired` } → full set.
- `clientState` null/undefined → full set (KGATE-04 backward compat).
- Unknown/invalid runtime string → fall through to full set (defensive safety net).
- Gate depends only on `ClientState` — no coupling to active playbook. Minimal change per KGATE-06.

### API shape

- Signature: `getBusinessKnowledge(clientState?: ClientState): string`.
- Return type unchanged (string). `system-prompt.ts` keeps interpolating as today.
- Call site in `system-prompt.ts` changes from `getBusinessKnowledge()` to `getBusinessKnowledge(options?.clientState)` — minimal diff.
- Filtered output preserves original 1–12 section order. Only length changes; flow does not.

### Baseline measurement for KGATE-05

- Commit `el-templo-bot/test/fixtures/pb1-e1a-baseline.txt` containing the full pre-refactor rendered PB1.E1A system prompt.
- Commit a `BASELINE_CHARS` constant (char count of that fixture) alongside the test.
- Measurement input: synthetic PB1.E1A lead fixture (clientState='lead', playbook=PB1, episode=E1A). No DB, deterministic.
- Measurement target: full rendered system prompt (matches KGATE-05 wording "rendered prompt"), not just the knowledge block.
- Test location: `el-templo-bot/test/ai/prompt-size.test.ts`. Asserts `renderedLength <= BASELINE_CHARS * 0.65`.

### Claude's Discretion

- Exact TypeScript type for the section object (interface name, whether tags is `readonly string[]` vs enum union).
- Whether to export the sections array for test introspection or keep it module-private.
- Internal helper naming (`filterSections`, `isDiscoverySection`, etc.).
- How to structure the baseline fixture generation script (one-time capture; can be a doc step or a committed snapshot script).
- Test assertion phrasing and exact percentage math (as long as ≥35% is enforced).

</decisions>

<specifics>
## Specific Ideas

- Keep the refactor shape-preserving: existing call sites that do `getBusinessKnowledge()` must keep working unchanged. KGATE-06 explicitly calls for "minimal change."
- The `discovery` tag naming is intentional — it describes intent (what PB1 leads need during discovery), not audience. This lets future gates add tags like `member-only` or `admin` without renaming.
- `Reglas de Oro` being universal is the signal that drove the final tag semantics: lead-filtering only checks for `discovery` tag, so universal sections are tagged `discovery` and naturally appear in both sets.

</specifics>

<deferred>
## Deferred Ideas

- Method description section (team-provided verbatim + 2-sentence elevator pitch) and deflection rule — Phase 87 (BPASS/METHOD requirements).
- Consolidating duplicate Boarding Pass definitions — Phase 87.
- Audience modeling with multiple tags (member-only, admin, locale-specific) — not needed in v5.3.1; tag array leaves room.
- Sub-section runtime stripping (partial-section gating) — rejected in favor of explicit splits.
- Playbook-aware gating (different cuts for different PBs) — future phase if needed.
- Structured return type `{ text, sections }` — defer until a consumer needs it.

</deferred>

---

_Phase: 86-knowledge-gating_
_Context gathered: 2026-04-14_
