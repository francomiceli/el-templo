---
phase: 195-web-seo-local-aeo-atribucion
plan: "11"
subsystem: ci-cd
tags: [github-actions, deploy, rollout, secrets, ga4, meta, google, seo]
requires: ["195-03", "195-08", "195-09", "195-10"]
provides:
  - "Input target (todo / solo-web) en deploy.yml y deploy-staging.yml, resuelto en detect-changes (D-11)"
  - "Build web tolerante: una falla del build web no bloquea el deploy de API/app/admin (D-29)"
  - "Backup y rollback por proyecto (solo lo construido); pm2 solo si se desplego la API"
  - "Secrets WEB_GA4_ID / WEB_META_PIXEL_ID en el build web de prod; verify-seo-output --require-api en prod y staging"
  - "Variables META_* / GOOGLE_SC_* / GBP_* en el .env.production de la API de PROD (nunca staging)"
  - "deploy/ROLLOUT-195.md: rollout en 2 pasos, secrets, orden de activacion, solo-web"
affects: [195-12, 195-13, 195-14]
key-files:
  created:
    - deploy/ROLLOUT-195.md
  modified:
    - .github/workflows/deploy.yml
    - .github/workflows/deploy-staging.yml
    - el-templo-web/.env.example
decisions:
  - "Los resultados de build llegan al script remoto (backup/rollback) como variables BUILD_X declaradas dentro del heredoc, expandidas por Actions: el heredoc sigue entre comillas ('ENDSSH') y no hay interpolacion del shell local"
  - "El paso 'resolve' recibe los datos por env (no por ${{ }} dentro del script) para no interpolar entradas en bash"
  - "El primer push del rollout se identifica por mensaje (padre del primer commit feat(195-03)), no por un SHA fijo, para sobrevivir a rebases o a la integracion con 194/v6.1"
metrics:
  tasks: 2
  commits: 2
  completed: 2026-10-07
---

# Phase 195 Plan 11: CI/CD (solo-web, deploy tolerante, secrets y rollout) Summary

`deploy.yml` y `deploy-staging.yml` suman el boton "solo-web" (input `target` resuelto en `detect-changes`), el build web deja de poder frenar el deploy de la API, backup y rollback pasan a ser por proyecto, el build web de prod recibe los IDs de GA4/Pixel y verifica datos reales, la API de prod recibe las variables de Meta y Google (staging blindado) y `deploy/ROLLOUT-195.md` documenta el rollout en 2 pasos.

## Commits

| Hash | Mensaje |
|------|---------|
| `21c0cf735` | feat(195-11): boton solo-web, deploy tolerante a falla de la web y backup/rollback por proyecto |
| `d6a242b60` | feat(195-11): secrets de medicion en el build web, verificacion con datos reales y checklist de rollout |

(Dos commits, uno por tarea, en vez del unico del success_criteria.)

## Diff resumido

### `deploy.if` (idem staging, con `github.ref == 'refs/heads/staging'`)

```diff
       (needs.build-admin.result == 'success' || needs.build-admin.result == 'skipped') &&
-      (needs.build-web.result == 'success' || needs.build-web.result == 'skipped') &&
       (needs.build-api.result == 'success' || needs.build-app.result == 'success' || needs.build-admin.result == 'success' || needs.build-web.result == 'success') &&
```

`build-web` puede estar en `failure` sin bloquear; se exige igual que al menos un build sea `success` (si solo corre la web y falla, el deploy no corre y la corrida queda roja por `Build Web`). El comentario explicativo quedo ARRIBA del `if: >-` (adentro de un escalar plegado un `#` seria texto de la expresion). Primer paso del job: `Warn if the web build failed` (`if: needs.build-web.result == 'failure'`) con el `::warning::` del plan.

### Backup (cada proyecto, ejemplo API)

```diff
+            BUILD_API="${{ needs.build-api.result }}"   # + APP, ADMIN, WEB
-            if [ -d "${{ secrets.API_DEPLOY_PATH }}" ]; then
+            if [ "$BUILD_API" = "success" ] && [ -d "${{ secrets.API_DEPLOY_PATH }}" ]; then
```

### Rollback

```diff
-            if [ -d "${{ secrets.API_DEPLOY_PATH }}.previous" ]; then
+            if [ "$BUILD_API" = "success" ] && [ -d "${{ secrets.API_DEPLOY_PATH }}.previous" ]; then
 ...   (idem APP, ADMIN, WEB)
-            cd ${{ secrets.API_DEPLOY_PATH }}
-            pnpm install --prod --frozen-lockfile
-            pm2 restart eltemplo-api --update-env
+            # Only when the API was deployed in this run (otherwise it was not touched).
+            if [ "$BUILD_API" = "success" ]; then
+              cd ${{ secrets.API_DEPLOY_PATH }}
+              pnpm install --prod --frozen-lockfile
+              pm2 restart eltemplo-api --update-env
+            fi
```

