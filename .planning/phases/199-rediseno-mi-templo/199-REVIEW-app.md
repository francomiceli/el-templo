---
phase: 199-rediseno-mi-templo
reviewed: 2026-10-16T00:00:00Z
depth: standard (con trazado cruzado de stores/componentes)
scope: git diff de257ec705..HEAD -- el-templo-app (worktree et-199-mi-templo, rama feat/199-mi-templo-rediseno)
files_reviewed: 40
findings:
  critical: 0
  warning: 6
  info: 12
  total: 18
status: issues_found
---

# Fase 199: Code Review de la APP de socios

**Verificación mecánica**

- `vue-tsc --noEmit`: 18 errores, los mismos 18 de la línea base (ninguno nuevo; los de `ProfilePage.vue(91)` y `MainLayout.vue(324)` son preexistentes).
- `eslint` sobre `src/modules/progression`, stores, composables, utils y `MainLayout.vue`: limpio.
- Tests de utils corridos de a uno: `sponsors` (21), `novedades-rotation` (13), `check-in-summary` (21), `today-card` (99): verdes.
- Sin `v-html`, `innerHTML`, `console.*`, `any` ni `@ts-ignore` en lo cambiado. Todo texto de la API entra por `{{ }}`.
- Revisado con detalle: `SponsorsCarousel.vue`, `NovedadesCard.vue`, `TodayCard.vue`, `today-card.ts`, `CheckInPanel.vue`, `WeekStrip.vue`, `DailyQuote.vue`, `SponsorSheet.vue`, `MemberCard.vue`, `ForYouCard.vue`, `MiTemplo.vue`, `MainLayout.vue`, stores `useSponsorsStore`/`useTodayBookingStore`/`useNovedadesStore`/`useUserStore`, `useBackButtonClose`, `useLiveClock`, `useInViewport`, utils y tests.

**Veredicto:** no encontré BLOCKERs. La lógica del salto copia→real de `SponsorsCarousel.vue` es correcta en los bordes que pedías (2 marcas, 3+, lista que cambia en caliente, posición fuera de rango, pausa, reduced-motion); lo detallo al final. Los WARNINGs son un bug de compatibilidad en iOS 15, dos problemas de datos/carga, dos de accesibilidad y un hueco de tests.

---

## Warnings

### WR-01: Regex con lookbehind rompe `DailyQuote` en iOS 15.0 a 16.3 (el target declarado)

**File:** `el-templo-app/src/modules/progression/components/DailyQuote.vue:45`
**Issue:** `s.text.split(/(?<=\s)/)`. El lookbehind en regex llega a Safari 16.4. El proyecto declara `safari14` en `quasar.config.js:45` y `IPHONEOS_DEPLOYMENT_TARGET = 15.0` (Podfile y pbxproj). Verificado con el esbuild del repo (`--target=es2022,safari14`): no falla en build, sino que reescribe el literal a `new RegExp("(?<=\\s)")`, que lanza `SyntaxError` en runtime. Escenario: un socio con iOS 15.x / 16.0-16.3 abre Mi Templo, el computed `words` se evalúa en el render de `DailyQuote`, lanza, la frase del día no se pinta (queda un comentario vacío) y entra un error a Sentry en cada visita. Es el único lookbehind del código de la app (`grep` sobre `src`).
**Fix:** partir sin lookbehind, conservando el espacio final de cada palabra:

```ts
s.text.match(/\S+\s*|\s+/g) ?? [];
```

(el `.filter(Boolean)` deja de hacer falta). Agregar un caso a `quotes.test.ts` o extraer el partido a un util puro con test ("A B " → ["A ", "B "]).

### WR-02: `useTodayBookingStore.load()` borra las reservas buenas ante cualquier error y es "todo o nada" entre las dos semanas

**File:** `el-templo-app/src/stores/useTodayBookingStore.ts:80-92` (test que lo fija: `stores/__tests__/today-booking-store.test.ts:282-290`)
**Issue:** dos defectos en el mismo bloque.

1. `Promise.all([thisMonday, nextMonday])`: si falla solo la semana siguiente, se pierde también la actual. El catch deja `bookings = []`.
2. Como `load()` se re-dispara en cada cambio de ruta a `/mi-templo` o `/reservas` (`MainLayout.vue:276-284`), un error transitorio de red al volver de Reservas vacía lo que ya estaba cargado.

