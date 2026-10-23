# Phase 203: Carga sin parpadeos - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 27 (13 nuevos, 14 modificados)
**Analogs found:** 25 / 27 (2 sin analog en el repo: `log_format`/`map` de nginx y `verify-api-http.sh` solo tienen analog parcial)

Rutas de la app relativas a `el-templo-app/src/`. Líneas de `ab4342b27` (rama `feat/203-carga-sin-parpadeos`).

Restricciones transversales (CONTEXT D-17): no hay `node_modules` en el worktree. Los tests Vitest se escriben pero **no se corren** ni los corre el CI. Ningún plan puede depender de correrlos. El planner debe poner criterios de verificación por grep/lectura.

## File Classification

| Archivo nuevo/modificado | Role | Data Flow | Analog más cercano | Calidad |
|---|---|---|---|---|
| `utils/share-in-flight.ts` (nuevo) | utility | request-response (promesa compartida) | `boot/axios.ts` `runRefresh` (79-125) | exact (patrón) |
| `utils/__tests__/share-in-flight.test.ts` (nuevo) | test | request-response | `boot/__tests__/axios-refresh-lock.test.ts` + `deferred()` de `user-store-plan-state-loading.test.ts` | exact |
| `utils/load-deadline.ts` (nuevo, constante) | utility | transform | `utils/check-in-window.ts` (constantes `CHECK_IN_WINDOW_MS`, `DEFAULT_BRANCH_TZ`) | role-match |
| `composables/useLoadDeadline.ts` (nuevo) | composable (timer UI) | event-driven | `composables/useLiveClock.ts` | exact |
| `composables/__tests__/useLoadDeadline.test.ts` (nuevo) | test | event-driven | `composables/__tests__/useLiveClock.test.ts` | exact |
| `composables/useCardHadContentStorage.ts` (nuevo) | composable (storage dual-path) | file-I/O | `composables/useTipsSeenStorage.ts` | exact |
| `composables/__tests__/useCardHadContentStorage.test.ts` (nuevo) | test | file-I/O | `composables/__tests__/useTipsSeenStorage.test.ts` | exact |
| `modules/plan/utils/planes-view.ts` (nuevo) | utility (función pura de vista) | transform | `modules/progression/utils/today-card.ts` (`resolveTodayCard`) | exact |
| `modules/plan/utils/__tests__/planes-view.test.ts` (nuevo) | test | transform | `modules/progression/utils/__tests__/today-card.test.ts` | exact |
| `modules/training/utils/training-index-view.ts` + test (nuevo, opcional) | utility pura | transform | ídem `today-card.ts` | role-match |
| `modules/progression/utils/today-card.ts` (mod: entradas `*Loading`, `deadlinePassed`, kind neutral) | utility pura | transform | sí mismo (`planLoading` :469, `bookingsLoading` :495) | exact |
| `modules/progression/utils/__tests__/today-card.test.ts` (mod) | test | transform | sí mismo (`baseInput()` :27, bloque "carga" :99) | exact |
| `modules/progression/components/TodayCard.vue` (mod: posible kind neutral) | component | request-response | sí mismo (esqueleto :5-12) | exact |
| `stores/useUserStore.ts` (mod: `loadMemberState`/`ensureMemberState`, `myProgress`, `memberStateLoaded`) | store | CRUD | sí mismo (`loadSubscription` :435, `fetchProgramEnrollmentStatus` :521, `fetchCurrentProgram` :538, `planStateLoading` :251) | exact |
| `stores/__tests__/user-store-member-state.test.ts` (nuevo) | test | request-response | `stores/__tests__/user-store-plan-state-loading.test.ts` | exact |
| `stores/useNovedadesStore.ts`, `stores/useSponsorsStore.ts` (mod: agregar `loaded`) | store | CRUD (fail-open) | `useNovedadesStore.ts` :62-135 y `useAvisosStore` (`tarjetasLoaded`) | exact |
| `stores/__tests__/novedades-store.test.ts`, `sponsors-store.test.ts` (mod) | test | CRUD | sí mismos | exact |
| `stores/useTodayBookingStore.ts` (mod: tz sin perfil, recarga al llegar el perfil) | store | request-response | sí mismo (:55-70, `generation`) | exact |
| `modules/progression/stores/progressionStore.ts` (mod: `loading` arranca en true / `loadedOnce`) | store | CRUD | `pages/ProfilePage.vue` `preferencesLoading = ref(true)` | role-match |
| `modules/progression/pages/MiTemplo.vue` (mod) | page | request-response | sí mismo; esqueleto de `TodayCard.vue` | exact |
| `modules/plan/pages/PlanesPage.vue` (mod: `onMounted` :239-276, `loading` :166) | page | request-response (paralelo) | `pages/ReservasPage.vue` (`loading` cubre toda la cadena) | role-match |
| `modules/training/composables/useWeekData.ts` (mod: dejar de mandar `view`) | composable | request-response | sí mismo (:69-97) | exact |
| `modules/training/pages/TrainingIndex.vue` (mod: gate `memberStateLoaded`) | page | request-response | sí mismo | exact |
| `pages/ProfilePage.vue` (mod: `:26`, `:63-67`, `:283`) | page | request-response | sí mismo (`preferencesLoading`) | exact |
| `pages/ReservasPage.vue` (mod: `/weekly` x2 multi-sede, :2293, :2364-2371) | page | request-response | sí mismo | exact |
| `modules/training/utils/semanaCta.ts` + test (mod, `hasProgress: boolean \| null`) | utility pura | transform | sí mismo (:130) / `semanaCta.test.ts` `input()` | exact |
| `boot/axios.ts` (mod: interceptor dev `VITE_DEV_LATENCY_MS`) + `.env.example` | config/boot | request-response | `boot/axios.ts` interceptores existentes; `.env.example` | role-match |
| `deploy/nginx/api.eltemplo.org`, `deploy/nginx/api-staging.eltemplo.org` (reemplazo por config viva + `http2` + log) | config | request-response | `deploy/nginx/eltemplo.org` (:18-19 `listen 443 ssl http2`) | role-match |
| `deploy/nginx/conf.d/eltemplo-api-log.conf` (nuevo) | config | batch (log) | sin analog en repo (ver "No Analog") | none |
| `deploy/verify-api-http.sh` (nuevo) | script | request-response | `.github/workflows/deploy.yml` :437-458 (smoke) + `deploy/staging/reset-staging.sh` (estilo bash) | partial |
| `.claude/skills/el-templo-debugging-playbook/SKILL.md` Triage 5 (mod: apuntar a `api.access.log`) | doc | n/a | sí mismo :139-153 | exact |

