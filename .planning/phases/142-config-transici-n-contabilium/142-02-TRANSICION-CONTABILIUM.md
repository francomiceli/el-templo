# Transición Contabilium → Administrador (libro de caja)

**Entregable:** MIG-02 (Fase 142 — cierre del milestone v5.2 Módulo Contable)
**Estado:** Regla escrita y lista. La **fecha/estrategia de corte concreta la define Franco al go-live** — esta fase NO la fija.
**Última actualización:** 2026-06-24

> Documento de operaciones, durable, que sobrevive al milestone. Es donde Franco/ops miran al
> go-live. No es un artefacto de proceso GSD (por eso vive en `.docs/`, no en `.planning/`).

---

## a) Corte limpio (regla central)

Desde la **fecha de go-live**, el registro de **ingresos y caja vive SOLO en el Administrador**.
El Administrador pasa a ser el **libro de caja** del negocio.

- **Antes del corte:** los ingresos y la caja viven en **Contabilium / Excel** (el sistema viejo).
  El Administrador NO intenta reconstruir ese historial.
- **Desde el corte (inclusive):** todo ingreso y movimiento de caja se carga **una sola vez** en el
  Administrador (fuente de verdad). Se elimina el triple tipeo (Forms + Contabilium + Admin).

### Sin backfill histórico — las cajas arrancan en su saldo de apertura

El corte es **limpio**: NO se migran las transacciones previas al go-live al saldo firme. En su lugar,
cada caja arranca en su **saldo de apertura** (`opening_balance`), que es el **conteo físico real** del
efectivo/banco al momento del corte.

Esto **ya está implementado en la Fase 138** (D-05/D-06):

- `cash_registers.opening_balance` (entero, default 0) — el conteo físico inicial por caja. Es la
  semilla del saldo; arranca en 0 hasta que se cargue el conteo real (ver sección d).
- `cash_registers.cutoff_date` (date, **por-caja**) — el go-live de esa caja. Las transacciones con
  `transaction_date < cutoff_date` quedan **EXCLUIDAS del saldo firme** (se etiquetan con
  `cash_register_id` para historial, pero no suman al saldo).
- Saldo firme derivado = `opening_balance` + Σ (transacciones **VALIDADAS**, no anuladas, desde
  `cutoff_date`).

Es decir: el mecanismo de corte limpio (excluir lo pre-corte + arrancar en el conteo físico) **ya
existe en el esquema**. MIG-02 solo documenta la regla y deja listo el mecanismo de carga de los
conteos reales (sección d).

---

## b) Qué dato manda durante la convivencia

La regla de **qué dato manda** durante el período en que el Administrador y Contabilium coexisten es
**nítida**:

| Dato                               | Fuente de verdad (desde el corte) | Sistema               |
| ---------------------------------- | --------------------------------- | --------------------- |
| **Ingresos** (cobros, pagos)       | **Administrador**                 | El módulo de caja     |
| **Caja** (efectivo + banco)        | **Administrador**                 | El libro de caja      |
| **Facturación AFIP / electrónica** | **Contabilium**                   | Fuera de scope (v5.2) |

- **Administrador = ingresos + caja.** Es la fuente de verdad de todo lo monetario operativo desde el
  corte: cobros, validación de pagos (PENDIENTE→VALIDADO), movimientos inter-caja, egresos, saldos por
  caja (efectivo×sucursal + central + banco×moneda).
- **Contabilium = solo facturación AFIP/electrónica.** Es el **último escalón** del reemplazo
  progresivo y queda **fuera de scope** de todo el milestone v5.2. Mientras la facturación electrónica
  siga en Contabilium, ese es el único uso vigente del sistema viejo.

**Regla práctica ante una duda "¿qué número uso?":** si es plata operativa (cuánto entró, cuánto hay en
cada caja, qué se gastó), manda el **Administrador**. Si es una factura fiscal AFIP, manda **Contabilium**
(hasta que ese escalón también se reemplace, fuera de v5.2).

---

## c) Estrategia de corte (la define Franco al go-live)

La **fecha y la estrategia de corte concretas las define Franco al go-live**. Esta fase (142) **NO fija
ninguna fecha**.

**Recomendación documentada:** **corte limpio único** — todas las sucursales el mismo día. Es la opción
más nítida: un solo día divide "antes (Contabilium/Excel)" de "después (Administrador)" para todo el
negocio, sin zonas grises por sucursal.

**Alternativa aceptable:** **corte escalonado** — distintas sucursales cortan en días distintos. El
esquema lo soporta porque `cutoff_date` es una columna **por-caja** (Fase 138): cada caja puede tener su
propia fecha de corte. Es válido, solo menos nítido de comunicar.

Franco elige; el documento solo recomienda el corte único por claridad.

---

## d) Mecanismo de carga de los saldos de apertura

Los saldos de apertura (`opening_balance` por caja) se cargan **UNA sola vez por migración** al go-live,
con los **conteos físicos reales** que pase Franco.

Esto sigue la **regla del proyecto**: los datos de producción se cargan **por migración**, no por
seed re-run ni por una pantalla de edición en la UI. (Por eso la pantalla de edición de aperturas fue
**descartada** explícitamente en 142 — ver D-09: aperturas por migración, no por UI.)

**En la Fase 142 las cajas siguen en 0 / placeholder.** No se cargan valores reales todavía: el corte no
ocurrió. Lo que 142 deja listo es el **template de migración** a completar al go-live.

### Template

Ver: [`opening-balance-migration-template.sql`](./opening-balance-migration-template.sql)

Es un `.sql` **comentado** que vive **FUERA de `src/db/migrations/`** a propósito: si estuviera dentro,
el runner lo ejecutaría en el próximo deploy con los valores placeholder (`<CONTEO>` / `<YYYY-MM-DD>`) y
pisaría los saldos (hoy en 0) o sembraría una fecha de corte incorrecta. Al go-live se **copia** a
`src/db/migrations/NNNN_load_opening_balances.sql`, se **completa** con los conteos reales + la fecha de
corte de Franco, y se corre con `db:migrate`. Una `UPDATE` por caja (la `cutoff_date` es por-caja, así
que puede diferir si Franco hace un corte escalonado).

---

## Referencias

- **Fase 138** (`.planning/phases/138-entidad-caja-saldos/138-01-SUMMARY.md`) — `cash_registers`,
  `opening_balance`, `cutoff_date` por-caja, corte limpio sin backfill (D-05/D-06).
- **Esquema:** `el-templo-api/src/db/schema/cash-registers.ts` — columnas `opening_balance` /
  `cutoff_date` que el template apunta.
- **Brief:** `BRIEF-MODULO-CONTABLE-FRANCO.md` §6 / §6-bis — reemplazo progresivo de Contabilium
  (ingresos/caja primero; AFIP último, fuera de scope).
- **Contexto de la fase:** `.planning/phases/142-config-transici-n-contabilium/142-CONTEXT.md` —
  D-07 (contenido), D-08 (fecha la define Franco), D-09 (aperturas por migración).
