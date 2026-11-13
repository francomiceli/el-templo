# Decisiones — Egresos, sueldos y rendiciones

Lectura punto por punto del `BRIEF.md` con Franco (inicio 2026-11-10). Base relevada: `origin/master` `691ac3b72`.

## §1 Cobros (circuito actual)

Estado verificado:
- Cobro = fila de `financial_transactions`. Entra una sola vez por `transaction_date`; deuda vive en `balances`/`debt_management` y no toca caja hasta `debt_settlement`. Pendiente/anulado fuera del saldo firme (`firm-money.ts`). ✅
- Dónde se cobró = `branch_id`; en qué cuenta = `cash_register_id`. ✅
- Sede del alumno: NO se guarda en el cobro; se lee `users.branch_id` actual (`getIncomeByMemberBranch`, `transaction-service.ts:~2749`, usado por el Tablero). Si el alumno se muda de sede, cambia la historia. ⚠️
- "Por conciliar": no existe como tal; lo más parecido es la bandeja de pendientes (transferencias con caja sugerida hasta validar). ⚠️
- Dos membresías con igual fecha e importe: el modelo las admite. ✅

Decisión: _pendiente_

Texto comunicado (punto 1): esto ya funciona — la deuda queda en Deudas sin tocar caja; el profe cobra en Cobros (plan vigente o "Asignarle un plan"); el ingreso cuenta una vez con la fecha del pago; si se anula, sale del saldo.
Pendiente: sede del alumno al momento de pagar (snapshot) — se retoma al ver Resultado/Rendiciones.

## §2 Egresos (hoja Detalle de la planilla v2)

Estado verificado (`movement-service.ts registerExpense`): egreso = caja + rubro (cost center) + importe entero + nota. Fecha y período forzados a hoy, sede = la de la caja, medio fijo "internal", una sola caja, sin USD, sin TC, sin referencia, sin comprobante, sin Casa Matriz, sin Tesoro, sin resumen pagado/imputado.

**D-01 (2026-11-10): modelo = GASTO + REPARTO + PAGOS (opción A).** Un gasto (concepto/beneficiario, rubro, mes de imputación, importe, moneda, estimado/confirmado, comprobante, observaciones) con su reparto entre sedes/Casa Matriz (suma = importe al centavo) y uno o varios pagos (fecha, cuenta de origen, medio, moneda, importe, TC). Cubre: varias cajas por egreso, prorrateo, pendientes y pagos parciales. Descartada B (planilla tal cual, fila por pago y sede).

## §3 Prorrateo

Hoy no existe (egreso = sede de la caja). Propuesta aceptada: forma de reparto al cargar (directo por defecto / partes iguales con atajo "las 6 de Argentina" / montos / porcentajes); validación de suma exacta; redondeo de centavos a la última sede; se guardan importes por sede (la forma es solo ayuda de cálculo).

**D-02 (2026-11-10): repartos guardados con nombre (opción B)** — ej. "Contabilium: 6 sedes en partes iguales"; administración los arma y mantiene en su propia pestaña y se eligen al cargar un gasto.

## §3b Navegación

**D-03 (2026-11-10): sección propia "Egresos"** en el menú Finanzas (Caja · Cobros · Egresos · Reportes · Analíticas). Pestañas: Gastos (portada, "Nuevo gasto" visible, filtros mes de imputación/sede/rubro/estado) · Por pagar · Resumen (pagado en el mes vs imputado al mes por sede) · Repartos · Rubros (se muda desde Caja). Caja queda para la plata: saldos, traslados, retiros, ajustes; los pagos de gastos aparecen en los movimientos de su caja.

**D-04 (2026-11-10): se quita "Egreso" del diálogo de Caja** (opción A); queda un acceso directo a Egresos → Nuevo gasto. Una sola forma de cargar gastos. Los egresos viejos siguen visibles en el historial de Caja.

## §4 Casa Matriz

**D-05 (2026-11-10): Casa Matriz existe solo en Egresos e informes** (opción A) como destino de reparto/columna propia, NO como `branches`. Solo Argentina; gastos de Barcelona van directo a Barcelona.

## §5 Centavos

Verificado: `financial_transactions.amount` es `int` (pesos/euros enteros); admin formatea con `maximumFractionDigits: 0` (`utils/format-price.ts`); rutas validan `type: integer`. (El comentario "cents" de `coach-load-routes.ts:132` es engañoso: son unidades enteras.)

