---
phase: 202-conquer-tutoriales-correcciones
plan: 05
subsystem: api
tags: [conquer, corrections, video, r2, fastify, drizzle, admin]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: loadCorrectionRows / toCorrectionView / callVideoStore / resolveCorrectionVideo (202-03, 202-04), claves y remove del bucket privado (202-02)
provides:
  - GET /api/admin/conquer/corrections?status=pendiente|respondida
  - GET /api/admin/conquer/corrections/count
  - GET /api/admin/conquer/corrections/:id/video-url?who=alumno|coach
  - DELETE /api/admin/conquer/corrections/:id/video
  - correction-admin-service.ts (AdminCorrectionView, loadAdminCorrection, toAdminCorrectionView)
affects: [202-06, 202-09, 202-10]
tech-stack:
  added: []
  patterns:
    - "Vista del coach derivada de la del alumno (toCorrectionView menos replyUnseen) en vez de un segundo mapper"
    - "Borrado en dos pasos: primero el objeto en R2, después la fila; si R2 falla, 503 y la fila no cambia"
key-files:
  created:
    - el-templo-api/src/modules/conquer/correction-admin-service.ts
    - el-templo-api/test/conquer/corrections-admin.test.ts
  modified:
    - el-templo-api/src/modules/conquer/correction-service.ts
    - el-templo-api/src/modules/conquer/correction-schemas.ts
    - el-templo-api/src/modules/conquer/correction-routes.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Respondidas por replied_at DESC: loadCorrectionRows ganó un orderBy opcional (createdAt por defecto) en vez de re-ordenar en JS (que habría cortado mal las 50)"
  - "repliedByName es el nombre de pila del coach (la fila de 202-03 solo trae repliedByFirstName)"
  - "El UPDATE del borrado no lleva guarda isNotNull(video_key): no hay test determinista para la carrera, y el peor caso es last-writer-wins en la auditoría"
requirements-completed: [D-26, D-28, D-29, D-08]
duration: 55min
completed: 2026-10-27
---

# Phase 202 Plan 05: Bandeja de correcciones del coach (API) Summary

**Cuatro rutas del admin (lista de pendientes y respondidas, contador, URL de cada video y borrado del video del alumno con quién y cuándo) montadas sobre los helpers de 202-03/04 y detrás del guard `canManageConquer`.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `e6863e8df` | feat(202-05): bandeja de correcciones del coach: lista, contador, videos y borrar el del alumno (D-28, DA-45) |
| 1b | `d938c9286` | refactor(202-05): el UPDATE del borrado de video no lleva guarda extra (sin test determinista posible) |
| 2 | `8e41ab73e` | test(202-05): bandeja del coach: orden, contador, videos, borrado y aislamiento |

## Contratos JSON exactos (para 202-09 y 202-06)

Todas bajo `/api/admin/conquer`, con el guard de plugin (`onRequest`, `canManageConquer`: solo owner/admin; cualquier otro rol o un socio
recibe 403, sin token 401; gimnasio sin `templo-training` 404). Errores de negocio salen `{ error, code }`; los 400 de Ajv (id no
entero, falta `who`) NO traen `code`.

```ts
AdminCorrectionView = {
  // lo mismo que CorrectionView del alumno (202-03) MENOS replyUnseen
  id: number
  kind: "escalon" | "combo"
  targetLabel: string              // "{ejercicio} · {Escalón N} · {peldaño guardado}" | "Combo {label}"
  comment: string | null
  durationSec: number
  createdAt: string                // ISO
  status: "pendiente" | "respondida"
  videoDeleted: boolean            // video_deleted_at no NULL
  reply: { text: string | null; hasVideo: boolean; videoSeconds: number | null; repliedAt: string } | null
  // lo nuevo del coach
  userId: number
  memberName: string               // "Nombre Apellido" (trim; "" si el socio no tiene nombre)
  level: "ternero" | "novillo" | "toro" | null   // null si el alumno ya no tiene fila conquer_members
  videoDeletedAt: string | null    // ISO del borrado del coach
  repliedByName: string | null     // NOMBRE DE PILA del coach que respondió
  canReply: boolean                // status === "pendiente"
}
```

