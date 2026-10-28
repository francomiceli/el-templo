---
phase: 203
slug: carga-sin-parpadeos
status: planned
nyquist_compliant: false
nyquist_note: "Bloqueado por D-17: los Vitest de la app se escriben pero no se corren en este worktree (sin node_modules) ni en CI. Cada tarea tiene verificación automática por grep/estructura/script; el muestreo de comportamiento queda pendiente hasta que Franco autorice node_modules (203-UAT.md §1)."
wave_0_complete: false
created: 2026-10-23
planned: 2026-10-23
---

# Phase 203 — Validation Strategy

> Contrato de validación de la fase: qué se verifica durante la ejecución y cómo.
> **Restricción D-17:** este worktree no tiene `node_modules` y no se instala nada. Los tests Vitest de la app **se escriben** pero **no se corren acá**, y el CI tampoco los corre. Lo que se verifica automáticamente en cada tarea son aserciones de código (grep/estructura), `bash -n`/shellcheck del script y el script h2 contra los servers. Los Vitest quedan como pendiente explícito: correrlos cuando haya `node_modules`.
> Por eso `nyquist_compliant` queda en `false` aunque el mapa esté completo: la verificación de comportamiento (Vitest) existe en papel pero no se ejecuta hasta levantar D-17.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 en la app (entorno `node`, `globals: true`, alias `src`). Funciones puras de vista, en el patrón de `today-card.ts`. Sin `@vue/test-utils` |
| **Config file** | `el-templo-app/vitest.config.ts` |
| **Quick run command** | `cd el-templo-app && pnpm exec vitest run <archivo>` — **NO disponible en este worktree (D-17)** |
| **Full suite command** | `cd el-templo-app && pnpm test` — **NO disponible en este worktree (D-17)** |
| **Verificación disponible** | grep/`git diff` sobre el código, `bash -n deploy/verify-api-http.sh`, `deploy/verify-api-http.sh <base>` (curl/openssl/jq, sin SSH) |
| **Estimated runtime** | script h2 ~10 s; aserciones grep < 1 s |

---

## Sampling Rate

- **Después de cada tarea:** el `<verify><automated>` de la tarea + las aserciones de su `<acceptance_criteria>`. Si la tarea agrega lógica, debe venir con su archivo de test Vitest escrito (aunque no se corra).
- **Después de cada plan:** el orquestador revisa el worktree limpio, el diff y los tests escritos (CLAUDE.md §GSD).
- **Antes de `/gsd:verify-work`:** el script h2 verde en staging y prod (plan 02) + los Vitest de la app corridos si para entonces hay `node_modules` (si no, queda anotado) + el UAT en el teléfono con red limitada (plan 17).
- **Max feedback latency:** ~10 s (script), inmediata (grep).

---

## Per-Task Verification Map

Tipos: **grep** = aserciones de código en `<automated>`; **script** = `deploy/verify-api-http.sh`; **API** = test de integración de la API (corre en CI); **vitest-escrito** = test de la app escrito, no corre (D-17); **human-only** = gate de SSH (Regla 0) o UAT, sin comando automático posible.

