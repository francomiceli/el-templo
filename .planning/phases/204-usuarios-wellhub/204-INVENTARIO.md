# 204 — Inventario: cómo trata hoy el sistema a los usuarios Wellhub

Relevado 2026-10-27 (base `origin/master` `3bf682d95`), después del primer uso real del piloto en Moreno.
Rutas: `API` = `el-templo-api/src/modules`, `ADM` = `el-templo-admin/src`.

## Cómo entra alguien por Wellhub

El webhook (`API/wellhub/service.ts`), en la primera reserva o check-in:

- **(a) Email desconocido:** crea un usuario con `status='wellhub'` + `gympass_id`, con contraseña aleatoria (no puede loguearse en la app).
- **(b) Email ya existente:** solo setea `gympass_id`. El estado no cambia (queda `inactivo` para un ex-alumno o `activo` para un socio).

Reservas: `bookings.source='wellhub'`. Visitas: `attendance.source='wellhub'`. No consumen `classesRemaining`, AURA ni `completed_sessions`.

**Caso real 2026-10-27:** Maximo Palladino (user 4053), ex-alumno `inactivo` desde 2023, vinculado por email. Reservó y canceló una clase en Moreno. Hoy no hay ninguna señal de Wellhub en su ficha.

## 1. Admin: estado del usuario

- `ADM/composables/useStatusBadge.ts:22-34`: el mapa tiene solo freemium, prueba, activo e inactivo. Con 'wellhub', label y color quedan `undefined`, así que el badge sale **vacío**, tanto en la lista (`ADM/pages/AlumnosPage.vue:281`) como en la ficha (`ADM/pages/AlumnoDetailPage.vue:64`).
- Tipos sin 'wellhub': `ADM/types/member.ts:102` y `ADM/composables/useMembersApi.ts:55,82`.
- Filtro de estado: `AlumnosPage.vue:513-519` no tiene Wellhub. El API rechaza `status=wellhub` con 400 (`API/members/schemas.ts:212,754`, `members/routes.ts:461`).
- "Todos" (`API/members/service.ts:136-141`) los incluye, y el CASE de estado efectivo (`:288-301`) deja pasar 'wellhub'.
- Export xlsx (`members/service.ts:2349-2364`): la columna Estado queda vacía.
- Ficha: todas las pestañas (gate `status !== 'prueba'`, `AlumnoDetailPage.vue:331`) y "Sin plan".
- Typeahead `searchMembers` (`members/service.ts:~520-590`): sin filtro de estado, así que aparecen en Cobros, Horarios y ReferrerSelect.
- Enums de respuesta sin 'wellhub' (`members/schemas.ts:28,84,716`). Igual serializa, porque fast-json-stringify no valida enums.
- `gympass_id` no se expone fuera de `modules/wellhub/`.

## 2. Listados y audiencias

| Superficie | Ref | ¿Incluye Wellhub? |
|---|---|---|
| Socios + export | `members/service.ts:136`, `:2251` | sí, en "Todos", sin distinguir |
| Leads / pruebas | `scheduling/trials-service.ts:1392` | no |
| Campaña `bajas` (inactivo con plan pago) | `campaigns/audience-service.ts:138` | **sí, el caso (b)**: el ex-alumno vinculado sigue en la audiencia |
| `freemium_elegibles`, `prueba_no_convertida`, `referidos_pendientes`, `alerta_ausente` | `audience-service.ts:109,~148,~172,~190` | no |
| Aniversarios / hitos de permanencia | `anniversaries/service.ts:58`, `jobs/tenure-milestones.ts:101-117` | no (filtran `activo`) |
| Push / notificaciones | requieren token de dispositivo | no (el visitante nuevo no se loguea) |

## 3. Métricas y reportes

**No afectados (dependen de suscripciones):** KPI de activos, altas, retención, churn, LTV, ticket, renovación, inactivos y vencidos (`API/analytics/service.ts:239-472`, `API/reports/service.ts:733,1496`), y caja.

**Afectados (asistencia o reservas sin filtro de `source`):**
- `attendance-metrics-service.ts:71` `uniqueMembers`, e `:149` `checkInAdoptionByBranch`: inflan.
- `analytics/service.ts:1023` (check-ins diarios), `:1078` (heatmap) y `:1729` (promedio diario): inflan.
- `analytics/service.ts:1178` ocupación: correcto como ocupación real, pero no distingue.
- `analytics/service.ts:1291` no-show rate: incluye no-shows Wellhub.
- `analytics/frequency-service.ts:405-457`: solo el caso (b) activo, porque las visitas Wellhub suman a su frecuencia.
- `analytics/especial-report-service.ts:~140`: una visita Wellhub a una especial cuenta como "externo". Hoy no aplica, porque solo se publica General.
- `analytics/funnel-service.ts:119-149`: la cohorte es todo `users`, así que los Wellhub inflan la cohorte y bajan el % de conversión.
- `reports/service.ts:371` log de accesos: el admin pinta todo lo que no es 'qr' como "Manual" (`ADM/pages/ReportesPage.vue:1051-1057`). El filtro solo tiene QR y Manual (`:957`, `API/reports/schemas.ts:48`).

