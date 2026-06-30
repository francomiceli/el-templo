# Handoff — Tren a master (v5.2 + v5.3 + 144 + 148)

**Fecha:** 2026-06-26
**Branch:** `staging` — tip `6aecea95` — **todo pusheado a `origin/staging`** (0 commits locales pendientes).
**Prod (master):** NADA de este tren todavía. Master sigue como estaba.

---

## TL;DR — dónde estamos

Todo el trabajo está en **staging** (ambiente de pruebas), funcionando y con CI. El próximo paso grande es **decidir el merge a master = deploy a producción**. Antes de ese salto hay decisiones que tomar (sobre todo el **build de la app a las tiendas**) y UAT visuales que cerrar.

**El tren es historia lineal:** no se puede mandar 148 solo. El merge `staging → master` arrastra TODO junto:

- **v5.2** (fases 137-142) — Módulo Contable (caja, validación, egresos)
- **v5.3** (fases 145-147) — Mejoras Caja (aviso deuda, multibanco, centros de costo)
- **144** — Notificaciones + bloqueo de vencimiento de membresía
- **148** — PoS del profe: alta de alumno + plan (ahora pantalla "Pagos")
- - fixes de CI, rename, ajustes UX, rollout gating, cambios de reservas (esta sesión)

**Migraciones que viajan a prod:** `0153`–`0162`. **Todas aditivas** (columnas/tablas/enums/seeds nuevos). Cero `DROP/DELETE/TRUNCATE`. Riesgo de pérdida de datos: **nulo**.

---

## Lo que se hizo esta sesión (sobre staging)

1. **Fase 148 ejecutada** (6/6 planes) + verify **18/18 must-haves, 0 blockers**.
2. **Fixes de 5 tests que tiró el primer CI** (commits `5bc692cf` 148 + `4d829a6d` 144), verificados local con MySQL (14/14 verdes):
   - Idempotencia del `/alta` (cortaba con 409 en vez de 200).
   - Faltaba wirear `BookingService` → plan fixed no generaba bookings.
   - Test de void preexistente mal planteado (lo reescribí).
   - 144: `errorSchema` de scheduling no declaraba `code` → `COVERAGE_EXPIRED` se filtraba.
3. **Rename "Cargar pago" → "Pagos"** (ruta `/cargar` → `/pagos`). OJO: salió en 2 commits (`8fbbf584` movió el archivo, `2e2f8119` aplicó el contenido — un `git add` se abortó en el medio). Quedó consistente.
4. **Coherencia de los 3 modos del PoS** (`049d629f`): toggle reordenado (Pago de plan / Alta + plan / Cobro suelto), "Pago de plan" sin plan deriva a "Alta + plan" (no a "Cobro suelto"), botón "Nuevo alumno" visible (salió del dropdown).
5. **Rollout gating** (`5ff75e74`): **Caja oculta a gestión** (solo admin/owner), **Pagos oculto a profes** (coach) "por el momento". Menú + guard de ruta. Backend sin tocar.
6. **Reservas — etiqueta de cupos** (app de socios, `4be7f90a`→`0ab080ab`→`6aecea95`):
   - 5+ cupos: "Cupos disponibles" (verde, sin número)
   - 2-4: "Quedan N cupos!" (amarilla)
   - 1: "Queda 1 cupo!" (naranja)
   - 0: "Completo" (roja)

---

## ⚠️ DECISIONES A TOMAR (en orden)

### Decisión 1 — Build de la app a las tiendas: ¿ahora o desacoplar?

**La más importante.** El backend va a prod con el merge, pero **la app de socios solo cambia con un build nuevo a las tiendas**. De todo el tren, lo único que toca la app de socios es:

- **Fase 144**: pop-up in-app de vencimiento, diálogo de "plan vencido" al reservar, push de vencimiento.
- **Reservas**: las etiquetas de cupos nuevas (esta sesión).

Si mergeás a master SIN buildear la app:

- El **bloqueo de reserva de vencidos funciona igual**, pero la app vieja muestra un **error genérico** en vez del diálogo lindo de renovación (no entiende `COVERAGE_EXPIRED`).
- Empiezan a **llegar los push de vencimiento** a todos.
- Los cambios de cupos **no se ven** hasta el build.

**Opciones:**

- **(A)** Buildear la app a tiendas junto con el merge a master (sale todo coherente). ← _recomendado si querés la 144 completa_
- **(B)** Mergear a master ahora y buildear la app después (acepta UX degradada temporal para vencidos).
- **(C)** Desacoplar la 144 (dejar el bloqueo de reserva detrás de algo más suave) y mandar el resto a prod sin depender del build.

> Nota: el resto del tren (contable v5.2 / caja v5.3 / Pagos 148) es **admin-only** — no necesita app nueva en absoluto.

### Decisión 2 — ¿Cerrar UAT visuales antes de master?

Pendientes en staging (recomendado verificar antes del merge):

- **148** (PoS Pagos): `.planning/phases/148-.../148-HUMAN-UAT.md` — 3 ítems (alta+plan, dedup DNI, dialog Anular cascade).
- **144** (vencimientos): `.planning/phases/144-.../144-HUMAN-UAT.md` — 4 ítems (push, pop-up, bloqueo reserva).
- **v5.2 Módulo Contable**: 3 UAT (PoS `/pagos` 140, hub `/caja` 141, config 142).
- **Reservas cupos** (esta sesión): verificar visual en staging web.

### Decisión 3 — ¿Mergear a master? (el salto a prod)

Cuando 1 y 2 estén resueltas: **pedir OK explícito** y hacer `staging → master`. Dispara deploy a prod + migraciones 0153-0162. **Workflow estricto:** nunca mergear sin OK; master = prod.

---

## Decisiones de producto menores (anotadas, opcionales — 1 línea c/u)

- **Reservas clases chicas:** una clase con capacidad ≤4 siempre cae en amarillo/naranja aunque esté vacía (ej. cap 4 vacía → "Quedan 4 cupos!"). ¿Ajustar (ej. umbral = min(5, mitad de capacidad))? Constante `FEW_THRESHOLD` en `ReservasPage.vue`.
- **148-05 monto parcial:** muestra la **deuda restante** (precio − pagado), no lo pagado. ¿Confirmar copy o cambiar?
- **Pagos para profes:** oculto "por el momento". ¿Cuándo habilitar coach? (revertir: sumar `'coach'` en `isPagosVisible` del `AdminLayout.vue` + meta de `/pagos` en `routes.ts`).
- **Caja para gestión:** oculta. ¿Definitivo o temporal?
- **Hardening `assignPlanSchema`** (additionalProperties): **decidido NO hacer** — riesgo bajo (admin-gated). Queda como deuda técnica anotada.

---

## Feature nueva mencionada (NO empezada)

- **QR de asistencia de profes (fichaje de staff):** NO existe. El QR actual es solo para check-in de socios a clase. Si se quiere, hay que diseñarla y construirla desde cero. ¿Avanzar?

---

## Para retomar rápido

- **Branch:** `staging` @ `6aecea95`. Verificar que el **CI del último push esté verde** (no tengo `gh` en la sesión; mirar Actions).
- **DB de test local:** disponible (root + password en `el-templo-api/.env`). Para debuggear un test puntual: `DB_PASSWORD=... npx vitest run <archivo>`. NO correr el suite entero (corre en CI).
- **Restricción dura:** migraciones numeradas linealmente (0153-0162); el tren va completo a master, no por partes.
- **Untracked ajenos a ignorar:** `session-data-transformer.ts` (WIP viejo), migraciones `0101/0102` — NO son de este trabajo, no commitear.
