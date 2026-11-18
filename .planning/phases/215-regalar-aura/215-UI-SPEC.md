---
phase: 215
slug: regalar-aura
status: draft
shadcn_initialized: false
preset: none
created: 2026-11-18
---

# Phase 215 — UI Design Contract

> Contrato visual y de interacción de las pantallas de la fase 215 (Regalar Aura).
> Generado por gsd-ui-researcher, lo valida gsd-ui-checker. Escrito en modo autónomo: cada decisión
> que no estaba tomada quedó anotada en `215-DECISIONES-AUTONOMAS.md`.

**Fuentes de verdad, en este orden:**

1. `215-CONTEXT.md` (D-01 a D-22, son ley) y `215-DECISIONES-AUTONOMAS.md`.
2. Sketches elegidos, que acá se transcriben y no se rediseñan: **034 variante A** (una sola hoja con las
   caras arriba y los motivos abajo) y **035 variante B** (pantalla propia "Notificaciones", agrupada
   por día). Lo que el sketch 034 dibuja igual en sus tres variantes (la card de hoy, el aviso corto
   después de dar) también se transcribe.
3. `214-UI-SPEC.md` (aprobado) y el código real de la punta de la 214: `_premium-card.scss` (`$pd-*`),
   `_brand.scss` (`mt-block-title`), `TodayCard.vue`, `AttendeesSheet.vue`, `AuraDetailSheet.vue`,
   `MemberAvatar.vue`, `MainLayout.vue` y, en el admin, `SlotAttendancePanel.vue` y `templo-config.ts`.

**Reglas heredadas de la 214, que siguen vigentes:**

- **Transcripción.** Si el sketch tiene un valor puesto a mano y el código ya tiene un token, manda el
  token. Cada desvío está marcado **[ajuste]** con su motivo (escala, contraste, código existente).
- **Textos.** Lo marcado **[BORRADOR]** es nuevo y Franco no lo aprobó. La tabla de Copywriting dice el
  origen de cada texto. Rioplatense, con vos.
- **Montos.** Ningún monto de Aura va escrito a mano en un texto. La app suma `giftMember: 1` a
  `AURA_AMOUNTS_UI` (`src/constants/aura-amounts.ts`) y el admin a `AURA_AMOUNTS`
  (`src/config/aura-amounts.ts`), espejo de `AURA_AMOUNTS.giftMember` de la API. El valor del regalo
  del profe sale siempre del servidor (es editable). Los montos que llegan del servidor se muestran
  tal cual.
- **Dorado solo para Aura**, Aura siempre en claro (número visible, D-02 de la 214), ningún texto con
  color transparente, todo lo tocable de 44×44 o más.
- **D-22.** Ningún texto nuevo promete que el regalo es privado.

---

## Datos que la UI necesita del servidor

La UI no decide ninguna regla (cupo, ventana, tope semanal, visibilidad, roles): solo pinta lo que el
servidor marca. Este es el contrato mínimo que los planes de servidor tienen que entregar. Los nombres
son una propuesta; si el planificador los cambia, cambian acá.

| Ruta                                                                            | Respuesta que usa la UI                                                                                                                                                                                                                                                         | Pantalla |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `GET /api/members/aura/gifts/pending`                                           | `pending[{ attendanceId, sessionDate, startTime, activityName, expiresOn }]` ordenado por `expiresOn` ascendente, y `givenToday[{ attendanceId, receiver{ firstName, lastInitial, photoUrl }, reason }]`                                                                        | 1        |
| `GET /api/members/aura/gifts/candidates?attendanceId=`                          | `class{ sessionDate, startTime, activityName }`, `candidates[{ receiverAttendanceId, firstName, lastInitial, photoUrl, blockedReason: 'tope_semanal' \| null }]` en orden de reserva                                                                                            | 2        |
| `POST /api/members/aura/gifts` `{ attendanceId, receiverAttendanceId, reason }` | 201 `{ receiverFirstName, reason }`; errores con `code`: `REGALO_TOPE_SEMANAL`, `REGALO_YA_DADO`, `REGALO_VENCIDO`, `REGALO_NO_DISPONIBLE` (409), 404, 429                                                                                                                      | 2        |
| `GET /api/members/notifications/unread-count`                                   | `{ count }`                                                                                                                                                                                                                                                                     | 3        |
| `GET /api/members/notifications?before&limit=30`                                | `items[{ id, kind, title, body, route, destination, whatsappText, createdAt, readAt, gift }]`, `nextBefore`. `gift` es null salvo en los regalos: `{ amount, giverKind: 'alumno' \| 'profe', giverFirstName, giverLastInitial, giverPhotoUrl, status: 'vigente' \| 'anulado' }` | 4        |
| `POST /api/members/notifications/:id/read` · `POST .../read-all`                | 204                                                                                                                                                                                                                                                                             | 4        |
| `GET /api/members/aura/movements` (214)                                         | `label` nuevo para `social`: "{Nombre} te dio Aura · {Motivo}", "Tu profe {Nombre} te dio Aura · {Motivo}", "Regalo anulado"                                                                                                                                                    | 5        |
| Panel de asistencia del admin (respuesta existente)                             | `coachGiftAmount` arriba, y por fila `gift: { state: 'disponible' \| 'dado' \| 'no_participa', amount, reason } \| null` (null = quien mira no regala como profe)                                                                                                               | 6a       |
| `POST /api/admin/aura/gifts` `{ attendanceId, reason }`                         | 201 `{ amount }`; 409 `REGALO_YA_DADO`, `REGALO_VENCIDO`, `REGALO_NO_DISPONIBLE`                                                                                                                                                                                                | 6a       |
| `GET /api/admin/aura/gifts?branchId&days&includeVoided`                         | `items[{ id, sessionDate, startTime, giverName, giverKind, receiverName, reason, amount, status, voidCause, voidedByName }]`, `weeks[{ weekStart, studentGifts, coachGifts, attendees, giversPct }]`                                                                            | 6b       |
| `POST /api/admin/aura/gifts/:id/void`                                           | 204; 409 si ya estaba anulado                                                                                                                                                                                                                                                   | 6b       |
| `GET` / `PUT /api/admin/aura/gift-settings`                                     | `{ coachGiftAmount }` (entero de 1 a 10)                                                                                                                                                                                                                                        | 6c       |

**Códigos de motivo** (D-16, sin texto libre). La app y el admin tienen un espejo `GIFT_REASONS` con el
texto; la API manda el código:

| Código       | Texto (Franco) |
| ------------ | -------------- |
| `tecnica`    | Buena técnica  |
| `constancia` | Constancia     |
| `energia`    | Buena energía  |
| `ayudo`      | Me ayudó       |

**Lo que la UI nunca muestra:** el apellido completo de un compañero (solo nombre de pila e inicial,
como en la 214), por qué una persona no está entre las caras (oculta, staff, sin asistencia), quién
anuló un regalo (solo lo ve el staff) y cuántos regalos recibió alguien en total.

---

## Design System

| Property            | Value                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool                | none. Quasar 2 + Vue 3, no React: el gate de shadcn no aplica                                                                                                                  |
| Preset              | not applicable                                                                                                                                                                 |
| Component library   | Quasar (`q-dialog position="bottom"`, `q-btn`, `q-skeleton`, `q-table`, `q-option-group`) + componentes propios de la 214 (`MemberAvatar`, patrón de hoja de `AttendeesSheet`) |
| Icon library        | Material Icons (la de Quasar, ya cargada en la app y el admin)                                                                                                                 |
| Font                | Montserrat (títulos y números; 600, 700, 800), Geologica (cuerpo; 400, 500, 600, **no 700**), Cinzel (kickers; 700). Todo con `@fontsource`, ya instalado                      |
| Dependencias nuevas | Ninguna                                                                                                                                                                        |

**Componentes nuevos (nombres sugeridos para el planificador):**

