---
phase: 209-egresos
plan: 17
subsystem: finance
tags: [egresos, cierre, no-regresion, inventario, uat, identidades-del-resumen]
requires: [209-01, 209-02, 209-03, 209-04, 209-05, 209-06, 209-07, 209-08, 209-09, 209-10, 209-11, 209-12, 209-13, 209-14, 209-15, 209-16]
provides:
  - test de punta a punta de las identidades del Resumen y los casos del pedido (egresos-identidades.test.ts)
  - inventario con greps reproducibles, corridas de no-regresion y gates finales
  - checklist de prueba manual para Franco
affects: [211, 212]
key-files:
  created:
    - el-templo-api/test/finance/egresos-identidades.test.ts
  modified:
    - el-templo-admin/src/components/caja/MovEgresosTab.vue
    - el-templo-admin/src/config/templo-config.ts
decisions:
  - Cierre sin cambios de codigo de la fase: el inventario no encontro nada que obligue a un fix
  - El hallazgo de Historial de cobros (ver pendientes) se documenta y no se toca
metrics:
  tasks: 3
  completed: 2026-11-13
---

# Fase 209 Plan 17: Cierre de Egresos (resumen para Franco)

Cierre de la fase 209. Se verificó de punta a punta que el Resumen cierra (los números por sede suman el total, el costo es lo pagado más lo pendiente, el Excel y el detalle dicen lo mismo que la pantalla), que los casos del pedido dan las cuentas esperadas y que nada de lo que ya existía en Caja y cobros cambió. No hubo que arreglar ningún error de la fase en este plan.

## 1. Qué quedó construido

**Menú de Finanzas.** Aparece "Egresos" entre Cobros y Reportes. Lo ven owner, admin y gestión. Admin de sede, recepción y profes no lo ven, y si escriben `/egresos` en la URL los manda de vuelta.

**Egresos, pestaña Gastos.**
- Alta y edición de un gasto: concepto, beneficiario, rubro, mes de imputación, importe entero, moneda (pesos, dólares o euros), importe estimado o confirmado, tipo de cambio de referencia para dólares, links de comprobante y observaciones.
- Reparto del gasto: directo a una sede o a Casa Matriz, en partes iguales entre las sedes de Argentina (el resto de la división va a la última sede, y la pantalla dice cuál es), o por montos (muestra Falta o Sobra y no deja guardar si no suma exacto).
- Listado con filtros por mes, destino, rubro, estado y texto, y opción de ver los anulados.
- Detalle del gasto: reparto, pagos, links, y el historial de cambios con antes y después, quién y cuándo. Cambiar el importe, el estado o el tipo de cambio pide un motivo.

**Egresos, pestaña Por pagar.** Los gastos con plata pendiente, con el total pendiente por moneda, y el botón Registrar pago.

**Pagos de un gasto.** Uno o varios, parciales y desde distintas cuentas (bancos, Caja central, cajas de efectivo). Cada pago baja el saldo de su cuenta y aparece en Caja → Movimientos de caja como egreso con su rubro, nunca como retiro. Valida la fecha (ni futura ni anterior al inicio de la cuenta), el medio de pago contra el tipo de cuenta, el tope de efectivo en caja y el pago de más. Si la cuenta está en otra moneda pide el tipo de cambio y muestra cuánto cancela antes de confirmar. Se puede pagar por débito automático desde un banco. Doble clic no duplica nada. Anular un pago (owner y admin) devuelve el saldo a la cuenta y deja el gasto otra vez en Parcial o Pendiente.

**Anular un gasto** (owner y admin): solo si no tiene pagos vigentes; queda tachado y sale de Por pagar y del Resumen.

**Egresos, pestaña Resumen.** Un mes a la vez, con flechas para cambiar de mes. Una columna por sede, una por Casa Matriz (solo Argentina) y el Total al final; tres filas: pagado en el mes, costo del mes (con "incluye X estimados") y pendiente. Tocar una columna abre el detalle por rubro y concepto, y tocar un concepto abre el gasto. Avisa cuántos gastos del mes tienen datos incompletos. Botón "Descargar Excel" con las hojas Resumen y Detalle.

**Egresos, pestaña Rubros** (owner y admin). Los rubros se mudaron desde Caja → Cuentas: alta, renombrar, desactivar y reactivar.

