---
phase: 211-resultado-por-sede
plan: 06
subsystem: finance
tags: [egresos, resultado, cierre, no-regresion, inventario, uat]
requires: [211-01, 211-02, 211-03, 211-04, 211-05]
provides:
  - corridas de no-regresion y de los tests nuevos de la fase
  - inventario con greps reproducibles y gates finales
  - checklist de prueba manual para Franco
affects: [212]
key-files:
  created:
    - .planning/phases/211-resultado-por-sede/211-06-SUMMARY.md
  modified: []
decisions:
  - Cierre sin cambios de codigo: el inventario no encontro nada que obligue a un fix(211-06)
  - Los cambios en movement-service.ts y routes.ts que aparecen en el rango son de la 209.1 (otra fase en la misma rama), no de la 211
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Fase 211 Plan 06: Cierre del Resultado por sede (resumen para Franco)

Cierre de la fase 211. Se corrieron de nuevo todas las pruebas de la fase y las de lo que ya existía (Resumen de Egresos, Tablero, cobros, aislamiento entre gimnasios), se revisó con búsquedas reproducibles que no se tocó ningún camino de cobro ni se agregó nada que no debía, y se dejó abajo el paso a paso para probarlo a mano. No apareció ningún error de la fase y no hizo falta cambiar código en este plan.

## 1. Qué quedó construido

**Una pestaña nueva, "Resultado", dentro de Egresos.** Aparece entre Resumen y Rubros. La ven solo el owner y el admin. Gestión, admin de sede, recepción y profes no la ven, y la API les responde "acceso denegado" aunque alguien intente entrar por la dirección.

**Qué muestra.** Elegís un mes (con las flechas) y ves una tabla con una columna por cada sede del país, una columna "Casa Matriz" (solo Argentina) y una columna "Consolidado" al final. Las filas son:

- **Cobros a alumnos**: lo que pagaron los alumnos de esa sede en el mes.
- **Un renglón por rubro** con los costos de esa sede (solo los rubros que tienen algún costo).
- **Total costos**, con "incluye $X estimados" cuando hay gastos estimados.
- **Resultado**: cobros menos costos. Si da negativo se ve en rojo.
- **Margen**: el resultado sobre los cobros, con un decimal. Si la sede no tuvo cobros dice "sin base de cálculo".

**Casa Matriz** solo tiene costos: en cobros y en margen muestra "—", y su resultado es el costo en negativo. Nunca se reparte entre las sedes.

**Consolidado** es la suma de las sedes en cobros y en costos, más los costos de Casa Matriz una sola vez. Su resultado es cobros menos costos.

**España aparte.** El owner puede cambiar el país a España: el mismo informe sale en euros, sin Casa Matriz. Nunca se mezclan monedas.

**Avisos.** Si hay gastos con datos incompletos aparece el mismo aviso que en el Resumen. Si hay cobros en otra moneda aparece un aviso aparte y esos importes no se suman.

**Detalle y Excel.** Tocando una columna se abre el detalle por rubro y concepto (el mismo del Resumen), y tocando un concepto se abre el gasto. El botón "Descargar Excel" baja una planilla con la misma tabla, el título con mes, país y moneda, y una nota de cómo se calcula.

**De dónde salen los números.** Los cobros son los pagos firmes (validados, no anulados) de alumnos, por fecha de pago y por la sede que tenía el alumno al pagar (la misma regla que usa el Tablero). Los costos son exactamente los mismos del Resumen de Egresos del mes: esa cuenta no se volvió a hacer, se reutiliza.

**Debajo de todo:** sin migración nueva, sin tablas nuevas, sin dependencias nuevas, plata siempre en enteros, y aislamiento entre gimnasios probado en las dos rutas nuevas.

## 2. Checklist de prueba manual