| Componente                                                                         | Pantalla | Reusa                                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| fila de regalo dentro de `TodayCard.vue` (`today-card__gift`)                      | 1        | el modelo de la card; el dato llega de un store nuevo `useAuraGiftsStore`                                                                         |
| `src/components/GiveAuraSheet.vue`                                                 | 2        | marco, agarradera, cabecera, pie y estados de `AttendeesSheet.vue`; `MemberAvatar`; `useBackButtonClose`                                          |
| `src/components/NotificationBell.vue` + `NotificationCountBadge.vue`               | 3        | `q-btn flat round` de la barra; el badge lo comparten la campana y el riel                                                                        |
| `src/pages/NotificationsPage.vue` (ruta `/notificaciones`, nombre `notifications`) | 4        | encabezado con flecha de `ChangePasswordPage.vue`; formateo de fecha de la 214 (`aura-format`); `resolveTapRoute` de `boot/push-notifications.ts` |
| `src/stores/notifications-inbox.ts`                                                | 3, 4     | Pinia en composición                                                                                                                              |
| `MemberAvatar.vue`: tamaños nuevos **32** y **40**                                 | 1, 4     | iniciales en Label numérico 13/700                                                                                                                |
| Admin `src/components/CoachGiftDialog.vue`                                         | 6a       | `q-dialog` estándar del admin                                                                                                                     |
| Admin `src/pages/RegalosAuraPage.vue` (ruta `/alumnos/regalos`)                    | 6b, 6c   | patrón de `FotosPerfilPage.vue`                                                                                                                   |

**DRY.** La hoja nueva repite el marco de las tres hojas claras de la 214 (fondo, radio, agarradera,
paddings, pie fijo). Se recomienda sacar esos valores a un mixin `pd-sheet-light` en
`_premium-card.scss` y usarlo en `GiveAuraSheet`. Pasar las hojas de la 214 al mixin queda fuera de
esta fase (no se tocan componentes que ya están en UAT).

---

## Spacing Scale

Valores declarados (múltiplos de 4, el mismo set de la 214):

| Token | Value | Usage                                                                                                                                                                                                                                                    |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| xs    | 4px   | gap entre cara y nombre en la grilla; gap entre título y bajada de una fila de aviso; margen inferior de la agarradera                                                                                                                                   |
| sm    | 8px   | gap de columnas de la grilla y entre motivos; padding vertical de las celdas y de las filas de aviso; separación entre el botón de regalo y su línea de ayuda; gap de la fila "Le diste Aura"                                                            |
| md    | 16px  | margen lateral de página; gap de filas de la grilla; padding horizontal de los motivos y de las filas de aviso; aire entre la grilla y "¿Por qué?"; margen superior de la fila de regalo en la card de hoy; gap entre ícono y texto de una fila de aviso |
| lg    | 24px  | padding del estado vacío de Notificaciones; margen inferior de "Ver más"                                                                                                                                                                                 |
| xl    | 32px  | aire inferior de la hoja sobre la zona segura (16 + 16 del pie)                                                                                                                                                                                          |
| 2xl   | 48px  | alto de `pd-cta`, del botón de regalo de la card y de "Ver más"                                                                                                                                                                                          |
| 3xl   | 64px  | alto mínimo de una fila de aviso                                                                                                                                                                                                                         |

**Excepciones:**

| Valor      | Dónde                                                                                               | Por qué                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 20px       | padding horizontal de la hoja "Dar Aura" (cabecera, cuerpo y pie)                                   | es el borde de todas las hojas claras de la app (`SponsorSheet`, 214) |
| 2px        | aro de la cara elegida, borde del motivo elegido (1px de borde + 1px de `box-shadow` interior), filete del botón de regalo | son bordes, no espaciado. El sketch decía 1.5, **[ajuste]** a 2       |
| Existentes | card de hoy (`padding 20 16 16`, gap de acciones 14, borde 1.5), barra de arriba (`q-toolbar` 0 12) | código existente que esta fase no cambia                              |

Medidas de componentes (no son espaciado): caras de 56, avatares de 32 y 40, insignia de tilde de 20,
badge de la campana de 18, punto de sin leer de 8, botones de la barra de 44.

---

## Typography

### Escala de la fase: 4 tamaños (13, 15, 18 + 11 de mixins existentes)

| Role           | Size | Weight | Line Height | Fuente     | Dónde                                                                                                                                                                                    |
| -------------- | ---- | ------ | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label          | 13px | 400    | 1.35        | Geologica  | nombres en la grilla, línea de la cabecera de la hoja, ayuda bajo el botón de regalo, fila "Le diste Aura", nota del tope semanal, bajada y hora de cada aviso, "Marcar todo como leído" |
| Label numérico | 13px | 700    | 1.2         | Montserrat | pastilla "✦ +1" de los avisos; iniciales de los avatares de 32 y 40                                                                                                                      |
| Body           | 15px | 400    | 1.5         | Geologica  | motivos, texto de ayuda de la hoja, título de cada aviso, textos de estados vacío y error                                                                                                |
| Heading        | 18px | 700    | 1.2         | Montserrat | título de la hoja ("¿A quién de tu clase?"), título "Notificaciones", títulos de estados vacíos, iniciales de las caras de 56                                                            |

No se usa Display en esta fase.

### Pesos

**Declarados: 400 y 700.** Geologica nunca va en 700 (no está cargado). El énfasis en Geologica se
hace con color, no con peso: **[ajuste]** el sketch 035 ponía el nombre en negrita dentro del título
del aviso y el 034 el motivo elegido en 600; acá van en 400.

| Excepción | Elemento                                                                                | Motivo                                                                                |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 600       | texto de `pd-cta` ("Darle Aura a Sofía", "Reintentar") y del botón de regalo de la card | mixin existente `pd-cta` (Geologica 600 15)                                           |
| 800       | "¿POR QUÉ?" de la hoja                                                                  | mixin existente `mt-block-title` (Montserrat 800 13). **[ajuste]** el sketch usaba 12 |

### Excepciones de tamaño

| Tamaño     | Elemento                                                             | Motivo                                                                                                                                |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 11px       | kicker "DAR AURA"                                                    | mixin existente `pd-kicker-light` (Cinzel 700 11)                                                                                     |
| 11px       | encabezado de día "HOY", "AYER", "LUN 10 NOV" en Notificaciones      | mixin existente `pd-label-11` (Montserrat 700 11, `$pd-ink-3`, 7.17:1). **[ajuste]** el sketch usaba Montserrat 800 11 en `$pd-ink-2` |
| 11px       | número del badge de la campana (Montserrat 700)                      | dentro de un círculo de 18; el sketch usaba 10, **[ajuste]** a 11                                                                     |
| Existentes | card de hoy (kicker 12, título 28, botón 15)                         | código de la fase 199, sin cambios                                                                                                    |
| Admin      | `text-h5`, `text-h6`, `text-subtitle1`, `text-body2`, `text-caption` | tipografía estándar del admin                                                                                                         |

Montos con `font-variant-numeric: tabular-nums`. La chispa "✦" toma el tamaño del texto que acompaña
y es decorativa (`aria-hidden`).

---

## Color

| Role                  | Value                                                                                                                                                                                                                    | Usage                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Dominant (60%)        | `#fbf8f3` (`$pd-light-surface`) en la hoja "Dar Aura" y en la página Notificaciones; `#f2ede5` (`$brand-cream`) en Mi Templo                                                                                             | superficies claras                                                                         |
| Secondary (30%)       | `#2c2318` (`$pd-surface`) de la card de hoy; degradé `$brand-terracotta #96593a → $brand-aged-gold #7d5d42` de la barra de arriba; `#ffffff` de los motivos sin elegir; `#f3ede4` círculo de ícono de los avisos comunes | card, barra, controles                                                                     |
| Accent (10%)          | familia Aura de la 214: `$pd-gold #d4b46a`, `$pd-gold-ink #7d6520`, `$pd-gold-tint #f6efdc`, `$pd-aura-deep #6a5217`, `$pd-aura-spark #c9a227`, `$pd-aura-ivory-a #fffdf8` y el filete `pd-aura-frame`                   | ver la lista de abajo                                                                      |
| Acción (no es accent) | `$pd-terra-ink #96593a`, degradé `$pd-btn-a #a35f3c → $pd-btn-b #7e4529`                                                                                                                                                 | "Darle Aura a Sofía", links, flecha de volver, punto de sin leer, "Marcar todo como leído" |
| Destructive           | `$pd-neg-title #a8423f` (texto, app) y `negative` de Quasar (admin)                                                                                                                                                      | monto "−1" de "Regalo anulado"; "Anular" en el admin                                       |

**El dorado se usa solo en:**

1. el botón "✦ Dale Aura a un compañero" de la card de hoy: material de la ficha L1 (fondo marfil
   `#fffdf8 → #f6efdc`, filete `pd-aura-frame` de 2px, texto `$pd-aura-deep`). Es la única excepción a
   "nunca dorado en botones" de la 214, porque este botón **es** un regalo de Aura (como la ficha L1,
   que también es un botón dorado). El botón que confirma en la hoja es terracota;