**Caja.** El diálogo de registrar movimiento ya no carga egresos: trae el botón "Cargar un gasto en Egresos". Los egresos viejos siguen viéndose en Caja → Movimientos de caja. Si alguien intenta anular desde Caja la salida de un pago de gasto, el sistema responde que se anula desde Egresos, en el detalle del gasto. Los comentarios viejos que hablaban de "egreso" en Caja se corrigieron (commit `072488f8b`).

**Debajo de todo:** tres tablas nuevas (gastos, reparto, pagos) con la migración 0331, plata siempre en enteros (el tipo de cambio es el único decimal y solo informa), sin cantidades fijas de sedes, y aislamiento entre gimnasios probado ruta por ruta.

## 2. Checklist de prueba manual

Probalo en un ambiente de pruebas, no en producción (la fase todavía no se publicó). Antes de empezar tené a mano: un usuario **owner**, uno de **gestión** y uno de **admin**; un **banco en pesos** con saldo, una **Caja central** con saldo y una **caja de efectivo de una sede**; las sedes de Argentina cargadas. Anotá los saldos de Caja → Saldos antes de empezar, para comparar.

### Menú y permisos

1. Entrá como **owner**. En el menú Finanzas tiene que verse "Egresos" entre Cobros y Reportes. Repetí con **admin** y con **gestión**: lo ven los tres.
2. Entrá como admin de sede, recepción y profe (uno por vez). No ven "Egresos". Escribí `/egresos` en la barra de direcciones: te tiene que mandar de vuelta a otra pantalla.
3. En Egresos como **owner** o **admin** se ven cuatro pestañas: Gastos, Por pagar, Resumen y Rubros. Como **gestión** se ven solo las tres primeras, sin Rubros.
4. Como **owner** o **admin**, en Rubros: creá "Inversores", renombralo, desactivalo y reactivalo. Se tiene que ver cada cambio en la lista. Después andá a Caja → Cuentas: los rubros ya no están ahí.
5. Como **gestión o admin**, en Caja → Movimientos de caja → Registrar: no existe la opción "Egreso" y aparece el botón "Cargar un gasto en Egresos". Al tocarlo se abre Egresos con el formulario de nuevo gasto.

### Cargar gastos

6. **Gasto directo.** En Egresos → Gastos → Nuevo gasto: concepto "Alquiler", rubro cualquiera, importe $77.571, estado Confirmado, reparto Directo a una sede, y un link de Drive en comprobantes. Guardá. En la lista tiene que quedar "Pendiente", con el nombre de esa sede. Probá también pegar un link que no empiece con https: tiene que avisar y no dejar guardar.
7. **Partes iguales.** Nuevo gasto "Contabilium" de $150.000 con reparto "Partes iguales" entre las sedes de Argentina. Cada sede muestra su parte, la suma de todas da $150.000, y un texto avisa cuánto sobra de la división y a qué sede (la última, por nombre) se va el resto.
8. **Por montos.** Cambiá el reparto a "Por montos" y tocá un monto: aparece "Falta $X" o "Sobra $X" y el botón Guardar no deja guardar mientras no sume exacto $150.000. "Completar con lo que falta" arregla la diferencia. Cuando suma, deja guardar.
9. **Casa Matriz.** En el reparto de un gasto de Argentina se puede elegir Casa Matriz como destino. Entrá como owner y cambiá el país a España: Casa Matriz no aparece y el gasto va en euros.
10. **Dólares.** Nuevo gasto en dólares: USD 600, tipo de cambio de referencia 1.560, reparto en partes iguales entre 6 sedes (USD 100 cada una; si hay más o menos de 6 sedes usá "Por montos" y elegí vos 6). Sin tipo de cambio no deja guardar. Después, en Resumen del mes de imputación: cada una de esas sedes suma $156.000 de costo y el Total sube $936.000.

### Pagos

