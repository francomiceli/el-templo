---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 06
subsystem: testing
tags:
  [
    multi-tenancy,
    manifiesto,
    clasificacion,
    checkpoint-humano,
    D-03,
    D-04,
    D-07,
    ISO-01,
  ]

# Dependency graph
requires:
  - phase: 171-02
    provides: "`TENANT_MANIFEST` con las 370 entradas clasificadas + las 14 marcas `D-04 dudosa:` + el dossier `171-CLASIFICACION.md` de 3 secciones"
  - phase: 171-03
    provides: "el gate `test/tenancy/iso-01-manifiesto.test.ts` ya verde y demostrado en vivo — Franco decidió sobre un mecanismo que ya andaba, no sobre una propuesta"
  - phase: 171-05
    provides: "la batería ISO-02 verde: el checkpoint llegó con los fixtures del gimnasio 2 listos"
provides:
  - "Manifiesto con la clasificación APROBADA por el dueño del producto: 221 `tenant-scoped` · 8 `global` · 141 `templo-module`"
  - "`171-CLASIFICACION.md` §D — veredicto de los 14 casos con fuente y fecha, el override del caso 3 en detalle y la salvedad textual del caso 5"
  - "Etiquetado `templo-module` CERRADO (D-07): la fase 176 agrega `requireModule` sin re-clasificar nada"
  - "Un pendiente de planning para la fase 175, en palabras de Franco: verificar si `campaigns` está realmente listo multi-tenant"
