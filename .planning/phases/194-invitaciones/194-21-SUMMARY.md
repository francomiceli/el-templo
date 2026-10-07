---
phase: 194-invitaciones
plan: 21
subsystem: db
tags: [migrations, prod-data, d-28, sc-6, rebrand, notifications, avisos]
requires:
  - phase: 194-05
    provides: planes Invitacion y migraciones 0255-0257
provides:
  - migracion 0260 que corrige el vinculo de referidos 3 invertido (D-28)
  - migracion 0261 que renombra el copy vivo de la notificacion referral_link_activated y del aviso card_referral
  - seeds en codigo (TEMPLATE_SEEDS, SYSTEM_AVISOS) iguales byte a byte al SQL
affects: [194-22, 194-29, 194-30]
tech-stack:
  patterns: [UPDATE de datos de prod con guard por id + tenant + estado esperado, derived table contra el error 1093, guard por texto por defecto exacto para no pisar copy editado]
key-files:
  created:
    - el-templo-api/src/db/migrations/0260_fix_referral_3_inverted.sql
    - el-templo-api/src/db/migrations/0261_rebrand_invitaciones_copy.sql
    - el-templo-api/test/migrations/0260-0261-invitaciones.test.ts
  modified:
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/communications/system-avisos.ts
key-decisions:
  - "Numeracion 0260/0261 (no 0258/0259): master y staging ya tenian 0258_role_coach_actividad y 0259_tv_avisos_tema. Renumerado por el orquestador, numeros 0260/0261 verificados libres en el arbol, origin/master y origin/staging antes de crear cada archivo"
  - "qualified_at del vinculo 3 = created_at de la sub 8074 (primer pago real de Guido, 2026-08-04) con fallback a NOW() si esa sub no existe, y COALESCE conserva un qualified_at ya cargado"
  - "El guard de 0261 exige el texto por defecto de TODOS los campos que reescribe (title, body, title_female, body_female en la notificacion, body y button_text en el aviso): si el staff edito cualquiera, la fila queda entera como esta"
  - "route de la notificacion queda en /mis-referidos (builds de tienda <= 1.8.1 no tienen /mis-invitados, la 1.8.2 redirige el alias). Cambiarla cuando se retiren las builds viejas"
requirements-completed: [SC-6, D-28]
completed: 2026-10-07
---

# Phase 194 Plan 21: migraciones de datos de prod 0260 y 0261 Summary

**El vinculo Guido/Valentina queda corregido (Valentina 6613 invita a Guido 7286, `qualified`, variante B, `users.referred_by` espejado) con guards que lo vuelven no-op si prod no esta en el estado esperado, y el copy vivo de la notificacion y la tarjeta pasa a "invitado/invitar" sin pisar texto editado por el staff.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `8938069af` | `0260_fix_referral_3_inverted.sql` + test (10 casos) |
| 2 | `52713abbb` | `0261_rebrand_invitaciones_copy.sql`, seeds `TEMPLATE_SEEDS` / `SYSTEM_AVISOS`, 7 casos mas en el test |

## 0260 — vinculo 3 invertido (D-28)

Tres statements en orden, todos con `tenant_id = 1` y ids de prod literales:

1. `UPDATE referrals` id 3: `referrer_id 7286 -> 6613`, `referred_id 6613 -> 7286`, `status = 'qualified'`, `copy_variant = 'B'`, `qualified_at = COALESCE(qualified_at, created_at de la sub 8074, NOW())`. Guard: la fila tiene que estar exactamente `7286 -> 6613` y no puede existir OTRO vinculo con `referred_id = 7286` (derived table por el error 1093).
2. `UPDATE users` 6613: `referred_by 7286 -> NULL`, solo si el vinculo 3 ya quedo `6613 -> 7286`.
3. `UPDATE users` 7286: `referred_by NULL -> 6613`, solo si el vinculo 3 ya quedo `6613 -> 7286`.

`referral_credits` y los movimientos AURA no se tocan (cero menciones fuera de comentarios, el test lo afirma). Los 9 vinculos se conservan (no hay INSERT ni DELETE).

## 0261 — copy vivo

| Fila | Antes | Despues |
| ---- | ----- | ------- |
| `notification_templates` `referral_link_activated`, title | ¡Tu referido pagó! | ¡Tu invitado se sumó! |
| idem, title_female | ¡Tu referida pagó! | ¡Tu invitada se sumó! |
| idem, body y body_female | ...Ya tenés tu descuento activo. | ...Ya tenés tu descuento por invitación activo. |
| idem, route | /mis-referidos | /mis-referidos (sin cambio, compat builds <= 1.8.1) |
| `avisos` `card_referral`, body | ...cada persona que traigas suma descuento a tu cuota. | ...cada persona que invites y se sume baja tu cuota. |
| idem, button_text | Compartir código | Invitar |

El titulo del aviso ("Vos decidís cuánto bajás tu cuota") no menciona "referido" y se conserva. `category: "referidos"` y `destinationSection: "referidos"` (claves internas) no cambian.