## 4. Efectos sobre el plan de un socio (caso b activo): BUGS

- `el-templo-api/src/jobs/mark-no-shows.ts:150-200`: pasa a `no_show` toda reserva 'reservado' vencida **sin mirar `source`** y descuenta `classesRemaining` de la suscripción del socio. Una reserva Wellhub no cumplida de un socio activo le descuenta una clase de su plan. Verificado leyendo el código.
- `API/attendance/service.ts:~229,1393`: la asistencia Wellhub cuenta como regular para el límite diario y semanal. Puede bloquear su check-in propio ("Ya registraste asistencia hoy") o consumir su límite semanal.

## 5. Horarios (profes) y TV

- Roster `GET slot attendance` (`API/attendance/service.ts:570-815`, schema `attendance/schemas.ts:114`): devuelve `bookingStatus`, `source` **de la asistencia** (recién después del check-in), `segment`, `seniority` y `endDate`. **No** devuelve el `source` de la reserva, ni el estado, ni `gympass_id`.
- `ADM/components/scheduling/SlotDetailDialog.vue:303-325,909` no muestra el source. `ADM/components/SlotAttendancePanel.vue:56` lo pinta, pero ese componente no se usa en ninguna parte.
- Detalle de reservas del slot (`API/scheduling/service.ts:479-640`): `BookingRecord` sin `source` ni estado.
- Hoy un profe no distingue a un Wellhub de un alumno nuevo sin plan.
- `ADM/components/MemberAttendanceTab.vue:51-55`: `sourceLabels['wellhub']` no existe (`ADM/types/attendance.ts:29`), así que el badge sale sin texto.
- TV: el roster de la TV es de bloques, no de alumnos, así que no aplica. `check-ins/roster-service.ts` incluye a los Wellhub en `attendeeCount`.

## 6. App de alumnos

- El visitante nuevo no puede loguearse (contraseña aleatoria, `API/wellhub/service.ts:1061`). El login (`API/auth/routes.ts:681`) no valida el estado. Con un reset de contraseña del admin entra sin plan.
- Si intenta registrarse con el mismo email recibe 409 "Ya existe una cuenta".
- El caso (b) entra normal con su cuenta.

## 7. Ciclo de vida

- `subscriptions/service.ts:7294-7304`: si un Wellhub compra un plan pasa a `activo`. Cuando vence queda `inactivo` y **pierde la marca 'wellhub'** (solo queda `gympass_id`, que no se muestra).

## Brechas principales

1. Badge vacío en lista y ficha. Sin filtro, sin etiqueta y sin `gympass_id` visible.
2. Métricas de asistencia infladas: socios únicos, check-ins, heatmap, promedio, adopción de check-in y no-show rate.
3. El embudo de conversión cuenta a los Wellhub en la cohorte.
4. Mezclados en "Todos", en el export y en los typeahead de Cobros y Horarios.
5. El log de accesos los muestra como "Manual" y no se puede filtrar por Wellhub.
6. El roster de los profes no los distingue.
7. **Caso (b):** un no-show Wellhub descuenta clases del plan del socio, la visita Wellhub consume su límite y el ex-alumno sigue en la campaña `bajas`.
8. Si el Wellhub compra un plan y después vence, pierde la marca.

## Modelo propuesto (a validar en discuss-phase)

Separar **quién es la persona** (estado, sin cambios) de **si usa Wellhub** (`gympass_id`, etiqueta visible y permanente) y del **origen de cada visita** (`source`):

- Visitante nuevo: badge "Wellhub", con filtro propio y fuera de Cobros.
- Ex-alumno: "Inactivo · Wellhub", fuera de `bajas`, como oportunidad de recuperación.
- Socio activo: "Activo · usa Wellhub". Sus reservas y visitas Wellhub no tocan su plan.
- Visitante que compra un plan: conserva la etiqueta, y eso permite medir la conversión Wellhub → socio.
- Métricas separadas por origen de la visita, con un reporte Wellhub por sede para controlar contra lo que paga Wellhub.
- Horarios: chip "Wellhub" en la reserva, visible antes del check-in.
