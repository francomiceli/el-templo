# Fase 194 (Invitaciones) — Checklist de release

Generado por el plan 194-29 el 2026-10-07. Es insumo del orquestador (push) y de los checkpoints humanos de 194-30.
Rama: `feat/194-invitaciones` (worktree `et-194-invitaciones`), con `origin/master` mergeado (`782bae2c5`). **Nada pusheado.**

## 0. Resultado del pre-flight (2026-10-07)

### Numeración de migraciones (T-194-89)

`git fetch origin` hecho (solo fetch). Últimas migraciones por ref:

| Ref | Tope |
| --- | ---- |
| `origin/master` | 0254, 0258, 0259 (0255-0257 y 0260-0261 libres) |
| `origin/staging` | 0254, 0258, 0259 (0255-0257 y 0260-0261 libres) |
| rama local `feat/v6.1-gimnasio` (tren) | 0252 (el tren planea 0253 para 192.3) |
| `feat/194-invitaciones` | 0255, 0256, 0257, 0258, 0259, 0260, 0261 |

Resultado: **sin colisión** para 0255, 0256, 0257, 0260, 0261. 0258/0259 son de master (ya mergeadas en la rama).

Aviso para el tren v6.1: sus migraciones 0242-0252 ya colisionan en número con las de master (0242-0254) y 0253 está reservada para 192.3.
Quien integre el tren en segundo lugar tiene que renumerar por encima de 0261 (ver sección 1, punto de tenancy).

### Chequeos de migraciones

- `grep -c "^--.*;"` sobre 0255-0261: **0 en cada archivo** (ningún `;` en comentarios).
- Enums de 0255 vs `db/schema/invitations.ts`: `channel` = `('self_service','assisted')` y `status` = `('active','voided')`, mismo nombre de columna y mismo orden. Coinciden.

### Gates estáticos

| Gate | Resultado |
| ---- | --------- |
| API `pnpm exec tsc --noEmit` | 0 |
| API `pnpm lint:tenant` | 0 (DISCREPANCIAS 0, 278 accesos cubiertos por exención) |
| API `pnpm typecheck:tests` | sale 1 por deuda PREEXISTENTE ajena (ver abajo); ningún archivo tocado por la fase aparece en los errores |
| Admin `pnpm lint` | 0 errores (8 warnings preexistentes) |
| Admin `pnpm build` | OK |
| App `pnpm lint` | 0 errores (2 warnings preexistentes) |
| App `pnpm test` | 298 verdes, 2 rojos PREEXISTENTES (`test/level-display.test.ts`, ver sección 9) |
| App `pnpm build` | OK |
| `git status` tras los builds | limpio (`dist/` ignorado) |

`typecheck:tests`: errores NUEVOS en `test/attendance/attendance.test.ts`, `test/check-ins/check-ins-roster.test.ts`, `test/email/sender.test.ts`,
`test/unit/{combos-generator,full-body-selection,stretching-selection,tecnica-generator}.test.ts` y EMPEORADO en `test/analytics/analytics.test.ts` (2 a 4),
más una entrada obsoleta del baseline en `attendance.test.ts`. Se verificó con `git diff --name-only origin/master...HEAD -- el-templo-api/test`
que la fase NO tocó ninguno de esos archivos: es deuda ajena (el baseline envejeció respecto de master). No se regeneró el baseline
(no es de esta fase). La suite de integración NO se corrió (la corre CI al pushear a staging).

## 1. Qué viaja junto — VIAJAN JUNTOS

**VIAJAN JUNTOS (mismo push, mismo tren): 194-14, 194-15, 194-16, 194-17, 194-18 (árbitro de descuentos en la API) + 194-23 (admin).**

