---
phase: 200-anatomia-funcional
plan: 16
subsystem: app
tags: [anatomia, app, feature-flag, entrenar, semana, zonehits]
requires: ["200-15"]
provides:
  - "Block.zoneHits tipado en el app (calculado por el API, plan 07/08)"
  - "BlockChipStack con hits (borde + punto) y dimOthers (apagado sólido); defaults = 197"
  - "HoyEnTuClase.vue: bloque oscuro 'Hoy en tu clase' (grupos por bloque + primeros 3 ejercicios)"
  - "SemanaTab con cuerpo tocable detrás de ANATOMIA_ALUMNOS_ENABLED: modo zona sin mezclar con el modo bloque, hoja seamless, precarga del store"
affects: []
tech-stack:
  added: []
  patterns:
    - "Modo zona vs modo bloque como estado local (touchedZone) que reescribe lit/lit2/dim/selected de la figura y selected/hits/dimOthers de los chips, sin tocar activeBlock (D19)"
    - "sheetZone aparte de touchedZone: la hoja conserva su contenido mientras se anima el cierre"
key-files:
  created:
    - el-templo-app/src/modules/training/components/semana/HoyEnTuClase.vue
  modified:
    - el-templo-app/src/modules/training/types/session.ts
    - el-templo-app/src/modules/training/components/semana/BlockChipStack.vue
    - el-templo-app/src/modules/training/components/semana/SemanaTab.vue
key-decisions:
  - "Marca de chip por block.zoneHits[zona] (cualquier grupo, movilidad o sinDetalle), no por block.zones (decisión del orquestador, sketch 021)"
  - "Dos modos que no se mezclan: con zona tocada el cuerpo muestra SOLO esa zona, ningún chip queda elegido (selected = -1) y al cerrar vuelve el bloque elegido"
  - "Ver en Tu cuerpo y open-ruta cierran la hoja antes del router.push, para que una hoja seamless no quede flotando sobre otra página"
  - "HoyEnTuClase.zona se tipó ZoneSlug (el plan decía string) para indexar zoneHits sin casts"
requirements-completed: [P1, D16, D17, D18, D19, D20, SC5]
duration: ~25min
completed: 2026-10-21
---

# Phase 200 Plan 16: Cuerpo tocable de Semana Summary

**El cuerpo de Semana (197) se vuelve tocable con el flag prendido: tocar una zona abre la hoja de Tu cuerpo con "Hoy en tu clase" arriba, marca los chips de los bloques que la trabajan y apaga el resto, sin recargar la lista de ejercicios; con el flag apagado el render es el de la 197.**

## Task Commits

1. **Task 1: zoneHits en Block, chips con hits y HoyEnTuClase** - `287975351` (feat)
2. **Task 2: SemanaTab tocable con modos separados** - `89e263c48` (feat)

## Archivos tocados (front-end, sin vue-tsc disponible)

Este plan (`el-templo-app/src/`): `modules/training/types/session.ts`, `modules/training/components/semana/BlockChipStack.vue`, `modules/training/components/semana/HoyEnTuClase.vue` (nuevo), `modules/training/components/semana/SemanaTab.vue`.

**Lista completa de `.vue`/`.ts` del app tocados en los planes 14-16 (para `vue-tsc` desde el checkout principal):**
`config/featureFlags.ts`, `components/anatomy/zones.ts`, `components/anatomy/__tests__/zones.test.ts`, `components/anatomy/BodyFigure.vue`, `modules/anatomy/types.ts`, `modules/anatomy/stores/anatomyStore.ts`, `modules/anatomy/components/AnatomySheet.vue`, `modules/anatomy/components/ZonaAlumno.vue`, `modules/anatomy/pages/GuiaHomePage.vue`, `modules/anatomy/pages/TuCuerpoPage.vue`, `modules/anatomy/pages/TuCuerpoFichaPage.vue`, `modules/training/routes.ts`, `layouts/MainLayout.vue`, `modules/training/types/session.ts`, `modules/training/components/semana/BlockChipStack.vue`, `modules/training/components/semana/HoyEnTuClase.vue`, `modules/training/components/semana/SemanaTab.vue` (más `css/_brand.scss`).

Nada se typechequeó (no hay `vue-tsc`/`node_modules`). **El orquestador o CI debe correr `vue-tsc` sobre el app.** Puntos a mirar de este plan: `v-bind="hoyProps"` (objeto con `zona: ZoneSlug`, `blocks`, `kicker`, `vacio`) sobre `HoyEnTuClase`; `figureLit`/`figureLit2` como `readonly string[]` hacia las props `lit`/`lit2` de `BodyFigure`; indexado `block.zoneHits?.[zona]` (`Partial<Record<ZoneSlug, HitsZona>>`); el type predicate del `.filter` de nombres de músculos.

## Verificación (todas estáticas)

