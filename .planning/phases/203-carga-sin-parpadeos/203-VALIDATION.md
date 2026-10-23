---
phase: 203
slug: carga-sin-parpadeos
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-23
---

# Phase 203 — Validation Strategy

> Contrato de validación de la fase: qué se verifica durante la ejecución y cómo.
> **Restricción D-17:** este worktree no tiene `node_modules` y no se instala nada. Los tests Vitest de la app **se escriben** pero **no se corren acá**, y el CI tampoco los corre. Lo que se verifica automáticamente en cada tarea son aserciones de código (grep/estructura), `bash -n`/shellcheck del script y el script h2 contra los servers. Los Vitest quedan como pendiente explícito: correrlos cuando haya `node_modules`.

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

- **Después de cada tarea:** las aserciones grep/estructurales de su `<acceptance_criteria>`. Si la tarea agrega lógica, debe venir con su archivo de test Vitest escrito (aunque no se corra).
- **Después de cada plan:** el orquestador revisa el worktree limpio, el diff y los tests escritos (CLAUDE.md §GSD).
- **Antes de `/gsd:verify-work`:** el script h2 verde en staging y prod (plan 1) + los Vitest de la app corridos si para entonces hay `node_modules` (si no, queda anotado) + el UAT en el teléfono con red limitada.
- **Max feedback latency:** ~10 s (script), inmediata (grep).

---

## Per-Task Verification Map

El planner lo completa con los IDs de las tareas. El mapa por success criterion (de `203-RESEARCH.md` §Validation Architecture) es este:

| Req | Behavior | Test Type | Automated Command (disponible ahora) | Test escrito (no corre, D-17) | Status |
|-----|----------|-----------|--------------------------------------|-------------------------------|--------|
| SC-5 | ALPN h2, HTTP/1.1 sigue andando, endpoints responden igual | script | `deploy/verify-api-http.sh https://api-staging.eltemplo.org` (después prod), credenciales por env | — | ⬜ |
| SC-5 | Log con protocolo y tiempos, sin la TV | manual con OK (SSH) | `tail` del log nuevo → `HTTP/2.0` (iOS) / `HTTP/1.1` (Android); `grep -c control/screen` = 0 | — | ⬜ |
| SC-4 | Sin duplicados my-progress/current-program/enrollments; los pedidos salen en paralelo | unit | grep: un solo dueño en `useUserStore` (promesa compartida); `MiTemplo.vue` no llama directo a esos endpoints | `src/stores/__tests__/user-store-member-state.test.ts` | ⬜ |
| SC-4 | Reservas multi-sede: un solo `/weekly` | unit | grep del watch/loadGrid | test de la función extraída | ⬜ |
| SC-4 | Menos de 18 pedidos al abrir con plan (~17 con D-15) | manual + log | DevTools Network en `quasar dev` + log nuevo de prod | — | ⬜ |
| SC-1 | Planes: esqueleto hasta las 3 fuentes; un error no se muestra como vacío; nunca vacío antes de tiempo | unit (pura) | grep: `loading` arranca en `true` / vista pura; `Promise.all`/`allSettled` en el montaje | `src/modules/plan/utils/__tests__/planes-view.test.ts` | ⬜ |
| SC-2 | Card de hoy `cargando` mientras falta cualquier dato; con el tope, nunca muestra estados de "sin plan" (D-18 neutral) | unit (pura) | grep en `today-card.ts` | `today-card.test.ts` (extender) | ⬜ |
| SC-2 | Flag D-02: se escribe con 2xx y nunca con error; hidrata síncrono; try/catch | unit | grep try/catch | `src/composables/__tests__/useCardHadContentStorage.test.ts` | ⬜ |
| SC-2 | Stores de novedades y sponsors marcan `loaded` aunque haya error | unit | grep | tests de los stores (extender) | ⬜ |
| SC-2/3 | Tope D-07 (fake timers): `passed` a los N ms y `cleanup()` lo corta | unit | grep `cleanup` | `src/composables/__tests__/useLoadDeadline.test.ts` | ⬜ |
| SC-2 | D-16: si falla stats, la página no se reemplaza entera y se mantiene el toast | unit/grep | grep del template de `MiTemplo.vue` | — | ⬜ |
| SC-3 | `useWeekData` nunca manda `view` | unit (mock `api.get`) | grep: `useWeekData.ts` sin `view:` | `useWeekData.test.ts` | ⬜ |
| SC-3 | TrainingIndex y Perfil no deciden antes de que esté cargado el estado del socio | unit (pura) | grep | `training-index-view.test.ts` | ⬜ |
| SC-3 | El CTA no pinta "Empezar" con `hasProgress` null | unit | grep | `semanaCta.test.ts` (extender) | ⬜ |
| SC-6 | Ninguna pantalla del inventario parpadea | manual (UAT teléfono) | `VITE_DEV_LATENCY_MS` + DevTools "Slow 4G"; teléfono con red limitada | `203-UAT.md` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `deploy/verify-api-http.sh` — SC-5
- [ ] `src/utils/share-in-flight.ts` (o equivalente) + test escrito — SC-4
- [ ] `src/composables/useLoadDeadline.ts` + test escrito — D-07
- [ ] `src/composables/useCardHadContentStorage.ts` + test escrito — D-02
- [ ] `src/modules/plan/utils/planes-view.ts` + test escrito — SC-1
- [ ] Interceptor de dev `VITE_DEV_LATENCY_MS` + `.env.example` — SC-6
- [x] ~~`pnpm install`~~ — **descartado por D-17**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Log de nginx con protocolo, sin la TV | SC-5 | Requiere SSH (gate: OK de Franco cada vez) | Con OK: `nginx -t && reload`, después `tail` del log de la API |
| Línea base de 1 o 2 días antes de tocar la app | D-14 | Hay que esperar tráfico real | Checkpoint humano después del plan 1 |
| iOS y Android funcionan igual con CapacitorHttp | SC-5 | Requiere dispositivos | Abrir la app en los dos y revisar el protocolo en el log |
| Ninguna pantalla del inventario parpadea | SC-6 | Percepción visual en red lenta | Checklist C-1…C-11 + R-1 en `203-UAT.md` |
| Correr los Vitest de la app | todos | D-17: sin `node_modules` | Cuando Franco lo autorice: `pnpm test` en `el-templo-app` |

---

## Validation Sign-Off

- [ ] Todas las tareas tienen verificación automática con grep/script o un test escrito que la respalde
- [ ] Continuidad: nunca 3 tareas seguidas sin verificación automática
- [ ] Wave 0 cubre todas las referencias que faltan
- [ ] Sin flags de watch-mode
- [ ] Latencia de feedback < 10 s
- [ ] `nyquist_compliant: true` en el frontmatter (bloqueado a nivel de ejecución por D-17: los tests escritos no se corren)

**Approval:** pending
