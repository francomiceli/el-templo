# HANDOFF — Tablero semanal de gerencia (fase 206) — 2026-11-03

## Dónde está

- Worktree: `/home/franco/projects/et-tablero`
- Rama: `feat/tablero-semanal`, base `origin/master` `17aad07d0`
- Estado: **10/10 planes ejecutados, revisión de código hecha y corregida, SIN PUSH**
- Docs de la fase: esta carpeta (CONTEXT con D-01..D-29, PLANs, SUMMARYs, REVIEW)
- Insumos de negocio (checkout principal): `.docs/tablero-semanal-respuestas-fran.md` (respuestas de Nacho) y `.docs/WhatsApp Image 2026-11-03 at 16.08.03.jpeg` (planilla de referencia)

## Qué se construyó

- **API:**
  - Módulo `weekly-board` con `GET /api/admin/weekly-board` y `PUT /api/admin/weekly-board/leads`.
  - Reusa las fuentes existentes con métodos "por sede" en reports, renewals, finance y analytics.
  - Migración **0319**: dos tablas strict, `weekly_board_snapshots` y `weekly_board_leads`.
- **Job `weekly-board-close`:** corre cada hora en el minuto 5, hora AR.
  - Lunes 00:05: congela Caja, Deuda, Alumnos y "Vencen la semana que viene".
  - Viernes 00:05: congela Renovaciones y Embudo, con el margen de 4 días.
- **Admin:**
  - `/tablero`: una tabla por país, Total solo AR, Semana anterior, ▲▼, "Sin contactar" en rojo y leads editables en la celda.
  - Categoría "Gerencia" al tope del menú.
  - owner y admin entran directo al Tablero.
- **Gates en verde:**
  - API `tsc` y `lint:tenant`.
  - `vue-tsc` con 26 errores, la misma base previa (no hay errores nuevos).
- **Tests de integración:** escritos pero **NUNCA CORRIDOS**, porque corren en CI.

## Próximos pasos (en orden)

1. **OK de Franco para push a staging.** El push dispara CI, que corre los tests por primera vez. Si algo falla, se arregla con commit nuevo.
2. **Confirmar las decisiones tomadas por default:**
   - D-03: owner y admin entran a `/tablero`; gestion sigue en `/cobros` y admin_sede en Caja.
   - D-10: el Embudo también se congela el viernes, igual que Renovaciones.
   - D-24: los leads no van en la foto; se editan en la semana en curso y en la anterior.
   - D-25: la columna "Online" es informativa y no suma al Total.
   - D-27: un admin o gestion de AR no ve Barcelona; el owner ve todo.
   - D-28: la categoría del menú es "Gerencia".
3. **UAT con gerencia:** checklist de 7 pasos en `206-10-SUMMARY.md`. Incluye comparar una sede contra Sesiones de prueba, Renovaciones y Caja.
4. **Merge con `feat/oficina` (fase 205), si entra antes o después:**
   - SUMAR los deltas de conteos de tenancy, no elegir uno: gym-owned, ISO-01 (542 + 2 + N) y CON-04, que queda en 13 jobs.
   - Conservar las entradas de las dos ramas en `NAV_MODEL`, `routes.ts`, `app.ts` e `index.ts`.
5. **Después del deploy:** borrar el worktree `et-tablero`. Usa node_modules prestados de `et-199-mi-templo` (raíz y API) y de `et-201-conquer` (admin): no borrar esos dos antes.

## Hallazgo lateral (no arreglado, decidir si va hotfix)

- `getMondayInTz` (admin `utils/tz.ts`) salta los domingos al lunes siguiente a propósito, porque Horarios usa semanas de lunes a sábado.
- `getWeekRange(0)` de Renovaciones y Sesiones de prueba la reusa. Por eso, **los domingos su "Esta semana" muestra la semana que viene**.
- El Tablero lo evita con su propio `weekOptions`.

## Trucos de entorno

- vue-tsc: `node /home/franco/projects/el-templo-test-gsd/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json` (desde `el-templo-admin/`)
- La consulta de renovación tardía (prod, n=1812) ya está resuelta y no hay que rehacerla. La regla es `LEAST(start_date, created_at local)`.
