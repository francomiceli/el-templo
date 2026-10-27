# 204 — Reglas para los ejecutores (gsd-executor, sonnet)

Se pasan en el prompt de cada plan. Lecciones de fases anteriores (173, 196, 197, 201) y de esta.

## Entorno
- Worktree: `/home/franco/projects/et-204-wellhub`, rama `feat/204-usuarios-wellhub`. Trabajar SOLO acá. Nunca tocar `/home/franco/projects/el-templo` (checkout principal compartido).
- El worktree NO tiene `node_modules`. **NO correr tests, typecheck, lint ni builds.** No instalar dependencias ni crear symlinks. CI corre todo después del push.
  - Por eso hay que ser riguroso: verificar imports, nombres exactos de funciones/tipos y firmas leyendo el código con grep antes de usarlos.
  - Ningún `run_in_background`, ningún loop de espera con `pgrep`.
- Comandos de git simples y separados (la sesión rechaza comandos compuestos complejos). `git add` SIEMPRE por path explícito, nunca `-A` ni `.`.
- No pushear. No hacer bumps de versión. No commitear archivos fuera del alcance del plan.

## Código
- Sin `any` (usar `unknown` + narrowing o interfaces). `catch (err: unknown)` + `instanceof Error`.
- API: logger Pino (`request.log`/`app.log`/logger del módulo). Nunca `console.*`. Admin: `createLogger()` de `src/utils/logger.ts`.
- Textos de UI en español rioplatense, siguiendo el tono de los textos vecinos.
- Paleta de marca cálida, SIN azul.
- Tenancy: toda query sobre tablas gym-owned con `tenantWhere`/`assertTenant` como el código vecino. Una tabla nueva gym-owned va a los 5 conteos (ver plan 01). Una ruta nueva va a los manifiestos ISO (ver plan).
- `bookings.source` puede ser NULL en filas viejas: usar SIEMPRE los helpers NULL-safe de `shared/wellhub-sources.ts` (plan 02), nunca `source <> 'wellhub'` pelado.
- Migraciones: SQL a mano, sin `;` dentro de comentarios, `mysqlEnum` primer argumento = nombre de columna, valor de enum nuevo al FINAL.
- Tests: no hardcodear ids de `users` (crear fixtures). Fechas relativas a "hoy" en la tz de la sede, nunca fechas fijas (rompen con el calendario). Seguir `test/helpers.ts` y `test/fixtures/wellhub-personas.ts` (plan 02).

## Cierre de cada plan
- Commits atómicos por tarea con mensaje `feat(204-NN): ...` / `fix(204-NN): ...` / `test(204-NN): ...` + línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Escribir `204-NN-SUMMARY.md` en la carpeta de la fase y commitearlo.
- En el SUMMARY: listar desvíos del plan, bugs encontrados que el plan no anticipaba, y dudas para Franco (no bloquear: tomar la opción más conservadora y anotarla).
- Dejar el worktree limpio (`git status --short` vacío salvo archivos ajenos preexistentes).

## Aclaraciones del orquestador a los planes (checker iteración 2)
- **Plan 08:** ubicar `recomputeUserStatus` por grep, no por rango de líneas, porque el plan 03 corre líneas en `subscriptions/service.ts`.
- **Plan 14:** `WellhubCard.reload()` devuelve la card fresca (`Promise<WellhubCard>`), y la página lee `hasLoggedIn` de ese resultado, nunca de una card vieja.
- **Plan 15:** `WellhubCard` emite `merge` con el `gympassId` como payload (cambia el emit pelado del plan 14). La prop se llama `canMergeRole`.

## Lecciones acumuladas de esta fase
- **(plan 01)** `wellhub_conversions` tiene FK a `subscriptions` SIN `ON DELETE`. Hay un borrado físico de suscripciones: la compensación de la prueba especial (`scheduling/especial-trial-service.ts:~416`, `discardSubscription`). Por eso, en el **plan 08** `recordWellhubConversion` NUNCA registra conversión para suscripciones de prueba (`is_trial` / prueba especial): solo planes reales. Agregar un test que lo cubra.
- **(plan 01)** Si un test inserta `wellhub_conversions` para el tenant 2, agregar `DELETE FROM wellhub_conversions WHERE tenant_id = ${TENANT_DOS}` en `test/fixtures/second-tenant.ts` (~:436) antes del `DELETE FROM users`.
- **(plan 01)** La línea `Co-Authored-By` puede decir el modelo que ejecutó (Sonnet). Está bien.