## Pattern Assignments

### `utils/share-in-flight.ts` (utility, promesa compartida)

**Analog:** `boot/axios.ts` `runRefresh` (79-125). Generalizar el patrón `let promise | null` + `.finally(() => { promise = null })`.

**Core pattern** (`boot/axios.ts:73,79-83,121-125`):
```typescript
let refreshPromise: Promise<RefreshResult> | null = null

export function runRefresh(): Promise<RefreshResult> {
  if (refreshPromise) {
    return refreshPromise
  }
  // ...
  refreshPromise = (async (): Promise<RefreshResult> => { /* ... */ })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

// Test-only reset so a fresh test can assert lock behaviour from a clean slate.
export function __resetRefreshLock(): void { refreshPromise = null }
```
Copiar: reset en `finally` (la próxima tormenta puede volver a pedir) y un reset solo para tests si hace falta. Sin `any`.

**Test:** `boot/__tests__/axios-refresh-lock.test.ts` (mocks instalados antes del import, líneas 1-40). Para observar "en vuelo" usar `deferred()` (abajo).

---

### `composables/useLoadDeadline.ts` (composable, timer UI, D-07)

**Analog:** `composables/useLiveClock.ts` (todo el archivo). Regla del repo: `cleanup()` expuesto, sin `onUnmounted` adentro; `start()` llama a `cleanup()` primero para que no queden dos timers.

**Core pattern** (`useLiveClock.ts:15,40-53`):
```typescript
let timer: ReturnType<typeof setInterval> | null = null

function cleanup(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function start(): void {
  cleanup()
  paint()
  timer = setInterval(paint, 1000)
}

return { time, dateLabel, start, cleanup }
```
Adaptar a `setTimeout` + `passed = ref(false)`. La constante `LOAD_DEADLINE_MS` (6000 recomendado por el research) vive en `utils/load-deadline.ts`.

