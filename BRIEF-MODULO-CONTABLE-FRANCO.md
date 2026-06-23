# Módulo Contable en el Administrador — Documento de trabajo para Franco

> **Estado:** borrador de trabajo (consolidado de conversación previa que se trabó).
> **Objetivo de este `.md`:** ordenar el diagnóstico y la solución para que salga el brief final que recibe Franco.
> **Alcance:** SOLO el rediseño del registro de pagos / caja en el Administrador. La reestructuración financiera en Google Sheets (plan de cuentas, márgenes por sucursal, tarjeta de crédito, proyección) es **otro documento** y queda fuera de acá.

---

## ✅ Estado de la sesión (handoff — 2026-06-23, actualizado)

**Persona activa:** CFO / responsable de finanzas y ops, sharp (ver punto 0). Al retomar, seguir con ese rol.

**👉 PRÓXIMO PASO: arrancar GSD (nuevo milestone).** Brief consolidado, sin pendientes bloqueantes. Este `.md` es el input del milestone.

**Decisiones ya cerradas con Franco:**

- Carga única en Administrador = fuente de verdad; elimina triple tipeo (Forms/Excel + Contabilium + Administrador).
- Activar membresía ≠ validar pago. Membresía se activa al instante; pago entra PENDIENTE.
- Dos roles de carga manual: profe (entra PENDIENTE) y admin (entra VALIDADO). **Sin carga automática / gateway.**
- Contabilium: reemplazo **progresivo**; facturación electrónica = lo último.
- Refunds: estado **ANULADO con rastro** (nunca borrar), solo admin; popup decide membresía 1-a-1 (default queda activa).
- Caja: **no hay cierre diario**; reconciliación física = el momento del **retiro/movimiento** (sin día fijo).
- **Caja física (efectivo) vs. electrónico:** ya separable por código (no requiere diseño nuevo) — ver hallazgo abajo.
- **Pago ≠ membresía:** ya son 2 entidades en el código — ver hallazgo abajo.
- **Modelo de cajas:** caja = entidad de primera clase (efectivo/banco). Dos operaciones nuevas: **movimiento inter-caja** y **egreso/retiro**. Ver sección 6-bis.
- **Alcance ampliado (aceptado por Franco):** de "registro de ingresos" a **libro de caja completo** (ingresos + movimientos entre cajas + egresos).

### 🔎 Hallazgo clave: gran parte del modelo YA EXISTE (v4.8, fases 105-112)

Existe un modelo financiero transaccional en `el-templo-api/src/modules/finance/`:

- `financial_transactions` — el dinero. Campos `paymentMethod` (enum: cash/transfer/card/aura_credit/internal), `branchId` (NOT NULL), `recordedBy`, soft-void (`voidedAt`/`voidedBy`/`voidReason`).
- `subscriptions` — la membresía.
- `transaction_links` — pivote M:N (targetKind: subscription/debt_balance/transaction/enrollment).
- `balances` — cache de deudas por miembro.

**Implicancias que cierran las 2 preguntas abiertas:**

1. **Efectivo vs. electrónico por sucursal:** ya es un dato de primera clase (`paymentMethod` + `branchId`). Separar caja física de electrónica es un filtro, **no requiere schema nuevo**.
2. **¿Pago = membresía?** NO. Ya son 2 entidades distintas unidas por `transaction_links`. Un pago puede no ligar a ninguna suscripción (cobro suelto ya soportado a nivel modelo vía `debt_balance`/`adjustment`).

**Lo que realmente FALTA construir (el verdadero scope del milestone):**

- **Máquina de estados de validación** (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO). Hoy solo existe ANULADO (soft-void); toda transacción nace firme. Esta es la pieza central del brief y NO existe.
- **Entidad `caja` + movimientos inter-caja + egresos** (sección 6-bis). No existe entidad caja con saldo ni operación de retiro/movimiento.
- **UI de cobro suelto** (el modelo lo aguanta, falta la pantalla).

