# Fase 180 — Plan 16 — Task 1: Gate mecánico + bump de versión

Ejecutado en el worktree `/home/franco/projects/et-180`, rama `feat/180-campanas-etapa-2`.
**Los Tasks 2 (SPA fallback `/r/trial`) y 3 (UAT humano) del plan 180-16 NO se ejecutaron** — son
checkpoints humanos que maneja el orquestador. Este documento cubre solo el Task 1.

## Resultado del gate (todo en foreground)

| Comando                                                           | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir el-templo-api exec tsc --noEmit`                      | ✅ exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm --dir el-templo-api lint:tenant`                            | ✅ exit 0 — 462 archivos analizados, 141 entradas de allowlist, **DISCREPANCIAS: 0** (unlistedViolations=0, staleMissingFile=0, staleNoLongerViolating=0, gainedEntries=0). Advertencia no bloqueante: el gate D-14 de "entradas ganadas" no corrió por no pasar `--base` (uso local); en CI el step sí lo pasa.                                                                                                                                                                                                                                                                                          |
| `vitest run` — 10 archivos de la fase                             | ✅ **10 archivos, 137 tests, todos verdes.** Duración 194.06s. Detalle: `campaign-token.test.ts` (13), `campaigns-magic-link.test.ts` (14), `campaigns-audience.test.ts` (27, incluye D-11/D-12/D-13/D-14/D-20), `campaigns-send.test.ts` (12), `campaigns-template.test.ts` (8), `scheduling-member-branches.test.ts` (4), `scheduling-trial-reminder.test.ts` (11, incluye D-20/T-180-13), `scheduling-label-descriptions.test.ts` (9), `tenancy/iso-01-manifiesto.test.ts` (13), `tenancy/iso-03-campaigns.test.ts` (26, aislamiento multi-tenant de campañas — todas las minas M3 y controles pasan). |
| `pnpm dlx vue-tsc@2.2.10 --noEmit -p .quasar/tsconfig.json` (app) | ✅ 17 errores TS — **igual al baseline preexistente (17)**. Sin errores nuevos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm --dir el-templo-app test` (vitest de la app)                | ⚠️ 133/135 tests pasan. **2 fallos preexistentes** en `test/level-display.test.ts` (regresión conocida de la fase 99, listada como excepción en el contexto del plan) — NO son de la fase 180.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm dlx vue-tsc@3.2.5 --noEmit` (admin)                         | ✅ 19 errores TS — **menos que el baseline preexistente (20)**, es decir, cero errores nuevos. Revisados uno por uno: todos en archivos ajenos a la fase 180 (`caja/`, `deudas/`, `pdf/`, `treemap/`, `HorariosPage.vue`, `SessionEditPage.vue`, `ProgramWizardDialog.vue`, `axios-refresh-lock.test.ts`, etc.) — ninguno toca campañas, magic link ni selector de audiencias.                                                                                                                                                                                                                            |

Comando `<automated>` del plan (los 4 primeros, corridos también como bloque):
`tsc --noEmit && lint:tenant && vue-tsc app && vue-tsc admin` → **verde en su conjunto** (los "exit 2"
de vue-tsc corresponden a errores preexistentes de baseline, no a fallas nuevas introducidas por la fase;
se verificaron uno por uno).

## Migración de la fase

- **Commit** `376e7942` — `feat(180-04): columna campaigns.segment + migracion 0210` — incluye
  `el-templo-api/src/db/migrations/0210_campaigns_segment.sql` **junto con**
  `el-templo-api/src/db/schema/campaigns.ts` en el mismo commit (regla del skill de change-control
  cumplida).
- **Número final de migración: 0210** (`0210_campaigns_segment.sql`).
- **Matiz de la comparación contra `origin/master`:** al momento de ejecutar este gate (2026-08-24),
  `origin/master` ya está en `da8a308f`, que **absorbió el tren completo hasta la migración 0209**
  (el tren se pusheó a master el 2026-08-23, después de escrito el plan). Por eso
  `git diff origin/master --name-only -- el-templo-api/src/db/migrations` da **exactamente UN
  archivo nuevo** (`0210_campaigns_segment.sql`) sin necesidad de filtrar migraciones del tren — el
  matiz anticipado en el contexto del plan (que preveía listar también 0200/0209 del tren) **no
  aplicó** porque origin/master ya estaba al día. Verificado también contra la base original del
  worktree (`8d0feea7`, tren v6.0 en staging): mismo resultado, un solo archivo nuevo.
- Sin colisión de nombre/número con `origin/master`.

## `git diff origin/master -- '**/package.json'`

Solo el bump de versión de `el-templo-app/package.json` (`1.7.1` → `1.8.0`). Cero dependencias
nuevas — la fase completa no instaló paquetes.

## `ENTRADAS_BASELINE` (manifiesto de tenancy)

**Sin cambios: 373.** Constante en
`el-templo-api/test/tenancy/iso-01-manifiesto.test.ts:204` (`ENTRADAS_BASELINE = 373`), verificada
en la corrida verde de `test/tenancy/iso-01-manifiesto.test.ts` (13 tests) dentro del bloque de
vitest de arriba. La fase 180 no agregó rutas nuevas al manifiesto (el subida a 373 ya la había
hecho el plan 180-10, según el contexto de partida).

## Bump de versión

- **Versión anterior:** `el-templo-app/version.txt` = `1.7.6`, `el-templo-app/package.json` =
  `1.7.1` (desincronizados desde el commit `a24138de`, donde ambos coincidían por última vez en
  1.7.1 — desde entonces la convención real del repo bumpea solo `version.txt` + propagación
  nativa vía `bump-version.sh`, dejando `package.json` como cosmético/manual per el skill de
  change-control §8).
- **Versión nueva: `1.8.0`** (feature ⇒ minor, sobre `1.7.6`). Aplicada a:
  - `el-templo-app/version.txt` (fuente única que lee CI)
  - `el-templo-app/package.json` (sincronizado explícitamente porque el plan 180-16 lo pide en su
    frontmatter `files_modified` y en el `acceptance_criteria`)
  - `el-templo-app/src-capacitor/android/app/build.gradle` y
    `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj` (propagados con
    `bump-version.sh`, patrón estándar del repo)
- **Commit:** `31da2eb2` — `chore(180-16): bump member app a 1.8.0 para el pasaje de builds`.

### ⚠️ Colisión de versión conocida con la fase 179

La fase 179 (referidos de partners/marcas, ejecutada en el worktree `et-179`, **sin pushear**) ya
tomó `1.8.0` sobre su propia base. Esta fase (180) parte de una base distinta (tren v6.0 /
`8d0feea7`) donde la versión seguía en 1.7.6, así que el bump acá también cayó en 1.8.0 de forma
independiente. **Cuando ambas fases converjan a staging/master, la que se pushee segunda debe
re-bumpear** para no colisionar (anotado también en el mensaje del commit `31da2eb2`).

## Estado del checkout

- `git status --short` en `/home/franco/projects/et-180` queda limpio tras el commit del bump — no
  quedan archivos de `.planning/` ni de código sin commitear en el worktree.
- **Ningún commit se hizo en el checkout principal** (`/home/franco/projects/el-templo`); este
  archivo se escribe ahí solo como documento, sin `git add`/`git commit`.

## Pendiente

Tasks 2 y 3 del plan 180-16 (checkpoint bloqueante de infraestructura `/r/trial` y UAT humano del
flujo completo) siguen abiertos — los maneja el orquestador, no este gate.