- Motivo (T-194-90): desde 194-18 el preview de renovación devuelve montos (`finalPrice`, `invitationDiscount*`, `partnerDiscount*`) y el alta/cambio
  de plan cambian de contrato. El admin anterior multiplicaba el % en el cliente y mostraría precios que no coinciden con lo que cobra la API.
  Publicar la API sin el admin 194-23 rompe la UI de cobros; publicar el admin 194-23 sin la API rompe los previews.
- Los cobros reales (alta, cambio inmediato, cambio diferido, renovación) cambian de regla: un solo descuento ganador por monto
  (partner vs invitación; empate = invitación), con tope en dinero por país y sin AURA en renovación.
- **Invariante D-03 (194-01/03/31) con o antes que 194-09** (activación de invitaciones): sin la invariante, un plan `is_trial` volvería `activo`
  al invitado. Como el orden de commits ya los trae en secuencia, basta con no cherry-pickear 09 sin 01/03/31.
- **Tren v6.1 mueve los mismos conteos de tenancy** (`GYM_OWNED_TABLES` 100, `TENANT_STRICT_MODULES.referrals`, `ENTRADAS_BASELINE` 455,
  `CASOS_BASELINE` de iso-03: 50 / 35 / 71 / 61 por archivo) y numera migraciones. El segundo en integrar suma sus conteos y renumera por encima de 0261.
- La app (1.8.2, planes 194-27/28) puede salir después de API+admin, pero la API es compatible hacia atrás con builds <= 1.8.1:
  `/mis-referidos` sigue como alias, claves internas `referidos` y `referidos_pendientes` no se renombran, y la ruta de la notificación queda en `/mis-referidos`.
- Planes extra del orquestador incluidos: 194-31 (indicadores de membresía) y 194-32 (refactor `invitation-rules`).

## 2. Orden de push (gate humano: preguntar a Franco antes de cada push)

1. **Backup primero** (sección 4). Staging y prod comparten host y MySQL: las migraciones y los UPDATE de datos de 0260/0261 corren contra datos de producción desde el primer push a staging.
2. Push a **staging** (primero, siempre): `git push origin feat/194-invitaciones:staging`. Esperar CI verde (tests de integración + tenancy + build) y el deploy de staging.
3. Verificar en staging con el SQL de la sección 3 y el UAT de la sección 5.
4. Validar SEPA con Leandro (sección 6) y que gestión cargue los feriados ES (sección 7) ANTES del lanzamiento de ES.
5. Push a **master** solo con OK explícito de Franco tras el UAT. Hotfixes y back-merge siguen la regla de siempre (partir de `origin/master` fresco).
6. Builds de tienda 1.8.2 (sección 8), gate humano, sin deploy manual de frontend.

## 3. Migraciones y su efecto en producción

Todas las migraciones se aplican con el runner propio (`node dist/db/run-migrations.js`, tabla `_migrations`). Nunca `drizzle-kit migrate/push`.

