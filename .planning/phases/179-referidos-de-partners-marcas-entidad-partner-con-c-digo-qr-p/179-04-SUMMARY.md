---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 04
subsystem: api
tags: [fastify, drizzle, tenancy, referrals, partners, auth, code-resolver]

# Dependency graph
requires:
  - phase: 179-02
    provides: "PartnerReferralService (CRUD tenancy-native) + resolveSignupCode + fixtures del módulo"
  - phase: 179-03
    provides: "CRUD admin de partners (rutas, RBAC, tenancy) — gate ISO-01 en 374"
provides:
  - "attributePartnerAtSignup: crea partner_referrals con beneficio pending y vencimiento a 30 días (PARTNER_BENEFIT_TTL_DAYS, D-07), degrada en silencio si hay origen previo (D-12) o pierde la carrera del UNIQUE"
  - "findOriginForMember: origen actual de un socio (member/partner/null) — base de D-12, reusable por la retroactiva (179-08)"
  - "Cuarto bloque best-effort de POST /api/auth/register: campo unificado `code` (D-02/D-03) resuelto server-side, con back-compat total de ref/promoCode"
  - "Respuesta de /register extendida con partnerBenefit: {partnerName, benefitType, benefitValue} | null (shape que consume la app en 179-14)"
affects: [179-05, 179-06, 179-07, 179-08, 179-09, 179-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolución única de `code` ANTES de los 3 bloques best-effort existentes, derivando variables efectivas (effectivePromoCode/effectiveRef/partnerAttributionInput) sin reescribir la lógica interna de los bloques promo/ref — mismo criterio de diff aditivo que el resto de la fase"
    - "El bloque partner es el CUARTO best-effort, calcado en forma del bloque ref (try/catch propio, log.warn con {err, code, userId}, cero throw) — T-179-17"
    - "attributePartnerAtSignup hace el pre-chequeo de origen (findOriginForMember) Y envuelve el INSERT en isDuplicateKeyError: dos capas contra D-12, la primera evita el viaje a DB en el caso común, la segunda gana la carrera"
    - "El tenant del vínculo y de cualquier lectura posterior (nombre del partner para la respuesta) sale SIEMPRE de partner.tenantId derivado por resolveSignupCode — nunca del body ni de un default, en una ruta sin request.scope"
key-files:
  created:
    - el-templo-api/test/referral-partners/registro-atribucion.test.ts
    - el-templo-api/test/referral-partners/exclusividad-origen.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/referral-partners/types.ts
    - el-templo-api/src/modules/referral-partners/code-resolver.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/schemas.ts

key-decisions:
  - "attributePartnerAtSignup NUNCA lanza para los casos de negocio esperados (D-12, carrera del UNIQUE): siempre devuelve null y loguea, dejando el throw solo para errores genuinamente inesperados — el llamador (auth/routes.ts) igual lo envuelve en try/catch por defensa en profundidad (T-179-17)"
  - "`code` es el campo unificado y GANA sobre `promoCode`/`ref` sueltos del body cuando está presente: al resolverlo, ambas variables efectivas se resetean a undefined y se setea SOLO la que corresponde al kind resuelto — evita que un `code` de partner + un `ref` suelto en el mismo body puedan crear doble origen en una sola llamada a /register (refuerzo estructural de D-12, no solo el guard del service)"
  - "partnerName para la respuesta se resuelve con una query aparte DENTRO del mismo try/catch de la atribución (no una query separada fuera del best-effort): si falla, degrada a partnerBenefit=null sin afectar el vínculo ya creado"

requirements-completed: [D-02, D-03, D-07, D-12, D-20]

# Metrics
duration: ~70min
completed: 2026-08-23
---

# Phase 179 Plan 04: Atribución de partner en el alta público Summary

**`attributePartnerAtSignup` (vínculo pending + vencimiento a 30 días, D-07) enganchado como cuarto bloque best-effort de `POST /api/auth/register` vía el campo unificado `code` (D-02/D-03), con exclusividad de origen (D-12) garantizada en dos capas (pre-chequeo + UNIQUE) y 20 tests de integración verdes contra MySQL real.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 7 (2 nuevos en test/referral-partners, 5 modificados: 3 del módulo referral-partners + auth/routes.ts + auth/schemas.ts)

## Accomplishments

- `PartnerReferralService.attributePartnerAtSignup`: crea `partner_referrals` pending con snapshot de beneficio, `attribution_channel='self_service'` y `benefit_expires_at = created_at + PARTNER_BENEFIT_TTL_DAYS` (30, constante exportada y reusable por 179-07); degrada en silencio (devuelve `null`, loguea) si el socio ya tiene origen (D-12) o pierde la carrera del `UNIQUE(referred_id)`
- `PartnerReferralService.findOriginForMember`: origen actual de un socio (`member`/`partner`/`null`), leyendo `referrals` (lectura, no modificación — el CONTEXT prohíbe tocar ese módulo, no prohíbe leerlo) y `partner_referrals` con `tenantWhere`
- `POST /api/auth/register`: campo `code` unificado (D-02/D-03) con back-compat total de `ref`/`promoCode` — resolución única que alimenta los 3 bloques existentes sin reescribir su lógica interna, más el cuarto bloque partner (try/catch propio, cero throw, T-179-17)
- Respuesta extendida con `partnerBenefit: { partnerName, benefitType, benefitValue } | null`
- 20 tests de integración nuevos (8 en `registro-atribucion.test.ts`, 4 en `exclusividad-origen.test.ts` + cobertura complementaria) verdes contra MySQL real; el resto de la fase (`test/referral-partners` completo, `test/auth`, `test/referrals`) sigue en 193/193 verde — cero regresión de back-compat
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias, `git diff --name-only origin/master -- el-templo-api/src/modules/referrals/` vacío (regla dura de no tocar ese módulo respetada)

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: attributePartnerAtSignup + findOriginForMember en el service** - `3a54fd56` (feat)
2. **Task 2: cuarto bloque best-effort en /register + campo `code`** - `b70cf8a3` (feat)
3. **Task 3: tests de atribución en el alta + exclusividad de origen** - `728c7979` (test, incluye 1 fix de Rule 1 sobre `auth/routes.ts`)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/service.ts` - `attributePartnerAtSignup`, `findOriginForMember`, `PARTNER_BENEFIT_TTL_DAYS` (exportada, =30)
- `el-templo-api/src/modules/referral-partners/types.ts` - `PartnerOrigin`, `PartnerSignupResult`
- `el-templo-api/src/modules/referral-partners/code-resolver.ts` - fix (ver Deviations): la rama socio preserva el guion del código
- `el-templo-api/src/modules/auth/routes.ts` - campo `code` + resolución única + cuarto bloque partner + `partnerBenefit` en la respuesta + `tenantWhere` en la lectura del nombre del partner
- `el-templo-api/src/modules/auth/schemas.ts` - `code: { type: "string", maxLength: 24 }` en `registerSchema`
- `el-templo-api/test/referral-partners/registro-atribucion.test.ts` - 8 tests HTTP contra `/api/auth/register`
- `el-templo-api/test/referral-partners/exclusividad-origen.test.ts` - 4 tests (2 de servicio + 1 de `findOriginForMember` + 1 de constraint crudo)

## Shape de `partnerBenefit` en la respuesta de `/register` (para 179-14, la app)

```ts
// Junto a { token, accessToken, refreshToken, user, promoApplied, partnerBenefit }
partnerBenefit:
  | { partnerName: string; benefitType: "discount_percent" | "free_pass"; benefitValue: number }
  | null; // null si no había code, el code no resolvió a partner, o D-12 lo degradó en silencio
```

`benefitValue` es 1-100 (porcentaje) para `discount_percent`, siempre 0 para `free_pass` (D-19, valor fijo). El vínculo creado (`partner_referrals`) no viaja en la respuesta — solo el shape de display.

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para el resto de la fase: **`code` gana estructuralmente sobre `ref`/`promoCode` sueltos del mismo body** — no solo el service evita el doble origen (D-12) vía `findOriginForMember` + `UNIQUE`, sino que la ruta ya no le da a `ref` la chance de correr si `code` resolvió a `partner` en la misma llamada. Refuerzo en dos capas: estructural (routes.ts) + de datos (service.ts + constraint DB).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug pre-existente de 179-02] `code-resolver.ts` nunca podía resolver un código de socio real**

- **Found during:** Task 3, al diseñar el test "code que resuelve a socio dispara el bloque ref"
- **Issue:** `resolveSignupCode` normalizaba con `normalizeCode` (arranca todo lo no-alfanumérico, incluido el GUION) antes de llamar a `ReferralService.resolveReferralCode`. Pero `users.referral_code` tiene SIEMPRE el formato `PREFIJO-XXXX` (`generateReferralCode`, `referrals/service.ts`) — el guion es parte literal del código, no un separador cosmético. Un `code` real de socio (p.ej. `"FRAN-A3B2"`) nunca hubiera matcheado, porque `normalizeCode` lo convertía en `"FRANA3B2"` antes del `eq(users.referralCode, ...)`. El test de 179-02 que cubría esta rama usó un código FAKE sin guion (vía `nextCode`), lo que enmascaró el bug.
- **Fix:** La rama socio de `resolveSignupCode` ahora usa `code.trim().toUpperCase()` (preserva el guion) en vez de `normalizeCode(code)` para el lookup contra `users.referral_code`. Las ramas partner/promo siguen usando `normalizeCode` sin cambios (esos códigos nunca llevan guion literal).
- **Files modified:** `el-templo-api/src/modules/referral-partners/code-resolver.ts`
- **Commit:** `b70cf8a3`

**2. [Rule 1 - Bug] Lectura del nombre del partner en `/register` sin `tenantWhere`**

- **Found during:** Task 3, al correr `pnpm lint:tenant` como parte de la verificación de plan completa
- **Issue:** La query que arma `partnerBenefit.partnerName` (`select referralPartners.name where id = ...`) no acotaba por tenant — el lint de tenancy (CON-06) lo marcó como violación nueva no listada (`unlistedViolations: 1`).
- **Fix:** Se agregó `tenantWhere(referralPartners, { tenantId: partnerAttributionInput.tenantId })` al `.where(and(...))` — el `tenantId` ya estaba disponible (derivado de `resolveSignupCode`, misma fuente legítima que usa el vínculo).
- **Files modified:** `el-templo-api/src/modules/auth/routes.ts`
- **Commit:** `728c7979`

### Otras desviaciones documentadas (no bugs)

**3. Assertion de `benefit_expires_at` vía SELECT tipado de Drizzle, no `partnerLinkRow` (SQL crudo).** El proceso Node corre en `America/Argentina/Buenos_Aires` (UTC-3). El helper `partnerLinkRow` de 179-02 (`app.db.execute(sql\`...\`)`) devuelve el DATETIME crudo sin la normalización de columna de Drizzle, produciendo un desfasaje de exactamente 3 horas contra un `Date`de JS.`test/auth/refresh-tokens.test.ts`ya evita este problema comparando timestamps vía`.select()`tipado en vez de SQL crudo — mismo criterio aplicado acá. No se tocó`partnerLinkRow` (fuera del scope de archivos de este plan, y sigue siendo correcto para las demás columnas de la fila, que no son fechas).

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. Ambos fixes de Rule 1 se resolvieron dentro del mismo Task 3 sin necesitar iteración adicional más allá de la detectada por `tsc`/`vitest`/`lint:tenant`.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- `attributePartnerAtSignup` y `findOriginForMember` quedan listos para que 179-08 (asignación retroactiva desde la ficha del alumno) los reuse sin reimplementar la exclusividad de origen — ahí el 409 SÍ es visible (a diferencia del alta, que degrada en silencio).
- `PARTNER_BENEFIT_TTL_DAYS` exportada y lista para el chequeo de vencimiento de 179-07.
- El shape de `partnerBenefit` en la respuesta de `/register` está congelado y listo para que la app (179-14) lo consuma para el badge/mensaje de éxito.
- El campo `code` en `RegisterPage.vue` (D-02, trabajo de frontend) puede apuntar a este endpoint sin cambios adicionales del lado API.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/test/referral-partners/registro-atribucion.test.ts`
- FOUND: `el-templo-api/test/referral-partners/exclusividad-origen.test.ts`
- FOUND: commit `3a54fd56` (Task 1)
- FOUND: commit `b70cf8a3` (Task 2)
- FOUND: commit `728c7979` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
