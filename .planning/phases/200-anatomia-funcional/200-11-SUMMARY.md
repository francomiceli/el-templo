---
phase: 200-anatomia-funcional
plan: 11
subsystem: admin
tags: [anatomia, admin, figura-svg, pinia, router, nav]
requires: ["200-10"]
provides:
  - "Tipos espejo de VistaProfe (types/anatomy.ts) con esPendiente"
  - "useAnatomyStore: vista cacheada por sesion, loading, error, cargar() y getters"
  - "AnatomyFigure.vue: figura de hombre frente/espalda/ambas, color por rol, zona elegida, emite select-zone"
  - "Tokens _anatomia.scss (colores por rol del sketch 019 + mixin anat-chip)"
  - "ANATOMIA_ROLES, item 'Anatomia' en Entrenamiento (despues de Arbol) y ruta /anatomia"
  - "AnatomiaPage base: cuerpo grande con giro Frente/Espalda y zona en la query"
affects: [200-12, 200-13]
tech-stack:
  added: []
  patterns:
    - "Figura reusa cargarAnatomia() (import dinamico, chunk propio); sin copiar el JSON ni tocar figuras.ts"
    - "Zona y vista tocadas viven en route.query (zona, vista): el back del navegador vuelve"
key-files:
  created:
    - el-templo-admin/src/types/anatomy.ts
    - el-templo-admin/src/stores/useAnatomyStore.ts
    - el-templo-admin/src/css/_anatomia.scss
    - el-templo-admin/src/components/anatomy/AnatomyFigure.vue
    - el-templo-admin/src/pages/AnatomiaPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts
key-decisions:
  - "El item del menu NO es trainingOnly: se ve por roles (ANATOMIA_ROLES = coach, admin, owner, coach_actividad), igual que ANATOMIA_STAFF_ROLES del API (R1)"
  - "AnatomyFigure.vue en vista unica ocupa el ancho disponible (width 100%, max-height por prop) para que las zonas chicas sean tocables (D7, Pitfall 8)"
  - "La URL manda: la pagina deriva zona y vista de route.query (watch con immediate), el click solo hace router.push"
requirements-completed: [D6, D7, R1, SC3]
duration: ~20min
completed: 2026-10-21
---

# Phase 200 Plan 11: Base de Admin > Anatomia Summary

**Item "Anatomia" en el menu y ruta `/anatomia` para el staff de piso, con la figura Vue del admin (color por rol, tocable) y el giro Frente/Espalda sobre un store Pinia que pide la vista de profe una sola vez.**

## Task Commits

1. **Task 1: tipos, store y tokens** - `eb6da0af5` (feat)
2. **Task 2: AnatomyFigure.vue** - `ae66d7f0b` (feat)
3. **Task 3: ruta, menu y pagina base** - `46eb55f76` (feat)

## Verificacion

- Task 1 `<automated>` (corrido en partes, mismo contenido): tipos `VistaProfe`/`RutaProfe`/`esPendiente`/`Rol`, `defineStore('anatomy', () =>`, `'/admin/anatomy'`, `createLogger`, `catch (err: unknown)`, los cinco tokens/mixin y el grep de higiene (sin `console.`, `any`, `onUnmounted`): **OK**.
- Task 2 `<automated>`: 296 lineas (>=120), todos los tokens presentes (`cargarAnatomia`, `getBBox`, `select-zone`, `mu--motor`, `mu--antagonista`, `mu--sel`, `stroke-dasharray`, `prefers-reduced-motion`, `aria-hidden="true"`, `createLogger`, `knees`), sin import de `figuras`/`anatomia.json`, sin `console.`/`any`/`v-html`: **OK**.
- Task 3 `<automated>`: `ANATOMIA_ROLES` exacto, item del menu exacto y sin `trainingOnly`, `path: 'anatomia'` + `allowedRoles: ANATOMIA_ROLES` en routes.ts, la pagina usa `AnatomyFigure`, `.cargar()`, "Frente" y "Espalda", higiene limpia: **OK**.
- Grep `color: rgba(` en los `.vue`/`.scss` tocados: sin hallazgos.
- `prettier --write` (binario del checkout principal) sobre todos los archivos tocados antes de cada commit.
- No se corrio typecheck ni build (sin `node_modules` en el worktree; CI no typechequea el admin).

