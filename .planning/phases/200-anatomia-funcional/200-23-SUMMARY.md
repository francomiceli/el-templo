---
phase: 200-anatomia-funcional
plan: 23
subsystem: api
tags: [anatomia, cierre, uat, validacion, higiene]
requires: ["200-22"]
provides:
  - "content-schema.test.ts: describe 'modo estricto (cierre de la fase 200)' (30 fichas, secciones con contenido o Pendiente, alumno nunca 100 % pendiente, todo en borrador)"
  - "200-UAT.md: guia de UAT de la fase para Franco (SC1-SC6, diferencias de la TV, pendientes H/N, decisiones, deploy, lista para vue-tsc)"
  - "200-VALIDATION.md firmado (nyquist_compliant y wave_0_complete en true)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Modo estricto: una seccion es valida si tiene contenido o es Pendiente explicita (esPendiente); vacia o ausente falla"
key-files:
  created:
    - .planning/phases/200-anatomia-funcional/200-UAT.md
  modified:
    - el-templo-api/test/anatomy/content-schema.test.ts
    - .planning/phases/200-anatomia-funcional/200-VALIDATION.md
key-decisions:
  - "El test estricto acepta 'pendiente' explicito (quien H/N/fuente) y rechaza solo secciones vacias o ausentes, segun la leccion del plan 22"
  - "Aprobacion de VALIDATION queda 'pendiente de UAT de Franco'"
requirements-completed:
  [SC1, SC2, SC3, SC4, SC5, SC6, D5, P1, P4, R1, R2, R3, R4, R5]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 23: Cierre de la fase (coherencia estricta, barrido y UAT) Summary

**Test de CI en modo estricto sobre las 30 fichas, barrido de higiene limpio, `200-UAT.md` con todo lo que Franco tiene que mirar y decidir, y `200-VALIDATION.md` firmado.**

## Task Commits

1. **Task 1: coherencia estricta del contenido** - `dc5e9bf7f` (test)
2. **Task 2: guia de UAT y firma de VALIDATION** - `333ba6d93` (docs)

## Task 1: test estricto y barrido

`describe("modo estricto (cierre de la fase 200)")` en `content-schema.test.ts` con 4 tests: las 30 rutas tienen `fichaProfe` y `fichaAlumno` no nulas; cada seccion (profe: resumen, escalones, fases, articulaciones, progresa, siente, compensa, cues, banderasRuta, evidencia + `tipo`; alumno: que, siente, tips, errores) tiene contenido o es `Pendiente` explicita; ninguna ficha de alumno tiene sus 4 secciones pendientes; las 30 siguen en `borrador` y `validarContenido()` no da errores.

**No se corrio vitest** (sin `node_modules`; corre en CI). Como control, un script del scratchpad (no commiteado) importo las 30 rutas con `node --experimental-strip-types` y aplico la misma logica: **30 rutas, 0 fallas**. Totales de pendientes: 45 con quien H, 28 con quien N, 51 de fuente.

### Resultado del barrido (sobre `git diff --name-only 99152a195`)

