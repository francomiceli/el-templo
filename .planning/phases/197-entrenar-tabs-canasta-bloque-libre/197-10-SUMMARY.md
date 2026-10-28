---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 10
subsystem: app-visual
tags: [figura-anatomica, tokens, scss, d-01, d-07, d-18]
requires: ["197-09"]
provides:
  - Tokens y mixins del rework para Entrenar (_premium-card.scss, _brand.scss)
  - components/anatomy/ (JSON único, loader, zonas, BodyFigure.vue)
  - Block.zones / Block.groups (tipos)
affects: [197-11, 197-12, 197-13, 197-14, 197-15, 197-16, 197-17, 197-18, 197-19]
key-files:
  created:
    - el-templo-app/src/components/anatomy/anatomia.json
    - el-templo-app/src/components/anatomy/anatomia.ts
    - el-templo-app/src/components/anatomy/zones.ts
    - el-templo-app/src/components/anatomy/__tests__/zones.test.ts
    - el-templo-app/src/components/anatomy/BodyFigure.vue
  modified:
    - el-templo-app/src/css/_premium-card.scss
    - el-templo-app/src/css/_brand.scss
    - el-templo-app/src/modules/training/types/session.ts
requirements: [D-01, D-03, D-04, D-07, D-18]
---

# Fase 197 Plan 10: Tokens y figura compartida — Summary

El app ya tiene los tokens/mixins que faltaban para Entrenar y una única copia de la figura anatómica (chunk propio), con el componente `BodyFigure.vue` listo para Semana, Libre y la vidriera.

## Qué se hizo

1. **Tokens y mixins (D-18).** `_premium-card.scss`: 9 tokens (`$pd-sage`, `-tint`, `$pd-gold`, `-ink`, `-tint`, `$pd-kicker-ink`, `$pd-ink-3`, `$pd-soon-dot`, `$pd-unavailable-bg`) y 9 mixins (`pd-kicker-light`, `pd-label-11`, `pd-role-label`, `pd-cta-secondary-light`, `pd-cta-unavailable` sin opacidad, `pd-chip-aura($tone,$available)`, `pd-chip-done`, `pd-hit-44`, `pd-surface-light`). `_brand.scss`: 17 tokens `$fig-*` de la figura.
2. **Copia única de la figura.** `anatomia.json` copia byte a byte (`cmp` sin diferencias) del admin, con la licencia MIT adentro. `anatomia.ts`: tipos, `parseAnatomia`, `loadAnatomy()` (promesa cacheada, se resetea si falla, `import('./anatomia.json')` dinámico, sin imports estáticos) y `figureFor` (solo `female` -> mujer, D-07). `zones.ts` con el contrato (tipos, `ZONE_GROUPS` espejo de `GRUPOS_ZONA` del API, `NON_MUSCLE_SLUGS`, `groupOfSlug`, `groupsOfZones`, `isZoneSlug`), sin imports de valor. Test `zones.test.ts` (7 casos). `Block` gana `zones?` y `groups?`.
3. **`BodyFigure.vue`.** Props/emit del contrato; dos `<figure>` (Frente/Espalda) con `aria-hidden`; clases `mu--lit` (degradé terracota inline vía `--mu-fill`, salvia sólido con `tone="sage"`), `mu--lit2`, `mu--dim`, `mu--tap`, `mu--x`; clic en músculo emite el grupo; viewBox medido con `getBBox` (+2 px) y oculta hasta medir; error de carga -> caja vacía del mismo alto + `log.error`; `transition` solo bajo `no-preference`; sin hex en el `<style>`.

## Commits

- `58f2e11dd` feat(197-10): tokens y mixins del rework para Entrenar (D-18)
- `f38114345` feat(197-10): figura anatomica compartida del app (D-01, D-07) + zonas
- `511e64b0f` feat(197-10): BodyFigure con zonas por intensidad y modo tocable

## Verificación (estática)

Los tres `<verify>` del plan imprimen `OK`; `cmp` limpio; greps de higiene (console, any, `color: rgba`, onUnmounted, mezcla `??` con `||`/`&&`) sin salida. Sin node_modules: typecheck, lint y tests quedan para CI.

## Desvíos/decisiones

- **`pd-hit-44` con `min-width/min-height: 44px`** en el `::before` en vez de `max(100%, 44px)`: evita depender de cómo Sass trate `max()` con unidades mezcladas.
- **Un degradé por vista** (`id` = `body-figure-lit-{useId}-{front|back}`, sanitizado): evita ids duplicados en el documento. El degradé terracota se pasa por la variable CSS `--mu-fill` inline en el `<g>`; en salvia no se setea y gana la regla `.body-figure--sage`.
- Los colores del degradé (`LIT_A`/`LIT_B`) se replican en TS como pide el plan (el SVG necesita atributo); están comentados como espejo de `$fig-lit-a/b`.
- Si el SVG se monta dentro de un contenedor `display: none`, `getBBox` da 0 y la figura queda oculta (`visibility: hidden`) hasta un nuevo montaje; los planes de UI deben montarla ya visible (v-if, no v-show).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- Las figuras son `aria-hidden`; la accesibilidad del modo tocable depende de los chips de zona equivalentes (D-04) que arma el plan de Libre.
- Import de `Block` desde `src/components/anatomy/zones` es `import type` (alias `src/` ya usado en el módulo training).

## Self-Check: PASSED

Archivos creados presentes y commits `58f2e11dd`, `f38114345`, `511e64b0f` en el log de `feat/197-entrenar`.
