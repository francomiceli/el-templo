---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 12
subsystem: api+admin
tags: [settings, system_settings, qrcode, jszip, tenancy-manifest, partners]

# Dependency graph
requires:
  - phase: 179-11
    provides: "Página /partners con nav propio, tab CRUD, composable usePartnersApi.ts base y PartnerFormDialog.vue"
provides:
  - "APP_STORE_SETTINGS_KEYS (app.store_url.android / app.store_url.ios) en system_settings, configurables sin deploy"
  - "GET/PUT /api/admin/settings/store-urls (staff-readable, owner-only write)"
  - "usePartnersApi.getStoreUrls/updateStoreUrls"
  - "PartnerQrDialog.vue: genera y descarga los 2 PNG de la tarjeta (Play/App Store) con el código impreso, client-side, sin token ni firma"
  - "Botón QR por fila en PartnersPage.vue"
affects: [179-15, 179-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SettingsService.getStoreUrls/setStoreUrls: mismo par insert/onDuplicateKeyUpdate que getFlag/setFlag, sin la serialización on/off; fallback null explícito (nunca deriva la URL de Android desde el appId en silencio)"
    - "Manifiesto ISO-01: las 2 rutas nuevas se clasificaron `global` (no `tenant-scoped` como el precedente de pricing) porque system_settings es una de las 4 TENANT_EXEMPT_TABLES — config global sin tenant_id, documentado en tenant-tables.ts. Motivo escrito por ruta (D-02). Baseline 374→376."
    - "PartnerQrDialog.vue: QRCode.toDataURL(1024px, margin 2, errorCorrectionLevel 'H', negro/blanco — mismas opciones que tools/generate-branch-qrs.ts) dibujado sobre un <canvas> junto con el código (texto grande) y el nombre del comercio (texto chico); canvas.toDataURL para preview + canvas.toBlob para el .zip (jszip, mismo patrón que session-png-builder.ts)"
    - "Si falta alguna URL de tienda, el diálogo muestra un aviso + formulario inline de carga en vez de generar un QR roto — esa superficie es la que usa el checkpoint humano del plan 179-17"

key-files:
  created:
    - el-templo-admin/src/components/partners/PartnerQrDialog.vue
    - el-templo-api/test/referral-partners/store-urls.test.ts
  modified:
    - el-templo-api/src/modules/settings/keys.ts
    - el-templo-api/src/modules/settings/service.ts
    - el-templo-api/src/modules/settings/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-admin/src/composables/usePartnersApi.ts
    - el-templo-admin/src/pages/PartnersPage.vue

key-decisions:
  - "Clasificación ISO-01 de las rutas store-urls: `global` (con motivo escrito), NO `tenant-scoped` como el precedente de pricing/*. `system_settings` es una de las 4 TENANT_EXEMPT_TABLES — config global heredada sin `tenant_id` (doc `tenant-tables.ts:173-176`). Las URLs de tienda son un valor único de instalación (una sola app El Templo en las stores), no un valor por gimnasio, así que la categoría correcta según la propia definición del manifiesto es `global`. Las entradas de pricing no se reabrieron (precedente de fase 154/156, fuera de scope de este plan)."
  - "Guard de escritura: owner-only (mismo preHandler que pricing/*), no MEMBER_LIFECYCLE_ROLES del resto del módulo partners — cargar la URL real es una decisión de instalación, no de gestión diaria de partners, y coincide con quién ejecuta el checkpoint humano del plan 179-17 (Franco, owner)."
  - "El PNG final se compone en un <canvas> nuevo (QR + texto), no se usa el patrón toCanvas de la librería qrcode directamente: se necesitaba espacio extra debajo del QR para el código y el nombre, así que el QR se genera primero como imagen (toDataURL) y se dibuja sobre el canvas compuesto."
  - "El .zip usa los Blobs capturados en la generación (canvas.toBlob), no una reconversión de los data URLs — evita el paso extra de decodificar base64 a mano en el downloadZip."
---

# Phase 179 Plan 12: URLs de tienda configurables + generador de QR de partners Summary

**Las URLs de Play/App Store pasan a vivir en `system_settings` (configurables sin deploy, owner-only) y el admin genera los 2 PNG de la tarjeta física de cada partner — QR de 1024px + código impreso — enteramente en el navegador, sin dependencias nuevas.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3
- **Files modified:** 9 (2 nuevos, 7 modificados)

## Accomplishments

- `APP_STORE_SETTINGS_KEYS` (`app.store_url.android` / `app.store_url.ios`) en `settings/keys.ts`, junto a los grupos existentes de claves de `system_settings`.
- `SettingsService.getStoreUrls`/`setStoreUrls`: lectura con fallback `null` explícito (nunca deriva la URL de Android desde el appId en silencio) + validación `https://` (`BadRequestError` en español) antes de persistir.
- `GET/PUT /api/admin/settings/store-urls`: GET legible por cualquier staff autenticado, PUT owner-only (mismo guard que el resto de las rutas de escritura del plugin de settings) — mitigación de T-179-49 (una URL mal cargada se convierte en cientos de tarjetas inútiles).
- Manifiesto ISO-01: las 2 rutas nuevas clasificadas `global` con motivo escrito (no `tenant-scoped`, a diferencia del precedente de pricing — ver Decisiones). Baseline 374→376, título del test actualizado.
- `test/referral-partners/store-urls.test.ts`: default `null`, upsert de ambas URLs (sin duplicar fila), validación `https://` con 400 y sin persistir nada, guard 403 con token no-owner.
- `usePartnersApi.ts`: `getStoreUrls()`/`updateStoreUrls()` contra `/admin/settings/store-urls`, mismo patrón loading/error/re-throw del resto del composable.
- `PartnerQrDialog.vue`: al abrir, lee las URLs de tienda; si falta alguna muestra un aviso + formulario inline de carga (superficie que usará el checkpoint humano del plan 179-17); si están completas, genera los 2 PNG (QR 1024px + código impreso + nombre del comercio) con preview, botones de descarga individual, descarga `.zip` (jszip) y el link web de registro (`?code=<CODIGO>`) con botón de copiar. Sin HMAC ni token: el contenido del QR es exactamente la URL de tienda.
- `PartnersPage.vue`: botón "QR" (ícono `qr_code`) por fila, diálogo montado una sola vez con el partner seleccionado en un `ref` (mismo patrón que `PartnerFormDialog`).
- Verificación completa en verde: `tsc --noEmit` del API, 17 archivos / 203 tests de `test/referral-partners test/settings test/tenancy` (incluye el gate ISO-01 y el resto de la batería de tenancy — no solo los archivos tocados por este plan), `vue-tsc --noEmit` (offline) y `lint` del admin sin errores nuevos, `build` del admin exitoso.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`), con hooks (sin `--no-verify`):

1. **Task 1: Claves de settings + rutas admin de URLs de tienda + manifiesto y test** - `522da820` (feat)
2. **Task 2: PartnerQrDialog.vue — 2 PNG con el código impreso, generados en el navegador** - `606ebc72` (feat)
3. **Task 3: Enganchar el diálogo de QR en la tabla de partners** - `eccb71aa` (feat)
4. **Deviation menor (docs):** actualizar el docblock de `settings/routes.ts` para reflejar el par store-urls - `4d0397ef` (docs)

_Nota: el commit de metadatos de docs (SUMMARY) lo maneja el orquestador/usuario, no este ejecutor — este SUMMARY no se commitea desde acá._

## Files Created/Modified

- `el-templo-api/src/modules/settings/keys.ts` - `APP_STORE_SETTINGS_KEYS`
- `el-templo-api/src/modules/settings/service.ts` - `getStoreUrls`/`setStoreUrls` + validación `https://`
- `el-templo-api/src/modules/settings/routes.ts` - `GET/PUT /store-urls` owner-gated
- `el-templo-api/test/tenant-manifest.ts` - 2 entradas `global` con motivo
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - baseline 374→376
- `el-templo-api/test/referral-partners/store-urls.test.ts` - 4 tests de integración
- `el-templo-admin/src/composables/usePartnersApi.ts` - `getStoreUrls`/`updateStoreUrls` + tipo `StoreUrls`
- `el-templo-admin/src/components/partners/PartnerQrDialog.vue` - generador de QR (nuevo)
- `el-templo-admin/src/pages/PartnersPage.vue` - botón QR por fila + montaje del diálogo

## Estado de las URLs de tienda

**Vacías** en este entorno (dev/worktree): `system_settings` no tiene ninguna fila `app.store_url.*` sembrada. El diálogo, al abrirse contra un partner sin URLs cargadas, muestra el aviso "Falta configurar la URL de Play Store y de App Store" con el formulario inline — comportamiento esperado y verificado por el test `a. GET sin sembrar las keys devuelve { android: null, ios: null }`. Franco carga las URLs reales en el checkpoint humano del plan 179-17 (la de iOS necesita el Apple ID numérico, que no vive en el repo).

## Nombres de archivo generados

- `qr-<CODIGO>-play.png`
- `qr-<CODIGO>-appstore.png`
- `qr-<CODIGO>.zip` (contiene los dos PNG anteriores)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para auditoría futura: la clasificación ISO-01 de las rutas nuevas es `global`, no `tenant-scoped` como el precedente de `pricing/*` — está documentada inline en `tenant-manifest.ts` con el motivo completo (system_settings es una de las 4 `TENANT_EXEMPT_TABLES`), sin reabrir ni "corregir" las entradas de pricing existentes (fuera de scope de este plan).

## Deviations from Plan

### Auto-fixed Issues (Rule 3 - scope boundary del propio plan)

**1. El grep de la acceptance criteria (`qr-token|hmac|createHmac` → 0 matches) chocó con el docblock explicativo del componente.**

- **Encontrado durante:** Task 2, verificación de `PartnerQrDialog.vue`.
- **Problema:** el docblock del componente documentaba, a propósito, por qué el QR de esta fase NO firma (contrastando con `shared/qr-token.ts`, el QR de check-in de sede). Esa mención literal de `qr-token.ts` hacía que el grep de la acceptance criteria (que busca exactamente esa cadena para blindar que nadie copió el patrón HMAC) devolviera 1 en vez de 0.
- **Fix:** se reformuló el comentario para explicar lo mismo sin la cadena literal `qr-token` (referencia genérica a "el QR de check-in de sede" en vez del nombre de archivo).
- **Archivos modificados:** `el-templo-admin/src/components/partners/PartnerQrDialog.vue`.
- **Commit:** incluido en `606ebc72` (mismo commit del Task 2, corregido antes de commitear).

### Otras desviaciones documentadas (no bugs, mejora menor)

**2. Docblock de `settings/routes.ts` desactualizado tras agregar store-urls.**

- El header del archivo seguía anunciando "pricing rules (Phase 154, ALUM-03)" únicamente después de sumar el par `GET/PUT /store-urls`. Se actualizó para nombrar ambos bloques y su modelo de acceso compartido.
- **Commit:** `4d0397ef` (docs, separado de los 3 commits de task para no mezclar una mejora de documentación con la implementación de una task).

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. El hook de provisión de la DB de test timeoutea en 120s con la config default de `vitest run` en este entorno — se resolvió (no es un bug del plan) corriendo con `MAX_TEST_WORKERS=1 --hookTimeout=400000`, tal como indica `entorno_critico` del prompt de ejecución.

## User Setup Required

**Franco debe cargar las URLs reales de tienda antes de imprimir cualquier tarjeta** — vía el formulario inline del propio `PartnerQrDialog.vue` (abrir el diálogo de QR de cualquier partner, que muestra el formulario automáticamente mientras falten). Ítem del checkpoint humano del plan 179-17. La URL de iOS requiere el Apple ID numérico de la app, que no vive en el repo.

## Next Phase Readiness

- 179-15 (campo manual en `RegisterPage.vue`) puede asumir: el link `https://app.eltemplo.org/register?code=<CODIGO>` ya se muestra en el propio diálogo de QR, listo para que la app lo consuma como query param.
- 179-17 (checkpoint humano) puede asumir: la superficie de carga de URLs ya existe y es self-service desde la ficha de cualquier partner — no hace falta una pantalla de settings aparte.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/settings/keys.ts` (modificado, `APP_STORE_SETTINGS_KEYS` presente)
- FOUND: `el-templo-api/src/modules/settings/service.ts` (modificado, `getStoreUrls`/`setStoreUrls` presentes)
- FOUND: `el-templo-api/src/modules/settings/routes.ts` (modificado, rutas `/store-urls` presentes)
- FOUND: `el-templo-api/test/tenant-manifest.ts` (modificado, 2 entradas `store-urls`)
- FOUND: `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` (modificado, baseline 376)
- FOUND: `el-templo-api/test/referral-partners/store-urls.test.ts` (nuevo, 4 tests)
- FOUND: `el-templo-admin/src/composables/usePartnersApi.ts` (modificado, `getStoreUrls`/`updateStoreUrls`)
- FOUND: `el-templo-admin/src/components/partners/PartnerQrDialog.vue` (nuevo)
- FOUND: `el-templo-admin/src/pages/PartnersPage.vue` (modificado, botón QR presente)
- FOUND: commit `522da820` (Task 1)
- FOUND: commit `606ebc72` (Task 2)
- FOUND: commit `eccb71aa` (Task 3)
- FOUND: commit `4d0397ef` (deviation docs)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `tsc --noEmit` del API en verde
- 17 archivos / 203 tests en verde (`test/referral-partners test/settings test/tenancy`)
- `vue-tsc --noEmit` (offline), `lint` y `build` del admin en verde (0 errores nuevos)
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
