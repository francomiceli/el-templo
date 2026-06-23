---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 06
subsystem: scheduling-attendance
tags:
  [horarios, antiguedad, seniority, asistencia, vue, quasar, fastify, drizzle]

# Dependency graph
requires:
  - phase: 136-01
    provides: "MemberSegment union de 4 valores (optima|regular|alerta|ausente) en member_profiles.segment"
  - phase: 136-05
    provides: "SEGMENT_LABELS/COLORS (4 bandas) en admin types/member.ts"
provides:
  - "computeSeniority + MemberSeniority en el API (shared/date-utils): banda de antigüedad al vuelo desde users.createdAt"
  - "getSlotAttendance / getSlotDetail exponen seniority y ya NO exponen avatarType"
  - "MemberSeniority + SENIORITY_LABELS en admin types/member.ts"
  - "MemberTags.vue muestra Antigüedad + Asistencia (sin avatar) en Horarios"
affects:
  - "Cierra la superficie de Horarios de la fase 136 (Antigüedad + Asistencia, sin avatar ni badge QR/Manual)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Antigüedad derivada al vuelo (no persistida): computeSeniority en shared/date-utils, llamada en los slot endpoints; bordes en meses sobre 30.44 días/mes"
    - "BookingRecord/SlotAttendanceItem ahora portan seniority en vez de avatarType (D-12): el avatar deja de proyectarse en Horarios pero sigue vivo en el resto del sistema"

key-files:
  created:
    - .planning/phases/136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-/136-06-SUMMARY.md
  modified:
    - el-templo-api/src/modules/shared/date-utils.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/types/scheduling.ts
    - el-templo-admin/src/types/attendance.ts
    - el-templo-admin/src/components/scheduling/MemberTags.vue
    - el-templo-admin/src/components/scheduling/SlotDetailDialog.vue
  deleted: []

key-decisions:
  - "computeSeniority + MemberSeniority viven en shared/date-utils (base, sin dependencias de módulo) y se re-exportan desde scheduling/types.ts — evita acoplar attendance->scheduling y mantiene DRY"
  - "DAYS_PER_MONTH = 30.44 para derivar meses desde el delta de días (cálculo en JS sobre el createdAt ya traído, sin SQL extra, testeable)"
  - "Antigüedad usa color neutro grey-7 outline (chip secundario); Asistencia mantiene SEGMENT_COLORS de 136-05"

requirements-completed: [D-05, D-06, D-12]

# Metrics
duration: ~20min
completed: 2026-06-23
---

# Phase 136 Plan 06: Antigüedad al vuelo en Horarios + MemberTags sin avatar Summary

**Los slot endpoints de Horarios (`getSlotAttendance` / `getSlotDetail`) ahora exponen una etiqueta de Antigüedad calculada al vuelo desde `users.createdAt` (bordes D-06: nuevo/1-3m/3-6m/6m+) y dejaron de exponer `avatarType` (D-12); `MemberTags.vue` muestra solo Antigüedad + Asistencia, y la lista de asistencia ya no muestra el badge QR/Manual.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-23
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- **Antigüedad al vuelo (backend):** `computeSeniority(createdAt)` + `type MemberSeniority` agregados a `shared/date-utils.ts`. Clasifica por meses (`días / 30.44`) con los 4 bordes de D-06 (`[0,1)→nuevo`, `[1,3)→1-3m`, `[3,6)→3-6m`, `[6,∞)→6m+`); retorna `null` defensivo cuando `createdAt` es null/inválido.
- **`getSlotAttendance`** (attendance/service.ts): selecciona `users.createdAt` en las dos queries (bookings + attendance), expone `seniority` en cada miembro, y quita `avatarType` del tipo inline y del memberMap.
- **`getSlotDetail`** (scheduling/service.ts): selecciona `users.createdAt`, mapea `seniority` en cada `BookingRecord`, quita `avatarType`.
- **`BookingRecord`** (scheduling/types.ts): `avatarType` reemplazado por `seniority: MemberSeniority | null`; `MemberSeniority` re-exportado desde el contrato de scheduling.
- **Response serializers Fastify** (attendance/schemas.ts + scheduling/schemas.ts): `slotAttendanceItemSchema` y `bookingRecordSchema` cambian `avatarType` por `seniority` — sin esto el serializer strippearía el campo nuevo y la feature no llegaría al frontend (Rule 2).
- **`mapBookingRow`** (booking-service.ts): los single-booking lookups (member-facing, sin join de perfil) pasan `seniority: null` en vez de `avatarType: null` (Rule 3, breakage directo del cambio de contrato de `BookingRecord`).
- **`MemberTags.vue`:** reescrito a dos chips — Antigüedad (`SENIORITY_LABELS`, grey-7 outline) + Asistencia (`SEGMENT_LABELS`/`SEGMENT_COLORS`). Avatar e import de `AVATAR_LABELS` eliminados. D-07: si `segment` es null no se renderiza el chip de Asistencia, solo Antigüedad.
- **`types/member.ts` (admin):** `MemberSeniority` + `SENIORITY_LABELS` (nuevo→"Nuevo", 1-3m→"1-3 meses", 3-6m→"3-6 meses", 6m+→"+6 meses").
- **`types/scheduling.ts` + `types/attendance.ts` (admin):** `avatarType` reemplazado por `seniority: 'nuevo' | '1-3m' | '3-6m' | '6m+' | null` en los shapes de booking/member de slot.
- **`SlotDetailDialog.vue`:** los 4 usos de `<MemberTags>` pasan `:seniority` en vez de `:avatar-type`. Incorporado y commiteado el cambio previo (sin commitear) que removió el badge QR/Manual de la lista de asistencia.

