# Phase 206: Tablero semanal de gerencia - Context

**Gathered:** 2026-11-03 (conversación con Franco + respuestas de Nacho por escrito)
**Status:** Ready for planning

<domain>
## Phase Boundary

Una pantalla nueva del admin, `/tablero`, que reemplaza la pestaña **Tablero** de la planilla de gerencia: las sedes en columnas y las métricas clave de la semana en filas, con la semana anterior y ▲▼. Se mira los lunes, en los primeros 15 minutos de la reunión de gerencia, para **decidir rápido**. No es una herramienta de gestión de tareas.

**Dentro:** la pantalla, un endpoint que arma la matriz reusando los cálculos existentes, el cierre semanal automático (fotos congeladas), la carga manual de leads por sede y por semana, el menú/landing y los tests.

**Fuera (no hacer):**
- Integración con Kommo. Salir de Kommo es un proyecto aparte (bandeja de WhatsApp/IG, plantillas, embudo por etapas, recordatorios). Ver D-04.
- La columna "qué hacemos" (Nacho: se lleva por fuera, el Tablero queda limpio).
- Fase 2 mensual: mix de planes del mes y ocupación por franja horaria.
- Tocar los cálculos o las pantallas de origen (Sesiones de prueba, Renovaciones, Caja, Deudas, Analíticas). Se reusan, no se cambian, salvo extraer helpers sin cambiar su comportamiento.
- Exportar a Excel.

**Referencias del pedido:**
- Pedido original de gerencia y estructura de la planilla: imagen `/home/franco/projects/el-templo/.docs/WhatsApp Image 2026-11-03 at 16.08.03.jpeg` (filas Bloque/Métrica/De dónde sale, columnas por sede, Total, Semana anterior, Desvío).
- Preguntas: `/home/franco/projects/el-templo/.docs/tablero-semanal-preguntas-socio.md`.
- Respuestas de Nacho: `/home/franco/projects/el-templo/.docs/tablero-semanal-respuestas-fran.md` (fuente de verdad de las definiciones de negocio).
</domain>

<decisions>
## Implementation Decisions

### Ubicación y acceso
- **D-01:** Sección propia `/tablero`, primera entrada del menú para owner, admin y gestion. Nada de pestaña dentro de Reportes ni dentro de Oficina (fase 205).
- **D-02:** admin_sede ve el mismo Tablero con una sola columna, la de su sede (forzado server-side con el mismo mecanismo de alcance por sede que ya usan Reportes/Caja: `enforceBranchScope` / `enforcedBranchIds`). Sin Total ni otras sedes.
- **D-03:** Landing: owner y admin aterrizan en `/tablero` (hoy `/alumnos`). **gestion sigue aterrizando en `/cobros`** (lo usa para cobrar todo el día) y admin_sede sigue en `/caja`. ⚠️ Decidido por el orquestador, revisar con Franco.

### Leads (Kommo)
- **D-04:** Leads = **carga manual** por sede y por semana, editable desde el mismo Tablero (celda editable en la fila "Leads"). Lo cargan owner/admin/gestion; admin_sede solo la de su sede. Sin integración con Kommo. Cuando los leads vivan en el admin (proyecto aparte), el número pasa a contarse solo.
- **D-05:** Sin leads cargados, la celda muestra "—" y % Reserva también "—" (no 0 %).

