---
phase: 195-web-seo-local-aeo-atribucion
plan: "12"
subsystem: app + ci-cd
tags: [deep-links, assetlinks, aasa, github-actions, in-app-review, capacitor, version-bump]
requires: ["195-11"]
provides:
  - "app-dist sube dist/spa/.well-known (include-hidden-files: true en deploy.yml y deploy-staging.yml)"
  - "scripts/check-well-known.mjs + script pnpm check-well-known (--strict falla con fingerprints TODO)"
  - "src/utils/in-app-review.ts: shouldRequestReview (puro) y maybeRequestReview (solo iOS/Android)"
  - "App en 1.9.0"
affects: [195-13, 195-14]
tech-stack:
  added: ["@capacitor-community/in-app-review@8.0.0 (app y src-capacitor, version exacta)"]
  patterns:
    - "Pedido de resena detras de una sola funcion pura + wrapper con Preferences, single-flight y try/catch"
key-files:
  created:
    - el-templo-app/scripts/check-well-known.mjs
    - el-templo-app/src/utils/in-app-review.ts
    - el-templo-app/src/utils/__tests__/in-app-review.test.ts
  modified:
    - .github/workflows/deploy.yml
    - .github/workflows/deploy-staging.yml
    - el-templo-app/package.json
    - el-templo-app/pnpm-lock.yaml
    - el-templo-app/src-capacitor/package.json
    - el-templo-app/src-capacitor/pnpm-lock.yaml
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/version.txt
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj
decisions:
  - "Franco aprobo la instalacion del plugin el 2026-10-07 (respuesta textual: 'Aprobado'). La instalacion (pnpm add con version exacta en app y src-capacitor) la hizo el orquestador, no el ejecutor"
  - "lastRequestedAt solo se guarda si requestReview no fallo: si falla se reintenta en otra sesion (las APIs nativas no informan si se mostro el dialogo)"
  - "Timestamps guardados como epoch ms en string; un valor no numerico, 0 o negativo cuenta como 'sin dato' (primer uso), no como fecha antigua"
  - "El validador falla (exit 1) con un fingerprint que no es TODO y tiene formato invalido: el WARNING es solo para el placeholder"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 12: Deep links al servidor, validador, resena in-app y bump 1.9.0 Summary

Los archivos `.well-known` de deep links dejan de perderse en el artifact de deploy (`upload-artifact@v4` excluia las carpetas ocultas), un validador revisa su contenido y avisa de los fingerprints pendientes, la app pide la resena nativa de forma neutral (14 dias de uso, maximo una vez cada 120) y la version sube a 1.9.0.

## Commits

| Hash | Mensaje |
|------|---------|
| `c839c3d5f` | fix(195-12): .well-known en el artifact de la app y validador de deep links |
| `079c5da2a` | chore(app): bump 1.9.0 (feature = minor) |
| `8ce488f28` | feat(195-12): pedido de reseña in-app neutral con @capacitor-community/in-app-review 8.0.0 |

## Diagnostico: por que `.well-known` no llegaba al servidor

La causa esta en el artifact del workflow, no en el build.

1. **El build genera los archivos.** `pnpm build` en `el-templo-app` y `ls -la dist/spa/.well-known`:
   ```
   -rw-r--r-- 1 franco franco 170 Oct  7 08:21 apple-app-site-association
   -rw-r--r-- 1 franco franco 782 Oct  7 08:21 assetlinks.json
   ```
   Quasar copia `public/` completo, ocultos incluidos.
2. **El workflow los descartaba.** `build-app` sube `el-templo-app/dist` con `actions/upload-artifact@v4` (`deploy.yml` ~l.220-224 y `deploy-staging.yml` ~l.228-232). Desde v4.4 ese action excluye archivos y carpetas ocultas por defecto (`include-hidden-files: false`). `.well-known` empieza con punto, asi que nunca entraba en `app-dist`, y el `rsync app-build/` ya no lo tenia.
3. **Evidencia en vivo** (GET publico, sin SSH): `curl -sI https://app.eltemplo.org/.well-known/assetlinks.json` y `.../apple-app-site-association` responden `200` con `content-type: text/html` y `content-length: 909`. 909 bytes es exactamente el tamano de `dist/spa/index.html`: es el fallback de la SPA, no el JSON.
4. **Fix:** `include-hidden-files: true` solo en el artifact `app-dist` de los dos workflows (api, admin y web no cambian; T-195-52 aceptado: el contenido es el build publico de la SPA). `deploy-staging.yml` conserva sus finales CRLF (verificado con `file` y `cat -A`), `deploy.yml` sigue LF.
5. **Falta del lado servidor (195-13):** el `content-type` correcto (`application/json` para ambos, y que AASA no se sirva como `text/html` ni redirija) lo pone nginx. Con este fix el archivo llega al directorio, pero hasta 195-13 nginx puede servirlo con el tipo equivocado.