**Test** (`composables/__tests__/useLiveClock.test.ts`): copiar la estructura `beforeEach(vi.useFakeTimers + setSystemTime)`, `afterEach(vi.useRealTimers)`, y los casos "start() repetido no deja dos timers" (`expect(vi.getTimerCount()).toBe(1)`), "cleanup() frena" (`getTimerCount()).toBe(0)`), "cleanup() sin start() no rompe". Agregar "a N-1 ms `passed` es false, a N es true" (ver `boot/__tests__/auth.test.ts:268-271` con `BOOT_NETWORK_TIMEOUT_MS - 1` / `+1` vía `advanceTimersByTimeAsync`). Recordar la memoria: saltos relativos a `Date.now()`.

---

### `composables/useCardHadContentStorage.ts` (composable, storage dual-path, D-02)

**Analog:** `composables/useTipsSeenStorage.ts` (todo el archivo, 59 líneas). Mismo dual-path (Preferences en nativo, localStorage en web), clave por socio, best-effort con `try/catch` + `log.warn`.

**Imports + key** (`useTipsSeenStorage.ts:17-22`):
```typescript
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

const KEY_PREFIX = 'eltemplo.tipSeen:'
const log = createLogger('useTipsSeenStorage')
```
Clave nueva: `eltemplo.cardHadContent:<userId>` con un JSON `{ novedades: true, ... }` (una sola clave por socio, precargada una vez; ver research Patrón 4).

**Core pattern** (`useTipsSeenStorage.ts:24-55`):
```typescript
export function useTipsSeenStorage() {
  const isNative = Capacitor.isNativePlatform()
  const keyFor = (userId: number, tipId: string) => `${KEY_PREFIX}${userId}:${tipId}`

  async function hasSeen(userId: number, tipId: string): Promise<boolean> {
    try {
      if (isNative) {
        const { value } = await Preferences.get({ key: keyFor(userId, tipId) })
        return value === '1'
      }
      return localStorage.getItem(keyFor(userId, tipId)) === '1'
    } catch (err: unknown) {
      log.warn('hasSeen failed', { err: err instanceof Error ? err.message : String(err) })
      return false
    }
  }
  // markSeen: idéntico con Preferences.set / localStorage.setItem y catch que solo loguea
```
Cambios: parsear JSON con try/catch (JSON corrupto = `{}` y `log.warn`); el valor por defecto ante falla es "no reservar lugar" (el default seguro de D-02: último estado desconocido = sin esqueleto). Lectura **síncrona desde un ref** después de la precarga (el primer frame no puede esperar a Preferences). Escribir solo en respuesta 2xx, nunca tras error (Pitfall 6).

**Test** (`useTipsSeenStorage.test.ts:1-40`): copiar tal cual el bloque de mocks (`@capacitor/core` con `isNativePlatform: () => false`, `@capacitor/preferences`, `src/utils/logger`) y el helper `installLocalStorage()`. Casos a copiar: aislamiento por usuario (:60), storage que tira excepción no rompe (:72-87), clave subyacente exacta (:89-93). Agregar: JSON corrupto, y "no se escribe tras error".

---

### `modules/plan/utils/planes-view.ts` (+ cualquier `*-view.ts` de TrainingIndex/Perfil) (utility pura, transform)

**Analog:** `modules/progression/utils/today-card.ts`. Función pura: sin stores, sin axios, sin reloj; todo entra por `input`.

**Estilo** (`today-card.ts:1-8,100-117`): docblock con la precedencia de gates, tipos exportados, `Input` con flags `*Loading` documentados.
```typescript
/**
 * `resolveTodayCard(input)` es PURA: sin stores, sin axios, sin reloj. Todo
 * ... entra por `input`, así cada gate se prueba sin montar componentes.
 */
export interface TodayCardInput {
  /** userStore.planStateLoading: suscripción no intentada/cargando o plan-status pendiente. */
  planLoading: boolean
  /** useTodayBookingStore aún no respondió (`!loaded`) ... fail-open (tras un error también queda cargado) */
  bookingsLoading: boolean
```
El tipo `PlanesView = 'skeleton' | 'content' | 'empty' | 'error'` y la firma de `resolvePlanesView` ya están bocetados en RESEARCH.md Patrón 3. Regla: un fallo nunca se dibuja como "No hay planes".