| Task ID | Req | Behavior | Test Type | Automated Command (disponible ahora) | Test escrito (no corre, D-17) | Status |
|---------|-----|----------|-----------|--------------------------------------|-------------------------------|--------|
| 203-01-T1 | SC-5, D-11, D-19 | Script h2/h1.1 (compara también `me/plan-summary`, GET sin efectos; nunca llama al POST `seen`); línea base pública (h2 ya activo) | script + grep | `bash -n deploy/verify-api-http.sh && deploy/verify-api-http.sh --public-only https://api-staging.eltemplo.org && deploy/verify-api-http.sh --public-only https://api.eltemplo.org` | — | ⬜ |
| 203-01-T2 | D-12 | Config viva de nginx commiteada tal cual; ruta real de cada vhost registrada (`ls -l /etc/nginx/sites-enabled/`: symlink → `sites-available` o archivo propio) | human-only (SSH lectura) + grep | `git log --format=%s -- deploy/nginx/api.eltemplo.org \| grep -q 'config viva'` (tras el OK de Franco; sin `-1`, para que un commit posterior no lo oculte) | — | ⬜ |
| 203-01-T3 | D-13, D-14 | `http2` en los listen 443 + access_log permanente sin la TV; ningún `access_log off` a nivel server en el bloque del 443 de la API | grep + awk | grep de `api_timed`/`listen 443 ssl http2;` + contador awk de `access_log off;` fuera de `location`, limitado a los `server` con `listen ... 443` (no cuenta el bloque del 80 de certbot) = 0 | — | ⬜ |
| 203-02-T1 | SC-5, D-11 | Staging con h2 explícito y log nuevo, instalado en la ruta real que registró 203-01 | human-only (SSH) + script | `deploy/verify-api-http.sh --public-only https://api-staging.eltemplo.org && deploy/verify-api-http.sh https://api-staging.eltemplo.org` (después del reload, `VERIFY_API_EMAIL` por env). El script solo prueba paridad (h2 ya estaba activo); la señal de "aplicado" es `sudo grep -c 'proto=' /var/log/nginx/api-staging.access.log` >= 1 (con OK de SSH) | — | ⬜ |
| 203-02-T2 | SC-5, D-11 | Prod con h2 explícito y log nuevo, instalado en la ruta real que registró 203-01 | human-only (SSH) + script | `deploy/verify-api-http.sh --public-only https://api.eltemplo.org && deploy/verify-api-http.sh https://api.eltemplo.org`; señal de "aplicado": `sudo grep -c 'proto=' /var/log/nginx/api.access.log` >= 1 (con OK de SSH) | — | ⬜ |
| 203-02-T3 | D-13 | Triage 5 del playbook lee `api.access.log` | grep | `grep -q '/var/log/nginx/api.access.log' .claude/skills/el-templo-debugging-playbook/SKILL.md` | — | ⬜ |
| 203-03-T1 | D-14 | 1-2 días de tráfico y agregados del log | human-only (espera + SSH lectura) | N/A (gate SSH + tráfico real) | — | ⬜ |
| 203-03-T2 | SC-4, SC-5 | `203-BASELINE.md` sin IPs ni emails; base de arranque en frío con plan activo = 19 (18 + plan-status de MainLayout), meta < 18 | grep | `test -f 203-BASELINE.md && grep -q 'Cómo repetir la medición' 203-BASELINE.md` | — | ⬜ |
| 203-04-T1 | SC-4 | `shareInFlight`: promesa compartida, reset, vigencia máxima opcional (`maxInFlightMs`) y `waitInFlight` (una promesa colgada deja de compartirse; la vieja no suelta a la nueva) | grep | `grep -q 'export function shareInFlight' ...` + `maxInFlightMs`/`waitInFlight` + >= 9 casos con `useFakeTimers` | `src/utils/__tests__/share-in-flight.test.ts` | ⬜ |
| 203-04-T2 | SC-4, D-06, D-07, D-15 | Un dueño (`useUserStore`), 6 pedidos en paralelo; `force` y `loadSubscription()` esperan la carga en vuelo y encadenan una carga COMPLETA fresca; banderas de falla `planStatusFailed`/`myProgressFailed`/`currentProgramFailed`/`programFailed` + `subscriptionFailed`; un refresco fallido conserva el dato previo; `forceFullLoad` sin carga en vuelo arranca en el mismo tick (W2); carga colgada vence a los `MEMBER_LOAD_MAX_IN_FLIGHT_MS` y la vieja no pisa a la nueva (`memberLoadSeq`, W4); logout descarta; boot usa `ensureMemberState`; "Tu plan": plan-status dentro de `loadMemberState`, el refresh con plan activo NO lo recarga (test), y una respuesta tardía de plan-status no reabre la pelotita tras `clearPlanUpdateUnseen` (`planUpdateClearSeq`, test en `user-store-plan-unseen.test.ts`) | grep | grep de `ensureMemberState`/`forceFullLoad`/`if (!memberLoad.isInFlight()) return memberLoad.run(`/`return ensureMemberState({ force: true })`/`programFailed = computed`/`planStatusFailed`/`MEMBER_LOAD_MAX_IN_FLIGHT_MS`/`memberLoadSeq`/`memberGeneration`/`Promise.allSettled` + `ensureMemberState: vi.fn` en `auth.test.ts` + >= 18 casos en el test | `src/stores/__tests__/user-store-member-state.test.ts` (incluye "conserva", "programFailed", "planStatusFailed", "loadSubscription con refresh en vuelo", "mismo tick", "colgada", "tarde"), `user-store-plan-state-loading.test.ts` (ajustado), `src/boot/__tests__/auth.test.ts` (ajustado) | ⬜ |
| 203-05-T1 | SC-4, D-15 | `my-bookings?weeks=2` (incluye el domingo de la semana 1: superset inocuo); `weeks=3` → 400 | API + grep | grep de schema/route/service | `el-templo-api/test/scheduling/my-bookings-weeks.test.ts` (corre en CI) | ⬜ |
| 203-05-T2 | SC-4, D-07, D-08 | Turnos de hoy en un pedido + `loadedTz` + `loadFailed` (falla = "no sé"; refresco fallido conserva los turnos) | grep | grep de `weeks: 2`, `loadedTz` y `const loadFailed = ref(false)` en el store; `loadFailed` >= 4 en el test | `src/stores/__tests__/today-booking-store.test.ts` | ⬜ |
| 203-06-T1 | SC-4 | Reservas multi-sede: helper `needsExplicitGridLoad` | grep | grep del helper | `src/utils/__tests__/reservas-initial-load.test.ts` | ⬜ |
| 203-06-T2 | SC-4, SC-3, D-15 | Un solo `/weekly` al abrir Reservas; socio sin plan no virtual: trial-eligibility reusado del store tras `loadSubscription` (o anotado por qué no) | grep | grep del uso del helper y de `trialFromStore` en `ReservasPage.vue` (o la nota en el SUMMARY) | — (cubierto por el test del helper y el de `loadSubscription` del plan 04) | ⬜ |
| 203-07-T1 | D-07, D-01, D-02 | Tope 6 s con `cleanup()`; tabla cerrada de `resolveSlot` (settled + `hasContent` undefined → `hidden`) | grep | grep de `LOAD_DEADLINE_MS`, `resolveSlot`, >= 10 casos | `src/composables/__tests__/useLoadDeadline.test.ts`, `src/utils/__tests__/load-slot.test.ts` | ⬜ |
| 203-07-T2 | D-02, D-03 | Flag "tuvo contenido" síncrono; `map` de solo lectura; `hydrate` en los 3 caminos del boot | grep | `useCardHadContentStore().hydrate(` >= 3 en `boot/auth.ts`; mock y aserciones en `auth.test.ts` | `src/composables/__tests__/useCardHadContentStorage.test.ts`, `src/stores/__tests__/card-had-content-store.test.ts`, `src/boot/__tests__/auth.test.ts` (ajustado) | ⬜ |
| 203-07-T3 | D-01 | `CardSkeleton.vue` con alto fijo | grep | grep de `q-skeleton`/`aria-busy` | — (componente sin lógica) | ⬜ |
| 203-08-T1 | SC-1, D-04, D-07 | Planes (sobre "Tu plan"): vista pura con resumen/planes/catálogo en paralelo, error ≠ vacío, Tu plan en esqueleto sin perfil (D-08), regulares esperan al resumen (pill); falla de my-progress sin inscripción conocida → `enrollment: 'unknown'` (nunca "no inscripto") | grep | grep de `resolvePlanesView`, `myProgressFailed: boolean`, `'unknown'` + >= 16 casos | `src/modules/plan/utils/__tests__/planes-view.test.ts` | ⬜ |
| 203-08-T2 | SC-1, D-07 | Planes con `plan-summary`, planes y catálogo en paralelo, flags sin `ref(false)` inicial, `today` computed por perfil, my-progress del store; con `enrollment: 'unknown'` no se muestra "Ya estás inscripto" ni "Mas info" | grep | grep de `Promise.allSettled`/esqueletos, `myProgressFailed: userStore.myProgressFailed` y `view.enrollment === 'known'` en `PlanesPage.vue` | — (cableado) | ⬜ |
| 203-09-T1 | SC-3, D-09 | `useWeekData` nunca manda `view` | grep | `! grep -nE "params\.view\|view: '" useWeekData.ts` | `src/modules/training/composables/__tests__/useWeekData.test.ts` | ⬜ |
| 203-09-T2 | SC-3, D-09 | Default del server sin `view` fijado; API sin cambios | API + grep | grep R8 8-10 + `git diff --quiet "$B^" -- src` con `B` = primer commit `(203-09):` | `el-templo-api/test/sessions/sessions-gating.test.ts` (corre en CI) | ⬜ |
| 203-10-T1 | SC-2, D-05, D-07, D-08, D-18 | Card de hoy `cargando` hasta tener todo; `neutral` con el tope; fallas (`planFailed`, `bookingsFailed`, `programFailed`, `statsFailed`) sin dato previo = "no sé": salen del esqueleto AL INSTANTE a neutral / lo que se sabe (D-07 "falla O tarda"; el tope es solo para lo que tarda); sin perfil, `cargando` aun con el tope (D-08 manda); la espera por turnos (`waitingBookings`) solo sin `booking` ni `todayCompleted` (W1: los casos existentes `:163-165` y `:177-180` siguen verdes); `planFailed` incluye plan-status caído (W3) | grep | grep de las 10 entradas nuevas de `resolveTodayCard` + `const waiting` sin `*Failed` + `const waitingBookings` + caso "plan-status caído" + casos `*Failed: true` con `deadlinePassed: false` → 'neutral' y "sin perfil con tope" en el test | `src/modules/progression/utils/__tests__/today-card.test.ts` (extendido, >= 22 casos nuevos) | ⬜ |
| 203-10-T2 | D-18 | `TodayCard.vue` pinta `neutral` | grep | grep de `'neutral'` en `TodayCard.vue` | — (presentación) | ⬜ |
| 203-11-T1 | SC-2, SC-4, D-06, D-07, D-08 | Mi Templo en paralelo, sin duplicados; `/weekly` deduplicado por clave; `requestWeeks({ force: true })` encadena tras el en vuelo (misma semántica que `ensureMemberState({ force: true })`); la card recibe las 4 banderas de falla | grep | grep de `ensureMemberState`, `requestWeeks`, `startOrShareWeeks`, `weeksInFlight`, `deadlinePassed`, `bookingsFailed: todayBookingStore.loadFailed`, `programFailed: userStore.programFailed`, `statsFailed:`, `planFailed: userStore.planStatus === null && (userStore.subscriptionFailed \|\| userStore.planStatusFailed)` (W3) | — (cableado de lógica ya testeada) | ⬜ |
| 203-11-T2 | D-08 | Saludo con esqueleto sin perfil, sin tope (D-08 manda); turnos con la zona real; `loadPlanStatus()` suelto del layout reemplazado por `ensureMemberState()` | grep | grep de `profileReady`, `loadedTz !== tz`, `void userStore.ensureMemberState()` y `loadPlanStatus` = 0 en `MainLayout.vue`; `useLoadDeadline\|deadline` = 0 en `MainLayout.vue` | — (cableado) | ⬜ |
| 203-12-T1 | SC-2, D-02 | Stores de novedades/sponsors/tarjetas marcan `loaded` aunque haya error | grep | grep de `lastLoadOk`/`tarjetasSettled` | `src/stores/__tests__/novedades-store.test.ts`, `sponsors-store.test.ts`, `avisos-store.test.ts` | ⬜ |
| 203-12-T2 | SC-2, D-07, D-16 | `statsLoaded`/`statsFailed`/`checkInSettled`; refresco fallido conserva las stats; toast de stats intacto; los 2 `TODO(203-12)` reemplazados | grep | grep de `statsLoaded`, `statsFailed = computed`, `statsFailed: progressionStore.statsFailed` + `Notify.create` sin cambios + `TODO(203-12)` = 0 | `src/modules/progression/stores/__tests__/progression-store-loaded.test.ts` | ⬜ |
| 203-13-T1 | SC-2, D-02, D-07 | Slots de Mi Templo; "Para vos" = `deadlinePassed ? 'content' : resolveSlot(always, hasContent: true)`; nunca registrar tras error | grep | grep de `resolveMiTemploSlots`, `deadlinePassed ? 'content'`, >= 16 casos | `src/modules/progression/utils/__tests__/mi-templo-slots.test.ts` | ⬜ |
| 203-13-T2 | SC-2, D-16 | Mi Templo sin loader/error de página; esqueletos | grep | `! grep -q 'Cargando tu progreso' MiTemplo.vue` + conteo de `CardSkeleton` | — (cableado) | ⬜ |
| 203-13-T3 | D-07 | `WeekStrip` no afirma "0 sesiones" sin stats | grep | grep de `totalSessions: number \| null` | — (presentación) | ⬜ |
| 203-14-T1 | SC-3, D-07, D-08 | TrainingIndex y Perfil no deciden antes de tener el estado del socio; `programFailed` se trata como `subscriptionFailed` (Entrenar al instante, sin esperar el tope, nunca la vidriera); Perfil con falla → 'unknown' al instante; sin perfil, 'loading' aun con el tope (D-08 manda) | grep | grep de las funciones puras + `programFailed: boolean` + casos `programFailed: true` y "sin perfil con tope" en el test | `src/modules/training/utils/__tests__/training-index-view.test.ts` (>= 9), `src/utils/__tests__/profile-subscription-view.test.ts` (>= 6) | ⬜ |
| 203-14-T2 | SC-3 | Las páginas usan las vistas y el tope; Perfil: fila link "Tu plan" con esqueleto/"No pudimos cargar tu plan"/"Sin plan activo" y encabezado/Sede en esqueleto sin perfil | grep | grep del uso en `TrainingIndex.vue`/`ProfilePage.vue` + `programFailed: userStore.programFailed` | — (cableado) | ⬜ |
| 203-15-T1 | SC-3, D-09 | CTA no pinta "Empezar" con `hasProgress` null | grep | grep de `hasProgress` nullable | `src/modules/training/utils/__tests__/semanaCta.test.ts` (extendido) | ⬜ |
| 203-15-T2 | SC-3 | `useTrainingWeek`/`SemanaTab`/`SemanaHero` propagan el null | grep | grep en los 3 archivos | — (cableado) | ⬜ |
| 203-16-T1 | SC-6 | Latencia artificial solo en dev + contador de pedidos | grep | grep de `VITE_DEV_LATENCY_MS` guardado por `import.meta.env.DEV` | `src/utils/__tests__/dev-latency.test.ts` | ⬜ |
| 203-16-T2 | SC-6 | `.env.example` y skill documentan la variable | grep | `grep -q VITE_DEV_LATENCY_MS el-templo-app/.env.example` | — | ⬜ |
| 203-17-T1 | SC-1..6 | Checklist UAT completo (C-1…C-16 + R-1, con C-12…C-16 de "Tu plan": renovación con "Nuevo", hueco, sin plan, pelotita y su carrera; base de pedidos 19, pendientes D-17 con la lista completa de tests, incluido `boot/__tests__/auth.test.ts`; casos con pedido bloqueado en C-2/C-3/C-8: neutral/Entrenar apenas falla, sin esperar el tope) | grep | loop de grep de C-1…C-16, R-1, `vue-tsc`, `menos de 18`, `proto=HTTP/2.0`, `boot/__tests__/auth.test.ts`, `Reservá tu clase`, `D-08 manda` | — | ⬜ |
| 203-17-T2 | SC-6, D-18 | Ninguna pantalla parpadea en el teléfono con red limitada | human-only (UAT) + grep | post-resume: `grep -cE '\|[[:space:]]*(OK\|Falla)[[:space:]]*\|' 203-UAT.md` >= 17 | `203-UAT.md` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Continuidad: nunca hay 3 tareas seguidas sin verificación automática; las únicas sin comando automático propio (203-03-T1) están rodeadas de tareas con grep/script. Las tareas human-only (01-T2, 02-T1, 02-T2, 03-T1, 17-T2) lo son por gate de SSH (Regla 0 del playbook) o de UAT, no por falta de un test por escribir.