## Task Commits

1. **Task 1: Antigüedad al vuelo en slot endpoints + quitar avatarType (backend)** — `e619f44e` (feat)
2. **Task 2: MemberTags Antigüedad + Asistencia sin avatar + tipos slot + badge QR/Manual** — `1259c088` (feat)

## Files Created/Modified

Backend:

- `el-templo-api/src/modules/shared/date-utils.ts` — `computeSeniority` + `MemberSeniority`.
- `el-templo-api/src/modules/attendance/service.ts` — `getSlotAttendance` con seniority, sin avatarType.
- `el-templo-api/src/modules/attendance/schemas.ts` — `slotAttendanceItemSchema`: seniority en vez de avatarType.
- `el-templo-api/src/modules/scheduling/service.ts` — `getSlotDetail` con seniority, sin avatarType.
- `el-templo-api/src/modules/scheduling/schemas.ts` — `bookingRecordSchema`: seniority en vez de avatarType.
- `el-templo-api/src/modules/scheduling/types.ts` — `BookingRecord.seniority` (re-export de `MemberSeniority`).
- `el-templo-api/src/modules/scheduling/booking-service.ts` — `mapBookingRow`: `seniority: null`.

Frontend (admin):

- `el-templo-admin/src/types/member.ts` — `MemberSeniority` + `SENIORITY_LABELS`.
- `el-templo-admin/src/types/scheduling.ts` — `BookingRecord.seniority`.
- `el-templo-admin/src/types/attendance.ts` — `SlotAttendanceItem.seniority`.
- `el-templo-admin/src/components/scheduling/MemberTags.vue` — Antigüedad + Asistencia, sin avatar.
- `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` — `:seniority` en los 4 MemberTags + badge QR/Manual removido.

## Decisions Made

- **Ubicación de `computeSeniority`/`MemberSeniority`:** `shared/date-utils.ts` (módulo base, sin dependencias de otros módulos), re-exportado desde `scheduling/types.ts`. Evita acoplar `attendance` -> `scheduling` y centraliza la lógica (DRY) para los dos endpoints.
- **`DAYS_PER_MONTH = 30.44`:** cálculo en JS sobre el `createdAt` ya traído (sin `TIMESTAMPDIFF` extra), testeable y sin SQL adicional. El plan preferencia explícitamente JS sobre SQL.
- **Color de Antigüedad:** grey-7 outline (chip secundario neutro), separado de los colores semánticos de Asistencia.

## Deviations from Plan

### 1. [Rule 2 - Funcionalidad crítica faltante] Actualizar los response serializers de Fastify

- **Found during:** Task 1
- **Issue:** `slotAttendanceItemSchema` (attendance/schemas.ts) y `bookingRecordSchema` (scheduling/schemas.ts) declaran `response.properties` con `avatarType`. El serializer de Fastify strippea cualquier campo no declarado, así que sin actualizar estos schemas el nuevo `seniority` nunca llegaría al frontend (y `avatarType` seguiría apareciendo). Ninguno de los dos archivos está en la lista de propiedad del plan, pero es dependencia directa del cambio de Task 1.
- **Fix:** Reemplacé `avatarType: { type: ["string","null"] }` por `seniority: { type: ["string","null"] }` en ambos schemas.
- **Files modified:** `el-templo-api/src/modules/attendance/schemas.ts`, `el-templo-api/src/modules/scheduling/schemas.ts`
- **Commit:** `e619f44e`