## Para el orquestador: archivos front-end tocados (correr `vue-tsc`)

- `el-templo-admin/src/types/anatomy.ts`
- `el-templo-admin/src/stores/useAnatomyStore.ts`
- `el-templo-admin/src/css/_anatomia.scss`
- `el-templo-admin/src/components/anatomy/AnatomyFigure.vue`
- `el-templo-admin/src/pages/AnatomiaPage.vue`
- `el-templo-admin/src/router/routes.ts`
- `el-templo-admin/src/config/templo-config.ts`

Puntos a mirar en vue-tsc: imports con alias `components/` y `stores/` en la pagina, `LocationQueryValue` de `vue-router`, `:ref="(el) => setSvg(...)"` y `:role`/`:aria-label` condicionales en `AnatomyFigure.vue`.

## Deviations from Plan

Ninguno: plan ejecutado tal cual. Notas de implementacion:

- `$anat-ol-fill: #fbf8f3` agregado a `_anatomia.scss` (el plan lo preveia "si falta").
- Pelo y cabeza (`hair`, `head`) no se dibujan (como filtra el sketch); el resto de las partes no musculares sigue en `$anat-skip` y no es tocable.
- El estado "sin vista" de la pagina usa un flag local `intentado` para no parpadear antes de la primera carga.
- `AnatomyFigure.vue` usa `<style lang="scss" scoped>` con `@import 'src/css/anatomia'` (el admin tiene `sass`; otras paginas ya usan `lang="scss"`).

## Notas para los planes 12 y 13

- Contrato del store: `useAnatomyStore().vista` (`VistaProfe | null`), `cargar()`, `musculosDeZona(slug)`, `rutaPorSlug`, `rutaPorCodigo`, `musculoPorId`, `profundos`. `cargar()` ya es idempotente y no duplica cargas en curso.
- `AnatomiaPage.onSelectZone` deja `zona` y `vista` en `route.query` y marca el comentario `// Fase 200 D8: la hoja se monta en el plan 200-12`. La hoja debe leer `route.query.zona`/`vista` (la pagina ya expone `zonaSel` y `vista`) y montar `q-dialog seamless position="bottom"`. Al abrirla, el plan 12 deberia achicar la figura (`maxHeight` 300 como el sketch) y sumar `roles` por ruta elegida.
- `roles` de `AnatomyFigure` acepta claves `slug` o `slug@front`/`slug@back`. `RutaProfe.zonasFicha` puede repetir un slug con vistas distintas (trapezius en FL: `back` motor y `both` antagonista): armar el mapa con la clave `slug@vista` cuando la vista no sea `both`, y `slug` cuando sea `both`. La especifica gana, asi que un `both` no pisa a un `back`.
- Accesibilidad: el svg es `aria-hidden` (como pide el plan); el equivalente por teclado/lector de pantalla es el buscador y la lista de zonas del plan 12.
- Sin tooltip en hover (el sketch tenia `.tip`); no estaba en el plan.
- Deploy: el plan toca codigo de produccion del admin, el `paths-filter` del admin dispara.

## Known Stubs

Ninguno. La pagina no abre hoja todavia por diseno del plan (llega en 12), no es un stub que bloquee el objetivo de este plan.

## Threat Flags

Ninguno fuera del threat model. T-200-29 (`meta.allowedRoles` + gate real en el API), T-200-30 (solo interpolacion `{{ }}`, sin `v-html`, verificado por grep), T-200-31 (`cargarAnatomia()` con import dinamico que reintenta si falla el chunk; el error cae a caja vacia con log) mitigados.

## Self-Check: PASSED

Archivos creados presentes y commits `eb6da0af5`, `ae66d7f0b`, `46eb55f76` en `feat/200-anatomia`.