**Test:** `today-card.test.ts` (ver abajo).

---

### `modules/progression/utils/today-card.ts` (mod) + `today-card.test.ts` (mod)

**Dónde agregar las entradas nuevas** (`profileLoading`, `weekLoading`, `programLoading`, `trialLoading`, `statsLoading`, `deadlinePassed`):

Gate de carga actual (`today-card.ts:469-470` y `:495`):
```typescript
if (!canTrain && input.planLoading) {
  return emptyModel('cargando', '', '')
}
...
if (input.bookingsLoading) return emptyModel('cargando', '', '')
```
Defaults que mienten a corregir: `input.todayRoute ?? booking.activityName` (:362), `'Elegí día, horario y sede'` (:393), `input.todayRoute ?? program.programName` (:311), `onlineLibre` cuando `program` es null (:485). El kind nuevo (`neutral`, D-18) se suma a `TodayCardKind` (:58-67). Mantener el docblock de precedencia actualizado (:9-32).

**Test** (`today-card.test.ts:27-54, 99-116`): extender `baseInput()` con las flags nuevas en `false` (el fixture ya lista todas las entradas) y copiar el formato del caso "cargando":
```typescript
const m = resolveTodayCard(baseInput({ subscription: null, planStatus: null, planLoading: true }))
expect(m.kind).toBe('cargando')
expect(m.kicker).toBe('')  // ... title '', meta/pill/progress/primary/secondary null
const copy = allCopy(m)
expect(copy).not.toContain('Arrancá tu plan')
```
`allCopy()` (:88-97) sirve para afirmar que ningún texto de "sin plan" aparece con el tope vencido. Un caso por entrada: "X cargando -> `cargando`" y "X cargando + `deadlinePassed` -> sin gate de sin plan".

---

### `modules/progression/components/TodayCard.vue` (mod) y esqueletos en general (D-01)

**Analog:** `TodayCard.vue:5-12` (única referencia de `q-skeleton` en la app). Mismo marco, mismas filas que la card final para que el slot no salte; `aria-busy` + `aria-label`.
```vue
<div v-if="model.kind === 'cargando'" class="today-card today-card--loading">
  <section class="today-card__surface" aria-busy="true" aria-label="Cargando tu día">
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--kicker" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--title" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--status" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--btn" />
  </section>
</div>
```
Para las demás cards (Novedades, Sponsors, CheckIn, WeekStrip, ProgramCta, Planes): `q-skeleton` con `dark animation="none"` y alto fijo en SCSS igual al de la card final. Los estilos `.today-card__sk--*` están en el mismo archivo (bloque `<style>`), copiarlos como referencia de alto.

---

### `stores/useUserStore.ts` (mod: dueño único de los datos del socio, SC-4)

**Analog:** el mismo archivo. Hoy: `loadSubscription` (435-458) encadena en fila y `subscriptionLoading` baja antes de my-progress/enrollments.

**Cadena en fila actual** (`useUserStore.ts:435-458`):
```typescript
async function loadSubscription() {
  subscriptionLoading.value = true
  try { /* GET /members/subscription/me/subscription ... 204 => null */ }
  catch { subscription.value = null }
  finally {
    subscriptionLoading.value = false
    subscriptionLoaded.value = true
  }
  await fetchProgramEnrollmentStatus()   // my-progress
  await fetchCurrentProgram()            // current-program + enrollments (Promise.all interno)
}
```
`fetchProgramEnrollmentStatus` (:521-530) hoy descarta el objeto (solo `hasActiveProgramEnrollment` y `enrolledGoalPlanType`): hay que guardar `myProgress`. `fetchCurrentProgram` (:538-553) ya usa `Promise.all` interno con `catch (err: unknown)` + `log.error`.

**Patrón de "cargó una vez" a copiar** (:247-252, `planStateLoading`): un refresco no devuelve a la carga.
```typescript
const planStateLoading = computed(
  () => !hasActiveSubscription.value && (!subscriptionLoaded.value || !planStatusLoaded.value),
)
```
Agregar `memberStateLoaded` con el mismo criterio y bajarlo en `clearProfile` (:358-365, ver `subscriptionLoaded.value = false`). Fail-open de `loadPlanStatus` (:419-433, `finally` con `planStatusLoaded = true`) es el modelo de manejo de errores: nunca lanza, siempre marca "cargó".

