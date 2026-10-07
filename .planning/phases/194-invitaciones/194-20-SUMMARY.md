---
phase: 194-invitaciones
plan: 20
subsystem: api
tags: [invitations, report, leads, d-19, d-18, sc-5, tenancy, pagination]
requires:
  - phase: 194-19
    provides: deriveLeadStage, loadTrainedBranches, estados derivados
  - phase: 194-13
    provides: converted_at en invitations
provides:
  - GET /api/admin/referrals/invitations/report (KPIs D-19)
  - GET /api/admin/referrals/invitations (bandeja de leads de invitacion, D-18)
  - filtro origin=invitacion en GET /api/admin/members
  - fabricas de test createInvitedUser / createAccessSub
affects: [194-26]
tech-stack:
  patterns: [etapa derivada en SQL con COUNT OVER para paginacion exacta, hoy por zona horaria de sede con CASE de constantes]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-report.ts
    - el-templo-api/src/modules/referrals/invitation-lead-list.ts
    - el-templo-api/test/invitations/report.test.ts
    - el-templo-api/test/invitations/leads-list.test.ts
    - el-templo-api/test/invitations/members-origin-filter.test.ts
  modified:
    - el-templo-api/src/modules/referrals/admin-routes.ts
    - el-templo-api/src/modules/referrals/invitation-schemas.ts
    - el-templo-api/src/modules/members/{service,schemas,routes,types}.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-analytics-resto.test.ts
    - el-templo-api/test/tenancy/iso-03-referrals.test.ts
    - el-templo-api/test/invitations/_helpers.ts
key-decisions:
  - "El mes de cohorte del reporte es `invitations.quota_month` (mes en la tz de la sede del invitador, indexado), no DATE_FORMAT(activated_at) que dependeria de la zona del servidor MySQL"
  - "La etapa del lead se calcula en SQL con un CASE que espeja deriveLeadStage; el total sale de COUNT(*) OVER () en el mismo statement que la pagina, asi filtro, total, LIMIT y OFFSET no pueden divergir"
  - "El `hoy` de la etapa es el de la zona horaria de la sede de cada invitacion (CASE branches.timezone de constantes), no uno global: Argentina y Espana cambian de dia en horas distintas"
  - "admin y gestion reciben las rutas acotadas al pais de su scope (como el resto de los reportes); el owner ve ambos paises, con los montos ya separados por moneda"
requirements-completed: [D-19, D-18, SC-5]
completed: 2026-10-07
---

# Phase 194 Plan 20: reporte D-19 + leads de invitacion + filtro de origen Summary

**Gestion tiene el reporte del programa (activadas, conversion por cohorte, invitados activos y descuentos por mes y moneda, nunca ARS+EUR mezclados), una bandeja de leads de invitacion con telefono para WhatsApp y etapa derivada en SQL con paginado exacto, y el listado de alumnos filtra por origen "Invitacion".**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `8464f0525` | `invitation-report.ts`, `invitation-lead-list.ts`, 2 rutas en `admin-routes.ts`, schemas, manifiesto + `ENTRADAS_BASELINE` (453 -> 455) + `CASOS_BASELINE` (59 -> 61) + 2 describes ISO-03, fabricas `createInvitedUser`/`createAccessSub`, tests |
| 2 | `8b14979af` | `origin=invitacion` en schema/ruta/servicio de `GET /api/admin/members` + test |

## Contrato HTTP (para 194-26)

Ambas rutas: plugin `/api/admin/referrals`, gate **gestion / admin / owner** (coach, recepcion, admin_sede y socios: 403). Alcance: owner = todo el gimnasio; admin y gestion = solo sedes de su pais (`request.scope.country`); un admin/gestion sin pais -> 403 (fail-closed).

### `GET /api/admin/referrals/invitations/report?from=YYYY-MM&to=YYYY-MM`

Defaults: `to` = mes actual (tz de Buenos Aires), `from` = `to` - 11. 400 si `from > to`, si el patron es invalido o si el rango supera 36 meses.

