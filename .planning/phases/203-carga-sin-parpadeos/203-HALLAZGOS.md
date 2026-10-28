# Fase 203 — Hallazgos previos (2026-10-23)

Reporte de Franco: "algunos datos se cargan tarde antes de que se dibujen cosas; durante un instante un texto dice una cosa y luego la correcta". Ejemplo: en **Planes** se ven los planes regulares arriba y un instante después aparece "Planes Por Objetivos" encima. "No sucedía hasta hace una semana, cuando empezamos a hacer crecer la app."

Revisiones comparadas: BEFORE = `f6a4c9ae7` (2026-10-08), NOW = `ab4342b27` (2026-10-23, app 1.8.6). Rutas relativas a `el-templo-app/src/`, líneas de NOW.

## 1. El servidor NO es la causa (prod, solo lectura, 2026-10-23)

- **Tráfico plano:** nginx `access.log` 09-10 → 23-10 entre 410k y 430k pedidos/día; ~85% es la TV consultando `/api/admin/tv/control/screen` (~350k/día, también plano).
- **El vhost `api.eltemplo.org` tiene `access_log off`**; los tiempos salen de los logs de Fastify (pm2, `request completed` + `responseTime`), que solo cubren 21-10 → 23-10 (rotación por tamaño de 50 MB).
- **Latencia de la app (members/auth/programs):** p50 11 ms, p90 30 ms, p99 100–170 ms. Ningún endpoint de la app está lento (el más lento, `/communications/me/prompt`, p90 ~72 ms).
- **~15 pedidos de la app por apertura** (pedidos de app / `GET /auth/me` por día).
- **La API no tiene HTTP/2:** `listen 443 ssl;` sin `http2`. La app usa `CapacitorHttp` (`enabled: true`), o sea cliente HTTP nativo con un límite de ~6 conexiones por host → los pedidos de más hacen cola, y cada conexión nueva paga el handshake TLS.

Conclusión: el retraso está en el teléfono + la red (100–300 ms de RTT en datos móviles) multiplicado por pedidos en fila y por la cola del arranque.

## 2. Pedidos al arrancar (socio con plan activo, cold start → Mi Templo cargado)

| | BEFORE | NOW |
|---|---|---|
| Boot / layout (sin contar el refresh) | 8 | 10 |
| Montaje de Mi Templo | 8 | 8 |
| **Total** | **16** | **18** |
| En vuelo justo después de `/auth/me` | 7 | ~10 |

- `my-progress`, `current-program` y `enrollments` se piden **dos veces** en ambas revisiones (cadena del boot `loadSubscription` → `fetchProgramEnrollmentStatus` → `fetchCurrentProgram` en `stores/useUserStore.ts:454-457`, y de nuevo en el `Promise.all` de `MiTemplo.vue:413`).
- Socio sin plan (NOW): ~24 pedidos (segundo `loadSubscription` desde `MiTemplo.vue:408`, plan-status, trial-eligibility).

### Pedidos agregados desde BEFORE

| Cambio | Commit |
|---|---|
| `useTodayBookingStore.load` = `my-bookings` ×2 al montar MainLayout, al entrar a `/mi-templo` y `/reservas`, y después de acciones en Reservas | 37a6f3f63, 6354501ee (10-15), 092c86da0 (10-16) |
| `my-bookings` ×2 al volver de segundo plano (`visibilitychange`) | 46ccf2470 (10-23) |
| `GET /communications/me/novedades` en Mi Templo | c8f321650, 658c0246a (10-14) |
| `GET /members/sponsors` en Mi Templo + POSTs `seen` | f48874877, ccebb03bd (10-15) |
| `plan-status` y `trial-eligibility` (solo sin plan) | 84f249bd0, 9369c710d (10-15) |
| `GET /anatomy` en Entrenar | 89e263c48 (10-21) |
| Timeout de 8 s del boot (puede arrancar sin perfil) | 3a90c35a6 (10-21) |
| **Quitados:** `weekly-summary` y `especial-pass` de Mi Templo | 9369c710d / 73153f01f, 5016912d7 |

### Por pantalla (sesión ya iniciada)

| Pantalla | Pedidos NOW | Orden |
|---|---|---|
| Mi Templo (`modules/progression/pages/MiTemplo.vue:389`) | 9 (8 al volver) + 2 `my-bookings` | En paralelo sin esperar: stats, check-ins, tarjetas, novedades, sponsors → (si no hay plan) `loadSubscription` → `Promise.all(my-progress, current-program+enrollments)` → `/sessions/weekly` sin esperar. Un watch en `:321` agrega plan-status + trial-eligibility |
| Entrenar `/training` | 1 + `/anatomy` | `TrainingIndex.vue:43` hace `loadSubscription` si falta (+4, esperado) → `EntrenarView.vue:147` `/sessions/weekly`; `SemanaTab.vue:214` `/anatomy` |
| Reservas (`pages/ReservasPage.vue:2306`) | 7 | Todo en fila, pero `loading` cubre toda la cadena → no parpadea. Multi-sede pide `/weekly` dos veces (watch de `selectedBranchId` + `loadGrid()` explícito) |
| Perfil (`ProfilePage.vue:283`) | 1 | `loadSubscription` si falta → `/notifications/preferences` |
| Planes (`modules/plan/pages/PlanesPage.vue:239`) | 3 | `loadSubscription` si falta → plans → catalog → my-progress, todo en fila |
| Guía | 0 (`/training/guia/inicio`) | `/training/guia/cuerpo` pide `/anatomy` |