affects:
  [
    172 (ISO-03 se construye sobre esta lista aprobada),
    175 (la salvedad del caso 5 es insumo de su planning),
    176 (requireModule lee las 141 etiquetas templo-module, ya cerradas),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La duda resuelta NO se borra: `D-04 dudosa:` → `D-04 veredicto:` con decisión + fuente + fecha, en el propio archivo que gobierna"
    - "El gate afirma el TOTAL y la FORMA de cada entrada, nunca el reparto por categoría: recategorizar es una decisión humana, no un número de test que se ajusta hasta que pase"

key-files:
  created: []
  modified:
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - .planning/phases/171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant/171-CLASIFICACION.md

key-decisions:
  - "Caso 3 OVERRIDE: las 3 rutas de labs-inquiries pasan de `global` a `templo-marketing` por decisión de Franco — para la clasificación de RUTAS gana el doc 04 §2.1 sobre la recomendación Q2-global; la TABLA `labs_inquiries` sigue gobernada por Q2, que es otro registro"
  - "13 de 14 casos aprobados tal como se recomendaron; el único override movió la clasificación hacia MÁS protección, no menos"
  - "El reparto final es 221/8/141 y no el 224/8/141 que anticipaba el veredicto: las 3 rutas salieron de `global`, no de la masa `tenant-scoped`. Se verificó por runtime, como el propio veredicto pedía"
  - "El docblock del gate se corrigió (cambio de solo comentario) en vez de dejar un reparto stale afirmado dentro del archivo que lee el manifiesto"

requirements-completed: [ISO-01]

# Metrics
duration: ~35min
completed: 2026-07-29
---

# Phase 171 Plan 06: Checkpoint humano de la clasificación + aplicación del veredicto Summary

**Franco revisó las dos listas peligrosas y los 14 grupos dudosos uno por uno el 2026-07-29, aprobó 13 y overrideó 1 —las 3 rutas de `labs-inquiries` van a `templo-marketing`, no a `global`—, y el veredicto quedó aplicado en el manifiesto con su fuente escrita al lado de cada decisión, con el gate ISO-01 verde 9/9 y ISO-01 cerrado.**

## Performance

- **Duration:** ~35 min (incluye la preparación del checkpoint y 1 corrida MySQL-backed de 104 s)
- **Completed:** 2026-07-29
- **Tasks:** 2/2
- **Files modified:** 3 (0 creados)

## La respuesta de Franco, transcripta — checkpoint del 2026-07-29

Transcripción literal de lo que resolvió el checkpoint (T-171-21: el veredicto sin registro es irrecuperable dentro de un año):

> 1. **Caso 3 — labs-inquiries (3 rutas: POST /api/app/labs-inquiry, GET /api/app/admin/labs-inquiries, PATCH /api/app/admin/labs-inquiries/:id/status): OVERRIDE.** Franco: "todo eso es parte del Templo". Van a `templo-module`, módulo `marketing` (doc 04 §2.1 gana sobre Q2 acá para la clasificación de RUTAS). Registrá la fuente en el dossier: veredicto de Franco en el checkpoint 171-06, 2026-07-29, supersede la recomendación Q2-global para estas rutas. `global` queda en 8.
>
> 2. **Caso 5 — campaigns/track/\* + /unsubscribe (3 rutas): APROBADO como recomendaste** (`tenant-scoped`). Franco agregó una salvedad que tenés que dejar escrita en el bloque Veredicto del dossier: "queda por verificar si campaigns está realmente preparado para que cada tenant lo use (armando su propia campaña con su propio mail saliente, etc.) — es material de la fase 175 (adopción)". Es una nota para el planning de la 175, no cambia la clasificación de hoy.
>
> 3. **Los otros 12 casos: APROBADOS tal como los recomendaste.**

Sobre la **sección A** (`global` entera) y la **sección B** (fronteras módulo × prefijo): aprobadas, con la única corrección del caso 3. Las 221 `tenant-scoped` no fueron a revisión, por diseño (D-03).

## Accomplishments

- **Los dos conflictos de docs tienen veredicto escrito**, que era el punto del checkpoint. El caso 3 se resolvió **contra** la recomendación del ejecutor (doc 04 §2.1 sobre Q2) y el caso 5 **a favor** (Q5 sobre el perfil "es pública, debe ser global"). Ninguno quedó como default de un agente.
- **Cero dudas abiertas:** `grep -c "D-04 dudosa:"` sobre el manifiesto da **0**. Las 14 marcas no se borraron: pasaron a `D-04 veredicto:` con la decisión, el motivo y la fuente (checkpoint 171-06, 2026-07-29). La duda existió y su resolución es la información que se conserva.
- **El override va en la dirección segura.** Las 3 rutas de labs pasaron de estar **exentas** del aislamiento a estar **cubiertas** por él. `global` —la categoría peligrosa— bajó de 11 a **8**. El único movimiento de la revisión hizo el backstop más estricto, no más laxo.
- **El prefijo `/api/app` dejó de partirse:** las 5 rutas viven juntas en `templo-marketing · app-landing`, y el archivo se reordenó para que la organización (core alfabético → bloques `templo-*`) siga siendo cierta en vez de tener una excepción sin explicar.
- **Gate ISO-01 verde 9/9, exit 0**, después de aplicar el veredicto — 104 s. Ninguna aserción hubo que tocar: el gate afirma el total (370) y la forma de cada entrada, no el reparto por categoría.
- **D-07 cerrado:** las 141 `templo-module` declaran su módulo (`templo-training` 102 · `templo-marketing` 35 · `templo-onboarding` 3 · `templo-gamification` 1). La fase 176 agrega `requireModule` sin re-clasificar nada.
- **Un pendiente real capturado para la 175**, en palabras de Franco: `campaigns` está clasificado como debe estar (`tenant-scoped`), pero nadie verificó todavía que el módulo sepa operar multi-tenant end-to-end (remitente saliente propio por gimnasio). Etiquetarlas `tenant-scoped` es justamente lo que obliga a la 175 a resolverlo en vez de descubrirlo en producción.

## Task Commits

1. **Task 1: Checkpoint humano (D-03 / D-04)** — sin commit **a propósito**: no produce artefactos, produce la decisión. Su producto es la transcripción de arriba.
2. **Task 2: Aplicar el veredicto y re-correr el gate** — tres commits atómicos:
   - `08405b25` (feat) — el veredicto aplicado a `test/tenant-manifest.ts`
   - `2ab92df8` (docs) — el docblock del gate deja de afirmar un reparto stale (solo comentario)
   - `d3d1a237` (docs) — bloque `Veredicto` (§D) en `171-CLASIFICACION.md`

## Files Created/Modified

- `el-templo-api/test/tenant-manifest.ts` — **+118 / −56**. Las 3 entradas de labs se movieron del bloque core `/api/app` al bloque `templo-marketing · app-landing` con `modulo: "templo-marketing"`; las 14 marcas `D-04 dudosa:` pasaron a `D-04 veredicto:` con decisión + fuente + fecha; los dos docblocks de conteo se actualizaron al reparto aprobado.
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` — **+11 / −3**, **estrictamente dentro de un bloque `/** */`** (verificado por `git diff`). `ENTRADAS_BASELINE = 370` intacto. Ver Deviation 1.
- `.planning/phases/171-.../171-CLASIFICACION.md` — **+113 / −3**. Sección **D** nueva: veredicto de los 14 casos en tabla con fuente, el override del caso 3 en detalle con las palabras textuales, la salvedad del caso 5 verbatim como pendiente de la 175, y el reparto final contado por runtime. Las secciones A/B/C quedaron **como se le presentaron** —son el insumo de la decisión, no su resultado— con un aviso en A de que esas 3 filas ya no son `global`.

## Decisions Made

- **El override del caso 3 se aplicó con su alcance limitado y escrito.** Franco decidió sobre la clasificación de **RUTAS**; el veredicto **no** dice nada sobre la clasificación de la **TABLA** `labs_inquiries` en `src/db/tenant-tables.ts`, que es un registro distinto y sigue gobernada por Q2. Quedó escrito en el comentario del manifiesto y en §D del dossier para que nadie "unifique" los dos registros suponiendo que el veredicto los abarcaba a los dos.
- **El caso 14 (`franchise`) quedó anotado como coherente con el caso 3.** Los dos rozaban "plataforma" por el mismo argumento (es la marca El Templo, no el gimnasio) y los dos terminaron en `templo-marketing`. Anotarlo evita que en un año parezcan dos decisiones inconsistentes tomadas por separado.
- **Las marcas de duda no se borraron.** El plan lo pedía explícitamente y es la parte no obvia: un `D-04 veredicto:` que dice "confirmada `tenant-scoped`, aprobado por Franco el 2026-07-29" vale más que ningún comentario, porque la próxima persona que mire `POST /api/auth/register` y piense "esto debería ser global" encuentra ahí que ya se pensó y por qué se decidió al revés.
- **El módulo se escribió `templo-marketing`, no `marketing`.** El veredicto decía "módulo `marketing`" en taquigrafía; el enum tipado del archivo (`MODULOS_TEMPLO`) sólo admite los 4 nombres completos, y un literal `"marketing"` no habría compilado. Sin ambigüedad posible: hay un solo módulo de marketing.

## Deviations from Plan

**1. [Rule 1 — dato stale que engaña] El docblock del gate ISO-01 afirmaba el reparto viejo**

- **Encontrado durante:** Task 2, al buscar aserciones de conteo por categoría que hubiera que ajustar.
- **Issue:** `test/tenancy/iso-01-manifiesto.test.ts` tenía escrito en el docblock de `ENTRADAS_BASELINE`: "370 rutas — 221 `tenant-scoped`, 11 `global`, 138 `templo-module`". Después del veredicto eso es falso (8 / 141). Es exactamente el patrón de **comentarios stale** que el 168-REVIEW ya había marcado como warning en este proyecto, y acá vivía dentro del archivo que gobierna el manifiesto: el peor lugar posible para un número equivocado.
- **Tensión con el plan:** el criterio de aceptación decía que `git status --porcelain el-templo-api/` debía listar **únicamente** `test/tenant-manifest.ts`. Ese criterio existe por T-171-23: **arreglar el test en vez del manifiesto**. Se resolvió honrando el *motivo* del criterio y no su letra.
- **Fix:** cambio de **solo comentario**, íntegramente dentro de un bloque `/** */`, probado por `git diff` (pegado en el propio mensaje del commit `2ab92df8`) y por `numstat` (+11/−3, todas líneas de comentario). **`ENTRADAS_BASELINE` sigue en 370 y ninguna aserción se tocó.** Se aprovechó para escribir la razón por la que este archivo **no** afirma el reparto por categoría: recategorizar es una decisión humana con dueño y fecha, no una constante de test que se ajusta hasta que pase.
- **Por qué no fue "arreglar el test":** el gate quedó exactamente igual de estricto. La prueba es que corrió **verde 9/9 antes de conocer el cambio de comentario** — la recategorización nunca lo puso rojo, así que no había ningún rojo que silenciar.
- **Commit:** `2ab92df8` (separado a propósito, para que el diff sea trivialmente auditable).

**2. [Corrección aritmética del veredicto, verificada por runtime] El reparto final es 221/8/141, no 224/8/141**

- **Encontrado durante:** Task 2, al contar por runtime.
- **Issue:** el veredicto anticipaba "224 tenant-scoped / 8 global / 141 templo-module" y pedía verificarlo por runtime. Runtime dio **221 / 8 / 141** (suma 370). La diferencia: las 3 rutas de labs salieron de **`global`**, no de la masa `tenant-scoped`, así que `tenant-scoped` no se movió — sólo bajó `global` (11 → 8) y subió `templo-module` (138 → 141).
- **Fix:** se escribieron los números de runtime en los dos docblocks y en el dossier, y se dejó escrita la razón de por qué `tenant-scoped` **no** cambia, que es lo que hace la aritmética verificable la próxima vez. El 224 nunca llegó a un commit (se corrigió en el working tree).
- **Método:** script descartable que importa `TENANT_MANIFEST` y cuenta `Object.keys` + por categoría + por módulo + `sinMotivo`/`sinModulo`/`categoriaInvalida`. Vivió en el scratchpad, se copió al repo para correrlo con `tsx` y se borró; `git status --porcelain el-templo-api/` no lo listó nunca (D-16).

**3. [Instrucción explícita del coordinador vs. letra del plan] `requirements.mark-complete ISO-01`**

- El `<action>` del plan decía **NO** tocar `REQUIREMENTS.md`/`ROADMAP.md` porque el marcado es de `/gsd:verify-phase`. El coordinador instruyó explícitamente cerrar ISO-01 en este plan, ahora que el 100% está clasificado **con veredicto humano** y el gate está verde.
- Se siguió al coordinador: `ISO-01` pasó a `Complete` en el checklist y en la tabla de trazabilidad. `ISO-02` ya estaba `Complete` desde el plan 171-05. **`ISO-03` sigue `Pending`, anclado en la fase 172** — no se tocó.
- Queda anotado acá porque es un desvío consciente de la letra del plan, no un descuido.

**Total deviations:** 1 auto-fix (comentario stale), 1 corrección de dato verificada por runtime, 1 desvío de proceso instruido. **Impacto sobre el comportamiento del código: ninguno** — este plan no toca `src/`.

## Issues Encountered

- **`state.record-metric` no acepta argumentos posicionales.** El workflow del executor documenta `state.record-metric "${PHASE}" "${PLAN}" …` y el handler devuelve `phase, plan, and duration required`: la firma real es de **flags nombrados** (`--phase --plan --duration --tasks --files`). Se corrigió la invocación (registrado acá para el próximo plan de la fase, y vale la pena arreglar el workflow).
- **`state.update-progress` devolvió `updated: false` — "Progress field not found in STATE.md".** El `progress:` de este STATE.md vive en el frontmatter YAML y el handler busca una barra de progreso en el cuerpo. No se forzó nada a mano: el conteo real lo recalcula `roadmap.update-plan-progress`, que sí funcionó.
- **Nada nuevo del lado de los tests.** Prettier salió `unchanged` en los dos archivos (se corrió **antes** de commitear, así que lint-staged no rebotó), y el gate tardó 104 s: los ~98 s son el provisioning del worker MySQL + los ~35 `register` de `buildApp()`, no las aserciones.

## Verification

| Criterio del plan                                                          | Resultado                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Respuesta de Franco transcripta con fecha en el SUMMARY                     | sí — literal, arriba, 2026-07-29                                                     |
| Los 2 conflictos de docs con veredicto (labs / campaigns)                   | sí — caso 3 OVERRIDE, caso 5 aprobado con salvedad textual                            |
| `vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000`    | **exit 0, 9/9 verdes**, 104 s                                                        |
| `grep -c "D-04 dudosa:"` en el manifiesto                                  | **0** (las 14 pasaron a `D-04 veredicto:`, 15 apariciones = 14 marcas + 1 docblock)   |
| Total de claves del manifiesto sin cambios                                 | **370** (runtime), igual que el baseline                                              |
| Suma de las 3 categorías = total                                            | 370 = 221 + 8 + 141                                                                   |
| `global` sin motivo / `templo-module` sin módulo / categoría inválida       | 0 / 0 / 0 (runtime)                                                                   |
| `templo-module` por módulo                                                  | training 102 · marketing **35** · onboarding 3 · gamification 1                       |
| Las 3 rutas de labs quedaron `templo-module` / `templo-marketing`           | sí — verificado por runtime, las 3                                                    |
| `global` restantes                                                          | 8: `/health`, `OPTIONS *`, login, refresh, logout, tv/pair/start, tv/pair/status, webhooks/wellhub |
| `171-CLASIFICACION.md` con bloque `Veredicto` + fecha + reparto final       | sí — sección D, 2026-07-29                                                            |
| `pnpm exec tsc --noEmit` (proyecto)                                        | 0 (`TSC_PROJECT_OK`)                                                                  |
| `git status --porcelain el-templo-api/`                                     | `test/tenant-manifest.ts` + `test/tenancy/iso-01-manifiesto.test.ts` (ver Deviation 1) |
| Aserciones del gate modificadas                                            | **ninguna** — `ENTRADAS_BASELINE = 370` intacto; el diff del test es solo comentario   |
| Migraciones nuevas / deps nuevas                                           | 0 / 0 (`pnpm-lock.yaml` sin cambios)                                                  |
| Rama                                                                        | `feat/170-sentinel-lint`, verificada antes de cada commit                             |

## Known Stubs

Ninguno. La clasificación está completa y aprobada: 370/370 rutas con categoría, cero dudas abiertas, cero entradas con motivo o módulo faltante.

## Threat Flags

Ninguno. Este plan no creó endpoints, rutas de auth, accesos a archivos ni cambios de schema: modificó un registro de test, un docblock de test y un documento de planificación.

Los 4 threats del plan quedaron mitigados: **T-171-20** (ruta gris `global` sin dueño humano) — el checkpoint paró la ejecución y **no** se auto-aprobó, y el único override *sacó* rutas de `global`; **T-171-21** (veredicto sin registro) — transcripción literal acá + §D del dossier con fuente y fecha + comentario en el manifiesto por cada grupo; **T-171-22** (romper el gate sin darse cuenta) — re-corrida completa, 9/9; **T-171-23** (arreglar el test en vez del manifiesto) — ninguna aserción tocada, con el diff del test pegado en su propio commit para que sea auditable.

## User Setup Required

None.

## Next Phase Readiness

- **ISO-01 cerrado** (`Complete` en el checklist y en la tabla de trazabilidad). ISO-02 ya estaba cerrado en el 171-05. **ISO-03 sigue Pending en la fase 172**, que es su ancla.
- **La fase 172** construye ISO-03 sobre una lista con dueño humano: las 221 `tenant-scoped` son el universo a cubrir por la batería de aislamiento, y las 8 `global` son las únicas exenciones legítimas.
- **La fase 175 tiene un pendiente escrito de Franco** que su `/gsd:plan-phase` debería levantar: verificar si `campaigns` está realmente preparado para multi-tenant (campaña propia por gimnasio, mail saliente propio). No es un bug de hoy: es una pregunta de adopción que la clasificación dejó explícita.
- **La fase 176** lee 141 etiquetas `templo-module` cerradas y sólo tiene que agregar `requireModule` — sin re-clasificar (D-07 cumplido). Ojo con las 3 nuevas: `labs-inquiries` va a requerir `requireModule("templo-marketing")`.
- **Advertencia para quien recategorice algo más adelante:** el gate **no** afirma el reparto por categoría a propósito, así que mover una ruta de categoría **no** lo pone rojo. La red que sí existe es `sinMotivo` / `sinModulo` / `categoriaInvalida`, y la revisión humana. Un cambio de categoría sin veredicto escrito pasa el CI: es una decisión de producto, no un error de tipos.

## Self-Check: PASSED

- `el-templo-api/test/tenant-manifest.ts` — existe, 370 entradas verificadas por runtime.
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` — existe, 9/9 verde.
- `.planning/phases/171-…/171-CLASIFICACION.md` — existe, sección D presente.
- Commits `08405b25`, `2ab92df8`, `d3d1a237` — presentes en `git log` de `feat/170-sentinel-lint`.
- `ISO-01` — `Complete` en `.planning/REQUIREMENTS.md` (checklist línea 54 y tabla línea 111).

---

_Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant_
_Completed: 2026-07-29_
