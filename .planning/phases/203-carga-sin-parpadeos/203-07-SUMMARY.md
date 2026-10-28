---
phase: 203-carga-sin-parpadeos
plan: 07
subsystem: app-shared-load-rules
status: complete
completed: 2026-10-28
requirements: [D-01, D-02, D-03, D-07, D-17]
commits: [0d2979ed0, e99f668d4, 2142a67d1, 4a2f6c18f]
key-files:
  created:
    - el-templo-app/src/utils/load-deadline.ts
    - el-templo-app/src/composables/useLoadDeadline.ts
    - el-templo-app/src/composables/__tests__/useLoadDeadline.test.ts
    - el-templo-app/src/utils/load-slot.ts
    - el-templo-app/src/utils/__tests__/load-slot.test.ts
    - el-templo-app/src/composables/useCardHadContentStorage.ts
    - el-templo-app/src/composables/__tests__/useCardHadContentStorage.test.ts
    - el-templo-app/src/stores/useCardHadContentStore.ts
    - el-templo-app/src/stores/__tests__/card-had-content-store.test.ts
    - el-templo-app/src/components/CardSkeleton.vue
  modified:
    - el-templo-app/src/boot/auth.ts
    - el-templo-app/src/boot/__tests__/auth.test.ts
    - el-templo-app/src/layouts/MainLayout.vue
---

# Phase 203 Plan 07: Piezas compartidas de la regla única de carga (SUMMARY)

Quedan disponibles el tope de carga de 6 s (`LOAD_DEADLINE_MS` + `useLoadDeadline`), la regla pura `resolveSlot` (esqueleto / contenido / oculto), el flag "tuvo contenido" por card y por socio (storage + store, precargado en el boot y leído en forma síncrona) y `CardSkeleton.vue`.

## Qué quedó

- `utils/load-deadline.ts`: `LOAD_DEADLINE_MS = 6000`, docblock con D-07 (6 s dentro del rango 6-8 s; peor caso visible 8 + 6; CapacitorHttp ignora el timeout de axios, por eso es un timer de UI).
- `composables/useLoadDeadline.ts`: `useLoadDeadline(ms?) -> { passed, start, cleanup }`, patrón `useLiveClock` (`start()` llama a `cleanup()` y vuelve `passed` a false; sin hooks de ciclo de vida).
- `utils/load-slot.ts`: `resolveSlot(i)` con la tabla cerrada del plan. Contrato exacto del plan 13: `SlotInput { reserve, settled, hasContent?, hadContentLastTime?, deadlinePassed? }`, `SlotState`.
- `composables/useCardHadContentStorage.ts`: `CardKey`, `CardHadContentMap`, `read(userId)` / `write(userId, map)`. Una clave JSON por socio `eltemplo.cardHadContent:<userId>`; dual-path Preferences/localStorage; `read` y `write` pasan por `sanitize()` (solo las 5 `CardKey` con valor booleano; JSON corrupto, no-objeto o storage que tira -> `{}` + `log.warn`).
- `stores/useCardHadContentStore.ts` (Pinia setup): `return { map: mapView, hydratedFor, hydrate, hadContent, record, reset }`. `map` es un `computed` de solo lectura; `record` reemplaza el objeto (reactivo) y persiste solo con socio hidratado.
- `boot/auth.ts`: `await useCardHadContentStore().hydrate(...)` en los tres caminos (con perfil: `response.data.id` tras `hydrateSelection`; optimista del refresh `network` y optimista del `catch` de `/auth/me`: `optimisticUser.id`).
- `layouts/MainLayout.vue`: en el `watch(isAuthenticated)` que ya cargaba avisos/plan-status, `void cardFlags.hydrate(authStore.user.id)` al loguear (no-op si el boot ya hidrató) y `cardFlags.reset()` al desloguear. No se tocó el `void userStore.loadPlanStatus()` (lo reemplaza el plan 11).
- `components/CardSkeleton.vue`: `div.card-skeleton` (`role="status"`, `aria-busy="true"`, `aria-label`) con un `q-skeleton animation="none"` al 100 %; props `height` (obligatoria), `dark`, `radius` (20), `label` ('Cargando'), `inline` + `width`. Sin colores nuevos ni textos.
- `boot/__tests__/auth.test.ts`: mock plano `cardFlagsMock` + `vi.mock('stores/useCardHadContentStore')`; `hydrate` x1 con `7` en los 3 caminos con sesión (a, b, c) y `not.toHaveBeenCalled()` en "sin access token", "refresh rechazado" y "/auth/me 401". No cambió la intención de ningún caso.

Lección del plan 04 aplicada: los tests del store solo leen lo que el `return` real devuelve (`map`, `hydratedFor`, `hydrate`, `hadContent`, `record`, `reset`); se verificó contra el código escrito, no contra la lista de interfaces.

## Commits

- `0d2979ed0` feat(203-07): tope de carga D-07 y regla pura resolveSlot
- `e99f668d4` docs(203-07): docblock de useLoadDeadline sin nombrar hooks de ciclo de vida
- `2142a67d1` feat(203-07): flag 'tuvo contenido' por card y socio, precargado en el boot
- `4a2f6c18f` feat(203-07): CardSkeleton, esqueleto de alto fijo reutilizable

## Tests escritos, pendientes de correr (D-17)