### 2. [Rule 3 - Blocking] mapBookingRow en booking-service.ts seteaba avatarType

- **Found during:** Task 1 (typecheck del proyecto)
- **Issue:** Cambiar el contrato `BookingRecord` (avatarType -> seniority) rompió `mapBookingRow` en `booking-service.ts:1855` (`TS2353: 'avatarType' does not exist in type 'BookingRecord'`). Es un builder de single-booking lookups (member-facing) que no joina el perfil; `segment`/`avatarType` siempre fueron null.
- **Fix:** Cambié `avatarType: null` por `seniority: null` (estos callsites no muestran antigüedad — null es correcto). `booking-service.ts` no está en la lista del plan pero el cambio es consecuencia directa y obligatoria del cambio de contrato.
- **Files modified:** `el-templo-api/src/modules/scheduling/booking-service.ts`
- **Commit:** `e619f44e`

---

**Total deviations:** 2 (Rule 2 — serializers, Rule 3 — builder bloqueante). Ambas son propagación obligatoria del cambio de contrato `BookingRecord`/`SlotAttendanceItem`. Sin scope creep: solo se tocó lo necesario para que la Antigüedad llegue al frontend y el typecheck pase. El avatar NO se eliminó del sistema (`AVATAR_LABELS` y la columna `avatarType` siguen vivos fuera de los slot endpoints).

## Issues Encountered

- **D-12 verificado por grep:** `avatarType`/`avatar-type`/`AVATAR_LABELS` solo se consumían en `MemberTags.vue` y `SlotDetailDialog.vue` dentro de Horarios; ningún otro consumidor de Horarios necesita el avatar, por lo que es seguro dejar de proyectarlo en los slot endpoints.
- **Errores de typecheck pre-existentes / esperados (NO corregidos, fuera de file-ownership):**
  - API: `src/modules/settings/routes.ts` + `src/modules/settings/service.ts` (imports muertos de `SegmentThresholds`/`SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS`) — los elimina **136-07**.
  - Admin: `src/composables/useSettingsApi.ts` (`SegmentThresholds`) — lo elimina **136-07**; `src/utils/pdf/session-pdf-builder.ts` + `src/boot/__tests__/axios-refresh-lock.test.ts` — pre-existentes, sin relación con esta fase (ya deferidos en `deferred-items.md` por 136-05).
- **`session-data-transformer.ts`** tiene un cambio sin commitear NO relacionado con esta fase — **NO se tocó ni se stageó** (verificado: no está en `git diff --cached`).

## Verification

- **`pnpm tsc --noEmit` API: mis 7 archivos LIMPIOS** (attendance/service+schemas, scheduling/service+schemas+types+booking-service, shared/date-utils). Los únicos errores del API son los 5 de `settings/*` (esperados → 136-07).
- **`pnpm tsc --noEmit` admin: mis 5 archivos LIMPIOS** (MemberTags, SlotDetailDialog, types/scheduling, types/attendance, types/member). Errores restantes: `useSettingsApi.ts` (→136-07) + `session-pdf-builder.ts`/`axios-refresh-lock.test.ts` (pre-existentes, deferidos).
- **Grep gates Task 1:** `seniority` presente en attendance/service, scheduling/service, scheduling/types; `avatarType` ausente de scheduling/types. OK.
- **Grep gates Task 2:** `seniority` en MemberTags; `AVATAR_LABELS` ausente de MemberTags; `avatar-type` ausente de SlotDetailDialog. OK.
- **Badge QR/Manual:** removido de la lista de asistencia (0 coincidencias de `'QR' : 'Manual'`).
- **D-07:** `MemberTags` renderiza el chip de Asistencia solo si `segment` no es null.
- **Sin deletions accidentales** en ninguno de los 2 commits.
- **Tests NO ejecutados localmente** (convención del proyecto: corren en CI al pushear). Sin migraciones (Antigüedad no se persiste).

## Self-Check: PASSED

- Los 12 archivos modificados existen en disco.
- Commits `e619f44e` y `1259c088` presentes en el historial de `staging`.
- `session-data-transformer.ts` no fue stageado en ninguno de los 2 commits.

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-23_