## Tests

`test/migrations/0260-0261-invitaciones.test.ts`: **17 casos verdes** (~130 s, 1 archivo).

- 0260 (10): guard anti `;` + tenant + sin referral_credits, origen -> destino (credits identicos), qualified_at desde sub 8074, fallback a NOW(), qualified_at previo conservado, idempotencia, no-op si ya estaba corregido a mano, no-op si existe otro vinculo con referred = Guido, no pisa `users.referred_by` ajeno, no toca otro tenant.
- 0261 (7): seeds en codigo contenidos byte a byte en el SQL, notificacion default -> nuevo, aviso default -> nuevo, titulo editado intacto, solo body editado intacto, aviso body/boton editados intactos, idempotencia.

Mutation testing (de a uno, restaurado y re-corrido en verde): quitar `referred_by IS NULL` de 0260 sin cambiar el test original no fallaba (el valor pisado era el mismo), se endurecio el caso con un referidor ajeno y el mutante quedo detectado; quitar el `EXISTS` de users de 0260 -> falla "otro vinculo con referred = Guido" y "otro gimnasio"; quitar el guard de titulo de la notificacion y de body del aviso en 0261 -> fallan los dos casos de copy editado.

Gates: `tsc --noEmit` 0, `lint:tenant` 0 (DISCREPANCIAS 0), `typecheck:tests` sin errores en el archivo nuevo ni en `types.ts` / `system-avisos.ts`.

## SQL de verificacion read-only (para 194-30, staging y prod)

```sql
-- 9 vinculos conservados y 16 creditos historicos
SELECT COUNT(*) AS vinculos FROM referrals WHERE tenant_id = 1;
SELECT COUNT(*) AS creditos FROM referral_credits WHERE tenant_id = 1;
-- estado del vinculo 3: esperado referrer 6613, referred 7286, qualified, variante B
SELECT id, referrer_id, referred_id, status, copy_variant, qualified_at FROM referrals WHERE id = 3 AND tenant_id = 1;
-- espejo en users: esperado 6613 NULL y 7286 apunta a 6613
SELECT id, referred_by FROM users WHERE id IN (6613, 7286) AND tenant_id = 1;
-- primer pago de Guido que dio qualified_at (created_at de la sub 8074)
SELECT id, user_id, created_at, price_paid FROM subscriptions WHERE id = 8074 AND tenant_id = 1;
-- migraciones registradas
SELECT name FROM _migrations WHERE name IN ('0260_fix_referral_3_inverted.sql', '0261_rebrand_invitaciones_copy.sql');
-- copy vivo: filas que siguen con el texto viejo (staff las edito o la migracion no corrio)
SELECT tenant_id, template_key, title, body, route FROM notification_templates WHERE template_key = 'referral_link_activated';
SELECT tenant_id, code, title, body, button_text, destination_section FROM avisos WHERE code = 'card_referral';
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Numeracion**
- **Found during:** arranque (antes de crear nada)
- **Issue:** 0258/0259 ya existian en origin/master y origin/staging (`0258_role_coach_actividad`, `0259_tv_avisos_tema`).
- **Fix:** se pararon los planes y se reporto, el orquestador renumero a 0260/0261 (`f435ab1ac`). Se re-verificaron 0260/0261 libres en el arbol, origin/master y origin/staging.

**2. [Extension de la excepcion de ids] subscriptions.id 8074 hardcodeado en el test**
- **Issue:** el SQL de 0260 toma `qualified_at` de la sub 8074, asi que para probar esa rama el test siembra `subscriptions.id = 8074` explicito (ademas de users 6613/7286 y referrals 3). Mismo motivo y mismo alcance (solo este archivo, se verifica que no exista y se borra en `afterAll`).

**3. [Prettier por lint-staged] reformateos menores ajenos al plan**
- `system-avisos.ts` (un import multilinea) y `types.ts` (un `bodyFemale` de otro template partido en 2 lineas) quedaron reformateados por Prettier, sin cambio de comportamiento.

## Lecciones

- `invitation-link.ts:196` arma el `bodyOverride` de la notificacion al invitador con "Ya tenés tu descuento activo." (sin "por invitacion"): el texto vivo difiere del seed. Lo ve 194-22 (barrido de copy).
- Para sembrar ids de prod en un test de migracion: un FK_CHECKS=0 en una conexion del pool NO vale para las demas, sembrar en orden de dependencias (users sin `referred_by`, luego UPDATE) en vez de apagar FKs.
- Un mutante de guard que escribe el mismo valor que ya habia no se detecta: el caso de "no pisa" tiene que usar un valor DISTINTO (referidor ajeno).
- El hook rechaza comandos con heredoc + `cd` + `&&` encadenados (aunque algunos pasos no toquen git): escribir bloques grandes con Write en el scratchpad y anexarlos con `cat >>`.

## Self-Check: PASSED

- 0260 y 0261, test, seeds: presentes. Commits `8938069af` y `52713abbb` en el log.
- tsc 0, lint:tenant 0, 17/17 tests verdes.
