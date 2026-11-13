# Administración de El Templo — Egresos y rendiciones

## v2 (2026-11-10, actualización de Franco) — cambios respecto de v1 (abajo)

- **Título:** "Egresos y rendiciones". **Se quitó la sección de Sueldos de profesores** (liquidación, reparto por turnos, medio turno del sábado). El reparto "por turnos semanales efectivos del profesor" también desapareció de Resultado por sucursal (queda: directo, partes iguales, montos o porcentajes). "Sueldos" queda solo como rubro.
- **Nueva sección "Cómo leer este pedido y la planilla de ejemplo":** la planilla `.docs/El Templo · Pagos e imputación · Noviembre 2026 · Plantilla.xlsx` es un ejemplo de variables y consultas; la interfaz, el recorrido de carga y la integración las definen Franco y Claude.
- **Variables del registro de pagos** (hoja Detalle, una fila por pago y sucursal): Fecha de pago · Mes de imputación (AAAA-MM, independiente) · Sucursal o Casa Matriz · Rubro · Concepto / beneficiario · Moneda · Importe pagado · TC a ARS (1 para ARS; se conserva el valor por movimiento) · Importe ARS (calculado) · Cuenta de origen (caja, banco o Tesoro) · Medio de pago (efectivo, transferencia, débito automático, tarjeta, cheque) · Referencia de pago (agrupa filas de un mismo pago repartido) · Comprobante / enlace · Observaciones · Control (calculado: "Completar datos" / "Falta tipo de cambio" / OK).
  - Obligatorios según el Control: fecha, mes, sucursal, rubro, concepto, moneda, importe, cuenta, medio (+ TC si no es ARS).
  - Listas mantenibles por administración: sucursales (6 AR + Casa Matriz), rubros (Alquileres, Servicios, Conectividad, Insumos, Seguros, Mantenimiento, Limpieza, Sueldos, Impuestos, Cargas sociales, Honorarios, Sistemas, Publicidad, Financiamiento, Inversores, Obras), monedas (ARS/USD/EUR), cuentas (cajas de sede, Caja central, Tesoro + bancos a agregar), medios.
  - Hoja Resumen: por sucursal, "Pagado en el mes" (filtra fecha de pago) vs "Imputado al mes" (filtra mes de imputación), en ARS; contador de filas por completar.
- **Ejemplos nuevos:** servicio de octubre $83.000 pagado el 10/11 desde banco → aparece en salidas de noviembre e imputado a octubre. Contabilium $150.000 → 6 × $25.000 con la misma referencia; la suma asignada = salida real. **Un gasto pagado desde dos cuentas** ($90.000 banco + $60.000 caja central = $150.000), cada parte con su fecha.
- **Alcance:** la planilla registra pagos; el sistema además necesita gastos pendientes (costo completo del mes = pagados + pendientes imputados), saldos de cuentas, traslados y rendiciones. Cada informe debe dejar claro qué importes incluye.
- **Detalle por concepto y sede** con rubros Alquileres, Servicios, Sueldos, Seguros.
- **Alberti octubre:** se excluyen gráfica y materiales eléctricos de obras; se incluye la cuota 1 de 3 del seguro de caución por $1.106.823. Siguen en revisión criterio de impuestos y dos pares de cobros.
- **Comentario de Franco al pasarlo:** la sección egresos debe tener los campos de Detalle, **más de una caja por egreso** y **prorrateo de gastos**.

El resto (cobros, gastos y pagos, cajas/monedas, resultado, rendiciones) sigue igual que v1.

---

## v1 — Pedido funcional recibido 2026-11-10 (texto pegado por Franco, transcripto literal)

Franco y Claude, queremos que desde la app podamos contestar tres preguntas que hoy resolvemos con planillas: de dónde salió la plata, a qué sucursal corresponde el costo y en qué mes impacta. Al cerrar el mes, administración necesita poder explicar cada saldo y preparar la rendición de cada inversor a partir de los mismos movimientos.

## Qué tomamos del circuito actual de cobros

La app ya tiene los cobros que necesitamos para los informes. Administración carga una deuda y, cuando el alumno paga, el profesor registra su cancelación por pago. Para una membresía nueva se elige el plan del listado. La entrada de dinero se reconoce una sola vez, en la fecha del pago efectivo. Una deuda pendiente o anulada tiene efecto cero en caja. Dos membresías distintas del mismo alumno pueden tener igual fecha e importe.

Para el resultado mensual, el cobro completo corresponde a la sucursal del alumno al momento de pagar. Para tesorería importa dónde se cobró y en qué cuenta se acreditó. Si todavía falta identificar esa cuenta, administración necesita ver el importe por conciliar.

**Ejemplo de cobro cruzado.** Un alumno de Alberti paga $70.000 en efectivo en Moreno. El resultado de Alberti incorpora $70.000 de cobros y la caja de Moreno recibe $70.000. En el consolidado aparece un único cobro por $70.000. El comprobante original permite seguir ambas atribuciones.