## Decision del checkpoint (Task 2)

Franco **aprobo** la instalacion de `@capacitor-community/in-app-review` 8.0.0 el 2026-10-07 (respuesta textual: "Aprobado"). Auditoria previa del paquete: ~207k descargas por semana, repo `capacitor-community/in-app-review`, sin `postinstall`, peer `@capacitor/core >= 8.0.0` (el proyecto usa `^8.2.0`), slopcheck [OK]. La instalacion la hizo el orquestador (`pnpm install --frozen-lockfile` + `pnpm add ... --save-exact` en `el-templo-app` y en `el-templo-app/src-capacitor`) porque `el-templo-app/node_modules` era un symlink a otro worktree. El ejecutor no corrio ningun comando de instalacion.

## Detalle de lo implementado

- **`scripts/check-well-known.mjs`** (Node puro, `--strict`, `--dir=<carpeta>` para pruebas): valida JSON; AASA con `applinks.details[].appID` formato `<TEAMID>.<bundle>` y `paths` no vacio; assetlinks con los paquetes `com.eltemplo.app` y `com.eltemplo.app.staging` y cada fingerprint `^([0-9A-F]{2}:){31}[0-9A-F]{2}$`. Fingerprints `TODO_...` dan WARNING y exit 0, con `--strict` exit 1. Hoy: exit 0 con 2 warnings; `--strict` exit 1. NO se inventaron fingerprints.
- **Bump 1.8.1 → 1.9.0:** `version.txt` y `package.json` a mano, luego `bash el-templo-app/bump-version.sh` (`versionName` de `build.gradle`, 2 `MARKETING_VERSION` de `project.pbxproj`). `versionCode` y `CURRENT_PROJECT_VERSION` sin tocar (0 lineas en el diff).
- **`src/utils/in-app-review.ts`:** `shouldRequestReview({ firstSeenAt, lastRequestedAt, now })` puro; `maybeRequestReview()` no hace nada en web, registra `firstSeenAt` en el primer uso sin pedir, pide con `InAppReview.requestReview()` (API nativa, sin preguntar "te gusta la app" previamente) y guarda `lastRequestedAt` solo si no fallo. Una evaluacion a la vez (single-flight) y todo en try/catch con `createLogger('in-app-review')`.
- **`MainLayout.vue`:** un `watch` sobre `authStore.isAuthenticated` con `immediate: true` (mismo patron que los otros del layout) llama `void maybeRequestReview()`. Sin `onUnmounted` nuevo.

## Verificacion

| Chequeo | Resultado |
|---------|-----------|
| `pnpm exec vitest run src/utils/__tests__/in-app-review.test.ts` | 30 tests pasan |
| Mutation testing manual de `in-app-review.ts` (17 mutantes) | 16 matados, 1 equivalente (ver abajo). Archivo restaurado y verificado con `diff` contra la copia |
| `pnpm lint` (app) | 0 errores, 2 warnings preexistentes (`axios.ts`, `useSessionPlayer.ts`) |
| `pnpm build` (app) | OK, `dist/spa/.well-known` con los 2 archivos |
| `check-well-known` / `--strict` sobre los archivos reales | exit 0 con 2 WARNING / exit 1 |
| `check-well-known` sobre fixtures (validos, appID malo, paths vacios, fingerprint malo, carpeta vacia) | exit 0 / 1 / 1 / 1 / 1 con los mensajes esperados |
| YAML de los 2 workflows (PyYAML) | OK, `include-hidden-files: True` en el `with` de `app-dist` en ambos |
| `grep -c "include-hidden-files: true"` | 1 en `deploy.yml`, 1 en `deploy-staging.yml` |
| `"@capacitor-community/in-app-review": "8.0.0"` en los 2 `package.json` | 1 + 1 |
| `MARKETING_VERSION = 1.9.0` / `versionCode`-`CURRENT_PROJECT_VERSION` en el diff | 2 / 0 |
| Prettier sobre los archivos nuevos | OK |