---

## 0. Cómo trabajo este documento (persona)

Actúo como **CFO / responsable de finanzas y operaciones** de El Templo, con criterio de diseño de sistemas administrativos. Reglas de comportamiento:

- **Sharp.** Cuestiono supuestos, marco puntos ciegos, y digo cuando algo está mal planteado. No repito como loro lo que se decide.
- **Separo conceptos que se suelen mezclar:** activar membresía ≠ validar pago; caja (flujo) ≠ resultado; carga ≠ control.
- **Una transacción = una fuente de verdad.** Todo lo que sea doble tipeo lo trato como defecto, no como proceso.
- **Trazabilidad primero:** quién carga, quién valida, qué se editó y cuándo.
- **Defaults simples + perillas:** un comportamiento por defecto claro, y reglas que se prenden cuando hacen falta. Nada cableado que después no se pueda mover.

> ⚠️ No soy contador matriculado. El encuadre impositivo / fiscal (AFIP-ARCA, facturación electrónica que hoy resuelve Contabilium) hay que validarlo con el contador antes de matar Contabilium. Ver punto 6.

---

## 1. Diagnóstico — cómo funciona HOY

Circuito actual del registro de un pago:

```
┌──────────┐   ┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
│ PROFESOR │──▶│ Google Forms /  │──▶│  Excel               │   │                     │
│ cobra    │   │ carga el pago   │   │ (fórmulas, separa    │   │                     │
└──────────┘   └─────────────────┘   │  por sucursal,       │   │                     │
                                      │  arma esquemas)      │   │                     │
                                      └──────────┬───────────┘   │                     │
                                                 │               │                     │
                                                 ▼               │                     │
                                      ┌──────────────────────┐   │                     │
                                      │ ADMINISTRATIVA        │   │                     │
                                      │ ve el pago y lo       │   │                     │
                                      │ vuelve a tipear en…   │   │                     │
                                      └──────────┬───────────┘   │                     │
                          ┌──────────────────────┴──────────────────────┐
                          ▼                                              ▼
              ┌──────────────────────┐                     ┌─────────────────────────┐
              │ CONTABILIUM          │                     │ ADMINISTRADOR (nuestro) │
              │ (sistema contable)   │                     │ da de alta la membresía │
              │ = dinero que entra   │                     │ del socio               │
              └──────────────────────┘                     └─────────────────────────┘
```

### El mismo pago se tipea TRES veces

1. **Forms/Excel** (lo carga el profe)
2. **Contabilium** (lo retipea la admin)
3. **Administrador** (lo retipea la admin, para activar la membresía)

### Problemas de fondo (no es solo "ineficiencia")

1. **No hay única fuente de verdad.** Tres registros del mismo pago que pueden no coincidir. El día que Contabilium dice una cosa y el Administrador otra, nadie sabe cuál está bien → **la información financiera no es confiable de raíz.**
2. **Cada re-tipeo es un punto de error nuevo.** El profe se equivoca una vez; la admin arrastra ese error y suma el suyo. Pasás de 1 error posible a 3.
3. **No hay trazabilidad.** Si un número está mal, no sabés quién lo cargó ni cuándo. La admin "controla" a ciegas.
4. **No todos los pagos entran por el profesor.** Por ejemplo, **las transferencias hoy las cargan directamente las administrativas** (el aviso del pago les llega a ellas). El módulo tiene que contemplar las dos vías de carga manual (profe y admin), no solo la del profe.

---

## 2. Objetivo — cómo tiene que funcionar

**Carga única en el Administrador como fuente de verdad.** El Administrador actualiza, en un solo acto, la **membresía** del socio y la **caja** (lo monetario). Se elimina el doble/triple tipeo.

Todo pago se carga **manualmente**. Hay dos roles que cargan:

```
Carga manual
  ├─ Profesor       → pago entra PENDIENTE de validación
  └─ Administrativa → pago entra YA VALIDADO (ella es el control, no se valida a sí misma)
```

