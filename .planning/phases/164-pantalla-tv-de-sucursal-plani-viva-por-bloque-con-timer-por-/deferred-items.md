# Fase 164 — Items diferidos (fuera del alcance de los planes)

## De 164-05

**Cuarta copia del calculo de semana SPOM en `spom/service.ts`**

- **Encontrado en:** Task 1 (extraccion DRY de `week-dates.ts`).
- **Que es:** `SpomService.getCurrentWeek()` (`el-templo-api/src/modules/spom/service.ts:11-18`)
  reimplementa el ancla `WEEK_ONE_MONDAY = 2026-02-23` y la aritmetica de semana,
  con un comentario que admite la duplicacion ("same anchor as sessions/routes.ts").
- **Por que NO se toco:** el plan acota `files_modified` y la firma difiere — el
  metodo parte de un `Date` (hora local del proceso) y no de un string
  "YYYY-MM-DD". Reusar `dateToWeekNumber` obliga a elegir como formatear ese
  Date a fecha, y la unica helper del repo (`toDateString`) usa getters UTC, lo
  que CAMBIARIA el resultado para offsets negativos cerca de medianoche. Es un
  cambio de comportamiento potencial en una superficie ajena al TV.
- **Recomendacion:** unificarlo en un plan propio, decidiendo explicitamente en
  que TZ se resuelve "la semana actual" del SPOM (hoy es la del server).
