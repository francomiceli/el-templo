# 175-02 SUMMARY — campaigns tracking + unsubscribes por-tenant (M3) + funnel

**Estado:** ✅ COMPLETO Y VERIFICADO (finalizado por el orquestador — el ejecutor sonnet se cortó en la Task 3
esperando un `test/tenancy` que había lanzado en BACKGROUND, violando Rule 1; el orquestador mató el vitest huérfano,
completó la verificación limpia y commiteó la Task 3 + el ajuste de ratchet).

**Worktree:** `/home/franco/projects/et-173` (`feat/173-adopcion-members`). **HEAD final:** `b135b5c9`.

## Commits de código (feat/173-adopcion-members)

- `b5e38f1f` feat(175-02): derive tenant_id from campaign_sends in tracking-service.ts
- `d2218fe3` fix(175-02): scope listEligible's unsubscribe suppression by tenant + e2e test (mina M3)
- `ed0fb9bc` feat(175-02): scope every access in campaigns funnel() (finding from 175-01)
- `b135b5c9` chore(175-02): inline tenantWhere + drop campaigns allowlist entries + con-06 ratchet 65->61 (commiteado por el orquestador)

## Qué se hizo

1. **tracking-service.ts:** `recordOpen`/`recordClick`/`recordUnsubscribe`/`getSendEmail` derivan el `tenant_id` leyendo
   `campaign_sends` por el `sendId` del token (pre-scope tenant-safe embebido) y lo estampan en los INSERT de
   `campaign_events`/`campaign_unsubscribes`. El token no trae tenantId (complicación real resuelta por derivación).
2. **Mina M3 cerrada:** la supresión de unsubscribes vive en `listEligible` (no en una query aparte); se scopeó por tenant +
   test e2e nuevo demostrando que un opt-out del tenant A no suprime envíos del tenant B.
3. **funnel() (hallazgo de 175-01):** tenía ~13 accesos vivos sin `tenantWhere` pese a recibir ctx (el inventario lo daba por
   migrado, era falso). Scopeados todos (Pattern A).
4. **listCampaigns/loadSedes:** el `tenantWhere` se movió INLINE dentro del `.where()` (antes en variable/array) — el lint
   juzga por statement textual (mismo patrón que reports:1545/goal-plans:488), condición para poder remover las entradas de allowlist.
5. **Allowlist:** removidas todas las entradas de campaigns (tracking + service.ts). Queda SOLO la exención D-02 `:88` (users, correlacionado).

## Verificación (orquestador, limpia)

- `pnpm exec tsc --noEmit`: 0 errores.
- `pnpm lint:tenant`: allowlist **189** (196→189), `unlistedViolations: 0`, `staleNoLongerViolating: 0`, **`DISCREPANCIAS: 0`**, 85 exenciones.
- `pnpm exec vitest run test/campaigns`: **29 passed, 1 failed** (el failed = D5 pre-existente `campaigns-funnel:211`, fixture cruda de `bookings` rota por el switch 174.1 — NO es de 175-02, ver deferred D5).
- `pnpm exec vitest run test/tenancy`: **498/498** (tras ajustar el ratchet con-06 EN-PROFUNDIDAD 65→61: las 4 tablas de campaigns quedaron sin deuda).

## Incidente operativo (para los planes siguientes)

El ejecutor sonnet lanzó `test/tenancy` con la herramienta Bash, que lo auto-backgroundea a los 120s (dura ~14 min); el
ejecutor "esperó" sin poder capturar el resultado y terminó el turno dejando el vitest vivo. **Regla reforzada: los
ejecutores NO corren `test/tenancy` — corren solo tsc + lint + su suite de módulo (foreground). El gate largo
(`test/tenancy`) y el ajuste del ratchet con-06 los corre el ORQUESTADOR tras cada plan.**

## Desviación

- La firma de `create()` cambió (ahora requiere `ctx` primero) → 175-01 ya había ajustado sus 10 call sites de test; 175-02 no tocó más tests salvo el e2e nuevo.