| Mig | Archivo | Efecto en prod |
| --- | ------- | -------------- |
| 0255 | `0255_invitations.sql` | Crea la tabla `invitations` (DDL, `CREATE TABLE IF NOT EXISTS`, cero datos). Gym-owned, módulo strict `referrals`. |
| 0256 | `0256_plans_allows_invitation_discount.sql` | Agrega `subscription_plans.allows_invitation_discount` (default 0) y hace el backfill D-23 UNA sola vez: marca en 1 los planes con categoría distinta de `especial`/`paquete` y `is_trial = 0`. Guard `NOT EXISTS` para no re-marcar planes que gestión desmarque. Cross-tenant a propósito. |
| 0257 | `0257_invitation_plans.sql` | Inserta los planes "Invitación" (tenant 1): AR/ARS y ES/EUR, `paquete`, 6 días, 3 por semana, `is_trial=1`, precio 0, flag en 0. `INSERT ... WHERE NOT EXISTS`. |
| 0258 | `0258_role_coach_actividad.sql` | De master (no es de la fase), ya mergeada. |
| 0259 | `0259_tv_avisos_tema.sql` | De master (no es de la fase), ya mergeada. |
| 0260 | `0260_fix_referral_3_inverted.sql` | **Datos de prod (D-28).** Corrige el vínculo `referrals.id = 3` invertido: pasa de Guido (7286) invita a Valentina (6613) a **Valentina (6613) invita a Guido (7286)**, `status='qualified'`, `copy_variant='B'`, `qualified_at` = `created_at` de la sub 8074 (primer pago de Guido) con fallback a NOW(). Espeja `users.referred_by` (6613 a NULL, 7286 a 6613). Guards: solo corre si la fila está EXACTAMENTE en `7286 -> 6613` y no existe otro vínculo con `referred_id = 7286`; si prod no está en ese estado es no-op. No toca `referral_credits` ni AURA. Idempotente. |
| 0261 | `0261_rebrand_invitaciones_copy.sql` | **Copy vivo.** `notification_templates.referral_link_activated`: "¡Tu referido pagó!" pasa a "¡Tu invitado se sumó!" (y la forma femenina, body con "descuento por invitación"). `avisos.card_referral`: body nuevo y botón "Invitar". Guard por texto por defecto exacto de TODOS los campos reescritos: si el staff editó algo, la fila queda entera. La ruta de la notificación NO cambia (`/mis-referidos`, compat con builds <= 1.8.1). |

Acciones de código sin migración con efecto en prod al desplegar: el registro con código de socio ya NO crea fila `referrals` (D-26b, devuelve `invitation: { code }`
y exige teléfono); el segmento de campañas `referidos_pendientes` ahora incluye invitaciones activas sin convertir; cambia el copy visible de la API.

### SQL read-only de verificación (staging y prod)

Correr ANTES del push (línea base) y DESPUÉS del deploy. No hay ninguna escritura.

```sql
-- Línea base ANTES: 9 vínculos conservados y 16 créditos históricos (no deben cambiar nunca)
SELECT COUNT(*) AS vinculos FROM referrals WHERE tenant_id = 1;
SELECT COUNT(*) AS creditos FROM referral_credits WHERE tenant_id = 1;

-- Vínculo 3. ANTES: referrer 7286, referred 6613. DESPUÉS: referrer 6613, referred 7286, qualified, variante B
SELECT id, referrer_id, referred_id, status, copy_variant, qualified_at FROM referrals WHERE id = 3 AND tenant_id = 1;

-- Espejo en users. DESPUÉS: 6613 referred_by NULL, 7286 referred_by 6613
SELECT id, referred_by FROM users WHERE id IN (6613, 7286) AND tenant_id = 1;

-- Primer pago de Guido que da qualified_at
SELECT id, user_id, created_at, price_paid FROM subscriptions WHERE id = 8074 AND tenant_id = 1;

-- Migraciones registradas (esperadas: las 5 de la fase)
SELECT name FROM _migrations WHERE name IN (
  '0255_invitations.sql', '0256_plans_allows_invitation_discount.sql', '0257_invitation_plans.sql',
  '0260_fix_referral_3_inverted.sql', '0261_rebrand_invitaciones_copy.sql');

-- Tabla invitations vacía tras el deploy (nadie activó todavía)
SELECT COUNT(*) AS invitaciones FROM invitations WHERE tenant_id = 1;

-- Planes Invitación AR y ES (esperado: 2 filas, paquete, 6 días, is_trial=1, flag 0)
SELECT id, name, country, currency, plan_category, duration_days, classes_per_week, is_trial, allows_invitation_discount, is_active
FROM subscription_plans WHERE tenant_id = 1 AND name = 'Invitación';

-- Flag allows_invitation_discount por categoría (esperado: 1 en las categorías habilitadas, 0 en especial/paquete/trial)
SELECT plan_category, is_trial, allows_invitation_discount, COUNT(*) AS planes
FROM subscription_plans WHERE tenant_id = 1 GROUP BY plan_category, is_trial, allows_invitation_discount;

-- Copy vivo. Si siguen con el texto viejo, el staff lo editó o la migración no corrió
SELECT tenant_id, template_key, title, body, route FROM notification_templates WHERE template_key = 'referral_link_activated';
SELECT tenant_id, code, title, body, button_text, destination_section FROM avisos WHERE code = 'card_referral';
```

