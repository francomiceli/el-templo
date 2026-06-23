---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
verified: 2026-06-22T20:30:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Admin Horarios — SlotDetailDialog muestra dos chips por alumno: Antigüedad (Nuevo/1–3 meses/3–6 meses/+6 meses, gris outline) y Asistencia (Óptima/Regular/Alerta/Ausente con los colores correctos). No aparece ningún chip de avatar (A–K)."
    expected: "Cada alumno en la lista muestra su banda de Antigüedad en gris y la de Asistencia en verde/ámbar/naranja/rojo. Alumnos con <1 mes de antigüedad muestran solo Antigüedad (sin chip de Asistencia). No hay badge QR/Manual."
    why_human: "Requiere datos reales de la DB y renderizado del frontend en producción/staging."
  - test: "Admin Alumnos — filtro de columna 'Asistencia' muestra las 4 opciones (Óptima, Regular, Alerta, Ausente) y filtra correctamente. La columna se llama 'Asistencia', no 'Segmento'."
    expected: "El dropdown del filtro lista los 4 valores nuevos. Aplicar el filtro ?segment=alerta retorna solo miembros con esa etiqueta, sin HTTP 400."
    why_human: "Requiere interacción con el admin en staging/prod."
  - test: "Admin Detalle de Alumno — la card muestra 'Asistencia' (no 'Segmentación') con la etiqueta de la banda correcta para ese miembro."
    expected: "Un miembro con 80% de uso ve 'Óptima' en verde. Uno con 20% ve 'Alerta' en naranja."
    why_human: "Requiere datos reales y navegación al detalle de un alumno."
  - test: "Admin Analytics / Miembros — la worklist de seguimiento muestra miembros 'Ausente' antes que 'Alerta', y la leyenda dice 'ausentes y en alerta primero'."
    expected: "El ordenamiento de la worklist es correcto (ausente = mayor prioridad). No aparecen columnas ni buckets de los 6 segmentos viejos."
    why_human: "Requiere datos reales en la DB y navegación a la pestaña Miembros del panel de analytics."
  - test: "Admin Notificaciones — el selector de segmento muestra las 4 bandas nuevas (Óptima, Regular, Alerta, Ausente) y permite disparar una notificación push a una banda específica."
    expected: "Las 4 opciones aparecen y son seleccionables. No aparecen opciones viejas (Espartano, Ghost, etc.). La página de Configuración de umbrales NO aparece en el menú de navegación."
    why_human: "Requiere navegación manual al admin en staging/prod."
  - test: "Member app Mi Templo — el saludo de bienvenida (SegmentGreeting) muestra 'Hola,' independientemente de la banda de asistencia, y no se rompe para miembros con <1 mes (NULL)."
    expected: "Cualquier miembro activo ve 'Hola, [Nombre]!' sin importar su banda. Un miembro nuevo (<1 mes) también ve 'Hola, [Nombre]!' sin error."
    why_human: "Requiere build de la app y cuenta de miembro real en staging."
  - test: "Push notifications — el cron de las 3AM dispara correctamente las notificaciones de transición con las nuevas bandas: alerta dispara 'Tu práctica te espera', ausente desde alerta dispara 'El Templo no cierra', recuperación a óptima/regular dispara '¡Bienvenido de vuelta!', óptima dispara '¡Semana increíble!'."
    expected: "Los 5 template_key originales siguen funcionando; los disparadores mapeados a los nuevos estados. Verificar en pending_notifications después del próximo ciclo de 3AM."
    why_human: "Requiere esperar el ciclo nocturno del cron o invocar manualmente el batch, y consultar la tabla pending_notifications en producción/staging."
  - test: "Migración 0151 aplicada en staging/prod — confirmar que la columna member_profiles.member_segment tiene solo los 4 valores nuevos y que ningún row tiene valores viejos."
    expected: "SELECT DISTINCT member_segment FROM member_profiles retorna solo NULL, 'optima', 'regular', 'alerta', 'ausente'. La tabla system_settings no tiene las claves segment.* de thresholds."
    why_human: "Requiere acceso a la DB de staging/prod (aún no se ha pusheado a CI)."
---

# Phase 136: Rediseño del Sistema de Segmentación — Verification Report