## Gastos y pagos

Cuando administración carga un gasto, queremos registrar el rubro, concepto, beneficiario, importe final, moneda, mes al que corresponde y sucursal o Casa Matriz. También sirve adjuntar el comprobante, dejar una observación y distinguir un importe estimado de uno confirmado. Cuando llega el valor definitivo, queremos conservar el historial de la corrección.

En el detalle mensual buscamos un total por concepto y sede. Por ejemplo, los dos cargos de Obras Sanitarias de Constitución suman $77.570,82. En bidones interesa el importe final que gastó el local.

Un gasto puede quedar pendiente, pagarse en el momento o cancelarse en partes. Por cada pago interesa cuánto salió, en qué fecha, por qué medio y desde qué caja o banco. Así, una factura de octubre pagada en noviembre aparece en el costo de octubre y en la salida de noviembre. La suma de sus pagos permite ver cuánto queda pendiente.

### Datos que conectan costo, distribución y pago

- **Gasto:** referencia, concepto, rubro, beneficiario, período contable, importe final y moneda.
- **Distribución:** referencia al gasto, sede o Casa Matriz e importe asignado. La suma de las asignaciones coincide al centavo con el gasto.
- **Pago:** referencia al gasto, fecha efectiva, medio, cuenta de origen, moneda e importe. Si el pago usa otra moneda, interesa también cuánto cancela en la moneda del gasto y a qué cotización.

Saldo pendiente = importe del gasto − suma de los importes cancelados. El estado es pendiente, parcial o pagado según cuánto se haya cancelado. Por ejemplo, sobre una factura de $150.000, un pago de $90.000 deja $60.000 pendientes. Cuando se pagan esos $60.000 se cierra la deuda y el costo sigue siendo $150.000.

## Sueldos de profesores

Al preparar la liquidación del mes, queremos elegir al profesor que ya figura en Turnos y ver sus horarios, las horas estimadas por semana y los turnos semanales que le corresponden en cada sede. Administración necesita poder revisar los turnos efectivos de la semana, por ejemplo si hubo un reemplazo.

La liquidación parte del sueldo fijo mensual de cada profesor. Queremos ver por separado la cantidad de horas extra, el valor de cada hora, el subtotal de extras, la cobertura médica y otros conceptos identificados por motivo e importe. El total reúne el fijo, las horas extra por su valor y los adicionales. Las horas habituales estimadas sirven para revisar la carga de trabajo. El fijo se toma por el importe mensual acordado.

El fijo se distribuye entre sucursales según los turnos semanales efectivos de ese profesor. El sábado por la mañana vale medio turno. Si de sus cinco turnos semanales un profesor hace tres en Moreno y dos en Alberti, corresponde el 60 % de su fijo a Moreno y el 40 % a Alberti. Queremos ver qué sede absorbe cada adicional y que la suma de las asignaciones coincida con el costo total de la liquidación.

El pago también forma parte de la ficha mensual. La planilla distingue el trabajo de octubre del pago del 6 de noviembre, y separa efectivo, banco y saldo. Queremos conservar esa lectura aunque haya varios pagos en distintas fechas. Cada pago reduce el saldo pendiente y el saldo de su cuenta de origen. El sueldo aparece una sola vez como costo del mes trabajado, bajo Sueldos.

**Ejemplo de liquidación y pago · importes ilustrativos en ARS.** Un profesor tiene un fijo de $1.000.000. Cada semana hace 3 turnos en Moreno y 2 en Alberti, para un total personal de 5. La grilla semanal de cada sede tiene 10,5 turnos disponibles: dos por día de lunes a viernes y medio el sábado por la mañana. Para repartir el sueldo de este profesor, el divisor es 5. El fijo por sede se calcula como sueldo fijo mensual × turnos semanales efectivos del profesor en esa sede ÷ total de turnos semanales efectivos del profesor entre todas sus sedes. Si el total es cero, la distribución queda pendiente de revisión.

Moreno recibe $600.000 del fijo y Alberti $400.000. Además, el profesor hizo 4 horas extra en Alberti a $10.000 y tiene $30.000 de cobertura médica. En este ejemplo, administración asigna las extras a Alberti y reparte la cobertura en la misma proporción que el fijo. Moreno queda en $618.000 y Alberti en $452.000. La liquidación suma $1.070.000.

Si se liquidó octubre, el costo de octubre es $1.070.000. Un pago de $700.000 desde el banco el 6/11 deja $370.000 pendientes. Un segundo pago de $370.000 desde caja central el 8/11 lleva el saldo a cero. En noviembre se ven las dos salidas y ambas remiten a la misma liquidación.

Administrativas, gerencia y programación se imputan a Casa Matriz.

## Cajas, bancos y monedas

