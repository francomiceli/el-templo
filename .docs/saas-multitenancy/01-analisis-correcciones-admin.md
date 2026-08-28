# Fase 1 — Análisis de "Correcciones El Templo" bajo la lente SaaS

> **Input:** [`Correcciones El Templo.md`](./Correcciones%20El%20Templo.md) (documento crudo de Nacho, se conserva intacto).
> **Este doc:** cruza cada mejora contra el diseño multi-tenant ([`README.md`](./README.md)),
> resuelve cada imagen a la página del admin que la dibuja, etiqueta y prioriza.
> **Fecha:** 2026-07-01 · **Estado:** en construcción.

## Principio rector (directiva de Nacho, 2026-07-01)

> **El Templo se asienta sobre el terreno común general lo más posible; lo propio del
> Templo se "dibuja" después, encima.**

Traducción a arquitectura: **estandarizar primero** (adoptar el núcleo genérico white-label),
y tratar lo específico del Templo como una **capa posterior** — no preservar cada
customización como módulo desde el día uno, sino apoyarse en lo común y re-dibujar lo del
Templo sobre eso. Sesgo por default: cuando una pantalla tiene lógica Templo-específica,
la dirección es **generalizar/estandarizar**, dejando la variante Templo como configuración
o módulo apagado por default para otros tenants.

## Qué es realmente este documento

Tres cosas fusionadas, las tres insumo directo del SaaS:

1. **Scope de un MVP white-label.** IN: Finanzas, Alumnos, Horarios, Planes. OUT del MVP:
   Campañas, Profes/Puntuaciones, landing, avatares, rutinas-como-programas.
2. **Modelo de permisos por rol del tenant** (RBAC): "Finanzas y Planes solo para el admin
   del gimnasio; el profe/administrativo solo ve Pagos y no edita planes; Alumnos y Horarios
   libres". Esto es diseño de roles del tenant, mapea sobre `users.role`.
3. **Catálogo de hiper-customizaciones del Templo a estandarizar/modularizar** (ver §4).

**Reconciliación clave:** donde el documento dice "sacar" algo del Templo, casi siempre
significa **"estandarizar o hacer configurable"**, no borrar. Bajo el principio rector,
la mayoría se **generaliza** (el Templo lo reconfigura después); solo lo genuinamente
único (SPOM, motor de rutinas) queda como módulo-Templo a re-dibujar encima.

## Cómo leer las etiquetas

> ⚠️ **Las etiquetas de abajo son PROPUESTAS para discutir, no veredictos.** No asumimos
> unilateralmente qué es núcleo y qué es Templo — cada ítem se discute caso por caso
> (el ejemplo niveles-vs-avatar mostró por qué: parecían lo mismo y eran cosas distintas).
> Lo que sigue es el punto de partida de esa conversación.

| Etiqueta | Significado |
|----------|-------------|
| 🟩 **NÚCLEO** | Feature genérica white-label. Todo gimnasio la necesita. Prioridad de estandarización. |
| 🟦 **MÓDULO-TEMPLO** | Específico del Templo. Se generaliza o se aísla como módulo/config; off por default para otros tenants. |
| 🟨 **REPLANTEAR-TENANCY** | La mejora interactúa con el modelo multi-tenant (scoping por branch/tenant, config por tenant). Decisión de diseño en fase 2. |
| ⬜ **UX-PURO** | Ajuste de UX/UI sin implicancia de tenancy. Se hace tal cual. |

---

## 1. Re-estructuración global y RBAC

**Propuesta de Nacho:** grandes categorías = **Finanzas · Alumnos · Horarios · Planes · Profes**.
Pagos/deudas/caja/analíticas/reportes → dentro de Finanzas. Programas → subcategoría de Planes.
Puntuaciones → subcategoría de Profes. Campañas, Profes y landing fuera del MVP.

- **Estado hoy en código:** nav plana en [`el-templo-admin/src/router/routes.ts`](../../el-templo-admin/src/router/routes.ts)
  + [`layouts/AdminLayout.vue`](../../el-templo-admin/src/layouts/AdminLayout.vue) — sin agrupación por categorías.
  `image1` = diagrama de nav propuesto por Nacho (no es screenshot de código).
- 🟩 **NÚCLEO** la re-agrupación en categorías (Finanzas/Alumnos/Horarios/Planes) — es la IA
  de navegación del producto white-label.
- 🟨 **REPLANTEAR-TENANCY** el RBAC: "Finanzas/Planes solo admin; profe ve solo Pagos". Hoy
  el scoping es owner/admin/gestion/coach/recepcion (ver README §2.2). Hay que mapear estos
  roles del negocio "dueño de gimnasio" vs "empleado/profe" sobre el enum actual, **por tenant**.
  Decisión de fase 2: ¿los roles son globales o configurables por tenant?

