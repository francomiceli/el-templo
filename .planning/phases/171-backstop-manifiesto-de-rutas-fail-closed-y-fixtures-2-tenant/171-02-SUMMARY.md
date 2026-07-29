---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 02
subsystem: testing
tags:
  [
    multi-tenancy,
    fastify,
    onRoute,
    manifiesto,
    clasificacion,
    fail-closed,
    D-04,
  ]

# Dependency graph
requires:
  - phase: 171-01
    provides: el seam `BuildAppOptions.onRoute` en `buildApp()` y el contrato del manifiesto (tipos + `clavesDeEvento` + `particionarObservadas` + `compararManifiesto`)
  - phase: 167-columnas-tenant-id
    provides: "`src/db/tenant-tables.ts` — el formato literal de registro con motivo escrito al lado"
provides:
  - "`TENANT_MANIFEST` poblado: 370 entradas explícitas por ruta exacta (221 tenant-scoped, 11 global con motivo, 138 templo-module con módulo)"
  - "`171-CLASIFICACION.md` — el dossier de las 3 secciones que el checkpoint D-03/D-04 del plan 171-06 le pone delante a Franco"
affects:
  [
    171-03 (el gate ISO-01 cruza este manifiesto contra runtime),
    171-06 (checkpoint humano + aplicación de la decisión),
    176 (requireModule lee la etiqueta templo-module),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline one-shot sin regenerador commiteado (D-16): el script del volcado vive en el scratchpad de la sesión y muere con ella"
    - "Registro canónico con el motivo escrito al lado de la excepción, en el tono de TENANT_GLOBAL_UNIQUES"
    - "Marcador `D-04 dudosa:` en el propio archivo para rutear una decisión abierta al checkpoint humano sin bloquear la ejecución"

key-files:
  created:
    - .planning/phases/171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant/171-CLASIFICACION.md
  modified:
    - el-templo-api/test/tenant-manifest.ts

key-decisions:
  - "El reparto real es 221/11/138, no el 218/141/11 que estimaba el RESEARCH: esa estimación contaba las 3 rutas de labs-inquiry en templo-marketing Y en global a la vez"
  - "El prefijo `/api/app` se parte: las 3 de `labs-inquiry` van a `global` siguiendo Q2 del doc 06 §8, las 2 de `waitlist` quedan en `templo-marketing`"
  - "Las 14 marcas `D-04 dudosa:` son por GRUPO (prefijo o caso), no por ruta: 56 rutas dudosas con un comentario cada una sería ruido que esconde la decisión"
  - "`POST /api/admin/users/:userId/program-addons` queda `tenant-scoped` y no en templo-training: vive en el módulo `users` del admin, y el reparto por carpeta del doc 04 §2.1 cierra en 102 sin ella"

patterns-established:
  - "Dossier de checkpoint con lista corta revisable: `global` entera, `templo-module` por módulo × prefijo con conteo verificado contra el registro, dudosas una por caso"

requirements-completed: []

# Metrics
duration: ~40min
completed: 2026-07-29
---

# Phase 171 Plan 02: Poblar el manifiesto y armar el dossier del checkpoint Summary

**Las 370 rutas registradas hoy tienen entrada explícita por método+path en `TENANT_MANIFEST` — 221 `tenant-scoped`, 11 `global` con motivo escrito y 138 `templo-module` con módulo declarado — más el dossier de 3 secciones que el checkpoint D-03/D-04 necesita.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-29
- **Tasks:** 3/3
- **Files modified:** 2 (1 creado, 1 modificado)

## Accomplishments

- **El volcado dio exactamente lo que el RESEARCH había medido:** 569 eventos `onRoute`, 199 `HEAD` sintéticos, **370 rutas**, 0 duplicados, **0 HEAD huérfanos**, 7 HEAD con barra final (tolerados por el guard porque tienen `GET` hermano). Cero delta contra el inventario — no hubo nada que explicar.
- **El script del volcado no existe en el repo.** Vive en el scratchpad de la sesión, reusa el seam `buildApp({ onRoute })` que dejó el plan 171-01 y las funciones `clavesDeEvento` / `particionarObservadas` en vez de reimplementar la normalización. `git status --porcelain el-templo-api/` no listó ni un archivo nuevo (D-16, T-171-06).
- **370 entradas explícitas, cero comodines.** La única aparición de `*` en todo el archivo es la clave literal `"OPTIONS *"` que registra `@fastify/cors` — no hay una sola regla por prefijo, ningún `startsWith`, ningún helper que complete categorías (D-01).
- **Las 11 `global` llevan motivo escrito que nombra la causa concreta** (liveness sin tablas / preflight CORS / identidad resuelta antes de conocer el gimnasio / tenant derivado server-side desde `branches.wellhub_gym_id` / fila pre-claim que nace antes de saber de quién es el televisor / lead de la plataforma por Q2). Ninguna dice "es pública" o "no aplica" (D-02, T-171-04).
- **Las 138 `templo-module` declaran cuál de los 4 módulos** (D-07), con el reparto del doc 04 §2.1: training 102, marketing 32, onboarding 3, gamification 1.
- **14 grupos marcados `D-04 dudosa:`** en el propio archivo, con la recomendación escrita y el porqué en una línea — incluidos los dos conflictos reales de documentación (T-171-05).
- **El dossier presenta `templo-module` en 20 filas revisables** (módulo × prefijo × conteo) en vez de 138 líneas sueltas, y la suma de la columna da exactamente 138.

## Task Commits

1. **Task 1: Volcado one-shot del inventario** — sin commit **a propósito** (D-16: el script es descartable y no toca el repo; su salida es insumo del task 2)
2. **Task 2: Las 370 entradas clasificadas en `TENANT_MANIFEST`** — `d5721d1e` (feat)
3. **Task 3: Dossier `171-CLASIFICACION.md`** — `771de9ea` (docs)

## Files Created/Modified

- `el-templo-api/test/tenant-manifest.ts` — **+1106 / −11**, 1401 líneas. `TENANT_MANIFEST` pasó de `{}` a 370 entradas agrupadas con separadores de caja: plataforma → auth → los 26 prefijos core en orden alfabético → los 4 bloques `templo-*`. El docblock de cabecera lleva ahora la fecha del volcado, los conteos y el reparto real por categoría.
- `.planning/phases/171-.../171-CLASIFICACION.md` **(nuevo, 109 líneas)** — secciones A (`global`, 11 filas con motivo), B (`templo-module`, 20 filas módulo × prefijo × conteo con total 138 afirmado en el texto) y C (`Dudosas (D-04)`, 14 casos con recomendación, porqué y el documento que la respalda o la contradice).

## Decisions Made

- **Reparto real 221 / 11 / 138, no 218 / 141 / 11.** El RESEARCH daba esos números como estimación explícita ("no como contrato") y el plan lo remarcaba. La diferencia tiene una causa única y verificada: la estimación contaba las 3 rutas de `labs-inquiry` **dos veces**, dentro de `templo-marketing` (por el mapeo carpeta→módulo del doc 04) y dentro de `global` (por la recomendación de Q2). Aplicando Q2 una sola vez, `templo-module` baja de 141 a 138 y `tenant-scoped` sube de 218 a 221.
- **El prefijo `/api/app` se parte.** Es lo que el propio RESEARCH recomendaba: `labs_inquiries` es tabla de plataforma (leads del SaaS) por Q2 del doc 06 §8, mientras que `app_waitlist` sí es gym-owned. Las 3 de labs quedan `global` en la sección core del archivo y las 2 de waitlist en el bloque `templo-marketing`. Es un caso D-04, así que va al checkpoint marcado.
- **Las marcas `D-04 dudosa:` son por grupo, no por ruta.** Las 11 filas dudosas del RESEARCH cubren 56 rutas concretas (16 de blog, 7 de gladius, 5 de franchise…). Un comentario arriba de cada una sería ruido que esconde la decisión en vez de exponerla. Quedaron **14 marcas** — más que las 11 filas del RESEARCH porque `blog`/`academy`/`gladius` se separaron (son tres prefijos y tres razones distintas) y `ratings` se marcó de los dos lados (admin y members). Supera el mínimo de 12 que pedía el criterio.
- **`POST /api/admin/users/:userId/program-addons` queda `tenant-scoped`.** Suena a `programs` (templo-training), pero está registrada en el módulo `users` del admin y el reparto por carpeta del doc 04 §2.1 cierra en exactamente 102 rutas de `templo-training` sin incluirla. Se siguió la carpeta, que es la fuente cerrada.
- **`GET /api/admin/check-ins` fue a `templo-training` y `POST /api/members/attendance/check-in` a `tenant-scoped`.** Es la trampa de nombre que el RESEARCH advertía: el doc 04 §2.1 lista `check-ins` (el feature de entrenamiento) como Templo, mientras el check-in de asistencia es core y lo usa cualquier gimnasio. Ambos quedaron marcados en el dossier.

## Deviations from Plan

Ninguna deviation de las reglas 1-4 (no hubo bug que arreglar, funcionalidad crítica faltante ni bloqueante). Dos desvíos de **verificación**, ambos del criterio y no del código:

**1. [Criterio de aceptación impreciso] `grep -c "categoria:"` da 372, no 370**

- **Encontrado en:** Task 2, criterio de aceptación 4.
- **Qué pasa:** el criterio `grep -v '^\s*[*/]' … | grep -c "categoria:"` cuenta **372** porque además de las 370 entradas matchean dos líneas estructurales que el plan 171-01 ya había commiteado: `categoria: Categoria;` en la interfaz `EntradaManifiesto` y `const categoria: string = entrada.categoria;` en `compararManifiesto`.
- **Qué NO se hizo:** renombrar la variable local ni el campo de la interfaz para que el grep diera redondo. Retocar código commiteado y correcto para satisfacer un contador es exactamente al revés.
- **Cómo se verificó de verdad:** un script descartable importó el módulo y contó `Object.keys(TENANT_MANIFEST).length` = **370**, que es lo que el criterio quería medir y además el criterio 2 de la misma lista. Comprobado también: suma de las 3 categorías = 370, `global` sin motivo = 0, `templo-module` sin módulo = 0, categorías fuera de las 3 = 0, `faltantes` = 0 y `fantasmas` = 0 contra el volcado.

**2. [Corrección de dato del RESEARCH] Dos métodos HTTP mal anotados en las dudosas**

- **Encontrado en:** Task 2, al cruzar la tabla de dudosas contra el volcado.
- **Qué pasa:** el RESEARCH anotaba `PATCH /api/auth/me/change-password` y `DELETE /api/auth/me/delete-account`. El volcado real registra **`POST`** en las dos.
- **Fix:** el manifiesto usa los métodos reales (esa es la única fuente válida, y una clave con el método equivocado habría salido como `fantasma` + `faltante` en el gate del plan 03). Anotado además en el dossier para que el checkpoint no arrastre el dato viejo.

**Total deviations:** 0 auto-fixes de código. **Impacto:** ninguno sobre el comportamiento.

## Issues Encountered

- **Prettier reformatea el manifiesto y no es cosmético.** Con las entradas largas, Prettier parte `{ categoria: "…" }` en multilínea, así que cualquier verificación por `grep '{ categoria:'` es frágil. Se corrió `prettier --write` **antes** de commitear (evita el rebote de lint-staged, que según CLAUDE.md obliga a un commit nuevo y no a un `--amend`) y se re-verificaron typecheck y conteos **después** del formateo. Recordatorio para el plan 171-03: el gate tiene que contar por runtime, no por grep.
- **Ninguna trampa nueva del volcado.** El seam del plan 171-01 funcionó a la primera, `buildApp()` necesitó MySQL vivo como avisaba Pitfall 2 (`.env.development` + `DB_NAME=eltemplo_test_1`), y los 7 HEAD fantasma con barra final los absorbió `particionarObservadas` sin intervención.

## Verification

| Criterio del plan                                                     | Resultado                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Volcado: 370 líneas, `sort -u` = 370                                  | 370 / 370 (0 duplicados)                                            |
| `grep -c '^HEAD '` sobre el volcado                                   | 0                                                                   |
| Contiene `OPTIONS *`, `GET /health`, `GET /spom/week`                 | las 3                                                               |
| HEAD huérfanos                                                        | 0                                                                   |
| `git status --porcelain el-templo-api/` tras el volcado               | vacío — el generador no tocó el repo (D-16)                         |
| Delta contra el inventario del RESEARCH (569 / 199 / 370 / 0 / 0)     | cero — todos los números coinciden                                  |
| `tsc --noEmit --strict --skipLibCheck test/tenant-manifest.ts`        | 0 (`TSC_STANDALONE_OK`), también después de Prettier                |
| `pnpm exec tsc --noEmit` (proyecto)                                   | 0 (`TSC_PROJECT_OK`)                                                |
| Total de claves del manifiesto                                        | 370                                                                 |
| Suma de las 3 categorías                                              | 370 (221 + 11 + 138)                                                |
| `global` sin motivo / `templo-module` sin módulo                      | 0 / 0                                                               |
| Categorías fuera de las 3                                             | 0                                                                   |
| Claves del manifiesto == claves del volcado                           | `faltantes` = 0 y `fantasmas` = 0                                   |
| `grep -c "D-04 dudosa:"`                                              | 15 (14 marcas + 1 mención en el docblock) ≥ 12                      |
| Comodines / reglas por prefijo                                        | ninguno; el único `*` es la clave literal `"OPTIONS *"`             |
| `grep -c "categoria:"` en líneas no-comentario                        | 372 = 370 entradas + 2 estructurales (ver Deviation 1)              |
| Líneas de `tenant-manifest.ts`                                        | 1401 (mínimo pedido: 420)                                           |
| Dossier con las 3 secciones A / B / C                                 | sí                                                                  |
| Filas de la sección C                                                 | 14 ≥ 12                                                             |
| Sección C menciona `labs-inquiry` / `campaigns/track` / `unsubscribe` | sí (5 / 1 / 1 apariciones)                                          |
| Suma de la columna de conteo de la sección B                          | 138 = entradas `templo-module` del manifiesto, afirmado en el texto |
| Sección A: una fila por `global`, sin motivo vacío                    | 11 filas, 11 motivos                                                |
| El dossier NO lista las `tenant-scoped` una por una                   | correcto — la masa de 221 no aparece enumerada                      |

## Known Stubs

Ninguno. El manifiesto ya no es un registro vacío: cubre el 100% de las rutas registradas hoy.

Lo que **sí** queda abierto por diseño son las **14 marcas `D-04 dudosa:`**: llevan la categoría recomendada, no la decidida. No son stubs (el gate del plan 171-03 pasa igual con ellas), son decisiones ruteadas al checkpoint humano del plan 171-06, que las cierra y borra la marca.

## Threat Flags

Ninguno. El plan no creó endpoints, rutas de auth, accesos a archivos ni cambios de schema: sólo un registro de test y un documento de planificación.

## User Setup Required

None. La revisión de Franco es el checkpoint del plan **171-06**, no un setup de este plan.

## Next Phase Readiness

- El plan **171-03** puede escribir el gate `test/tenancy/iso-01-manifiesto.test.ts` sabiendo que, contra el app real, las 5 listas de `compararManifiesto` dan vacías hoy. El rojo que produzca será una ruta genuinamente nueva, no ruido del baseline.
- Recordatorio para el 171-03: **contar por runtime, no por grep** — Prettier parte las entradas largas en multilínea (ver Issues).
- El plan **171-06** tiene el dossier listo: sección A entera para revisar, sección B en 20 filas y sección C con los 14 casos. Cuando Franco decida, se corrige la entrada en el manifiesto Y se borra su marca `D-04 dudosa:`.

## Nota sobre ISO-01

Este plan **no** marca ISO-01 como completo, por el mismo motivo que el 171-01: el requisito exige el manifiesto con el 100% clasificado **más** el gate fail-closed, y el gate lo escribe el plan 171-03. `requirements-completed` va vacío; lo cierra el plan 171-06.

## Self-Check: PASSED

- `el-templo-api/test/tenant-manifest.ts` — existe (1401 líneas).
- `.planning/phases/171-…/171-CLASIFICACION.md` — existe (109 líneas).
- Commits `d5721d1e` y `771de9ea` — presentes en `git log` de `feat/170-sentinel-lint`.
- El script del volcado **no** existe bajo `el-templo-api/` (verificado, y es el resultado buscado).

---

_Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant_
_Completed: 2026-07-29_