### Semanas y cierre
- **D-06:** Semana = lunes a domingo en hora de Argentina. Usar el mismo helper de semanas que Renovaciones y Sesiones de prueba (`getWeekRange`, `el-templo-admin/src/utils/renewals-week.ts`), NO las semanas ISO de Analíticas.
- **D-07:** Selector de semana: por defecto la semana en curso, con semanas anteriores.
- **D-08:** **Cierre automático** el domingo a la noche (job; correrlo el lunes 00:05 AR cubre el domingo entero). El cierre guarda una **foto por sede** de la semana que terminó. Las semanas cerradas se leen de la foto y no cambian más. La semana en curso se calcula en vivo.
- **D-09:** **Margen de renovación tardía = 4 días** (Franco, 2026-11-03: "si se te vence el domingo, renovaciones estaría cerrada para el jueves"). El bloque Renovaciones de la semana W se congela al terminar el jueves siguiente (corrida viernes 00:05 AR). Hay entonces **dos congelamientos por semana**: lunes 00:05 (caja, deuda, alumnos, leads y "vencen la semana que viene" de la semana que cerró) y viernes 00:05 (Renovaciones y Embudo de la semana anterior). Entre el lunes y el jueves esos dos bloques se ven en vivo, marcados como "provisorio". Dato de prod (2026-11-03, n=1812 vencimientos): de los que vuelven dentro de 90 días, el 79 % ya volvió al día 3 y el 85 % al día 5. Con el margen, lo que vence el domingo tiene 4 días y lo que vence el lunes, 10. Diferencia aceptada: "renovó" usa una ventana de 5 días, así que quien vence el domingo y renueva el viernes (día 5) no entra como "renovó" en la foto, pero sí en la pantalla en vivo de Renovaciones.
- **D-10:** El bloque Embudo tiene el mismo problema ("Compraron" = de las pruebas de la semana, cuántas terminaron en compra, aunque compren días después), así que **se congela con el mismo margen de 4 días que Renovaciones** (corrida del viernes). ⚠️ Decidido por el orquestador (Nacho solo pidió margen para renovaciones), revisar con Franco.
- **D-11:** Semanas pasadas sin foto (todas las anteriores al deploy): Embudo, Renovaciones y Cobrado se calculan en vivo (las APIs de origen aceptan rango de fechas); Alumnos activos y Deuda muestran "—" porque no hay historia ni forma de pedirlos "a tal fecha". No reconstruir historia en esta fase.

### Sede de cada número (Nacho, punto 4)
- **D-12:** Regla general: **la sede asignada del alumno** (`users.branch_id`). Verificado: es la "sede asignada por asistencia" que pidió Nacho. El job mensual `jobs/reassign-multibranch.ts` la recalcula para los planes multisucursal según dónde más asistió; en planes de una sede, es la sede del plan. Se usa para Cobrado, Renovaciones, Deuda (incluidas las deudas sueltas sin membresía, punto 5) y Alumnos activos.
- **D-13:** Excepción, el **Embudo**: cuenta en la sede de la clase de prueba (en la práctica, la primera sede donde quedó radicada la persona). Es la misma regla que ya usa Sesiones de prueba.
- **D-14:** Consecuencia aceptada: **Cobrado por sede no coincide con Caja por sede** (Caja usa la sede del cobro: un alumno de una sede que paga en otra cuenta distinto). Los totales del país sí coinciden. La pantalla lo aclara con una nota corta en la fila.
- **D-15:** Las columnas son las sedes **activas y no virtuales** del tenant (`branches.is_active`, `branches.is_virtual`), con los nombres de la app. **Nunca hardcodear sedes ni cantidad de sedes.** Las sedes virtuales (Online) quedan afuera de las columnas.

### Moneda (Nacho, punto 3)
- **D-16:** El **Total** suma solo las sedes de Argentina, en pesos. Las sedes de otros países (hoy Barcelona) van en un grupo aparte, en su moneda (euros), sin convertir. Resolver país/moneda desde `branches.country`, no por nombre de sede.

### Métricas (reusar los cálculos que ya existen)
- **D-17 Embudo:** Reservas, Asistieron y Compraron = `computeTrialSessionKpis` de Reportes › Sesiones de prueba, con el rango de la semana y por sede de la clase. % Reserva = reservas / leads, % Asistencia = asistieron / reservas, % Cierre = compraron / asistieron, % Conversión total = compraron / reservas. Se descarta el embudo de Analíticas (solo gente nueva con 21 días).
- **D-18 Renovaciones:** Vencimientos, Renovaron, No renueva, Volvió tarde y Sin contactar = `computeKpis` de Reportes › Renovaciones (ventana de 5 días, tipo de actividad "membresía", el mismo default de esa pantalla). % Renovación = renovó / (renovó + no renueva + volvió tarde), la misma fórmula. "Sin contactar" en rojo si > 0. **Vencen la semana que viene** = Vencimientos del rango de la semana siguiente.
- **D-19 Caja:** Cobrado en la semana = la misma definición de "plata firme" de Caja (ingresos no anulados, validados, sin `cash_transfer` ni `expense`; `buildRevenueConditions` / `firmMoneyConditions`), agrupado por sede del alumno (D-12) y por moneda.
- **D-20 Deuda:** Deuda cobrable, Deuda de más de 10 días (tramos 11-15 + 15+) e Incobrable = la misma lógica de Deudas › Por deuda (`getOutstandingBalances`: `computeBucketOB`, estado `effectiveDebtStatusSQL`), agrupada por sede del alumno. Es la foto del momento: en la semana en curso, la de hoy; en las cerradas, la del cierre.
- **D-21 Alumnos:** Alumnos activos = la misma definición de Analíticas (`activePayingNonEspecialMemberExists`), por sede del alumno. Variación = activos de la semana − activos de la foto de la semana anterior.
- **D-22 Comparación:** cada celda muestra a su lado la semana anterior de esa misma sede con ▲▼. Además, las columnas Total, Semana anterior (Total de la semana previa) y ▲▼, igual que la planilla. El ▲▼ de los porcentajes es en puntos porcentuales.
- **D-23 Coincidencia:** para la misma semana y sede, cada número coincide con su pantalla de origen, con dos excepciones documentadas: Cobrado por sede (D-14) y las semanas congeladas (D-08/D-09), que pueden diferir de lo que hoy muestran las pantallas en vivo.