---

## 2. Mapa imagen → pantalla → código

Resuelve los `![][imageN]` del documento crudo. Todas las rutas son de `el-templo-admin/src/`.

| Imgs | Sección doc | Página que la dibuja | Notas |
|------|-------------|----------------------|-------|
| image1 | Re-estructuración | *(diagrama de Nacho)* → nav en `router/routes.ts` + `layouts/AdminLayout.vue` | propuesta, no screenshot |
| image2 | Pagos / "cobros de hoy" | [`pages/PagosPage.vue`](../../el-templo-admin/src/pages/PagosPage.vue) | |
| image3 | Caja / pendientes validación | [`pages/CajaPage.vue`](../../el-templo-admin/src/pages/CajaPage.vue) | tabs internos |
| image4 | Caja / Saldos | `pages/CajaPage.vue` (tab Saldos) | |
| image5 | Crear cuenta bancaria | [`pages/ConfiguracionCajaPage.vue`](../../el-templo-admin/src/pages/ConfiguracionCajaPage.vue) | |
| image6 | Caja / Transacciones | `pages/CajaPage.vue` (tab Transacciones) | |
| image7–8 | Detalle transacción | `pages/CajaPage.vue` | |
| image9 | Movimientos de caja / egresos | `pages/CajaPage.vue` | desplegables de egreso |
| image10–11 | Analíticas / Finanzas | [`pages/AnaliticasPage.vue`](../../el-templo-admin/src/pages/AnaliticasPage.vue) | |
| image12 | Analíticas / Miembros | `pages/AnaliticasPage.vue` | |
| image13 | Analíticas / Ingresos, LTV | `pages/AnaliticasPage.vue` | LTV inactivo |
| image14 | Analíticas / Asistencia | `pages/AnaliticasPage.vue` | |
| image15–16 | Analíticas / Retención | `pages/AnaliticasPage.vue` | |
| image17 | Analíticas / Conversión | `pages/AnaliticasPage.vue` | clases de prueba |
| image18–20 | Analíticas / Programas | `pages/AnaliticasPage.vue` | |
| image21 | Deudas | [`pages/DeudasPage.vue`](../../el-templo-admin/src/pages/DeudasPage.vue) | |
| image22–23 | Alumno / registro pago | [`pages/AlumnoDetailPage.vue`](../../el-templo-admin/src/pages/AlumnoDetailPage.vue) | acceso directo en acciones |
| image24–25 | Reglas de precio por medio de pago | `pages/PagosPage.vue` (`getBasePriceFor(plan, method, zero)`) | Templo-específico |
| image26–28 | Alumno / niveles + avatar | [`pages/AlumnosPage.vue`](../../el-templo-admin/src/pages/AlumnosPage.vue), `pages/AlumnoDetailPage.vue` | `greekLevel()`, `avatarType` |
| image29 | Horarios / clases simultáneas | [`pages/HorariosPage.vue`](../../el-templo-admin/src/pages/HorariosPage.vue) | |
| image30 | Horarios / cargar clase | `pages/HorariosPage.vue` | |
| image31 | Horarios / capacidad actividad | `pages/HorariosPage.vue` | |
| image32 | Planes / Precio Zero, efectivo, descuento | `pages/PagosPage.vue` (`zeroPrice`), [`components/PlanFormDialog.vue`](../../el-templo-admin/src/components/PlanFormDialog.vue) | Templo-específico |
| image33 | Planes / acceso a programas | [`pages/PlanesPage.vue`](../../el-templo-admin/src/pages/PlanesPage.vue) | |
| image34 | Planes / configuración de días | `pages/PlanesPage.vue`, `components/PlanFormDialog.vue` | |
| image35 | Planes / promo | `pages/PlanesPage.vue` (promo-plans) | útil para cadenas |
| image36–37 | Programas / rutinas | [`pages/ProgramasPage.vue`](../../el-templo-admin/src/pages/ProgramasPage.vue) | motor de rutinas Templo |

---

## 3. Análisis por categoría

### FINANZAS 🟩 (núcleo, admin-only)
`PagosPage` · `CajaPage` · `ConfiguracionCajaPage` · `AnaliticasPage` · `ReportesPage` · `DeudasPage`

- **Registrar cobro** (renombrar Pagos→Cobros), simplificar a "una sola cosa que hacer",
  pantallas separadas en vez de expansiones anidadas → ⬜ **UX-PURO**.