> ❌ **Fuera de alcance:** carga automática vía integración con el medio de pago (gateway de tarjeta online / débito automático). No hay puerta automática. Todo entra por carga manual de una persona. El medio de pago (efectivo, transferencia, tarjeta, MercadoPago) se registra como **un dato del pago**, no como una integración que crea el pago sola.

### Principio clave: separar ACTIVAR de VALIDAR

- **La membresía se activa al instante.** El socio nunca se traba por un trámite administrativo: paga y entrena ya.
- **El pago queda "pendiente de validación".** No entra a la caja como confirmado hasta que la admin lo revisa.
- El trabajo de la admin deja de ser "tipear de nuevo" y pasa a ser **control**: valida, y si el profe se equivocó en monto o socio, corrige. La membresía ya estaba activa; solo se ajusta el dato.

### Por qué activar al instante es seguro

El riesgo (que alguien active sin pago real) es chico y manejable porque:

- Cada carga queda **firmada** por quien la hizo (trazabilidad).
- El pendiente **envejece a la vista**: no expira en un cierre diario (no existe — ver punto 7), pero figura en una lista de pendientes ordenada por antigüedad y **se alerta** cuando pasa de cierto tiempo. Y al hacer un **retiro** se reconcilia todo (punto 7).
- El staff es conocido (gimnasio, no e-commerce anónimo).

---

## 3. Máquina de estados del pago

```
                          ┌──────────────────────────────────────┐
                          │                                      │
   [carga profe]          ▼                                      │
        │          ┌─────────────┐   validar OK    ┌───────────┐ │
        └─────────▶│  PENDIENTE  │────────────────▶│ VALIDADO  │ │
                   └──────┬──────┘                 └─────┬─────┘ │
                          │                          ▲   │       │
                          │ admin marca error        │   │ anular (admin)
                          ▼                          │   ▼       │
                   ┌─────────────┐  profe/admin  ┌───┴─────┐ ┌──────────┐
                   │  OBSERVADO  │────corrige───▶│CORREGIDO│ │ ANULADO  │
                   └─────────────┘               └─────────┘ └──────────┘
                                                                  ▲
   [carga admin]  ───────────────────────────▶ VALIDADO ─────────┘
```

Estados:

- **PENDIENTE** — cargado por profe, esperando control de admin. Membresía YA activa; caja en pendiente (no confirmada).
- **OBSERVADO** — la admin detectó un error (monto, socio, medio de pago).
- **CORREGIDO** — se ajustó el dato observado; vuelve a quedar listo para validar.
- **VALIDADO** — confirmado. Entra a la caja como dinero firme. La carga de admin nace directamente acá.
- **ANULADO** — pago reversado **con rastro** (no se borra: queda el registro tachado + motivo + quién/cuándo). Resta de la caja. Se puede anular desde PENDIENTE o VALIDADO.

### Regla de anulación (refund / pago duplicado / socio equivocado / pagó de más)

- **Nunca se borra.** Se anula dejando rastro: motivo, autor, fecha. (Decisión 2a)
- **La membresía NO se cae automáticamente.** Al anular, salta un **popup** que avisa "este pago tenía una membresía activa asociada" y la admin **decide 1-a-1**: cancelarla o dejarla activa. Default: queda activa. (Decisión 2b)
  - Caso "pagó de más" → se anula/ajusta el pago pero la membresía sigue.
  - Caso "pidió devolución / se arrepintió" → la admin probablemente cancele la membresía.
- Solo la **administrativa** puede anular. El profe no.

---

## 4. Roles y permisos

| Rol            | Puede cargar | Estado en que entra | Puede validar |      Puede corregir       |    Puede anular     |
| -------------- | :----------: | :-----------------: | :-----------: | :-----------------------: | :-----------------: |
| Profesor       |      Sí      |      PENDIENTE      |      No       | Su propia carga observada |         No          |
| Administrativa |      Sí      |      VALIDADO       |      Sí       |            Sí             | **Sí** (con motivo) |