11. **Pago desde dos cuentas.** Abrí el gasto de $150.000 de Contabilium (o creá uno a Casa Matriz). Registrar pago de $90.000 por **transferencia** desde el banco: el gasto pasa a "Parcial" y faltan $60.000. Registrar un segundo pago de $60.000 en **efectivo** desde la Caja central: pasa a "Pagado".
12. **Saldos.** Como owner, en Caja → Saldos: el banco bajó $90.000 y la Caja central bajó $60.000, ni un peso más. En Caja → Movimientos de caja de cada una de esas cuentas, el pago aparece como egreso con el rubro del gasto. En Caja → Retiros **no** aparece ninguno de los dos.
13. **Validaciones del pago.** Probá y confirmá que cada una se rechaza con un mensaje en castellano y no guarda nada: (a) fecha de mañana; (b) efectivo desde un banco; (c) transferencia desde una caja de efectivo; (d) en un gasto **confirmado**, pagar más de lo que falta.
14. **Pagar de más en un gasto estimado.** En un gasto con importe "Estimado", pagar más de lo que falta sí se permite: queda "Pagado de más" y el detalle lo avisa.
15. **Efectivo mayor al de la caja.** Elegí una caja de efectivo con poco saldo (por ejemplo $10.000) e intentá pagar $50.000 en efectivo: tiene que rechazarlo diciendo que la caja no alcanza, y el saldo de la caja no cambia.
16. **Otra moneda.** Con el gasto en dólares del paso 10, registrá un pago desde el banco en pesos: pide el tipo de cambio y, antes de confirmar, muestra cuánto del gasto cancela. Confirmá y mirá el estado y el saldo pendiente.
17. **Débito automático.** Registrá un pago con medio "Débito automático" desde el banco: se guarda. Desde una caja de efectivo no se puede elegir.
18. **Doble clic.** En "Guardar" del gasto y en "Confirmar pago", hacé doble clic rápido: se crea un solo gasto y un solo pago. Si aparece el aviso "ya estaba cargado", también es correcto.
19. **Gestión paga desde un banco que no ve.** Entrá como **gestión**. En Caja → Saldos no aparece ese banco ni ningún saldo de bancos. En Egresos igual lo podés elegir como cuenta de origen al registrar un pago, y el pago se guarda. La pantalla del pago nunca muestra saldos.

### Correcciones y anulaciones

20. **Corregir un gasto.** Editá el importe de un gasto o su estado (Estimado/Confirmado): pide un motivo. El detalle muestra el historial con el valor de antes y de después, quién lo hizo y cuándo. En un gasto confirmado con pagos, bajar el importe por debajo de lo ya pagado no se deja: el mensaje dice que primero hay que anular un pago.
21. **Anular un pago** (owner o admin): en el detalle, "Anular pago" con motivo. El saldo de la cuenta vuelve al de antes, el gasto vuelve a Parcial o a Pendiente, y el pago queda tachado con su motivo.
22. **Gestión no anula.** Como **gestión**, el detalle no muestra "Anular pago" ni "Anular gasto", no existe la pestaña Rubros y Caja → Saldos no muestra saldos de bancos.
23. **Anular desde Caja.** Como owner o admin, andá a Caja → Historial de cobros, buscá la salida de un pago de gasto (es una fila de salida con el rubro del gasto, sin alumno; su tipo puede verse sin traducir como "expense"), menú de la fila → Anular, poné un motivo. Tiene que rechazarlo con "Este movimiento es el pago de un gasto: anulalo desde Egresos, en el detalle del gasto", y el pago y el saldo no se tocan.
24. **Anular un gasto.** Con pagos vigentes, "Anular gasto" no se puede (dice "Primero anulá sus pagos"). Anulá los pagos y después el gasto: queda tachado en la lista con "Ver anulados" y desaparece de Por pagar y del Resumen.

### Por pagar y Resumen

25. **Por pagar.** Los gastos con plata pendiente aparecen con lo más viejo primero y el total pendiente arriba. Pagá uno desde ahí con "Registrar pago" y comprobá que la lista se actualiza.
26. **Resumen: una factura de un mes pagada en el siguiente.** Creá un gasto imputado al mes anterior y pagalo hoy. En el Resumen del mes anterior sube el costo de su sede y no sube "pagado en el mes"; en el Resumen de este mes sube "pagado en el mes" y no sube el costo. Las tres filas son: pagado en el mes, costo del mes y pendiente, con una columna por sede, Casa Matriz y Total.
27. **Estimados e incompletos.** Un gasto con importe Estimado hace que bajo el costo diga "incluye $X estimados", y arriba aparece el aviso de cuántos gastos tienen datos incompletos (estimado, dólares sin tipo de cambio, sin links de comprobante).
28. **Detalle.** Tocá el nombre de una sede (o el Total) y una cifra: abre el detalle por rubro y concepto. Tocá un concepto: abre el gasto. Un concepto pagado este mes pero imputado a otro se ve con costo 0 y "imputado a {mes}". Si pagás o anulás desde ahí, el Resumen se actualiza.
29. **Excel.** "Descargar Excel": trae las hojas "Resumen" y "Detalle", con los mismos números que la pantalla.
30. **Sede inactiva.** Si hay una sede cerrada con reparto histórico en el mes, aparece marcada "(inactiva)" y su gasto viejo se puede seguir editando.
31. **Owner con España.** Cambiá el país a España: los gastos y el Resumen van en euros, no hay Casa Matriz y no se ofrece dólares.

