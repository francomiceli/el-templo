---
phase: 195
slug: web-seo-local-aeo-atribucion
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-06
---

# Phase 195 — Validation Strategy

> Contrato de validación por fase. Tests de API corren en CI (no suite local); local = typecheck + lint + test puntual nuevo + build web.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (API integración MySQL real; app unit); web sin runner → `el-templo-web/scripts/verify-seo-output.mjs` |
| **Config file** | `el-templo-api/vitest.config.ts`, `el-templo-app/vitest.config.*` |
| **Quick run command** | `cd el-templo-api && pnpm exec vitest run test/<archivo-nuevo>.test.ts` |
| **Full suite command** | CI (`ci.yml`) en push a staging |
| **Estimated runtime** | ~60-180 s por archivo nuevo |

## Sampling Rate

- **After every task commit:** typecheck del proyecto tocado + lint + test puntual nuevo
- **After every plan:** web → `generate` + `verify-seo-output.mjs`; API → `npx tsc --noEmit` + `pnpm lint:tenant`; app/admin → `pnpm lint` + `pnpm build` (`vue-tsc` NO está instalado localmente y no se instala — ver 195-EXECUTION-RULES §3)
- **Before `/gsd:verify-work`:** CI verde en staging + verificación manual post-SSH
- **Max feedback latency:** 180 s

## Fuente (copiado de 195-RESEARCH.md)

### Framework de tests
| Propiedad | Valor |
|-----------|-------|
| API | Vitest ^4.0.18, integración contra MySQL real (`vitest.config.ts`, una DB por worker `eltemplo_test_<POOL_ID>`) |
| App | Vitest (`el-templo-app/package.json:12`), unit en `src/**/__tests__` |
| Web | Sin runner → verificación por build + `scripts/verify-seo-output.mjs` (Node puro, sin deps) |
| Comando rápido API | `cd el-templo-api && pnpm exec vitest run test/<archivo>.test.ts` (solo el archivo nuevo) |
| Suite completa | CI (`ci.yml` API Integration Tests) — no correrla local |
| Typecheck | `cd el-templo-api && npx tsc --noEmit`; `pnpm --dir el-templo-web exec nuxi typecheck`; app y admin: `pnpm lint` + `pnpm build` (sin `vue-tsc`, no instalado) |

### Requisitos → tests
| ID | Comportamiento | Tipo | Comando automatizado | ¿Existe? |
|----|----------------|------|----------------------|----------|
| D-01/D-07 | Migración deja ALEM con slug `juan-b-justo`, CHAPADMALAL/ONLINE sin publicar, PARK `community_space`, idempotente | integración | `vitest run test/migrations/0270-0271-branches-web.test.ts` | ❌ Wave 0 |
| D-01 | La web no contiene "Alem 3958", "Chapadmalal", "8 sedes", `54223XXXXXXX` | build+grep | `node el-templo-web/scripts/verify-seo-output.mjs` | ❌ |
| D-10/D-08/D-16 | `GET /api/web/site-data` devuelve solo sedes publicadas, horarios fusionados, WhatsApp por país, sin PII ni datos de otro tenant | integración | `vitest run test/web-public/site-data.test.ts` | ❌ |
| D-08 | `mergeIntervals` (solapes, huecos ≥60, vacío) | unit | ídem (archivo `opening-hours.test.ts`) | ❌ |
| D-03 | Home: exactamente 1 nodo `@id …/#organization` y 0 `ExerciseGym`; cada `/sedes/<slug>/index.html` con `ExerciseGym`, `parentOrganization`, `openingHoursSpecification`; Park sin `ExerciseGym` | build+parse | `verify-seo-output.mjs` | ❌ |
| D-13 | Pares hreflang recíprocos y autorreferentes; `lang` `es-ES` en `/es/` | build+parse | `verify-seo-output.mjs` | ❌ |
| D-15 | `robots.txt` con los 3 bots; `llms.txt` con "Juan B. Justo 1018" (en strict) | build+grep | `verify-seo-output.mjs` | ❌ |
| D-17 | Sitemap con posts; sin `catch {}` mudo; `Person` de autor en el JSON-LD de un post | build+grep | `verify-seo-output.mjs` + `grep -n "catch {" server/api/__sitemap__/blog.ts` (0) | ❌ |
| D-22 | En `/es/` sin consentimiento no hay `<script src=…googletagmanager…>` ni `fbevents` en el HTML; banner presente | build+grep (estático) + manual en navegador | `verify-seo-output.mjs`; manual: DevTools › Network | ❌ |
| D-11 | Workflow YAML válido; `target=solo-web` solo construye web (dry: revisar el plan de jobs) | estático + manual | `python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/deploy.yml`; dispatch real en staging (Franco) | — |
| D-05/D-09/D-14 | 404, redirects, X-Robots, content-type de `.well-known` | manual (post-SSH) | curls del bloque nginx | — |
| D-18 | `register` con `attribution` crea la fila; sin `attribution` el alta igual funciona; un error de atribución no bloquea; `origin` del admin persiste (no lo borra AJV); tenant 2 no ve filas de tenant 1 | integración | `vitest run test/marketing/attribution.test.ts` | ❌ |
| D-21.1 | `classifyChannel` (chatgpt.com, perplexity, gemini, copilot, claude.ai, utm meta/google, promo, ref, directo) | unit | ídem (`channel.test.ts`) | ❌ |
| D-19 | Outbox: deriva los 3 eventos, `event_id` estable, idempotente en dos corridas, saltea ES sin consentimiento e iOS, respeta la ventana de 7/62 días, normaliza y hashea (vectores conocidos), lote rechazado → `failed` con reintento, sin config → no-op | integración (fetch mockeado con `vi.stubGlobal`) | `vitest run test/marketing/meta-capi.test.ts` | ❌ |
| D-20 | Insights paginado → upsert `ad_spend_daily`; re-corrida actualiza sin duplicar | integración | `vitest run test/marketing/meta-spend.test.ts` | ❌ |
| D-21.2 | JWT firmado verificable con la clave pública; job GSC guarda filas; 403 → log sin throw | unit + integración | `vitest run test/marketing/google-search-console.test.ts` | ❌ |
| D-21.3 | GBP: `off` no llama; `dry-run` manda `validateOnly=true`; `apply` solo si cambió el hash | integración | `vitest run test/marketing/gbp-sync.test.ts` | ❌ |
| D-18/D-20 | Reporte: embudo por canal/campaña/sede/moneda; costo por alumno; aislamiento de tenant; roles | integración | `vitest run test/reports/attribution-report.test.ts` | ❌ |
| Gates | ISO-01, CON-04, conteos de tablas | integración (CI) | `vitest run test/tenancy/iso-01-manifiesto.test.ts test/tenancy/con-04-crons-per-tenant.test.ts test/db/tenant-tables.test.ts` | ✅ (se actualizan) |
| D-18 (app) | Util de captura arma `attribution` desde la query/sessionStorage | unit | `cd el-templo-app && pnpm exec vitest run src/utils/__tests__/attribution.test.ts` | ❌ |