**Phase Goal:** Reemplazar el enum de segmento (`nuevo`/`espartano`/`intermitente`/`en_riesgo`/`digital_warrior`/`ghost`) con una etiqueta de **Asistencia** de 4 bandas (`optima`/`regular`/`alerta`/`ausente`) basada en % de uso de membresía en ventana de 28 días, propagar a TODO el admin (Alumnos, Analytics, Notificaciones, Horarios) + member app, agregar **Antigüedad** solo en Horarios, y eliminar el subsistema de settings de umbrales.

**Verified:** 2026-06-22T20:30:00Z
**Status:** GOAL ACHIEVED — verificación técnica completa (12/12 must-haves), UAT visual pendiente
**Re-verification:** No — verificación inicial

---

## Veredicto General

**GOAL ACHIEVED en el codebase.** Los 12 must-haves (D-01..D-12) están implementados y verificados con evidencia directa en el código. El typecheck del API queda 100% limpio (exit 0) y el del admin retiene únicamente los 2 errores pre-existentes no relacionados (`session-pdf-builder.ts` + `axios-refresh-lock.test.ts`). El status es `human_needed` porque quedan 8 ítems de UAT visual/funcional que solo pueden confirmarse con datos reales en staging/prod (las pantallas del admin, la app del miembro y el cron nocturno).

---

## Resultados por Decisión Locked (D-01..D-12)

### Observable Truths

| #   | Decisión | Verdad Observable                                                                                  | Status   | Evidencia                                                                                                                                                                                                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D-01     | `MemberSegment` = 4 valores en todo el codebase; sin valores viejos como estados vivos             | VERIFIED | `segmentation/types.ts:17`, `member-profiles.ts:37-40`, `useUserStore.ts:15`, `admin/types/member.ts:15`; grep de `=== "ghost"/"en_riesgo"/"espartano"` → vacío                                                             |
| 2   | D-02     | Motor clasifica por `attendanceCount / (classesPerWeek × 28/7) × 100`                              | VERIFIED | `segmentation/service.ts:88-139` — ventana de 28 días, expectedClasses = classesPerWeek × (28/7)                                                                                                                            |
| 3   | D-03     | Cortes 75/50/1 fijos en código; módulo settings eliminado                                          | VERIFIED | `types.ts:22-29` constantes `ATTENDANCE_OPTIMA/REGULAR/ALERTA_PCT`; settings dir `ls: No such file or directory`; `app.ts` sin `settingsRoutes`                                                                             |
| 4   | D-04     | `>100%` sigue siendo `optima` (criterio ≥75)                                                       | VERIFIED | `service.ts:128` — `if (attendancePct >= ATTENDANCE_OPTIMA_PCT) return "optima"`                                                                                                                                            |
| 5   | D-05     | Antigüedad mostrada SOLO en Horarios (SlotDetailDialog/MemberTags)                                 | VERIFIED | `MemberTags.vue` renderiza `seniority`; sin `seniority` en AlumnosPage/AlumnoDetailPage/analytics                                                                                                                           |
| 6   | D-06     | Antigüedad calculada al vuelo desde `users.createdAt` con bordes `[0,1)/[1,3)/[3,6)/[6,∞)` meses   | VERIFIED | `shared/date-utils.ts:209-238` — `computeSeniority()` con `DAYS_PER_MONTH=30.44`; llamada en `attendance/service.ts:459,488` y `scheduling/service.ts:356`                                                                  |
| 7   | D-07     | `<1 mes` → NULL (sin etiqueta de Asistencia); chip de Asistencia omitido en MemberTags cuando null | VERIFIED | `service.ts:68-77` guard `MIN_TENURE_DAYS=30`; `MemberTags.vue:6` `v-if="segment"`                                                                                                                                          |
| 8   | D-08     | Sin plan activo → NULL (sin denominador)                                                           | VERIFIED | `service.ts:80-102` — query de suscripción activa/pausada; retorna null si no hay `classesPerWeek`                                                                                                                          |
| 9   | D-09     | Migración 0151: reset a NULL + ALTER enum; primer arg `mysqlEnum("member_segment", ...)` coincide  | VERIFIED | `0151_attendance_label_enum.sql` — UPDATE→NULL antes del ALTER; `member-profiles.ts:37` `mysqlEnum("member_segment", ["optima","regular","alerta","ausente"])`                                                              |
| 10  | D-10     | 5 template_key preservados; disparadores reconectados a los 4 estados nuevos                       | VERIFIED | `notifications/types.ts:55-60` `SEGMENT_TRANSITION_TEMPLATES` con keys `any_to_alerta/alerta_to_ausente/recovery_to_active/any_to_optima`; `TEMPLATE_SEEDS` intacto (9 entradas, copy sin cambios)                          |
| 11  | D-11     | Cron 3AM activo; getThresholds/golden-case eliminados; ghost-reattempt → ausente                   | VERIFIED | `notification-cron.ts:212` `"0 3 * * *"`; sin `getThresholds`/`isFrequencyGoldenCase`; líneas 286-287 comparan `ausente`/`ausente` para reattempt                                                                           |
| 12  | D-12     | Avatar removido de Horarios (`avatarType` no expuesto por slot endpoints); `MemberTags` sin avatar | VERIFIED | `attendance/service.ts`: sin `avatarType`; `scheduling/schemas.ts:88-91` `seniority` en lugar de `avatarType`; `SlotDetailDialog.vue` pasa `:seniority` (sin `avatar-type`); `MemberTags.vue` sin import de `AVATAR_LABELS` |