- **Cuentas bancarias flexibles** (crear/cerrar; Banco, N°, Titular, CUIT, CBU/CVU, Alias;
  3 obligatorios) y **cobro obligado a asociarse a cuenta** → 🟩 **NÚCLEO**. Hoy en
  `ConfiguracionCajaPage.vue`. Genérico para cualquier gimnasio (muchos monotributos, etc.).
- **Validación de movimientos cargados por profes** → 🟨 **REPLANTEAR-TENANCY**: es una regla
  de workflow por rol; debe ser configurable por tenant (no todo gimnasio la quiere).
- **Egresos con categorías genéricas** ("Pago a proveedores", "retiros") en vez de las
  Templo-específicas ("alquiler de la sucursal") → 🟦 **MÓDULO-TEMPLO** → generalizar:
  categorías de egreso configurables por tenant.
- **Retiros del dueño / cuenta personal separada** → 🟩 **NÚCLEO** (concepto contable genérico).

### ANALÍTICAS ⬜/🟨 (dejado para el final por Nacho)
`AnaliticasPage.vue` — cobrado vs devengado, no-renovaciones con total propio, LTV
(activar o dar de baja), asistencia, retención, conversión, programas.
- Mayormente ⬜ **UX-PURO** + definición de métricas.
- 🟨 **REPLANTEAR-TENANCY**: "4225 suscripciones excluidas por fecha/duración" apunta a un
  problema de cómo se modelan planes/membresías que conviene resolver *antes* de multiplicar
  por tenants. Anotado como riesgo de datos.

### ALUMNOS 🟩 (núcleo — "listo para MVP")
`AlumnosPage.vue` · `AlumnoDetailPage.vue`
- **Crear alumno prominente**, **registro de pago como acción directa** (no anidada) → ⬜ **UX-PURO**.
- **No-renovaciones automáticas** cuando no se registra pago → 🟩 **NÚCLEO** (métrica clave de negocio).
- **Reglas de precio por medio de pago** (tarjeta > efectivo) → 🟦 **MÓDULO-TEMPLO** →
  estandarizar: dejar el recargo por método **configurable por tenant** o quitarlo del default.
  Código: `PagosPage.vue` `getBasePriceFor(plan, method, zero)`.
- **Niveles** (`kairos→alfa→delta→sigma→omega→spartan`, `greekLevel()`) → 🟦 **MÓDULO-TEMPLO**.
  Es la metodología de progresión **propia del Templo**; un gimnasio genérico no tiene este
  concepto. Ausente/off por default para otros tenants (NO se "estandariza a niveles genéricos":
  no existe tal universal). Se re-dibuja encima como módulo Templo.
- **Avatar** (`member_profiles.avatarType`, código de 2 chars = segmentación de socio) →
  🟩 **NÚCLEO**. SÍ es generalizable — cualquier gimnasio quiere categorizar socios —, pero
  **con otro nombre** neutro (p. ej. "segmento" / "categoría de socio"). "Avatar" es el rótulo
  Templo; el mecanismo subyacente es genérico y se conserva.

### HORARIOS 🟩 (núcleo — "camina para MVP")
`HorariosPage.vue`
- **Clases simultáneas en misma sucursal** (hoy no lo permite) → 🟩 **NÚCLEO** (musculación
  conviviendo con actividades es lo normal en gimnasios).
- **Cargar clase desde el horario** (hoy solo "test de profe", muy Templo) → 🟦 **MÓDULO-TEMPLO**
  → generalizar a "crear clase/actividad".
- **Capacidad por actividad** (no solo por sucursal) → 🟩 **NÚCLEO**.
- **Asistencia por QR desde la app** → 🟨 **REPLANTEAR-TENANCY** (toca app de cliente + flujo por tenant; post-MVP).

### PLANES Y PROGRAMAS 🟩/🟦
`PlanesPage.vue` · `ProgramasPage.vue` · `PlanFormDialog.vue`
- **Renombrar**: "Rutinas de entrenamiento" (programas) y "Planes de pago" (planes) → ⬜ **UX-PURO**.
- **Precio "Zero"** (`zeroPrice`, `plan.priceZero`) → 🟦 **MÓDULO-TEMPLO** → estandarizar el
  concepto de precio; "Zero" es una regla Templo, hacerla config o quitarla del default.
- **Actualización de precio por inflación sin crear plan nuevo** → 🟨 **REPLANTEAR-TENANCY**:
  verificar que subir precio no rompa históricos (regla de negocio a validar, crítica multi-tenant).
- **Selección múltiple de programas por plan** y **promo (cadenas)** → 🟩 **NÚCLEO**.
- **Programas como rutinas por objetivo/músculo/nivel/día + IA** → 🟦 **MÓDULO-TEMPLO**,
  explícitamente **post-MVP**. Es el territorio de SPOM / motor de sesiones del Templo.