Escenario: socio con clase hoy a las 19:00 y botón QR visible; cambia de pestaña con mala señal, `load()` falla, `bookings=[]`, `loaded=true`. El botón QR desaparece dentro de la ventana de ±20 min y la card de hoy pasa a "Reservá tu clase" (`presencial-sin-turno`), afirmando algo falso. El "fail-open" del comentario es correcto para la primera carga, pero no para un refresco.
**Fix:** usar `Promise.allSettled`, y en el error conservar `bookings` si ya había datos (`loaded.value === true`); vaciar solo en la primera carga. Ajustar el test de la línea 282 para cubrir "el segundo load falla y se conserva lo anterior".

### WR-03: Para socios sin plan activo, Mi Templo pide dos veces plan-status y prueba gratis, y la card parpadea al skeleton en cada visita

**File:** `el-templo-app/src/modules/progression/pages/MiTemplo.vue:308-316` y `:393-395`
**Issue:** el `watch` inmediato (línea 308) dispara `loadPlanStatus()` y `loadTrialEligibility()` en el setup si la suscripción ya estaba cargada y no es activa (segunda visita en adelante). Después `onMounted` llama a `loadSubscription()` (línea 394) porque `!hasActiveSubscription`; eso hace `subscriptionLoading` true→false, la fuente del watch pasa false→true y el handler corre de nuevo: segundo `plan-status` y segundo `trial-eligibility`. Además, mientras `subscriptionLoading` es true `planStateLoading` vale true, así que `resolveTodayCard` devuelve `cargando` y el skeleton reaparece sobre una card que ya estaba resuelta, otra vez cuando arranca `loadPlanStatus`. Afecta a quien está en "Arrancá tu plan" / "Renová tu plan" (justo los que tienen que convertir) en cada vuelta a Mi Templo.
**Fix:** que el watch dispare solo en la transición `loading → loaded` (comparar con el valor previo) o que un flag local evite repetir; y que `planStateLoading` (o `todayCard`) no vuelva a `cargando` si `planStatusLoaded` ya es true y solo se está refrescando la suscripción. Alternativa mínima: no llamar a `loadSubscription()` en `onMounted` cuando `subscriptionLoaded` ya es true y el estado en memoria es `expired`/`cancelled` reciente, o hacerlo sin tocar `subscriptionLoading`.

### WR-04: El carrusel de patrocinadores se mueve solo sin forma de frenarlo con teclado o lector de pantalla (WCAG 2.2.2), y las cards no responden a Espacio

**File:** `el-templo-app/src/modules/progression/components/SponsorsCarousel.vue:31` (solo `@pointerdown`), `:35-47` (cards `role="button"`), `:263-270` (`pause`)
**Issue:** el auto-avance (cada 4 s) solo se pausa con `pointerdown`. Foco en una card (`tabindex=0`), TalkBack/VoiceOver o teclado: no hay pausa, así que cada 4 s el scroll programático se lleva la card enfocada fuera de la vista y el foco queda sobre algo que ya no se ve. Contenido que se mueve más de 5 s sin mecanismo de pausa incumple 2.2.2. Además la card es `role="button"` pero solo maneja `Enter` (línea 46), no `Space`. Y si el `click` viene sin `pointerdown` (activación por AT, que no sigue el mismo camino), `downScrollLeft` queda viejo y, si el carrusel ya avanzó más de 8 px, `onCardClick` (línea 413) lo descarta como "swipe" y la card no abre.
**Fix:** `@focusin="pause()"` / `@focusout` (o pausa mientras el foco esté dentro de la sección); `@keydown.space.prevent="open(s)"`; reiniciar `downScrollLeft` también en `@click` cuando `event.detail === 0` (click sintético) y tratarlo siempre como tap.

### WR-05: `ForYouCard` anida un `<button>` dentro de un `role="button"`