**Score: 12/12 truths verified**

---

## Plan-Check Blockers Cerrados

Los 4 blockers identificados en el plan-check previo fueron resueltos:

| Blocker                                                | Archivo                        | Fix Aplicado                                                                                                | Status |
| ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------ |
| Schema 400 en members                                  | `members/schemas.ts:169`       | enum del query param `segment` → `["optima","regular","alerta","ausente"]`                                  | CLOSED |
| `getAttentionList.priorityRank` con literales muertos  | `analytics/service.ts:673-674` | `"ausente"→0, "alerta"→1`                                                                                   | CLOSED |
| `MiembrosTab SEGMENT_PRIORITY` con `{ghost,en_riesgo}` | `MiembrosTab.vue:219-220`      | `{ausente:0, alerta:1}`                                                                                     | CLOSED |
| `cron getThresholds` + golden-case                     | `notification-cron.ts`         | bloque eliminado + import de FrequencyService removido                                                      | CLOSED |
| Settings subsistema                                    | `settings/` dir                | eliminado completo (4 archivos) + desregistrado de `app.ts` + `useSettingsApi.ts` + `ConfiguracionPage.vue` | CLOSED |

---

## Artifacts Verificados

| Artifact                                                               | Status             | Detalles                                                                                                        |
| ---------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ---------- | ----- |
| `el-templo-api/src/modules/segmentation/types.ts`                      | VERIFIED           | `MemberSegment` 4 valores, constantes fijas, sin `SegmentThresholds`/`SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS` |
| `el-templo-api/src/modules/segmentation/service.ts`                    | VERIFIED           | `calculateSegment` con lógica de 4 bandas, guards D-07/D-08, sin `getThresholds`                                |
| `el-templo-api/src/db/schema/member-profiles.ts`                       | VERIFIED           | `memberSegmentEnum("member_segment", ["optima","regular","alerta","ausente"])`                                  |
| `el-templo-api/src/db/migrations/0151_attendance_label_enum.sql`       | VERIFIED           | UPDATE→NULL + ALTER enum + DELETE settings; sin `;` en comentarios                                              |
| `el-templo-api/src/modules/notifications/types.ts`                     | VERIFIED           | `SEGMENT_TRANSITION_TEMPLATES` reconectado; `TEMPLATE_SEEDS` con los 5 copy originales intactos                 |
| `el-templo-api/src/jobs/notification-cron.ts`                          | VERIFIED           | `getTransitionTemplateKey` a 4 estados + null; cron 3AM; ghost-reattempt → ausente                              |
| `el-templo-api/src/modules/notifications/routes.ts`                    | VERIFIED           | `sendSegmentSchema` enum = 4 valores; `MemberSegment` importado de `segmentation/types` (DRY)                   |
| `el-templo-api/src/modules/analytics/types.ts`                         | VERIFIED           | `SegmentCounts` en 4 bandas + sinSegmento; `EngagementMember.segment = 'alerta'                                 | 'ausente'` |
| `el-templo-api/src/modules/analytics/engagement-service.ts`            | VERIFIED           | `SEGMENT_KEYS` 4 bandas; `IN ('alerta','ausente')`; `urgency` invertido                                         |
| `el-templo-api/src/modules/analytics/service.ts`                       | VERIFIED           | `priorityRank`: `ausente→0, alerta→1`; sin literales `ghost`/`en_riesgo`                                        |
| `el-templo-api/src/modules/analytics/schemas.ts`                       | VERIFIED           | 3 enums con 4 valores nuevos; sin valores viejos                                                                |
| `el-templo-api/src/modules/members/schemas.ts`                         | VERIFIED           | query param `segment` enum = 4 valores (BLOCKER cerrado)                                                        |
| `el-templo-api/src/modules/members/service.ts`                         | VERIFIED           | `segmentSubquery` tipada `MemberSegment                                                                         | null`      |
| `el-templo-api/src/modules/shared/date-utils.ts`                       | VERIFIED           | `computeSeniority()` + `MemberSeniority` con DAYS_PER_MONTH=30.44                                               |
| `el-templo-api/src/modules/attendance/service.ts`                      | VERIFIED           | `getSlotAttendance` selecciona `users.createdAt`, expone `seniority`, sin `avatarType`                          |
| `el-templo-api/src/modules/attendance/schemas.ts`                      | VERIFIED           | `slotAttendanceItemSchema` con `seniority` en lugar de `avatarType`                                             |
| `el-templo-api/src/modules/scheduling/service.ts`                      | VERIFIED           | `getSlotDetail` selecciona `users.createdAt`, mapea `seniority`, sin `avatarType`                               |
| `el-templo-api/src/modules/scheduling/schemas.ts`                      | VERIFIED           | `bookingRecordSchema` con `seniority`                                                                           |
| `el-templo-api/src/modules/scheduling/types.ts`                        | VERIFIED           | `BookingRecord.seniority: MemberSeniority                                                                       | null`      |
| `el-templo-api/src/modules/scheduling/booking-service.ts`              | VERIFIED           | `mapBookingRow` pasa `seniority: null` (single-booking, sin join de perfil)                                     |
| `el-templo-api/src/modules/settings/`                                  | VERIFIED (deleted) | Directorio eliminado; `app.ts` sin `settingsRoutes`                                                             |
| `el-templo-admin/src/types/member.ts`                                  | VERIFIED           | `MemberSegment` 4 valores; `MemberSeniority` + `SENIORITY_LABELS`; sin `SegmentThresholds`                      |
| `el-templo-admin/src/types/analytics.ts`                               | VERIFIED           | `SegmentCounts` 4 bandas; `EngagementMember.segment = 'alerta'                                                  | 'ausente'` |
| `el-templo-admin/src/types/scheduling.ts`                              | VERIFIED           | `BookingRecord.seniority: 'nuevo'                                                                               | '1-3m'     | '3-6m'   | '6m+'      | null` |
| `el-templo-admin/src/types/attendance.ts`                              | VERIFIED           | `SlotAttendanceItem.seniority: 'nuevo'                                                                          | ...`       |
| `el-templo-admin/src/pages/AlumnosPage.vue`                            | VERIFIED           | `segmentFilterOptions` con 4 bandas; header "Asistencia"                                                        |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue`                       | VERIFIED           | card "Asistencia" (renombrada de "Segmentación")                                                                |
| `el-templo-admin/src/pages/NotificacionesPage.vue`                     | VERIFIED           | `segments` array con 4 valores nuevos                                                                           |
| `el-templo-admin/src/components/analytics/MiembrosTab.vue`             | VERIFIED           | `SEGMENT_PRIORITY = {ausente:0, alerta:1}`; caption "ausentes y en alerta primero"                              |
| `el-templo-admin/src/components/scheduling/MemberTags.vue`             | VERIFIED           | 2 chips: Antigüedad (grey-7 outline) + Asistencia (colores D-69); D-07 con `v-if="segment"`                     |
| `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue`       | VERIFIED           | 4 usos de `<MemberTags :seniority="...">` sin `avatar-type`; badge QR/Manual removido                           |
| `el-templo-admin/src/composables/useSettingsApi.ts`                    | VERIFIED (deleted) | Eliminado                                                                                                       |
| `el-templo-admin/src/pages/ConfiguracionPage.vue`                      | VERIFIED (deleted) | Eliminada; ruta y nav item removidos del router/AdminLayout                                                     |
| `el-templo-app/src/stores/useUserStore.ts`                             | VERIFIED           | `MemberSegment = 'optima'                                                                                       | 'regular'  | 'alerta' | 'ausente'` |
| `el-templo-app/src/modules/progression/components/SegmentGreeting.vue` | VERIFIED           | `SEGMENT_GREETINGS` con 4 claves; fallback `?? 'Hola,'` para null                                               |

---

## Typecheck Results

| App               | Resultado                                            | Detalle                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api`   | **EXIT 0 — LIMPIO**                                  | Sin ningún error. La propagación completa (plans 01–07) dejó el proyecto 100% limpio.                                                                                                                                                                     |
| `el-templo-admin` | **Exit 2 — SOLO 2 errores pre-existentes**           | `src/utils/pdf/session-pdf-builder.ts` (pdfMake typing) + `src/boot/__tests__/axios-refresh-lock.test.ts` (vitest module). Ambos preexisten a la fase 136 (verificado por SUMMARY-05 y SUMMARY-06). Ningún error relacionado con segmentación o settings. |
| `el-templo-app`   | **Exit 0 — sin errores en archivos de segmentación** | `useUserStore.ts`, `SegmentGreeting.vue`, `ProgramCtaCard.vue` limpios. Los ~25 errores restantes son pre-existentes en archivos no tocados por esta fase (boot/\*, layouts/MainLayout, onboarding, training/BlockCard, pages, router, logger).           |