### Lo existente no cambia

32. **Retiros.** En Caja → Retiros registrá un retiro con destino (a la Central o a un banco): se ve igual que antes y baja el saldo de la caja de origen. No aparece como gasto en Egresos.
33. **Cobros.** Registrá un cobro de un alumno como siempre. Caja → Saldos, Bandeja de pendientes, Retiros, Reportes, Tablero y Analíticas tienen que dar lo mismo que antes para los cobros: los pagos de gastos no suman ni restan ingresos.

## 3. Decisiones tomadas sin consultar durante la fase

De las notas del orquestador, del plan y de los resúmenes 01 a 16. Cada una, con su motivo.

**Estructura y reglas**
- **Tres tablas nuevas (gasto, reparto, pagos) y ningún tipo nuevo de movimiento.** Cada pago crea una fila de salida común en el libro de Caja, así saldos, Movimientos y Saldos por caja funcionan sin tocar sus lectores.
- **Plata en enteros; el tipo de cambio es el único decimal y solo informa.** Es la regla D-23: nunca se suma ni se compara; el equivalente en pesos se calcula una vez al guardar.
- **El método de pago se guarda como texto y se valida en la API** (no como lista cerrada en la base). Agregar un medio no exige migración.
- **Sin restricción única por (gasto, sede) en el reparto.** La regla de destinos repetidos vive en el servicio, que ya valida.
- **El estado del gasto (pendiente, parcial, pagado) se calcula siempre, no se guarda.** Evita que quede desincronizado con los pagos.
- **El país del gasto sale del alcance del usuario**, no del cuerpo del pedido: el owner lo elige con `?country=`, los demás usan el suyo. Un no-owner sin país queda rechazado (falla cerrado).
- **El rubro "Retiros" no se puede usar en un gasto** (los retiros no son gastos).
- **Rutas por id del owner sin país**: ve gastos de cualquier país, como pide el plan.

**Pagos y monedas**
- **Guarda de Caja sobre pagos:** anular o corregir desde Caja la fila de un pago de gasto da error y manda a Egresos. Más simple y seguro que dejar dos caminos de anulación.
- **Débito automático saliente:** el cambio en el código de cobros se limita a que la validación de domiciliación SEPA valga solo para cobros. Los cobros siguen dando error como antes (probado).
- **Tope de efectivo contra el saldo firme de hoy**, aunque el pago sea de una fecha pasada (igual que el retiro).
- **Pagado de más solo en gastos estimados.** En confirmados se rechaza.
- **Moneda distinta con tipo de cambio:** el pendiente de un gasto en dólares se valúa al tipo de cambio de referencia del gasto; cada pago cancela según el tipo de cambio de ese pago.
- **Prorrateo con tope** para repartir lo pendiente entre sedes: así "pagado de ese costo" nunca da negativo en una sede.
- **Clave de idempotencia usada en otro gasto o en otro país**: da error (409 o 400) en vez de devolver datos ajenos.
- **Cuentas para pagar sin saldos:** ruta propia para owner, admin y gestión; las rutas de Egresos no usan el filtro de Caja que oculta cuentas sin sede.

**Edición y anulaciones**
- **Sedes inactivas editables:** una sede cerrada que ya estaba en el reparto de un gasto viejo se puede reenviar; una sede nueva tiene que ser operativa.
- **El rubro solo se revalida si cambia:** un gasto viejo con rubro hoy desactivado se puede seguir editando.
- **Si nada cambió no se guarda nada ni se pide motivo.**
- **Un gasto confirmado no baja de lo ya pagado**; uno estimado sí puede (queda "pagado de más").

**Resumen**
- **El Resumen quedó con una columna por sede y tres filas (pagado en el mes, costo del mes, pendiente)**, aunque el plan decía una fila por sede. Fue un pedido explícito del orquestador al armar la pantalla: se lee mejor comparando sedes lado a lado. "Pagado de ese costo" no tiene fila propia: se muestra como "pagado X" bajo el costo. El servicio devuelve exactamente lo mismo; solo cambió la pantalla.
- **Una sede aparece si recibe algo.** Las sedes inactivas solo si tienen una parte en el mes.
- **Excel:** el título del Resumen va debajo de la tabla (el estilo del encabezado ocupa siempre la fila 1) y un concepto que empieza con `=` queda como texto, no como fórmula.
- **El detalle de una sede válida sin movimiento** devuelve vacío en vez de 404.
- **Un pago en pesos sin equivalente en pesos guardado** se trata como dato corrupto (error visible), no como 0.