**File:** `el-templo-app/src/modules/progression/components/ForYouCard.vue:9-22`
**Issue:** `<article role="button" tabindex="0">` contiene `<button class="for-you-card__go">`. Un `role="button"` tiene hijos presentacionales: los lectores de pantalla aplanan el contenido y el botón interno no es alcanzable como control independiente (regla axe `nested-interactive`), y quedan dos tab-stops para la misma acción. También falta `Space`. Esto se repite en las 4 tarjetas de "Para vos" (Referral, Upsell, ProgramCta, Aviso).
**Fix:** dejar un solo control. Lo más simple: `article` sin rol ni tabindex, con el botón interno como único elemento interactivo, y el click del `article` solo como ayuda para el toque (con `aria-hidden` no hace falta). O hacer todo el card un `<button>`/`<a>` único sin botón anidado.

### WR-06: La lógica del salto copia→real (lo más delicado de 199-33) no tiene ningún test

**File:** `el-templo-app/src/modules/progression/components/SponsorsCarousel.vue:297-311, 344-381` y `modules/progression/utils/__tests__/sponsors.test.ts`
**Issue:** no existe test de componente de `SponsorsCarousel`, `NovedadesCard` ni `TodayCard`. En `sponsors.ts` solo hay tests de `monogram`, tamaños y pastilla. Todo lo nuevo del commit `5d1ac1f82` (lista continua, `COPIES = 2`, `position % count`, el recorte de `position` cuando cambia `count`, `syncPositionFromScroll` con `index = last` por fin de scroll, la cuenta de `progressOffsetMs`) es lógica numérica pura enterrada en el componente y sin cobertura. Los bordes que importan (2 marcas, 1→2→0 marcas, posición en copia al achicarse la lista) hoy solo los cubre una prueba manual. CLAUDE.md pide "err on the side of too many tests".
**Fix:** extraer a `utils/sponsors.ts` funciones puras y testearlas con tabla: `buildSlides(count) → { total, copies }`, `realIndex(position, count)`, `clampPosition(position, newCount)`, `positionFromScroll(scrollLeft, step, max, total)`, `jumpTarget(position, count)`. Opcional: un test de componente con `ResizeObserver`/`IntersectionObserver` mockeados y `vi.useFakeTimers()` que verifique que, con 2 marcas, tras 3 avances el índice real vuelve a 0 y no queda ningún timer vivo al desmontar.

---

## Info

### IN-01: El salto puede ejecutarse con el dedo apoyado

**File:** `SponsorsCarousel.vue:369-381`
**Issue:** `jumpFromCopy()` corre 120 ms después del último `scroll`, sin mirar si el usuario sigue con el dedo apoyado. Si arrastra despacio hasta una copia y se queda quieto ese tiempo, se hace un `scrollTo` programático en pleno gesto. El contenido es idéntico, pero según el navegador puede cortar el arrastre.
**Fix:** guardar `pointerActive` en `pointerdown`/`pointerup`/`pointercancel` y postergar el salto hasta soltar.

### IN-02: La pausa por toque cuenta desde `pointerdown`, no desde que se suelta

**File:** `SponsorsCarousel.vue:263-270, 397-402`
**Issue:** `pause()` arma 3 s desde el apoyo. Un toque largo (más de 3 s) retoma el auto-avance con el dedo todavía abajo. `NovedadesCard` en cambio pausa mientras el dedo está apoyado: comportamientos distintos para el mismo gesto.
**Fix:** re-armar el temporizador de pausa en `pointerup`/`pointercancel`.

### IN-03: Con 2+ marcas, parar en la última copia deja la card pendiente en el hueco

**File:** `SponsorsCarousel.vue:132-147, 297-311`
**Issue:** el auto-avance nunca llega a la 2.ª copia, pero un swipe sí (índice `n+1`). Ahí se ve la copia con la cola vacía a su derecha y, tras el salto a la real equivalente (`1`), aparece de golpe la card siguiente que antes no estaba. Es un salto visible solo en ese caso de swipe al final del todo. Aceptable, pero el comentario de las líneas 129-131 sugiere que no hay hueco.
**Fix:** documentar el caso, o saltar también al llegar a la copia `n+1` hacia `n+1-n`+reemplazo equivalente solo con 3+ marcas; no urge.

### IN-04: Constantes duplicadas entre JS y CSS en el carrusel