Probalo en un ambiente de pruebas, no en producción (la fase no se publicó). Antes de empezar tené a mano: un usuario **owner**, uno **admin** y uno de **gestión**; un mes con gastos cargados y con cobros de alumnos en varias sedes de Argentina, y algún gasto cargado a Casa Matriz y alguno estimado. Anotá del **Resumen de Egresos** de ese mes el número de **costo del mes en la columna Total**: lo vas a comparar en el paso 4.

### Permisos y acceso

1. Entrá como **owner** a Egresos. Tienen que verse las pestañas Gastos, Por pagar, Resumen, **Resultado** y Rubros, en ese orden. Repetí con **admin**: también ve Resultado.
2. Entrá como **gestión**. Ve Gastos, Por pagar y Resumen, y **no** ve Resultado ni Rubros. Escribí `/egresos?tab=resultado` en la barra de direcciones: tiene que llevarte a la pestaña Gastos.

### Qué muestra la tabla

3. Como **owner**, en Resultado, elegí el mes con cobros y gastos. Tiene que haber una columna por cada sede de Argentina (con su nombre), después **Casa Matriz** y **Consolidado** al final. Las filas, en este orden: Cobros a alumnos, un renglón por cada rubro con gasto, Total costos, Resultado y Margen. Abajo, una nota que explica cómo se calcula.
4. El **Total costos del Consolidado** tiene que ser igual al **costo del mes en la columna Total** del Resumen de Egresos del mismo mes (el número que anotaste).
5. En una columna que tenga gastos estimados, abajo de Total costos tiene que decir **"incluye $X estimados"**. Ese X tiene que coincidir con lo que dice el Resumen en esa sede.
6. En **Casa Matriz**, Cobros a alumnos y Margen muestran **"—"**, y el Resultado es el costo con signo negativo y en rojo.
7. Buscá una sede que no haya tenido cobros en el mes (o elegí un mes viejo en el que no haya cobrado). En Margen tiene que decir **"sin base de cálculo"**, y su Resultado es negativo (solo costos).
8. **Consolidado = sedes − Casa Matriz.** Sumá a mano los Cobros a alumnos de las sedes: tiene que dar el Cobros a alumnos del Consolidado. Sumá los Total costos de las sedes y el de Casa Matriz: tiene que dar el Total costos del Consolidado. Y Resultado del Consolidado = cobros − costos.
9. **Los cobros de una sede, según el alumno.** Anotá los Cobros a alumnos de una sede. Registrá un cobro de un alumno de esa sede por un importe conocido (por ejemplo $10.000, con fecha dentro del mes que estás viendo), validalo si queda pendiente, y volvé a Resultado: los cobros de esa sede tienen que haber subido exactamente $10.000 y los de ninguna otra sede cambiaron.
10. **Cobro pendiente de validar.** Registrá un cobro que quede pendiente de validar (Caja → Bandeja de pendientes). Mientras esté pendiente, los Cobros a alumnos **no** lo suman. Validalo y recargá Resultado: ahora sí sube.
11. **Alumno que se cambió de sede.** Tomá un alumno que pagó antes de cambiarse de sede. Su pago anterior al cambio tiene que seguir sumando en la **sede vieja** (la que tenía al pagar) y los pagos nuevos en la nueva.

### Detalle, mes y Excel

12. Tocá el **nombre de una sede** (o una cifra de su columna): se abre el detalle por rubro y concepto de esa sede. Tocá **Consolidado**: se abre el detalle del total. Tocá un concepto: se abre el gasto.
13. Cambiá de mes con las flechas: cambian los números y el título del mes. En un mes sin cobros ni gastos se ve el mensaje "No hay cobros ni gastos imputados en [mes]", sin errores.
14. **Descargar Excel**: la planilla tiene una hoja "Resultado" con la misma tabla (Casa Matriz con "—" en cobros y margen, "sin base de cálculo" donde corresponde) y, debajo, el título con mes, país y moneda y la nota de cómo se calcula. Comparala con la pantalla: tomá tres números al azar (uno de cobros, uno de costos, uno de resultado) y que coincidan.

### País, avisos y pantalla chica

