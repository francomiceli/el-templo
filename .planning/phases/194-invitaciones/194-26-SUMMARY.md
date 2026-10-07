---
phase: 194-invitaciones
plan: 26
subsystem: admin
tags: [invitations, report, leads, admin, rebrand, d-19, d-18, sc-5]
requires:
  - phase: 194-20
    provides: GET /admin/referrals/invitations/report, GET /admin/referrals/invitations, origin=invitacion
  - phase: 194-25
    provides: composable y tarjeta de settings (molde), página de Reportes abierta a gestion
provides:
  - "Reportes > Invitaciones: KPIs, tabla por mes con descuentos por moneda y bandeja paginada de leads"
  - "Filtro Origen: Invitación en Alumnos (combinable con Estado)"
  - "Rebrand del admin completo (Analíticas, destinos, audiencias, disparadores, segmentos)"
  - "useInvitationReportApi + tipos InvitationReport / InvitationLeadRow / MemberOrigin"
affects: [194-27, 194-28]
key-files:
  created:
    - el-templo-admin/src/components/reports/InvitationsReport.vue
    - el-templo-admin/src/composables/useInvitationReportApi.ts
  modified:
    - el-templo-admin/src/types/report.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/types/campaign.ts
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AnaliticasPage.vue
    - el-templo-admin/src/components/analytics/ReferidosAbTab.vue
    - el-templo-admin/src/config/destinations.ts
    - el-templo-admin/src/config/system-audiences.ts
    - el-templo-admin/src/config/rule-triggers.ts
key-decisions:
  - "Los KPIs no tienen dimension de sede (el API no la admite): la sede del filtro solo acota la bandeja y se rotula 'Sede de activacion'"
  - "El estado del lead se edita con el PATCH existente pero solo entre 'En seguimiento' y 'Perdido': 'Ganado' lo pone la compra y el PATCH lo rechaza sin plan cargado (409), asi que se muestra como chip de solo lectura"
  - "La pestana Invitaciones se muestra solo a gestion/admin/owner (admin_sede recibe 403 del API)"
  - "El rango del reporte arranca vacio y toma from/to de la respuesta: el default (ultimos 12 meses) lo decide el servidor en su zona horaria"
requirements-completed: [D-19, D-18, SC-5, D-27]
completed: 2026-10-07
---

# Phase 194 Plan 26: admin, Reportes > Invitaciones, filtro de origen y rebrand Summary

**Gestion ve el rendimiento del programa (activadas, compraron, conversion, invitados activos y descuentos por mes con una linea por moneda, sin mezclar ARS y EUR) y trabaja la bandeja de leads de invitacion desde Reportes con WhatsApp, link a la ficha del invitador, etapa, accesos x/N y estado del lead; Alumnos filtra por origen Invitacion y todo el copy visible del admin habla de invitaciones.**

## Commits

- `635fd3a13` feat(194-26) Reportes Invitaciones con KPIs por mes y bandeja de leads (Tarea 1)
- `6a2f50077` feat(194-26) filtro de origen Invitacion en Alumnos y rebrand restante del admin (Tarea 2)
- `8c94bcf4c` chore(194-26) comentarios de Analiticas sin Referidos A/B

## Que cambio

- **InvitationsReport** (nuevo): selectores de rango de meses (ultimos 36, los dos extremos), 4 KpiCard (Activadas, Compraron, Conversion, Invitados activos), tabla por mes con "Descuentos del mes" en una linea por moneda (monto + cantidad de creditos), y la bandeja paginada del servidor (`@request`, 25/50/100) con Invitado (link a la ficha + boton WhatsApp), Invitado por (link a `/alumnos/:id`), Activacion, Accesos x/N (`accessesLabel`, N viene del servidor), Vence, Sedes (donde entreno + donde activo), Etapa (chip con `LEAD_STAGE_META`), Estado del lead y Canal. Filtros por etapa y sede; al cambiar un filtro vuelve a la pagina 1.
- **useInvitationReportApi** (nuevo): `getReport`, `listLeads`, `cleanup()`, `createLogger`. Tipos del contrato de 194-20 en `types/report.ts`.
- **ReportesPage**: pestana "Invitaciones" (`card_giftcard`) y panel, solo `gestion`/`admin`/`owner`; `invitaciones` agregado a `VALID_TABS` con retroceso a "Accesos" si el rol no la ve.
- **AlumnosPage / types**: filtro "Origen" (Todos / Invitacion) que envia `origin=invitacion`, combinable con "Estado" (`status=prueba&origin=invitacion`); tipo `MemberOrigin` y `MemberListParams.origin`.
- **Rebrand**: tab "Invitaciones A/B" y `ReferidosAbTab` (titulo, descripcion, "Invitados convertidos", mensaje vacio), destino "Mis invitados", categoria de reglas "Invitaciones", audiencia "Cuando un invitado paga", disparador "un invitado del socio pago su primer plan", segmento "Invitados sin calificar". Claves y nombres internos intactos.

