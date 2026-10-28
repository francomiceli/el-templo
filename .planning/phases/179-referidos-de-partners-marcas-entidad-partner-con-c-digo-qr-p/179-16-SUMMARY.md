---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 16
subsystem: app
tags: [vue3, quasar, scheduling, referral-partners, app, free-week]

# Dependency graph
requires:
  - phase: 179-08
    provides: "GET /members/scheduling/partner-benefit y POST /members/scheduling/reserve-partner-week — shape congelado (unión eligible/reason, body/respuesta del reserve)"
  - phase: 179-15
    provides: "Campo de código en el registro (no consumido directamente por este plan, pero comparte el flujo de partner benefit del socio)"
provides:
  - "useSchedulingApi(): getPartnerBenefit() / reservePartnerWeek(), tipos PartnerBenefitEligibility / PartnerWeekActivation"
  - "ReservasPage.vue: cuarto estado de la grilla (beneficio de partner pendiente) + estado de beneficio vencido, activación de la semana desde la primera reserva"
  - "el-templo-app versionado 1.8.0 (package.json + version.txt + proyectos nativos), listo para el checkpoint de build de tiendas 179-17"
affects: [179-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El estado 'beneficio de partner pendiente' reusa trialBranchId como selector de sede y el mismo mecanismo weekStart/selectedDay/morningSlots/afternoonSlots que trial y la grilla normal (estos refs son globales, no exclusivos de trial) — seguro bajo la garantía backend D-18 de exclusión mutua entre trial y partner pendiente/consumido"
    - "getPartnerBenefit() se carga en Promise.all junto con getTrialEligibility() en el mismo punto de onMounted, en vez de secuencial, porque ambos son de sólo lectura y mutuamente excluyentes (D-18)"
    - "Tras activar la semana (POST 201), se recarga beneficio + userStore.loadSubscription() + loadGrid() en vez de navegar a un estado de confirmación propio: la fuente de verdad es el server y canAccessGrid pasa a true solo, cayendo la página a la grilla normal (a diferencia del trial, que sí tiene un estado de confirmación dedicado porque el socio de trial NO pasa a tener un plan real)"
key-files:
  created: []
  modified:
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/package.json
    - el-templo-app/version.txt
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj

key-decisions:
  - "El diff sobre el flujo de trial existente (Fase 119) se limitó a 4 puntos de coordinación de cadena: el import del tipo, el ternario de branchId en loadGrid(), el guard del watch(trialBranchId) y el Promise.all en onMounted — ningún banner, computed ni handler de trial fue tocado, cumpliendo la restricción explícita del plan"
  - 'reason:''consumido'' y reason:''con_plan_activo'' NO tienen rama propia en el v-else-if: al no activar partnerBenefitEligible ni partnerBenefitExpired, la cadena cae naturalmente en el estado bloqueado o en la grilla normal según corresponda — sin código nuevo, tal como pedía el plan ("la pantalla se comporta como hoy")'
  - "package.json (1.7.1) y version.txt (1.7.6) estaban desincronizados en origin/master (deuda previa, no de esta fase). Se bumpeó cada archivo como minor sobre su propio valor (sin 'arreglar' la divergencia por decisión propia) y por coincidencia ambos aterrizan en 1.8.0 — ver Deviations"

requirements-completed: [D-05, D-06, D-07, D-19]

# Metrics
duration: ~70min
completed: 2026-08-23
---

# Phase 179 Plan 16: Semana gratis de partner — flujo del socio en la app Summary

**`ReservasPage.vue` suma un cuarto estado de grilla ("Tu semana de regalo") para el beneficiario de un partner con beneficio pendiente, activa la semana de 3 clases en la primera reserva vía `POST /reserve-partner-week`, muestra un mensaje sin reserva cuando el beneficio venció (D-07), y la app queda versionada en 1.8.0 (feature = minor) para el checkpoint de build de tiendas.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 6 (2 de código: `useSchedulingApi.ts`, `ReservasPage.vue`; 4 de versión: `package.json`, `version.txt`, `build.gradle`, `project.pbxproj`)

## Accomplishments

- `useSchedulingApi.ts`: `getPartnerBenefit()` (GET `/members/scheduling/partner-benefit`) y `reservePartnerWeek(input)` (POST `/members/scheduling/reserve-partner-week`), calcadas en forma de `getTrialEligibility`/`reserveTrial`. `PartnerBenefitEligibility` es una unión discriminada que espeja 1:1 el shape congelado por 179-08 (`reason: 'sin_beneficio' | 'expirado' | 'consumido' | 'con_plan_activo'`), y `PartnerWeekActivation` tipa la respuesta 201.
- `ReservasPage.vue`: `partnerBenefit` (ref), `partnerBenefitEligible` / `partnerBenefitExpired` / `isPartnerWeekMode` (computeds), cargado junto a `trialEligibility` en un único `Promise.all` dentro de `onMounted`.
  - **Estado 4a (pendiente):** banner "Tu semana de regalo" con nombre del partner y fecha de vencimiento, reusando la clase `.trial-banner`; selector de sede + day-strip + lista de slots idéntica en estructura a la del modo prueba, con `onPartnerSlotTap` → diálogo de confirmación → `confirmPartnerReserve` → `reservePartnerWeek`.
  - **Estado 4b (vencido, D-07):** mensaje explicando el vencimiento + CTA "Ver planes" (reusa `openWhatsApp`), sin grilla ni reserva.
  - `reason: 'consumido'` / `'con_plan_activo'`: sin rama nueva — la cadena de `v-else-if` cae en el estado bloqueado o la grilla normal según `canAccessGrid`, sin cambios de código adicionales.
  - Éxito de la reserva: notify "¡Listo! Tu semana arrancó hoy y tenés 3 clases para usar hasta el {fecha}." (o variante sin fecha si `endDate` es `null`), luego recarga `partnerBenefit` + `userStore.loadSubscription()` + `loadGrid()` — la fuente de verdad es el server, y una vez que `canAccessGrid` pasa a `true` la página cae sola a la grilla normal con la reserva recién creada visible.
  - Error 409: recarga `partnerBenefit` y muestra el mensaje que devuelve la API (`extractError`). Otros errores: notify genérico + `log.error`.
  - Flujo de trial (Fase 119) verificado sin regresión: los computeds/handlers de trial no fueron tocados; el diff se limitó a 4 puntos de coordinación de la cadena (ver `key-decisions`).
- Versión de `el-templo-app` bumpeada de `1.7.1`/`1.7.6` (desincronizados) a `1.8.0` en ambos archivos + proyectos nativos vía `bump-version.sh`.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: Llamadas de beneficio de partner en useSchedulingApi.ts** - `8ed82bb3` (feat)
2. **Task 2: Cuarto estado de la grilla en ReservasPage.vue** - `93cea9e0` (feat)
3. **Task 3: Bump de versión de la app (feature = minor)** - `4d4bd91b` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-app/src/composables/useSchedulingApi.ts` - `getPartnerBenefit`, `reservePartnerWeek`, `PartnerBenefitEligibility`, `PartnerWeekActivation`
- `el-templo-app/src/pages/ReservasPage.vue` - estados 4a/4b de la grilla, `onPartnerSlotTap`, `confirmPartnerReserve`, `loadPartnerBenefit`, `partnerDialog`, `formatDateLabel`, coordinación de la cadena de estados
- `el-templo-app/package.json` - `1.7.1` → `1.8.0`
- `el-templo-app/version.txt` - `1.7.6` → `1.8.0`
- `el-templo-app/src-capacitor/android/app/build.gradle` - `versionName` fallback `1.7.6` → `1.8.0` (vía `bump-version.sh`)
- `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj` - `MARKETING_VERSION` `1.7.6` → `1.8.0` (vía `bump-version.sh`, 2 ocurrencias: Debug/Release)

## Versiones previas y nuevas (para el checkpoint 179-17)

| Archivo                                                            | Antes   | Después |
| ------------------------------------------------------------------ | ------- | ------- |
| `el-templo-app/package.json`                                       | `1.7.1` | `1.8.0` |
| `el-templo-app/version.txt`                                        | `1.7.6` | `1.8.0` |
| `src-capacitor/android/app/build.gradle` (`VERSION_NAME` fallback) | `1.7.6` | `1.8.0` |
| `src-capacitor/ios/.../project.pbxproj` (`MARKETING_VERSION`, ×2)  | `1.7.6` | `1.8.0` |

`package.json` y `version.txt` venían desincronizados en `origin/master` (deuda preexistente, no introducida por esta fase). Al bumpear cada archivo como minor sobre su propio valor —sin intentar "arreglar" la divergencia por decisión propia, tal como pedía el plan— ambos coinciden en `1.8.0` como efecto colateral de aplicar la misma lógica de bump de forma independiente. Franco decide en el checkpoint 179-17 si esa convergencia es la deseada.

## Decisions Made

Ver `key-decisions` en el frontmatter.

## Deviations from Plan

### Ajustes no listados explícitamente en `files_modified` del plan (documentados, no bugs)

**1. Proyectos nativos tocados por `bump-version.sh`**

El frontmatter del plan lista solo `package.json` y `version.txt` en `files_modified`, pero la Task 3 instruye explícitamente usar `bump-version.sh`, cuyo propósito documentado es propagar la versión a `android/app/build.gradle` y `ios/App/App.xcodeproj/project.pbxproj`. Se corrieron ambos cambios como consecuencia directa y esperada de ejecutar el script pedido por el plan — no builds nativos, no se tocaron workflows, no se pusheó.

- **Files modified:** `el-templo-app/src-capacitor/android/app/build.gradle`, `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj`
- **Commit:** `4d4bd91b`

**2. Helper `formatDateLabel` nuevo en vez de reusar el patrón inline repetido**

El archivo repite el patrón `new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MONTH_ABBREV[...]}``en varios call sites de trial/normal (sin extraer). Para el código nuevo de este plan se extrajo`formatDateLabel()`(mismo idioma que el`formatBonusPeriodEnd` preexistente) en vez de repetir el patrón una vez más, priorizando DRY dentro del código agregado sin tocar los call sites existentes de trial (fuera de alcance por la restricción de no modificar los bloques de trial).