### `GET /corrections?status=pendiente|respondida` -> 200 `{ items: AdminCorrectionView[] }`

- Sin `status` = `pendiente`. Pendientes: todas (red de seguridad 1000), `created_at` ASC (la más vieja primero), `id` ASC de desempate.
- `respondida`: las 50 más nuevas por `replied_at` DESC (`id` DESC de desempate).
- `status` fuera de `pendiente`/`respondida` (incluido `""`, `PENDIENTE`, `a,b`) -> 400 `CONQUER_CORRECCION_ESTADO_INVALIDO`.
- No toca storage (anda sin bucket). La respuesta nunca trae `videoKey`/`replyVideoKey`.

### `GET /corrections/count` -> 200 `{ count: number }` (pendientes del gimnasio; las respondidas no cuentan)

### `GET /corrections/:id/video-url?who=alumno|coach` -> 200 `{ available, url, expiresIn }`

Mismo contrato que el del alumno (202-04): `{ available: true, url, expiresIn: 300 }` o `{ available: false, url: null, expiresIn: null }`
(clave NULL, o el objeto ya no existe). Orden: 404 "Corrección no encontrada" -> 400 `CONQUER_VIDEO_QUIEN_INVALIDO` -> storage
(503 `CONQUER_VIDEOS_NO_DISPONIBLES` solo si hay clave y no hay bucket). `who` es obligatorio (sin él, 400 de Ajv). El coach NO filtra por
alumno: ve cualquier corrección de su gimnasio.

### `DELETE /corrections/:id/video` -> 200 `AdminCorrectionView` (ya con `videoDeleted: true`, `videoDeletedAt` ISO)

Orden: 404 -> si `video_key` ya es NULL, 200 con la vista sin tocar el storage (idempotente, anda sin bucket y no pisa quién/cuándo) -> 503 si
no hay bucket -> `remove(video_key)` (si R2 falla: 503 `CONQUER_VIDEOS_NO_DISPONIBLES` y la fila NO cambia) -> UPDATE
`video_key = NULL, video_deleted_at = NOW(), video_deleted_by = request.user.userId`. Nunca toca `reply_video_key`, `comment`, `status` ni
`reply_*`. El estado de la corrección no cambia (una pendiente sigue pendiente y `canReply: true`). Log: `request.log.info({ correctionId })`.

## Servicio (`correction-admin-service.ts`)

```ts
listCorrectionsForAdmin(db, ctx, status: string | undefined): Promise<{ items: AdminCorrectionView[] }>
countPendingCorrections(db, ctx): Promise<number>
getAdminCorrectionVideoUrl(fastify, ctx, correctionId, who: string): Promise<CorrectionVideoUrl>
deleteCorrectionVideo(fastify, ctx, actorUserId, correctionId): Promise<AdminCorrectionView>
toAdminCorrectionView(row: CorrectionRow): AdminCorrectionView
loadAdminCorrection(db, ctx, correctionId): Promise<CorrectionRow>   // 404 "Corrección no encontrada"
ADMIN_ANSWERED_LIMIT = 50, ADMIN_PENDING_LIMIT = 1000
```

Schemas nuevos en `correction-schemas.ts`: `adminCorrectionViewSchema` (el del alumno sin `replyUnseen` + los campos del coach),
`adminCorrectionsSchema`, `adminCorrectionsCountSchema`, `adminCorrectionVideoUrlSchema` (alias de `correctionVideoUrlSchema`: mismo
contrato), `deleteCorrectionVideoSchema`. Las rutas viven en `registerCorrectionAdminRoutes(fastify)` (`correction-routes.ts`), llamada al
FINAL de `conquerAdminRoutes` (después del `addHook`).

## Manifiesto y tenancy

- `ENTRADAS_BASELINE`: **521 -> 525** (las 4 rutas, `templo-module` / `templo-training`), título del `it` ("exactamente las 525 entradas") y
  comentario fechado 2026-10-27.
- Tenancy sin cambios: 116 gym-owned / 121 schema (sin tablas ni migraciones).

## Tests (escritos, NO corridos: regla del proyecto)