No se corrió vitest ni `vue-tsc`. Sí prettier y eslint (`-c ./eslint.config.js`) sobre los 13 archivos tocados: sin hallazgos.

1. `el-templo-app/src/composables/__tests__/useLoadDeadline.test.ts` (8 casos)
2. `el-templo-app/src/utils/__tests__/load-slot.test.ts` (16 casos, incluidos los de `hasContent` undefined -> 'hidden' en los dos modos)
3. `el-templo-app/src/composables/__tests__/useCardHadContentStorage.test.ts` (9 casos, incluida la clave exacta)
4. `el-templo-app/src/stores/__tests__/card-had-content-store.test.ts` (14 casos, storage mockeado con `vi.mock('src/composables/useCardHadContentStorage')`)
5. `el-templo-app/src/boot/__tests__/auth.test.ts` (ajustado, +mock del store nuevo y aserciones de `hydrate`)

`CardSkeleton.vue` no tiene test (la app no tiene suite de componentes; verificado por grep). Ningún archivo nuevo corre `vue-tsc`: conviene un `vue-tsc` local cuando haya node_modules propios.

## Deviations from Plan

1. **[Rule 1] Docblock de `useLoadDeadline` nombraba `onUnmounted`/`onBeforeUnmount`**, lo que hacía fallar el grep de verificación del plan (`! grep -qE 'onUnmounted|onBeforeUnmount'`). Se reescribió sin nombrarlos en un commit aparte (`e99f668d4`) porque el primero ya estaba hecho.
2. **[Rule 2] `hydrate` del store más robusto que lo pedido.** El plan solo exigía "no-op si ya está hidratado para ese socio". Se agregó: (a) las llamadas concurrentes al mismo socio comparten la misma lectura en vuelo (el boot y el `watch` del layout pueden coincidir en un login); (b) un contador de generación que descarta la lectura de un socio anterior si llegó tarde o si hubo `reset()` (logout durante la lectura); (c) al hidratar a OTRO socio, el mapa del anterior se vacía de inmediato (nunca se ve el flag ajeno mientras se lee el nuevo). Cubierto con 3 tests.
3. **`record` no escribe si el valor no cambia** (`mapState[card] === has`); el plan decía "si cambia", se interpretó con comparación estricta. Registrar `false` sobre una card sin entrada sí escribe (hadContent sigue en false; es inocuo).
4. **Layout:** se hidrata solo si `authStore.user?.id !== undefined` (sin `if` sobre un id 0, que no existe).
5. El plan 02 (nginx) cancelado y la ausencia de `203-02-SUMMARY.md` no afectan a este plan (no dependía de él).

## Riesgos antes del plan 08

- **Ningún consumidor todavía:** nadie llama a `record()` ni lee `resolveSlot`/`CardSkeleton`; el flag arranca vacío para todos los socios. Los primeros arranques tras desplegar los planes de pantalla verán `hadContent === false` (sin esqueleto reservado) hasta que cada card registre su primer 2xx.
- **Quien llama a `record` debe hacerlo solo con 2xx**, nunca tras un error (Pitfall 6). El store no puede distinguirlo. Los stores fail-open (`useNovedadesStore`, etc.) tienen `loading` pero hoy no exponen un `loadFailed` homogéneo: el plan de pantalla tiene que decidir cómo saber "respondió bien" (p. ej. un flag `loadedOk`).
- **Login sin reinicio:** el `hydrate` del layout es asíncrono (lectura de Preferences), así que el primer frame tras un login en el mismo proceso todavía no tiene los flags; solo el boot garantiza "primer frame ya hidratado". Es el caso menos común y su peor consecuencia es un salto de layout.
- **El boot suma un `await` local** (lectura de Preferences, milisegundos) en los 3 caminos con sesión. Está dentro del `try` del camino con perfil: el store traga las fallas del storage, pero si Pinia tirara, caería como "error de red" (boot optimista). Mitigado por el diseño; sin test que lo cubra más allá del mock.
- **Tope y boot:** `useLoadDeadline` arranca al montar la página, no al abrir la app; si el boot espera 8 s, el tope de 6 s corre después (peor caso visible 8 + 6, documentado en `LOAD_DEADLINE_MS`). Los planes de pantalla no deben reiniciar `start()` en cada `watch` (cada `start()` vuelve `passed` a false).
- **`CardSkeleton`** depende de que `.card-skeleton__block` (scoped, 0,2,0) gane sobre el alto por defecto de `.q-skeleton--type-rect` (50 px); se verificó por especificidad, no visualmente. Mirar el primer uso real (plan 08) en el navegador.
- Pre-commit sin node_modules propios: los commits pasaron con prettier/eslint corridos a mano.

## Known Stubs

Ninguno (los módulos son infraestructura sin UI propia; el esqueleto no tiene datos).

## Threat Flags

Ninguno. Mitigaciones T-203-18/19/20 aplicadas: solo booleanos por `CardKey`, `JSON.parse` en try/catch con filtrado de claves y tipos, `log.warn` y default seguro ante fallas del storage.

## Self-Check: PASSED

- Archivos creados verificados con grep del `<verify>` de las tres tareas.
- Commits `0d2979ed0`, `e99f668d4`, `2142a67d1`, `4a2f6c18f` presentes en `feat/203-carga-sin-parpadeos`.