15. Como **owner**, cambiá el país a **España**: los importes se ven en euros, no hay columna Casa Matriz y no aparecen sedes de Argentina. El Excel de España también sale en euros.
16. Si en el mes hubo **cobros en otra moneda** (por ejemplo, en dólares en una sede de Argentina), tiene que aparecer arriba un aviso en amarillo del estilo "N cobros en otra moneda no incluidos: [sede] [importe]", y esos importes no están sumados en la tabla. Si no hay, no aparece nada.
17. Si en el mes hay **gastos con datos incompletos** (estimados, sin tipo de cambio o sin comprobante), tiene que aparecer el mismo aviso amarillo que en el Resumen, con los mismos números.
18. Si hay una **sede cerrada** o **virtual (online)** que tuvo cobros o gastos en el mes, tiene que tener su propia columna con la marca "(inactiva)" o "(virtual)" debajo del nombre, antes de Casa Matriz. Ningún cobro ni costo del mes puede quedar fuera de una columna.
19. En el **celular** o con la ventana angosta, la tabla se desplaza de costado y la primera columna (los nombres de las filas) queda fija.

### Lo que ya existía no cambia

20. La pestaña **Resumen** de Egresos se ve igual que antes (mismo aviso de datos incompletos, misma nota de moneda). Gastos, Por pagar y Rubros también. Y el **Tablero**, Caja y los cobros muestran los mismos números que antes de la fase.

## 3. Decisiones tomadas sin consultar durante la fase

Franco había dado el visto bueno a lo grueso (la pestaña, las columnas por sede, Casa Matriz y Consolidado, España en euros, solo owner y admin, costos estimados incluidos, la sede del alumno al pagar). Lo que sigue son detalles que decidimos sin preguntarte, para que los revises. Cada uno dice qué se hizo, por qué, y cómo se cambiaría.

**Del plan de la fase (DI del CONTEXT)**

- **Cobros = solo pagos de alumnos (DI-02).** Cuentan los pagos firmes que tienen un alumno asociado. Quedan afuera los ajustes de caja (arqueos, saldo de apertura de bancos) y cualquier ingreso sin alumno, porque no son cobros a alumnos. Todos los medios de pago cuentan (efectivo, transferencia, crédito AURA, etc.), igual que en el Tablero. Si preferís incluir esos ajustes, es una condición que se saca en un solo lugar.
- **Las devoluciones no restan (DI-02).** Una devolución a un alumno hoy no resta de los ingresos en ningún lugar del sistema (ni en el Tablero), y seguimos el mismo criterio para que los números coincidan. Está anotado como limitación y se muestra en la nota al pie.
- **La sede de un cobro es la del alumno al pagar (DI-03).** Si el cobro no la tiene guardada se usa la sede actual del alumno, y como último recurso la sede donde se cobró. Es la misma regla del Tablero. Un cobro cuya sede es de otro país no entra en el informe de este país.
- **Los cobros en otra moneda no se convierten ni se suman (DI-04).** El informe de un país es en su moneda. Los cobros en otra moneda se cuentan aparte y se avisan arriba de la tabla. Convertirlos exigiría definir un tipo de cambio oficial, y eso es del cambio de moneda (fase 210, en espera).
- **Sedes inactivas o virtuales con cobros aparecen como columna (DI-06).** Si una sede cerrada o una sede online tuvo cobros (o gastos) ese mes, tiene su columna con la marca "(inactiva)" o "(virtual)", así nada queda afuera y el Consolidado siempre cierra.
- **Margen con un decimal (DI-07).** Se calcula y se redondea en la API (la mitad hacia arriba). Es el único número que no es entero y es solo de presentación. Si no hay cobros no hay margen: dice "sin base de cálculo", no 0 %.
- **El Resultado vive dentro de Egresos (DI-09).** Es una pestaña más de Egresos (no una pantalla aparte), con dos rutas nuevas en el mismo bloque de rutas (JSON y Excel). Así reutiliza el mismo cálculo de costos y los mismos permisos y el mismo aislamiento entre gimnasios. El detalle de una columna reutiliza el del Resumen, sin ruta nueva.
- **Excel de una sola hoja (DI-10).** Una hoja "Resultado" con la misma tabla y el título debajo (igual que el Resumen). "—" y "sin base de cálculo" van como texto. Sale de la misma función que la pantalla, así no pueden diferir.
- **Permiso propio para el Resultado (DI-01).** Se creó un permiso nuevo (owner y admin) en lugar de reutilizar el de anular gastos, para que abrir o cerrar el Resultado a más roles sea una decisión visible. En el admin también tiene su propia lista de roles.
- **El lector de cobros es un método nuevo (DI-02/DI-08).** Se agregó un método de lectura nuevo al servicio de cobros, sin modificar ni una línea existente (ni el del Tablero). Por eso no comparte código con el Tablero: se duplica un poco a propósito para no tocar un camino que está en producción.
- **Textos compartidos con el Resumen (DI-11).** Los avisos de gastos incompletos y la nota de moneda ahora salen de funciones compartidas, con los mismos textos de antes, fijados por tests.
- **Etiquetas "(inactiva)" y "(virtual)" (DI-06/DI-11).** Se muestran igual en la pantalla y en el Excel; si una sede es las dos cosas dice "(inactiva, virtual)".
- **Base mixta (DI-05).** Los cobros son por fecha de pago y los costos por mes imputado, con los estimados incluidos (D-11). No se intenta hacer coincidir los dos criterios.