**D-06 (2026-11-10): pasar TODO el sistema de plata a centavos como PRIMER PASO, antes de Egresos** (opción A). Toca cobros, cajas/saldos, reportes, Tablero, analíticas, export Excel, validaciones de rutas y formateo del admin/app. Trabajo aparte y delicado (ledger de plata real) → requiere plan propio y tests fuertes.

## §6 Monedas y tipo de cambio

Hoy: cajas/cuentas solo ARS/EUR (`CajaEfectivoFormDialog`/`CuentaBancariaFormDialog`), sin cotizaciones guardadas, sin operación de cambio.

Aceptado: habilitar USD en cajas/cuentas; cada pago en USD/EUR guarda su TC a ARS (inmutable, los informes en pesos usan el TC de cada pago); Barcelona se informa en EUR fuera del consolidado AR.

**D-07 (2026-11-10): TC desde una API pública, con fallback al último TC usado** si no responde. Editable a mano. Cada pago guarda valor + fecha + fuente (API / último usado / manual). Llamada desde la API (no desde el front), timeout corto + caché.

**D-08 (2026-11-10): cotización = dólar oficial BNA vendedor, SIN selector de tipo.** La UI aclara "BNA vendedor". Euro: oficial equivalente. Si más adelante piden otro tipo (MEP, tarjeta…), se agrega.

## §7 Cuentas de origen y medios

Hoy: no existe Tesoro (UI no permite caja efectivo sin sede); `paymentMethod` = cash/transfer/card/aura_credit/internal/direct_debit, sin cheque.

**D-09 (2026-11-10): Tesoro = cuenta de EFECTIVO sin sede, aparte de Caja central** (reserva/caja fuerte), una por moneda si hace falta (Tesoro ARS / USD). Se suma **cheque** como medio. Coherencia medio↔cuenta: efectivo solo desde caja efectivo/Tesoro; transferencia/débito/tarjeta/cheque solo desde banco.

## §8 Comprobante, estimado/confirmado, correcciones

Hoy: nada en egresos. Existe bucket R2 privado con URL firmada (`modules/conquer/private-media.ts`) — NO se usa por decisión.

Aceptado: estado del importe Estimado/Confirmado; cada cambio de importe registra quién, cuándo, valor anterior, nuevo y motivo (visible en el detalle); aviso si confirmado < pagado (pago de más); el reparto se recalcula proporcional.

**D-10 (2026-11-10): comprobantes SOLO como links (Drive), sin subir archivos.** Varios links por gasto (factura, recibo…). Interpretación de "A pero solo con pegar link de Drive": se conserva lo de "varios por gasto" de la opción A, sin el upload.

## §9 Resumen de Egresos

Aceptado: tabla por sede (6 AR + Casa Matriz + Total) con Pagado en el mes (pagos prorrateados según el reparto) · Costo del mes (imputado, pagado o no) · de eso pendiente; clic → detalle por rubro y concepto; contador de gastos con datos incompletos; export Excel; pendientes en USD/EUR se muestran en ARS con BNA del día marcado "provisorio".

**D-11 (2026-11-10): el Costo del mes INCLUYE estimados**, marcado "incluye estimados" con el monto estimado aparte.

## §10 Traslados y estado de cuenta

Hoy: traslado = 2 filas `cash_transfer` vinculadas, alta y anulación atómicas (`movement-service.ts registerMovement`/`voidPair`); SIN idempotencia (doble clic = 2 traslados); Saldos muestra por cuenta y mes saldo + entradas/salidas/neto, sin apertura del período, sin desglose por tipo, sin drill-down; motivos de void/corrección no visibles en Caja.

Aceptado: extracto por cuenta (cuenta + período → apertura, cobros, pagos, traslados recibidos/enviados, ajustes, saldo final; clic → movimientos con quién registró/corrigió/anuló y motivo). Va con Egresos.

**D-12 (2026-11-10): idempotencia de traslados como FIX CHICO INDEPENDIENTE, ya** (no espera a Egresos). 🔴 Pendiente de hacer al terminar la lectura.

## §11 Cambio de moneda

Hoy: traslados entre monedas distintas rechazados ("No FX in v1").

