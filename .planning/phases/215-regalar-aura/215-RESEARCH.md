# Phase 215: Regalar Aura - Research

**Researched:** 2026-11-18
**Domain:** Ledger de Aura (Fastify + Drizzle + MySQL), push y bandeja de avisos, pantallas Quasar (app y admin)
**Confidence:** HIGH en lo verificado en el código; MEDIUM en las recomendaciones de diseño (marcadas)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copiadas de `215-CONTEXT.md` (son ley): D-01 regalan alumnos y profes. D-02 alumno: un regalo por cada
clase a la que asiste, a un solo compañero que también asistió, sin tope semanal de regalos. D-03 profe:
una vez por día a cada persona que fue su alumno ese día, sin tope de cantidad. D-04 no se le regala al
profe. D-05 un alumno no le regala a la misma persona más de 2 veces por semana. D-06 sin tope de lo que
se recibe. D-07 quien se ocultó (214) no participa: no recibe (tampoco del profe) ni regala. D-08 regala
quien tiene asistencia registrada, solo a quien también la tiene. D-09 cupo aparte, regalar no descuenta
Aura. D-10 regalo de alumno = 1. D-11 regalo de profe = 2, editable desde el admin. D-12 se puede dar
hasta el final del día siguiente. D-13 lo recibido suma al Aura y aparece en el detalle privado; no
cuenta para el tope del día de 5. D-14 el alumno regala desde la card de hoy de Mi Templo. D-15 el profe
regala desde el panel de asistencia del admin. D-16 motivo de una lista: "Buena técnica", "Constancia",
"Buena energía", "Me ayudó", sin texto libre. D-17 push + bandeja en la barra de arriba entre perfil y
cerrar sesión. D-18 la bandeja guarda todos los avisos push de ahora en más, con sin leer. D-19 el aviso
dice quién regaló y el motivo. D-20 el staff puede anular un regalo y el punto se descuenta. D-21
medición 4 semanas: regalos por semana y % de asistentes que regala. D-22 los textos no prometen que el
regalo es privado.

Decisiones autónomas ya tomadas (`215-DECISIONES-AUTONOMAS.md`): sketch 034 variante A (una hoja: caras
arriba, motivos abajo), sketch 035 variante B (pantalla propia "Notificaciones" agrupada por día), rama
`feat/regalar-aura` desde `fase-214-ejecutada`.

### Claude's Discretion

Quién es "el profe" de una clase; qué pasa con un regalo si se anula una asistencia; retención, lectura y
destino de cada aviso de la bandeja; categoría de preferencias de la push de regalos; cómo entran
selector de nivel, perfil, campana y cerrar sesión a 360 px; dónde se edita el valor del regalo del
profe; Wellhub recibe pero no regala. Recomendaciones en §Decisiones de discreción.

### Deferred Ideas (OUT OF SCOPE)

Fase 216, pestaña Comunidad: regalos públicos, navegación nueva, Novedades fuera de Mi Templo. No se
construye ningún feed público. Pero D-22 obliga a no prometer privacidad, y conviene guardar el regalo en
una tabla propia (no solo en el ledger) para que la 216 lo pueda listar.
</user_constraints>

<phase_requirements>

## Phase Requirements (criterios de éxito del ROADMAP)

| ID   | Descripción                                                                                               | Soporte en esta investigación                                          |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SC-1 | Alumno da 1 punto a un compañero que asistió, desde Mi Templo, con motivo, hasta el fin del día siguiente | §1 modelo, §2 elegibilidad, regla de ventana pura, plan 12             |
| SC-2 | Máx. 2 por semana a la misma persona; no al profe                                                         | Regla semanal con `FOR UPDATE` sobre el que regala; receptor no staff  |
| SC-3 | Profe da 2 (editable) una vez por día a cada alumno del día, desde el panel                               | §3, `system_settings`, UNIQUE de profe/día                             |
| SC-4 | Regalar no descuenta; lo recibido aparece en el detalle privado                                           | Cupo = asistencias, no saldo; etiqueta por motivo en `movement-labels` |
| SC-5 | Ocultos no regalan ni reciben                                                                             | `effectiveVisible` de la 214 en ambos lados                            |
| SC-6 | Push + bandeja con sin leer que guarda todos los avisos                                                   | §4: escritura en `processQueue`                                        |
| SC-7 | Staff anula y el punto se descuenta                                                                       | §5: fila negativa con referencia propia                                |
| SC-8 | Puntos mostrados = suma del ledger                                                                        | Todo pasa por `AuraService.award` con referencia única, sin `spend`    |

</phase_requirements>

## Project Constraints (from CLAUDE.md y skills)

- Logging Pino en la API, `createLogger()` en app y admin. Sin `any`; `catch (err: unknown)`.
- Rutas nuevas con tests de integración en `el-templo-api/test/` (corren en CI, no en local).
- Migraciones a mano en `src/db/migrations/`, SQL en el mismo commit que el schema, sin `;` en
  comentarios SQL, sin datos de prueba, aplicadas con el runner propio. Nunca `drizzle-kit migrate` ni
  `push`. No aplicar migraciones en la base local (lección del orquestador 214).
- Env var nueva → `.env.example` (no se prevé ninguna).
- Stores Pinia en composición; composables con `cleanup()`, sin `onUnmounted` adentro.
- `git add` por ruta, commits nuevos, sin push, sin bump, sin instalar dependencias.
- Todo lo de `215-EJECUTORES.md`: typecheck "cero errores nuevos" (API 0, app 20, admin 36), `vue-tsc` por
  ruta absoluta, `lint:tenant` es el lint de la API, prettier solo sobre rutas tocadas.