Cada caja de sucursal, la caja central, cada cuenta bancaria y el Tesoro necesitan su propio saldo por moneda. Al retirar $100.000 de Mario Bravo para llevarlos a caja central, queremos ver la salida en el local y la entrada en central como partes del mismo traslado. El total disponible del conjunto y el resultado del local se conservan. Un pase posterior al Tesoro se puede seguir del mismo modo.

Por cuenta y fecha interesa consultar el saldo de apertura, cobros acreditados, pagos, traslados, ajustes y saldo final, con acceso al movimiento que explica cada importe. También interesa saber quién registró o corrigió un movimiento y por qué, para poder conciliarlo con el efectivo o el extracto bancario.

Trabajamos en pesos argentinos, dólares y euros, incluidos los movimientos de Barcelona. Queremos conservar el importe y la moneda de origen. Si un informe convierte valores, interesa conocer la moneda de presentación, la cotización, su fecha y su fuente. Un cierre conserva la cotización aplicada. En un cambio real de moneda interesa ver cuánto se entregó, cuánto se recibió y qué comisión se pagó.

**Lectura del saldo.** Para una cuenta y moneda, saldo final = saldo inicial + cobros acreditados + transferencias recibidas − pagos − transferencias enviadas ± ajustes. Un traslado confirmado tiene una referencia común en origen y destino. Si se vuelve a confirmar por error, el saldo refleja un solo traslado.

**Ejemplo en dólares.** Una factura de publicidad de USD 600 se paga desde un banco en USD y se divide entre seis sedes. A una cotización ilustrativa de ARS 1.560 por USD, cada sede recibe USD 100, equivalentes a $156.000. El banco registra un débito de USD 600 y el costo consolidado en pesos es $936.000.

## Resultado por sucursal y consolidado

Queremos leer dos cifras distintas para cada sede: cuánto dinero salió efectivamente de sus cuentas y cuánto costó operar ese mes. Por ejemplo, si un banco central paga $150.000 de Contabilium, en ese banco hay una salida de $150.000 y en cada una de las seis sedes argentinas hay un costo de $25.000. Según el concepto, el reparto puede ser directo, por partes iguales, por montos, por porcentajes o por turnos semanales efectivos del profesor.

Para cada sucursal, el resultado es lo cobrado a sus alumnos menos los costos que se le asignaron. El margen es ese resultado dividido por los cobros del período. El consolidado argentino reúne las seis sedes y descuenta una vez los costos de Casa Matriz, entre ellos IVA, Ingresos Brutos y cargas sociales. El informe de gestión incluye también obras, financiación, cuotas de planes y pagos a inversores según su imputación.

**Ejemplo de lectura mensual · importes ilustrativos.** Si los alumnos de una sede pagaron $10.000.000 y sus costos asignados suman $7.500.000, el resultado es $2.500.000 y el margen es 25 %. Cuando los cobros son cero, el resultado en pesos sigue disponible y el margen porcentual figura como «sin base de cálculo». El margen consolidado se calcula dividiendo el resultado consolidado por el total de cobros.

## Rendiciones a inversores

Mario Bravo y Alberti necesitan una rendición interna detallada y, una vez aprobada, una versión breve para el inversor con ingresos por membresía, costos agrupados, impuestos de la rendición, beneficio y participación. Ambas versiones tienen que coincidir. Interesa conservar el acuerdo vigente, la distribución entre beneficiarios y el informe que efectivamente se emitió.

La base parte de los cobros de los alumnos de la sede y descuenta sus costos computables y los impuestos pactados sobre ventas. Los pagos de rendimientos anteriores figuran en tesorería y quedan fuera de la base del nuevo rendimiento. Los impuestos centrales se muestran en Casa Matriz. Para cada pago al inversor queremos ver qué liquidación cancela, desde qué cuenta y en qué fecha.

En Mario Bravo corresponde un 15 % del beneficio para las dos inversoras en partes iguales. En el acuerdo usado en octubre, el IVA se calculó como el 21 % del 40 % de los cobros, e Ingresos Brutos como el 4 % de esa base después del IVA. En conjunto equivalen al 9,664 % de los cobros. Ganancias e impuesto al cheque tuvieron valor cero ese mes.

**Ejemplo de rendición de Mario Bravo · importes ilustrativos.** Con cobros de $1.000.000, el IVA del acuerdo es $84.000 (40 % × $1.000.000 × 21 %) e Ingresos Brutos es $12.640 [($400.000 − $84.000) × 4 %]. Si los costos computables de la sede son $500.000, el beneficio a distribuir es $403.360. La participación conjunta del 15 % da $60.504, o $30.252 por inversora. Si ese mes también se pagó una rendición anterior, su pago queda vinculado a aquella liquidación y el beneficio de este ejemplo sigue en $403.360.

En Alberti la participación confirmada es del 60 %. Para la rendición de octubre siguen en revisión el criterio de impuestos, el tratamiento de las obras y dos pares de cobros. Mientras se resuelven, queremos poder comparar los resultados dentro del borrador interno.