### Mutation testing de `shouldRequestReview` / `maybeRequestReview`

Se mutaron, uno por vez y contra la suite del archivo (con baseline verde antes y archivo restaurado despues):

| Mutante | Resultado |
|---------|-----------|
| `firstSeenAt === null` devuelve true | matado |
| `<` a `<=` en el umbral de 14 dias | matado |
| umbral de 14 a 13 dias (`MIN - 1`) / constante 14 a 7 | matados |
| `<` a `<=` en el umbral de 120 dias | matado |
| `lastRequestedAt !== null` invertido / constante 120 a 90 | matados |
| `=== 'web'` invertido | matado |
| se quita el single-flight (`if (inFlight)`) | matado |
| se quita el guardado de `lastRequestedAt` | matado |
| se quita el guardado de `firstSeenAt` en el primer uso | matado |
| se quita `await InAppReview.requestReview()` | matado |
| el `catch` relanza el error | matado |
| `DAY_MS` mal calculado | matado |
| `readTimestamp` sin `Number.isFinite` | SOBREVIVIO al principio, matado tras agregar tests con `Infinity`/`NaN`/vacio |
| `readTimestamp` sin `parsed > 0` | SOBREVIVIO al principio, matado tras agregar tests con `0`/`-5` |
| se quita el `return` tras registrar el primer uso | **equivalente** (sobrevive): si cae al resto, `shouldRequestReview` recibe `firstSeenAt` nulo y devuelve false; solo cambia una lectura de mas |

Los dos sobrevivientes reales mostraron un hueco: valores guardados invalidos. Se agregaron 9 casos con `it.each` (`0`, `-5`, `Infinity`, `NaN`, vacio para `firstSeenAt`; los cuatro primeros para `lastRequestedAt`).

## Para integrar con la rama 194 (version)

La rama paralela 194 lleva la app a **1.8.2**. Al integrar 194 y 195, re-chequear `version.txt` (es lo unico que lee CI, ver change-control §8): si 194 sale antes, 195 sigue siendo 1.9.0 (el bump de 195 es de la minor); si se juntan en un tren, una sola minor. Si hay conflicto, resolver en `version.txt`, `package.json`, `build.gradle` y `project.pbxproj` y volver a correr `bump-version.sh`. El motivo de la minor: la captura de origen (195-07) y la resena in-app requieren build de tiendas.

## `cap sync` en los builds nativos de CI

El plugin es nativo, asi que el build de tiendas tiene que correr `npx cap sync` con `src-capacitor/package.json` actualizado. Revise los 4 workflows de build nativo:

| Workflow | `pnpm install --frozen-lockfile` en `src-capacitor` | Sync |
|----------|------------------------------------------------------|------|
| `build-android-production.yml` | si (l.67-68) | `npx cap sync android` (l.75) |
| `build-android-staging.yml` | si (l.55-56) | `npx cap sync android` (l.65) |
| `build-ios-production.yml` | si (l.56-57) | `npx cap sync ios` (l.71), luego `pod install` |
| `build-ios-staging.yml` | si (l.74-75) | `npx cap sync ios` (l.90), luego `pod install` |

Los cuatro ya hacen `cap sync` despues de instalar las dependencias de `src-capacitor`, y el plugin queda en el `package.json` y el lockfile de `src-capacitor` (instalacion con `--frozen-lockfile`), asi que **no hace falta cambiar ningun workflow**. En iOS, `pod install` toma el `CapacitorCommunityInAppReview.podspec` que `cap sync` agrega al Podfile via `capacitor_pods`. En Android no requiere configuracion extra (usa Play Core). Los dos `pnpm-lock.yaml` quedaron con +12 lineas cada uno.

## Deviations from Plan

**1. Dos commits para la Task 1 en vez de uno:** el fix del artifact con el validador (`c839c3d5f`) y el bump (`079c5da2a`), como pedia `success_criteria`. El mensaje del bump es `chore(app): bump 1.9.0 (feature = minor)`.