Esperado tras el deploy: `vinculos = 9`, `creditos = 16`, vínculo 3 corregido, 2 planes Invitación, 5 migraciones registradas.
Si el vínculo 3 NO está en el estado esperado antes del deploy (alguien lo corrigió a mano), 0260 queda no-op: es correcto, no es un error.

## 4. Backup (paso humano — requiere SSH: pedir OK a Franco)

Antes del primer push a staging (comparte MySQL con prod). El agente NO lo ejecuta. Completar `<DB_NAME>`, `<DB_USER>` y el host con los datos de prod:

```bash
ssh <host-ec2> 'mysqldump --single-transaction --no-tablespaces -u <DB_USER> -p <DB_NAME> \
  referrals referral_credits subscription_plans notification_templates avisos _migrations \
  | gzip > ~/backup-194-pre-$(date +%Y%m%d-%H%M).sql.gz'

# users: solo las columnas que toca 0260 (id, tenant_id, referred_by)
ssh <host-ec2> 'mysql -u <DB_USER> -p <DB_NAME> -e "SELECT id, tenant_id, referred_by FROM users WHERE referred_by IS NOT NULL OR id IN (6613, 7286)" \
  | gzip > ~/backup-194-users-referred-by-$(date +%Y%m%d-%H%M).tsv.gz'
```

Verificar que los archivos existen y no están vacíos (`ls -lh ~/backup-194-*`). Sirve de rollback manual del vínculo 3 y de las filas de copy
(la tabla `invitations` es nueva: el rollback es `DROP TABLE`, sin pérdida previa).

## 5. Guion de UAT (AR + ES)

Ejecutar en staging con datos de prueba, una vez con una sede AR (ARS) y otra con una sede ES (EUR). Marcar cada ítem OK/falla.

Parámetros por defecto (Configuración ▸ Reglas de precio ▸ Invitaciones): cupo 2/mes, 10 días hábiles, ventana de reinvitación 90 días, ex socio con 6 meses de inactividad, invitado 10%, tope 40%.