| Comando                                                                               | Resultado                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git grep -nE "console\.(log\|warn\|error\|info\|debug)"` sobre api/app/admin tocados | vacio                                                                                                                                                                                                                                       |
| `git grep -nE ":\s*any\b\|<any>\|as any\b"` idem                                      | vacio                                                                                                                                                                                                                                       |
| `git grep -n "v-html" -- el-templo-admin/src el-templo-app/src`                       | 3 coincidencias, todas en archivos que la fase NO toco: `BlogEditorPage.vue:186`, `OnboardingReflect.vue:9` y un comentario en `ForYouCard.vue:4`. Nada nuevo                                                                               |
| `git grep -nE "^\s*color:\s*rgba\("` en `.vue`/`.scss` tocados                        | 1 coincidencia: `MainLayout.vue:669` (`color: rgba(white, 0.6)`), linea preexistente (el diff de la fase en ese archivo no la toca)                                                                                                         |
| `git grep -n "onUnmounted"` en anatomia (app, admin) y `semana/`                      | vacio                                                                                                                                                                                                                                       |
| `git grep -n "muscle-zones" -- el-templo-api el-templo-app/src el-templo-admin/src`   | vacio (el comentario del app que 200-14 debia limpiar ya no existe)                                                                                                                                                                         |
| `;` dentro de comentarios `--` de 0287 y 0288                                         | vacio (los `;` que hay son terminadores de sentencia)                                                                                                                                                                                       |
| `ANATOMIA_ALUMNOS_ENABLED`                                                            | `export const ANATOMIA_ALUMNOS_ENABLED = false` (`featureFlags.ts:39`)                                                                                                                                                                      |
| `router.push({ name: 'guia'` HEAD vs `99152a195`                                      | Los 5 de antes (`MainLayout`, `BlockCard`, `BlockChoiceCard`, `SummaryBlockCard`, `BlockExercisesCard`) con el mismo texto (solo `MainLayout` corre una linea). El unico nuevo es `GuiaHomePage.vue:73`, el boton "Ver la guia" del plan 15 |
| `test ! -f el-templo-api/src/modules/tv/muscle-zones.ts`                              | no existe                                                                                                                                                                                                                                   |
| `<automated>` de la tarea 1                                                           | `OK`                                                                                                                                                                                                                                        |
| `git status --porcelain`                                                              | vacio al cerrar                                                                                                                                                                                                                             |

Nota: el plan decia "los 4 `router.push({ name: 'guia'`", en realidad son 5 en la base. No es una falla.

## Task 2: UAT y firma

- `200-UAT.md` (español, para Franco): Como probar (staging + build local con el flag ON sin commitear), tabla del barrido, SC1-SC6 con pasos numerados y resultado esperado, **Diferencias de la TV** (30 filas copiadas de `200-06-SUMMARY.md`; verificada por script contra el original: 30/30 identicas en antes y ahora; `diferencias-aprobadas.ts` no cambio despues del plan 06), **Pendientes de validacion humana** (tabla de ⚑H/⚑N/fuente por ruta calculada con un `.mjs` del scratchpad que importa las 30 rutas por ruta absoluta, mas los temas para el kinesiologo y para Nacho), **Decisiones para confirmar** (D1-D5, P1-P4, R1-R5, las 9 del planner incluida `notaInterna`, las 21 filas de `200-ORQUESTADOR-NOTAS.md` una por una, y 3 decisiones nuevas), **Notas de deploy** y **Typecheck del front** (15 archivos del admin y 19 del app para `vue-tsc` desde el checkout principal, con los puntos a mirar de los SUMMARY 13 y 16).
- `200-VALIDATION.md`: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`, Wave 0 y sign-off tildados, "Approval: pendiente de UAT de Franco". Prettier reformateo las tablas del archivo (el diff se ve como reescritura, pero el contenido es el mismo).
- `<automated>` de la tarea 2 corrido como script del scratchpad (el guard rechazo el compuesto): `OK`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Ajuste de enfoque] Los 4 `router.push({ name: 'guia'` son 5 en la base**

- **Found during:** Task 1 (barrido)
- **Issue:** el plan dice 4; en `99152a195` hay 5.
- **Fix:** se verifico que los 5 estan intactos y se documento el sexto (nuevo, del plan 15). Sin cambios de codigo.

**2. [Ajuste de contenido de UAT] Estado "Ficha en preparacion" ya no se ve**

- Las 30 rutas tienen ficha desde el plan 22, asi que el recorrido del admin pide una ruta con secciones Pendiente (QC o AF) en vez de "una ruta sin ficha". Las notas del orquestador 13 y 23 sobre "rutas sin ficha completa" quedan marcadas como casi sin efecto.

Nada mas: el plan se ejecuto como estaba escrito.

## Items abiertos para el orquestador

- **Ninguna falla del barrido** para arreglar. Lo unico fuera de lo esperado son los hallazgos preexistentes (`v-html` x2 y un `rgba` en archivos que la fase no toco).
- **CI es el primer run real** de todos los tests de la fase 200 (incluido este modo estricto). Si falla algo, el costo de arreglar solo-tests exige tocar codigo de produccion del mismo componente en el mismo push (`// deploy:`).
- **`vue-tsc` sigue sin correrse** para admin y app: lista en `200-UAT.md`. Requiere OK de Franco para instalar o correrlo desde un checkout con deps.
- **Para Franco** (en `200-UAT.md`): decision 10 (PIKE y rutas de movilidad), decision 11 (rebuild del grafo de progresiones de SS despues del deploy de la 0288) y la lista de dudas de relaciones para el kinesiologo.
- Archivos de esta fase tocan API, admin y app: el push dispara los tres deploys.

## Known Stubs

Ninguno. Los `Pendiente` de las fichas son un estado real del contenido (D5), consolidados en `200-UAT.md`.

## Threat Flags

Ninguno. T-200-46 mitigado (flag en `false` confirmado por el barrido, la UAT indica activarlo solo en build local sin commitear), T-200-47 mitigado (UAT documenta que 0287/0288 corren contra prod al mergear staging y son idempotentes por codigo/nombre + tenant), T-200-48 aceptado (pendientes H/N consolidados).

## Self-Check: PASSED

Archivos presentes (`200-UAT.md`, `200-VALIDATION.md`, `content-schema.test.ts`, este SUMMARY) y commits `dc5e9bf7f` y `333ba6d93` en `feat/200-anatomia`.