### Claude's Discretion
- Forma del almacenamiento (una tabla de fotos por semana/sede con columnas por métrica vs. JSON), nombres de tablas y del módulo API (sugerido `weekly-board` o `tablero`).
- Si el endpoint arma todas las sedes en una sola llamada con queries agrupadas por sede (preferido: evitar N llamadas por sede y N+1) o reusa los servicios por sede.
- Diseño visual dentro de la paleta de la marca (cálida, sin azul), tabla densa tipo planilla, filas agrupadas por bloque. Español rioplatense en la UI.
- Cómo marcar "provisorio" y "sin foto".
### Enmiendas del orquestador tras la investigación (Franco ausente, opción recomendada; revisar al volver)
- **D-24 (enmienda D-04/D-08):** los **leads no se copian a la foto**. Viven en su propia tabla y se pueden editar en la semana en curso y en la anterior, porque Nacho los carga en la reunión del lunes, después del cierre de las 00:05. El Tablero los lee siempre de esa tabla.
- **D-25 (enmienda D-14/D-15):** los alumnos online están en la sede virtual, así que el Total AR de las sedes físicas da menos que Caja AR. Se suma una **columna informativa "Online"** (sedes virtuales activas del país), que **no suma al Total**. La nota de Cobrado dice: "Total de sedes físicas, sin Online".
- **D-26 (enmienda D-17):** las fórmulas del Embudo son **exactamente las de la pantalla Sesiones de prueba** (denominador de clases ya ocurridas; cierre = compraron con asistencia / asistieron). Los porcentajes del Total se recalculan desde los conteos crudos, nunca promediando porcentajes.
- **D-27 (enmienda D-16):** se respeta el **alcance por país** del rol: un admin o gestion de Argentina no ve el grupo Barcelona; el owner ve todo (sin forzarle `scope.country`).
- **D-28 (enmienda D-01):** en el menú va una **categoría nueva "Gerencia"** al tope, con la entrada Tablero, en lugar del primer lugar de "Gestión" (donde va a estar Oficina).
- **D-29 (enmienda D-23):** tercera excepción a la coincidencia: Renovaciones por sede puede diferir de la pantalla de Renovaciones, porque el Tablero agrupa por la sede del alumno y la pantalla por la sede de la membresía que vence (las vencidas no se resincronizan cuando la sede del alumno cambia después).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pedido y definiciones
- `/home/franco/projects/el-templo/.docs/tablero-semanal-respuestas-fran.md`: respuestas de Nacho, fuente de verdad de negocio.
- `/home/franco/projects/el-templo/.docs/WhatsApp Image 2026-11-03 at 16.08.03.jpeg`: la planilla de referencia.