**2. [Rule 2 - correccion] Opcion `--dir` y validaciones extra en el validador:** el plan no pedia `--dir`; se agrego para probarlo con fixtures y contra `dist/spa/.well-known`. Tambien valida el formato de `appID` (`<TEAMID>.<bundle>`) y que ambos paquetes esten presentes.

**3. [Rule 2 - robustez] `maybeRequestReview` con single-flight y valores guardados invalidos:** el plan no lo detallaba. Sin single-flight, dos disparos del watch podian pedir la resena dos veces; un timestamp corrupto o `0` contaba como "usuario antiguo" y pedia la resena de inmediato.

**4. La instalacion del plugin la hizo el orquestador,** no el ejecutor (el worktree tenia `node_modules` como symlink a otro worktree). El ejecutor solo commiteo los 4 `package.json`/lockfiles resultantes junto con el codigo.

No hubo bugs ni gates de autenticacion adicionales.

## Pendientes (Franco) / para la guia 195-14

1. **Fingerprints de `assetlinks.json`:** copiar de Play Console › App integrity › "App signing key certificate" (NO la upload key) el SHA-256 de produccion, y el de staging de su keystore. Reemplazar los `TODO_...` y verificar con `pnpm check-well-known --strict`.
2. **Entitlement de iOS (Associated Domains):** `applinks:app.eltemplo.org` en el proyecto de Xcode / provisioning. Depende de Apple, no esta en este plan. El AASA ya declara `6D9R97DGAK.com.eltemplo.app` con paths `/r/trial` y `/r/trial*`.
3. **ASO de las fichas** de las tiendas.
4. **Tras el deploy:** `curl -sI https://app.eltemplo.org/.well-known/assetlinks.json` debe dar `application/json` (requiere el nginx de 195-13) y el cuerpo JSON, no 909 bytes de HTML.
5. **Builds de tiendas 1.9.0** (la resena in-app y la captura de origen solo existen en el binario). Probar la resena en un build de TestFlight/Play: el dialogo nativo no aparece siempre (lo limitan las tiendas) y en desarrollo iOS no se muestra.
6. **Observacion fuera de alcance:** `@capacitor-community/keep-awake` esta en `el-templo-app/package.json` pero no en `src-capacitor/package.json`, a diferencia de los demas plugins nativos. No se toco: conviene revisar si ese plugin llega a los builds nativos.

## Deltas de gates de tenancy

Ninguno (solo app y CI/CD).

## Known Stubs

Ninguno. Los fingerprints `TODO_...` de `assetlinks.json` son un dato pendiente de Franco, detectado a proposito por el validador.

## Threat Flags

Ninguno nuevo. T-195-SC mitigado (checkpoint humano + version exacta), T-195-50 (validador `--strict` listo), T-195-51 (API nativa sin gating, maximo 1 cada 120 dias), T-195-52 aceptado.

## Lecciones

1. `upload-artifact@v4` pierde carpetas ocultas por defecto: cualquier archivo de `public/` que empiece con punto (`.well-known`) necesita `include-hidden-files: true`. Para 195-13: revisar si la web (`web-dist`, `.output/public`) tiene algun archivo oculto que tambien deba subirse.
2. Una funcion pura con umbrales numericos necesita tests en los bordes exactos (13/14 dias, 119/120, y 1 ms antes). Los mutantes `<` a `<=` solo mueren con el borde exacto.
3. Los valores leidos de almacenamiento persistente hay que validarlos aparte: `Number(x)` de basura da `NaN`, `0` o `Infinity`, y cada uno cambia la decision de forma distinta.
4. Con `el-templo-app/node_modules` propio ya no es symlink: los builds locales de la app corren con el install del worktree. Sigue vigente que no se corre `pnpm add`/`pnpm install` sin instruccion del orquestador.
5. `git diff --quiet` no detecta cambios en un archivo sin trackear: para restaurar tras mutacion de un archivo nuevo, comparar con `diff` contra la copia de respaldo.

## Self-Check: PASSED

- `el-templo-app/scripts/check-well-known.mjs`, `el-templo-app/src/utils/in-app-review.ts`, `el-templo-app/src/utils/__tests__/in-app-review.test.ts`: existen.
- Commits `c839c3d5f`, `079c5da2a`, `8ce488f28`: existen en `feat/195-seo-web`.