## Summary

La 215 se apoya en piezas que la 214 dejó listas: el ledger con `AuraService.award`, el filtro de "Aura
ganada" (`earned.ts`), la visibilidad (`scheduling/community-visibility.ts`), el detalle privado
(`GET /api/members/aura/movements`), `MemberAvatar` y la hoja de caras. Lo nuevo son dos tablas
gym-owned (`aura_gifts` y `member_notifications`), ~12 rutas, una escritura en el barrido de la cola de
push, tres pantallas en la app (hoja de regalo, campana y página de avisos) y dos en el admin (botón en el
panel de asistencia, página de regalos con anulación y valor del profe).

El punto delicado es el ledger. El UNIQUE `(user_id, source_type, reference_type, reference_id)` no
protege filas con `reference_id` NULL [VERIFIED: schema `aura-transactions.ts:53`], así que cada regalo
acredita con `source_type='social'` (ya existe en el enum, sin uso), `reference_type='aura_gift'` y
`reference_id = aura_gifts.id`, y cada anulación escribe una fila negativa con
`reference_type='aura_gift_void'` y el mismo id. `earnedRowsFilter` solo excluye canjes
(`subscription_discount` y el ajuste con referencia `subscription`) [VERIFIED: `earned.ts:38`], así que
ambas filas cuentan y la conciliación (SC-8) se mantiene sin tocar nada. El tope del día solo lee
asistencia, `training_completion` y `goal_plan_completion` [VERIFIED: `day-cap.ts:28-29`]: `social`
queda fuera sola (D-13).

El otro punto delicado es la bandeja. Todas las push de la API pasan por `pending_notifications` y el
barrido `processQueue` [VERIFIED: grep de `sendToDevice`, `queueNotification`, `queueAdHocNotification`;
solo `sendTestNotification` envía aparte]. Ese barrido es el único lugar donde escribir la fila de la
bandeja, y debe escribirla aunque el usuario no tenga token (si no, quien no aceptó push nunca ve sus
regalos). `pending_notifications` se purga a las 24 h, así que la bandeja copia título, cuerpo y ruta.

**Primary recommendation:** tabla `aura_gifts` como fuente de verdad de cada regalo (con dos UNIQUE que
imponen "uno por asistencia" y "profe una vez por día"), acreditación y anulación por `AuraService.award`
dentro de la misma transacción con referencia por id, tabla `member_notifications` escrita desde
`processQueue`, y 15 planes secuenciales chicos: datos → reglas puras → servicio → rutas → push/bandeja →
app → admin → cierre.

## Architectural Responsibility Map

| Capability                                   | Primary Tier                   | Secondary Tier                      | Rationale                                          |
| -------------------------------------------- | ------------------------------ | ----------------------------------- | -------------------------------------------------- |
| Cupo, ventana, tope semanal, profe/día       | API                            | Database (UNIQUE, `FOR UPDATE`)     | Reglas de negocio y anti-abuso nunca en el cliente |
| Acreditar y anular Aura                      | API (`AuraService`)            | Database (ledger + `aura_balances`) | Misma transacción que el regalo                    |
| Quién asistió y quién es visible             | API (servicio de anotados 214) | —                                   | Ya existe la regla, se reusa                       |
| Bandeja de avisos                            | API (barrido de cola)          | Database                            | Un único punto de envío                            |
| Campana, contador sin leer, página de avisos | Browser (app)                  | API                                 | Solo presentación                                  |
| Hoja "Dar Aura"                              | Browser (app)                  | API (candidatos ya filtrados)       | La app no decide elegibilidad                      |
| Regalo del profe, anular, valor editable     | Admin (Browser)                | API con roles                       | Roles y sedes del staff                            |

## Standard Stack

Sin dependencias nuevas. Todo con lo instalado:

| Pieza                                                                                                  | Dónde está                                                  | Uso en la 215                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Drizzle ORM + mysql2                                                                                   | API                                                         | Tablas nuevas, `FOR UPDATE`, UNIQUE                                                                      |
| `AuraService.award`                                                                                    | `aura/service.ts:42`                                        | Acreditar (+N) y anular (−N); acepta `amount` explícito y no valida signo [VERIFIED: lectura de `award`] |
| `earnedRowsFilter`, `earnedAuraByUsers`                                                                | `aura/earned.ts`                                            | Sin cambios; los regalos cuentan solos                                                                   |
| `effectiveVisible`, `isMinor`, `getViewerCommunityState`, `listAccess`                                 | `scheduling/community-visibility.ts` y servicio de anotados | Ocultos y acceso a la lista                                                                              |
| `resolveCommunityPhotos`                                                                               | `members/profile-photo-service.ts`                          | Fotos de las caras de la hoja                                                                            |
| `NotificationService.queueAdHocNotification`                                                           | `notifications/service.ts:509`                              | Push del regalo; chequea preferencias al encolar [VERIFIED]                                              |
| `system_settings` + patrón `STREAK_SETTINGS_KEYS`                                                      | `aura/streak-reward.ts:37-90`                               | Valor del regalo del profe                                                                               |
| `@fastify/rate-limit` (`preHandler` con `keyGenerator`)                                                | patrón del plan 17 de la 214                                | Tope de POST de regalo por usuario                                                                       |
| App: `MemberAvatar`, `AttendeesSheet`, `useBackButtonClose`, `formatAura`, tokens `_premium-card.scss` | `el-templo-app/src/components`                              | Hoja de regalo y avisos                                                                                  |
| Admin: `SlotAttendancePanel.vue`, `useAttendanceApi.ts` (`/admin/attendance/slot/:scheduleId/:date`)   | admin                                                       | Botón de regalo del profe                                                                                |