Caso real que motiva el rol admin: **las transferencias hoy las cargan directamente las administrativas** (el aviso del pago les llega a ellas). Mismo flujo que el profe, solo que entra ya validado.

---

## 5. Configurabilidad (perillas) — "maleable bien hecho"

Default simple + reglas que se prenden cuando hacen falta:

1. **Política de validación**
   - Default arranque: **validar TODOS** los pagos de profe.
   - A futuro (cuando le tengan confianza al sistema): **validar solo los "dudosos"** — montos fuera de rango, socio nuevo, efectivo alto, etc.
2. **Política de activación de membresía**
   - Default: **instantánea**.
   - Excepción configurable: exigir validación previa para casos puntuales (ej.: **primer pago de socio nuevo**).

> Estas perillas deben ser **configuración**, no estar cableadas en el código.

---

## 6. Qué pasa con Contabilium

Decisión tomada (Franco): **reemplazo progresivo, no de golpe.** Vamos recreando funciones de Contabilium dentro del Administrador hasta poder apagarlo por completo. Mientras tanto **conviven**.

Orden de reemplazo (primero lo simple, último lo regulado):

1. **Registro de ingresos / caja** ← lo que arranca este módulo. Primera función que pasa al Administrador.
2. Reportes que hoy se sacan de Contabilium (a definir cuáles).
3. Egresos / proveedores (si Contabilium los maneja).
4. **Facturación electrónica AFIP/ARCA → lo último.** Es la pieza regulada y la más compleja; se resuelve al final del camino, recién cuando todo lo demás ya vive en el Administrador.

> Implicancia para este módulo: **no asumir que el pago genera comprobante fiscal todavía.** Por ahora el Administrador registra el ingreso en caja; la factura sigue saliendo por Contabilium hasta la etapa 4. El diseño tiene que dejar lugar a colgar la facturación después (ej.: marcar si un pago ya fue facturado / por qué vía), sin construirla ahora.

---

## 6-bis. Cajas, movimientos y egresos — modelo definitivo

**No existe cierre de caja diario.** Las administrativas no están en todos los locales, así que no hay un corte físico cada día. La caja de cada sucursal **acumula** día a día; el **control cotidiano** ES la validación (chequear que los montos tengan sentido, sección 3-4), no contar plata. El **punto de reconciliación física** es el momento del **movimiento/retiro** (sin día fijo): ahí se corrobora plata física vs. registrado.

### Caja = entidad de primera clase (modelo elegido: "caja" propia, NO sucursal virtual)

La caja **no mapea 1:1 con sucursal**, así que se modela como entidad propia con saldo. Tipos: **efectivo** y **banco**.

| Caja                                | Cantidad              | Notas                                              |
| ----------------------------------- | --------------------- | -------------------------------------------------- |
| Efectivo por sucursal (Jujuy, etc.) | una por sucursal      | donde el profe/admin cobra cash                    |
| Efectivo central                    | una                   | donde se junta lo retirado de las sucursales       |
| Banco                               | **una sola (global)** | donde caen transfer + tarjeta (no es una sucursal) |

### Dos operaciones distintas (NO confundir)

El criterio que las separa es uno: **¿el destino es otra caja del sistema, o el mundo exterior?**

|                     | **Movimiento entre cajas**                         | **Egreso / Retiro**             |
| ------------------- | -------------------------------------------------- | ------------------------------- |
| Qué es              | Jujuy → Central (transferencia interna)            | Plata que **sale del negocio**  |
| Plata en el sistema | Sigue adentro, cambia de caja                      | Se va (proveedor, dueño, gasto) |
| Asiento             | **Doble entrada**: debita origen, acredita destino | Solo debita origen              |
| Neto sistema        | **Cero**                                           | **Negativo**                    |
| Aplica a            | Efectivo (y depósito efectivo→banco)               | Efectivo o banco                |