## 3. Candidatos de parpadeo (NOW, por visibilidad)

1. **Planes — "No hay planes disponibles" + regulares antes que Por Objetivos.** `loading = ref(false)` (`PlanesPage.vue:166`); el `onMounted` primero espera `loadSubscription` (`:242`) y recién después pone `loading = true` → durante esa cadena se ve el estado vacío (`v-if` en `:8`). Después aparecen los regulares; el catálogo llega y "Por Objetivos" (`:38`, arriba) empuja los regulares. "Ya estás inscripto" llega último. Código sin cambios desde abril.
2. **Mi Templo — título de la card de hoy (presencial).** `today-card.ts:362` `input.todayRoute ?? booking.activityName`; `todayRoute` viene de `/sessions/weekly`, que se pide después del `Promise.all` (`MiTemplo.vue:413-415`) → primero el nombre de la actividad, después el de la rutina. En `presencialSinTurno` (`today-card.ts:391`) "Elegí día, horario y sede" pasa a "Próxima: X".
3. **Mi Templo — socio virtual.** `MiTemplo.vue:337` `program = isVirtual ? programProgress : null` + `today-card.ts:485` → `onlineLibre` hasta que llega my-progress, después `online-programa`.
4. **Mi Templo — acciones secundarias tardías.** "Clase de prueba gratis": `trialEligible = ref(false)` (`MiTemplo.vue:182`, `today-card.ts:280`), espera plan-status + trial-eligibility que arrancan después de la suscripción. "Tus programas" (`today-card.ts:414`) espera my-progress + enrollments.
5. **Mi Templo — saltos de layout.** `NovedadesCard` (`:33`) y `SponsorsCarousel` (`:46`) no dibujan nada hasta tener datos; `CheckInPanel` (`:38`) espera `checkInState`; `WeekStrip` (`:50`) tira vacía y `totalSessions ?? 0`; `ProgramCtaCard` "Para vos" hasta que llega my-progress (`showProgramCta`, `:218`). Aparecen en orden distinto cada vez.
6. **Mi Templo — "Cargando tu progreso…".** `progressionStore.loading` arranca en false (`stores/progressionStore.ts:54`): contenido un frame → loader → contenido. Igual en BEFORE.
7. **Red lenta (timeout de 8 s del boot).** `boot/auth.ts:181`, `:207-215`: `profile` null → "Hola, Atleta!" (`MainLayout.vue:338`), `branchIsVirtual` undefined → card presencial para un socio virtual, `todayBookingStore.tz` cae a `DEFAULT_BRANCH_TZ`, hasta que `retryProfileLoad` (guard del router) trae el perfil.
8. **Entrenar — parámetros de `/sessions/weekly` decididos antes de tiempo.** `useWeekData.ts:69-97` elige `params.view` con `currentProgram.enrollmentId`, `hasPresencialPlan` y `allActiveEnrollments`; `useTrainingWeek` solo recarga cuando cambia `activeLevel` → si la cadena del boot no terminó, la semana puede quedar pedida con `view` incorrecto y nada la recarga. Relacionado: `TrainingIndex.vue:15` elige `EntrenarVidriera` con `hasPresencialPlan || allActiveEnrollments.length > 0`; `subscriptionLoading` baja antes de que lleguen las inscripciones → un socio solo-online puede ver la vidriera un instante.
9. **Perfil — card de suscripción.** `ProfilePage.vue:63` "Sin suscripcion activa" si `subscription` es null y no está cargando (frame breve en el caso de perfil desactualizado). Los toggles de notificaciones ya están protegidos (`preferencesLoading = ref(true)`).
10. **Entrenar — CTA.** `hasProgress` arranca en false → "Empezar" y después "Continuar" (`semanaCta.ts:130`). Viene de Preferences locales, no de HTTP.

## 4. Palancas identificadas

- **HTTP/2 en `api.eltemplo.org`:** una línea en nginx (`deploy/nginx/api.eltemplo.org` + aplicar en el server, que hoy se hace a mano → OK de Franco antes de SSH). Verificar que `CapacitorHttp` (iOS URLSession / Android) negocie h2 sin cambios.
- **Regla única de carga** por pantalla/card: esperar todos los datos, reservar lugar con esqueleto (skeleton), u ocultar hasta tener datos; nunca un default que se lea como respuesta (`?? false`, `!x`, lista vacía → "no hay…").
- **Pedir en paralelo** lo que hoy va en fila (Planes, Perfil, cadena del boot).
- **Sacar pedidos repetidos** del arranque (my-progress / current-program / enrollments ×2; `/weekly` ×2 en Reservas multi-sede).

Pendiente sin medir: cuánto encola realmente el burst del arranque (HTTP/1.1 + límite de conexiones de CapacitorHttp).