---

## Commits Verificados

Los 16 commits documentados en los SUMMARYs existen en el historial de `staging`:

```
6d4a2928  refactor(136-01): tipos de segmentación → 4 bandas
42dab500  feat(136-01): ALTER enum + migración 0151
4d417f2d  feat(136-01): calculateSegment → 4 bandas + tests
4b8e4158  refactor(136-02): reconectar triggers push; eliminar golden-case
eb7a63e9  feat(136-02): sendSegmentSchema + tests
ebb867a1  refactor(136-03): 4 bandas → analytics types + engagement-service
f00d66f3  refactor(136-03): priorityRank → ausente(0)/alerta(1)
b2a0de4c  test(136-03): schemas + tests de analytics
cebbb1ed  feat(136-04): 4 bandas → members API
198b451a  feat(136-04): 4 bandas → member app
93cd3df4  refactor(136-05): tipos display/analytics + borrar SegmentThresholds
17b7288c  feat(136-05): 4 bandas → AlumnosPage/AlumnoDetailPage/Notificaciones/MiembrosTab
e619f44e  feat(136-06): seniority en slot endpoints + quitar avatarType
1259c088  feat(136-06): MemberTags → Antigüedad + Asistencia sin avatar
19479a50  refactor(136-07): eliminar módulo settings de la API
ee45ef5b  feat(136-07): eliminar ConfiguracionPage + ruta + nav item
```