- **Files modified:** `el-templo-app/src/pages/ReservasPage.vue`
- **Commit:** `93cea9e0`

No hubo auto-fixes de Rule 1/2/3 — ambos plan verify commands (`vue-tsc`/`lint`/`vitest`) pasaron sin iteración adicional más allá de lo documentado arriba.

## Issues Encountered

**Ruido pre-existente y fuera de alcance (no bloqueante, ya documentado por 179-15):**

- `vue-tsc --noEmit` offline reporta los mismos ~20 errores pre-existentes en archivos no tocados por este plan (`src/boot/*.ts`, `ProfilePage.vue`, `router/index.ts`, etc. — `ImportMeta.env`/`#q-app/wrappers` no resueltos sin `.quasar/` generado). Diff verificado línea por línea contra el baseline (`diff` de la corrida antes/después de las Tasks 1-3): **idéntico**, cero errores nuevos.
- `pnpm exec vitest run --no-watch` reporta los mismos 2 tests rojos pre-existentes de `test/level-display.test.ts` (fase 99, `TRAINING_LEVELS` con 6 entradas vs 5 esperadas por el test) — sin relación con este plan. El resto de la suite (96 tests, 10 archivos) pasa en verde.

Ninguno de los dos bloquea el plan ni requiere fix bajo la regla de scope boundary del ejecutor.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- El flujo de la semana gratis del socio queda completo de punta a punta: tarjeta física (fuera de esta fase) → campo de código (179-15) → beneficio pendiente resuelto server-side (179-04/179-08) → grilla + activación + confirmación en la app (este plan).
- `el-templo-app` queda en `1.8.0`, listo para el checkpoint humano 179-17 (build de tiendas), donde Franco debe confirmar la convergencia de versión documentada arriba antes de generar los binarios.
- El estado "beneficio vencido" (D-07) usa el mismo criterio de lectura que el reporte "beneficios de partner sin conversión" (`benefit_status='pending' AND benefit_expires_at < NOW()`, documentado por 179-08) — sin trabajo adicional necesario para que ambos coincidan.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-app/src/composables/useSchedulingApi.ts` (getPartnerBenefit, reservePartnerWeek)
- FOUND: `el-templo-app/src/pages/ReservasPage.vue` (estados 4a/4b, "partner" ×36 ocurrencias)
- FOUND: `el-templo-app/package.json` (version 1.8.0)
- FOUND: `el-templo-app/version.txt` (1.8.0)
- FOUND: commit `8ed82bb3` (Task 1)
- FOUND: commit `93cea9e0` (Task 2)
- FOUND: commit `4d4bd91b` (Task 3)
- `vue-tsc --noEmit` offline: 0 errores nuevos (diff idéntico al baseline pre-existente)
- `pnpm lint`: 0 errores (2 warnings pre-existentes ajenos)
- `pnpm exec vitest run --no-watch`: 96/98 verde (2 fallos pre-existentes ajenos, `test/level-display.test.ts`)
- `pnpm build`: Build succeeded (SPA, `dist/spa`)
- `git -C /home/franco/projects/et-179 status --porcelain`: limpio
- `.planning/STATE.md` y `.planning/ROADMAP.md`: sin tocar