## Package Legitimacy Audit

No se instala ningún paquete. slopcheck no aplica. **Packages removed:** none. **Flagged:** none.

## Architecture Patterns

### Diagrama de flujo

```
ALUMNO (app, Mi Templo)                         PROFE (admin, panel de asistencia)
  card de hoy ──GET /members/aura/gifts/pending     panel ──GET slot attendance (+ giftedToday, canReceiveGift)
      │  (clases asistidas hoy/ayer sin regalo)        │
      ▼                                                ▼
  hoja "Dar Aura" ──GET .../candidates?attendanceId    diálogo de motivo ──POST /admin/aura/gifts
      │  (co-asistentes visibles, no staff,            │
      │   con marca "ya 2 esta semana")                │
      ▼                                                ▼
  POST /members/aura/gifts ─────────────┐   ┌──────────┘
                                         ▼   ▼
                     GiftService.give (una transacción)
                       1. FOR UPDATE sobre users(giver)  ← serializa los regalos del que da
                       2. reglas puras: ventana D-12, semana D-05, roles D-04, visibilidad D-07
                       3. INSERT aura_gifts (UNIQUE giver_attendance_id / coach_gift_day)
                       4. AuraService(tx).award(receiver, social, 'aura_gift', gift.id, amount)
                     después del commit:
                       5. queueAdHocNotification(receiver, "Fran te dio Aura · Buena energía")
                                         │
                                         ▼
                     processQueue (cron, cross-tenant)
                       ├─ INSERT member_notifications (copia título/cuerpo/ruta) ← SIEMPRE
                       └─ sendToDevice por token (si hay)
                                         │
                                         ▼
                     App: campana con contador ──GET /members/notifications/unread-count
                          página "Notificaciones" ──GET /members/notifications (por día)
                          tocar → POST .../:id/read → router.push(route)

ADMIN anula: POST /admin/aura/gifts/:id/void
   UPDATE aura_gifts SET status='anulado' WHERE id=? AND status='vigente' (CAS)
   + AuraService(tx).award(receiver, social, 'aura_gift_void', gift.id, −amount)
removeCheckIn (asistencia anulada) → anula en la misma transacción los regalos vigentes
   cuyo giver_attendance_id o receiver_attendance_id sea esa asistencia
```

### Estructura recomendada

```
el-templo-api/src/
├── db/schema/aura-gifts.ts                 # tabla nueva (gym-owned strict)
├── db/schema/member-notifications.ts       # tabla nueva (gym-owned strict)
├── modules/aura/gift-rules.ts              # funciones puras: ventana, semana ISO, motivos, montos
├── modules/aura/gift-service.ts            # give / void / listados; usa AuraService(tx)
├── modules/aura/gift-member-routes.ts      # rutas del alumno (en aura/module.ts)
├── modules/aura/gift-admin-routes.ts       # rutas del staff
├── modules/aura/gift-schemas.ts            # schemas de request/response (fast-json-stringify)
├── modules/notifications/inbox-service.ts  # recordFromQueue, list, unread, markRead, purge
└── jobs/...                                # purga de la bandeja en el cron de notificaciones existente
el-templo-app/src/
├── components/GiveAuraSheet.vue            # sketch 034 A
├── pages/NotificationsPage.vue             # sketch 035 B
├── stores/notifications-inbox.ts           # contador sin leer
└── utils/notifications-view.ts (+ test)    # agrupar por día, textos
el-templo-admin/src/
├── components/CoachGiftDialog.vue
├── pages/RegalosAuraPage.vue               # lista, anular, medición D-21
└── composables/useAuraGiftsApi.ts
```

### Pattern 1: Regalo con referencia propia en el ledger