Aceptado: movimiento "Cambio de moneda" en Caja (junto a Traslado): cuenta origen + importe entregado, cuenta destino + importe recibido, comisión; cotización real = entregado ÷ recibido; patas vinculadas, void atómico.

**D-13 (2026-11-10): la comisión del cambio = gasto automático, rubro nuevo "Gastos bancarios", imputado a Casa Matriz.**

## §12 Resultado por sede y consolidado

Aceptado: pestaña "Resultado" — por sede: cobros a sus alumnos, costos asignados por rubro, resultado, margen ("sin base de cálculo" si cobros = 0); Casa Matriz con costos; Consolidado AR = 6 sedes − Casa Matriz una vez; Barcelona aparte en EUR. Base mixta tal cual el brief: cobros por fecha de pago + costo del mes imputado (incluye estimados, D-11).

**D-14 (2026-11-10): cada cobro guarda la SEDE DEL ALUMNO al momento del pago** (snapshot; backfill de históricos con la sede actual). Va junto con el paso de centavos (D-06), que toca los mismos lugares. Cierra el pendiente de §1.

## §13 Rendiciones a inversores

Ejemplo Mario Bravo verificado: IVA $84.000, IIBB $12.640 (9,664 %), beneficio $403.360, 15 % = $60.504, $30.252 c/u.

Recorrido aceptado: (1) Acuerdo por sede con vigencia (participación %, beneficiarios con su parte, impuestos pactados; nuevo acuerdo = versión nueva, el anterior queda); (2) Borrador mensual: cobros alumnos sede − costos asignados − impuestos pactados = beneficio → participación; incluir/excluir cada gasto con motivo; comparar variantes; (3) Aprobar congela números y genera versión breve desde los mismos datos; (4) Pagos al inversor = gasto rubro "Inversores" vinculado a la rendición que cancela (cuenta + fecha), fuera de la base de la siguiente.

**D-15 (2026-11-10): impuestos pactados = fórmula configurable de piezas fijas** — base gravada = X % de cobros; IVA = Y % de la base; IIBB = Z % de (base − IVA); + líneas extra en % o monto fijo (Ganancias, cheque). Descartadas: manual por borrador (B) y fórmulas libres (C).

**D-16 (2026-11-10): versión breve = PDF generado al aprobar, guardado en la rendición; administración lo descarga y lo envía.** Sin acceso de inversores al admin. Nota técnica: la API ya tiene `pdfmake` (sin deps nuevas); "guardado tal como se emitió" = snapshot inmutable de los números en DB al aprobar (el PDF se regenera idéntico desde el snapshot), sin depender de storage de archivos.

## §14 Permisos

Aceptado: Egresos (cargar gastos/pagos, Por pagar, Resumen) = owner/admin/gestion; Rubros, Repartos, cuentas (incl. Tesoro), anular gasto/pago, cambio de moneda = owner/admin; admin_sede sin acceso a Egresos.

**D-17 (2026-11-10): Resultado y Rendiciones SOLO owner/admin.** Gestión no los ve.

## §15 Arranque y egresos viejos

**D-18 (2026-11-10): Egresos arranca en NOVIEMBRE 2026** (se carga la planilla de noviembre en la sección nueva). Los egresos viejos (no Retiros) se CONVIERTEN por migración a gastos: mes = el de su fecha, reparto directo a la sede de su caja (Casa Matriz si salieron de Central/banco), un pago desde esa caja. Retiros quedan como están (son traslados, no costo). Franco dio OK para SSH de solo lectura para contarlos.

**Relevamiento prod 2026-11-10 (SSH solo lectura, OK de Franco):** en prod NO hay ningún egreso que no sea Retiro → la migración de conversión de D-18 NO hace falta (0 filas). Retiros: 48 activos (+5 anulados), $82,5M, 09/09–10/11, en las 6 cajas de sede AR. 1 ajuste activo. Hallazgo: el retiro es un `expense` que sale de la caja de sede y NO entra en ninguna cuenta (Central no lo recibe) → choca con el brief ("salida en el local y entrada en central como partes del mismo traslado").

## §16 Destino de los retiros

**D-19 (2026-11-10): retiro con DESTINO OBLIGATORIO (Caja central o Tesoro), guardado como traslado** (sede baja, destino sube); se conservan responsable, conteo y resumen "quedó + ingresó − salió". Los 48 retiros viejos quedan como están (plata ya usada fuera de la app). Central y Tesoro arrancan con un arqueo de apertura del efectivo real.