**File:** `SponsorsCarousel.vue:113-114` y estilos `:456-479`
**Issue:** `SIDE_PADDING_PX = 16`, `CARD_GAP_PX = 10`, `82%` y `calc(18% - 10px)` viven en dos lugares y se rompen en silencio si cambia uno (el cálculo de `step`/`scrollTo` y el tramo de cola dependen de ellos). Ya hay un comentario "debe coincidir".
**Fix:** leer el `gap` y el padding con `getComputedStyle(track)` en el primer cálculo, o centralizarlos como custom properties CSS que JS lee.

### IN-05: `color-mix()` en la riel de progreso no existe en iOS < 16.2 ni WebView Android < 111

**File:** `SponsorsCarousel.vue:629`
**Issue:** `background: color-mix(in srgb, var(--b-fg) 25%, transparent)`. En WebViews viejos la declaración se descarta y queda sin riel (solo el relleno). Falla degradada, no rota.
**Fix:** declarar antes un `background: rgba(0,0,0,.18)` como fallback.

### IN-06: `TodayCardInput.todayStr` y `dow` son campos muertos

**File:** `el-templo-app/src/modules/progression/utils/today-card.ts:82-85`; `MiTemplo.vue:219-221, 160, 327-328`
**Issue:** tras revertir la lógica de domingo/día de descanso (D3/C2), `resolveTodayCard` ya no lee `input.todayStr` ni `input.dow` (`grep` lo confirma: solo aparecen en el comentario de cabecera y en la interfaz). `MiTemplo.vue` igual calcula `dow` con `dowInTz` y lo pasa; los 99 tests los siguen armando.
**Fix:** quitar los dos campos del input, el `computed dow` y el import `dowInTz` de `MiTemplo.vue`, y la mención de la cabecera.

### IN-07: Código de resumen semanal/RPE huérfano

**File:** `modules/progression/composables/useProgressionApi.ts:93-110`, `modules/progression/stores/progressionStore.ts:40-46, 119-135`, `modules/progression/types.ts` (`WeeklySummary`)
**Issue:** al borrar `WeeklySummaryCard` y `RpeTrendChart`, `fetchWeeklySummary`, el estado `weeklySummary*` y sus setters quedaron sin consumidores en `src` (ya no se llama a `fetchWeeklySummary` desde `MiTemplo.vue`). `StreakRow`, `TrainingStats` y `GoalPlanSection` ya eran huérfanos antes de la fase.
**Fix:** borrar esas piezas en el cierre de la fase o abrir una tarea de limpieza; no mezclar con este PR si preferís.

### IN-08: `ProgramSheet` sigue con su propia copia de la lógica de `useBackButtonClose`

**File:** `modules/progression/components/ProgramSheet.vue:51-83` vs `composables/useBackButtonClose.ts`
**Issue:** el composable nuevo dice "Mismo mecanismo que `ProgramSheet`", pero `ProgramSheet` no lo usa y conserva ~30 líneas duplicadas (token anti-carrera, `App.addListener`). CLAUDE.md marca la repetición como a evitar.
**Fix:** reemplazar por `const backClose = useBackButtonClose(close)` y un `watch(modelValue)` como en `SponsorSheet`.

### IN-09: El badge de "novedades nuevas" lleva `aria-label` sobre un `<span>`

**File:** `NovedadesCard.vue:25-31`
**Issue:** `aria-label` sobre un elemento genérico sin rol no se anuncia de forma fiable (ARIA 1.2 lo prohíbe en `generic`); el lector dice solo "2". Tras el ajuste "contador solo con el número" quedó sin contexto.
**Fix:** `<span class="sr-only">novedades nuevas</span>` junto al número, o `role="status"` con texto oculto. Además el ítem tappable (líneas 63-66) maneja `Enter` pero no `Space`.

### IN-10: Detalles de a11y menores

**Files:** `MemberCard.vue:26` y `SponsorSheet.vue:5`
**Issue:** `MemberCard` pone `role="dialog"` en el `q-card` dentro de un `q-dialog` que ya tiene el suyo (diálogos anidados para AT); `SponsorSheet` no le da nombre accesible al diálogo. `ProfilePage.vue` agrega "Proponer una mejora" como `<div @click>` (no enfocable por teclado), copiando el patrón de los vecinos.
**Fix:** quitar el rol duplicado y pasar `aria-label` al `q-dialog`/usar `aria-labelledby` con el nombre de la marca; usar `<button>` o `q-item clickable` en Perfil.