### Cálculos a reusar (inventario 2026-11-03, verificar líneas)
- Embudo: `el-templo-api/src/modules/reports/service.ts`, `getTrialSessionsReport` (~2182) y `computeTrialSessionKpis` (~196-239); admin `components/reports/TrialSessionsReport.vue`.
- Renovaciones: `el-templo-api/src/modules/renewals/service.ts`, `listRenewals` (~411), `fetchExpiringRows` (~458), `deriveRow` (~245), `computeKpis` (~328-395), `RENEWAL_FOLLOWUP_WINDOW_DAYS = 5`; admin `components/renovaciones/RenovacionesTab.vue`, `utils/renewals-week.ts`.
- Caja: `el-templo-api/src/modules/finance/transaction-service.ts`, `getIncomeByBranch` (~2667), `buildRevenueConditions` (~2488); `finance/firm-money.ts`.
- Deuda: `el-templo-api/src/modules/reports/service.ts`, `getOutstandingBalances` (~1467), `computeBucketOB` (~312), `effectiveDebtStatusSQL` (~1126); admin `components/deudas/PorDeudaTab.vue`.
- Alumnos activos: `el-templo-api/src/modules/analytics/service.ts`, `getActiveMembersKpi` (~243); `modules/shared/active-member.ts`.
- Sede asignada: `el-templo-api/src/jobs/reassign-multibranch.ts`, `users.branch_id` (`db/schema/users.ts` ~156).

### Admin
- Menú: `el-templo-admin/src/config/templo-config.ts` (`NAV_MODEL` ~281-467, `isNavItemVisible`).
- Rutas y landing: `el-templo-admin/src/router/routes.ts` (`landingForRole` ~28).

### Reglas del repo
- `CLAUDE.md` (sin `any`, logger, tests de integración obligatorios para rutas nuevas, Pinia composition, composables con `cleanup()`).
- Skill `el-templo-db-migrations` (migración a mano, numeración, sin `;` en comentarios SQL).
- Tabla gym-owned nueva = 5 conteos fijos de tenancy; ruta o job nuevo = 3 gates de tenancy (ver memorias `reference_tabla_gym_owned_nueva_cinco_conteos`, `reference_gates_tenancy_ruta_job_nueva`).
- Numeración de migraciones: master está en 0318 (0316 la reserva Oficina en `feat/oficina`) → usar la siguiente libre al planificar y confirmar contra `origin/master` y `feat/oficina`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Las 5 fuentes ya filtran por rango de fechas y por sede (inventario 2026-11-03). Ninguna devuelve agrupado por sede, así que el Tablero necesita una agregación por sede o una llamada por sede.
- `getWeekRange(offset)` en el admin, ya usado por Renovaciones y Sesiones de prueba.

### Established Patterns
- Alcance por sede de admin_sede forzado server-side (`enforceBranchScope`).
- Jobs con `node-cron` y barrido por tenant activo (`forEachActiveTenant`, ver `jobs/reassign-multibranch.ts`).
- Fechas "hoy" en la zona horaria de la sede (`todayInTz`): ojo con UTC de noche.

### Trampas conocidas
- Analíticas mezcla sede del cobro y sede del alumno; el Tablero usa una regla explícita (D-12/D-13).
- `getSummary` de Caja suma monedas sin separarlas: usar el desglose por moneda.
- Las deudas sueltas (`debt_balance`) no tienen sede en Deudas: en el Tablero van por sede del alumno.
- Hay dos ventanas de renovación (5 días en Renovaciones, 15 en Analíticas): usar 5.
- Tests con fecha fija o con UTC vs zona horaria de la sede se rompen de noche (memorias `reference_test_arpu_dependiente_del_calendario`, `reference_test_shifts_utc_vs_tz_sede`).
</code_context>

<specifics>
## Specific Ideas

- La pantalla tiene que leerse como la planilla: Bloque | Métrica | sedes… | Total | Semana anterior | ▲▼. Es para mirar 15 minutos y decidir.
- "Sin contactar" en rojo si > 0 (la planilla dice "tiene que estar en 0").
- Uso interno: ningún número sale en materiales públicos.
</specifics>

<deferred>
## Deferred Ideas

- Salir de Kommo: leads, bandeja de WhatsApp/IG, plantillas, embudo por etapas y recordatorios dentro del admin. Proyecto aparte.
- Fase 2 mensual: mix de planes y ocupación por franja.
- Reconstruir la historia de alumnos activos y deuda para semanas anteriores al deploy.
- Metas por sede para medir el desvío contra objetivo (Nacho eligió solo contra la semana anterior).
</deferred>

---

*Phase: 206-tablero-semanal*
*Context gathered: 2026-11-03*