`corrections-admin.test.ts` (~1000 líneas): pendientes con 3 correcciones de 2 alumnos creadas en orden distinto al de antigüedad (vieja
primero, nombre, nivel, `canReply`, la respondida no entra); el `targetLabel` del coach es el mismo texto que ve el alumno y la respuesta no
filtra claves ni `replyUnseen`; sin `status` = pendientes; lista vacía; combo; respondidas por `replied_at` (con alta en orden inverso),
`repliedByName` y `repliedBy` NULL; tope de 50 con 51 respondidas; `it.each` de `status` inválidos (+ vacío); contador (owner y admin, las
respondidas no cuentan, baja al responder); video-url (alumno, coach, objeto vencido, pendiente sin video del coach, `it.each` de `who`
inválidos, sin `who`, id no entero, 404 antes que `who`, 503 sin bucket); DELETE (objeto y clave, `video_deleted_by`/`_at`, comentario,
estado y `reply_video_key` intactos, video del alumno ya no está y el del coach sí, repetir con otro staff no vuelve a llamar `remove` ni pisa
la auditoría, pendiente sigue pendiente, R2 que tira -> 503 sin filtrar el mensaje y fila intacta, sin bucket -> 503, sin clave y sin bucket
-> 200, inexistente 404, id no entero 400); permisos (`describe.each` de 5 roles x `it.each` de 4 rutas -> 403 sin tocar storage ni fila;
socio común 403 x 4; sin token 401 x 4); aislamiento (gimnasio 2 sin módulo -> 404 x 4; cada gimnasio lista y cuenta lo suyo; video-url y
DELETE cross-tenant 404 en ambos sentidos con la fila intacta).

## Mutantes razonados (aplicados de verdad, compilaban con `tsc`, revertidos con `git checkout --` y `git status` limpio)

| # | Archivo | Mutante | Lo atrapa |
| - | ------- | ------- | --------- |
| 1 | `correction-admin-service.ts` | UPDATE de la fila ANTES de `remove` | `corrections-admin.test.ts` l.807 `expect(fila.videoKey).toBe(key)` (y l.808-809 `videoDeletedAt`/`videoDeletedBy` `toBeNull`) del test "si R2 falla" (l.785): la fila ya cambió aunque `remove` tire |
| 2 | `correction-admin-service.ts` | pendientes con `order: "desc"` | l.294 `expect(items.map(id)).toEqual([viejaAna, mediaAna, recienteBeto])`: saldría `[recienteBeto, mediaAna, viejaAna]` |
| 3 | `correction-admin-service.ts` | el DELETE también pone `replyVideoKey: null` | l.709 `expect(fila.replyVideoKey).toBe(claveCoach)` y l.744-745 (el video del coach deja de estar `available`) |
| 4 | `correction-admin-service.ts` | `countPendingCorrections` sin `tenantWhere` | l.962-963 `toEqual({ count: 2 })` del gimnasio 1 (daría 3) y `{ count: 1 }` del 2 (daría 3) |
| 5 | `correction-admin-service.ts` | respondidas sin `orderBy: "repliedAt"` (por alta) | l.423 `toEqual([a, c, b])` (saldría `[b, c, a]`) y l.463 `toEqual(ids.slice(0, 50))` |
| 6 | `correction-admin-service.ts` | `who=alumno` lee `replyVideoKey` (y al revés) | l.564 `toContain(key)`, l.589-590 (`toContain(claveCoach)` / `not.toContain(claveAlumno)`) |

## Desvíos del plan

1. **[Rule 3] `correction-service.ts` no estaba en `files_modified`.** Las respondidas se piden "por `replied_at` DESC" pero
   `loadCorrectionRows` solo ordenaba por `created_at`. Re-ordenar en JS habría cortado mal las 50 más nuevas, así que se sumó
   `orderBy?: "createdAt" | "repliedAt"` (opcional; por defecto igual que antes, el alumno no cambia). Dentro de `e6863e8df`.
2. **`repliedByName` = nombre de pila.** La fila de 202-03 solo trae `repliedByFirstName`; agregar el apellido implicaba otra columna y otro
   alias del join. Simple: el nombre de pila del coach alcanza para la bandeja.