### IN-11: Refresco de reservas incompleto para el botón QR y comparación por texto en `CheckInPage`

**Files:** `MainLayout.vue:276-284` y `pages/CheckInPage.vue:154`
**Issue:** el store se recarga al _entrar_ a `/mi-templo` o `/reservas`, pero no cuando se reserva dentro de `/reservas` (la página no llama al store). Quien reserva una clase que empieza en menos de 20 min sigue sin ver el botón QR en esa pantalla hasta cambiar de ruta. Y `errorMessage.value.includes('Ya registraste asistencia')` depende del texto exacto del API.
**Fix:** que `ReservasPage` llame a `todayBookingStore.load()` tras reservar/cancelar; usar un código de error del API en lugar de texto.

### IN-12: Ruido y colores sin tokens

**Files:** `useUserStore.ts` (unión `SubscriptionStatus`), `types/scheduling.ts` (`BookingStatus`), `css/app.scss`, `ReservasPage.vue`; y SCSS varios
**Issue:** reformateos de Prettier que cambian uniones multi-línea a una sola y partes de `app.scss`, sin relación con la fase (diff más difícil de leer). Los hex `#2c2318`, `#6b6459`, `#96593a`, `#e3c9a8` están repetidos en decenas de reglas de los componentes nuevos aunque `_brand.scss` ya trae `$brand-terracotta`; `CheckInPanel.vue:199` declara `$ink-2` sin usarlo.
**Fix:** definir `$mt-ink`, `$mt-ink-2`, `$mt-terra`, `$mt-kick-dark` en `_brand.scss` junto a `$mt-block-title-color` y usarlos; borrar `$ink-2` sin uso; separar los reformateos en su propio commit.

---

## Qué se verificó sin hallazgos (lo pedido)

- **Salto copia→real (`SponsorsCarousel.vue`)**
  - 2 marcas: `slides = [A,B,A',B']`; A(0)→B(1)→A'(2) cambia `current` 1→0 y rearma el timer; el salto a 0 mantiene `current` y no lo reinicia; el timer del ciclo, que se evalúa recién al disparar, avanza a B desde la posición ya corregida.
  - La cola `::after` (18 % − 10 px) hace que el scroll máximo coincida con el snap de la última card; la regla `scrollLeft >= max-2 → index = last` queda consistente.
  - Lista en caliente: `watch(count)` recorta `position` si queda fuera de rango o con `n<2`; el resto de los cambios reutiliza el índice porque `position` es un índice de pista, no de marca.
  - Pausa: `running` combina visibilidad, viewport, `paused` y reduced-motion; con reduced-motion no hay timer y el salto es instantáneo.
  - Limpieza: `onUnmounted` corta timer, pausa, settle, `raf`, `ResizeObserver`, `visibilitychange`, `matchMedia` y el observer de viewport. Los dos `requestAnimationFrame` encadenados del salto no se cancelan, pero solo escriben un ref de un componente ya desmontado (inocuo).
  - Las copias llevan `aria-hidden`, `tabindex=-1` y sin rol ni `aria-label`.
- **Card de hoy:** precedencias de gates coherentes con D3/D4/D5/D11 y C1/C2; ningún camino produce "descansá"; `cargando` cubre plan y reservas. `planLoading`/`bookingsLoading` no se afirman por carrera.
- **Carreras de carga:** `generation` descarta respuestas viejas en los tres stores (`sponsors`, `novedades`, `todayBooking`); `reset()` en logout; `useUserStore.clearProfile` limpia el estado de plan.
- **Limpieza en `NovedadesCard`:** timer, marquee (`Animation.cancel`), `ResizeObserver`, `matchMedia`, `visibilitychange` y `document.fonts.ready` guardado con `disposed`.
- **Reglas del repo:** `createLogger` en todo, `catch (err: unknown)`, stores `setup`, composables sin `onUnmounted` (`useLiveClock`, `useBackButtonClose`, `useInViewport` exponen `cleanup()`; los componentes que los usan lo llaman).

_Reviewed: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