1. **Self-service con link nuevo (sin sesión):** abrir `/invitacion/<código>` del invitador. La landing no muestra nombre del invitador ni números. Registrarse (teléfono obligatorio), llega a "Activar invitación", elegir sede física, teléfono, DNI opcional, activar: "Tenés N accesos hasta <fecha>" con los números del servidor.
2. **Link viejo `?ref=`:** `/register?ref=<código>` sigue funcionando y lleva a la misma activación.
3. **Con sesión iniciada / ex socio por login:** un ex socio (inactivo hace más de 6 meses) entra por login con `?invitacion=` y activa. Un socio vigente, o uno con plan `scheduled` ya comprado, es rechazado con el motivo correcto.
4. **Cuenta existente (409):** registrarse con un teléfono ya registrado muestra los caminos de login y recepción.
5. **Lead de recepción por canal asistido:** recepción carga la invitación a mano desde el admin (Invitar desde la ficha / diálogo de creación). Queda canal `assisted`, etapa del lead visible en la bandeja.
6. **Cupo 2/mes:** el tercer invitado del mismo invitador en el mes es rechazado (`inviter_quota_exhausted`). Anular una invitación libera el cupo.
7. **90 días por persona:** reinvitar a la misma persona dentro de la ventana es rechazado.
8. **Uso de accesos:** el invitado reserva y hace check-in en otra sede del mismo país. Cruzar de país (invitado AR en sede ES o viceversa) es rechazado. Un invitado de sede virtual elige una sede física y recibe el plan del país de esa sede.
9. **Cierre de accesos:** el invitado compra un plan real CON accesos vigentes: la sub de invitación pasa a `completed`, el plan nuevo arranca, queda `activo`. Repetir con una compra tardía (20 días después de vencidos los accesos, dentro de la ventana de 30).
10. **Anulación:** anular una invitación activa cancela las reservas futuras del invitado y restaura su estado previo. Una invitación cuyo invitado ya compró no se anula (409).
11. **Descuento del invitador:** cuando el invitado paga su primer plan, el invitador recibe el aviso ("¡Tu invitado se sumó!") y su siguiente renovación baja un 10% por invitado activo (admin y profe/PoS con monto precargado).
12. **Gana el mayor:** con partner e invitación a la vez en un alta, cambio de plan o renovación se aplica UNO (el de mayor monto, empate = invitación), y compite contra AURA donde corresponde.
13. **Tope en dinero:** cargar un tope por país en Reglas de precio; el descuento se corta en ese monto y la línea dice "· con tope". Sin fila de tope no hay tope.
14. **Paridad preview-cobro:** el precio que muestra el admin en alta, cambio de plan y renovación (incluido "mantener vencimiento", precio personalizado y prorrateo) es el que cobra.
15. **Mis invitados (app):** cupo restante, los 5 estados, privacidad (nombre + inicial). `/mis-referidos` redirige.
16. **Admin:** ficha de socio con "Invitado por" y desglose de descuento por lado; Reportes ▸ Invitaciones (alcance por país, owner ve ambos con montos por moneda); bandeja de invitaciones con etapa de lead editable (En seguimiento / Perdido); filtro de Alumnos por Origen: Invitación.
17. **Invariante de membresía:** un invitado con solo accesos NO figura como socio activo en listados, analytics, Renovaciones, SEPA ni la bandeja de caja (muestra "Invitación").
18. **Datos de prod:** SQL de la sección 3 antes y después (vínculo 3 de Valentina/Guido, 9 vínculos, 16 créditos).

## 6. Validación SEPA con Leandro (D-25, España)

El export de domiciliación (xlsx) ahora trae al final las columnas **Importe** y **Moneda** (monto registrado por el sistema, con descuento incluido, de la membresía vigente; sin planes `is_trial`).
Pasos:

1. Descargar el export de domiciliación en staging con al menos un socio con descuento por invitación.
2. Enviárselo a Leandro y confirmar que su proceso de carga tolera dos columnas extra al final (que ya no lee por posición) o que prefiere que sean informativas.
3. Confirmar que el importe coincide con lo que él cobra por socio. Si el formato del banco no admite columnas extra, quedan como columna informativa (D-25).
4. Los invitados con solo `is_trial` no aparecen en el export.

## 7. Feriados ES (D-29) — carga humana por gestión

Prod tiene 17 feriados AR (hasta 2027-01-01) y solo 5 ES (hasta 2026-09-24). Los días hábiles de las invitaciones en ES se calculan con esa tabla.
Gestión carga en **Horarios ▸ Feriados** los feriados de España (nacionales y de la sede) **desde 2026-09-25 hasta fin de 2027**, ANTES de habilitar invitaciones en ES.
No se cargan por migración (dato operativo). Sin feriados cargados las invitaciones ES vencen antes de lo que corresponde.

## 8. Builds de tienda 1.8.2 (gate humano)

- Versión 1.8.2 (patch) en `version.txt`, `package.json`, `build.gradle` y `project.pbxproj`. No se disparó ningún build.
- Build y subida a las tiendas Android e iOS: pendiente de Franco. No hay deploy manual de frontend.
- Verificar en dispositivo: link nuevo sin sesión y con sesión, `?ref=` viejo, 409 por cuenta existente, activación y "Reservar mi primera clase".
- Las builds <= 1.8.1 siguen funcionando contra la API nueva (alias `/mis-referidos`, claves internas intactas).

## 9. Limitaciones abiertas y desviaciones acumuladas