### Mapa por success criterion

| Req | Tareas que lo cubren |
|-----|----------------------|
| SC-1 | 203-08-T1, 203-08-T2, 203-17-T2 |
| SC-2 | 203-07-T1, 203-07-T2, 203-10-T1, 203-10-T2, 203-11-T1, 203-11-T2, 203-12-T1, 203-12-T2, 203-13-T1, 203-13-T2, 203-13-T3 |
| SC-3 | 203-09-T1, 203-09-T2, 203-14-T1, 203-14-T2, 203-15-T1, 203-15-T2 |
| SC-4 | 203-03-T2, 203-04-T1, 203-04-T2, 203-05-T1, 203-05-T2, 203-06-T1, 203-06-T2, 203-11-T1 |
| SC-5 | 203-01-T1, 203-01-T3, 203-02-T1, 203-02-T2, 203-03-T2 |
| SC-6 | 203-16-T1, 203-16-T2, 203-17-T1, 203-17-T2 |

---

## Wave 0 Requirements

- [ ] `deploy/verify-api-http.sh` — SC-5 (203-01-T1)
- [ ] `src/utils/share-in-flight.ts` + test escrito — SC-4 (203-04-T1)
- [ ] `src/composables/useLoadDeadline.ts` + test escrito — D-07 (203-07-T1)
- [ ] `src/composables/useCardHadContentStorage.ts` + test escrito — D-02 (203-07-T2)
- [ ] `src/modules/plan/utils/planes-view.ts` + test escrito — SC-1 (203-08-T1)
- [ ] Interceptor de dev `VITE_DEV_LATENCY_MS` + `.env.example` — SC-6 (203-16-T1, 203-16-T2)
- [x] ~~`pnpm install`~~ — **descartado por D-17**