**De los ejecutores de cada plan**

- **Un ajuste de saldo de apertura de un banco no cambia el Resultado.** Lo pidió el orquestador al integrar la fase 209.1 (apertura de bancos) y quedó con su prueba. Tiene doble barrera: no tiene alumno ni sede.
- **Una sede con cobros que no pertenece al país se ignora** (no debería pasar, pero si pasara no rompe: no entra al informe).
- **Consolidado "siempre activo"** a efectos del contrato interno: no hay un Consolidado "inactivo".
- **Excel:** la negrita del Consolidado se aplica celda por celda sobre la tabla, no sobre la columna entera, para no teñir el título ni la nota.
- **Un margen que redondea a 0,0 se muestra sin signo** ("0,0 %", nunca "-0,0 %").
- **Leyenda del Consolidado:** "suma de las sedes menos los costos de Casa Matriz, una sola vez" (en el plan decía solo "menos Casa Matriz"; se aclaró "los costos de" para que no se lea como restar cobros).
- **La nota al pie solo se muestra cuando hay datos** (un mes vacío no la muestra).
- **Orden de los avisos:** primero gastos incompletos, después cobros en otra moneda, después el error de carga (si lo hay).
- **Pruebas:** los literales de las pruebas HTTP están comentados con el escenario, y las comparaciones de costos por rubro se hacen contra rubros propios del escenario (el informe suma todo el gimnasio, así que otros datos del mes no ensucian la prueba).

## 4. Pendientes y limitaciones

**Limitaciones conocidas**

1. **Nada del admin se abrió en un navegador.** La pantalla se verificó solo con el chequeo de tipos, el linter y las pruebas de las funciones de formato. El comportamiento visual (colores, columna fija, scroll de costado, el rojo del negativo, los avisos amarillos) lo tiene que mirar Franco en la prueba manual de arriba. Si algo se ve raro, probablemente sea de presentación.
2. **Las devoluciones no restan.** Si un alumno recibe una devolución, el Resultado sigue mostrando el cobro entero. Es el criterio de todo el sistema hoy.
3. **Base mixta:** cobros por fecha de pago, costos por mes imputado. Un mes puede verse flojo o fuerte por esa diferencia de criterio y no por la operación.
4. **Un cobro sin sede de cobro registrada no entra** (mismo criterio que Caja y el Tablero: el cobro tiene que tener una sede donde se cobró para ubicarse).
5. **Los cobros en otra moneda no se suman ni se convierten**: solo se avisan.
6. **El detalle por columna es el del Resumen.** Muestra costos del mes y también lo pagado en el mes, que puede confundir si no se mira la nota.
7. **El selector de mes repite el del Resumen** (código copiado). Si aparece una tercera pestaña con selector de mes, conviene unificarlo en un solo componente.
8. **Las pruebas de las pantallas no existen:** la fase no agregó tests de componentes (el plan lo establece así). Se prueban las funciones de formato y la API, no la pantalla.

