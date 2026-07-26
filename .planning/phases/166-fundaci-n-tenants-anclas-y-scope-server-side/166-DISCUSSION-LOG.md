# Phase 166: Fundación — `tenants`, anclas y scope server-side - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-26
**Phase:** 166-fundaci-n-tenants-anclas-y-scope-server-side
**Areas discussed:** Ninguna (usuario eligió "directo a plan")

---

## Selección de áreas

| Option                      | Description                                                  | Selected |
| --------------------------- | ------------------------------------------------------------ | -------- |
| Superficie de la suspensión | ¿403 para todo lo autenticado del tenant o solo staff/admin? |          |
| Contrato del error 403      | ¿403 genérico o código TENANT_SUSPENDED en el body?          |          |
| Rename attachScope          | ¿Rename completo (55 call sites) o alias gradual?            |          |
| Ninguna — directo a plan    | Fase suficientemente definida por los docs                   | ✓        |

**User's choice:** "Ninguna — directo a plan"
**Notes:** La fase llegó muy cerrada por diseño (docs 01-06 validados + 5 preguntas §8
resueltas el mismo día). Franco confió el detalle restante a las recomendaciones de
Claude, que quedaron documentadas como CD-01..03 en CONTEXT.md.

## Claude's Discretion

- CD-01: suspensión bloquea TODO lo autenticado del tenant (no solo staff).
- CD-02: 403 con código específico `TENANT_SUSPENDED`.
- CD-03: rename `attachCountryScope`→`attachScope` gradual vía alias (no big-bang).

## Deferred Ideas

- Gating por tenant del TV kiosk (device auth) → fases de adopción.
- UI/admin de tenants → fuera de v6.0.
- Todo `v51-milestone-data-rollout.md` revisado, NO foldeado (falso positivo por la
  palabra "milestone" — es del árbol SPOM, v5.1).
