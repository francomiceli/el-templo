# Phase 154: Alumnos (de-Templo-ficación + accesos) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 154-Alumnos (de-Templo-ficación + accesos)
**Mode:** `--auto` — el usuario autorizó cerrar el milestone autónomamente tomando siempre la opción recomendada.
**Areas discussed (auto):** Prominencia de crear alumno, Cobro desde la fila, Config de precios por medio, Rename de Avatar, Gating de niveles griegos

---

## Prominencia de "Crear alumno" (ALUM-01)

[auto] Q: "¿Cómo se hace prominente el alta?" → Selected: **Botón primario grande reusando MemberFormDialog** (recommended). Alternativas no elegidas: página de alta dedicada (sobre-ingeniería), reusar el alta-en-el-cobro del PoS 148 (mezcla flujos).

## Registrar cobro desde la fila (ALUM-02)

[auto] Q: "¿Acción de fila = navegar al PoS o dialog inline?" → Selected: **Navegar a `/cobros?memberId={id}` con preselección** (recommended, DRY con fase 151). Alternativa no elegida: dialog de cobro embebido en Alumnos (duplica el PoS).

## Reglas de precio por medio de pago (ALUM-03)

[auto] Q: "¿Dónde vive la config y cuál es el default?" → Selected: **toggle global en `system_settings`, default sin recargo, seed ON para El Templo** (recommended). Alternativas no elegidas: config por plan (granularidad innecesaria), recargo % parametrizable (scope creep — diferido), borrar la regla (rompe El Templo).

[auto] Q: "¿Se tocan las columnas de precio del plan?" → Selected: **No — se conservan; la config solo gatea su aplicación** (recommended). Un solo punto de verdad para front y back (coach-load 148 respeta la misma regla).

## Avatar → concepto neutro (ALUM-04)

[auto] Q: "¿Label final?" → Selected: **"Categoría"** (recommended) — "Segmento" colisionaría con `member_segment` de la fase 136 (Prime/Digital/Fantasma) ya visible en filtros/analytics. Mecanismo `avatarType` intacto.

## Niveles griegos (ALUM-05)

[auto] Q: "¿Mecanismo de gating?" → Selected: **flag de superficie Templo en `templo-config.ts`** (recommended, consistente con 149/Entrenamiento). Alternativa no elegida: `canAccessTraining` (gate por-usuario, semántica distinta).

## Todos

[auto] `v51-milestone-data-rollout.md` (score 0.6 ≥ 0.4, regla diría fold) → **NO incorporado** (override documentado): falso positivo por keywords repetido 6 veces (149-154), sin relación con Alumnos.

## Claude's Discretion

- Naming/shape de la setting key y helper API.
- Ícono/tooltip del botón de cobro en fila; layout del header.
- Manejo de `?memberId=` inválido en CobrosPage.
- Gating de la columna Nivel también en el export Excel (recomendado sí).

## Deferred Ideas

- Sistema de niveles estandarizado white-label.
- Recargos % parametrizables por medio de pago.
- QR de asistencia desde la app (ya out of scope del milestone).