**Pendientes fuera de la fase**

1. **La prueba manual de Franco** (arriba).
2. **Push, solo con el OK de Franco.** Antes de pushear, re-verificar con `git fetch` que no haya choques con master/staging. Esta fase no agrega migración, así que no compite por números de migración (la 209 usa la 0331).
3. **Rendiciones a inversores (fase 212) siguen en espera.** Por ahora, administración las arma en planilla a partir del Excel de este informe (D-24).
4. **Fallos preexistentes ajenos a la fase** (2 en `coach-load-alta.test.ts` y 1 en `office-routes.test.ts`): no se corrieron en este plan ni aparecieron en ninguna de las corridas.
5. **Hallazgos del inventario:** ninguno que requiera acción. Las dos aclaraciones están en la tabla de abajo (filas b y e).

## 5. Resultados de tests, gates e inventario

### Tests nuevos de la fase (62 casos nuevos más 2 de aislamiento)

| Archivo | Casos | Qué cubre |
|---|---|---|
| `el-templo-api/test/unit/expense-result-math.test.ts` | 24 | Cuentas puras: columnas, Casa Matriz, Consolidado, margen, rubros sin costo, sedes con cobros |
| `el-templo-api/test/finance/expense-result-income.test.ts` | 6 | Lector de cobros a alumnos por sede (qué cuenta y qué no) |
| `el-templo-api/test/finance/expense-result-rutas.test.ts` | 21 | Rutas JSON y Excel por HTTP, identidades, roles, validación, ruteo, España y apertura de banco |
| `el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts` | +2 describes (aislamiento y control positivo, cada una) | Un gimnasio no ve lo del otro en `/result` ni en `/result/export` |
| `el-templo-admin/src/utils/__tests__/expenses.test.ts` | +9 (de 91 a 100) | Formato del margen, avisos y etiquetas |

### Corridas de esta tanda (todas en foreground, sin reintentos)

| # | Archivos | Pasados | Fallados |
|---|---|---|---|
| 1 | `expense-result-rutas` (21) + `expense-result-income` (6) | 27 | 0 |
| 2 | `no-regresion-208` (14, sin tocar) + `expense-summary-rutas` (18) | 32 | 0 |
| 3 | `egresos-identidades` (10) + `member-branch-snapshot` (14) | 24 | 0 |
| 4 | `by-branch-caja-alumnos` (12, Tablero) + `expense-summary` (23) | 35 | 0 |
| 5 | `iso-01-manifiesto` (13) + `iso-03-cobertura` (8) | 21 | 0 |
| 6 | `iso-03-finance-egresos` (29) + `con-06-lint` (36) | 65 | 0 |
| 7 | Unit API: `expense-result-math` (24) + `expense-math` (90) | 114 | 0 |
| 8 | Unit admin: `expenses.test.ts` | 100 | 0 |
| | **Total** | **418** | **0** |

Notas de la corrida: las corridas 2 a 6 duraron entre 215 y 525 segundos y el harness las pasó a segundo plano a los 180 s; se esperaron con un único `tail --pid` y se leyó el resultado completo. Ningún `Hook timed out` ni reintento. Los 3 fallos preexistentes ajenos (2 en `coach-load-alta`, 1 en `office-routes`) no se corrieron ni aparecieron.

### Gates