**Test:** `user-store-member-state.test.ts` copia `user-store-plan-state-loading.test.ts` (mocks :1-37, `deferred()` :18-24, `mockApi()` por sufijo de URL :27-37, `setActivePinia(createPinia())` + `mockReset()` en `beforeEach`). Casos nuevos: los 4 pedidos salen en paralelo (todos en vuelo antes de resolver el primero), llamadas simultáneas = 1 pedido por endpoint, `force: true` refresca, `clearProfile` vuelve a pedir la carga inicial (patrón :94-103).

---

### `stores/__tests__/user-store-member-state.test.ts` (test, request-response)

**Analog:** `stores/__tests__/user-store-plan-state-loading.test.ts`.

**Imports + mocks + deferred** (:1-24):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('src/boot/axios', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

import { api } from 'src/boot/axios'
import { useUserStore } from '../useUserStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
```
Rutas simuladas con `mockImplementation(async (url: string) => { if (url.endsWith('/me/subscription')) ... return { status: 204, data: null } })`. Para contar pedidos: `vi.mocked(api.get).mock.calls.filter(([u]) => u.endsWith(...)).length`.

---

### `stores/useNovedadesStore.ts` / `stores/useSponsorsStore.ts` (mod: agregar `loaded`)

**Analog:** `useNovedadesStore.ts:62-135` (idéntica estructura en sponsors, :57-113). Hoy solo tienen `loading` y `generation`.

**Core pattern** (:72-90, 128-135): `generation` descarta respuestas viejas, fail-open con `log.warn`, `finally` baja `loading`.
```typescript
async function load(): Promise<void> {
  const mine = ++generation
  loading.value = true
  try {
    const { data } = await api.get<NovedadesResponse>('/communications/me/novedades')
    if (mine !== generation) return
    novedades.value = Array.isArray(data?.novedades) ? data.novedades.map(normalize) : []
  } catch (err: unknown) {
    if (mine !== generation) return
    novedades.value = []
    log.warn('Failed to load novedades', { error: err instanceof Error ? err.message : String(err) })
  } finally {
    if (mine === generation) loading.value = false
  }
}
function reset(): void { generation++; novedades.value = []; loading.value = false; reportedSeen.clear() }
```
Agregar `loaded = ref(false)` que sube en el `finally` (si `mine === generation`) y baja en `reset()`. Distinguir "vino vacía (2xx)" de "falló" (necesario para no escribir el flag D-02 tras un error): por ejemplo `loadOk`/devolver `boolean`. `useAvisosStore` ya tiene `tarjetasLoaded` como referencia de nombre.

**Test** (`novedades-store.test.ts:1-20`): mismo bloque de mocks con `warn` hoisted. Extender con "falla -> `loaded` true y lista vacía" y "reset baja `loaded`".

---

### `stores/useTodayBookingStore.ts` (mod, D-08)

**Analog:** el mismo archivo. Problema (:65): `const tz = computed(() => useUserStore().profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)`. Mantener `generation` (:55-60) para descartar respuestas. El store se testea con el `userStoreMock` hoisted (`today-booking-store.test.ts:4-21`): para probar "sin perfil no calcula hoy" cambiar `userStoreMock.profile = null`.

---

### `modules/progression/stores/progressionStore.ts` (mod, `loading` arranca en false)

**Analog de la regla:** `pages/ProfilePage.vue` con `preferencesLoading = ref(true)` (loading arranca en true). Las acciones que hoy hacen `progressionStore.setLoading(true/false)` están en `modules/progression/composables/useProgressionApi.ts:25-46` (`fetchStats`: `loading.value = true` ... `finally` false, con `Notify.create` en el catch: **D-16 mantiene el toast**). Agregar un `statsLoaded` ("cargó una vez") en vez de reusar `loading`, porque `loading` se vuelve a prender en cada visita.

---

### `modules/plan/pages/PlanesPage.vue` (mod, D-04)

**Analog para "loading cubre toda la cadena":** `pages/ReservasPage.vue` (no parpadea). Estado actual a reemplazar:

`PlanesPage.vue:166` y `:239-276`:
```typescript
const loading = ref(false)
onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()   // 4 pedidos en fila ANTES de prender loading
  }
  loading.value = true
  try { const response = await api.get<{ plans: MemberPlan[] }>('/members/subscription/plans') ... }
  // luego getCatalog() y getMyProgress() en fila
})
```
Convención de errores de la página a conservar: `catch (err: unknown) { const message = err instanceof Error ? err.message : 'Unknown error'; log.error('Failed to load plans', { error: message }) }`. Nuevo: `Promise.allSettled([ensureMemberState(), plans, getCatalog()])`, `getMyProgress()` sale del store, y el template decide con `resolvePlanesView`.

---

### `modules/training/composables/useWeekData.ts` (mod, D-09 / Patrón 5)

**Analog:** el mismo archivo `:69-97` (matriz de `view` a eliminar). Dejar solo `weekStart` y `level`:
```typescript
const params: Record<string, string> = {}
if (weekStart) params.weekStart = weekStart
if (userStore.selectedLevel) params.level = userStore.selectedLevel
// ...(bloque if enrollmentId !== null -> params.view = 'program' ... se elimina)
const response = await api.get<WeeklyResponse>('/sessions/weekly', { params })
```
Test: `useWeekData.test.ts` (nuevo) con `vi.mock('src/boot/axios')` como en los tests de stores y afirmar que `params` no contiene `view`.

---

### `modules/training/pages/TrainingIndex.vue` y `pages/ProfilePage.vue` (mod, D-09)

**Analogs (mismos archivos):**

TrainingIndex `:4-17` (gate a cambiar de `subscriptionLoading` a `memberStateLoaded`):
```vue
<FirstVisitTipBanner v-if="!userStore.subscriptionLoading" tip-id="entrenar-bloques" />
<div v-if="userStore.subscriptionLoading" class="training-index__loading"><TemploLoader size="lg" /></div>
<EntrenarVidriera v-else-if="!canEnterTraining" />
<EntrenarView v-else />
```
ProfilePage `:26-67` (cadena `v-if subscriptionLoading` -> `v-else-if subscription` -> `v-else` "Sin suscripcion activa"): el gate pasa a `!subscriptionLoaded || subscriptionLoading` y el loader chico (`TemploLoader size="sm"`) pasa a `q-skeleton`.

---

### `pages/ReservasPage.vue` (mod, R-1)

Doble `/weekly`: `watch(selectedBranchId, () => loadGrid())` en :2293 y `selectedBranchId.value = userStore.profile?.branchId ?? null` + `loadGrid()` en :2364-2371. Fix: llamar `loadGrid()` a mano solo si el valor asignado no cambia `selectedBranchId`. Si se extrae la lógica a una función pura para testearla, ubicarla en `utils/` con test en el patrón de `utils/__tests__/slot-availability.test.ts`.

---

### `modules/training/utils/semanaCta.ts` (mod) + `semanaCta.test.ts`

**Analog:** el mismo par. `semanaCta.ts:130` `label: i.hasProgress ? 'Continuar' : 'Empezar'`; `useTrainingWeek.ts:59` `const hasProgress = ref(false)` (y tipo `Ref<boolean>` en :30). Cambiar a `boolean | null`. Test: fixture `input()` en `semanaCta.test.ts:6-20` (`hasProgress: false` por defecto) y caso "hoy sin progreso: Empezar" (:22-33) como modelo para "hasProgress null -> sin label / no pinta botón de inicio".

---

### `boot/axios.ts` (mod: interceptor de latencia solo dev) + `.env.example`

**Analog:** `boot/axios.ts:24-35` (logger `createLogger('axios')`, instancia `api`, `baseURL` desde `import.meta.env`). El snippet del interceptor está en RESEARCH.md ("Interceptor de latencia solo en dev"). Usar `log.debug`, nunca `console`.

**`.env.example`** (formato actual, 11 líneas): comentarios en inglés con prefijo `# Optional:` y variable comentada:
```
# Optional: Sentry (added in Phase 19)
# VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```
Agregar al final un bloque equivalente `# Optional (dev only): latencia artificial...` + `# VITE_DEV_LATENCY_MS=800` (regla de CLAUDE.md: toda env var nueva va al `.env.example`).