2. la cara y el motivo elegidos en la hoja (tinte, aro y tilde);
3. la pastilla "✦ +N" y el círculo "✦" de los avisos de regalo en Notificaciones;
4. los montos positivos de los regalos en el detalle de Aura (ya es así en la 214);
5. en el admin: el ícono de "Dar Aura", el chip "Le diste +2" del panel de asistencia y la columna de
   puntos de la página de regalos (`$pd-gold-ink` como texto, 5.59:1 sobre blanco).

**Nunca dorado:** la campana, su badge y el punto de sin leer (terracota y crema), el botón "Darle Aura
a Sofía", "Marcar todo como leído", "Anular" y los avisos que no son regalos.

**Literales del sketch que se mantienen** (como el `#f1eadf` de la 214): fondo de aviso sin leer
`#fffaf0` y borde entre filas `#f1eadf`. Son decorativos; el texto encima va sólido.

**Contrastes medidos (WCAG):**

| Par                                                                | Ratio        | Uso                                                                     |
| ------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------- |
| `$pd-aura-deep #6a5217` / `#f6efdc` · / `#fffdf8`                  | 6.46 · 7.29  | texto del botón de regalo de la card                                    |
| `$pd-gold-ink #7d6520` / `$pd-gold-tint`                           | 4.87         | motivo elegido, pastilla "✦ +1"                                         |
| blanco / `$pd-gold-ink`                                            | 5.59         | tilde de la cara elegida (indicador no textual ≥ 3)                     |
| `$pd-gold-ink` / `$pd-gold-tint` (borde 2px visible del motivo elegido)    | 4.87         | indicador de estado ≥ 3                                                 |
| `$pd-light-edge #8c806f` / `#fbf8f3` · / `#fff`                    | 3.65 · 3.87  | borde de los motivos sin elegir (control, WCAG 1.4.11)                  |
| `$pd-gold #d4b46a` / `#fbf8f3`                                     | 1.88         | aro de la cara elegida: **solo decorativo**; el estado lo dice la tilde |
| `$pd-cream-3 #c9bba6` / `#2c2318`                                  | 8.19         | ayuda bajo el botón de regalo                                           |
| `$pd-cream #f0e6d6` / `#40362b` (fondo de la fila "Le diste Aura") | 9.54         | texto de la fila "Le diste Aura"                                        |
| `$pd-ink #2c2318` / `#fffaf0` · `$pd-ink-2` / `#fffaf0`            | 14.83 · 6.75 | título y bajada de un aviso sin leer                                    |
| `$pd-ink-2 #5f584d` / `#fbf8f3`                                    | 6.63         | bajada de un aviso leído, nota del tope semanal                         |
| `$pd-terra-ink #96593a` / `#fbf8f3` · / `#fffaf0`                  | 5.23 · 5.33  | número del badge, punto de sin leer, links                              |
| `$pd-terra-ink` / `#f3ede4`                                        | 4.77         | ícono de los avisos comunes                                             |
| `$pd-ink-3 #5a5347` / `#fbf8f3`                                    | 7.17         | encabezados de día                                                      |
| blanco / `#96593a` · / `#7d5d42`                                   | 5.55 · 5.97  | íconos de la barra (perfil, campana, salir)                             |
| `$pd-neg-title #a8423f` / `#fbf8f3`                                | 5.64         | "−1" de "Regalo anulado"                                                |

---

## Foco visual por pantalla

1. **Card de hoy después de la clase:** el título de la clase sigue mandando; el botón dorado es lo
   segundo.
2. **Hoja "Dar Aura":** las caras. Los motivos se leen como el segundo paso de la misma hoja.
3. **Barra de arriba:** la campana no compite con el selector de nivel; el badge es lo único que llama.
4. **Notificaciones:** la primera fila sin leer.
5. **Detalle de Aura:** el total grande (sin cambios); las filas de regalo se leen como cualquier otra.
6. **Admin:** en el panel, la lista de asistencia (el regalo es una acción más de la fila); en la
   página de regalos, la tabla.

---

## Pantalla 1 — Oferta "Dale Aura a un compañero" en la card de hoy (D-02, D-07, D-12, D-14)

Sketch 034 (común a las tres variantes). La oferta vive **dentro** de `TodayCard`, en una fila propia
(`today-card__gift`) debajo de la fila de acciones, después de `today-card__actions`.

**[ajuste] de ubicación.** El sketch pone el botón dorado al lado de "Estirar", en la misma fila. La fila
de acciones de la card es de una sola línea (`flex-wrap: nowrap`, fase 197) y a 360 px el ancho útil es
de unos 293 px: "Estirar" (botón 48) + "✦ Dale Aura a un compañero" (unos 250 px) no entran. Por eso el
regalo va en su propia fila, debajo, y la fila de acciones no cambia (Estirar y su link siguen igual).

**El alto fijo de la card** (cuatro filas, fase 197) se mantiene para todos los estados. La fila de
regalo es una quinta fila **condicional** que solo aparece cuando el servidor dice que hay algo que
mostrar. Para no saltar al volver a Mi Templo, el store conserva el último dato del día (igual que
`useStretchStore`) y la fila no reserva lugar mientras carga: sin dato no hay fila (fail-open, fase
203). Se muestra con cualquier `kind` de la card salvo `cargando` y `neutral`.

### Estados

| Estado                                                                 | Condición (la decide el servidor)                                    | Qué se ve                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tiene un regalo                                                        | `pending.length === 1`                                               | botón dorado + ayuda                                                                       |
| Tiene dos o más                                                        | `pending.length > 1`                                                 | botón dorado + ayuda en plural. El botón abre la clase que vence antes (`pending[0]`)      |
| Ya lo dio                                                              | `pending` vacío y `givenToday` con al menos uno                      | fila "Le diste Aura a Sofía · Buena energía" (la del último regalo)                        |
| Ya dio uno y le queda otro                                             | `pending` y `givenToday` con datos                                   | solo el botón y la ayuda (lo pendiente manda)                                              |
| Venció                                                                 | la clase salió de `pending` por la ventana D-12                      | nada. Sin mensaje de "se te pasó"                                                          |
| Fue el único, o todos sus compañeros ya recibieron 2 suyos esta semana | el servidor no incluye esa clase en `pending` (no hay a quién darle) | nada                                                                                       |
| Está oculto (D-07), viene por Wellhub sin plan o no tiene plan         | `pending` y `givenToday` vacíos                                      | nada. No se le explica ni se lo invita a hacerse visible (no se insiste con la privacidad) |
| La consulta falla                                                      | —                                                                    | nada (fail-open)                                                                           |
| Módulo de Aura apagado (`auraEarned === null`)                         | —                                                                    | nada; el store no hace la consulta                                                         |

### Botón "✦ Dale Aura a un compañero"

- `<button type="button">`, `margin-top 16` desde la fila de acciones.
- Alto 48 (**[ajuste]** el sketch tenía 42; 48 es el alto del botón de la card), `padding 0 16`,
  `border-radius 10` (**[ajuste]** el sketch era una pastilla; 10 es el radio de `today-card__btn`),
  `display inline-flex`, gap 8, ancho automático, `max-width 100%` con elipsis.
- Fondo `linear-gradient(180deg, $pd-aura-ivory-a, $pd-gold-tint)` con el filete `pd-aura-frame` de 2px
  como borde (`padding-box` / `border-box`). Sin sombra de color.
- Texto Geologica 600 15 en `$pd-aura-deep`. La chispa "✦" va primero, en `$pd-aura-spark`,
  `aria-hidden`.
- Al apretar: `transform: scale(.97)`, solo con `prefers-reduced-motion: no-preference`. Sin destello.
- Foco: `outline 2px solid $pd-cream-2`, offset 2 (como los botones de la card).
- `aria-label` **[BORRADOR]**: "Dale Aura a un compañero de tu clase de hoy de las 18:00" (o "de ayer").

### Ayuda bajo el botón

Label 13/400, `$pd-cream-3`, `margin-top 8`, hasta 2 renglones. **[ajuste]** el sketch la ponía debajo
de la card, sobre la página; acá queda dentro, junto a su botón.

| Caso          | Texto                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Clase de hoy  | "Tenés un regalo de Aura por la clase de hoy. Podés darlo hasta mañana a la noche." (sketch 034) |
| Clase de ayer | **[BORRADOR]** "Tenés un regalo de Aura por la clase de ayer. Podés darlo hasta hoy a la noche." |
| Dos o más     | **[BORRADOR]** "Tenés {n} regalos de Aura para dar. El primero vence {hoy\|mañana} a la noche."  |

"Hoy" y "ayer" se calculan con `sessionDate` y la zona de la sede (`branchTimezone`), nunca con la del
teléfono.

### Fila "Le diste Aura"