**Admin**
- **Avisos en amarillo (warning), nunca "info"** (es azul y la paleta no lo admite).
- **Diálogo del gasto `persistent`** (formulario largo): un clic afuera no descarta lo cargado.
- **Sin cuenta preseleccionada** al pagar, aunque haya una sola: la pantalla saca plata.
- **El total de Por pagar suma por moneda** y recorre hasta 10 páginas; si hay más de 2.000 gastos, dice "al menos".
- **Las opciones del formulario las carga la página de Egresos** y no cada pestaña (las necesita también el detalle del gasto).
- **Al editar, un rubro desactivado se agrega al selector** (por ejemplo "Alquiler (desactivado)") para que el gasto viejo no quede sin rubro.
- **Las fechas de hoy salen de la API** (zona horaria del gimnasio), no del navegador.

**En este plan (209-17)**
- **No se tocó `no-regresion-208`** ni los servicios de cobro; no hizo falta ningún `fix(209-17)`.
- **El hallazgo de Historial de cobros** (más abajo) se documenta y no se cambia: es el comportamiento de siempre con los retiros, y cambiarlo toca una pantalla de producción fuera de lo pedido.

## 4. Pendientes antes de publicar

1. **Número de migración.** La migración de la fase es la **0331** y esta rama también trae 0327, 0328 y 0329 (que `master` todavía no tiene). Con las referencias locales de esta máquina (al 12/11, 17:24): `master` tiene 0330, 0332 y 0333; `staging` tiene además 0340, 0341 y 0342 (estiramiento). La 0331 está libre en los dos, pero hay que **re-verificar con `git fetch` antes de pushear**, porque otras ramas pueden haber tomado números. El corredor de migraciones aplica por nombre, así que un hueco no le molesta.
2. **Saldo de apertura de los bancos.** El día que arranque Egresos hay que cargar el saldo de apertura de cada banco (y fecha de corte): un pago anterior a ese corte se rechaza, y sin apertura el saldo mostrado no es el real.
3. **El egreso viejo sigue en la API** (`POST /expenses` y `registerExpense`). Ya no se usa desde el admin, pero lo usan los tests, los retiros viejos y los controles de aislamiento. Un cliente viejo todavía podría cargar un egreso ahí. Retirarlo es una decisión de otra fase.
4. **Funciones del admin sin uso.** `expenseStatusOf` en `el-templo-admin/src/utils/expenses.ts` se usa solo en tests (el estado lo calcula la API). `MAX_MONEY` y `sameAllocations` se usan solo dentro de ese mismo archivo. Se dejaron por si las usa una pantalla futura; se pueden limpiar sin riesgo.
5. **El total de "Por pagar" se calcula en el navegador**, recorriendo páginas del mismo filtro (200 por página, hasta 10). Con más de 2.000 gastos por pagar muestra "al menos". La API no devuelve totales del filtro. Si el volumen crece, conviene un total del lado del servidor.
6. **Hallazgo: Caja → Historial de cobros lista los pagos de gastos.** Esa pantalla muestra todas las filas del libro, incluidas las salidas (ya listaba retiros y egresos viejos). Un pago de gasto aparece como una salida sin alumno, con el tipo sin traducir ("expense", porque esa pantalla no tiene etiqueta para ese tipo; es lo que pasa hoy con los retiros), y no suma en los totales de cobros (probado). El diálogo "Anular" de esa pantalla arma su pregunta con el nombre del alumno, que en una salida no existe: el texto puede salir raro, pero la guarda responde bien (paso 23 del checklist). Propuesta: ocultar las salidas de gastos en esa pantalla o cambiar el texto del diálogo. No se cambió.
7. **Otros lectores de `expense`:** el inventario (f) no encontró ningún lector fuera de Finanzas que sume `expense` como cobro. Los de Reportes, Analíticas y Suscripciones filtran por tipo (`plan_charge`, `debt_settlement`, `advance_payment`) y por entrada de plata, o unen por alumno, y una salida de gasto no tiene alumno.
8. **Fallos preexistentes ajenos a la fase** (2 en `coach-load-alta.test.ts` y 1 en `office-routes.test.ts`): no se corrieron en este plan ni aparecieron en ninguna de las corridas.
9. **Sin duda abierta en este plan.** No hubo ninguna corrida fallida ni reintento por `Hook timed out`.
10. **No se publicó nada:** sin push, sin bump de versión, sin dependencias nuevas.