Por que importa: antes el rollback restauraba los 4 `.previous`, incluso los de proyectos que no se construyeron en esa corrida (backup viejo de otro deploy). Ahora un `.previous` solo se toca si ese proyecto se deployo en esta corrida.

### Resto del diff

- `on.workflow_dispatch.inputs.target` tipo `choice` `[todo, solo-web]`, default `todo`.
- `detect-changes`: `dorny/paths-filter` con `if: github.event_name == 'push'` (el `base: ${{ github.event.before }}` de staging se conserva); paso `resolve` escribe `api/app/admin/web`; outputs del job desde `steps.resolve.outputs.*`.
- Los 4 `build-*`: `if: needs.detect-changes.outputs.<x> == 'true'` (sin el `workflow_dispatch ||`).
- `deploy.yml` `build-web`: `NUXT_PUBLIC_GA4_ID` / `NUXT_PUBLIC_META_PIXEL_ID` desde `secrets.WEB_GA4_ID` / `WEB_META_PIXEL_ID`, y paso `node scripts/verify-seo-output.mjs --require-api`. `deploy-staging.yml` `build-web`: el mismo paso, sin IDs.
- `deploy.yml` heredoc `.env.production`: 12 variables nuevas `X=${{ secrets.X }}`. `deploy-staging.yml`: solo el comentario de prohibicion encima del heredoc.
- `el-templo-web/.env.example`: documenta el origen de los IDs (secrets), el prebuild contra `/api/web/site-data` y el uso del fixture solo en desarrollo.
- `deploy-staging.yml` es CRLF en la base: se preservo (el diff muestra solo lineas agregadas).

## Verificacion

| Chequeo | Resultado |
|---------|-----------|
| PyYAML sobre los 2 workflows | OK |
| `actionlint` | no esta instalado en el sistema (no se instalo) |
| `grep -c solo-web` deploy / staging | 6 / 6 (>= 2) |
| `grep -c "steps.resolve.outputs"` deploy / staging | 4 / 4 |
| `grep -c "github.event_name == 'workflow_dispatch' \|\|"` | 0 / 0 |
| `grep -c "needs.build-web.result == 'success' \|\| needs.build-web.result == 'skipped'"` deploy | 0 |
| `grep -c "::warning::El build de la web"` deploy | 1 |
| `secrets.WEB_GA4_ID\|secrets.WEB_META_PIXEL_ID` deploy / staging | 2 / 0 |
| `META_ACCESS_TOKEN=${{ secrets.META_ACCESS_TOKEN }}` y `GBP_REFRESH_TOKEN=` en deploy | 1 y 1 |
| `^\s+(META_\|GBP_\|GOOGLE_SC_)[A-Z_]+=` en staging | 0 |
| `grep -c 'META_\|GBP_\|GOOGLE_SC_'` en staging | 2 (los dos comentarios: uno sobre GA4/Pixel que nombra `NUXT_PUBLIC_META_PIXEL_ID`, y el de prohibicion). Ambos sin asignacion |
| `require-api` en ambos | si |
| `deploy/ROLLOUT-195.md` | 82 lineas, secciones 1-6, usa "solo-web" |
| Script de `resolve` ejecutado con bash para 5 casos (dispatch solo-web, dispatch todo, dispatch sin input, push con filtros mixtos, push sin cambios) | outputs correctos |
| `bash -n` sobre los 4 scripts remotos (backup/rollback x2) con las expresiones `${{ }}` sustituidas | rc 0 |
| `git diff` linea por linea de ambos workflows contra la base | solo lo descrito arriba; sin cambios en rsync, migraciones, restart, smoke tests ni builds de api/app/admin |

No se disparo ningun workflow, no se crearon secrets, no se uso `gh`.

## Deviations from Plan

**1. [Rule 1 - Bug] Comentario dentro del escalar plegado del `deploy.if`**
- **Found during:** revision del diff de Task 1.
- **Issue:** la primera version dejo un `# build-web ...` entre las lineas del `if: >-`; dentro de un escalar plegado seria texto de la expresion y la rompia.
- **Fix:** el comentario paso arriba del `if:`; la expresion evaluada (`yaml.safe_load`) quedo sin texto extra.
- **Commit:** `21c0cf735` (nunca llego a un commit con el defecto).

**2. Descripcion del input en staging:** dice "regenera web-staging" en vez de "eltemplo.org".

Sin otras desviaciones.

## Pendientes y UAT (Franco)

