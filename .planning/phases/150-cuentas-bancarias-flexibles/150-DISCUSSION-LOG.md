# Phase 150: Cuentas bancarias flexibles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 150-Cuentas bancarias flexibles
**Areas discussed:** Modelo de datos de la cuenta, Cierre y ciclo de vida, Retiro del dueño, Superficie UI del ABM

---

## Modelo de datos de la cuenta

| Option                              | Description                                                                                         | Selected |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| Extender cash_registers             | 6 columnas nullable en la tabla existente; la caja ES la cuenta; sin joins ni migración de relación | ✓        |
| Tabla satélite 1:1                  | bank_account_details con FK; separa conceptos pero agrega join y entidad                            |          |
| Entidad bank_accounts independiente | Rompe la identidad caja=cuenta ya cableada en v5.2/v5.3                                             |          |

**User's choice:** Extender cash_registers (recomendada)

| Option                              | Description                                                   | Selected |
| ----------------------------------- | ------------------------------------------------------------- | -------- |
| Banco + Titular + Alias             | Alias como identificador operativo obligatorio                |          |
| Banco + Titular + (CBU/CVU o Alias) | Al menos un identificador transferible, cualquiera de los dos | ✓        |
| Solo Banco + Alias                  | Mínimo absoluto                                               |          |

**User's choice:** Banco + Titular + (CBU/CVU o Alias) — el usuario eligió la opción más flexible, NO la recomendada

| Option                          | Description                                                           | Selected |
| ------------------------------- | --------------------------------------------------------------------- | -------- |
| Nombre derivado: Banco + Alias  | Autogenerado, un campo menos; fallback sin alias a criterio de Claude | ✓        |
| Campo Nombre explícito editable | Más control, un campo más                                             |          |

**User's choice:** Derivado (recomendada)

| Option                             | Description                                  | Selected |
| ---------------------------------- | -------------------------------------------- | -------- |
| Selector de moneda con default ARS | ARS/EUR (ya soportadas), ARS preseleccionado | ✓        |
| Siempre ARS                        | Más simple, menos flexible                   |          |

**User's choice:** Selector con default ARS (recomendada)

---

## Cierre y ciclo de vida

| Option                             | Description                                                               | Selected |
| ---------------------------------- | ------------------------------------------------------------------------- | -------- |
| Warning pero permitir              | Avisa saldo ≠ 0 y deja cerrar; mov inter-caja existente para vaciar antes | ✓        |
| Exigir saldo 0                     | Bloquea el caso "cerré la cuenta en el banco y ya fue"                    |          |
| Transferencia automática al cerrar | Esconde un movimiento contable tras el cierre                             |          |

**User's choice:** Warning pero permitir (recomendada)

| Option                | Description                                          | Selected |
| --------------------- | ---------------------------------------------------- | -------- |
| Sí, reactivable       | Toggle is_active, listado muestra cerradas atenuadas | ✓        |
| No, cierre definitivo | Duplicaría cuentas y partiría historial              |          |

**User's choice:** Reactivable (recomendada)

| Option                     | Description                                                 | Selected |
| -------------------------- | ----------------------------------------------------------- | -------- |
| Banco: crear+editar+cerrar | Incluye editar campos de Galicia/MP; efectivo fuera del ABM | ✓        |
| Banco: solo crear+cerrar   | Seeds quedarían sin CUIT/CBU para siempre                   |          |
| Todas las cajas            | Scope creep hacia sucursales                                |          |

**User's choice:** Crear+editar+cerrar (recomendada)

---

## Retiro del dueño

| Option                           | Description                                                        | Selected |
| -------------------------------- | ------------------------------------------------------------------ | -------- |
| Centro de costo "Retiros"        | Egreso común con centro seedeado en esta fase; reusa todo el motor | ✓        |
| Subtipo propio en la transacción | Nuevo kind/flag; más cirugía, mismo resultado                      |          |

**User's choice:** Centro de costo "Retiros" (recomendada — respondido por texto: "vamos con todas las recomendadas")

| Option                               | Description                                                 | Selected |
| ------------------------------------ | ----------------------------------------------------------- | -------- |
| Acción "Registrar retiro" prellenada | Dialog de egreso con centro fijado y cuenta preseleccionada | ✓        |
| Solo el egreso común                 | La opción queda enterrada en el desplegable                 |          |

**User's choice:** Acción propia prellenada (recomendada — por texto)

---

## Superficie UI del ABM

| Option                    | Description                                                         | Selected |
| ------------------------- | ------------------------------------------------------------------- | -------- |
| Dentro de CajaPage        | Tab/sección "Cuentas"; las cuentas ya viven conceptualmente en Caja | ✓        |
| Página propia en Finanzas | Más visible, una entrada más de nav                                 |          |

**User's choice:** Dentro de CajaPage (recomendada — por texto)

---

## Claude's Discretion

- Fallback del nombre derivado cuando no hay alias.
- Estrictez de validación de formato CBU/CVU/CUIT (orientar a liviana).
- País del seed "Retiros" (seguir patrón fase 147, AR).
- Naming/orden del tab "Cuentas" (la 152 reordena tabs después).
- Ubicación exacta del botón "Registrar retiro".

## Deferred Ideas

- Default "Pago a proveedores" + ABM de centros de costo → fase 152 (CAJA-05).
- Asociación cuenta↔cobro + creación rápida inline → fase 151 (COBRO-04).
- Reordenamiento de tabs de Caja → fase 152 (CAJA-01).