### FUERA DEL MVP
- **Campañas** (`CampaniasPage.vue`), **Profes/Puntuaciones** (`PuntuacionesPage.vue`),
  **landing**, **Blog/Gladius/Academy/Franchise/Labs** (features Templo/marketing).
  → 🟦 **MÓDULO-TEMPLO**, apagados por default en el white-label.

---

## 4. Catálogo de hiper-customizaciones Templo a estandarizar (verificado en código)

Lo que el documento manda "sacar". Bajo el principio rector, cada ítem cae en **generalizar/renombrar**
(🟩 va al núcleo) o **aislar como módulo Templo** (🟦 off por default para otros tenants):

| Customización | Código | Dirección |
|---------------|--------|-----------|
| Niveles `kairos→alfa→delta→sigma→omega→spartan` | `db/schema/users.ts` (levelEnum) · admin `constants/levels.ts`, `AlumnosPage.vue` `greekLevel()` | 🟦 Módulo-Templo: propio del Templo, off/ausente por default para otros tenants (no hay "nivel genérico") |
| Avatar (`member_profiles.avatarType`) | api `db/schema/member-profiles.ts` · admin `AlumnosPage.vue` | 🟩 Núcleo: segmentación de socio genérica; renombrar a neutro ("segmento"/"categoría de socio"), conservar mecanismo |
| Precio "Zero" | `PagosPage.vue` `zeroPrice`/`plan.priceZero` | Concepto de precio genérico + config |
| Recargo por medio de pago | `PagosPage.vue` `getBasePriceFor(plan, method, zero)` | Configurable por tenant o quitar del default |
| Egresos "alquiler de sucursal" | `CajaPage.vue` (categorías de egreso) | Categorías de egreso configurables por tenant |
| SPOM / motor de rutinas | `db/schema/spom-*` · `ProgramasPage.vue` · api `modules/spom`, `modules/sessions` | Módulo-Templo puro; re-dibujar encima (post-MVP) |
| `spom_config` CHECK(id=1) | `db/schema/spom-config.ts` | Mina: por-tenant o exclusivo Templo (README §2.4) |

---

## 5. Banderas / conflictos para fase 2

- **RBAC del negocio ("dueño" vs "empleado/profe") vs enum actual** (owner/admin/gestion/coach/recepcion):
  hay que mapearlos y decidir si los roles son fijos o configurables por tenant.
- **Modelo de subscriptions — DIAGNOSTICADO (read-only en prod, 2026-07-01).** El "4225
  excluidas" NO es deuda de modelo, es **dato sucio de un import histórico**. De 7422 subs,
  **4260 tienen ventana invertida** (`end_date < start_date`), todas `cancelled`, y **4214
  vienen de un único import del 2026-03-16** que puso `start_date` = fecha del import
  (placeholder) mientras `end_date` guarda la fecha real vieja. Las 3162 no-invertidas están
  sanas (736 activas). Conclusión: **el modelo de `subscriptions` es sólido** — no necesita
  rediseño para multi-tenant. `advanced-finance-service.ts` (`excludedInvalidWindow`)
  correctamente descarta esas ventanas inválidas del devengado; es un caveat honesto, no un bug.
  - **Acción opcional (baja urgencia):** migración de datos para corregir `start_date` de esas
    filas canceladas históricas (la fecha real no se recupera con `end - duration` — solo 6/4260
    matchean —, requeriría el CSV origen). No bloquea nada operativo.
  - **Lección para el SaaS:** el tooling de onboarding/import de tenants NO debe repetir esto —
    `start_date` tiene que setearse con la fecha real, no con la del import.
  - **Bandera menor:** 46 filas invertidas son POSTERIORES al import (abr-2026) → algo puede
    seguir generando ventanas invertidas ocasionalmente; vale una mirada, no urgente.
- **Regla de actualización de precios sin crear plan nuevo**: verificar que no rompa históricos
  (pendiente de revisar en fase 2; independiente del punto anterior).
- **Asistencia por QR + app de cliente**: cruza el límite admin↔app y toca flujo por tenant.
- **Niveles/avatar/SPOM**: confirmar cuáles se generalizan vs cuáles quedan como módulo Templo
  a re-dibujar (el principio rector inclina a generalizar todo lo posible).

## Registro de cambios
- **2026-07-01** — Creación. Análisis completo de `Correcciones El Templo.md` bajo lente SaaS:
  mapa imagen→código, tagging por categoría, catálogo de-Templo-ficación verificado en código.