- Task 1 `<automated>` (corrido en partes): `zoneHits?: Partial<Record<ZoneSlug, HitsZona>>` presente en `session.ts`; `hits?: readonly number[]`, `dimOthers?: boolean`, `--hit`, `--off` en `BlockChipStack.vue`; sin `opacity` en su bloque `<style>` (se reescribió un comentario que la mencionaba); los 9 tokens de `HoyEnTuClase.vue` (`zoneHits`, `movilidad`, "Trabaja la movilidad de esta zona", "Trabaja fuerte", "Te sostiene", "Se estira", `slice(0, 3)`, `ROLE_LABELS`, `blockDisplayName`); higiene (`console.`, `any`, `v-html`, `color: rgba(`) sin hallazgos. OK.
- Task 2 `<automated>`: los 20 textos/tokens (`ANATOMIA_ALUMNOS_ENABLED`, `touchedZone`, `tocable`, `select-zone`, `tapStyle="cursor"`, `hitIndices`, `dim-others`, `HoyEnTuClase`, `ZonaAlumno`, `AnatomySheet`, "Hoy en tu clase", "Hoy tu clase no trabaja esta zona.", "Ver en Tu cuerpo", `tu-cuerpo`, "Tocá un músculo", `scrollIntoView`, `bottom-offset`, "Cargando…", "No pudimos cargar", "Reintentar", `cargar()`), `BlockExercisesCard :block="activeBlock"` intacto, higiene y `onUnmounted` sin hallazgos. OK.
- `prettier --write` aplicado a los 4 archivos; `git status --porcelain` vacío tras el último commit de código.

### Chequeo manual P1 (flag en `false`)

`tocable = ANATOMIA_ALUMNOS_ENABLED && interactive` es `false`, entonces:

- `BodyFigure` recibe `interactive=false` (su default de siempre), `dim=false`, `selected=null`, `lit`/`lit2` = `zones.lit`/`zones.lit2` (el computed devuelve exactamente eso sin zona tocada); `tapStyle="cursor"` no tiene efecto sin `interactive`. No hay `@select-zone` que dispare nada (`onSelectZone` además sale si no es `tocable`).
- El hint `v-if="tocable"` y la hoja `v-if="tocable"` no se renderizan; la clase `semana-tab--sheet` nunca se pone.
- `BlockChipStack` recibe `selected=selectedBlockIndex`, `hits=[]`, `dimOthers=false`: sin clases `--hit`/`--off` ni `aria-label` (queda el nombre accesible del contenido, como en la 197).
- El watch de precarga corre con `immediate` pero no llama `cargar()`: cero requests a `/api/anatomy`. `useAnatomyStore()` solo instancia el store (sin red).
- Único cambio de la rama apagada: un `ref` sin uso visible y `scroll-margin-top` en el contenedor split (inocuo).

## Deviations from Plan

None - plan ejecutado tal cual, con estas precisiones de implementación:

- `HoyEnTuClase` recibe `zona: ZoneSlug` (el plan decía `string`) para poder indexar `zoneHits` sin casts.
- Los puntos de marca de un chip elegido que además es hit (no ocurre en la práctica porque con zona tocada `selected = -1`) llevan crema; el rótulo del rol de un chip apagado va en `$pd-ink-2` sólido; el rótulo de un chip marcado reserva 12 px a la derecha para el punto.
- `sheetZone` (zona que muestra la hoja) vive aparte de `touchedZone` para que la hoja no se vacíe durante la animación de cierre.
- "Ver en Tu cuerpo ›" y `open-ruta` cierran la hoja antes de navegar (una hoja seamless no debe quedar flotando sobre otra página).
- La altura inferior del scroll con hoja abierta se resuelve con `padding-bottom: calc(54vh + 24px)` en la raíz (el sketch usaba 420 px) y `scroll-margin-top: 60px` para esquivar el header fijo.
- La medición de la tab bar (`.mobile-footer`, fallback 56, 0 en escritorio) está duplicada con `TuCuerpoPage` (los planes limitaban los archivos a cuatro); candidata a util compartida si Franco quiere DRY.

## Para revisar a ojo en el teléfono (no se pudo)

- Que el cuerpo + chips queden visibles encima de la hoja (54 vh) a 360/390/412 px, con el `scrollIntoView` y el `padding-bottom` de la hoja abierta.
- Chip marcado (borde terracota 1.5 px + punto) y chip apagado sobre el fondo de la página; chips de nombres largos con ellipsis.
- "Hoy en tu clase" oscuro dentro de la hoja blanca; estado vacío en arena; textos "En esta clase" en días que no son hoy.
- Bloque ROM del sábado y PLYO/CARDIO (líneas "Trabaja la movilidad de esta zona" / "Este bloque trabaja esta zona"); Initium nunca marcado.
- Que el toque de un chip con la hoja abierta llegue (hoja seamless) y cierre la hoja.

## Known Stubs

Ninguno. Todo está cableado a `block.zoneHits` (API) y al store (`GET /api/anatomy`), y todo es inalcanzable con el flag apagado.

## Threat Flags

Ninguno. Sin endpoints nuevos; T-200-43 (`tocable` exige el flag, sin flag no hay llamadas a `/api/anatomy`), T-200-44 (hoja `seamless`, props nuevas opcionales, render idéntico a la 197 con el flag apagado) mitigados; T-200-45 aceptado (el app solo pinta `zoneHits`).

**Deploy:** todo es código de producción del app; no hay fixes solo-tests.

## Self-Check: PASSED

- Archivos presentes: `HoyEnTuClase.vue` (creado), `BlockChipStack.vue`, `session.ts`, `SemanaTab.vue` (modificados).
- Commits `287975351` y `89e263c48` presentes en `git log`.
