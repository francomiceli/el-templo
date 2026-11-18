---
phase: 214-comunidad-anotados-aura
plan: 22
subsystem: app-aura-detail
tags: [app, aura, hoja, movimientos, D-13, D-16, D-57, D-58, D-66, D-69]
requires: ["214-21"]
provides:
  - "AuraDetailSheet (v-model): Pantalla 5 del UI-SPEC, detalle privado de Aura"
affects: ["214-23", "214-27"]
key-files:
  created:
    - el-templo-app/src/components/AuraDetailSheet.vue
metrics:
  tasks: 1
  completed: 2026-11-18
---

# Phase 214 Plan 22: detalle privado de Aura Summary

Hoja clara `AuraDetailSheet` con el total en el marco marfil con filete dorado, "Solo vos ves este detalle", los movimientos con texto y monto (sin íconos) y "Ver más" paginado de a 20, con los estados cargando, vacío, error y error en "Ver más".

## Commits

- `76e2712df` feat(214-22): detalle privado de Aura (D-13, D-57)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 21 errores, igual a la línea de base, ninguno en `AuraDetailSheet`.
- Greps del plan: textos exactos, `getMovements`, `prefersReducedMotion`, signo U+2212; sin `console.*`, sin `any`.
- Sin tests nuevos: el plan no los pide y la app no tiene harness de componentes.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

## Decisiones propias

- Uso: `<AuraDetailSheet v-model="open" />`. Al abrirse pide la primera página (`limit` 20) y reinicia su estado; cada apertura, reintento o cierre invalida las respuestas en vuelo (contador `requestSeq`), así una respuesta tardía no pisa la apertura siguiente.
- Error de la primera página: la hoja muestra solo el kicker "TU AURA" (para el `aria-labelledby`) y el bloque `role="alert"` con "Reintentar", sin marco del total (no hay total que mostrar).
- Cargando: el esqueleto lleva un texto solo para lectores ("Cargando tus movimientos") dentro de `role="status"` y `aria-busy`; las barras son `aria-hidden`.
- Cada fila es `role="listitem"` con `tabindex="-1"` para poder recibir el foco al cargar más; el `aria-label` sale de `movementAriaLabel`.
- Error en "Ver más": notify negative, las filas quedan y el botón vuelve.
- 404 del guard del módulo, en la primera página o en "Ver más": la hoja se cierra sin mensaje (el padre no debería abrirla con `auraEarned: null`).
- Se enganchó `useBackButtonClose` (atrás de Android) como en `SponsorSheet`; el plan no lo pedía, pero el UI-SPEC lo pide para las hojas.
- El total y la tipografía numérica usan `formatAura` (miles "1.240") y `tabular-nums`.

## Notas para los planes siguientes

- Plan 23 (encabezado) y plan 27 (Perfil): abrir con `v-model`; solo si `/me` trae `auraEarned` distinto de null.
- El borde `#f1eadf` de las filas y el `#d9cfc1` de la agarradera son literales del UI-SPEC / `SponsorSheet`, no tokens.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-22-01: la app no manda ningún id. T-214-22-02: el botón queda en `loading` y `loadMore` ignora llamadas mientras hay una en vuelo.

## Self-Check: PASSED