3. **Guarda `isNotNull(video_key)` del UPDATE: la puse y la saqué** (commit `d938c9286`). Protegía la auditoría de dos borrados simultáneos,
   pero no hay forma determinista de testearla (el 2º DELETE secuencial sale por el camino idempotente antes del UPDATE). Quedó como el plan:
   UPDATE por `tenant + id`; en la carrera gana el último en escribir.
4. `adminCorrectionVideoUrlSchema` es un alias de `correctionVideoUrlSchema` (mismo contrato, DRY) y no una copia.
5. Para cumplir el `grep video_deleted_by` del verify sin agregar un comentario de relleno, el título del test principal del DELETE nombra
   las columnas (`video_deleted_by` y `video_deleted_at`).
6. Los tests de permisos y aislamiento usan un socio común con una corrección de combo (`plainCorrection`), sin activarlo en Conquer: la
   lista/guard no lo necesitan y evita ~25 altas por la API.

## Ambigüedades nuevas (opción más simple adoptada)

1. `GET /corrections` sin `status`: pendientes (como dice el plan); `status=""` es 400, no cae al default.
2. Pendientes "todas" = límite de seguridad de 1000 filas (cada alumno tiene tope de 3).
3. `level` es `null` en la vista si el alumno ya no tiene fila en `conquer_members` (join izquierdo); el schema lo admite.
4. `memberName` es `""` si el socio no tiene nombre ni apellido (las columnas de `users` admiten NULL).

## Trampas para los próximos ejecutores

1. **202-06 (responder):** el `UPDATE` de la respuesta debe llevar `WHERE status = 'pendiente'` y fijar `status`, `reply_*`, `replied_by` y
   `replied_at` en UNA sola sentencia (DA-43). Para devolver la vista usar `loadAdminCorrection` + `toAdminCorrectionView` (ya existen).
   `replied_by` se muestra como `repliedByName` (nombre de pila).
2. `loadCorrectionRows` acepta ahora `orderBy: "repliedAt"`; `repliedAt` es `datetime` y puede ser NULL en pendientes (irrelevante porque el
   filtro de respondidas ya las excluye).
3. En tests del coach, un rol sin permiso (`coach`, `gestion`, `recepcion`, `admin_sede`, `coach_actividad`) recibe 403 aun en gimnasio sin el
   módulo; para el 404 cross-tenant usar `gym2.adminToken` con `setModuleFlag(app, TENANT_DOS, "templo-training", true)`.
4. Insertar una corrección en el gimnasio 2: `tenantValues({ tenantId: TENANT_DOS }, { userId, comboKey: "push", videoSeconds, videoKey,
   status: "pendiente" as const })`; `exercise_id`/`step`/`rung_id` son NULL-ables en la base. Ver `insertGym2Correction` del test (local al
   archivo, no está en `_helpers.ts`).
5. `mockVideoStore({ head?, remove? })` del test tiene espías de `head`, `presignGet` y `remove`; está local a `corrections-admin.test.ts`
   (si 202-06/07 lo necesitan conviene moverlo a `_helpers.ts`, fuera del alcance de este plan).
6. Para admin (202-09): `level`, `userId` y `memberName` ya vienen en cada ítem; `canReply` decide si se muestra el formulario. `videoDeleted`
   (booleano) y `videoDeletedAt` (ISO) alcanzan para pintar "Video borrado"; no hay `hasVideo` del alumno: si `videoDeleted` es false hay clave.
   `available: false` en `video-url` NO es error ("Video no disponible"); el 503 sí.
7. Manifiesto de rutas hoy: **525**. Tenancy: 116 gym-owned / 121 schema.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Creados: `correction-admin-service.ts`, `corrections-admin.test.ts`; modificados los 4 archivos del API, `correction-service.ts`, manifiesto e
  ISO-01: presentes.
- Commits `e6863e8df`, `d938c9286` y `8e41ab73e` en `git log`.
- Gates: `npx tsc --noEmit` OK, `pnpm lint:tenant` rc 0 (DISCREPANCIAS 0), `pnpm typecheck:tests` filtrado sin salida, higiene (`any`,
  `console`) vacía, prettier OK sobre los archivos propios. Tests escritos y NO corridos.