---

## Manual-Only Verifications

| Behavior | Requirement | Task | Why Manual | Test Instructions |
|----------|-------------|------|------------|-------------------|
| Leer la config viva de nginx | D-12 | 203-01-T2 | Requiere SSH (gate: OK de Franco cada vez) | Comando de solo lectura con `<SERVER_HOST>`/`<KEY>` del playbook |
| Log de nginx con protocolo, sin la TV | SC-5 | 203-02-T1, 203-02-T2 | Requiere SSH (gate: OK de Franco cada vez) | Con OK: instalar en la ruta real de 203-01 (`ls -l /etc/nginx/sites-enabled/`), `nginx -t && reload`, después `grep -c 'proto='` y `tail` del log de la API. `proto=` >= 1 es la ÚNICA señal de "aplicado": el script local (`<automated>`) solo prueba paridad h2/h1.1 y pasaba antes del cambio |
| Línea base de 1 o 2 días antes de tocar la app | D-14 | 203-03-T1 | Hay que esperar tráfico real + SSH | Checkpoint humano después del plan 02 |
| iOS y Android funcionan igual con CapacitorHttp | SC-5 | 203-17-T2 | Requiere dispositivos | Abrir la app en los dos y revisar el protocolo en el log |
| Ninguna pantalla del inventario parpadea | SC-6 | 203-17-T2 | Percepción visual en red lenta | Checklist C-1…C-16 + R-1 en `203-UAT.md` |
| Correr los Vitest de la app | todos | 203-17-T2 (§1 del UAT) | D-17: sin `node_modules` | Cuando Franco lo autorice: `pnpm test` en `el-templo-app` |

---

## Validation Sign-Off

- [x] Todas las tareas tienen verificación automática con grep/script o un test escrito que la respalde (las human-only están justificadas por gate de SSH/UAT)
- [x] Continuidad: nunca 3 tareas seguidas sin verificación automática
- [x] Wave 0 cubre todas las referencias que faltan
- [x] Sin flags de watch-mode
- [x] Latencia de feedback < 10 s
- [ ] `nyquist_compliant: true` en el frontmatter — **bloqueado por D-17**: los tests escritos no se corren; se puede marcar recién cuando corran los Vitest de la app

**Approval:** planned (pendiente de ejecución)