```ts
{
  from: string; to: string;                    // 'YYYY-MM'
  months: Array<{ month: string; activated: number; converted: number; conversionRate: number }>; // un elemento por mes del rango, con ceros; rate = converted/activated (0 si no hubo), 4 decimales
  totals: { activated: number; converted: number; conversionRate: number };
  activeInvitees: number;                      // invitados DISTINTOS con invitacion activa y cobertura de membresia hoy (no acotado al rango)
  discounts: Array<{ month: string; currency: string; amount: number; credits: number }>;       // una fila por (mes, moneda), ordenadas; incluye vinculos heredados
}
```

### `GET /api/admin/referrals/invitations?stage&branchId&from&to&page&pageSize`

`stage` in `invitado|entrenando|vencido|convertido`; `branchId` = sede donde se activo la invitacion; `from`/`to` = `YYYY-MM-DD` inclusive sobre la fecha de activacion; `page` >= 1 (default 1); `pageSize` 1..100 (default 25). Querystring con `additionalProperties:false`.

```ts
{
  rows: Array<{
    invitationId: number;
    invitee: { userId: number; firstName: string; lastName: string; phone: string | null };
    inviter: { userId: number; name: string };            // userId para el link a la ficha
    activatedAt: string;                                    // ISO 8601
    accessesUsed: number | null; accessesBudget: number | null;
    accessExpiresOn: string;                                // 'YYYY-MM-DD'
    branchId: number; branchName: string;                   // sede de activacion
    branchesTrained: string[];                              // sedes donde entreno
    stage: "invitado" | "entrenando" | "vencido" | "convertido";
    leadStatus: "en_seguimiento" | "ganado" | "perdido" | null;   // editable con PATCH /api/admin/leads/:userId
    channel: "self_service" | "assisted";
  }>;
  total: number;    // exacto, ya con los filtros
  page: number; pageSize: number;
}
```

Orden: activacion descendente. Una pagina mas alla del final devuelve `rows: []` y el `total` correcto.

### `GET /api/admin/members?origin=invitacion`

Enum de un valor (otro valor -> 400), combinable con `status` (`status=prueba&origin=invitacion` = leads de invitacion en prueba). Sin `origin` el listado es el de siempre. No se agrego a `/export`.

## Tests

- `report.test.ts` 11 verdes: cohortes (M 3/1/0.33, M-1 2/2/1, totales), anuladas, relleno de ceros, default 12 meses, activos (is_trial / vencida / repetido), descuentos por mes y moneda (ARS y EUR separados, vinculo heredado), mes y rango del credito, `country`, HTTP por pais, roles (403/200), 401 y 400.
- `leads-list.test.ts` 12 verdes: fila completa, anuladas, filtro por cada etapa, **paginacion exacta (30 invitaciones, 12 entrenando -> total 12, paginas 5/5/2, pagina 4 vacia con total 12)**, consistencia SQL vs `deriveLeadStage` fila por fila sobre las 4 etapas, `hoy` por zona horaria (con `Date` falso a las 23:30 UTC: el mismo ultimo dia de accesos esta vigente en AR y vencido en ES), filtros de sede y rango, pais y roles por HTTP, validacion del querystring, shape paginado, lista vacia.
- `members-origin-filter.test.ts` 4 verdes (archivo propio, ver desviaciones).
- Batería de tenancy: `iso-03-referrals` 18 (+4: aislamiento y control de las 2 rutas, con montos distintos por gimnasio 1111/2222), `iso-03-cobertura-analytics-resto` y `iso-01-manifiesto` verdes con los baselines nuevos. Regresion: `members.test` + `members-status-filter` 93 verdes.
- **Mutation testing** (9 mutantes, todos atrapados): sacar la rama `convertido` del CASE; `hoy` global en vez de por zona horaria; listar anuladas; `OFFSET` equivocado; conversion = `COUNT(*)`; alcance por pais anulado (HTTP); (ronda 2) origen contando invitaciones anuladas. Los 6 primeros en una sola corrida (cada uno rompe tests distintos, 12 fallos), el ultimo aparte. Revertidos; corridas finales verdes.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan.

## Deviations from Plan

**1. [Ubicacion, regla de 194-32] Dos archivos propios en vez de `invitation-report-service.ts`:** `invitation-report.ts` (KPIs, `InvitationReportService`) e `invitation-lead-list.ts` (bandeja + `invitationLeadStageSql`). Nada se agrego a `invitation-service.ts` ni a `service.ts`. Reutiliza `loadTrainedBranches` de 194-19.