## §17 Por conciliar

**D-20 (2026-11-10): "por conciliar" = cobros pendientes de validar** (bandeja Caja → Pendientes, ya existe). Se muestran como línea "Cobros por conciliar: $X (N)" en el extracto por cuenta y en el Resumen, con link a la bandeja. Sin cuenta "Por identificar".

## §18 Cierre de mes

**D-21 (2026-11-10): "Cerrar mes"** bloquea crear/editar/anular gastos y pagos imputados a ese mes; facturas tardías se imputan al mes siguiente; owner/admin pueden reabrir con motivo (queda en audit). La rendición aprobada además congela sus números (D-16).

## §19 Orden de construcción

**D-22 (2026-11-10): milestone GSD, una fase por tanda (1-6); tanda 0 como fix suelto ya.** Planifica el modelo caro, ejecutan `gsd-executor` sonnet (método fase 173).
- T0 idempotencia traslados (D-12) — fix suelto
- T1 centavos en todo el sistema de plata + snapshot sede del alumno (D-06, D-14)
- T2 cuentas: USD, Tesoro, cheque, retiro con destino, arqueo de apertura Central/Tesoro (D-09, D-19)
- T3 Egresos completo (D-01…D-05, D-07, D-08, D-10, D-11, D-13, D-21) + importar planilla de noviembre
- T4 Caja: extracto por cuenta, por conciliar, cambio de moneda (D-13, D-20)
- T5 Resultado por sede y consolidado (D-14, D-17)
- T6 Rendiciones (D-15, D-16)
Administración sigue con la planilla hasta T3.

## §20 Revisión del milestone (2026-11-11)

**D-23 (2026-11-11): se REVOCA D-06. La plata queda en unidades enteras en todo el sistema, también en Egresos.** Motivo (Franco): el cambio de tipo de la 207 toca los caminos de cobro que ya andan en producción para un caso marginal; "no pasa nada con perder centavos, la gran mayoría de los gastos son en pesos". Consecuencias:
- De la fase 207 se conserva SOLO el snapshot de sede del alumno (`member_branch_id`, D-14). El paso a `DECIMAL(14,2)`, `shared/money.ts`, `MoneyInput` y los tests de centavos se sacan de la rama antes de cualquier push.
- Los gastos se cargan redondeados al peso ($77.570,82 → $77.571). El reparto "al centavo" de D-01/§3 pasa a ser "al peso", con el resto a la última sede. USD y EUR también en enteros.
- Medición 11-11 sobre `4d24e58ec` (208-06): deshacer la 207 choca con la 208 en 4 archivos de `modules/finance` (10 bloques) y deja 4 tests de la 208 por ajustar.
- Auditoría hecha contra prod el 11-11 (no hay material real de gastos): `AUDITORIA-2026-11-11.md`.

**D-24 (2026-11-11): RECORTE del milestone, con OK de Franco.** Queda: (1) sacar el cambio de tipo de la 207, (2) terminar la 208, (3) 209 Egresos en versión chica, (4) 211 Resultado por sede como informe, (5) saldo de apertura de bancos + arqueo de Central y Tesoro al arrancar. Cambios sobre decisiones anteriores:
- **210 completa EN ESPERA** (extracto por cuenta, línea "por conciliar" de D-20, cambio de moneda de §11 y comisión automática de D-13). Vuelve el extracto cuando los bancos tengan saldo real, y el cambio de moneda cuando exista una cuenta en USD con uso.
- **212 completa EN ESPERA** (D-15, D-16 y §13). La rendición se sigue armando en planilla a partir del Resultado por sede. Vuelve con dos meses de gastos cargados y el criterio de Alberti cerrado. Mientras tanto, el pago al inversor es un gasto común con rubro "Inversores".
- **D-07/D-08 fuera:** tipo de cambio manual por pago, sin API del BNA.
- **D-02 fuera:** sin repartos guardados con nombre. Al cargar: directo, partes iguales entre las 6 o por montos.
- **D-18 fuera en lo del importador:** noviembre se carga a mano (la planilla está vacía).
- **D-21 en espera:** "Cerrar mes" vuelve junto con las rendiciones.
- Pestañas de Egresos: Gastos, Por pagar, Resumen y Rubros (sin Repartos).
