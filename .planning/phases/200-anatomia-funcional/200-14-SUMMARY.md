---
phase: 200-anatomia-funcional
plan: 14
subsystem: app
tags: [anatomia, app, feature-flag, bodyfigure, tu-cuerpo]
requires: ["200-09", "200-13"]
provides:
  - "ANATOMIA_ALUMNOS_ENABLED = false (P1) en el app"
  - "tibialis como zona tocable del grupo piernas (D4), con el espejo de zonas del app verificado en CI contra REGIONES/GRUPOS_ZONA"
  - "BodyFigure extensible: side, roles, selected, tapStyle y emit select-zone (defaults = 197)"
  - "modules/anatomy del app: types.ts (espejo de VistaAlumno + HitsZona), anatomyStore (vista de alumno cacheada), AnatomySheet y ZonaAlumno"
affects: [200-15, 200-16]
tech-stack:
  added: []
  patterns:
    - "Props opcionales con defaults idénticos a la 197 para extender un componente compartido sin tocar a su único consumidor (SemanaTab)"
    - "Hoja seamless del app: q-dialog seamless position=bottom + bottomOffset para subirla sobre la tab bar"
key-files:
  created:
    - el-templo-app/src/modules/anatomy/types.ts
    - el-templo-app/src/modules/anatomy/stores/anatomyStore.ts
    - el-templo-app/src/modules/anatomy/components/AnatomySheet.vue
    - el-templo-app/src/modules/anatomy/components/ZonaAlumno.vue
  modified:
    - el-templo-app/src/config/featureFlags.ts
    - el-templo-app/src/components/anatomy/zones.ts
    - el-templo-app/src/components/anatomy/__tests__/zones.test.ts
    - el-templo-app/src/components/anatomy/BodyFigure.vue
    - el-templo-app/src/css/_brand.scss
    - el-templo-api/test/anatomy/sync-front.test.ts
key-decisions:
  - "select-zone se emite DESPUES de select-group y solo si el slug es una zona (isZoneSlug)"
  - "Con roles, un músculo con rol ignora lit/lit2/dim (el rol gana); 'selected' va último en el CSS y gana a los roles"
  - "ZonaAlumno: musculoId gana a zona; sin zona ni zona del músculo, el kicker dice 'Más adentro' (músculos profundos)"
requirements-completed: [P1, D4, D14, D20, SC4]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 14: Base del lado alumno en el app Summary

**Flag `ANATOMIA_ALUMNOS_ENABLED` (apagado), `tibialis` tocable, `BodyFigure` con vista única / pintura por grupo / selección / `select-zone`, store del app para `GET /api/anatomy` y la hoja de alumno (qué hace + 3 grupos con (i) + "Avisale a tu profe").**

## Task Commits

1. **Task 1: flag, tibialis, BodyFigure extensible y sync de zonas** - `1dc6f09e8` (feat)
2. **Task 2: tipos y store de Tu cuerpo** - `2978e2cc2` (feat)
3. **Task 3: hoja de alumno (AnatomySheet + ZonaAlumno)** - `443f5537d` (feat)

## Archivos tocados (front-end, sin vue-tsc disponible)

App (`el-templo-app/src/`): `config/featureFlags.ts`, `components/anatomy/zones.ts`, `components/anatomy/__tests__/zones.test.ts`, `components/anatomy/BodyFigure.vue`, `css/_brand.scss`, `modules/anatomy/types.ts`, `modules/anatomy/stores/anatomyStore.ts`, `modules/anatomy/components/AnatomySheet.vue`, `modules/anatomy/components/ZonaAlumno.vue`.
API (solo test): `el-templo-api/test/anatomy/sync-front.test.ts`.

Nada de esto se typechequeó (no hay `vue-tsc` ni `node_modules`): se escribió con tipos estrictos a mano (type predicate explícito en el `.filter`, sin `any`, `catch (err: unknown)`). **El orquestador o CI debe correr `vue-tsc` sobre el app.**

## Verificación (todas estáticas)