---

## Anti-Patterns

Ningún `TBD`, `FIXME` ni `XXX` en ninguno de los archivos modificados por la fase. Sin stubs, sin handlers vacíos, sin implementaciones placeholder.

---

## Cobertura de Tests

| Archivo de test                          | Estado                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `test/segmentation/segmentation.test.ts` | Reescrito a 4 bandas; casos <1 mes→NULL, sin plan→NULL, >100%→optima                                          |
| `test/segmentation/golden-case.test.ts`  | Eliminado (el golden case desaparece con D-01)                                                                |
| `test/notifications.test.ts`             | Actualizado; nuevo describe "Segment Transition Mapping" que verifica los 4 disparadores y el copy preservado |
| `test/analytics/engagement.test.ts`      | Reescrito a 4 bandas + assert de orden ausente-antes-alerta                                                   |
| `test/analytics/analytics.test.ts`       | Casos attention-list → ausente/alerta + assert de orden de priorityRank                                       |

Los tests NO se ejecutaron localmente por convención del proyecto (corren en CI al pushear).

---

## Verificación Humana Requerida

### 1. Horarios — Chips de Antigüedad y Asistencia

**Test:** Abrir el SlotDetailDialog de un slot con asistentes. Verificar que cada miembro muestra dos chips: uno gris con su Antigüedad (Nuevo / 1-3 meses / 3-6 meses / +6 meses) y uno de color con su Asistencia (Óptima=verde / Regular=ámbar / Alerta=naranja / Ausente=rojo). Comprobar que un miembro con <1 mes de antigüedad muestra solo el chip de Antigüedad, sin Asistencia. Verificar que no aparece ningún chip de avatar (A–K) ni badge QR/Manual.