## Verificacion

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes y ajenos). `timeout 900 pnpm build`: OK.
- Criterios: `referrals/invitations` en el composable = 5 lineas, `InvitationsReport` en `ReportesPage`, `console.` = 0 en el componente, `invitacion` en `AlumnosPage`, `grep -c "Referidos A/B" AnaliticasPage` = 0, grep de `label: '...Referid'` en `config`/`types/campaign.ts` sin salidas.
- **Allowlist de copy.** Barrido de todo `src/` (`grep -rnE "[Rr]eferid|[Rr]eferir"` sin lineas de comentario): lo que queda es 100% interno, y ninguna linea es copy visible:
  - `AlumnoDetailPage.vue`: `name="referidos"` del tab y su panel (clave interna del tab; el label ya dice "Invitaciones")
  - `config/destinations.ts`: `| 'referidos'`, `key: 'referidos'`, `route: '/mis-referidos'` (clave de destino de push y ruta vieja, alias)
  - `types/campaign.ts`: `'referidos_pendientes'` (clave del segmento)
  - `AnaliticasPage.vue`: `name="referidos-ab"`, `case 'referidos-ab'`, `import ReferidosAbTab`, `<ReferidosAbTab` (clave de tab y nombre de componente)
  - `config/rule-triggers.ts`: `| 'referidos'`, `value: 'referidos'`, `referidos: 'brown'` (clave interna de categoria de plantillas)
- **Aviso sobre el chequeo canonico:** como excluye cualquier linea con `'referidos'` entre comillas, ESCONDE copy visible en la misma linea (`{ value: 'referidos', label: 'Referidos' }` en `rule-triggers.ts` y `label: 'Referidos'` en `destinations.ts` pasaban el grep). Se revisaron a mano con un barrido sin exclusiones.
- El admin no tiene tests de frontend ni `vue-tsc` (D-27): los contratos HTTP los cubren `report.test.ts`, `leads-list.test.ts` y `members-origin-filter.test.ts` (194-20).

## Deviations from Plan

**1. [Interpretacion] La sede solo filtra la bandeja.** El plan pide "filtros por etapa y sede". El reporte de 194-20 es agregado sin dimension de sede, asi que el selector de sede de la pagina (que si afecta otras pestanas) NO se usa en esta; la bandeja tiene su propio filtro "Sede de activacion" con las opciones que la pagina ya cargo (`branchOptions`). Los KPIs son del gimnasio entero (o del pais para gestion/admin, lo acota el servidor).

**2. [Interpretacion] Estado del lead sin "Ganado".** El plan pide un select editable con el PATCH existente. `PATCH /admin/leads/:userId` responde 409 al marcar 'ganado' sin plan comprado cargado (y al reves), y la compra ya lo pone sola (D-18). El select ofrece "En seguimiento" y "Perdido"; un lead 'ganado' se muestra como chip de solo lectura (con tooltip) para no ofrecer una accion que el servidor rechaza.

**3. [Rule 2 - criterio literal] Comentarios de `AnaliticasPage`.** Cuatro comentarios decian "Referidos A/B" y el criterio `grep -c "Referidos A/B"` = 0 es literal: se renombraron (commit aparte `8c94bcf4c`).

**4. [Extra] Copy no listado.** `config/destinations.ts` etiqueta el destino como "Mis invitados" (nombre de la pagina de la app) en vez de "Invitaciones", y se cambio el texto del disparador `referral_link_activated`, que no estaba en el inventario del plan pero era copy visible.

## Limitaciones conocidas

- El export de Alumnos (`/export`) NO aplica `origin` (194-20 no lo agrego; tampoco aplica `segment` ni `debtorOnly`): exportar con "Origen: Invitacion" activo baja la lista sin ese filtro.
- `config/destinations.ts` del admin es espejo del de la app (`el-templo-app/src/config/destinations.ts` sigue con `label: 'Referidos'`): lo toma el plan de la app (194-28).
- La bandeja no tiene filtro por fecha de activacion aunque el API lo admite (`from`/`to`): el plan no lo pidio.

## Known Stubs

None.

## Threat Flags

None. T-194-82 mitigada: la pestana y el panel solo existen para gestion/admin/owner y el API responde 403 al resto (194-20); la bandeja muestra el telefono solo como destino del boton WhatsApp. T-194-83 mitigada: la edicion usa el PATCH existente (roles y reglas del servidor) y el cliente no ofrece 'ganado'.

## Lecciones

- El chequeo canonico de "referid" no detecta copy visible que comparta linea con una clave interna entre comillas: ademas del grep, barrer sin exclusiones y revisar las lineas restantes a mano.
- `lead_status` 'ganado' es "plan comprado cargado": no editable a mano sin plan. Cualquier UI de lead que ofrezca estados debe limitarse a en_seguimiento/perdido salvo que cargue el plan.
- `GET /admin/referrals/invitations` devuelve `page`/`pageSize` ya corregidos: copiarlos al `pagination` de q-table y no recalcular.
- Para un `q-select` de meses sin `type="month"` (Firefox no lo soporta), generar las opciones con un shift de 'YYYY-MM' en aritmetica entera.
- Un hook del harness rechaza heredocs largos con `cat >> archivo`: usar Edit/Write.

## Self-Check: PASSED

- Commits `635fd3a13`, `6a2f50077`, `8c94bcf4c`: FOUND
- Archivos nuevos presentes (`InvitationsReport.vue`, `useInvitationReportApi.ts`)
- Worktree limpio salvo este SUMMARY