- `margin-top 16`, `padding 8 16`, `border-radius 12`, fondo `rgba(240,230,214,.1)` (sketch), flex,
  `align-items center`, gap 8. **[ajuste]** el sketch tenía `padding 10 12`, gap 10 y radio 14.
- `MemberAvatar` 32 del que recibió (foto o iniciales).
- Texto Label 13/400 `$pd-cream`: "Le diste Aura a Sofía · Buena energía" (sketch 034; nombre de pila).
  **[ajuste]** el sketch usaba 13.5.
- No es interactiva. Se ve hasta el final del día local de la sede.

---

## Pantalla 2 — Hoja "Dar Aura" (`GiveAuraSheet.vue`, sketch 034 A, D-02, D-05, D-07, D-16)

Una sola hoja: caras arriba, motivos abajo, botón de confirmar en el pie. Se elige y se confirma sin
cambiar de pantalla.

### Marco (igual que "Quiénes van")

- `q-dialog position="bottom"`, `:transition-duration="reducedMotion ? 0 : 280"`,
  `aria-labelledby="give-aura-title"`.
- Card: ancho 100 %, `max-width 480`, `max-height 85vh` (**[ajuste]** el sketch tenía 86 %), fondo
  `$pd-light-surface`, radio `20px 20px 0 0` (sketch 22), sombra `0 -10px 40px rgba(44,35,24,.3)`, en
  columna.
- Agarradera 40×4, radio 2, `#d9cfc1`, `margin 8 auto 4`, `aria-hidden`.
- Botón "atrás" de Android cierra la hoja (`useBackButtonClose`). Un contador de pedidos descarta
  respuestas tardías (como `AuraDetailSheet`).

### Cabecera (fija, `padding 4 20 16`)

- Kicker "DAR AURA" (`pd-kicker-light`). Sketch: "Dar Aura" en Cinzel en mayúsculas.
- `h3#give-aura-title`, Heading 18: "¿A quién de tu clase?" (sketch; **[ajuste]** 19 → 18).
- Línea Label 13/400 `$pd-ink-2`: "Hoy 18:00 · elegí a una sola persona" (sketch 034), o "Ayer 18:00 ·
  elegí a una sola persona" **[BORRADOR]**. La hora es `startTime` de la clase.

### Cuerpo (scroll, `padding 0 20 8`)

**Grilla de caras:**

- `display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px 8px; padding: 8px 0`
  (**[ajuste]** el sketch tenía `14px 6px` y `4px 0 10px`: se usa la grilla de la 214).
- Grupo: `role="group"`, `aria-labelledby="give-aura-title"`.
- Celda: `<button type="button">` en columna centrada, gap 4, `min-width 0`, `padding 8px 0`, radio
  16 (sketch 14), `aria-pressed`.
  - `MemberAvatar` 56 (foto o iniciales, sin aro salvo elegida).
  - Nombre Label 13/400 `$pd-ink`, un renglón con elipsis: "Sofía M." (nombre de pila + inicial), o
    "Sofía" sin inicial.
  - **Sin pastilla de Aura** (el sketch no la tiene: acá se elige a quién, no se compara).
- **Elegida** (`aria-pressed="true"`):
  - fondo `$pd-gold-tint` y aro interior `inset 0 0 0 2px $pd-gold` (decorativo);
  - aro de la cara `0 0 0 2px $pd-light-surface, 0 0 0 4px $pd-aura-spark` (sketch);
  - **[ajuste]** insignia de tilde de 20 abajo a la derecha de la cara (`right/bottom -4`): círculo
    `$pd-gold-ink` con `check` 14 blanco (5.59:1). Así la elección no depende solo del color, que
    sobre el fondo claro no llega a 3:1.
  - Tocar la elegida la deselecciona (sketch A). Tocar otra cambia la elección.
- **Apagada por el tope semanal** (`blockedReason: 'tope_semanal'`, D-05):
  - `aria-disabled="true"`, sin acción al tocar;
  - la imagen o el círculo de iniciales con `opacity .45` y `filter: grayscale(1)` (solo la imagen;
    los controles deshabilitados quedan exentos de contraste);
  - el nombre sigue sólido, en `$pd-ink-2` (**[ajuste]** el sketch bajaba la opacidad de toda la
    celda, texto incluido: ningún texto va con transparencia);
  - `aria-label` **[BORRADOR]**: "Martín D. Ya le diste 2 esta semana".
  - **[ajuste]** El sketch escribía "Ya le diste 2 esta semana" dentro de la celda en 10.5 px. En la
    columna de unos 74 px a 360 no entra en 13 px, así que va una sola nota debajo de la grilla:
    ícono `info` 16 `$pd-ink-2` + Label 13/400 `$pd-ink-2`, `margin-top 8`, `role="note"`:
    - una persona **[BORRADOR]**: "Martín D. ya recibió 2 regalos tuyos esta semana. Vas a poder darle
      de nuevo el lunes.";
    - dos **[BORRADOR]**: "Martín D. y Juli S. ya recibieron 2 regalos tuyos esta semana. …";
    - tres o más **[BORRADOR]**: "{n} compañeros ya recibieron 2 regalos tuyos esta semana. …".
- Orden: el del servidor (orden de reserva). Quien regala no aparece. Tampoco el profe, los ocultos,
  los menores ocultos por regla ni quienes no tienen asistencia: el servidor no los manda y la UI no
  dice que faltan (sin grupo "+N más").

**Motivos:**

- Título `mt-block-title` "¿Por qué?" (sketch), `margin 16 0 8`.
- Fila `display flex; flex-wrap wrap; gap 8`, `role="group"`, `aria-label="Motivo"`.
- Cada motivo: `<button type="button">` con `aria-pressed`, alto 44 (**[ajuste]** el sketch tenía 38:
  área tocable), `padding 0 16`, radio 999, fondo `#fff`, borde `1px $pd-light-edge` (**[ajuste]** el
  sketch usaba `$pd-light-line`, que no llega a 3:1 para un control), Body 15/400 `$pd-ink`.
- **Elegido:** fondo `$pd-gold-tint`, borde `1px $pd-gold-ink` más `box-shadow: inset 0 0 0 1px $pd-gold-ink`
  (se ve como 2px sin salto de layout; el padding sigue en `0 16` en ambos estados), texto
  `$pd-gold-ink` en 400, y un ícono `check` 18 al principio (gap 4). Tocar el elegido lo deselecciona.
- Textos (Franco, D-16): "Buena técnica", "Constancia", "Buena energía", "Me ayudó".

**Ayuda** (Label 13/400 `$pd-ink-2`, `margin-top 16`):

- con alguien elegido: "A Sofía le llega un aviso con tu nombre y el motivo. A vos no te descuenta
  nada." (sketch 034);
- sin nadie elegido: "A esa persona le llega un aviso con tu nombre y el motivo. A vos no te descuenta
  nada." (sketch 034).

**Al elegir a alguien** con los motivos fuera de la vista (clases grandes), el cuerpo se desplaza hasta
"¿Por qué?" con `scrollIntoView({ block: 'nearest' })`, `behavior: 'smooth'` solo sin movimiento
reducido.

### Pie (fijo, `padding 16 20` + `env(safe-area-inset-bottom)`, `border-top 1px $pd-light-line`)

Un `pd-cta` de 48 a todo el ancho (**[ajuste]** el sketch tenía 46). El texto dice lo que falta:

| Selección       | Botón                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| nada            | deshabilitado: "Elegí a quién y por qué" (sketch)                                                |
| solo la persona | deshabilitado: "Elegí un motivo" (sketch, variante B)                                            |
| solo el motivo  | deshabilitado: **[BORRADOR]** "Elegí a quién"                                                    |
| las dos         | "Darle Aura a Sofía" (sketch; nombre de pila)                                                    |
| enviando        | `loading`, texto "Dando Aura…" **[BORRADOR]**; hoja `persistent`; caras y motivos deshabilitados |