### Limitaciones abiertas (decisión de producto o de alcance, no bloquean el release)

- **La cantidad de accesos NO es editable desde el admin de Planes** (194-25): el plan Invitación es `paquete`, el enum de entrada de la API no acepta `paquete` y el formulario esconde "Clases por semana". Cambiar `classes_per_week` hoy requiere SQL o un cambio de API/formulario. La nota de la tarjeta de Reglas de precio lo menciona.
- **UTC en ES de madrugada (00:00 a ~02:00 locales):** `assignPlanInternal` decide `active|scheduled` con la fecha UTC; una sub de invitación puede nacer `scheduled` hasta que el cron la active. Comportamiento global de `assignPlan`, no se tocó.
- **No-show:** no existe job que descuente saldo por no-show; el saldo baja solo en el check-in. Descontar no-shows de los accesos sería una decisión de producto nueva.
- **Export de Alumnos sin `origin`** (194-26): `/export` no aplica el filtro Origen (tampoco `segment` ni `debtorOnly`); exportar con "Origen: Invitación" activo baja la lista sin ese filtro.
- `users.converted_at`: un ex socio ya convertido como lead que vuelve por invitación conserva `converted_at`, así que el gate de `ganado` no se dispara hasta que se extienda con "invitación activada".
- Comprar un plan `scheduled` (arranca más adelante) cierra igual los accesos de invitación al comprar (D-07 literal): deja sin acceso hasta que arranque.
- La notificación `referral_link_activated` mantiene la ruta `/mis-referidos` hasta retirar las builds <= 1.8.1.
- La bandeja de invitaciones no tiene filtro por fecha de activación aunque la API admite `from`/`to`.
- Si el GET de parámetros falla, la tarjeta de Reglas de precio solo muestra el error (se recarga la página).
- El guard de 0256 se apoya en "ningún plan marcado": solo es relevante si se re-ejecuta la migración por fuera del runner normal.
- Un alta del segmento `referidos_pendientes` entra recién desde el día 4 de la ventana (regla de frescura D-10 para todo el segmento).
- Sin `vue-tsc` (D-27) los tipos de los `.vue` no se chequean: las pantallas nuevas del admin y la app se verificaron por lint, build y revisión; no se probaron en navegador ni dispositivo, de ahí la importancia del UAT.

### Deuda preexistente (no es de la fase)

- `pnpm typecheck:tests` de la API sale 1 por archivos ajenos (sección 0).
- `el-templo-app/test/level-display.test.ts` (2 casos) falla desde la Fase 129: espera 5 niveles y hay 6 (`kairos`). Arreglo: actualizar las expectativas a 6 niveles. CI no corre los tests de la app.
- Tests con `todayStr()` (UTC) fallan entre 21:00 y 24:00 ART: `test/subscriptions-conversion-hook.test.ts` (5 casos) y `test/invitations/purchase-closes-access.test.ts` ("comprar un plan real..."). CI corre en UTC y no los ve. Re-correr de día.
- Los symlinks `node_modules` de admin y API del worktree pueden apuntar a un checkout borrado (no afecta CI).

### Desviaciones relevantes para el humano

- Renumeración 0258/0259 a 0260/0261 (master ocupó 0258/0259 el 2026-10-07): ya resuelta, verificada libre.
- Se abrió la página "Reglas de precio" a gestion/admin (antes solo owner) con el contenido de recargo por tarjeta y Precio Zero escondido a no-owner; el PUT de esas reglas sigue owner-only.
- `normalizeSignupCode` de la app conserva el guion de los códigos de socio (fix 194-28).
- El teléfono tipeado en el registro viaja a la activación solo por memoria; `GET /auth/me` no trae teléfono ni DNI.
- Tests de la fase con ids de prod hardcodeados (excepción autorizada): solo `test/migrations/0260-0261-invitaciones.test.ts` (users 6613/7286, referrals 3, subscriptions 8074).