**2. [Interpretacion] Mes de cohorte = `quota_month`** (no `DATE_FORMAT(activated_at)`): es la misma columna que consume el cupo, esta en la tz de la sede del invitador y no depende de la zona de sesion de MySQL. Los descuentos si usan el mes de `referral_credits.created_at` (en la zona de sesion de la base, con limites del rango como constantes `YYYY-MM-DD` interpretadas en la misma zona).

**3. [Rule 2 - seguridad] Alcance por pais.** El plan dice "agregado de todo el gimnasio, sin dimension de sede", pero admin y gestion tienen pais asignado y todos los demas reportes los acotan (`request.scope.country`); la bandeja expone telefonos. Las dos rutas pasan `country` al servicio para esos roles (owner sin acotar; sin pais cargado -> 403). Con esto el criterio del plan "montos por moneda" sigue valido para el owner.

**4. [Hoy por sede] La etapa usa el `hoy` de cada sede** (CASE de constantes por zona horaria) en vez de un unico `hoy` como parametro: una invitacion de Espana cambia de etapa en su medianoche. Con un `CAST(... AS DATE)` obligatorio: comparar un DATE con un string no constante lo hace como numero.

**5. [Un statement] Total con `COUNT(*) OVER ()`** en la misma query que la pagina (en vez de dos statements con los mismos JOIN/WHERE): `lint:tenant` juzga por statement, asi que repetir el WHERE en una funcion aparte no pasaba, y asi el filtro y el total no pueden divergir. La pagina mas alla del final pide el total a la pagina 1.

**6. [Menor] `describe` del filtro de origen en archivo propio** (`members-origin-filter.test.ts`, el plan lo pedia dentro de `leads-list.test.ts`): el commit de la Tarea 1 no deja un test rojo de codigo que se entrega en la Tarea 2.

**7. [Refactor de tests] `createInvitedUser` / `createAccessSub`** movidos a `test/invitations/_helpers.ts` (los usan overview, reporte y bandeja); `member-overview.test.ts` ahora los importa, sin cambiar sus casos.

**8. Criterio `grep` literal:** `grep "FROM invitations i" members/service.ts` = 1 (cumple); `grep "currency" invitation-report.ts` >= 2 (cumple).

## Lecciones para planes siguientes

- `lint:tenant` juzga por statement y no ve a traves de funciones auxiliares ni de alias (`const x = schema.tabla`): el `tenantWhere(<tabla literal>, ctx)` tiene que estar dentro del mismo statement; los fragmentos `sql` con columnas de otras tablas van con un `/* tenant-safe: ... */` pegado.
- Un test que necesite que dos zonas horarias esten en dias distintos: `vi.useFakeTimers({ toFake: ["Date"] })` + `setSystemTime(<dia UTC>T23:30:00Z)` (AR todavia es D, ES ya es D+1 en verano e invierno), solo alrededor de la llamada al servicio (no con HTTP: los JWT vencen).
- `COUNT(*) OVER ()` en MySQL 8 da el total del conjunto filtrado antes del LIMIT; no devuelve filas (ni total) si el OFFSET pasa del final.
- Staff por pais en tests: `createStaffUser(app, { role: "gestion", country, branchId })` (pais derivado de la sede si no se pasa).
- El agregado por mes y moneda necesita el mismo texto SQL en SELECT y GROUP BY (formato como literal, no como parametro).
- **194-24/26 (admin):** el reporte y la bandeja viven en el mismo plugin `/api/admin/referrals`; el owner ve ambos paises con `discounts` ya separados por `currency`: no sumarlos en el cliente.

## Allowlist de copy

Vacia (los archivos nuevos no tienen copy visible con "referid").

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-67 (gate y pais), T-194-68 (`tenantWhere` en cada tabla de cada statement + ISO-03 con montos distintos por gimnasio), T-194-69 (patrones, enteros y `pageSize` <= 100) y T-194-70 (una fila por moneda, test explicito) cubiertos.

## Self-Check: PASSED