### Frecuencia de muestreo
- **Por tarea:** typecheck del proyecto tocado + el test nuevo puntual + lint.
- **Por plan:** `pnpm --dir el-templo-web run generate && node el-templo-web/scripts/verify-seo-output.mjs` (planes web); `npx tsc --noEmit` + `pnpm lint:tenant` (planes API); `pnpm lint` + `pnpm build` (app/admin).
- **Gate de fase:** CI verde en staging (suite completa) + verificación manual post-SSH + `/gsd:verify-work`.

### Huecos de Wave 0 (asignados a planes)

> `wave_0_complete: false` porque estos archivos todavía no existen: los crea la ejecución de cada plan indicado (la fase es secuencial, no hay una wave 0 separada). Cada tarea que los necesita los crea antes de usarlos, así que el muestreo por tarea no queda sin verificación automática.

- [ ] `el-templo-web/scripts/verify-seo-output.mjs` + paso en `ci.yml` web-check → **plan 195-03** (Task 2); los planes 04-06 le agregan chequeos.
- [ ] `el-templo-web/data/web-data.fixture.json` → **plan 195-03** (Task 1).
- [ ] `el-templo-api/test/web-public/` → **plan 195-02**; `test/marketing/` → **plan 195-07** (Task 2), ampliado en 08/09; el mock de `fetch` con `vi.stubGlobal` se define por archivo de test en 195-08/09 (precedente `test/wellhub/webhook-tenant-derivation.test.ts`).
- [ ] `el-templo-app/src/utils/__tests__/attribution.test.ts` → **plan 195-07** (Task 3).

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 404 real, redirects 301/302, X-Robots-Tag noindex, content-type `.well-known` | D-05, D-09/D-26, D-14 | Requiere deploy de nginx por SSH (human gate) | curls del bloque nginx en 195-RESEARCH |
| Banner RGPD bloquea GA/Pixel hasta aceptar | D-22 | Comportamiento runtime en navegador | DevTools › Network en `/es/` antes/después de aceptar |
| Botón "solo web" con backup/rollback | D-11 | Dispatch real de GitHub Actions | Franco dispara en staging |
| CAPI / Insights / GSC / GBP contra APIs reales | D-19..D-21 | Credenciales de Franco | Test event code en Events Manager; logs del job |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