- Depósito de efectivo al banco = **movimiento** (caja efectivo → caja banco), no egreso. El egreso es cuando la plata sale del banco/caja a algo que no es caja propia.
- **Egreso sin categoría por ahora** (decisión Franco): se registra salida + caja origen + monto + **nota libre**. Categorización (proveedor/dueño/gasto/depósito) = fase posterior.

### Lo que el módulo necesita modelar

1. **Saldo por caja** = entradas validadas + movimientos entrantes − movimientos salientes − egresos. Los pagos PENDIENTES **no** suman al saldo firme (se muestran aparte).
2. **Operación de MOVIMIENTO inter-caja**: origen, destino, monto, quién, cuándo, y saldo esperado vs. contado en el origen (para registrar diferencias físicas).
3. **Operación de EGRESO**: caja origen, monto, quién, cuándo, nota libre.
4. **Lista de pendientes por antigüedad** (no hay deadline diario, pero un pendiente viejo es señal). Alerta configurable.

> Implicancia de diseño: el Administrador pasa a ser el **libro de caja** (lo que hoy es el Excel). El movimiento/egreso es el evento de auditoría, no un cierre de jornada. Encaja con el reemplazo progresivo de Contabilium (punto 6): registro de ingresos + caja = **primera** función que migra.

---

## 7. Pendientes a cerrar antes del brief final

- [x] **Rol de Contabilium** → reemplazo progresivo, facturación electrónica al final. Ver punto 6.
- [x] **Carga automática del medio de pago** → **fuera de alcance.** Todo es carga manual.
- [x] **Refunds / anulaciones** → estado ANULADO con rastro, solo admin, popup decide membresía 1-a-1. Ver punto 3.
- [x] **"Cierre" de caja** → no hay cierre diario; la reconciliación es el **movimiento/retiro**. Ver punto 6-bis.
- [x] **Caja física vs. electrónico** → ya separable en código (`paymentMethod` + `branchId`). Ver hallazgo en handoff.
- [x] **Relación pago ↔ membresía** → ya son 2 entidades (`transaction_links`). Cobro suelto soportado a nivel modelo. Ver hallazgo.
- [x] **Modelo de cajas** → caja = entidad propia (efectivo/banco); banco = una sola; movimiento inter-caja + egreso. Ver 6-bis.
- [x] **Egreso con/sin categoría** → sin categoría por ahora, salida + nota libre. Categorización = fase posterior.
- [ ] **Medios de pago en carga manual:** ya existen cash/transfer/card/aura_credit/internal. ¿Sumar MercadoPago? Definir reglas de "dudoso".
- [ ] **Antigüedad del pendiente:** ¿a partir de cuántos días un PENDIENTE sin validar pasa a alerta? (perilla) — refinar en GSD.
- [ ] **Reportes para la admin:** vista de pendientes (por antigüedad), observados, saldo por caja, historial de movimientos/egresos — refinar en GSD.
- [ ] **Migración:** ¿qué pasa con lo que ya está en Contabilium / Excel? ¿corte limpio o convivencia temporal? — refinar en GSD.

> Los pendientes restantes NO son bloqueantes del arranque: se refinan dentro del flujo GSD (discuss-phase de cada fase). El milestone puede empezar ya.

---

## 8. Próximo paso

Bloqueantes ya resueltos: Contabilium, carga automática, refunds, modelo de caja/retiros. Con los pendientes restantes del punto 7 cerrados (medios de pago, caja física vs. electrónica, relación pago↔membresía, migración), se arma el **brief final para Franco** con:

- Diagnóstico (Hoy vs. Objetivo) con diagramas.
- Máquina de estados del pago.
- Roles/permisos y perillas de configuración.
- Detalle de qué construir (entidades, estados, automatismos de membresía + caja, trazabilidad).