## 5. Resultados de tests y gates

### Tests nuevos de este plan

`el-templo-api/test/finance/egresos-identidades.test.ts`: **10 casos, todos pasan** (commit `367819d4e`). Es un escenario encadenado por HTTP con banco propio (apertura 2.000.000) y Caja central propia (apertura 100.000):

1. Foto inicial del Resumen de este mes y del anterior, y de los cobros del mes.
2. (a) Factura de un mes pagada en el siguiente: costo en el mes de la factura, pagado en el mes del pago.
3. (b) Contabilium $150.000 en partes iguales entre las sedes de Argentina, pagado por débito automático: cada sede suma su parte y el Total $150.000.
4. (c) $150.000 pagados desde dos cuentas: banco $90.000 y Caja central $60.000, con saldos exactos.
5. (d) USD 600 con tipo de cambio 1.560: $156.000 por sede, $936.000 de costo; pago de $468.000 que deja $78.000 pagado y $78.000 pendiente por sede; y un segundo pago de $100.001 que no divide parejo (cancela USD 64) y cuyas partes por sede suman exacto el pago.
6. Las identidades en el mes actual y en el anterior: la suma de columnas es el Total en las cinco medidas; Total pagado = suma de los pagos vigentes (consulta directa); Total costo = suma de los gastos imputados no anulados; costo = pagado de ese costo + pendiente; ninguna medida negativa.
7. El detalle del Total y el Excel coinciden con la columna Total.
8. Anular el pago de $60.000: la Caja central vuelve exacta, el gasto queda "parcial" y las identidades siguen valiendo.
9. Anular un gasto lo saca de los totales y de los estimados.
10. Los pagos de gastos no mueven los cobros: el Resumen de cobros del mes es igual al de la foto inicial.

El archivo tal como quedó cumple lo que pedía el plan (más de 9 casos, los casos del pedido, identidades, anulación, detalle y Excel, antes y después de los cobros).

### Corridas de no-regresión

| Archivos | Resultado |
|---|---|
| `test/finance/egresos-identidades.test.ts` | 10 pasan |
| `test/finance/no-regresion-208.test.ts` (sin tocar) | 14 pasan |
| `test/finance/withdrawals.test.ts` | 28 pasan |
| `test/finance/cash-balances.test.ts` | 8 pasan |
| `test/finance/mov-egresos-history.test.ts` | 8 pasan |
| `test/finance/withdrawal-formats.test.ts` | 21 pasan |
| `test/tenancy/iso-01-manifiesto.test.ts` | 13 pasan |
| `test/tenancy/iso-03-cobertura.test.ts` | 8 pasan |
| `test/db/tenant-tables.test.ts` | 18 pasan |
| `test/tenancy/con-06-lint.test.ts` | 36 pasan |
| Unit API `test/unit/expense-math.test.ts` | 90 pasan |
| Unit API `test/unit/payment-method-rules.test.ts` | 24 pasan |
| Unit admin `src/utils/__tests__/expenses.test.ts` | 91 pasan |
| Unit admin `src/utils/__tests__/payment-method-rules.test.ts` | 8 pasan |

Ninguno falló y no hizo falta reintentar. Total de esta tanda: 377 casos pasando, 0 fallando.

### Gates

| Gate | Esperado | Valor |
|---|---|---|
| `cd el-templo-api && npx tsc --noEmit` | 0 | **0** |
| `npm run -s lint:tenant` | `DISCREPANCIAS: 0` | **`DISCREPANCIAS: 0`** |
| `npm run -s typecheck:tests` | `DISCREPANCIAS: 18` | **`DISCREPANCIAS: 18`** |
| `cd el-templo-admin && npx vue-tsc --noEmit \| grep -c "error TS"` | 27 | **27** |
| `cd el-templo-app && npx vue-tsc --noEmit \| grep -c "error TS"` | 21 | **21** |
| `cd el-templo-admin && pnpm lint` | 0 errores | **0 errores, 8 advertencias** (en `env.d.ts`, `CobrosPage.vue` y `session-pdf-builder.ts`: ningún archivo de la fase) |

### Inventario (greps reproducibles)