---

### `deploy/nginx/api.eltemplo.org` y `api-staging.eltemplo.org` (config)

**Analog parcial:** `deploy/nginx/eltemplo.org:18-19` ya tiene la sintaxis 1.18 buscada:
```nginx
listen 443 ssl http2;
listen [::]:443 ssl http2;
```
El archivo actual del repo de la API es una plantilla pre-certbot (solo `listen 80`, `proxy_pass http://127.0.0.1:3000`, headers `X-Frame-Options`/`X-Content-Type-Options`, proxy timeouts 60s, `proxy_buffering off`). Plan: (1) traer la config viva con SSH (OK de Franco) y commitearla **tal cual** (commit separado); (2) segundo commit con el diff mínimo: `http2` en los `listen 443`, `access_log` reemplazando `access_log off;`. Nunca `http2 on;` (no existe en 1.18). El resto de los vhosts siguen la convención de encabezado `# Location: /etc/nginx/sites-available/<nombre>`.

**Convención de comentarios de cabecera** (todos los archivos de `deploy/nginx/`): primera línea descripción, segunda `# Location: ...`, tercera `# SSL will be added by certbot --nginx`. Al traer la config viva ese encabezado se reemplaza por la realidad.

---

### `deploy/verify-api-http.sh` (script)

**Analog parcial (estilo bash):** `deploy/staging/reset-staging.sh`: `#!/bin/bash`, bloque de comentarios con uso arriba, `set -euo pipefail`, credenciales con `"${VAR:?VAR is required}"`.
```bash
set -euo pipefail
STAGING_DB_USER="${STAGING_DB_USER:?STAGING_DB_USER is required}"
```
**Analog parcial (qué se comprueba):** smoke test del deploy `.github/workflows/deploy.yml:437-458`: `curl -s -o /dev/null -w "%{http_code}" ${API_BASE}/health` y `echo "::error::..."; exit 1`. El script nuevo hereda ese criterio (`/health` 200) y agrega ALPN, h1.1 y paridad h2/h1.1 de los endpoints de Mi Templo. El esqueleto completo ya está en RESEARCH.md ("Script de verificación"); usar `VERIFY_API_EMAIL` / `VERIFY_API_PASSWORD` solo por env (D-19), logout al final, `chmod +x`.