```typescript
// Fuente: aura/service.ts (award abre su propia transacción con this.db.transaction)
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${giverId} FOR UPDATE`); // + tenantWhere
  // ...validar reglas con lecturas dentro de tx...
  const [res] = await tx.insert(schema.auraGifts).values(tenantValues(ctx, {...}));
  const aura = new AuraService(tx as unknown as Db, log); // ver Pitfall 2
  await aura.award({ userId: receiverId, sourceType: "social",
    referenceType: "aura_gift", referenceId: res.insertId, amount });
});
```

`award` llama a `this.db.transaction(...)`; con `tx` Drizzle mysql2 lo convierte en `SAVEPOINT`
[ASSUMED: comportamiento de transacciones anidadas de Drizzle; el ejecutor debe confirmar cómo lo hace hoy
`attendance/service.ts` al acreditar dentro de su transacción y copiar ese patrón].

### Pattern 2: Bandeja escrita desde el barrido

En `processQueue` (`notifications/service.ts:688`), por cada fila vencida y antes del chequeo de tokens
(`:726`), `inboxService.recordFromQueue(notification)`: INSERT con `pending_notification_id` UNIQUE e
`INSERT IGNORE`/`onDuplicateKeyUpdate` no-op, para que un reintento del barrido no duplique. Lleva el
mismo comentario `/* tenant-safe: ... T-175-03 */` del barrido y copia `tenant_id` de la fila
(`tenantIdColumn()` en `pending_notifications`). Si la inserción falla se loguea y se sigue enviando la
push (la bandeja no puede frenar avisos).

### Anti-Patterns

- **Acreditar con `reference_id` NULL o con `spend`:** el UNIQUE no protege y `spend` lanza
  `InsufficientBalanceError` y escribe `manual_adjustment` sin referencia (lección del plan 10).
- **Escribir la bandeja al encolar:** los recordatorios programados aparecerían antes de tiempo.
- **Decidir elegibilidad en la app:** la app solo pinta lo que el servidor marca como elegible.
- **Usar `scope` compartido en `.where()`:** `lint:tenant` exige `tenantWhere` literal en cada `where`
  (lección plan 15).
- **Contar el tope semanal sin bloqueo:** dos POST simultáneos a dos clases distintas pasan los dos.

## Diseño recomendado (por pregunta)

### 1. Modelo de datos del regalo y del cupo

**`aura_gifts`** (gym-owned strict, `tenantIdColumn()`):

| Columna                                  | Tipo                                          | Nota                                                                                        |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| id                                       | int PK                                        | `reference_id` del ledger                                                                   |
| tenant_id                                | tenantIdColumn                                |                                                                                             |
| giver_user_id                            | int FK users                                  |                                                                                             |
| receiver_user_id                         | int FK users                                  |                                                                                             |
| giver_kind                               | enum `alumno`,`profe`                         | `mysqlEnum` 1er arg = nombre de columna (memoria del repo)                                  |
| branch_id                                | int FK branches                               | sede de la clase                                                                            |
| schedule_id                              | int FK schedules, null para profe sin horario |                                                                                             |
| session_date                             | date (string)                                 | fecha local de la clase                                                                     |
| giver_attendance_id                      | int NULL, **UNIQUE**                          | solo alumno: "un regalo por clase asistida" (NULLs no chocan)                               |
| receiver_attendance_id                   | int NOT NULL                                  | para anular si se borra esa asistencia                                                      |
| coach_gift_date                          | date NULL                                     | solo profe; **UNIQUE (giver_user_id, receiver_user_id, coach_gift_date)** = una vez por día |
| reason                                   | enum `tecnica`,`constancia`,`energia`,`ayudo` | D-16                                                                                        |
| amount                                   | int                                           | 1 o el valor del profe al momento                                                           |
| status                                   | enum `vigente`,`anulado`                      |                                                                                             |
| voided_by_user_id, voided_at, void_cause | int, timestamp, enum `staff`,`asistencia`     |                                                                                             |
| created_at                               | timestamp                                     |                                                                                             |

Índices: `(receiver_user_id, created_at)`, `(giver_user_id, session_date)`, `(branch_id, session_date)`.
Sin FK a `attendance` (las asistencias se borran en `removeCheckIn`; los regalos se anulan antes).

**Cupo:** no hay tabla de cupo. El cupo es derivado: asistencias del alumno con `session_date` en
`[hoy−1, hoy]` (día local de la sede) sin fila en `aura_gifts.giver_attendance_id`. El UNIQUE lo hace
imposible de duplicar. Un regalo anulado **no devuelve el cupo** (conservador: el UNIQUE sigue ocupado).

**Ventana D-12:** `todayLocal(sedeTz) <= session_date + 1 día`. Función pura en `gift-rules.ts` con test
unitario (cambio de mes, zona de la sede).

**Tope D-05:** dentro de la transacción, con el `FOR UPDATE` sobre la fila `users` del que regala:
`COUNT(*) FROM aura_gifts WHERE giver=? AND receiver=? AND giver_kind='alumno' AND status='vigente' AND
session_date BETWEEN lunes AND domingo` de la semana ISO de `session_date` (helper `isoWeekStart` ya
existe, lo usa `ratings/service.ts`). Si es ≥ 2 → 409 `REGALO_TOPE_SEMANAL`.

**Montos:** `AURA_AMOUNTS.giftMember = 1` en `aura/amounts.ts`; valor del profe en `system_settings`
clave `aura_gift_coach_amount` (default 2, entero 1..10), leído como `streak-reward.ts`. Se guarda el
monto en la fila del regalo para que anular revierta exactamente lo dado aunque el valor cambie después.

**Detalle privado:** `movement-labels.ts` no tiene `social` [VERIFIED: grep]. La ruta de movimientos debe
hacer `LEFT JOIN aura_gifts` por `reference_type IN ('aura_gift','aura_gift_void')` para armar
"Fran te dio Aura · Buena energía" / "Regalo anulado". D-22: sin "privado" en los textos. Nombre del que
regala = nombre de pila + inicial (misma regla que la lista de anotados).

### 2. Quién asistió a la misma clase (visibilidad 214)

- Base: `attendance (member_id, branch_id, schedule_id, session_date, source)` [VERIFIED: schema]. Misma
  clase = mismo `schedule_id` y `session_date`.
- Que regala (alumno): tiene `attendance` en esa clase; pasa `listAccess({ isStaff:false,
hasPlanInEffect, viewerVisible })` de la 214. Así quedan fuera ocultos, Wellhub sin plan, freemium y
  plan vencido (D-07, D-09 de la 214, discreción Wellhub). Staff no regala como alumno.
- Recibe: tiene `attendance` en esa clase, no es el que regala, no está borrado, **no es staff**
  (`ALL_STAFF_ROLES`, D-04), y `effectiveVisible` con su fecha de nacimiento, país y zona de sede. Wellhub
  sí recibe (`source` `wellhub`/`wellhub_manual`). Asistencias de prueba: excluir igual que la 214
  excluye `is_trial` (el ejecutor debe ver cómo se liga la asistencia a la reserva de prueba).
- La validación se repite en el POST (no confiar en la lista de candidatos).
- Candidatos: misma forma de fila que anotados (nombre de pila, inicial, foto firmada, Aura ganada) +
  `blockedReason: 'tope_semanal' | null`. Sin apellido ni teléfono (D-37 de la 214).

### 3. Quién es "el profe"

Profe efectivo de un horario = `schedules.coach_user_id` si no es NULL; si no, el del roster
`class_coach_assignments (branch_id, week_start_date, day_of_week, slot)` con arrastre de la última
semana anterior [VERIFIED: `schedules.ts:36-40`, `ratings/service.ts:231-247`]. Hoy no hay un helper
exportado que lo resuelva: `ratings` lo hace en línea.

**Recomendación (conservadora y tolerante a suplencias):** puede regalar como profe cualquier usuario con
rol tipo profe (`isCoachLikeRole`, `permissions.ts:514`) con esa sede en `user_branches`, a alumnos con
asistencia de esa sede en la fecha (hoy o ayer, misma ventana D-12). No se exige ser el profe efectivo
del horario: `attendance` no guarda quién marcó y el roster no refleja suplencias. Owner/admin/admin_sede
no regalan como profe (D-01 habla de profes). Anotar en `215-DECISIONES-AUTONOMAS.md`.

### 4. Bandeja de notificaciones

- **Tabla `member_notifications`** (gym-owned strict): id, tenant_id, user_id FK, pending_notification_id
  int NULL **UNIQUE** (sin FK: la cola se purga a las 24 h), kind varchar(32) (`aura_gift`, o la
  categoría), title, body, route, created_at, read_at NULL. Índice `(user_id, created_at)` y
  `(user_id, read_at)`.
- **Dónde se guarda:** en `processQueue`, para cada fila vencida, antes del chequeo de tokens. Así entran
  todos los avisos (D-18) incluidos los de usuarios sin token. No entra `sendTestNotification` (prueba del
  admin). Lo silenciado por preferencias no se encola (`queueAdHocNotification` chequea al encolar), así
  que no aparece: consistente con "lo que la app manda".
- **Retención:** 90 días, purga en el cron existente (patrón `purgeOldNotifications`, `:977`).
- **Leído:** al tocar un aviso se marca leído y se navega a su `route` (default `/mi-templo`). Botón
  "Marcar todo como leído" en la página. El contador se pide al abrir la app, al volver a primer plano y
  al llegar una push con la app abierta.
- **Push del regalo:** categoría de preferencias existente `motivacion` [ASSUMED como opción más
  conservadora: agregar `comunidad` exige migrar el enum de preferencias, tocar Perfil y defaults]. Ruta
  del aviso: `/mi-templo?aura=1` abriendo el detalle privado, o `/mi-templo` si el parámetro complica.
  Texto: "{Nombre} te dio Aura" / "Motivo: {motivo}." (D-19; sin "privado", D-22).
- **Barra a 360 px:** `MainLayout.vue:13-45` tiene `HeaderLevelDropdown` (solo en `training`), perfil
  (`:39`) y salir (`:42`) [VERIFIED]. La campana va entre perfil y salir (`q-btn flat round` con
  `q-badge` floating). Con selector visible y < 420 px el título ya se oculta (plan 24). Si a 360 px no
  entra: botones `dense` (40 px) solo con el selector visible, nunca debajo de 40 px. Escritorio: pestaña
  "Avisos" en el riel entre Perfil (`:88`) y Salir (`:96`). Verificación visual queda para el UAT.

### 5. Anular un regalo

- Roles: `owner`, `admin`, `admin_sede` (acotado a sus sedes). Profes no anulan [recomendación].
- `POST /api/admin/aura/gifts/:id/void`: CAS `UPDATE ... SET status='anulado' WHERE id AND status='vigente'`
  (mirar `affectedRows`: con mysql2 FOUND_ROWS cuenta encontradas, memoria del repo) + fila negativa
  `aura_gift_void`. Segunda llamada → 409, nunca doble descuento (el UNIQUE del ledger lo respalda).
- Asistencia anulada (`removeCheckIn`, `attendance/service.ts` ~1297): en la misma transacción, anular
  con `void_cause='asistencia'` los regalos vigentes con esa asistencia como `giver_attendance_id` o
  `receiver_attendance_id` (D-08). Sin push al anular [recomendación].
- Página admin "Regalos de Aura" (Gestión): lista por sede y fecha, anular con confirmación, y arriba la
  medición D-21 (regalos por semana, % de asistentes de la semana que regalaron).

### 6. Tenancy, migraciones y tests

- **Número de migración:** `git fetch` 2026-11-18: `origin/master` y `origin/staging` terminan en
  `0343` (más un `0909_cajas_efectivo` histórico fuera de serie); la rama en `0347`. La **0348 está
  reservada** para el repaso de la 214 (plan 31). La 215 arranca en **0349**: 0349 `aura_gifts`, 0350
  `member_notifications`. Re-verificar con `git fetch` al escribir cada una.
- **Tablas gym-owned nuevas (2):** sumar a `GYM_OWNED_TABLES` en `src/db/tenant-tables.ts` y mover los
  conteos fijos: `GYM_OWNED_TABLES` 136→138, `schemaTables.size` 141→143, `gymOwnedChecked` 136→138
  (`test/migrations/0192-0195-tenant-columns.test.ts:198`, `0196-tenant-unique-contracts.test.ts:662`),
  más el orden de borrado en `test/helpers.ts` y `limpiarSegundoGimnasio` (antes de `users`) [VERIFIED los
  valores 136 en tests; 141 según lección plan 12]. Los UNIQUE nuevos que no incluyen `tenant_id`
  probablemente necesiten entrada en la lista de contratos UNIQUE (como `aura_transactions.unique_user_source_ref`,
  `tenant-tables.ts:382`).
- **Rutas nuevas:** entrada en `test/tenant-manifest.ts` y `ENTRADAS_BASELINE` (hoy **589**,
  `iso-01-manifiesto.test.ts:487`) +N. Casos ISO-03: `iso-03-cobertura-members.test.ts` (`CASOS_BASELINE`
  hoy **42**) para `/api/admin/members`-like y el archivo que cubra `/api/members/...`; la regla de la 214
  dice que ISO-03 aplica solo a `/api/members/scheduling` y `/api/admin/members` — el planificador debe
  confirmar en `tenant-manifest.ts` qué familia exige caso para `/api/members/aura/*`,
  `/api/members/notifications/*` y `/api/admin/aura/*`.
- **Rutas estimadas (11):** member: `GET aura/gifts/pending`, `GET aura/gifts/candidates`,
  `POST aura/gifts`; notifications: `GET`, `GET unread-count`, `POST :id/read`, `POST read-all`; admin:
  `POST aura/gifts` (profe), `GET aura/gifts` (lista + medición), `POST aura/gifts/:id/void`,
  `GET/PUT aura/gift-settings` (cuenta 2). Más campos nuevos en la respuesta del panel de asistencia
  (`giftedToday`, `canReceiveGift`) declarados en su schema.
- **Nuevo cron:** no hace falta job nuevo (la purga va en el cron de notificaciones existente). Si se
  agrega uno, actualizar la lista y el título "N jobs" de CON-04 (lección plan 13).

### 7. Partición en planes secuenciales

| #   | Plan                                                                                                                 | Toca                                     | Test                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- |
| 01  | Migración 0349 + schema `aura_gifts`, gates de tabla                                                                 | API schema, tenant-tables, conteos       | test de migración (CI)     |
| 02  | Migración 0350 + schema `member_notifications`, gates de tabla                                                       | idem                                     | test de migración (CI)     |
| 03  | Reglas puras: ventana, semana ISO, motivos, montos, textos                                                           | `gift-rules.ts`, `amounts.ts`            | unit (local, <1 s)         |
| 04  | `GiftService.give` alumno + acreditación + tope + visibilidad                                                        | `gift-service.ts`                        | integración (CI)           |
| 05  | Rutas del alumno (pending, candidates, POST) + manifiesto + ISO-03 + rate limit                                      | rutas, schemas                           | integración                |
| 06  | Regalo del profe + `system_settings` + campos del panel de asistencia                                                | servicio, admin routes                   | integración                |
| 07  | Anular (ruta) + anulación por `removeCheckIn` + lista y medición admin                                               | servicio, attendance                     | integración                |
| 08  | Detalle privado: etiquetas de regalo con nombre y motivo                                                             | `member-routes.ts`, `movement-labels.ts` | integración + conciliación |
| 09  | Bandeja: `inbox-service`, escritura en `processQueue`, purga, rutas del alumno                                       | notifications                            | integración                |
| 10  | Push del regalo (encolar tras commit, texto D-19/D-22)                                                               | gift-service                             | integración                |
| 11  | App: API client, store de bandeja, util de agrupado por día                                                          | app                                      | unit app                   |
| 12  | App: campana en la barra + riel de escritorio + `NotificationsPage` (035 B)                                          | app                                      | typecheck                  |
| 13  | App: oferta en la card de hoy + `GiveAuraSheet` (034 A)                                                              | app                                      | unit de vista + typecheck  |
| 14  | Admin: botón y diálogo en `SlotAttendancePanel`, página de regalos con anular y medición, valor del profe en Ajustes | admin                                    | typecheck                  |
| 15  | Cierre: UAT, consultas de medición D-21 (sin correr), estado                                                         | docs                                     | —                          |

Planes 01-10 son de servidor y se pueden encadenar sin pantallas; 11-14 dependen de los schemas de
respuesta finales.

## Don't Hand-Roll

| Problema                 | No construir                       | Usar                                 | Por qué                                          |
| ------------------------ | ---------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Acreditar/descontar      | INSERT directo al ledger o `spend` | `AuraService.award` con `amount` ±   | Mantiene `aura_balances` en la misma transacción |
| Aura ganada              | Otra suma                          | `earnedAuraByUsers`                  | Conciliación D-38                                |
| Visibilidad              | Otra regla de ocultos/menores      | `effectiveVisible`, `listAccess`     | Una sola regla con la 214                        |
| Fotos de caras           | Firmar URLs a mano                 | `resolveCommunityPhotos`             | Caché horario estable                            |
| Día local / semana       | `new Date()` UTC                   | `todayInTz(sede)`, `isoWeekStart`    | Trampa UTC vs sede (memoria)                     |
| Valor editable           | Tabla nueva de config              | `system_settings` (patrón rachas)    | Ya existe y tiene precedente                     |
| Tope por usuario en POST | Contador propio                    | `@fastify/rate-limit` `keyGenerator` | Patrón del plan 17                               |
| Envío de push            | Llamar a FCM                       | `queueAdHocNotification`             | Preferencias + bandeja                           |

## Runtime State Inventory

No es fase de renombre. Omitido.

## Common Pitfalls

1. **Doble acreditación por reintento:** sin `reference_id` el UNIQUE no protege. Siempre `aura_gift`+id.
2. **`award` abre su transacción:** llamarlo con el `db` global fuera de la transacción del regalo deja
   regalos sin Aura si falla a la mitad. Usar un `AuraService` atado a `tx` como lo hace hoy la asistencia.
3. **Carrera del tope semanal:** dos regalos simultáneos pasan el `COUNT`. `FOR UPDATE` sobre el que regala.
4. **Zona horaria:** `session_date` es local; el check-in forzado guarda UTC (deuda del plan 10 de la
   214). La ventana usa `todayInTz` de la sede de la clase. Tests sin fecha fija (memoria del repo).
5. **fast-json-stringify:** todo campo nuevo (`giftedToday`, `blockedReason`, `unreadCount`) va en el
   schema o desaparece. `additionalProperties:false` no da 400, descarta (lección plan 16).
6. **`lint:tenant`:** `tenantWhere` literal en cada `.where()`; los barridos cross-tenant llevan el
   comentario `tenant-safe` como `processQueue`.
7. **Conteos de tenancy:** dos tablas nuevas mueven 3 conteos fijos y el orden de limpieza en tests.
8. **Bandeja que frena la push:** un error al insertar en la bandeja no puede marcar la push como fallida.
9. **Usuarios sin token:** hoy `processQueue` marca `failed`; la bandeja debe guardarse igual.
10. **Regalo a staff:** un profe con asistencia propia como alumno no debe aparecer como candidato (D-04).
11. **Barra a 360 px:** ya desbordaba en el UI-SPEC de la 214; no se vio renderizada. Queda para UAT.
12. **Migraciones:** `mysqlEnum` primer argumento = nombre de columna; sin `;` en comentarios; no aplicar
    en la base local; 0348 reservada.

## Code Examples

Ver Pattern 1 y 2. Textos (borrador, D-16/D-19/D-22):

- Push: título "{Nombre} te dio Aura", cuerpo "Motivo: Buena energía."
- Detalle: "{Nombre} te dio Aura · Buena energía" (+1), "Regalo anulado" (−1).
- Hoja: "Dar Aura a un compañero" / "Elegí un motivo" / botón "Dar 1 AURA".

## State of the Art

Bonusly, HeyTaco y KudosNow usan cupo periódico que vence y no sale del saldo propio, con motivo
obligatorio y tope por destinatario [CITED: `214-AURA-VALORES-RESEARCH.md` §2 y §8, con fuentes]. La 215
sigue ese modelo con cupo atado a asistencia en vez de cupo mensual.

## Decisiones de discreción (recomendadas; registrar en DECISIONES-AUTONOMAS)

1. Profe = rol tipo profe con la sede asignada; no se exige ser el profe del roster.
2. Asistencia anulada → se anulan sus regalos (dados y recibidos), sin push.
3. Regalo anulado no devuelve el cupo.
4. Tope semanal cuenta regalos vigentes, semana ISO lunes a domingo de la fecha de la clase.
5. Bandeja: 90 días, leído al tocar + "Marcar todo", destino = ruta del aviso.
6. Push de regalo en la categoría `motivacion`, sin categoría nueva.
7. Campana entre perfil y salir; a 360 px con selector, botones `dense`.
8. Valor del profe en Ajustes del admin, solo owner/admin, entero 1 a 10.
9. Anulan owner, admin y admin_sede (sus sedes).
10. El regalo del profe usa la misma ventana (hoy o ayer).

## Assumptions Log

| #   | Claim                                                                      | Section   | Risk if Wrong                                                        |
| --- | -------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| A1  | `award` con `tx` anidado se comporta como savepoint en Drizzle mysql2      | Pattern 1 | Regalo sin Aura o error; copiar el patrón de `attendance/service.ts` |
| A2  | `motivacion` es la categoría adecuada para la push                         | §4        | Quien silenció motivación no se entera ni en la bandeja              |
| A3  | `schemaTables.size` hoy es 141                                             | §6        | Test de tenancy rojo en CI; ver el número real                       |
| A4  | Las asistencias de prueba se distinguen por la reserva ligada              | §2        | Un alumno de prueba podría recibir                                   |
| A5  | Qué familia ISO-03 exige caso para `/api/members/aura` y `/api/admin/aura` | §6        | `CASOS_BASELINE` mal movido en CI                                    |

## Open Questions (RESOLVED)

1. ¿Push al anular un regalo? RESUELTO: no (plan 09 y plan 15; decisión "Regalo anulado en la bandeja").
2. ¿El regalo de la 215 se mostrará en la 216? RESUELTO: fuera de alcance de la 215; la tabla propia `aura_gifts` lo permite.

## Environment Availability

Sin dependencias externas nuevas. Node, pnpm, `tsc`, vitest (config unitaria) y `vue-tsc` por ruta
absoluta disponibles según `215-EJECUTORES.md`. MySQL local no se usa (tests de integración en CI).

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Framework          | vitest (API y app); admin sin vitest en local                                                         |
| Config file        | `el-templo-api/vitest.config.unit.ts` (unit), `vitest.config.ts` (integración, CI)                    |
| Quick run command  | `cd el-templo-api && npx vitest run --config vitest.config.unit.ts test/unit/aura-gift-rules.test.ts` |
| Full suite command | CI (`pnpm test` con MySQL `eltemplo_test`); no correr en local                                        |

### Phase Requirements → Test Map

| Req     | Comportamiento                                                                    | Tipo                | Comando / archivo                                                                 | Existe          |
| ------- | --------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- | --------------- |
| SC-1    | ventana hasta fin del día siguiente, un regalo por asistencia, motivo de la lista | unit + integración  | `test/unit/aura-gift-rules.test.ts`; `test/aura/gifts-member.test.ts`             | ❌ Wave 0       |
| SC-2    | tercer regalo de la semana → 409; receptor staff → rechazo; a sí mismo → rechazo  | integración         | `test/aura/gifts-member.test.ts`                                                  | ❌              |
| SC-3    | profe 1/día por alumno, valor de `system_settings`, no profe → 403                | integración         | `test/aura/gifts-coach.test.ts`                                                   | ❌              |
| SC-4    | saldo del que regala no cambia; movimiento con etiqueta                           | integración         | `test/aura/gifts-member.test.ts`, `test/aura/movements*.test.ts`                  | parcial         |
| SC-5    | oculto no ve candidatos, no regala, no recibe (tampoco del profe)                 | integración         | ambos archivos                                                                    | ❌              |
| SC-6    | `processQueue` escribe la bandeja con y sin token, sin duplicar; unread y read    | integración         | `test/notifications/inbox.test.ts`                                                | ❌              |
| SC-7    | anular descuenta una vez; segunda → 409; `removeCheckIn` anula                    | integración         | `test/aura/gifts-void.test.ts`                                                    | ❌              |
| SC-8    | `earned` = suma del ledger tras dar y anular                                      | integración         | `test/aura/gifts-void.test.ts`                                                    | ❌              |
| Tenancy | gimnasio 2 no ve ni anula regalos/avisos del 1                                    | ISO-01/03 + conteos | `test/tenancy/*`, `test/migrations/0192-0195*`, `0196*`                           | mover baselines |
| App     | agrupado por día, textos                                                          | unit app            | `timeout 300 pnpm exec vitest run src/utils/__tests__/notifications-view.test.ts` | ❌              |

### Sampling Rate

- Por commit: typecheck (API 0, app ≤20, admin ≤36), `pnpm lint:tenant`, prettier, el unit angosto.
- Por plan: lo anterior + lectura del test de integración escrito (no se corre).
- Gate de fase: CI verde en el primer push a staging (requiere OK de Franco).

### Wave 0 Gaps

- `test/unit/aura-gift-rules.test.ts`, `test/aura/_gift-fixtures.ts` (asistencias con `app.dbPool.query`,
  sin ids fijos de `users`), `test/aura/gifts-*.test.ts`, `test/notifications/inbox.test.ts`, test de
  migración 0349-0350.

## Security Domain

| ASVS                | Aplica         | Control                                                                                                                                                 |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication   | sí (existente) | `authenticate`                                                                                                                                          |
| V4 Access Control   | sí             | giver solo del token; receptor co-asistente validado en el servidor; roles staff por ruta + sedes de `user_branches`; bandeja solo del propio `user_id` |
| V5 Input Validation | sí             | JSON schema Fastify: ids enteros, `reason` enum, sin texto libre                                                                                        |
| V6 Cryptography     | no             | —                                                                                                                                                       |

| Amenaza                                              | STRIDE          | Mitigación                                                      |
| ---------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| Regalar a alguien que no fue (IDOR por `receiverId`) | Tampering       | Revalidar asistencia y visibilidad en el POST                   |
| Granjas de puntos entre amigos                       | Elevation       | Tope 2/semana, 1 por asistencia, anulación staff, medición D-21 |
| Doble envío / carrera                                | Tampering       | UNIQUE + `FOR UPDATE` + rate limit por usuario                  |
| Leer avisos de otro                                  | Info disclosure | `WHERE user_id = token` + `tenantWhere`                         |
| Cruce de gimnasios                                   | Info disclosure | `tenantWhere`, `tenantValues`, ISO-03                           |
| Filtrar datos personales en candidatos               | Info disclosure | Solo nombre de pila + inicial + foto firmada                    |

## Sources

### Primary (HIGH, código en `feat/regalar-aura`)

- `el-templo-api/src/db/schema/aura-transactions.ts`, `modules/aura/{service,earned,day-cap,types}.ts`
- `el-templo-api/src/modules/notifications/service.ts` (`processQueue` :688, `queueAdHocNotification` :509, purga :977)
- `el-templo-api/src/db/schema/{attendance,schedules,class-coach-assignments,notifications}.ts`, `modules/ratings/service.ts:190-250`
- `el-templo-api/src/db/tenant-tables.ts`, `test/tenancy/iso-01-manifiesto.test.ts:487`, `iso-03-*`
- `el-templo-app/src/layouts/MainLayout.vue:13-96`, `el-templo-admin/src/components/SlotAttendancePanel.vue`
- `git fetch` origin/master y origin/staging (2026-11-18)

### Secondary

- `214-CONTEXT.md`, `214-PATTERNS.md`, `215-EJECUTORES.md` (lecciones), `214-AURA-VALORES-RESEARCH.md` §2/§8

## Metadata

**Confidence:** stack HIGH (sin dependencias, todo verificado); arquitectura MEDIUM-HIGH (ledger y cola
verificados; transacción anidada y familia ISO-03 por confirmar); pitfalls HIGH (lecciones de la 214).
**Research date:** 2026-11-18. **Valid until:** mientras la rama no se rebase sobre otra migración.