Rango de "lo nuevo de la fase": `git diff --name-only 99f796ea4..HEAD -- el-templo-api/src el-templo-admin/src` (42 archivos, 3 de ellos de `finance` tocados por cambio mínimo: `transaction-service.ts`, `movement-service.ts`, `routes.ts`).

| # | Qué se revisó | Comando | Resultado | Conclusión |
|---|---|---|---|---|
| a | Plata: sin `MoneyInput`, `shared/money`, `utils/money` | `grep -rnE "MoneyInput\|shared/money\|utils/money" el-templo-api/src el-templo-admin/src el-templo-app/src` | 0 líneas | Bien |
| b | Cantidades fijas de sedes | `grep -rnEi "las 6\|6 sedes\|seis sedes\|las seis" el-templo-api/src el-templo-admin/src` | 8 líneas, todas ajenas a las sedes: señales de la Oficina (`auto-topics-catalog.ts:4`, `auto-topics.ts:1228`), integraciones de marketing (`integrations-status.ts:66`), un script de tenancy (`verify-tenant-backfill.ts:833`), tablas de Conquer (`conquer.ts:27`), columnas de una tabla (`PorDeudaTab.vue:516`) y categorías de notificación (`rule-triggers.ts:224`) | Bien: ninguna en archivos de la fase ni habla de sedes (falsos positivos del patrón) |
| c1 | `console.` en lo nuevo | `grep -nE "console\." <archivos del rango>` | 0 | Bien |
| c2 | `any` en lo nuevo | `grep -nE ": any\b\|as any\|<any>" <archivos del rango>` | 0 | Bien |
| c3 | `v-html` en lo nuevo | `grep -n "v-html" <archivos del rango>` | 0 | Bien (los links y textos se muestran escapados) |
| c4 | `drizzle-kit` en lo nuevo | `grep -n "drizzle-kit" <archivos del rango>` | 2 líneas, comentario de `tenant-tables.ts:470-471`, del 27/07 (no es de la fase; dice que el repo no usa drizzle-kit migrate) | Bien: ningún uso nuevo |
| d | Un pago nunca es retiro | `grep -n "responsibleName" el-templo-api/src/modules/finance/expense-*.ts` | 0 | Bien |
| e | Quién crea filas `kind: "expense"` | `grep -rn 'kind: "expense"' el-templo-api/src/modules` | `expense-payment-service.ts:301` y `movement-service.ts:477` (`registerExpense`, el egreso viejo) | Bien: exactamente los dos esperados |
| f | Lectores de `expense` fuera de Finanzas | `grep -rnE "'expense'\|\"expense\"" el-templo-api/src/modules \| grep -v "modules/finance/"` | 0 líneas con el literal. Revisados además todos los lectores del libro fuera de Finanzas | Ver tabla de abajo: ninguno suma un pago de gasto como cobro |
| g | Paleta sin azul en Egresos | `grep -rnE "blue\|indigo\|cyan\|'info'\|\"info\"" el-templo-admin/src/components/egresos el-templo-admin/src/pages/EgresosPage.vue` | 0 | Bien |
| h | Guardas de Caja | `grep -rn "assertNotExpensePaymentRow" el-templo-api/src/modules` | `transaction-service.ts:529` (anular), `:1169` (corregir), `movement-service.ts:564` (anular egreso), la definición en `expense-payment-guard.ts:24` y los dos imports | Bien: las tres entradas de 209-06 |
| i | Migraciones (refs locales) | `git ls-tree --name-only origin/master el-templo-api/src/db/migrations/`; igual con `origin/staging`; `ls el-templo-api/src/db/migrations/*.sql \| sort \| tail` | `master`: 0326, 0330, 0332, 0333. `staging`: además 0340, 0341, 0342. Esta rama: 0327, 0328, 0329 y **0331** (la de Egresos) | La 0331 está libre en master y staging. Re-verificar con `git fetch` antes del push (pendiente 1) |
| j | Conteos de tenancy | `test/db/tenant-tables.test.ts:148,153`; `test/tenancy/iso-01-manifiesto.test.ts:454`; `test/tenancy/iso-03-cobertura.test.ts:187` | `GYM_OWNED_TABLES` = 132, tablas del esquema = 137, `ENTRADAS_BASELINE` = 568 (557 + 11), `CASOS_BASELINE` = 64 (53 + 11) | Bien: coinciden con lo esperado y los tests que los verifican pasan |

**Detalle de (f): lectores del libro (`financial_transactions`) fuera de Finanzas.**