1. **Validar `inputs.target` con un dispatch real en staging** (research A10 era [ASUMIDO]): Actions › Deploy Staging › Run workflow › rama `staging` › target `solo-web`; confirmar que solo corre `Build Web` y que el deploy publica solo la web. Recien tras el rollout paso 1 (el build web exige el endpoint en la API de staging).
2. Seguir `deploy/ROLLOUT-195.md` para los pushes (gates humanos: push, SSH).
3. Crear los secrets de la lista de abajo.
4. `GBP_SYNC_MODE` vacio = `off`; el resto vacio = integracion apagada. Verificado en `modules/marketing/meta/config.ts` y `modules/marketing/google/config.ts` (`readTrimmed`, vacio = ausente).

### Secrets que Franco tiene que crear en GitHub

Todos en el entorno **produccion** (secrets del repo; los del workflow `deploy.yml`). **Ninguno en staging.** Un secret ausente llega vacio y deja la integracion apagada, por eso se pueden crear de a poco.

| Secret | Destino | Origen |
|---|---|---|
| `WEB_GA4_ID` | build web de prod (`NUXT_PUBLIC_GA4_ID`) | GA4 › Admin › Flujos de datos (`G-XXXX`) |
| `WEB_META_PIXEL_ID` | build web de prod (`NUXT_PUBLIC_META_PIXEL_ID`) | Meta Events Manager |
| `META_ACCESS_TOKEN` | `.env.production` API prod | Token de usuario del sistema del Business Manager (acceso al pixel y a la cuenta publicitaria) |
| `META_PIXEL_ID` | API prod | Meta Events Manager (dataset/pixel) |
| `META_AD_ACCOUNT_IDS` | API prod | Meta Business Manager (ids separados por coma) |
| `META_CAPI_START_AT` | API prod | ISO con la fecha de activacion, solo cuando `/privacidad` este en prod |
| `META_GRAPH_VERSION` | API prod, opcional | no hace falta (default `v26.0`) |
| `META_CAPI_TEST_EVENT_CODE` | API prod, temporal | Events Manager › Probar eventos; borrar tras validar |
| `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` | API prod | GCP: service account de Search Console (`base64 -w0 key.json`) |
| `GOOGLE_SC_SITE_URL` | API prod, opcional | no hace falta (default `sc-domain:eltemplo.org`) |
| `GBP_SYNC_MODE` | API prod | `dry-run` una semana, despues `apply` |
| `GBP_OAUTH_CLIENT_ID` | API prod | GCP: cliente OAuth |
| `GBP_OAUTH_CLIENT_SECRET` | API prod | GCP: cliente OAuth |
| `GBP_REFRESH_TOKEN` | API prod | `pnpm exec tsx scripts/gbp-authorize.ts` (plan 195-09) |

## Lecciones

1. `deploy-staging.yml` es CRLF en la base (`deploy.yml` es LF): cualquier script de edicion tiene que normalizar y restaurar los finales de linea.
2. Un secret de la API solo llega al servidor con un deploy de la API (el `.env.production` se escribe en cada deploy de la API): `solo-web` NO sirve para activar `META_*`/`GOOGLE_*`/`GBP_*`; sirve un push que toque la API o un dispatch con `todo`. Ya esta en `ROLLOUT-195.md` seccion 3; 195-14 debe repetirlo en la guia.
3. Con `solo-web` el smoke test de `/health` de la API igual corre (sin cambios): si la API estuviera caida por otra causa, el rollback restauraria la web. Es seguro (solo restaura la web y no reinicia la API), pero puede confundir.
4. El `build-web` rojo deja la corrida en rojo aunque el deploy de API/app/admin salga bien: el aviso `::warning::` esta en el resumen del job de deploy.
5. Para 195-13 (nginx): `ROLLOUT-195.md` seccion 5 referencia `deploy/RUNBOOK-195-NGINX.md`, que debe crear ese plan.
6. Para 195-14 (guia): repetir la tabla de secrets, el orden de activacion (privacidad en prod → Meta con test code → fecha → Google → GBP dry-run una semana) y que los teléfonos reales de `branches.phone` van ANTES de `GBP_SYNC_MODE=apply`.

## Deltas de gates de tenancy

Ninguno (solo CI/CD y documentacion).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model (T-195-45..49 mitigados: Meta/Google solo en el heredoc de prod con comentario de prohibicion en staging, `--require-api` en ambos builds web, `deploy.if` tolera la falla de la web, backup/rollback por proyecto, dispatch sin cambios de permisos).

## Self-Check: PASSED

- `deploy/ROLLOUT-195.md`, `.github/workflows/deploy.yml`, `.github/workflows/deploy-staging.yml`, `el-templo-web/.env.example`: presentes y commiteados.
- Commits `21c0cf735` y `d6a242b60` existen en `feat/195-seo-web`.