- Task 1 `<automated>` (partes): flag `= false` presente; `muscle-zones` ausente de `zones.ts`; `tibialis` ausente del bloque `NON_MUSCLE_SLUGS`; las 5 props/emit nuevos + `select-group` presentes en `BodyFigure.vue`; `$fig-sost` en `_brand.scss`; `sync-front.test.ts` referencia `zones.ts` y `GRUPOS_ZONA`; `zones.test.ts` con `tibialis`, 16 y `NON_MUSCLE_SLUGS.size`; higiene (`console.`, `any`, `v-html`, `color: rgba(`) sin hallazgos. OK.
- Task 2 `<automated>`: tipos `VistaAlumno/MusculoAlumno/RutaAlumno/HitsZona/GrupoAlumno`, `defineStore('anatomy', () =>`, `'/anatomy'`, `createLogger`, `catch (err: unknown)`; sin `console.`/`any`/`onUnmounted`/`;` de fin de línea. OK.
- Task 3 `<automated>`: `seamless`, `position="bottom"`, `pointerdown`, `bottomOffset`, `update:full` en la hoja; "Avisale a tu profe", "músculos en esta zona", `aria-expanded`, `open-ruta`, `queHace`, slots `antes`/`despues` en `ZonaAlumno`; sin "antagonista"/"bandera"/"code" fuera de comentarios; sin `console`/`any`/`v-html`/`onUnmounted`. OK.
- Regex de `sync-front.test.ts` probada con un script en el scratchpad contra el `zones.ts` real: 16 slugs en el orden de `REGIONES`, `piernas` incluye `tibialis`, 7 partes no musculares. Los tests en sí NO se corrieron (CI).
- `prettier --write` aplicado a todo archivo tocado; `git status --porcelain` vacío tras el último commit de código.

## Deviations from Plan

None - plan ejecutado tal cual, con estas precisiones de implementación:

- `AnatomySheet` suma una prop opcional `resetKey` (igual que la del admin) para que el contenido vuelva arriba al tocar otra zona con la hoja abierta; no cambia el contrato pedido (`modelValue`, `full`, `bottomOffset`, emits).
- `anatomyStore.cargar()` además de no repetir si ya hay vista, comparte el pedido en curso (dos llamadas simultáneas = una sola request). Expone también `vista`, `loading`, `error`.
- `ZonaAlumno` acepta `musculoId` por sí solo (sin `zona`) para los músculos profundos: kicker "Más adentro".

## Notas para los planes 15 y 16

- **Cambio visual con flag apagado (menor, esperado por D4):** `tibialis` ya no está en `NON_MUSCLE_SLUGS`, así que en la figura de Semana (197) la espinilla se pinta como músculo sin trabajar en lugar de como piel (y es tocable en Libre, oculto por flag). Es lo que pide el plan; si Franco lo ve raro en el teléfono, es consecuencia de D4, no un bug.
- **BodyFigure para Tu cuerpo / Semana:** usar `tap-style="cursor"` + `interactive` + `:roles` (claves `slug` o `slug@front|back`) + `:selected` + `@select-zone` (`slug`, `view`). `side="front"|"back"` deja una sola vista (el giro frente/espalda lo maneja el consumidor). Para Semana (`zoneHits`): armar `roles` desde `HitsZona` (de `types.ts`); una zona marcada con `movilidad`/`sinDetalle` no trae músculos pero igual se marca (decisión del orquestador, sketch 021).
- **Hoja en Entrenar:** `AnatomySheet` con `:bottom-offset="<alto de la tab bar>"` y SIEMPRE seamless (D19). `ZonaAlumno` expone `#antes` ("Hoy en tu clase") y `#despues` ("Ver en Tu cuerpo ›") y emite `open-ruta` con el slug de la ruta (la ficha de ruta de alumno es del plan 15; `store.ruta(slug)` ya trae `fichaCorta`).
- El store hay que cargarlo con `useAnatomyStore().cargar()` solo desde superficies detrás de `ANATOMIA_ALUMNOS_ENABLED` (T-200-37). Hoy nada lo llama: el flag está apagado y no hay consumidores.
- Los tokens de figura nuevos: `$fig-sost` (#e6c3a1, borde `$fig-lit2-edge`), `$fig-estira` (#f6ecdf) y `$fig-estira-edge` (#96593a).
- **Deploy:** este plan toca código de producción del app y un test del API; no hay fixes solo-tests, así que no aplica la regla del `paths-filter`.

## Known Stubs

Ninguno (los componentes no tienen consumidores todavía por diseño: los cablean los planes 15 y 16 detrás del flag).

## Threat Flags

Ninguno. Sin endpoints nuevos; el store consume `GET /api/anatomy` (ya existente, ya con manifiesto de tenancy).

## Self-Check: PASSED

- Archivos creados presentes: `types.ts`, `anatomyStore.ts`, `AnatomySheet.vue`, `ZonaAlumno.vue` (commits `2978e2cc2`, `443f5537d`).
- Commits `1dc6f09e8`, `2978e2cc2`, `443f5537d` presentes en `git log`.