| Archivo | Qué hace | ¿Cambia con un pago de gasto? |
|---|---|---|
| `analytics/ticket-service.ts` (488, 603) | Ticket promedio: solo `plan_charge` + entrada de plata | No |
| `analytics/advanced-finance-service.ts` (228) | Ingresos por tipo: `plan_charge` y `debt_settlement` + entrada | No |
| `analytics/ltv-service.ts` (336) | LTV: `plan_charge` y `debt_settlement` + entrada | No |
| `analytics/service.ts` (809, 1460, 1546, 1628, 1772) | Ingresos y series: `plan_charge`/`debt_settlement` + entrada; el de 1772 además une por alumno (el pago de gasto no tiene) | No |
| `reports/service.ts` (744, 1069, 1393, 2032) | Reportes: `plan_charge`/`debt_settlement` + entrada, o `advance_payment` | No |
| `subscriptions/service.ts` (2886, 4173) | Anticipos y vínculos de una suscripción (por alumno y vínculo) | No |
| `wellhub/member-wellhub-service.ts` (156) | ¿El alumno tiene alguna transacción? (por alumno) | No |

Dentro de Finanzas, el Resumen de cobros (`GET /transactions/summary`) filtra por entrada de plata y excluye explícitamente los tipos que no son ingreso; el test del paso 10 lo confirma comparando antes y después. El listado general de transacciones (Caja → Historial de cobros) sí incluye todas las filas: ver el hallazgo en los pendientes (punto 6).

## Desviaciones del plan

Ninguna. El plan se ejecutó como estaba escrito: el test de la Task 1 ya estaba commiteado y se verificó (corre verde junto con `no-regresion-208`); la Task 2 no encontró nada que arreglar, así que no hubo commit de `fix`; la Task 3 es este archivo.

## Commits de la fase 209

| Plan | Commits |
|---|---|
| Planificación | `777d40947` planes de la fase; `4dbf05a2f` reglas comunes |
| 209-01 base (migración 0331, schema, tenancy, roles, audit) | `4b39a494d`, `75cbe54c9`, `42d6c1ebf` |
| 209-02 contratos, cálculo puro y sedes operativas | `6e8447a19`, `d1dc16999`, `743ce6883` |
| 209-03 alta y detalle del gasto | `b3d3461f6`, `6e5bc2176` |
| 209-04 edición, anulación y listado | `2102bdc74`, `268aca7d3`, `05207c4ff` |
| 209-05 pagos de un gasto | `600fc50d6`, `7bf0c4f04`, `0344ed2a2` |
| 209-06 anular pago, guarda de Caja, débito automático | `e7d202020`, `6f36bc05f` |
| 209-07 rutas de gastos | `d9bdd67e1`, `70de726f3`, `b9e8a52e5` |
| 209-08 rutas de pagos | `64e4e0a8f`, `85211c584` |
| 209-09 Resumen (servicio) | `335fdfab2`, `8164eee19` |
| 209-10 rutas del Resumen y Excel | `cc0cd0429`, `1d5a551a4` |
| 209-11 admin: base | `4f5b33393`, `eaddb37b4`, `da5c79728` |
| 209-12 admin: Rubros y Caja | `fdcdc9979`, `018090185`, `4c88fb617` |
| 209-13 admin: Gastos | `28f5c8b92`, `bed4d6d2d`, `8e3ffebea` |
| 209-14 admin: Por pagar y pagos | `73bbdac22`, `66803d677` |
| 209-15 admin: detalle del gasto | `f6de4afa9`, `1d5909689` |
| 209-16 admin: Resumen | `4540939a2`, `06803de8c` |
| 209-17 cierre | `367819d4e` test de identidades; `072488f8b` comentarios de Caja; este SUMMARY (`docs(209-17): summary`) |

## Known Stubs

Ninguno. (La fila clickeable de Gastos que antes no hacía nada ya abre el detalle desde 209-15.)

## Threat Flags

Ninguno. Este plan solo agrega un test y documentación: no hay superficie nueva. T-209-51 (totales que no cierran) y T-209-52 (regresión silenciosa en Caja y cobros) quedan mitigadas por las identidades y las corridas de arriba; T-209-53 (lectores olvidados) por el inventario (f).

## Self-Check: PASSED

- `el-templo-api/test/finance/egresos-identidades.test.ts` existe y pasa (10 casos).
- Commits `367819d4e` y `072488f8b` existen en la rama.
- Árbol limpio antes de escribir este archivo; este archivo es lo único que queda por commitear.