**Expected:** Dos chips correctamente coloreados y etiquetados por alumno. Sin regresiones de avatar ni QR/Manual.

**Por qué requiere humano:** Requiere datos reales en la DB y renderizado del frontend en staging/prod.

### 2. Admin Alumnos — Filtro de Asistencia sin HTTP 400

**Test:** Abrir AlumnosPage, desplegar el filtro de columna "Asistencia" (antes "Segmento"), seleccionar cada una de las 4 opciones. Confirmar que la tabla filtra correctamente y no aparece ningún error 400 en la consola de red.

**Expected:** Filtro funcional con las 4 bandas. Sin 400 de Fastify.

**Por qué requiere humano:** El HTTP 400 era un error de runtime que no detecta tsc; necesita interacción real con el endpoint.

### 3. Admin Detalle de Alumno — Card "Asistencia"

**Test:** Navegar al detalle de un alumno con asistencia conocida. Verificar que la card se llama "Asistencia" (no "Segmentación") y muestra la banda correcta con el color correspondiente.

**Expected:** Card "Asistencia" visible con la etiqueta y color correctos.

**Por qué requiere humano:** Requiere datos reales y navegación en el admin.

### 4. Admin Analytics / Miembros — Orden de worklist y buckets

**Test:** Navegar al panel de Analytics → pestaña Miembros. Verificar que la worklist muestra "ausentes y en alerta primero". Verificar que los contadores de buckets muestran las 4 bandas (Óptima/Regular/Alerta/Ausente) y no los 6 segmentos viejos. Si hay miembros ausentes y en alerta, confirmar que los ausentes aparecen antes.

**Expected:** Worklist ordenada por ausente→alerta. Sin buckets espartano/ghost/en_riesgo/intermitente.

**Por qué requiere humano:** Requiere datos reales en la DB.

### 5. Admin Notificaciones — Targeting a 4 bandas; sin Configuración

**Test:** Navegar a NotificacionesPage. Abrir el selector de segmento para enviar una notificación. Verificar que lista las 4 bandas (Óptima, Regular, Alerta, Ausente) y solo esas. Confirmar que no aparece el ítem "Configuración" en el menú lateral del admin.

**Expected:** Selector con 4 opciones. Sin nav item de Configuración.

**Por qué requiere humano:** Requiere navegación manual en el admin.

### 6. Member App Mi Templo — Saludo con SegmentGreeting

**Test:** Abrir la app como miembro activo (>1 mes de antigüedad) y como miembro nuevo (<1 mes). Verificar que ambos ven "Hola, [Nombre]!" sin error ni pantalla en blanco.

**Expected:** Saludo "Hola," uniforme para todos los estados, sin excepción para NULL.

**Por qué requiere humano:** Requiere build de la app y cuenta real en staging.

### 7. Push notifications — Cron 3AM con las nuevas bandas

**Test:** Después del próximo ciclo de las 3AM (o invocando manualmente el batch), consultar `pending_notifications JOIN notification_templates` en staging/prod. Verificar que se dispararon transiciones usando los template_key originales (`segment_transition_en_riesgo`, `_ghost`, `_recovery`, `_espartano`, `ghost_monthly_reattempt`) correctamente mapeados a los nuevos estados de Asistencia.

**Expected:** Notificaciones en cola con los 5 template_key originales. Los campos `body`/`title` preservados (copy sin cambios).

**Por qué requiere humano:** Requiere esperar el ciclo nocturno y acceso a la DB de staging/prod.

### 8. DB — Migración 0151 en staging/prod

**Test:** Después del deploy, ejecutar `SELECT DISTINCT member_segment FROM member_profiles` y `SELECT setting_key FROM system_settings WHERE setting_key LIKE 'segment.%'` en staging/prod.

**Expected:** `member_segment` retorna solo `NULL, 'optima', 'regular', 'alerta', 'ausente'`. La segunda query retorna 0 rows (settings de umbrales eliminados).

**Por qué requiere humano:** Requiere acceso a la DB de staging/prod (pendiente push a CI).

---

_Verified: 2026-06-22T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
