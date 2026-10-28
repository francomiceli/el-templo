# Phase 199: Rediseño de Mi Templo + patrocinadores — Context

**Gathered:** 2026-10-15 (sin discuss interactivo: todo se decidió punto por punto con Franco en la sesión de diagnóstico y sistema)
**Status:** Ready for planning

<domain>
## Phase Boundary

Rediseño de la pantalla de inicio del socio (`el-templo-app/src/modules/progression/pages/MiTemplo.vue` + `MainLayout.vue`): jerarquía, contraste y legibilidad, más un módulo nuevo de **patrocinadores** (carrusel en Mi Templo + editor en el admin de Partners + API). Toca las 3 apps.

Fuera de alcance:

- sección de Kaia para socios de otros gimnasios;
- QR de miembro validable por comercios;
- métricas de clics en los CTA de Mi Templo (descartadas por Franco "por ahora");
- desktop (≥ 768 px) más allá de no romperlo.
  </domain>

<sources>
## Fuentes (leer antes de planificar)

Locales, gitignoreadas, mismo equipo:

- `/home/franco/projects/el-templo/.docs/mi-templo-rediseno-diagnostico.md` — diagnóstico Fase 1: inventario (pantalla + gates), contraste medido, primer viewport, "Resultado de la revisión".
- `/home/franco/projects/el-templo/.docs/mi-templo-rediseno-fase2.md` — decisiones de sistema (M márgenes, S superficies), patrocinadores (7 decisiones + Partners), pop-up, frase.
- `/home/franco/projects/el-templo/.docs/mi-templo-rediseno/patrocinadores-brief.md` + `patrocinadores-mockup.html` — brief original del carrusel. Ojo: su cambio de padding 28/14/80 % es **solo para una presentación**; mandan las decisiones de este CONTEXT.
- `/home/franco/projects/el-templo/.docs/mi-templo-rediseno/herramientas/` — `capture.cjs` (Playwright + mocks por variante A–G sobre app-staging), `contrast.py` (contraste sobre el fondo real: segunda captura con texto transparente), `fold.py`, `consolidate.py`, `mocks/`. **Reusar para las capturas "después"** (apuntando a la app local o a staging).
- `/home/franco/projects/el-templo/.docs/mi-templo-rediseno/antes/` — capturas "antes" por variante × ancho.
- `/home/franco/projects/el-templo/.docs/mi-templo-prueba-5-segundos.md` — guion de la prueba con socios (validación post-staging).

Versionada:

- `.planning/sketches/005-mi-templo-jerarquia/index.html` — **sketch ganador (A')**. Fuente visual de verdad: pila, card de hoy, registro compacto, Tu semana, patrocinadores (hoja de detalle + carnet), Para vos, frase clara, QR extendido. Tokens en su `<style>`.
  </sources>

<decisions>
## Implementation Decisions

### Pila y jerarquía

- **D-01 Trabajo de la pantalla:** "En 3 segundos, el socio sabe qué le toca hoy y tiene a un toque la acción de este momento."
- **D-02 Una sola pantalla + gates** (no hay "estados" por segmento). Orden fijo:
  1. Saludo (layout).
  2. **Card de hoy.**
  3. Novedades.
  4. Registro del día.
  5. **Patrocinadores.**
  6. Tu semana.
  7. Para vos (carrusel).
  8. Frase del día.
  - PermissionBanner (nativo sin permiso) sigue arriba de todo. Mi Árbol sigue apagado por flag.
- **D-03 Card de hoy = variante A' del sketch:** fondo `#2c2318`, texto crema `#f0e6d6`, kicker `#e3c9a8`, botón primario crema con texto `#2c2318`, secundario como link subrayado. **Sin vocabulario de promo:** sin borde dorado shimmer, sin pastilla de categoría. Es la única superficie oscura de la pantalla. Fusiona SessionCtaCard + BookingStatusCard + RestDayCard (+ ProgramProgressCard en online con programa). Contenido por gate:
  - presencial con turno: "Hoy · jueves 15" / ruta (NUCLEUS o primer bloque, `getRouteName`) / "Tu turno: 19:00 · Alem" / "Ver la sesión" + "Cambiar turno";
  - presencial sin turno: ruta / "No tenés turno hoy" / "Reservá tu turno" + "Ver la sesión";
  - descanso (domingo o sin sesión hoy): "Hoy descansás" / "Mañana: {ruta} · tu turno {hora} · {sede}" (si hay) / "Ver la de mañana";
  - sesión completada: chip con min y RPE + "Ver resumen" (destino actual `session-summary`);
  - online con programa: "Hoy · {programa}" / ruta / "Semana X de N · n de m sesiones esta semana" + barra / "Entrenar" + "Mi programa";
  - online sin plan: "Entrenar" (sesión libre), igual que hoy;
  - mensaje del registro del día (`checkInMessage`: "Sesión liviana sugerida" / "Considerá movilidad hoy" / "Escuchá tu cuerpo hoy") como chip dentro de la card;
  - en la ventana del turno: chip "Tu clase empieza en N min"; ya marcó asistencia: chip verde "Asistencia registrada HH:MM".
- **D-04 Turno real:** conectar a `GET /members/scheduling/my-bookings?weekStart=` (ya existe, `useSchedulingApi.getMyBookings`). Hoy `BookingStatusCard` está cableada con `:has-booking="false"` (`MiTemplo.vue:115`). Borde: fin de semana sin turnos → mirar la semana siguiente o caer a "Reservá". Hora y "hoy" en **zona horaria de la sede**, no del teléfono (bugs previos por UTC vs `todayInTz`).
- **D-05 Sin plan (gate "sin plan activo"):** card propia dentro del slot de hoy.
  - "nunca tuvo plan": kicker "Empezá hoy" / "Arrancá tu plan" / "Elegí cómo querés entrenar: en tu sede o online." / "Ver planes" + "Clase de prueba gratis" (si trial-eligible).
  - "tuvo y venció": kicker "Te extrañamos, {nombre}" / "Renová tu plan" / "Tu {plan} venció el {fecha}." / "Renovar" + "Ver otros planes".
  - Ambas con gancho al pie: "Hoy en {sede} se entrena {ruta}".
  - **Requiere backend:** la API tiene que exponer si el socio tuvo plan antes (y el último plan + fecha de vencimiento). Hoy `/members/subscription/me/subscription` devuelve 204 en los dos casos. Va con test de integración.

### Botón QR (check-in)

- **D-06 El FAB QR se queda como hábito, pero solo aparece en la ventana del turno:** visible únicamente si el socio presencial con plan activo tiene una reserva hoy **y** el momento está dentro de **±20 min** del inicio (igual que el server, `attendance/service.ts:124-156`, `windowMs = 20*60*1000`; compartir o espejar la constante con un comentario que apunte al server). En la ventana se muestra **extendido** con ícono QR + "Marcar asistencia". Fuera de la ventana no se muestra. Tras marcar (server responde "Ya registraste asistencia hoy" o la app sabe que marcó) desaparece. Hoy se muestra siempre (`MainLayout.vue:312-318`) y tapa la flecha de "Reservá".
- La pila reserva espacio inferior (~88 px) **solo** cuando el FAB está visible.

### Bloques

- **D-07 Registro del día compacto:** una pregunta por vez a lo ancho ("1 de 3"). Al responder aparece la siguiente; con las 3 respondidas colapsa a una línea ("✓ Registro del día · Energía normal · Sin molestias · Dormiste bien · editar"). Botones de 44 px de alto mínimo. Sigue alimentando D-03. Mismas preguntas y valores (`CHECK_IN_QUESTIONS`).
- **D-08 Novedades:** mantiene el diseño del sketch 004 (NovedadesCard); **solo cambia de lugar** (debajo de la card de hoy).
- **D-09 Tu semana sin RPE:** el RPE casi no se usa.
  - Fila compacta (~80 px): número grande de sesiones esta semana + 7 puntos L–D con los días entrenados (`completedDates` de `/sessions/weekly`) y el día de hoy marcado + "N sesiones en total".
  - **Sale de Mi Templo:** "RPE prom" y el gráfico "Tendencia de Esfuerzo".
  - **Evaluación de nivel con gate:** solo si `eligible` ("Listo para evaluación" + botón) o `pendingRequest` ("Solicitud pendiente").
- **D-10 "Para vos" (carrusel):** baja debajo de Tu semana. Cards claras (blancas, borde `#e5dbcd`), ~130 px (kicker, título 16 px, una línea, link "Acción →"). Sin dots: se asoma ~24 px de la siguiente. El snap respeta el margen de 16 (`scroll-padding-inline`). Slides: Invitaciones, Presencial (solo online), Planes Personalizados (si no hay card de programa), avisos libres del admin. Las tarjetas siguen editables desde Comunicaciones (fase 193).
- **D-11 Sugerencias sale del carrusel** → entrada fija en **Perfil** ("Proponer una mejora", ruta `/proponer-mejora`) + el pop-up ocasional `improvement_prompt` que ya existe. Hoy NO está en ningún menú.
- **D-12 Frase del día:**
  - **Fuente:** copiar las **10 frases activas del TV** (`QUOTES` de `el-templo-admin/src/utils/pdf/quotes.ts`, formato de tramos `segments[{text, gold?}]` + `author`, NO `RETIRED_QUOTES`). Reemplazan las 10 viejas de `el-templo-app/src/modules/training/data/quotes.ts` (son la tanda retirada en 2026-07). Adaptar sus 4 consumidores: DailyQuote, DayPlayer, GoalPlanSession, SplashScreen. Rotación: espejar `rotationIndex` (por día) o la del día actual. Sin API por ahora.
  - **Look = pantalla diurna del TV, versión clara, SIN banda propia:** va sobre el mismo fondo de Mi Templo. Cinzel 700 en mayúsculas, tinta `#3d3732`, tramo `gold` en terracota `#96593a` (el bronce no contrasta sobre crema); autor en Nunito Sans 700, mayúsculas, letter-spacing .3em, color `#5c5347`; entrada palabra por palabra al entrar en pantalla (IntersectionObserver), respetando `prefers-reduced-motion`.
  - **Fuentes:** `@fontsource/cinzel` ya está; **sumar `@fontsource/nunito-sans`** (aprobado por Franco).
- **D-13 Pop-up de entrada:** el modal queda **como hoy**. **Nuevo:** cuando el admin configura un aviso pop-up, también aparece como **novedad** (primera del feed, NUEVO, mismo destino). Cerrar el pop-up no borra la novedad. Respeta el máximo de 3 de Novedades. Implementación a elegir en el plan: que el feed `/communications/me/novedades` incluya los avisos pop-up activos del socio (preferible: una sola fuente) o crear la novedad al publicar.

### Sistema (tokens)

- **D-14 Márgenes (M):** margen lateral de página 16 px, padding interno de card 16 px, **sin cajas anidadas** (sin íconos de 40 px a la izquierda, sin sub-cajas de stats). Grilla de 8 pt.
- **D-15 Superficies (S):** cards blancas **opacas**. **Texto siempre en color sólido, nunca con opacidad** (el 47 % de fallas venía de `rgba($primary, .6–.8)` y blanco al .6–.7).
  - Texto principal `#2c2318` (15.4 sobre blanco).
  - Secundario `#6b6459` (5.9).
  - Títulos y acento terracota `#96593a` (5.6), solo sobre cards, no sobre la página.
  - Títulos sobre la página en `#2c2318`.
  - Botones terracota con texto blanco, o crema sobre oscuro. **El dorado está reservado para Aura:** se sacan los CTA dorados `#c4956a/#a07850` del carrusel actual.
  - Header/saludo: fecha y "ALFA" en blanco sólido (no al .7/.6, y "ALFA" ≥ 10 px). Tab bar: etiquetas inactivas en crema `#f2ede5` sólido (4.75), no blanco al .6.
- **D-16 Fondo detrás, en TODA la app:** `.app-bg` (`MainLayout.vue:403-413`, foto `bars-open.webp` al 8 %, `position: fixed; z-index: 0`) hoy se pinta **encima** de la página y las cards porque va después de `q-page-container` en el DOM. Llevarla detrás de verdad (por ejemplo `z-index` negativo o moverla antes en el DOM, con la página transparente para que se vea en los huecos) y cards opacas. Capturas antes/después de Mi Templo, Entrenar, Reservas, Planes, Guía y Perfil.

### Patrocinadores (módulo nuevo)

- **D-17 Qué es:** marcas que dan beneficios a NUESTROS socios (descuento en la marca). No confundir con Partners (fase 179: la marca nos trae socios nuevos, con comisión).
- **D-18 Dueño = PLATAFORMA**, no el gimnasio: los tenants no pueden tener publicidad propia. Hoy se ven en la app de El Templo. En el futuro Kaia los mostrará en una sección propia (fuera de alcance).
  - Tabla de marcas sin `tenant_id` → declararla como tabla de plataforma en el esquema de tenancy (ver cómo lo hacen las de la fase 182).
  - Vínculo opcional `partner_id` → `referral_partners` (gym-owned): revisar que el lint de tenancy lo admita o exentarlo con justificación.
- **D-19 Campos:**
  - nombre, rubro (una línea);
  - logo: subida de imagen, reusar `el-templo-api/src/modules/blog/image-service.ts`; fallback ícono o monograma;
  - color de fondo + color de texto, **contraste validado ≥ 4.5 en el editor**;
  - beneficio (corto, grande) + detalle + condiciones (texto largo);
  - canje: `code` (+ código) o `carnet`;
  - países (AR/ES, uno o ambos);
  - vigencia desde/hasta opcional + activo/inactivo;
  - orden;
  - `partner_id` opcional.
- **D-20 Segmentación por país:** el socio ve las marcas de su `branchCountry`, activas y dentro de vigencia (fecha en zona de la sede).
- **D-21 Quién lo ve: todos** (con y sin plan, invitados). **El canje exige plan activo:**
  - sin plan, la hoja de detalle muestra el beneficio con candado y "Activá tu plan para usarlo" (mismo destino que Arrancá/Renová);
  - el carnet solo se abre con plan activo.
- **D-22 Al tocar una card → hoja inferior de detalle:** logo, nombre, rubro, beneficio, detalle, condiciones.
  - Canje `code`: código grande + "Copiar".
  - Canje `carnet`: "Mostrá tu carnet" → pantalla completa con nombre y apellido, sede · plan, "Socio activo" (verde), fecha de hoy y **hora en vivo** (con segundos, para que no sirva una captura vieja), "Mostrale esta pantalla al comercio", "Listo".
  - **La app NO tiene QR de miembro** (solo el escáner `html5-qrcode`): la pastilla dice "Mostrá tu carnet", no "Mostrá tu QR".
- **D-23 Carrusel en la app:**
  - cards con el color de la marca, 82 % del ancho, la siguiente asoma a escala .94 (**sin opacidad sobre textos**);
  - logo cuadrado redondeado en colores invertidos;
  - nombre, rubro, beneficio 30 px sin quiebre, detalle, pastilla de canje invertida (sólida);
  - marca de agua decorativa a .13 (no es texto);
  - avanza solo (**intervalo: 2 s según el brief; el sketch tiene un control 2 s / 4 s, dejarlo como constante fácil de cambiar** y preguntar a Franco en UAT);
  - se pausa al tocar y retoma a los 3 s; puntos con barra de progreso; sin avance automático con `prefers-reduced-motion`; sin título de sección.
  - Margen de la pila: 16 (NO los 28 px del mockup de la presentación).
- **D-24 Límite de activas:** configurable en la pestaña Patrocinadores, default **6 por país**. El admin no deja activar por encima del límite.
  - Es configuración de plataforma: decidir en el plan dónde se guarda.
  - Si va en `tenant_settings`: **trampa conocida**, el test `0190-0191-tenants` (Test 3) tiene allowlist de namespaces; sumar el nuevo y limpiar el namespace en los tests que lo siembren (`cleanAllTestData` no limpia `tenant_settings`).
- **D-25 Métricas (molde `novedad_views`):** una fila por (socio, marca) con `tenant_id` del socio (gym-owned → 5 conteos), `first_seen_at` (card activa en el carrusel), `tapped_at` (abrió el detalle) y `redeem_at` (copió el código o abrió el carnet). En el admin, por marca: vieron / tocaron / intentaron canjear (socios únicos). Eventos fail-open.
- **D-26 Admin: en PARTNERS, no en Comunicaciones.**
  - Pestaña nueva "Patrocinadores" en `el-templo-admin/src/pages/PartnersPage.vue` (junto a Partners · Conversiones · Liquidación): lista ordenable, alta/edición con **vista previa en vivo de la card como en la app** (y de la hoja de detalle), activar/desactivar, vigencia, países, límite configurable, métricas.
  - Atajo en la fila de un partner: "Crear card para Mi Templo" (precarga nombre y contacto).
  - Solo admins de El Templo / super owner (no admins de otros gimnasios).

### Claude's Discretion

- Partición en planes y waves (ejecución SECUENCIAL, worktree compartido).
- Nombres de tablas, columnas, rutas y componentes.
- Cómo se pinta "Tu semana" si la API no da los días: derivar de `completedDates`.
- Estructura de componentes: TodayCard, SponsorsCarousel, SponsorSheet, MemberCard, etc.
  </decisions>

<code_context>

## Existing Code Insights

- **Página:** `el-templo-app/src/modules/progression/pages/MiTemplo.vue` (646 líneas). Cards en `modules/progression/components/` (SessionCtaCard, BookingStatusCard, RestDayCard, WeeklySummaryCard, GeneralContent, DailyQuote, CheckInCard, PermissionBanner, NovedadesCard, ImprovementCtaCard, ReferralCtaCard, UpsellBadge, AvisoCard) y `modules/programs/components/` (ProgramCtaCard, ProgramProgressCard).
- **Layout:**
  - `el-templo-app/src/layouts/MainLayout.vue`: saludo móvil `.mobile-greeting` dentro de `q-page-container`, `.app-bg` (:403-413), FAB check-in (:312-318), tab bar `.mobile-tabs` 56 px.
  - Marcador azul de staging en `css/app.scss:209` (`body.staging-env`), solo staging.
- **Tokens:** `src/css/quasar.variables.scss` (`$primary #96593a`, `$secondary #7d5d42`, `$accent #3d3732`, `$info #6b6459`, `$cream #f2ede5`, `$positive #3b7249`), `src/css/_brand.scss`. Fuentes `@fontsource` (Geologica body, Montserrat headings, Cormorant, Cinzel) importadas en `css/app.scss`.
- **Datos que ya existen:**
  - `/progression/stats` (todaySession, evaluation, stats.totalSessions);
  - `/sessions/weekly` (sessions por fecha + `completedDates`);
  - `/check-ins/today`;
  - `/members/scheduling/my-bookings`;
  - `/members/subscription/me/subscription` (204 si no hay plan activo/pausado/programado);
  - `/communications/me/{novedades,tarjetas,prompt}`;
  - `useUserStore` (`hasActiveSubscription`, `profile.branchIsVirtual`, `branchCountry`, `allActiveEnrollments`).
- **Todo depende de `/progression/stats`:** mientras no responde, la página es un loader (`MiTemplo.vue:4`). Mantener o mejorar (no empeorar).
- **Tracking existente:** `aviso_events` (clics de tarjetas), `novedad_views`. Patrón para la tabla de métricas de patrocinadores.
- **Admin Partners:** `PartnersPage.vue` (tabs partners/conversiones/liquidacion, filtros país/sucursal); schema `referral_partners` (gym-owned, `branchId` obligatorio).
- **Imagen:** `el-templo-api/src/modules/blog/image-service.ts`.
- **Novedades (base de la rama):** mig 0275, `modules/communications/novedades-service.ts`, admin con selector de sedes por país (fix `de257ec70`).
  </code_context>

<constraints>
## Reglas duras

- Rama `feat/199-mi-templo-rediseno` (desde `feat/novedades-mi-templo`), worktree `/home/franco/projects/et-199-mi-templo`. **Sin push** hasta el OK de Franco (staging, junto con Novedades).
- **Sin bump de versión.**
- **Migraciones desde 0279.** Sin `;` en comentarios SQL. Datos de prod por migración. Runner propio (`pnpm db:migrate`), nunca `drizzle-kit migrate`.
- Patrones:
  - `createLogger()` en front, Pino en API, sin `console.*`;
  - sin `any`, `catch (err: unknown)`;
  - composables con `cleanup()`, sin `onUnmounted` adentro;
  - Pinia setup stores.
- **Rutas nuevas:** manifiesto fail-closed + gates de tenancy (ISO-03, baselines). **Tabla gym-owned nueva:** subir los 5 conteos fijos.
- **Tests de integración** para cada ruta nueva (`el-templo-api/test/`), sin hardcodear ids de `users`.
- **Tests corren en CI**, no local. Typecheck sí: API `npx tsc --noEmit` = 0, `pnpm lint:tenant` limpio, app `npx vue-tsc --noEmit` ≤ 18, admin ≤ 21, eslint sin errores.
- Única dependencia nueva aprobada: `@fontsource/nunito-sans`.
- `git add` explícito (nunca `-A`). Prohibido `git stash` en worktrees.

## Validación (criterios de éxito del prompt de Franco)

- 100 % de textos WCAG 2.2 sobre el fondo real: correr `herramientas/contrast.py` sobre capturas "después" de las 7 variantes.
- Capturas antes/después de cada variante a 360/390/412 sin overflow horizontal.
- CTA principal (card de hoy) dentro del primer viewport de 390×844 en todas las variantes.
- Prueba de 5 s con 3–5 socios (guion en `.docs/mi-templo-prueba-5-segundos.md`), después de staging.
  </constraints>

<deferred>
## Deferred

- Sección de Kaia con novedades/patrocinios de la plataforma para socios de otros gimnasios.
- QR de miembro validable por comercios.
- Métricas de clics de CTA de Mi Templo / tiempo al check-in (descartadas por ahora).
- Fuente única de frases vía API (hoy se copian del TV).
- Velocidad definitiva del carrusel de patrocinadores (2 s vs 4 s): decidir en UAT.
  </deferred>