Nota: `deploy/` no tiene otro script que use `curl`/`jq`/`openssl`; el workflow es el único precedente de curl contra la API.

---

### `.claude/skills/el-templo-debugging-playbook/SKILL.md` (mod, Triage 5)

Líneas :139-153: el comando de conteo asume el formato `combined` y `/var/log/nginx/access.log`: `grep 'POST /api/members/attendance/check-in' /var/log/nginx/access.log | awk '{print $4, $9}' | grep ' 400'`. El `log_format api_timed` debe empezar idéntico a `combined` (campos nuevos al final) para que el `awk` siga válido; actualizar solo el path a `/var/log/nginx/api.access.log`. Mantenimiento: la propia skill dice (:263) re-verificar la tabla de triage cuando cambia el registro.

---

## Shared Patterns

### Logging
**Source:** `composables/useTipsSeenStorage.ts:19,22` y `stores/useUserStore.ts` (`log.error(..., { error: err instanceof Error ? err.message : String(err) })`)
**Apply to:** todo archivo nuevo de la app.
```typescript
import { createLogger } from 'src/utils/logger'
const log = createLogger('nombreDelArchivo')
// catch (err: unknown) { log.warn('...', { err: err instanceof Error ? err.message : String(err) }) }
```
Nunca `console.*`. Sin `any`.

### Fail-open + marcar "cargó" en `finally`
**Source:** `stores/useUserStore.ts:419-433` (`loadPlanStatus`) y `:435-451` (`loadSubscription`)
**Apply to:** `loadMemberState`, `useNovedadesStore.loaded`, `useSponsorsStore.loaded`, cualquier store que alimente un esqueleto. Un fallo nunca deja un esqueleto colgado (Pitfall 4): `*Loaded = true` siempre en `finally`; el tope D-07 es la segunda red.

### "Cargó una vez" (un refresco no devuelve a la carga)
**Source:** `stores/useUserStore.ts:247-252` (`planStateLoading`) + test `user-store-plan-state-loading.test.ts:58-85`
**Apply to:** `memberStateLoaded`, `statsLoaded`, `novedades/sponsors.loaded`, `hasProgress` nullable.