| Gate | Esperado | Valor |
|---|---|---|
| `cd el-templo-api && npx tsc --noEmit` | 0 | **0** |
| `npm run -s typecheck:tests` | `DISCREPANCIAS: 18` | **`DISCREPANCIAS: 18`** |
| `npm run -s lint:tenant` | `DISCREPANCIAS: 0` | **`DISCREPANCIAS: 0`** |
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 | **27** |
| `cd el-templo-app && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 21 | **21** |
| `cd el-templo-admin && pnpm lint` | 0 errores | **0 errores, 8 advertencias** (en `env.d.ts`, `CobrosPage.vue` y `session-pdf-builder.ts`: ningún archivo de la fase) |

### Inventario (greps reproducibles)

Rango de la fase: `git diff 9bdc7453d..HEAD`. Ese rango incluye también los commits de la **209.1** (apertura de bancos, otra fase en la misma rama), que tocaron `movement-service.ts`, `routes.ts` (solo un comentario), `ArqueoAperturaDialog.vue`, `CuentasTab.vue` y `opening-count*`. Por eso las búsquedas de contenido (g y h) se aplicaron solo a los archivos de los commits `(211-01)` a `(211-05)` (26 archivos, 3670 líneas agregadas), sin los commits de documentación. Donde el comando dice `$F`, se refiere a esa lista de archivos.

| # | Qué se revisó | Comando | Resultado | Conclusión |
|---|---|---|---|---|
| a | Caminos de cobro intactos | `git diff 9bdc7453d..HEAD -- el-templo-api/src/modules/finance/transaction-service.ts \| grep -cE '^-[^-]'` y `grep -n "getMemberIncomeByBranch"` en ese archivo | 0 líneas borradas o cambiadas (+78 agregadas, todas del método nuevo y un `import`). `getMemberIncomeByBranch` aparece solo en su definición (línea 2887); el único uso es `expense-result-service.ts:63` | Bien: solo agregados |
| b | Tablero y Resumen de cobros sin cambios | `git diff --stat 9bdc7453d..HEAD -- el-templo-api/src/modules/weekly-board` y `git diff 9bdc7453d..HEAD -- el-templo-api/src/modules/finance/routes.ts \| grep -n "transactions/summary"` | Primer comando: vacío. Segundo: vacío. Además, `routes.ts` y `movement-service.ts` no están en ningún commit `(211-NN)`: lo que cambió ahí es de la 209.1 (un comentario de `routes.ts` y el saldo de apertura en `movement-service.ts`) | Bien: el Tablero y `/transactions/summary` no se tocaron |
| c | Sin migración ni tabla nueva | `git diff --name-only 9bdc7453d..HEAD -- el-templo-api/src/db \| wc -l` | 0 | Bien |
| d | Sin dependencias nuevas | `git diff --name-only 9bdc7453d..HEAD -- '*package.json' '*pnpm-lock.yaml' \| wc -l` | 0 | Bien |
| e1 | Permisos en la API | `grep -rn "EXPENSES_RESULT_ROLES" el-templo-api/src` | 5 líneas: definición `["owner", "admin"]` (`permissions.ts:369`), import (`expense-routes.ts:29`), 1 mención en el comentario del archivo (`:12`) y los 2 usos, uno por ruta (`:312` y `:342`) | Bien: el plan esperaba 4 y hay 5 por el comentario del archivo, sin consecuencia |
| e2 | Permisos en el admin | `grep -rn "EGRESOS_RESULTADO_ROLES" el-templo-admin/src` | 3 líneas: definición `['admin', 'owner']` (`templo-config.ts:184`) y en `EgresosPage.vue` el import (`:117`) y el único uso (`:156`, que alimenta `canSeeResult`) | Bien |
| f | Costos sin consulta propia | `grep -cE "expenseRecords\|expenseAllocations\|expensePayments" el-templo-api/src/modules/finance/expense-result-service.ts` | 0 | Bien: el costo sale solo de `computeMonth` |
| g1 | `console.` en lo nuevo | `grep -nE "console\." $F` y sobre las líneas agregadas | 0 y 0 | Bien |
| g2 | `any` en lo nuevo | `grep -nE ": any\b\|as any\|<any>" $F` y sobre las líneas agregadas | 0 y 0 | Bien |
| g3 | `v-html` en lo nuevo | `grep -n "v-html" $F` y sobre las líneas agregadas | 0 y 0 | Bien |
| h | Cantidades fijas de sedes | `grep -nEi "las 6\|6 sedes\|seis sedes\|las seis" $F` | 5 coincidencias en los archivos enteros, **0 en las líneas agregadas por la fase**. Son comentarios viejos que dicen "las 6 rutas" (`iso-01-manifiesto.test.ts:298`, `iso-03-cobertura.test.ts:181`, `tenant-manifest.ts:207, 219, 793`) y no hablan de sedes | Bien: ninguna cantidad fija de sedes en lo nuevo |
| i | Paleta sin azul | `grep -nE "blue\|indigo\|cyan\|'info'\|\"info\"" el-templo-admin/src/components/egresos/ResultadoTab.vue el-templo-admin/src/pages/EgresosPage.vue` | 0 | Bien |
| j | Plata en enteros | `grep -rnE "MoneyInput\|shared/money\|utils/money" el-templo-api/src el-templo-admin/src el-templo-app/src` | 0 | Bien |
| k | Conteos de tenancy | `grep -n "ENTRADAS_BASELINE = \|CASOS_BASELINE = " test/tenancy/iso-01-manifiesto.test.ts test/tenancy/iso-03-cobertura.test.ts` | `ENTRADAS_BASELINE = 570` (568 + 2, con su comentario del 2026-11-13 en `iso-01-manifiesto.test.ts:454`) y `CASOS_BASELINE = 66` (64 + 2, comentario en `iso-03-cobertura.test.ts:187`) | Bien: coinciden y las pruebas que los verifican pasan |

Conclusión del inventario: sin hallazgos. No hubo ningún `fix(211-06)` ni se encontró ningún error de la fase en este plan.

## Commits de la fase 211

| Plan | Commits de código y pruebas | Documentación |
|---|---|---|
| Planificación | | `73e3b3d51` planes de la fase |
| 211-01 cuentas puras y lector de cobros a alumnos | `73c7e74e6`, `aeaa2f2b5` | `68df89c09`, `27376de11` |
| 211-02 servicio, Excel, permiso y rutas de la API | `80f30cd9c`, `57c6da046` | `46e9b18ce`, `4f954b3cc` |
| 211-03 pruebas de la API y aislamiento entre gimnasios | `ac89e20aa`, `8f29785b0` | `4ed398e54`, `8d753d0b6` |
| 211-04 base del admin (tipos, funciones, llamadas) | `736065e88`, `e12d4b839` | `4478654d1`, `3c908f0e5` |
| 211-05 pestaña Resultado en el admin | `73c80d3b6`, `854a9b1ed` | `82168f3f9`, `28e94c921` |
| 211-06 cierre | ninguno (sin cambios de código) | este SUMMARY (`docs(211-06): summary`) |

## Desviaciones del plan

Ninguna. El plan se ejecutó como estaba escrito. Una sola precisión de método: como el rango `9bdc7453d..HEAD` incluye commits de la 209.1, las búsquedas de contenido (g, h) se aplicaron solo a los archivos de los commits de la 211, tal como indicaba el plan.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Este plan solo corre pruebas y escribe documentación: no agrega superficie nueva. T-211-16 (regresión silenciosa en cobros, Caja o Tablero) queda mitigada por las corridas 2, 3 y 4 y por el inventario (a) y (b). T-211-17 (Resultado abierto a más roles) por el inventario (e1) y (e2) y los tests de 403 de 211-03. T-211-18 (decisiones que nadie revisa) por la sección 3.

## Self-Check: PASSED

Las 8 corridas pasaron (418 casos, 0 fallados), los 6 gates están en su línea base y los 11 puntos del inventario están anotados.