No hay diálogo de confirmación aparte: el botón del pie es la confirmación (sketch A, "se elige y se
confirma sin cambiar de pantalla").

### Respuestas

| Respuesta                        | Qué pasa                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201                              | se cierra la hoja; notify positive "Le diste Aura a Sofía" (sketch 034, el aviso corto de abajo); el store vuelve a pedir `pending` y la card muestra la fila "Le diste Aura" o el regalo siguiente |
| 409 `REGALO_TOPE_SEMANAL`        | la hoja queda abierta, se vuelven a pedir los candidatos (la persona aparece apagada) y notify warning **[BORRADOR]** "Ya le diste 2 a {Nombre} esta semana. Elegí a otra persona."                 |
| 409 `REGALO_YA_DADO`             | se cierra, se vuelve a pedir `pending`, notify **[BORRADOR]** "Ya diste el regalo de esta clase."                                                                                                   |
| 409 `REGALO_VENCIDO`             | se cierra, se vuelve a pedir `pending`, notify **[BORRADOR]** "Se terminó el plazo para dar este regalo."                                                                                           |
| 409 `REGALO_NO_DISPONIBLE` o 404 | la hoja queda abierta, se vuelven a pedir los candidatos y se borra la elección; notify **[BORRADOR]** "{Nombre} ya no está en la lista. Elegí a otra persona."                                     |
| 429                              | queda abierta con la elección; notify **[BORRADOR]** "Esperá un momento y probá de nuevo."                                                                                                          |
| red o 5xx                        | queda abierta con la elección; notify negative **[BORRADOR]** "No pudimos dar el Aura. Probá de nuevo."                                                                                             |

### Estados de la hoja

| Estado                                                           | Cuerpo                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando                                                         | 8 celdas de esqueleto (`q-skeleton type="circle" size="56px"` + barra 48×13), `aria-busy="true"`. La cabecera ya muestra día y hora (vienen de `pending`). Los motivos se dibujan desde el principio, deshabilitados |
| Error                                                            | ícono `cloud_off` 32 `$pd-ink-2` + Body **[BORRADOR]** "No pudimos cargar tu clase." + `pd-cta-secondary-light` "Reintentar". `role="alert"`                                                                         |
| Vencido al abrir (`REGALO_VENCIDO` en candidatos)                | Body **[BORRADOR]** "Se terminó el plazo para dar este regalo." + "Cerrar"                                                                                                                                           |
| Sin candidatos (carrera: se ocultaron o se anuló una asistencia) | Heading **[BORRADOR]** "No hay a quién darle Aura" + Body **[BORRADOR]** "En esta clase no quedan compañeros que puedan recibirla." + "Cerrar"                                                                       |
| 1 a 20 caras                                                     | hasta 5 filas de 4; el cuerpo scrollea y cabecera y pie quedan fijos                                                                                                                                                 |
| Todos apagados menos uno                                         | la grilla con un solo botón activo y la nota del tope                                                                                                                                                                |

---

## Pantalla 3 — Campana en la barra de arriba (D-17, D-18)

### Celular (`MainLayout.vue`, `q-toolbar`)

Orden de derecha a izquierda: salir, **campana**, perfil, selector de nivel (solo en Entrenar). La
campana va entre perfil y salir (D-17).

- `q-btn flat round` igual que perfil y salir, con `flex-shrink: 0` en los tres y en el selector.
  **[ajuste]** los tres botones pasan de 42×42 (caja por defecto de Quasar) a **44×44** con una clase
  común (`min-width/min-height 44`), por la regla de tocables de 44 de la 214. Ícono `notifications` si hay sin leer, `notifications_none` si no (sketch 035). Blanco
  sobre el degradé (5.55–5.97:1).
- `q-tooltip` "Notificaciones" (como "Mi Perfil").
- `aria-label` **[BORRADOR]**: "Notificaciones, 3 sin leer" o "Notificaciones".
- En `/notificaciones`: fondo `rgba(255,255,255,.2)` (sketch, `.ib.on`) y `aria-current="page"`.
- Toca → `router.push({ name: 'notifications' })`. Si ya está ahí, no hace nada.

**Badge de sin leer (`NotificationCountBadge`).** Mismo lenguaje que el punto de novedad de la barra
(`.tab-dot`: crema con aro oscuro), con número:

- absoluto `top 4`, `right 4` dentro del botón; `min-width 18`, alto 18, `padding 0 4`, radio 999;
- fondo `#fbf8f3`, aro `0 0 0 2px $pd-btn-b #7e4529` (**[ajuste]** el sketch usaba `#a8744a`; se usa el
  aro de `.tab-dot`);
- número Montserrat 700 11, `$pd-terra-ink` (5.23:1), tabular-nums;
- 1 a 9 → el número; 10 o más → "9+"; 0 → sin badge;
- `aria-hidden` (el número ya está en el `aria-label` del botón). Sin animación.

**Ancho de la barra (resuelto con cuentas, a verificar en el UAT).** `q-toolbar` tiene padding 0 12 y
`q-toolbar-title` 0 12 y se encoge (`flex 1`, `min-width 1px`, `overflow hidden`); los botones no.

| Pantalla                  | Contenido                                                              | Ancho que ocupa | 360   | 390   |
| ------------------------- | ---------------------------------------------------------------------- | --------------- | ----- | ----- |
| Mi Templo y el resto      | logo 32 + gap 10 + "EL TEMPLO" 106 + perfil, campana y salir (3×44)    | 328             | entra | entra |
| Entrenar, menos de 460 px | logo 32 (link a Mi Templo) + selector hasta 122 ("SPARTAN") + 4 + 3×44 | 342             | entra | entra |
| Entrenar, 460 px o más    | lo de arriba + "EL TEMPLO"                                             | 458             | —     | —     |

- **Cambio:** el corte que oculta el título con el selector visible pasa de 420 a **460 px**
  (`hideTitleForLevelSelector`). Con 420, entre 420 y 457 px el título se recortaría.
- **No se achican los botones** (los tres quedan en 44). Se reemplaza la idea de "botones un poco más
  chicos en Entrenar a 360" de `215-DECISIONES-AUTONOMAS.md`: las cuentas muestran que no hace falta.
- UAT: ver la barra a 360, 390 y 412 en Mi Templo y en Entrenar con el nivel más largo, sin recorte del
  logo ni del selector.

### Escritorio (riel de la izquierda)

- Ítem nuevo entre "Mi Perfil" y "Salir" en `.desktop-rail__actions`, con el mismo estilo
  (`desktop-rail__tab`): ícono `notifications` / `notifications_none` 24 y label **"Notificaciones"**.
  **[ajuste]** la decisión autónoma decía "Avisos"; se usa el mismo nombre que la página y la campana.
- Activo en `/notificaciones` con el estilo `--active` existente.
- Badge: el mismo `NotificationCountBadge`, en la posición de `.desktop-rail__badge` (`top 8`,
  `left 38`).

### Cuándo se actualiza el número

Al iniciar sesión, al volver la app a primer plano, cuando llega una push con la app abierta (el
listener existente `pushNotificationReceived`; sigue sin mostrarse nada en pantalla, D-29), después de
tocar un aviso y después de "Marcar todo como leído". Si la consulta falla se conserva el último
número (no se pone 0).

---

## Pantalla 4 — Notificaciones (`NotificationsPage.vue`, sketch 035 B, D-18)

Pantalla propia a todo el alto, dentro del layout (con la barra de arriba y la de abajo, como
Perfil). Ruta `/notificaciones`, nombre `notifications`.

**[ajuste]** En el sketch la barra de arriba se reemplazaba por "← Notificaciones · Marcar leído". En la
app la barra es común a todas las pantallas; las pantallas con volver (Cambiar contraseña) ponen su
encabezado dentro de la página. Se hace igual.

### Encabezado (`padding 16 16 8`, flex, `align-items center`, gap 8)

- Botón volver: `q-btn flat round icon="arrow_back"` en `$pd-terra-ink`, 44×44, `aria-label="Volver"`.
  `router.back()` si hay historial; si no, `/mi-templo`.
- `h1` Heading 18 `$pd-ink`: "Notificaciones" (sketch).
- A la derecha, solo con algún sin leer: link "Marcar todo como leído" (sketch, variante A y C; en B
  decía "Marcar leído", **[ajuste]** al texto completo, que entra en la página). Label 13/400
  `$pd-terra-ink`, subrayado (`text-underline-offset 3px`), `min-height 44`.

### Lista

- Superficie `$pd-light-surface` a todo el ancho (sketch `.page`), `max-width 630` en escritorio.
- Agrupada por día, en la zona de la sede (`branchTimezone ?? DEFAULT_BRANCH_TZ`): "Hoy", "Ayer" y, si
  no, "Lun 10 nov" (más el año si no es el actual). Mismo formateador que las fechas del detalle de
  Aura de la 214. **[ajuste]** el sketch agrupaba "Esta semana"; la decisión es "agrupada por día".
- Encabezado de día: `pd-label-11`, `padding 16 16 8`. Cada día es un `<section>` con
  `aria-labelledby` a su encabezado y una `<ul>` sin estilo.

**Fila de aviso** (`<li>` con un `<button type="button">` a todo el ancho):

- flex, `align-items center`, gap 16 (sketch 12), `padding 8 16`, `min-height 64`, texto a la
  izquierda, `border-top 1px #f1eadf` (salvo la primera del día).
- **Sin leer:** fondo `#fffaf0` y punto de 8 `$pd-terra-ink` al final, centrado. Leído: sin fondo ni
  punto.
- **Ícono** (40, a la izquierda):
  - regalo de un alumno: `MemberAvatar` 40 del que regaló (`giverPhotoUrl` o iniciales);
  - regalo de un profe: círculo 40 `$pd-gold-tint` con aro `inset 0 0 0 2px $pd-gold` y "✦" 18 en
    `$pd-aura-spark` (sketch);
  - el resto: círculo 40 `#f3ede4` con un ícono 20 `$pd-terra-ink` según `kind`:

  | `kind`          | Ícono              |
  | --------------- | ------------------ |
  | `entrenamiento` | `event_available`  |
  | `programas`     | `school`           |
  | `motivacion`    | `self_improvement` |
  | `anuncios`      | `campaign`         |
  | `planes`        | `card_membership`  |
  | `referidos`     | `group_add`        |
  | otro            | `notifications`    |

- **Texto** (columna, `min-width 0`, gap 4):
  - título: `title` del aviso, Body 15/400 `$pd-ink`, hasta 2 renglones;
  - bajada: "18:42 · {body}", Label 13/400 `$pd-ink-2`, hasta 2 renglones. La hora va primero para que
    nunca se corte. **[ajuste]** el sketch decía "hace 20 min" al final: con la lista agrupada por día
    alcanza la hora, y no hay que refrescar textos relativos.
- **Pastilla** (solo regalos vigentes): "✦ +{gift.amount}", `padding 0 8`, `min-height 20`, radio 999,
  fondo `$pd-gold-tint`, Label numérico 13/700 `$pd-gold-ink` (chispa `$pd-gold`, decorativa).
  **[ajuste]** el sketch 035 mostraba la pastilla "+5"/"+50" también en avisos que no son regalos
  (foto aprobada, aniversario): acá va solo en regalos, porque el dorado de la bandeja queda reservado
  para Aura regalada. Es intencional, no una omisión.
  Regalo anulado: en lugar de la pastilla, "Anulado" **[BORRADOR]** en Label 13/400 `$pd-ink-2` sobre
  `#f3ede4`, mismas medidas. No se borra la fila: la bandeja es el historial de lo que se mandó.
- **Tocar:** marca leído en el momento (optimista; si falla, queda leído en pantalla y el número se
  corrige en la próxima consulta) y navega con la misma regla que el toque de una push
  (`resolveTapRoute` con `route`, `destination` y `whatsappText`).
- **Regalos:** la ruta es `/mi-templo?aura=detalle`. Mi Templo abre `AuraDetailSheet` si `auraEarned`
  no es null y limpia el parámetro con `router.replace`. Con el módulo apagado queda en Mi Templo.
- `aria-label` del botón **[BORRADOR]**: "Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena
  energía. Más 1 de Aura." (sin "Sin leer." si ya está leído; sin el monto si no es regalo).

**Abrir la pantalla no marca nada como leído**: solo tocar cada aviso o "Marcar todo como leído".

**Ver más:** si `nextBefore` no es null, botón `pd-cta` + `pd-cta-secondary-light` a todo el ancho
menos 32, alto 48, `margin 16 16 24`, "Ver más". Pide la página siguiente, queda en `loading` y el foco
va a la primera fila nueva. Como en el detalle de Aura de la 214.

**"Marcar todo como leído":** optimista (todas las filas pierden fondo y punto, el badge desaparece) y
el link se va. Si falla, vuelve atrás y notify negative **[BORRADOR]** "No pudimos marcar las
notificaciones. Probá de nuevo."

### Estados

| Estado             | Qué se ve                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando           | 6 filas de esqueleto (círculo 40 + barras 200×15 y 140×13), `aria-busy="true"`                                                                                                                                                         |
| Vacío              | centrado, `padding 24`: ícono `notifications_none` 40 en `$pd-light-edge` (decorativo), Heading 18 "Todavía no tenés avisos" y Body 15 `$pd-ink-2` "Acá van a quedar los que te mande la app." (sketch 035, partido en título y texto) |
| Error              | ícono `cloud_off` 32 + Body **[BORRADOR]** "No pudimos cargar tus notificaciones." + `pd-cta-secondary-light` "Reintentar". `role="alert"`                                                                                             |
| Error en "Ver más" | quedan las filas; vuelve el botón con notify negative **[BORRADOR]** "No pudimos cargar más notificaciones."                                                                                                                           |
| Solo leídas        | sin fondos ni puntos; sin "Marcar todo como leído"                                                                                                                                                                                     |

La bandeja guarda los avisos de 90 días (decisión autónoma). No se muestra ese plazo en la pantalla.

---

## Pantalla 5 — Cómo se ve un regalo recibido (D-13, D-17, D-19, D-22)

### Push (la redacta el servidor, categoría `motivacion`)

| Quién dio | Título                                     | Cuerpo                                  |
| --------- | ------------------------------------------ | --------------------------------------- |
| Alumno    | **[BORRADOR]** "Sofía M. te dio Aura"      | **[BORRADOR]** "Motivo: Buena energía." |
| Profe     | **[BORRADOR]** "Tu profe Fran te dio Aura" | **[BORRADOR]** "Motivo: Buena técnica." |

- Sin la chispa en el título (los lectores la leen como "estrella de cuatro puntas"). **[ajuste]** el
  sketch 035 la tenía.
- Sin el monto en el texto: lo muestra la pastilla de la bandeja y el detalle de Aura.
- Nada de "solo vos lo ves" (D-22).
- Destino: `/mi-templo?aura=detalle`.
- Con la app abierta no aparece nada en pantalla (D-29 existente); solo cambia el badge.

**Hallazgo para Franco:** la categoría "Motivación" no tiene interruptor en Perfil (solo hay
Entrenamiento, Programas, Planes y Novedades). Con la decisión de usar esa categoría, los regalos no se
pueden silenciar desde la app. Anotado en `215-DECISIONES-AUTONOMAS.md`.

### Fila en la bandeja

La de la Pantalla 4 con avatar o círculo ✦, título y cuerpo de la push y pastilla "✦ +N".

### Fila en el detalle privado de Aura (`AuraDetailSheet`, sin cambios de diseño)

La fila de la 214 tal cual (texto a la izquierda, fecha debajo, monto a la derecha). Solo cambian los
textos que manda el servidor:

| Movimiento          | Texto                                                      | Monto                                  |
| ------------------- | ---------------------------------------------------------- | -------------------------------------- |
| regalo de un alumno | **[BORRADOR]** "Sofía M. te dio Aura · Buena energía"      | "+1" en `$pd-gold-ink`                 |
| regalo de un profe  | **[BORRADOR]** "Tu profe Fran te dio Aura · Buena técnica" | "+{valor}" en `$pd-gold-ink`           |
| regalo anulado      | **[BORRADOR]** "Regalo anulado"                            | "−{monto}" en `$pd-neg-title` (U+2212) |

- El texto puede ocupar 2 renglones a 360 (la fila ya lo permite: `asheet__label` no corta).
- `aria-label` como en la 214: "Sofía M. te dio Aura, Buena energía, hoy, más 1".
- La línea "Solo vos ves este detalle" de la 214 se mantiene: el detalle sigue siendo privado. Lo que
  la 216 haga público son los regalos, no el detalle. Queda para revisar en la 216 (anotado).
- Quien da no ve nada en su detalle (D-09: no le descuenta).
- Sin celebración ni animación al recibir. **[BORRADOR de producto, anotado]**.

---

## Pantalla 6 — Admin (D-11, D-15, D-20, D-21)

Estilo del admin: Quasar estándar (`q-page padding`, clases `text-*`, `$primary` terracota), no el
lenguaje de la app. El dorado del admin es `$pd-gold-ink #7d6520` como color de texto e ícono (clase
`text-aura` nueva, 5.59:1 sobre blanco), igual que el chip "Pendiente" de la 214.

### 6a. Dar Aura desde el panel de asistencia (`SlotAttendancePanel.vue`)

Por cada fila con asistencia (`member.attendanceId`) y `gift` distinto de null, en el
`q-item-section side`, **antes** del botón de eliminar asistencia (`row items-center no-wrap q-gutter-xs`):

| `gift.state`                              | Qué se ve                                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `disponible`                              | `q-btn flat dense round icon="volunteer_activism"` con clase `text-aura`, `size="sm"`, `q-tooltip` "Dar Aura" **[BORRADOR]**, `aria-label` "Dar Aura a {Nombre Apellido}" **[BORRADOR]** |
| `dado`                                    | `q-chip dense square` sin acción, fondo `#f6efdc`, texto `text-aura`: "✦ +{amount}" y `q-tooltip` **[BORRADOR]** "Ya le diste Aura hoy · {Motivo}"                                       |
| `no_participa`                            | nada (oculto en las listas, staff o sin plan: el admin no explica, el servidor no lo pide)                                                                                               |
| `gift === null` (dueño, admin, recepción) | nada                                                                                                                                                                                     |

Tocar "Dar Aura" abre **`CoachGiftDialog`**:

- `q-dialog` + `q-card` con `min-width 320`, `max-width 400`.
- `text-h6` **[BORRADOR]** "Dar Aura a {Nombre Apellido}".
- `text-body2 text-grey-8` **[BORRADOR]** "Suma {coachGiftAmount} de Aura. Le llega un aviso con tu
  nombre y el motivo."
- `q-option-group type="radio"` con los cuatro motivos (D-16), sin valor inicial. `aria-label="Motivo"`.
- Acciones (`q-card-actions align="right"`): `q-btn flat` "Cancelar" y `q-btn unelevated color="primary"`
  "Dar Aura" **[BORRADOR]**, deshabilitado sin motivo, `loading` mientras va.
- 201 → cierra, la fila pasa a `dado` sin recargar el panel, notify positive **[BORRADOR]** "Le diste
  {amount} de Aura a {Nombre}." (`amount` de la respuesta).
- 409 `REGALO_YA_DADO` → cierra, la fila pasa a `dado`, notify info **[BORRADOR]** "Ya le diste Aura hoy
  a {Nombre}."
- 409 `REGALO_VENCIDO` o `REGALO_NO_DISPONIBLE` → cierra, se recarga el panel, notify warning
  **[BORRADOR]** "{Nombre} ya no puede recibir Aura de esta clase."
- Otro error → queda abierto, notify negative **[BORRADOR]** "No pudimos dar el Aura. Probá de nuevo."

### 6b. Página "Regalos de Aura" (`RegalosAuraPage.vue`)

Ruta `/alumnos/regalos`, registrada **antes** de `alumnos/:userId`. Ítem en el grupo "Gestión", debajo
de "Fotos":

```ts
{ path: '/alumnos/regalos', label: 'Regalos de Aura', icon: 'volunteer_activism', roles: ['owner', 'admin', 'admin_sede'] }
```

Los profes no la ven (no anulan). `admin_sede` ve solo sus sedes (lo filtra el servidor).

**Encabezado:** `text-h5` **[BORRADOR]** "Regalos de Aura"; `text-body2 text-grey-8` **[BORRADOR]** "Los
regalos que dieron los alumnos y los profes. Si alguno no corresponde, anulalo y se descuenta."

**Orden de la página:** Ajustes (6c), "Cómo se está usando" (medición), filtros y tabla.

**Medición (D-21)** — `q-card flat bordered`:

- `text-subtitle1` **[BORRADOR]** "Cómo se está usando".
- `q-markup-table flat dense` de las últimas 4 semanas (lunes a domingo), de la sede filtrada:

  | Columna **[BORRADOR]** | Valor                               |
  | ---------------------- | ----------------------------------- |
  | Semana                 | "10/11 al 16/11"                    |
  | Regalos de alumnos     | `studentGifts`                      |
  | Regalos de profes      | `coachGifts`                        |
  | Alumnos que asistieron | `attendees`                         |
  | Regalaron              | `giversPct` con "%" (sin decimales) |

- `text-caption text-grey-8` **[BORRADOR]** "Cuenta solo los regalos vigentes."

**Filtros** (`row q-col-gutter-sm`):

- `q-select` "Sede" (las sedes que ve el usuario; "Todas" para dueño y admin), default "Todas" o la
  única sede de un `admin_sede`;
- `q-btn-toggle` "7 días" / "30 días" / "90 días", default 7;
- `q-toggle` **[BORRADOR]** "Mostrar anulados", default apagado.

**Tabla** (`q-table flat bordered`, `:grid="$q.screen.lt.sm"`, 25 filas por página, orden por fecha
descendente):

| Columna **[BORRADOR]** | Contenido                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fecha                  | "Lun 17/11 · 18:00" (fecha y hora de la clase, zona de la sede)                                                              |
| Dio                    | nombre completo + `q-badge outline color="grey-8"` "Profe" si `giverKind === 'profe'`                                        |
| Recibió                | nombre completo (el staff ve el apellido, como en la 214)                                                                    |
| Motivo                 | texto del motivo                                                                                                             |
| Puntos                 | "+1" / "+2" en `text-aura`, tabular                                                                                          |
| Estado                 | vacío si está vigente; si no, `q-chip dense` gris "Anulado" + `text-caption` "por {voidedByName}" o "por asistencia anulada" |
| Acción                 | `q-btn flat dense no-caps color="negative"` "Anular", solo en vigentes                                                       |

**Anular** (D-20) — `q-dialog`:

- título **[BORRADOR]** "¿Anular este regalo?";
- texto **[BORRADOR]** "A {Receptor} se le descuentan {amount} de Aura. {Quien dio} no recupera el
  regalo de esa clase. No se le avisa a nadie.";
- botones `q-btn flat` "Cancelar" y `q-btn unelevated color="negative"` "Anular" (`loading` mientras va);
- 204 → la fila pasa a "Anulado" (o sale si "Mostrar anulados" está apagado), se recarga la medición y
  notify positive **[BORRADOR]** "Regalo anulado. Se descontaron {amount} de Aura.";
- 409 → notify info **[BORRADOR]** "Ese regalo ya estaba anulado." y se recarga la lista;
- otro error → notify negative **[BORRADOR]** "No pudimos anular el regalo. Probá de nuevo."

**Estados:**

| Estado   | Qué se ve                                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando | `q-table` con `loading` y las cards de arriba con `q-skeleton`                                                                                                                                                                                              |
| Vacío    | dentro de la tabla (`no-data`): `q-icon name="volunteer_activism" size="48px" color="grey-6"`, `text-h6` **[BORRADOR]** "No hay regalos en este período", `text-body2 text-grey-8` **[BORRADOR]** "Cuando los alumnos y los profes den Aura, aparecen acá." |
| Error    | `q-banner` warning **[BORRADOR]** "No pudimos cargar los regalos." + "Reintentar"                                                                                                                                                                           |

### 6c. Valor del regalo del profe (D-11)

**No hay una pantalla "Ajustes" en el admin** (el grupo se llama "Configuración" y sus páginas son de
precios, usuarios y comunicaciones). El valor va en una card **"Ajustes"** al principio de la página
"Regalos de Aura", junto a lo que regula. Anotado en `215-DECISIONES-AUTONOMAS.md`.

`q-card flat bordered`:

- `text-subtitle1` **[BORRADOR]** "Valor del regalo del profe".
- `text-body2 text-grey-8` **[BORRADOR]** "Cuánta Aura suma cada regalo de un profe. El de un alumno
  vale {AURA_AMOUNTS.giftMember}."
- **Dueño y admin:** `q-input type="number" outlined dense` (ancho 120, `suffix="de Aura"`,
  `min 1`, `max 10`, `step 1`), regla **[BORRADOR]** "Tiene que ser un número entero entre 1 y 10.", y
  `q-btn unelevated color="primary"` "Guardar valor", deshabilitado si no cambió o no es válido, `loading`
  mientras va. Debajo, `text-caption text-grey-8` **[BORRADOR]** "Los regalos ya dados no cambian."
  - 200 → notify positive **[BORRADOR]** "Listo. Los próximos regalos de profe suman {n} de Aura."
  - error → notify negative **[BORRADOR]** "No pudimos guardar el valor. Probá de nuevo." y el campo
    vuelve al valor guardado.
- **`admin_sede`:** solo lectura, `text-body2` **[BORRADOR]** "Cada regalo de un profe suma {n} de Aura.
  Lo cambia el dueño."

---

## Copywriting Contract

Origen: **Sketch** (034 o 035 elegidos), **Franco** (literal), **Existente** (ya está en la app) o
**[BORRADOR]** (nuevo, falta que Franco lo apruebe). Los botones genéricos sin origen ("Cerrar",
"Reintentar", "Cancelar", "Guardar valor", "Volver") cuentan como borrador.

| Element                          | Copy                                                                                                                                                       | Origen                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Primary CTA (card de hoy)        | "✦ Dale Aura a un compañero"                                                                                                                               | Sketch 034                 |
| Primary CTA (hoja)               | "Darle Aura a Sofía" · deshabilitado "Elegí a quién y por qué" / "Elegí un motivo"                                                                         | Sketch 034                 |
| Primary CTA (hoja, solo motivo)  | "Elegí a quién"                                                                                                                                            | [BORRADOR]                 |
| Enviando                         | "Dando Aura…"                                                                                                                                              | [BORRADOR]                 |
| Primary CTA (admin, panel)       | "Dar Aura"                                                                                                                                                 | [BORRADOR]                 |
| Primary CTA (admin, ajustes)     | "Guardar valor"                                                                                                                                            | [BORRADOR]                 |
| Kicker y título de la hoja       | "DAR AURA" · "¿A quién de tu clase?" · "Hoy 18:00 · elegí a una sola persona"                                                                              | Sketch 034                 |
| Motivos                          | "Buena técnica", "Constancia", "Buena energía", "Me ayudó" · título "¿Por qué?"                                                                            | Franco (D-16) · Sketch 034 |
| Ayuda de la hoja                 | "A Sofía le llega un aviso con tu nombre y el motivo. A vos no te descuenta nada."                                                                         | Sketch 034                 |
| Ayuda de la card                 | "Tenés un regalo de Aura por la clase de hoy. Podés darlo hasta mañana a la noche."                                                                        | Sketch 034                 |
| Ayuda de la card (ayer, plural)  | tabla de la Pantalla 1                                                                                                                                     | [BORRADOR]                 |
| Ya lo dio                        | "Le diste Aura a Sofía · Buena energía"                                                                                                                    | Sketch 034                 |
| Confirmación                     | notify "Le diste Aura a Sofía"                                                                                                                             | Sketch 034                 |
| Tope semanal                     | "Martín D. ya recibió 2 regalos tuyos esta semana. Vas a poder darle de nuevo el lunes."                                                                   | [BORRADOR]                 |
| Título de la bandeja             | "Notificaciones" · "Marcar todo como leído"                                                                                                                | Sketch 035                 |
| Empty state heading (bandeja)    | "Todavía no tenés avisos"                                                                                                                                  | Sketch 035                 |
| Empty state body (bandeja)       | "Acá van a quedar los que te mande la app."                                                                                                                | Sketch 035                 |
| Empty state (hoja)               | "No hay a quién darle Aura" / "En esta clase no quedan compañeros que puedan recibirla."                                                                   | [BORRADOR]                 |
| Empty state (admin)              | "No hay regalos en este período" / "Cuando los alumnos y los profes den Aura, aparecen acá."                                                               | [BORRADOR]                 |
| Error state (hoja)               | "No pudimos cargar tu clase." + "Reintentar"                                                                                                               | [BORRADOR]                 |
| Error state (dar)                | "No pudimos dar el Aura. Probá de nuevo."                                                                                                                  | [BORRADOR]                 |
| Error state (bandeja)            | "No pudimos cargar tus notificaciones." + "Reintentar"                                                                                                     | [BORRADOR]                 |
| Error state (admin)              | "No pudimos cargar los regalos." + "Reintentar"                                                                                                            | [BORRADOR]                 |
| Vencido                          | "Se terminó el plazo para dar este regalo."                                                                                                                | [BORRADOR]                 |
| Push de regalo                   | "Sofía M. te dio Aura" / "Tu profe Fran te dio Aura" · "Motivo: Buena energía."                                                                            | [BORRADOR] (D-19)          |
| Detalle de Aura                  | "Sofía M. te dio Aura · Buena energía" · "Tu profe Fran te dio Aura · Buena técnica" · "Regalo anulado"                                                    | [BORRADOR]                 |
| Aviso anulado en la bandeja      | "Anulado"                                                                                                                                                  | [BORRADOR]                 |
| Destructive confirmation (admin) | Anular: "¿Anular este regalo?" / "A {Receptor} se le descuentan {amount} de Aura. {Quien dio} no recupera el regalo de esa clase. No se le avisa a nadie." | [BORRADOR]                 |
| Valor del profe                  | "Valor del regalo del profe" · "Cuánta Aura suma cada regalo de un profe. El de un alumno vale 1." · "Los regalos ya dados no cambian."                    | [BORRADOR]                 |
| Medición                         | "Cómo se está usando" · columnas de la tabla 6b · "Cuenta solo los regalos vigentes."                                                                      | [BORRADOR]                 |

En la app no hay destructivas: dar Aura no se deshace desde la app, y nada se borra.

**Ningún texto dice que el regalo es privado** (D-22). Revisado: la ayuda de la hoja dice que a la
persona "le llega un aviso con tu nombre", que es cierto hoy y en la 216.

---

## Accesibilidad (resumen transversal)

- Tocables de 44×44 o más: botón de regalo (48), celdas de la grilla (alto ≥ 88), motivos (44),
  perfil, campana y salir en la barra (44, ver Pantalla 3), filas de aviso (64), flecha de volver (44),
  "Marcar todo como leído" (44). En el admin, el botón "Dar Aura" del panel es `dense` como el de
  eliminar asistencia que ya está al lado (estilo del admin, uso con mouse).
- La hoja es un `q-dialog`: atrapa el foco y lo devuelve al botón de la card al cerrar. Al abrir, el foco
  va al título (`tabindex="-1"`). La agarradera es `aria-hidden`.
- Selección sin depender del color: tilde en la cara elegida, ícono `check` en el motivo elegido,
  `aria-pressed` en ambos.
- Las imágenes de personas llevan `alt=""` (el nombre está en el texto). Las chispas "✦" llevan
  `aria-hidden`. Los montos se leen "más 1 de Aura".
- Estados de carga con `aria-busy`, errores con `role="alert"`, confirmaciones por los notify
  existentes.
- Foco visible: `outline 2px` en `$pd-terra-ink` sobre claro, en `$pd-cream-2` sobre la card oscura y
  en blanco sobre la barra.
- Teclado (web y escritorio): Tab recorre caras activas, motivos y el botón; Enter o Espacio eligen. Las
  caras apagadas quedan en el orden de Tab con `aria-disabled` (se anuncia el porqué).
- **Movimiento** (`prefers-reduced-motion: reduce`): transición de la hoja en 0, sin `scale` en el botón
  de regalo, sin transición de fondo al elegir una cara o un motivo, desplazamiento a "¿Por qué?" sin
  animación. El badge de la campana nunca se anima. La animación existente de la card de hoy (borde,
  halo, destello) ya se apaga con esta preferencia y la fila de regalo no agrega ninguna.
- Contraste: se mide con `contrast.py` sobre capturas a 360, 390 y 412 (card con regalo, hoja con una
  cara elegida y una apagada, bandeja con leídos y sin leer, barra en Mi Templo y Entrenar): 0 fallas.

---

## Decisiones tomadas en este contrato

Todas quedaron en `215-DECISIONES-AUTONOMAS.md` en lenguaje llano. Resumen:

1. La oferta va en una fila propia dentro de la card de hoy, debajo de Estirar (no al lado: no entra a
   360).
2. Con dos regalos para dar, el botón abre primero el que vence antes.
3. Oculto, Wellhub sin plan, sin plan, vencido o sin compañeros que puedan recibir: la card no muestra
   nada ni explica.
4. El tope semanal se explica en una nota debajo de las caras, no dentro de cada cara.
5. Barra de arriba: no se achican los botones; el título "EL TEMPLO" se oculta en Entrenar por debajo de
   460 px (antes 420).
6. En escritorio el ítem del riel se llama "Notificaciones" (no "Avisos").
7. Tocar un regalo (push o bandeja) lleva a Mi Templo y abre el detalle de Aura.
8. La bandeja muestra la hora del aviso, no "hace 20 min". Abrirla no marca nada como leído.
9. Un regalo anulado sigue en la bandeja con la marca "Anulado".
10. El valor del regalo del profe se edita en una card "Ajustes" de la página nueva "Regalos de Aura"
    (Gestión), porque el admin no tiene pantalla de Ajustes. Ahí también está la medición D-21.
11. La push del profe dice "Tu profe {Nombre} te dio Aura".
12. Hallazgo: "Motivación" no tiene interruptor en Perfil, así que los regalos no se pueden silenciar.
13. "Solo vos ves este detalle" (214) se mantiene; revisar en la 216.
14. Recibir un regalo no tiene celebración ni animación.

---

## Registry Safety

| Registry        | Blocks Used                               | Safety Gate    |
| --------------- | ----------------------------------------- | -------------- |
| shadcn official | ninguno (proyecto Vue/Quasar, sin shadcn) | not applicable |
| Third-party     | ninguno                                   | not applicable |

Sin dependencias nuevas.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