### Guard contra respuestas viejas (logout a mitad de pedido)
**Source:** `useNovedadesStore.ts:72-90`, `useTodayBookingStore.ts:55-60` (`generation`)
**Apply to:** cualquier carga nueva que repueble estado de un socio (member state compartido) y su `reset()`/`clearProfile()`.

### Composables: `cleanup()` y sin `onUnmounted`
**Source:** `composables/useLiveClock.ts:40-53`; consumo con `onBeforeUnmount(() => cleanup())` en la página (`ReservasPage.vue` final del `<script>`)
**Apply to:** `useLoadDeadline`, cualquier timer o listener nuevo.

### Storage best-effort por socio
**Source:** `useTipsSeenStorage.ts`, `useLevelSelectionStorage.ts:20-30` (misma convención, clave `eltemplo.<nombre>:<userId>`)
**Apply to:** `useCardHadContentStorage` y el hint "tenía plan la última vez" (Pitfall 3, si Franco lo elige en vez de pedir plan-status/trial para todos; D-15 ya fijó "para todos").

### Estructura de tests de la app (Vitest, entorno node)
**Source:** `vitest.config.ts` (globals, alias `src`), cabeceras de `useTipsSeenStorage.test.ts`, `user-store-plan-state-loading.test.ts`, `useLiveClock.test.ts`
**Apply to:** todos los tests nuevos. Mocks de `src/utils/logger`, `src/boot/axios` (`api: { get: vi.fn(), post: vi.fn() }`) y `@capacitor/*` **antes** de importar el módulo. Pinia: `setActivePinia(createPinia())` en `beforeEach`. Timers: `vi.useFakeTimers()` / `vi.useRealTimers()`. Funciones puras: sin mocks, fixture `baseInput()`. **No se ejecutan localmente ni en CI (D-17)**: escribirlos igual y dejarlos listados como pendiente de correr.

### Esqueletos
**Source:** `TodayCard.vue:5-12` (`q-skeleton dark animation="none"`, `aria-busy`, mismo marco que la card final)
**Apply to:** todas las cards con esqueleto (D-01). Alto reservado = alto de la card final; sin textos ni acciones.

### Convenciones de repo
**Source:** `CLAUDE.md`, skill `el-templo-change-control`
**Apply to:** todos los planes: `git add` explícito (nunca `-A`), commit nuevo (no amend) si falla lint-staged, sin bump de versión, sin push sin OK, SSH y cambios de nginx con OK de Franco en el momento, env var nueva -> `.env.example`.

## No Analog Found

| Archivo | Role | Data Flow | Reason |
|---|---|---|---|
| `deploy/nginx/conf.d/eltemplo-api-log.conf` (`log_format api_timed` + `map $request_uri $api_loggable`) | config | batch (log) | Ningún archivo de `deploy/nginx/` ni `deploy/nginx.conf` define `log_format`/`map`. Usar el snippet de RESEARCH.md ("Config nginx propuesta"), con prefijo idéntico a `combined`. Confirmar en la lectura con OK dónde incluye `conf.d/` el nginx del server (`nginx -T`) |
| `deploy/verify-api-http.sh` (comprobación ALPN `openssl s_client -alpn`, paridad h2/h1.1, login con env) | script | request-response | Solo hay analog de estilo (`reset-staging.sh`) y de smoke (`deploy.yml`). No hay script previo que use `openssl`/`jq`/`curl --http2`. Seguir el esqueleto de RESEARCH.md |
| Interceptor de latencia dev (`VITE_DEV_LATENCY_MS`) | boot/config | request-response | No existe otro uso de `import.meta.env.DEV` como guard en `boot/axios.ts`; usar el snippet de RESEARCH.md con `log.debug` |

## Metadata

**Analog search scope:** `el-templo-app/src/{composables,stores,utils,boot,modules/{progression,plan,training},pages}`, `deploy/`, `deploy/nginx/`, `deploy/staging/`, `.github/workflows/deploy.yml`, `.claude/skills/el-templo-debugging-playbook/SKILL.md`, `el-templo-app/.env.example`
**Files scanned/read:** ~30
**Pattern extraction date:** 2026-10-23
