# Fase 201: Conquer v2 (de cero, simple) - Research

**Investigado:** 2026-10-21
**Dominio:** módulo nuevo de entrenamiento por progresiones (API Fastify + Drizzle/MySQL, app Quasar/Capacitor dentro de Entrenar, admin Quasar) con motor de progresión puro, fotos privadas en R2 y mapa muscular.
**Confianza:** ALTA en inventario de código, migraciones, tenancy, motor (el oráculo se ejecutó); MEDIA en el modelo de datos propuesto y en los defaults de las ambigüedades (marcados `[ASSUMED]`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

(Copiadas verbatim de `201-CONTEXT.md`. Fuente de verdad: `ref/conquer-desarrollo-sintesis.md`. Oráculo del motor: `ref/conquer-app.html` función `next()`, con `ref/conquer-registro.xlsx`. Estética y pantallas: `ref/conquer-prototipo.html`.)

- **D-01 De cero sobre master.** Conquer se rehace en esta rama (`feat/201-conquer`, worktree `et-201-conquer`, base `origin/master` `6d0298eef`). No se refactoriza la Conquer de la fase 196.
- **D-02 Sin el circuito de Personalizados.** No hay solicitud, cuestionario, pago ni entrega. El coach activa Conquer a mano y elige nivel y días (§7.2). La pantalla Bloqueado tiene el botón "Quiero desbloquearlo", que avisa al admin (§7.1).
- **D-03 La rama 196 queda guardada** (`feat/196-personalizados`, worktree `et-196-personalizados`). No se borra ni se publica. Sirve de consulta y de cantera para copiar piezas.
- **D-04 Híbrido: piezas que se copian de la 196 y se adaptan:**
  - fotos privadas del control físico (R2 privado + URL firmada)
  - marcas del catálogo `unilateral` y `brazos_rectos`
  - editor de escaleras
  - comparador antes/después
  - **mapa muscular** (D-05)
- **D-05 Mapa muscular SÍ entra.** Es una decisión de Franco que contradice la síntesis §11 ("Mapa de equilibrio muscular" fuera de esta versión). Se trae desde la 196 (`balance-map.ts`, `muscles.ts`, `exercise_muscles`, `BalanceMap.vue`, `anatomia.json`). Ojo con la fase 200 (anatomía), que también trabaja músculos: revisar la superposición antes de planificar.
- **D-06 Lo que se escribe de cero:**
  - registro de la sesión: un número por escalón, el peor de las 3 series, más el `prev`
  - motor de progresión, con el botón Subir del alumno y sin aprobación del coach
  - pantallas Hoy, Sábado y Progreso
  - tablero del coach con semáforo y recortes
  - combos de Toro
- **D-07 Lo que NO se trae de la 196:**
  - bandeja de sugerencias (aprobación del coach)
  - modo sin conexión (cola offline)
  - registro por serie
  - alerta de estancamiento
  - acople con `personalized_*`
- **D-08 Quién maneja Conquer (§5, §7.2).** Por ahora solo los roles `owner` y `admin`: activan alumnos, ven el tablero y las fichas, aceptan recortes y pasos de nivel. Más adelante se abre a los `coach`. Para que abrirlo después sea barato, el alumno guarda igual su campo `coach` (§9), y los permisos se resuelven en un solo helper. Las fotos (§6, "solo el alumno, su coach y Nacho") las ven por ahora el alumno, owner y admin.
- **D-09 Estética (§10).** Se usa la submarca de Nacho: azul noche, dorado y crema, Cormorant Garamond + Jost, sol, nubes, templo de columnas, letras griegas. Aplica **solo dentro de Conquer**; el resto de la app sigue con la paleta de El Templo. Revierte la D-51 de la fase 196. Las fuentes van empaquetadas en el build, sin CDN en producción.
- **D-10 Dónde vive en la app.** Conquer va dentro de **Entrenar**, como tab. Vuelven las tabs de la fase 197, que hoy están apagadas con `ENTRENAR_TABS_ENABLED = false` (`99152a195`). Por ahora son solo dos: **"Semana"** y **"Conquer"**. Libre sigue apagado. Por eso la rama 201 se basa en `origin/staging`, que tiene la 197.
- **D-11 Pop-up de lanzamiento.** Se diseña un pop-up que se muestra **una vez a todos los alumnos** cuando Conquer esté listo y lleva a Entrenar ▸ Conquer. Se arma con el sistema de pop-ups de Comunicaciones (fase 193, modo "una vez"), más un destino nuevo hacia la tab Conquer. El diseño va en un boceto antes de planificar.
- **D-12 Alumno sin Conquer (§7.1 Bloqueado).** Todos los alumnos ven la tab Conquer. Si no la tiene activada, ve la pantalla Bloqueado con el botón **"Quiero desbloquearlo"**. Tocarlo registra un **pedido**: aparece en una lista de pedidos en el admin, con contador, y el alumno ve "Ya le avisamos al equipo". Desde la lista, owner o admin lo activan eligiendo nivel y días (§7.2).
- **D-13 Mapa muscular: dónde se ve (complementa D-05).** Como en la 196, en dos lugares: (a) al tocar **Guardar** en Hoy, la figura con lo que se iluminó en esa sesión; (b) en **Progreso**, la figura de la semana. Solo se encienden los músculos trabajados, sin números, porcentajes ni rojo. La regla de encendido de la 196 (2 series como principal o 4 como secundario) se adapta al registro nuevo: cada escalón cargado con valor mayor que 0 cuenta como 3 series (las 3 series de la sesión). El hold final y el finisher no cuentan. Para planificar: reusar la figura anatómica compartida de la 197 (plan 197-10) en vez de copiar `anatomia.json`, y revisar qué hace la fase 200.
- **D-14 Propuestas abiertas de Nacho (§14, §2.1, §8.2).** Se construye con sus propuestas tal como están, y se dejan **editables desde el admin** para que Nacho las valide en la prueba sin tocar código:
  - plantillas de 2 y 3 días (§2.1), como datos
  - arranque de Novillo y Ternero: 1 y 2 peldaños más fáciles que Toro (§8.2), como parámetro por nivel
  - regla de combos (§14.3): si completa el objetivo de series N semanas seguidas (N = 2, editable), aparece Subir en la progresión de arranque, con el mismo patrón que los escalones (§4.5)
- **D-15 Control físico del día 0 (§6).** La primera vez que el alumno entra a Conquer (ya activado), lo primero que ve es el control físico: 3 fotos (frente, perfil y espalda) y perímetros, en menos de 3 minutos. Tiene un **"Lo hago después"** chico. No es obligatorio para entrenar. Si lo saltea, queda un aviso fijo en Inicio y a owner y admin les aparece una alerta 🟡 "Control día 0 pendiente". Esa alerta se suma a las del §5, junto a "Control físico vencido".
- **D-16 Qué día le toca (§1.3, §2.1, §7.1 Hoy).** Hoy no elige la sesión por día de la semana, como hace la app de Nacho. Muestra **el primer día del plan que le falta en la semana calendario en curso** (lunes a domingo, en la zona horaria de la sede), en el orden del plan: Plancha → Front → Vertical → Dominadas, y el sábado al final para Toro. El alumno puede cambiarlo con un toque. Si ya completó todos los días de la semana, ve "Semana completa" y puede repetir cualquiera. La semana calendario es la misma unidad que usan el paso de nivel (§2.2, "4 semanas seguidas") y la semana del bloque de los combos (§3.2).

**Lectura cerrada (2026-10-21).** El resto de la síntesis se sigue tal cual, sin decisiones de Franco pendientes:
- §4 motor: el oráculo es `next()` de `ref/conquer-app.html`
- §5 alertas y recortes
- §8 catálogo: lo carga una migración con los datos de Nacho
- §9 datos: el modelo lo define el planner
- §12: criterios de éxito

### Claude's Discretion

- **El modelo de datos (§9) lo define el planner** ("Cómo se modela es decisión tuya", §9; "el modelo lo define el planner", CONTEXT). Esta investigación propone uno en la sección 8.
- Cómo reusar la figura (D-13 pide reusar la figura de la 197 en vez de copiar `anatomia.json`): decisión técnica abierta, recomendación en la sección 2.
- Estructura de pantallas dentro de la tab Conquer, rutas internas, y navegación interna (no está fijada salvo las pantallas de §7.1).

### Deferred Ideas (OUT OF SCOPE)

Del CONTEXT (D-07) y de la síntesis §11 ("Lo que no va en esta versión"): bandeja de sugerencias, modo sin conexión, registro por serie, alerta de estancamiento, acople con `personalized_*`, armador de combos (los combos son fijos), cargar reps de cada elemento del combo, confirmación del coach para subir de progresión, cobro dentro de la app, IA. Libre (197) sigue apagado. Apertura a `coach` queda para después (solo el helper de permisos la prepara). (El mapa de equilibrio de §11 SÍ entra por D-05/D-13.)
</user_constraints>

<phase_requirements>
## Phase Requirements

No se recibieron IDs de requisitos. Se usan como requisitos los criterios de éxito de la síntesis §12 (`S12-n`, en el orden de la lista).

| ID | Descripción | Research Support |
|----|-------------|------------------|
| S12-1 | Un coach da de alta un alumno (nivel y días) en <5 min y la plantilla aparece sola | Secciones 8 (conquer_members/steps/template_days), 5 (helper de permisos); alta crea steps desde la tabla de arranque + parámetro de nivel |
| S12-2 | El alumno carga una sesión completa en <1 min con contadores precargados | Sección 9 (`next()` devuelve el objetivo; el server precarga), pitfall de "precarga = objetivo" |
| S12-3 | Ternero y Novillo no ven combos ni sábado; Toro sí | Sección 8 (`conquer_levels` vía settings + `has_combos` por nivel), tests de integración |
| S12-4 | La semana 1 propone subir, quedarse o bajar según el E1 | Sección 9.4 (calibración: no está en el oráculo, se escribe + casos dorados del §4.3) |
| S12-5 | Con 6, 7, 8, 8 aparece SUBIR; el botón pasa a la progresión siguiente y la próxima sesión arranca en 3 | Sección 9 (caso dorado verificado ejecutando el oráculo) |
| S12-6 | Una molestia de 4 genera una alerta roja con la propuesta de recorte | Secciones 8 (conquer_alerts), 9.6 (recortes §5.1) |
| S12-7 | Un coach con 30 alumnos ve en una pantalla quién necesita algo | Tablero: un endpoint, alertas derivadas en lectura (sin cron), sección 8 |
| S12-8 | El control físico del día 0 se pide al activar el modo; las fotos no se ven sin permiso | Secciones 1 (fotos privadas), 12 (seguridad), D-15 |
| S12-9 | Todo funciona en un celular de 390 px | Validación manual (UAT) + sección 2 (pane propio con cielo azul) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directivas accionables de `/home/franco/projects/et-201-conquer/CLAUDE.md` y de los skills de `.claude/skills/` (tratadas con la autoridad de decisiones bloqueadas):

- **Logging:** API con Pino (`request.log`, `app.log`), nunca `console.log`. Frontends con `createLogger()` de `src/utils/logger.ts`, nunca `console.*`.
- **TypeScript:** sin `any`; `unknown` + narrowing; `catch (err: unknown)` con `instanceof Error`.
- **Tests de API:** toda ruta nueva lleva test de integración en `el-templo-api/test/` contra MySQL real (`eltemplo_test`), con `test/helpers.ts`. No hardcodear ids de `users` en tests (memoria).
- **Base de datos:** cambios por `src/db/schema/` + SQL **a mano** en `src/db/migrations/NNNN_nombre.sql` en el MISMO commit. **Nunca** `drizzle-kit migrate`/`db:push`/`db:generate`. Sin `;` dentro de comentarios `--` (usar `--> statement-breakpoint` entre statements). `mysqlEnum` primer arg = nombre físico de columna. Datos de prod por migración; datos de prueba nunca en migración (staging y prod comparten host MySQL, bases `eltemplo_staging` y `eltemplo`).
- **Env vars nuevas:** actualizar `.env.example` correspondiente (y los dos workflows de deploy, que pisan el `.env`).
- **Patrones:** facade para servicios complejos; stores Pinia con `defineStore` setup; composables exponen `cleanup()` y NO usan `onUnmounted`.
- **Sentry:** `createLogger().error()` en frontends ya manda a Sentry; no loguear datos sensibles.
- **Pre-commit:** Husky + lint-staged (Prettier). En estos worktrees el hook no corre: formatear a mano (app: sin `;`, comillas simples, 100 cols; API: `;`, comillas dobles, 80 cols).
- **Git/proceso (skills + memoria):** `git add` siempre por ruta explícita; staging-first estricto; preguntar antes de cualquier push y antes de SSH; sin deploys manuales de frontend; **nunca instalar/actualizar dependencias sin preguntar**; sin CDN en producción; sin bump de versión en fases GSD; los tests corren en CI, no local (typecheck sí); si un push es de fix solo-tests o tras deploy fallido hay que tocar código de producción del mismo componente (`// deploy:` por paths-filter).
- **Ejecución:** planes detallados se ejecutan con `gsd-executor` en `model: sonnet`, secuencial, sin `run_in_background` ni loops de `pgrep`; el orquestador verifica worktree limpio + typecheck + lint tras cada plan. En este worktree **no hay `node_modules` y no se instalan** (regla heredada de la 197/200).
- **Plan mode / UI copy:** copy en español rioplatense con voseo y tildes; "clase", nunca "turno".

## Summary

Conquer v2 es un módulo nuevo y chico: 10 tablas gym-owned (4 de catálogo editable, 6 de estado del alumno), un motor de progresión **puro y sin imports** (`next()` del oráculo + calibración + caída + recortes + encendido muscular), ~14 rutas de alumno y ~26 de admin, una tab "Conquer" dentro de Entrenar y una sección "Conquer" en el admin. De la 196 se copia muy poco y se adapta mucho: el almacenamiento privado de fotos en R2 (`private-media.ts`, ~110 LOC útiles), las reglas puras del control físico (`body-check-rules.ts`, 161 LOC) y la cámara Capacitor (`useBodyCheckCamera.ts`, 245 LOC). El editor de escaleras de la 196 (`LadderBuilder.vue`, 1221 LOC) está acoplado al catálogo `exercises` y ordena al revés (fácil→difícil): **no conviene copiarlo**; un editor de ~250 LOC sobre `conquer_rungs` alcanza. Las marcas `unilateral`/`brazos_rectos` no existen en `exercises` en staging [VERIFIED: grep]; se recomienda ponerlas en `conquer_rungs` (módulo duro, `exercises` intacta) en vez de repetir la mig 0269.

Tres hallazgos que condicionan el plan: (1) **colisión de migraciones con la fase 200**: ambas dicen "desde 0287"; se recomienda que la 200 conserve 0287-0289 y la 201 arranque en **0290**; (2) el **oráculo se pudo ejecutar** en Node con `vm` y sin dependencias, lo que da casos dorados verificados y un test diferencial barato; el oráculo tiene cuatro comportamientos que NO hay que copiar (subir en el último peldaño se queda en el mismo peldaño, muestra todos los SUBIR a la vez, excluye la sesión del día del cambio, y calcula el acierto solo desde el último cambio); (3) la figura compartida de la 197 (`BodyFigure.vue`) **sirve tal cual** para el mapa muscular de D-13 (props `lit` = principal, `lit2` = secundario, `tone`), así que no se copia ni `anatomia.json` (byte a byte idéntico al de la 196, verificado con `cmp`) ni `BalanceMap.vue`; se recomienda guardar zonas (`ZoneSlug`) y no los 19 músculos finos, lo que además aísla a la 201 de la reescritura del modelo muscular de la 200.

**Recomendación principal:** construir `engine.ts` primero (cero imports, ejecutable con `node` por type-stripping), probarlo contra el oráculo en un test diferencial, y colgar todo lo demás (rutas, alertas, pantallas) de ese módulo; arrancar las migraciones en 0290; reusar `BodyFigure` con `tone="sage"` más `:deep()` para el tema dorado, sin tocar el componente compartido.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Motor de progresión (objetivo, estado, calibración, caída, recortes) | API / Backend (módulo puro) | — | Una sola implementación autoritativa; el server fija fecha y `prev`, el app solo pinta lo que recibe (no duplicar el motor en 3 apps) |
| Fecha de la sesión, semana calendario, "qué día toca" | API / Backend | Browser (pinta) | Zona horaria de la sede, jamás reloj del cliente (el oráculo usa el del cliente) |
| Contadores +/- y precarga | Browser / Client | API (valor inicial) | Interacción local; el valor precargado lo calcula el server |
| Alertas (molestia, caída, tope, paso de nivel) | API / Backend (al guardar) | — | Eventos persistidos con estado abierta/vista/resuelta |
| Alertas por tiempo (inactivo, control vencido, día 0 pendiente) | API / Backend (derivadas en lectura) | — | Sin cron: se calculan al pedir el tablero (30 alumnos) |
| Fotos del control físico | Storage (R2 privado) | API (URLs firmadas) / Browser (cámara + PUT) | El API firma y verifica; el app sube directo al bucket |
| Permisos owner/admin y propiedad del alumno | API / Backend | Admin (oculta UI) | La UI solo oculta; el gate real es el API (regla v5.4) |
| Catálogo (escaleras, ejercicios, plantillas, parámetros) | Database / Storage | Admin (edición) | Datos editables por Nacho sin deploy |
| Mapa muscular (regla de encendido) | API / Backend (regla pura) | Browser (BodyFigure pinta zonas) | La app no decide la regla (como en la 196) |
| Estética Conquer (cielo azul, fuentes) | Browser / Client | — | CSS acotado a la raíz de Conquer; el resto de la app no cambia |
| Pop-up de lanzamiento | API (aviso `custom`) | Browser (destino `conquer`) | Sistema de Comunicaciones de la 193; solo suma una clave de destino |
| Pedidos de desbloqueo y su contador | API / Backend | Admin (lista + badge) | Fila en `conquer_members` con `status = pedido` |

## Standard Stack

### Core (todo ya existe en el repo; sin dependencias nuevas salvo una fuente)

| Library | Versión | Propósito | Por qué |
|---------|---------|-----------|---------|
| fastify | ^5.7.4 [VERIFIED: el-templo-api/package.json] | API | Stack del repo |
| drizzle-orm | ^0.45.1 [VERIFIED: package.json] | Schema/queries MySQL | Stack del repo; SQL de migración a mano |
| @aws-sdk/client-s3 + s3-request-presigner | ^3.994.0 [VERIFIED: package.json] | URLs firmadas R2 | Ya instalados; el plugin `plugins/r2.ts` decora `fastify.r2` y `fastify.r2Bucket` |
| quasar / vue | ^2.16.0 / ^3.5.22 [VERIFIED: app package.json] | App y admin | Stack del repo |
| pinia (setup stores) | del repo | Estado del app | Convención del CLAUDE.md |
| @capacitor/camera | 8.2.0 [VERIFIED: app package.json] | Fotos del control | Ya instalado; permisos de cámara ya en `Info.plist` y `AndroidManifest.xml` [VERIFIED: grep] |
| vitest | ^4.0.18 [VERIFIED: ambos package.json] | Tests API y app | Admin NO tiene vitest |
| @fontsource/cormorant-garamond | ^5.2.11 [VERIFIED: app package.json] | Títulos de Conquer | Ya instalado; faltan solo los pesos 600/700 normales |

### Supporting

| Library | Versión | Propósito | Cuándo |
|---------|---------|-----------|--------|
| **@fontsource/jost** | 5.3.0 [VERIFIED: npm registry; slopcheck OK] | Fuente de cuerpo de Conquer (D-09) | **NUEVA dependencia: requiere OK de Franco.** Pesos 400/500/600 existen [VERIFIED: HTTP 200 de `400.css`, `500.css`, `600.css`] |
| `src/components/anatomy/BodyFigure.vue` (interno) | fase 197-10 | Figura frente/espalda con zonas encendidas | Mapa muscular D-13 |

### Alternatives Considered

| En vez de | Podría usar | Tradeoff |
|-----------|-------------|----------|
| `@fontsource/jost` | Montserrat (ya empaquetada) como cuerpo | Sin dependencia nueva pero incumple D-09 (Jost) |
| Reusar `BodyFigure` | Copiar `BalanceMap.vue` + `anatomia.json` de la 196 | 414 LOC más y 136 KB duplicados; `anatomia.json` de la 196 es idéntico al de staging (`cmp` SAME) |
| Marcas en `conquer_rungs` | `ALTER TABLE exercises` (mig 0269 de la 196) | Toca una tabla global del catálogo SaaS y arrastra `exercise_muscles` (otra tabla gym-owned) |

**Instalación (solo si Franco aprueba):**
```bash
cd el-templo-app && pnpm add @fontsource/jost@5.3.0
```
Verificación hecha: `npm view @fontsource/jost version` = 5.3.0 (modificado 2026-07-19, creado 2020-12-23, sin `postinstall`, repo `fontsource/font-files`, mantenedores `jwr1` y `lotusdevshack`, los mismos que `@fontsource/cormorant-garamond` ya instalado).

## Package Legitimacy Audit

| Package | Registry | Edad | Descargas | Repo | slopcheck | Disposición |
|---------|----------|------|-----------|------|-----------|-------------|
| @fontsource/jost | npm | ~5,8 años (2020-12-23) | no consultado | github.com/fontsource/font-files | [OK] (`slopcheck scan` sobre un `package.json` temporal en el scratchpad; el modo `install` auto-detectó PyPI y dio falso [SLOP], se descartó) | Aprobado para proponer; instalar solo con OK explícito de Franco |

**Paquetes removidos por [SLOP]:** ninguno.
**Paquetes [SUS]:** ninguno.
**Nota:** el nombre salió del prototipo (Google Fonts) y de la convención `@fontsource/*` ya usada en `src/css/app.scss`; la página de docs de Fontsource no confirmó el nombre del paquete (WebFetch sin esos datos), la confirmación es registro npm + slopcheck + patrón del repo.

## Architecture Patterns

### Diagrama de flujo

```
 ALUMNO (app, tab Entrenar > Conquer)                    OWNER/ADMIN (admin)
        |                                                       |
  GET /api/members/conquer/state ------------------+      Alta / Pedidos / Tablero / Ficha
        |  (bloqueado | pedido | activo)           |      Catálogo (escaleras, plantillas, ajustes)
        |                                          |            |
  Bloqueado -> POST /unlock-request -> conquer_members(status=pedido) --> lista + contador (badge)
        |                                                       |
  Activo -> día 0: cámara -> PUT directo a R2 privado <- URL firmada (API) ; POST confirm (HEAD al objeto)
        |
  GET /today?day= --> [engine.nextTarget por escalón] --> precarga = objetivo
        |
  PUT /sessions (una por fecha+día, sobrescribe, fecha = hoy en TZ de la sede)
        |--> transacción: upsert conquer_sessions + reemplazo de conquer_session_steps (prev = objetivo recalculado en server)
        |--> engine: calibración (1ª sesión de E1), caída, tope; molestia>=4 ; paso de nivel
        |--> conquer_alerts (eventos) ; respuesta: calibración propuesta + músculos encendidos hoy (lighting)
        |
  GET /progress --> estado por escalón, "Hoy toca subir" (uno por ejercicio: E1>E2>E3), acierto, músculos de la semana
  POST /steps/.../subir --> rung anterior (más difícil) + since_date ; sin siguiente peldaño: 409 + alerta tope

  Tablero (admin): alertas persistidas (molestia, caída, tope, paso_nivel) + derivadas (inactivo, control vencido, día 0)
```

### Estructura recomendada

```
el-templo-api/src/db/schema/conquer.ts          # 10 tablas (tenantIdColumn en todas)
el-templo-api/src/db/migrations/0290..029x_*.sql
el-templo-api/src/modules/conquer/
  engine.ts            # PURO, CERO imports: nextTarget, calibration, caida, pickSubir, recortes, constantes
  lighting.ts          # PURO: regla de encendido (adaptación de balance-map.ts)
  calendar.ts          # semana lunes-domingo, "qué día toca" (usa shared/week-dates + date-utils)
  permissions.ts       # canManageConquer / canViewConquerPhotos (UN helper, D-08)
  private-media.ts     # COPIA adaptada de la 196 (solo tienda privada, sin fallback)
  body-check-rules.ts  # COPIA casi literal (28 días, comparar)
  catalog-service.ts, member-service.ts, alerts-service.ts, settings.ts
  admin-routes.ts, member-routes.ts, schemas.ts, index.ts
el-templo-api/test/conquer/ + test/unit/conquer-engine.test.ts + test/migrations/0290-*.test.ts
el-templo-app/src/modules/conquer/   # components/, pages/, composables/ (cleanup()), stores/, utils/
el-templo-admin/src/pages/ConquerPage.vue, ConquerAlumnoPage.vue + components/conquer/ + composables/useConquerAdminApi.ts
```

### Patrón 1: motor puro con cero imports

**Qué:** `engine.ts` solo define tipos y funciones; recibe arreglos de números ya filtrados. **Cuándo:** siempre; así corre con `node` (type-stripping sin flags en Node 22.22 [VERIFIED: probado en este entorno]) para verificar sin `node_modules`, y lo prueba un test diferencial.

```ts
// Fuente: ref/conquer-app.html next() + spec §4.4 (ejecutado y verificado)
export type Unit = "reps" | "s";
export type Estado = "sin_datos" | "rango" | "techo1" | "bajo" | "subir";
export const PISO = { reps: 3, s: 4 } as const;
export const TECHO = { reps: 8, s: 12 } as const;

export function nextTarget(
  values: readonly number[], // marcas del escalón, orden cronológico, ya filtradas por "desde"
  unit: Unit,
  inc: number, // 1 reps / 2 s (editable por alumno)
): { obj: number; est: Estado } {
  if (values.length === 0) return { obj: PISO[unit], est: "sin_datos" };
  const l = values[values.length - 1];
  const p = values.length > 1 ? values[values.length - 2] : 0;
  if (l >= TECHO[unit] && p >= TECHO[unit]) return { obj: PISO[unit], est: "subir" };
  if (l >= TECHO[unit]) return { obj: TECHO[unit], est: "techo1" };
  if (l < PISO[unit]) return { obj: l + inc, est: "bajo" };
  return { obj: Math.min(TECHO[unit], l + inc), est: "rango" };
}
```

### Patrón 2: tenancy en cada acceso

`attachCountryScope(request, fastify.db)` + `assertTenant(request.scope, "conquer.member.x")` → `ctx`; toda query con `tenantWhere(tabla, ctx)` y todo insert con `tenantValues(ctx, {...})` (imports por ruta directa de `modules/shared/tenant`). `userId` siempre de `request.user.userId`, nunca de body/params [CITED: `modules/sponsors/member-routes.ts`].

### Patrón 3: guard por módulo (recomendado)

Registrar con `moduleScope(app, "templo-training", conquerMemberRoutes, { prefix: "/api/members/conquer" })` y lo mismo en admin: un gimnasio sin el módulo recibe 404 y el app oculta la tab. Manifiesto: `categoria: "templo-module", modulo: "templo-training"` (precedente: `GET /api/sessions/free-blocks`). La 196 usó registro directo sin `moduleScope` (tenant-scoped); ambas pasan los gates, pero la 201 es exclusiva de El Templo ("el método es exclusivo de El Templo") y el 404 por módulo da gratis el "ocultar la tab" en otros gimnasios. `[ASSUMED]` que la decisión es del planner (ver AS-3).

### Anti-patrones

- **Duplicar el motor en el app.** El app recibe objetivo/estado/propuestas del API.
- **Fecha o `prev` enviados por el cliente.** El oráculo los toma del cliente; en v2 el server fija `fecha = todayInTz(sede)` y recalcula `prev` con el historial anterior a esa fecha.
- **Copiar `LadderBuilder.vue`:** 1221 LOC, acoplado a `exercises`, orientación invertida.
- **Poner el catálogo (escaleras, ejercicios, plantillas) en `TABLES_TO_CLEAN`:** `cleanAllTestData` borraría el catálogo sembrado por migración.

## 1. Cantera de la 196: qué copiar, qué adaptar, qué no

Raíz 196: `/home/franco/projects/et-196-personalizados` (rama `feat/196-personalizados`, `ead59380e`). Líneas = `wc -l`.

| Pieza | Archivos y LOC | Dependencias que NO traemos | Qué hay que adaptar |
|---|---|---|---|
| **Fotos privadas, API** | `el-templo-api/src/modules/conquer/private-media.ts` (202); `body-checks.ts` (797); `body-check-rules.ts` (161) | `ConquerPose` de `schema/conquer.ts`; `conquerBodyCheckPhotos`/`conquerBodyMeasurements`/`conquerMeasureTypes`; `listMeasureTypes` (`measure-types.ts`); `getPoseExamples` (`settings.ts`); `PublicMediaStore`/fotos de ejemplo; poses opcionales `biceps_*` | **private-media.ts:** quedarse con `PrivateMediaStore`, `privateMediaResolver`, `privateCheckPhotoKey`, expiraciones (PUT 600 s, GET 300 s), enum cerrado `image/jpeg|png|webp`, `PhotoStorageUnavailableError` (503 genérico). **Quitar el fallback al bucket común** (`R2_PRIVATE_BUCKET_NAME \|\| fastify.r2Bucket`, línea ~149): sin `R2_PRIVATE_BUCKET_NAME` responder 503 (fail-closed, ver sección 12). Agregar `head()` con `ContentLength` y `ContentType` para validar tamaño/tipo al confirmar. **body-checks.ts:** conservar el orden de errores 404 (propiedad, IDOR) → 503 (storage) → 409 (estado), el log solo con `{checkId,pose}`, y `requestPhotoUpload`/`confirmPhoto`/`getPhotoUrl`/comparador; reemplazar tablas hijas por 4 columnas de perímetro y 3 columnas de clave de foto en `conquer_body_checks`. **body-check-rules.ts:** copia casi literal (`CHECK_INTERVAL_DAYS=28`, `checkDue`, `numberChecks`, `compareChecks`, `defaultComparePair`); sólo reemplazar `measureTypeId` por las 4 claves fijas. `addDays` existe en `shared/date-utils.ts` de staging [VERIFIED] |
| **Fotos privadas, infra** | `.env.example` (línea 47 `R2_PRIVATE_BUCKET_NAME=` en la 196) | — | **En staging NO está** en `.env.example` ni en `deploy.yml` (líneas 368-372) ni `deploy-staging.yml` (383-387) [VERIFIED: grep]; tampoco en los workflows de la 196. Hay que agregarla en los 3 sitios; `deploy-staging.yml` usa los mismos secrets `R2_*` que prod, así que usar un secret distinto (`STAGING_R2_PRIVATE_BUCKET_NAME`) o fotos de prueba y reales comparten bucket. Bucket privado + CORS los crea Franco en Cloudflare (política exacta en `196-38-SUMMARY.md` líneas 121-155; con `CapacitorHttp.enabled: true` el PUT nativo no pasa por CORS) |
| **Fotos privadas, app** | `modules/conquer/composables/useBodyCheckCamera.ts` (245); `utils/body-check.ts` (451); `components/CheckPhoto.vue` (126); `stores/bodyChecks.ts` (185); referencia de UI: `pages/ConquerBodyCheckPage.vue` (684), `PoseCaptureCard.vue` (276), `FirstCheckPrompt.vue` (98) | `useConquerApi`, `offline-queue`, poses opcionales, fotos de ejemplo, ventana de edición de 7 días (a decidir) | Copiar la cámara tal cual (reglas: `saveToGallery: false`, `fetch` pelado al host de R2 sin el token, mismo `Content-Type` que el firmado, nada se loguea) cambiando el cliente API; de `body-check.ts` quedan poses (3), parseo de perímetros (rango 10-300 cm, peso 20-400 kg), mime y textos de fallo de subida. Reescribir las páginas (3 poses fijas + 4 medidas + "Lo hago después", D-15). **Nativo:** el texto de `NSCameraUsageDescription` (`src-capacitor/ios/App/App/Info.plist:48`) no menciona el control físico; ampliarlo antes del build iOS (aviso de `196-38-SUMMARY.md`) |
| **Marcas `unilateral`/`brazos_rectos`** | `src/db/migrations/0269_conquer_exercise_marks.sql` (51); `catalog-marks.ts` (255); admin `VariantMarksDialog.vue` (204), `VariantMarksTab.vue` (229) | Tabla `exercise_muscles`, enum de 19 músculos, FK a `exercises` | **Staging no tiene esas columnas** (`grep` sobre `el-templo-api/src`: 0 resultados en schema/migraciones) [VERIFIED]. Recomendación: columnas `brazos_rectos` y `unilateral` (boolean NOT NULL DEFAULT false) en `conquer_rungs`; editarlas con dos checkboxes en la fila del peldaño. Cuenta del spec: brazos rectos = solo cambia el texto de ayuda de fallo (§1.4); unilateral = el objetivo dice "por lado" y se carga el lado más flojo |
| **Editor de escaleras** | admin `LadderBuilder.vue` (1221), `LadderEditorDialog.vue` (83), `LadderMini.vue` (91), `LadderOverview.vue` (204), `utils/conquer-ladder.ts` (165), `composables/useConquerCatalogApi.ts` (253) | Variantes de `exercises`, `minLadder`, salud de la escalera, ejemplos de serie, patrones, músculos | **No copiar.** Escribir `ConquerLadderEditor.vue` (~250 LOC): lista de peldaños con subir/bajar, renombrar, dos checkboxes, alta y baja lógica (`is_active`; no se borra un peldaño en uso). Ojo: la 196 ordena **fácil→difícil** (posición 1 = más fácil) y la spec/oráculo **difícil→fácil**; la 201 usa `position` 0 = más difícil. `useDragReorder` de staging NO sirve (atado a prescripciones). Referencia visual: boceto `017-conquer-escalera` de la 196 |
| **Comparador antes/después** | API `compareStudentChecks` en `body-checks.ts` + `body-check-rules.ts`; app `pages/ConquerEvolutionPage.vue` (672); admin `StudentBodyChecks.vue` (502) | `ConquerEvolutionPage` mezcla línea de tiempo, poses opcionales y tipos de medida configurables | Copiar la lógica pura y reescribir una página más chica: día 0 vs último, lado a lado por pose, diferencia en cm de las 4 medidas, semanas entre controles; abre en "día 0 vs último" |
| **Mapa muscular, regla** | API `balance-map.ts` (131), `muscles.ts` (122); tests `balance-map.unit.test.ts` (496), `muscles.unit.test.ts` (148) | `TORSO_MUSCLES`, `musclesToZones` (importa `tv/muscle-zones.ts`, que la 200 reemplaza), `MapSeries` por serie y `variantId` | Adaptar la regla (≥2 series como principal o ≥4 como secundario; principal gana; hold y finisher no cuentan) al registro nuevo: **cada escalón E1-E3 con valor >0 cuenta como las 3 series del ejercicio** (D-13). Recomendado: guardar **zonas** (`ZoneSlug` de `app/src/components/anatomy/zones.ts`) y no los 19 músculos finos; `muscles.ts` se reduce a 15 etiquetas en español. Los casos de los tests viejos sirven de base para los dorados de la regla |
| **Mapa muscular, tabla** | mig 0269 `exercise_muscles` | tabla gym-owned extra | Reemplazar por `conquer_exercises.muscles` (JSON `[{zone, role}]`): evita una tabla (y sus 5 conteos de tenancy). Semilla propuesta en la sección 8 |
| **Mapa muscular, app** | `components/BalanceMap.vue` (414), `utils/muscle-figure.ts` (208), `anatomy/anatomia.ts` (99), `anatomy/anatomia.json` | `Preferences` (toggle de sexo), recorte de torso, `MUSCLE_TO_SLUGS` | **No copiar `anatomia.json`**: es idéntico byte a byte al de staging `src/components/anatomy/anatomia.json` (`cmp`: SAME) [VERIFIED]. Usar `BodyFigure.vue` (ver sección 2) |
| **No traer (D-07)** | `progression-engine.ts` (573), `suggestions.ts`, `alerts-engine.ts` (386), `offline-queue.ts`, `flush-runner.ts`, `conquer_series`/`conquer_tramo_logs`, `plan-document.ts`, `assignment*.ts`, `personalized_*` | — | Sólo lectura de referencia para casos borde |

**Lo que ya existe en staging:** plugin R2 (`src/plugins/r2.ts`, decora `fastify.r2` + `fastify.r2Bucket`, avisa y desactiva si faltan `R2_*`), SDK S3 + presigner, `@capacitor/camera`, `BodyFigure.vue` + `anatomia.json/ts` + `zones.ts`, permisos de cámara nativos, `shared/date-utils.ts` (`addDays`, `todayInTz`) y `shared/week-dates.ts` (`mondayOf`). **No existe:** helper de bucket privado, columnas de marcas en `exercises`, `R2_PRIVATE_BUCKET_NAME` en ningún lado.

## 2. Fase 197: tabs de Entrenar y figura compartida

**Archivos** (`el-templo-app/src/`):
- `config/featureFlags.ts:32` `ENTRENAR_TABS_ENABLED = false`; `FREE_BLOCKS_ENABLED = false` (línea 25).
- `modules/training/pages/EntrenarView.vue`: `<EntrenarTabs v-if="ENTRENAR_TABS_ENABLED">`; `QUERY_TABS` = `[]` con tabs apagadas, `['libre','desafios','conquer']` o `['desafios','conquer']` según `FREE_BLOCKS_ENABLED`; `tabFromQuery` valida contra esa lista (T-197-45) y un `watch` de `route.query.tab` reabre. El pane Conquer hoy es `<ComingSoonPane kind="conquer" />` (último `v-else`).
- `modules/training/components/EntrenarTabs.vue`: `ALL_TABS` = Semana, Libre, Desafíos (`soon`), Conquer (`soon`); `TABS` filtra Libre con `FREE_BLOCKS_ENABLED`. La grilla usa `--entrenar-tabs-count`, así que acepta 2 tabs sin tocar CSS. La barra ya no es sticky.
- `modules/training/components/EntrenarVidriera.vue`: alumno sin plan ve Entrenar desenfocado e inerte; renderiza `EntrenarTabs` no interactivas si el flag está en `true`.
- `modules/training/pages/TrainingIndex.vue`: `canEnterTraining` = plan presencial o inscripción activa; si no, vidriera.
- No hay tests de `EntrenarTabs`/`EntrenarView`/`ComingSoonPane` (grep sobre `__tests__`: 0).

**Cómo reactivar solo Semana + Conquer (D-10):**
1. `featureFlags.ts`: `ENTRENAR_TABS_ENABLED = true`; agregar `ENTRENAR_DESAFIOS_ENABLED = false` (mismo patrón que Libre: sin tab, sin `?tab=desafios`).
2. `EntrenarTabs.vue`: `TABS` filtra `desafios` con el nuevo flag; `conquer.soon = false` (sin punto ocre).
3. `EntrenarView.vue`: `QUERY_TABS` = `['conquer']` (+ `'libre'` si `FREE_BLOCKS_ENABLED`); reemplazar el `ComingSoonPane kind="conquer"` por `<ConquerTab />` cargado con `defineAsyncComponent` (la fuente y el CSS de Conquer quedan en un chunk que sólo baja quien abre la tab). `ComingSoonPane` queda para `desafios` (código vivo, apagado).
4. El `?tab=conquer` ya existe: `/training?tab=conquer` es la ruta del destino del pop-up.
5. `EntrenarView` carga Semana en el `setup` aunque se abra directo Conquer (`void week.load()`): costo menor, no bloquea.

**Decisión abierta (AS-4): alumno sin plan.** `TrainingIndex` manda a la vidriera a quien no tiene plan presencial ni inscripción. Esa persona **no llega a la tab Conquer**, aunque D-12 diga "todos los alumnos ven la tab Conquer" y aunque un alumno online pudiera tener Conquer activado a mano. Default propuesto: dejar la vidriera como está (Conquer sólo para quien puede entrar a Entrenar) y confirmar con Franco.

**La figura compartida (197-10) sirve para D-13.** `src/components/anatomy/BodyFigure.vue` (304 LOC) ya trae: `lit` (zona principal, degradé terracota o salvia), `lit2` (secundaria), `dim`, `tone: 'terra'|'sage'`, `height`, `gender` (solo `female` → figura mujer), carga perezosa de la geometría y, si falla, una caja vacía del mismo alto. Mapeo directo de la regla de la 196: nivel principal → `lit`, secundario → `lit2`. Recomendaciones: (a) **no modificar `BodyFigure.vue`** (la 200 también lo consume y puede extenderlo); (b) para el tema azul/dorado usar `tone="sage"` y sobreescribir con `:deep()` desde un contenedor de Conquer (`.body-figure--sage .mu--lit path`, `.mu--lit2 path`, `.body-figure__caption` — el `<style>` es `scoped`, `:deep` alcanza los `path` internos); (c) debe montarse ya visible (`v-if`, nunca `v-show`: mide con `getBBox`) [CITED: 197-10-SUMMARY.md]; (d) dibuja el cuerpo entero, no recorta torso como el `BalanceMap` de la 196: aceptable; un recorte sería una prop nueva en el componente compartido (coordinar con la 200); (e) las zonas válidas son los slugs de `anatomia.json` (15 zonas musculares: chest, deltoids, triceps, biceps, forearm, trapezius, upper-back, lower-back, abs, obliques, gluteal, quadriceps, hamstring, adductors, calves) [VERIFIED: lectura del JSON y de `zones.ts`].

**Estructura interna de la tab (decisión del planner):** pane con un Inicio (nivel, semana, día que toca, aviso de control) y subpáginas ruteadas bajo `training/conquer/*` (Hoy, Progreso, Evolución, Control) para que el botón atrás de Android funcione; la barra inferior del oráculo (Hoy/Progreso/Sábado/Perfil) choca con la navegación del app, no se copia. El pane tiene que pintar su **propio cielo azul** a pantalla completa: `q-page` de Entrenar es transparente (la foto de fondo, D-16 de la 199) y la barra de tabs queda en crema de El Templo encima, lo cual es coherente con D-09 ("sólo dentro de Conquer").

## 3. Fase 200 (anatomía): superposición y riesgo de choque

Worktree `/home/franco/projects/et-200-anatomia` (`feat/200-anatomia`, base `99152a195`), todavía sólo documentación (5 archivos: CONTEXT, RESEARCH, VALIDATION, roadmap, investigación) [VERIFIED: `git diff --stat origin/staging...HEAD`]. Qué hace: contenido de anatomía funcional en **archivos versionados** (sin tablas, D3), endpoints de lectura, Admin › Anatomía, Guía partida en dos con "Tu cuerpo", y el cuerpo tocable de Entrenar/Semana; **reemplaza `el-templo-api/src/modules/tv/muscle-zones.ts`** como fuente única músculo→zona.

| Riesgo | Detalle | Mitigación |
|---|---|---|
| **Migraciones** | 200: "usa 0287 en adelante" (D1: `routes.display_name`, 5 SISSY SQ OL → SS). 201 también "desde 0287" | Ver sección 7: 200 conserva 0287-0289, 201 desde **0290**; coordinar antes de escribir el primer `.sql` |
| `featureFlags.ts` | 200 agrega `ANATOMIA_ALUMNOS_ENABLED`; 201 agrega `ENTRENAR_DESAFIOS_ENABLED` y cambia `ENTRENAR_TABS_ENABLED` | Conflicto trivial de líneas contiguas |
| `EntrenarView.vue` / `SemanaTab` | 200 hace tocable el cuerpo de Semana; 201 cambia tabs y el pane Conquer | Regiones distintas; rebase manual al mergear |
| `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` (hoy **476**) | Ambas suman rutas y suben el mismo número | Choque seguro al mergear: resolver con aritmética, no tomar un lado |
| `BodyFigure.vue` / `anatomia.*` | 200 reusa el componente (y puede extenderlo) | 201 sólo lo consume, sin editarlo |
| `muscle-zones.ts` / modelo muscular | 200 lo reemplaza | Conquer **no** importa `tv/muscle-zones` ni `tv/types`: guarda `ZoneSlug` propios (los slugs del dibujo no cambian, D4) |
| Muscle enums | 200: 28 músculos del sketch, contenido en archivos | 201: zonas del dibujo en JSON del ejercicio; no comparten enum |
| Orden de salida | 200: "sale a producción con o después del tren de la 197"; 201 también depende de la 197 | Ambas rebasan sobre `origin/staging`; el que entra segundo renumera/ajusta baselines |

## 4. Pop-ups / Comunicaciones (fase 193): destino hacia la tab Conquer

- **Cómo se crea un pop-up "una vez a todos":** el admin crea en Comunicaciones un `aviso` con `kind='custom'`, `placement='popup'`, `frequency_type='once'` (enum: `once | every_n_days | every_open`), `status='active'`, alcance vacío = todos (`scope_branch_ids/countries/segments` NULL), y un destino [VERIFIED: `src/db/schema/communications.ts`].
- **Destino:** `destination_type ∈ {app_section, whatsapp_sales}` (enum de DB) más `destination_section varchar(40)` — **no es enum de DB**. Las secciones salen de `APP_SECTIONS` en `modules/communications/destinations.ts` (9 hoy) y se **duplican** en `el-templo-admin/src/config/destinations.ts` y `el-templo-app/src/config/destinations.ts`; `test/communications/destinations-sync.test.ts` rompe si divergen, y ese test extrae la tupla `key/label/route` por regex contigua: **sin comentarios dentro de la tupla** [CITED: comentario de `app/src/config/destinations.ts`].
- **Lo que hay que tocar para sumar el destino (sin migración ni enum):** agregar `'conquer'` a `AppSectionKey` y una entrada `{ key: 'conquer', label: 'Conquer', route: '/training?tab=conquer' }` en las 3 copias; revisar `test/communications/destinations.test.ts` por conteos fijos de secciones [no inspeccionado a fondo, `[ASSUMED]` que haya un conteo].
- **Compatibilidad con builds viejos:** el servidor manda `route` en el payload y el app hace `router.push(destination.route)` (`utils/aviso-navigation.ts`); un build viejo abre `/training` y, con tabs apagadas, cae en Semana. No rompe. Una clave desconocida cae a `FALLBACK_ROUTE` (`/mi-templo`), fail-closed.
- **El pop-up en sí es contenido, no migración:** crearlo desde el admin cuando Conquer esté listo. Una migración lo activaría en producción en el momento del deploy, antes de que haya builds nativos. D-11 pide además un **boceto previo** (siguiente número libre en `.planning/sketches/` del checkout principal: **022**, salvo que la 200 lo tome; las carpetas 017-021 de la 196 son otras).

## 5. Roles y permisos (D-08)

- API: `ADMIN_ROLES = ["admin","owner"]` en `modules/shared/permissions.ts:31`. Las rutas se guardan con un `onRequest` que llama a `fastify.authenticate` y luego chequea rol (patrón de `sponsors/admin-routes.ts`: guard de plugin con 403). Admin: `DUENO_ROLES = ['admin','owner']` (`config/templo-config.ts:74`) y `meta: { allowedRoles: DUENO_ROLES }` en `router/routes.ts`; la nav sólo oculta (el gate real es el API).
- **Un solo helper** (`el-templo-api/src/modules/conquer/permissions.ts`):

```ts
// Fase 201 D-08: hoy owner/admin. Abrir a coach = agregar "coach" a CONQUER_MANAGER_ROLES
// y activar la rama de coach_user_id; ningún call-site cambia.
export const CONQUER_MANAGER_ROLES = ["owner", "admin"] as const;

export function canManageConquer(
  user: { role: string; userId: number },
  member?: { coachUserId: number | null },
): boolean {
  if ((CONQUER_MANAGER_ROLES as readonly string[]).includes(user.role)) return true;
  // Futuro (D-08): return user.role === "coach" && member?.coachUserId === user.userId;
  return false;
}
export const canViewConquerPhotos = canManageConquer; // el alumno dueño se resuelve aparte por userId
```
  Todo call-site (tablero, ficha, recortes, paso de nivel, activar, fotos, catálogo, ajustes) usa estas dos funciones. Espejo admin: `CONQUER_MANAGER_ROLES` en `templo-config.ts` (que ya declara la nav).
- `gestion`, `recepcion`, `admin_sede`, `coach_actividad`: fuera. Nacho tiene que ser `admin`/`owner` para validar en la prueba (la 196 asumía "Nacho puede ser admin") — confirmar.
- La 196 abría el catálogo a `canAccessTraining` (el coach exclusivo): **no** repetir.
- Nav del admin: nuevo ítem "Conquer" en la categoría Entrenamiento con `roles: DUENO_ROLES` y `badge: 'conquer-requests'`; el contador sale de un endpoint barato (`GET /api/admin/conquer/requests/count`) cargado desde `useAdminStore` (mismo mecanismo que `pending`/`app-trials`/`landing-*`; `badgeCount` en `AdminLayout.vue`).

## 6. Tenancy: qué toca cada tabla y cada ruta

Fuentes: `src/db/tenant-tables.ts`, `test/db/tenant-tables.test.ts`, `test/tenancy/*`, memorias `reference_tabla_gym_owned_nueva_cinco_conteos` y `reference_gates_tenancy_ruta_job_nueva`. Valores actuales en `origin/staging` [VERIFIED: lectura de los tests]: **104** gym-owned, **109** tablas de schema, 5 exentas, `ENTRADAS_BASELINE = 476`.

**Por cada tabla nueva (10 tablas → 104→114, 109→119):**
1. `src/db/schema/conquer.ts` con `tenantId: tenantIdColumn()`; migración con `tenant_id int NOT NULL DEFAULT 1` + FK a `tenants`; **todo UNIQUE empieza por `tenant_id`**.
2. `src/db/tenant-tables.ts`: sumar a `GYM_OWNED_TABLES` (orden alfabético) y declarar `TENANT_STRICT_MODULES["conquer"] = [las 10]` (el módulo nace strict: toda query lleva `tenantWhere`).
3. `test/db/tenant-tables.test.ts`: `GYM_OWNED_TABLES.length` (línea 124: 104→114), `schemaTables.size` (línea 129: 109→119) y `MODULOS_DECLARADOS` (agregar `conquer: [...]`).
4. `test/migrations/0192-0195-tenant-columns.test.ts`: título del Test 2 (línea 166) y `gymOwnedChecked` (línea 182: 104→114).
5. `test/migrations/0196-tenant-unique-contracts.test.ts`: Test 10 (línea 616 + mensaje: 104→114).
6. `test/helpers.ts` `TABLES_TO_CLEAN` (línea 197): sólo las tablas de **estado del alumno**, en orden de FK y antes de `users`; `test/fixtures/second-tenant.ts` (limpieza del gimnasio 2, ver línea ~436) igual. **No** agregar las 4 de catálogo (se siembran por migración).
7. Sentinel en tests: queries directas de un test a tablas strict necesitan `tenantWhere(tabla, TEMPLO_CTX)`; los INSERT directos sin `tenantValues` no fallan.
8. `lint:tenant` (CI): ningún acceso sin `tenantWhere`/`tenantValues`; **no** agregar a `tenant-lint-allowlist.json` (la lista sólo se achica); salida válida alternativa: `/* tenant-safe: motivo */`.

**Por cada ruta nueva:** entrada `"MÉTODO /url"` en `test/tenant-manifest.ts` (`templo-module` + `modulo: "templo-training"` si va con `moduleScope`; si no, `tenant-scoped`); subir `ENTRADAS_BASELINE` (hoy 476 en `test/tenancy/iso-01-manifiesto.test.ts:347`) y el número en el título del `it`. **ISO-03** (`iso-03-cobertura*.test.ts`) sólo aplica a 8 prefijos fijos (`/api/admin/analytics`, `/api/campaigns`, `/api/notifications`, `/api/admin/referrals`, `/api/members/referrals`, `/api/admin/improvement-proposals`, `/api/members/improvement-proposals`, `/api/auth`) y a finance/members/subs: `/api/admin/conquer` y `/api/members/conquer` no entran, así que no hay casos ISO-03 obligatorios [VERIFIED por lectura de los encabezados; confirmar con una corrida en CI]. Aun así, cada ruta lleva su test de integración con el segundo gimnasio (`fixtures/second-tenant.ts`) para el aislamiento.

**Jobs:** el diseño propuesto **no crea ningún job** (alertas por tiempo derivadas en lectura). Si el planner decide un cron, activa el gate `con-04-crons-per-tenant` (sumar a `JOBS_ESPERADOS` y envolver en `forEachActiveTenant`).

**Catálogo sembrado + tests:** `cleanAllTestData` borra TODOS los gimnasios con `DELETE` global de `TABLES_TO_CLEAN`; por eso el catálogo queda fuera de esa lista y los tests de admin del catálogo deben restaurar su estado.

## 7. Migraciones: numeración y colisiones

Escaneo hecho sobre `origin/master`, `origin/staging`, todas las ramas remotas y los ~57 worktrees `/home/franco/projects/et-*` [VERIFIED].

| Rama / worktree | Mayor número | Notas |
|---|---|---|
| `origin/master` | **0283** (`0283_novedades_text_120`) | |
| `origin/staging` (= esta rama) | **0286** (`0285_aura_source_extra_block`, `0286_extra_blocks_completed`) | La 197 |
| Reservada 196 | **0284** | 196 usa además 0263-0269 y 0276-0282 (0281/0282 son Conquer v1) en su rama parqueada |
| 195-seo | 0270-0274 | Sin push; hueco en master |
| `et-cupo-const` | 0280 | |
| 192 tren (`et-192-*`) | 0241-0253 | Tienen que renumerarse al integrarse (la memoria dice "renumerar 0253") |
| **200** (`et-200-anatomia`) | ninguna aún | Su CONTEXT: "0287 en adelante" (display_name D1 + 5 SISSY SQ → SS) |
| 201 (esta) | ninguna aún | |

**Recomendación: 201 arranca en 0290**, dejando 0287-0289 a la 200 (necesita 2 o 3: nombres de rutas y SISSY). Orden sugerido:
- `0290_conquer_catalog.sql` (ladders, rungs, exercises, template_days)
- `0291_conquer_catalog_seed.sql` (siembra idempotente SOLO tenant 1, con datos reales de Nacho; sin datos de prueba)
- `0292_conquer_member_state.sql` (members, steps, sessions, session_steps, alerts, body_checks)
Sin reservar más: si la 200 usa menos de tres, no pasa nada; si usa más, **no renumerar por cuenta propia: parar y avisar** (regla 197).
**Advertencias:** (1) antes de crear cada `.sql`, repetir `ls … | sort | tail -3` y `git ls-tree origin/staging`; (2) en el seed, los textos con `;` dentro de un literal parten el statement del runner si el archivo no usa `--> statement-breakpoint`: usar el delimitador entre statements; (3) seed con `INSERT … SELECT … WHERE NOT EXISTS`, resolviendo ids por `code` (nunca ids fijos); (4) archivo `test/migrations/0290-0292-conquer.test.ts` (patrón de `0285-0286-extra-blocks.test.ts`); (5) todo lo que entra por staging se aplica a producción cuando staging se mergea a master.

## 8. Modelo de datos propuesto (MySQL/Drizzle, mínimo)

Convenciones: todas con `id`, `tenant_id` (`tenantIdColumn()`), `created_at`/`updated_at`; fechas de día calendario como `date` con `mode: "string"` (precedente `avisos.starts_on`) para no desplazar por zona horaria; enums con `mysqlEnum("nombre_columna", …)` y mismo texto en el SQL; **referencias estables por `code`** (los JSON del catálogo usan `code`, nunca ids autoincrementales, así la siembra por migración no depende de ids).

**Catálogo (4 tablas, lo carga la migración con datos de Nacho §8; editable en admin):**

| Tabla | Columnas clave | Notas |
|---|---|---|
| `conquer_ladders` | `code` (uniq con tenant), `name`, `sort_order`, `is_active` | 8 escaleras de §8.1 |
| `conquer_rungs` | `ladder_id`, `code` (uniq por escalera), `name`, `position` (0 = más difícil), `brazos_rectos`, `unilateral`, `is_active` | UNIQUE `(tenant_id, ladder_id, code)` y `(tenant_id, ladder_id, position)`; no se borra, se desactiva |
| `conquer_exercises` | `code`, `name`, `ladder_id`, `unit enum('reps','s')`, `muscles` JSON `[{zone, role}]`, `start_steps` JSON `[{rung, mode}×4]` (E1,E2,E3,hold) | 12 ejercicios de §8.2; `start_steps` = la tabla de **Toro** |
| `conquer_template_days` | `days_count` (2/3/4), `day_key`, `label`, `sort_order`, `finisher_text`, `exercise_codes` JSON (3 códigos), `opening_combo_key` null | Plantillas §1.3/§2.1 como datos (D-14). El sábado de Toro y los combos fijos (§3.4) van en código |

**Parámetros (en `tenant_settings`, regla v6.1 "todo parámetro en tenant_settings", precedente `referrals/invitation-settings.ts`; defaults en código, validación en lectura y escritura):** `conquer.start_offset.ternero=2`, `.novillo=1`, `.toro=0` (D-14), `conquer.combo_weeks_n=2` (D-14), más umbrales con default en código (inactivo 7 días, control vencido 42 días, aviso de control 28 días, semanas para paso de nivel 4). Nivel→días válidos y `has_combos` son constantes de código (Ternero 2|3, Novillo 3|4, Toro 4+sábado).

**Estado del alumno (6 tablas):**

| Tabla | Columnas clave | Notas |
|---|---|---|
| `conquer_members` | `user_id` (uniq con tenant), `status enum('pedido','activo','pausado')`, `requested_at`, `level enum('ternero','novillo','toro')` null, `days_count` null, `coach_user_id` null, `inc_reps` (1), `inc_s` (2), `activated_at`, `activated_by`, `level_since` date, `cut_stage` tinyint (recortes §5.1), `day0_skipped_at` null, `publish_enabled`, `publish_no_face`, `publish_changed_at` | Una fila por alumno. El pedido de desbloqueo (D-12) es la fila con `status='pedido'`: la lista de pedidos y su contador salen de acá (sin tabla extra). `coach_user_id` se guarda desde ya (D-08) |
| `conquer_steps` | `member_id`, `exercise_id`, `step enum('e1','e2','e3','hold')`, `rung_id`, `mode enum('completa','negativa','hold')`, `since_date` null, `calibration enum('pendiente','resuelta')` (solo útil en E1) | UNIQUE `(tenant_id, member_id, exercise_id, step)`. Se identifica por **ejercicio**, no por día+índice como el oráculo: dentro de un plan cada ejercicio aparece una sola vez (4, 3 y 2 días lo cumplen, verificado en §1.3/§2.1), por lo que el comportamiento es idéntico y el progreso sobrevive a un cambio de días. Se crea al activar (tabla de Toro desplazada por el offset del nivel, truncada en el peldaño más fácil) y de forma perezosa para ejercicios nuevos |
| `conquer_sessions` | `user_id`, `session_date` (server, TZ sede), `day_key`, `pain` 0-10, `combo_rung_id`, `combo_series`, `push_rung_id`, `push_series`, `pull_rung_id`, `pull_series`, `saved_at` | UNIQUE `(tenant_id, user_id, session_date, day_key)`: guardar de nuevo **sobrescribe** (upsert + reemplazo de `session_steps` en una transacción). El sábado usa `day_key='Sabado'` y las columnas push/pull; la apertura usa `combo_*` |
| `conquer_session_steps` | `session_id`, `exercise_id`, `step`, `value`, `prev_target` null, `rung_id` (snapshot), `mode` (snapshot) | UNIQUE `(tenant_id, session_id, exercise_id, step)`. `prev_target` lo calcula el server (hold = null). El snapshot de `rung_id` resuelve el caso del día del cambio (sección 9, A1) |
| `conquer_alerts` | `user_id`, `type enum('molestia','caida','tope_escalera','paso_nivel')`, `detail` JSON, `dedupe_key`, `status enum('abierta','vista','resuelta')`, `resolved_by`, `resolved_at` | UNIQUE `(tenant_id, user_id, type, dedupe_key)`. Persisten solo las alertas por evento; las de tiempo (inactivo, control vencido, día 0 pendiente) se **derivan al pedir el tablero** (30 alumnos = cuentas baratas, sin cron). Al re-guardar una sesión se recalcula y se auto-resuelve la alerta de esa fecha si dejó de aplicar |
| `conquer_body_checks` | `user_id`, `check_date`, `kind enum('dia0','periodico')`, `photo_front_key`, `photo_side_key`, `photo_back_key` (null hasta confirmar), `arm_cm`, `chest_cm`, `shoulders_cm`, `waist_cm`, `weight_kg` (decimal, todos null) | Reemplaza 3 tablas de la 196. La clave de foto se guarda **al confirmar**, validando por regex que tenga el prefijo `private/conquer/{tenant}/{user}/{check}/{pose}-{uuid}.{ext}` y haciendo `HEAD` (tamaño/tipo); no hace falta fila pendiente |

**Total: 10 tablas** (104→114). Lo que queda en código y no en base: combos fijos (§3.4), constantes piso/techo, reglas de recorte, textos por nivel. Contenido que Nacho **provee o valida** y que la migración siembra: escaleras (§8.1), tabla de arranque de Toro (§8.2), plantillas 2 y 3 días (§2.1, propuesta), finishers (los de §1.3 son de Nacho; los de las plantillas de 2/3 días **no están en la síntesis**), marcas `brazos_rectos`/`unilateral` por peldaño (§1.4 las pide pero §8 no las lista) y zonas/músculos por ejercicio (no están en la síntesis).

**Semillas propuestas, todo `[ASSUMED]` y editable:** `brazos_rectos=true` en toda la escalera Palanca y en L-sit a plancha (el spec dice "plancha, front lever" y "Ternero: variantes cómodas, sin fallo"); `unilateral=true` en `one arm`, `OAP asistida` y `archer` de la escalera de tracción; resto false. Zonas: Planche hold/press y L-sit a plancha → principal `deltoids, chest, abs`, secundario `triceps, forearm, obliques, biceps`; Front lever hold/pull-ups/raises → principal `upper-back, abs`, secundario `lower-back, biceps, forearm, trapezius, deltoids`; HSPU y 90° press → principal `deltoids, triceps`, secundario `chest, trapezius, abs, forearm`; Planche push-up → principal `chest, deltoids, triceps`, secundario `abs, forearm, biceps`; One arm/archer → principal `upper-back, biceps`, secundario `forearm, abs, obliques, deltoids`; Muscle-up → principal `upper-back, triceps, chest`, secundario `biceps, deltoids, abs, forearm`; Fondo a pelícano → principal `chest, triceps`, secundario `deltoids, abs`. Finishers de plantillas 2/3 días (propuesta): Empuje = "Fondos o push-ups, 15–20"; Tracción = "Retracciones escapulares + hold en barra"; Mixto = "Curl de bíceps en anillas, 15–20".

**Rutas (borrador para el planner, ~40; cada una = entrada de manifiesto + test de integración):**
- Alumno `/api/members/conquer`: `GET /state`, `POST /unlock-request` (idempotente), `GET /today?day=`, `PUT /sessions`, `GET /progress`, `PUT /steps/:exerciseId/:step` (cambiar peldaño/modo), `POST /steps/:exerciseId/:step/subir`, `POST /calibration/:exerciseId` (aceptar/rechazar), `POST /body-checks`, `POST /body-checks/:id/photos/:pose/upload-url`, `POST …/confirm`, `GET …/url`, `GET /body-checks`, `POST /body-checks/skip-day0`, `PUT /publish-permission`, `GET /map`.
- Admin `/api/admin/conquer`: `GET /requests` y `/requests/count`, `POST /members` (activar), `GET /members` (tablero), `GET/PUT /members/:userId` (ficha, incremento, nivel, días), `PUT /members/:userId/steps`, `POST /members/:userId/recortes`, `POST /members/:userId/level-up`, `PATCH /alerts/:id`, `GET /gallery`, `GET /members/:userId/body-checks/:id/photos/:pose/url`, catálogo CRUD (`ladders`, `rungs`, `exercises`, `template-days`), `GET/PUT /settings`.

## 9. Motor: oráculo → módulo TS, casos dorados y ambigüedades

**Mapeo `conquer-app.html` → `engine.ts`:**

| Oráculo (JS) | TS | Nota |
|---|---|---|
| `LAD`, `DIAS`, `CMB`, `MODOS` | filas del catálogo / constantes de combos | El oráculo trae los datos hardcodeados; el catálogo SQL debe producir **exactamente** `LAD`/`DIAS` (test de paridad contra el HTML) |
| `INC={reps:1,s:2}`, `PISO`, `TECHO` | `engine.ts` constantes; incremento por alumno | |
| `reales(d,i,k)` | `selectReales(sessionSteps, since, currentRungId)` | Ver A1 (regla del día del cambio) |
| `next(d,i,k)` | `nextTarget(values, unit, inc)` | El hold devuelve `obj=null` (se maneja afuera: `unit` del hold es `s` pero sin objetivo) |
| `siguienteProg(lad,p)` | `harderRung(ladderRungs, currentRungId)` | Devuelve `null` en el tope (el oráculo devuelve el mismo peldaño) |
| `hoyForm` precarga | server arma `today` | `value = objetivo`; hold = última marca o 8 |
| acierto/Δ en `vProg` | `accuracy(sessionSteps)` | Ver A8 |
| calibración §4.3 | **no está en el oráculo** | Se escribe nueva (9.4) |

**9.1 Casos dorados del motor (todos ejecutados contra el oráculo con `vm`, 2026-10-21) [VERIFIED]:**

| Historial del escalón (más viejo → más nuevo) | Unidad | Objetivo | Estado |
|---|---|---|---|
| (vacío) | reps | 3 | sin datos |
| 6 | reps | 7 | rango |
| 6, 7 | reps | 8 | rango |
| 6, 7, 8 | reps | 8 | techo1 |
| **6, 7, 8, 8** | reps | **3** | **subir** (S12-5) |
| 8, 7 | reps | 8 | rango |
| 8, 8, 7 | reps | 8 | rango |
| 2 | reps | 3 | bajo |
| 3 | reps | 4 | rango |
| 5, 2 | reps | 3 | bajo |
| 8, 8, 8 | reps | 3 | subir |
| (vacío) | s | 4 | sin datos |
| 9 | s | 11 | rango |
| 3 | s | 5 | bajo |
| 10, 12 | s | 12 | techo1 |
| 11, 12 | s | 12 | techo1 |
| 12, 12 | s | 4 | subir |
| hold | s | null ("al fallo") | — |

**Hoja "Simulación" del xlsx** (parseada con `zipfile`/`xml.etree`, sin instalar nada; script en el scratchpad): 12 sesiones de E1, reales `5,6,7,8,8 | 3,4,5,6,7,8,8`, con cambio de progresión después de la 5ª. Predicho esperado `3,6,7,8,8,3,4,5,6,7,8,8`; estado `en rango, en rango, en rango, techo 1 de 2, SUBIR, en rango ×5, techo 1 de 2, SUBIR`. El oráculo reproduce exactamente esa serie (objetivo tras cada sesión: `6,7,8,8,3,4,5,6,7,8,8,3`, es decir el predicho desplazado un lugar) [VERIFIED]. Los textos de `Reglas` del xlsx coinciden con §4. Hoja `Combos`: objetivo 3 series y **4 desde S3**; estado `✓ completo` / `faltaron N` comparando la última semana.

**Harness diferencial (Node, sin dependencias):** el `<script>` del HTML se evalúa con `vm.createContext` y stubs mínimos (`document.getElementById`/`querySelectorAll`/`addEventListener`, `window`, `localStorage`, `setTimeout`); luego se asignan `S.perfil = defPerfil()` y `S.ses = [...]` y se llama `next('Plancha', 1, 'e1')` (ejercicio 1 = Planche press, reps; ejercicio 0 = Planche hold, segundos). Probado: corre sin errores. Para el test en CI, **copiar `conquer-app.html` a `el-templo-api/test/conquer/fixtures/`** (el test no debe depender de `.planning/`), y comparar `nextTarget` contra el oráculo sobre una grilla de historiales (todas las secuencias de longitud ≤4 sobre `{0,2,3,5,6,7,8,9,12}`) por unidad. Corre en `vitest.config.unit.ts` (sin DB) además de en la suite completa.

**9.2 Ambigüedades y defaults propuestos** (los marcados ⚠ conviene confirmarlos con Nacho/Franco antes de planificar; todos `[ASSUMED]` salvo que se diga lo contrario):

- **A1 ⚠ El día del cambio.** El oráculo cuenta sesiones con `fecha > desde` (estricto). Si el alumno cambia el peldaño en el desplegable **antes** de guardar hoy (que es el flujo normal en Hoy), la sesión de hoy queda con `fecha == desde` y se **ignora**: mañana el objetivo vuelve al piso en vez de `hoy+inc`. Verificado: con `desde=d5` cuentan solo las del d6 en adelante; con `desde=d6` la sesión del d6 se pierde ("sin datos", objetivo 3) [VERIFIED]. Default: cuenta la sesión si `fecha > since_date` **o** (`fecha == since_date` y el `rung_id` guardado en `conquer_session_steps` es el peldaño actual). Así la sesión que dispara SUBIR (guardada con el peldaño viejo) se excluye y la guardada con el peldaño nuevo se incluye. Para historiales en días distintos es idéntico al oráculo.
- **A2 Subir en el último peldaño.** El oráculo no se detiene (`siguienteProg` devuelve el mismo peldaño y reinicia `desde`: bucle infinito de SUBIR). Default: sin siguiente peldaño → no hay botón, el estado sigue "subir" pero se emite alerta 🟡 `tope_escalera` (§4.5, §5).
- **A3 Un escalón por vez.** El oráculo lista todos los SUBIR. Default §4.5: por ejercicio solo el primero con `subir` en orden E1→E2→E3 ofrece el botón; los otros muestran "después". El hold nunca sube.
- **A4 "Si no llegó, el objetivo no baja solo" vs fórmula.** La fórmula del oráculo da `ultimo+inc`, por lo que un 5 tras un objetivo de 8 produce objetivo 6 (baja respecto de lo mostrado). Default: la fórmula manda (es el oráculo); la frase significa que no se baja de progresión automáticamente.
- **A5 ⚠ Calibración (§4.3) no existe en el oráculo.** Casos nuevos a escribir (reps / segundos): `<3 / <4` → bajar; `3-5 / 4-8` → quedarse; `≥6 / ≥9` → subir. Aplica a la **primera sesión de cada ejercicio y a la primera tras cambiar la progresión del E1**; solo mientras `selectReales(E1).length === 1` y `calibration='pendiente'` (desde la 2ª sesión corre §4.4). Preguntas: ¿"subir/bajar una progresión" mueve solo el E1 o todo el ejercicio (E1, E2, E3 y hold)? Default: **todo el ejercicio un peldaño** (la posición de E2/E3 es relativa a E1 en §8.2), acotado en los extremos de la escalera; aceptar reinicia `since_date` de los 4 escalones y vuelve a `calibration='pendiente'`; rechazar pasa a `resuelta`. Interacción: 1ª sesión con E1=8 → la calibración dice subir y §4.4 dice "techo 1 de 2"; ambas pueden convivir.
- **A6 ⚠ "Caída" (§5).** "El E1 baja 2 sesiones seguidas (sin contar la semana 1 de calibración)". Default: sobre las marcas del E1 posteriores a `since_date`, descartar la primera (calibración); alertar cuando las últimas **dos comparaciones consecutivas** son bajas estrictas (`a > b > c`), es decir con ≥4 sesiones desde el último cambio. Alternativa más sensible: contar la 1ª como base (≥3 sesiones). Ojo con el ruido: la marca es la peor de 3 series. Un SUBIR/cambio de peldaño reinicia la cuenta (si no, el 3 posterior al SUBIR dispararía "caída"). Dedupe por `ejercicio:fecha`.
- **A7 Unilateral.** Solo etiqueta ("por lado"): el valor cargado es el del lado más flojo; no cambia el motor. La marca se lee del peldaño **actual** de cada escalón.
- **A8 Acierto.** El oráculo calcula el % solo con las sesiones posteriores a `desde` (un SUBIR borra el historial de acierto). §4.6 no lo dice. Default: acierto y Δ sobre **todo** el historial con `prev_target` no nulo; `real >= prev` cuenta como acierto; Δ = promedio de `real − prev`. La hoja Modelo del xlsx lo calcula igual.
- **A9 ⚠ Precarga = objetivo.** El oráculo guarda el valor precargado como si el alumno lo hubiera hecho; un "Guardar" sin tocar nada cuenta como objetivo cumplido e infla la progresión. Default: igual que el oráculo (cumple S12-2), pero **registrar `touched`** no se pide en la spec; si Franco quiere protegerlo, exigir al menos un toque por ejercicio. Se deja como pregunta abierta.
- **A10 Hold.** Sin objetivo (siempre "al fallo"); precarga = última marca, 8 s si no hay.
- **A11 ⚠ Combos / "semana del bloque" (§3.2).** El oráculo no calcula objetivo (el HTML dice solo "objetivo 3 · 4 desde la semana 3"); el xlsx sí (3, y 4 desde S3). "Bloque" no está definido. Default: semana del bloque = semana calendario desde `activated_at`, sin rotación; objetivo apertura = 3 hasta la semana 2 y 4 desde la 3 (recorte 4 lo baja a 3); sábado = 3 máximas + 10 drops = 13 (recortes 1/2 lo bajan). Regla D-14.3: si en N semanas calendario seguidas (N=2, editable) la apertura de un día alcanzó el objetivo, aparece Subir en la progresión de arranque (escalera Palanca, §3.3) con el mismo patrón que los escalones, incluido el tope.
- **A12 ⚠ Recortes (§5.1).** Orden 1-5 solo para Toro; Ternero/Novillo solo el paso 6. La molestia se registra por sesión, no por escalón, así que "el escalón que dispara la molestia" es indeterminado: default, el coach elige el escalón al aceptar (por defecto el E1 del primer ejercicio de la sesión). Qué sigue al paso 5 en Toro: default, el paso 6. "Se reevalúa a la semana": default, sin reversión automática; el coach puede deshacer el último recorte. Estado en `conquer_members.cut_stage`.
- **A13 Paso de nivel (§2.2).** Default: 4 semanas calendario consecutivas (lunes-domingo, TZ de la sede, desde `level_since`) con todos los días del plan hechos (`days_count`, sin sábado) y ninguna molestia ≥4; Toro no tiene nivel siguiente. Persiste como alerta 🟢; confirmar cambia `level` y reinicia `level_since`. Las progresiones no se tocan al subir de nivel.
- **A14 Nivel ↔ días.** Default: Ternero 2|3, Novillo 3|4, Toro 4 (+ sábado). Validar al activar.
- **A15 D-16 Hoy.** El plan de cada plantilla define el orden (4 días: Plancha, Front, Vertical, Dominadas; 3 días: Empuje, Tracción, Mixto; 2 días: Empuje, Tracción); el sábado de Toro va al final de la lista. Falta = no hay sesión de ese `day_key` entre el lunes y el domingo actuales (TZ sede).
- **A16 Fechas.** `session_date = todayInTz(tz de la sede del alumno)` calculada en el server (`shared/date-utils.ts`); `mondayOf` de `shared/week-dates.ts` usa `new Date(date+'T00:00:00')` en hora local del proceso: el EC2 corre en UTC (sin DST), pero un test local con otra zona puede diferir; escribir los cálculos de semana con aritmética UTC sobre strings.
- **A17 xlsx vs spec.** El xlsx (hoja Escaleras) lista `Hold de vertical` como hold del combo Vertical; la síntesis §3.4 y el oráculo (`CMB.Vertical`) dicen `Hold de plancha`. Manda la síntesis.
- **A18 Prototipo.** Las pantallas `sesion`/`carga`/`fin` del prototipo implementan el registro **por serie** (descarte D-06/§11); para Hoy/Sábado/Progreso la referencia es `conquer-app.html`. Del prototipo salen estética, Bloqueado, Inicio, Niveles y Evolución. Además trae la portada como `COVER` (JPEG base64 de ~73 KB): extraer a un archivo en `el-templo-app/public/`.
- **A19 Permiso de publicación vs vista.** §12 dice "las fotos no se ven sin permiso"; §6/D-08 definen visibilidad por rol (alumno, owner, admin). Default: es control de acceso, no el flag de publicación; `publish_enabled` solo alimenta el filtro "autorizados" de la galería interna.

**9.3 Casos dorados nuevos (a escribir, sin oráculo):** calibración (reps 2→bajar, 3→quedarse, 5→quedarse, 6→subir, 8→subir; segundos 3→bajar, 4→quedarse, 8→quedarse, 9→subir, 12→subir); caída (`5,6,4,3` alerta; `5,6,4,5` no; `5,6,6,5` no; tras cambio de peldaño se reinicia); recortes (secuencia 1→5 y el paso 6); paso de nivel (3 semanas completas + 1 incompleta no alerta; 4 completas sí; una molestia de 4 en la tercera lo corta); encendido (ver 9.4).

**9.4 Encendido muscular (D-13, regla adaptada):** por ejercicio de la sesión, si algún E1-E3 tiene valor >0 → suma 3 series a cada zona del ejercicio con su rol (una serie suma una vez por zona aunque se repita en varios escalones). Zona encendida: **principal si ≥2 series principales; secundaria si ≥4 series secundarias**; principal gana. Para "hoy" se usa la sesión recién guardada; para "semana", todas las sesiones lunes-domingo. El hold y el finisher no cuentan. Con esta regla un solo ejercicio enciende sus zonas principales, y una zona secundaria necesita al menos dos ejercicios (6 series ≥ 4). El server devuelve `{zone, level}[]` y el app los pasa a `BodyFigure` (`lit` = principales, `lit2` = secundarias); sin números ni porcentajes, sin rojo; frase tipo "Hoy trabajaste N zonas" (copy de la 196, sin "te falta").

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Subida de fotos | Endpoint que recibe el binario | URL firmada PUT/GET con `@aws-sdk/s3-request-presigner` (`private-media.ts`) | El API no maneja bytes; URL de minutos; sin URL pública |
| Cámara | `<input type=file>` casero | `@capacitor/camera` con `saveToGallery:false` (copiar `useBodyCheckCamera.ts`) | Permisos nativos, formato, nada en la galería |
| Figura anatómica | SVG nuevo / copiar `anatomia.json` | `components/anatomy/BodyFigure.vue` | Ya hecha, idéntica a la de la 196 y la usa la 200 |
| Aislamiento por gimnasio | `where tenant_id = …` manual | `tenantWhere` / `tenantValues` / `assertTenant` | Lint y sentinel de CI lo exigen |
| Pop-up de lanzamiento | Modal propio con "visto" propio | Aviso `custom` popup `once` de Comunicaciones + destino `conquer` | Ya cuenta vistas por socio |
| Parámetros editables | Tabla nueva de config | `tenant_settings` + default en código | Regla v6.1, precedente `invitation-settings.ts` |
| Semanas y fechas | `new Date()` suelto | `shared/date-utils.ts` (`todayInTz`, `addDays`) y `week-dates.ts` | TZ de la sede, no del servidor ni del cliente |
| Guard de módulo | Hook propio | `moduleScope(app, "templo-training", …)` | 404 uniforme; el gate del manifiesto lo exige |
| Fuentes | `<link>` a Google Fonts | `@fontsource/*` (CSS en el build) | Sin CDN en producción |
| Estado diferencial vs oráculo | Reescribir las reglas "a ojo" | Test que evalúa el HTML original con `vm` | Es la spec ejecutable |

**Idea clave:** el valor de esta fase está en el motor y en la privacidad de las fotos; todo lo demás es CRUD con tenancy. No inventar un segundo motor ni un segundo sistema de avisos.

## Common Pitfalls

### Pitfall 1: copiar el comportamiento defectuoso del oráculo
**Qué falla:** bucle infinito de SUBIR en el último peldaño, todos los SUBIR a la vez, sesión del día del cambio ignorada, acierto que se borra al subir.
**Cómo evitarlo:** casos dorados con esas cuatro situaciones (A1-A3, A8) y el test diferencial restringido a historiales donde el oráculo es correcto.
**Señal:** objetivo que vuelve a 3 el día del cambio; botón Subir que no cambia nada.

### Pitfall 2: fecha y `prev` del cliente
**Qué falla:** un reloj del teléfono mal puesto crea sesiones en fechas raras; `prev` falsificable rompe el acierto.
**Cómo evitarlo:** el server fija la fecha en la TZ de la sede y recalcula `prev` con el historial anterior; el cliente solo manda valores y dolor.

### Pitfall 3: fallback del bucket privado al público
**Qué falla:** la 196 usaba `R2_PRIVATE_BUCKET_NAME || fastify.r2Bucket` (línea ~149 de `private-media.ts`): sin la variable, las fotos de alumnos van al bucket con `R2_PUBLIC_URL` y dependen de bloquear el prefijo `private/` a mano.
**Cómo evitarlo:** sin la variable, 503 limpio. Agregar la variable a `.env.example` y a **los dos** workflows (el deploy pisa el `.env`; staging necesita su propio bucket).

### Pitfall 4: tamaño y tipo de lo subido
**Qué falla:** un PUT firmado no limita el tamaño; `exists()` de la 196 sólo hace `HEAD`.
**Cómo evitarlo:** en `confirm`, `HEAD` con `ContentLength` (tope p.ej. 8 MB) y `ContentType` en la lista cerrada; clave validada por regex contra tenant/usuario/control/pose.

### Pitfall 5: conteos de tenancy y limpieza de tests
**Qué falla:** CI cae en 4-5 tests de números fijos aunque `tsc` y `lint:tenant` pasen (sección 6); `cleanAllTestData` borra el catálogo sembrado si está en `TABLES_TO_CLEAN`.
**Cómo evitarlo:** checklist de la sección 6 en el mismo commit que cada tabla.

### Pitfall 6: `;` dentro de strings del seed
**Qué falla:** el runner parte por `;` antes de quitar comentarios; un texto con `;` o un comentario con `;` rompe la migración y TODO el test (`test/setup.ts` usa el mismo parser).
**Cómo evitarlo:** `--> statement-breakpoint` entre statements; sin `;` en `--`.

### Pitfall 7: estilos de Conquer que se filtran
**Qué falla:** variables o fuentes azules/doradas globales cambian el resto del app.
**Cómo evitarlo:** variables `--cq-*` bajo una clase raíz de Conquer; `@import` de las fuentes dentro del componente asíncrono (no en `app.scss`); `BodyFigure` se sobreescribe con `:deep()` bajo esa raíz.

### Pitfall 8: figura que no mide
**Qué falla:** `BodyFigure` usa `getBBox`; dentro de `display:none` queda oculta.
**Cómo evitarlo:** montarla con `v-if` cuando el panel ya es visible (hoja de "Guardar", pane de Progreso).

### Pitfall 9: alertas duplicadas al sobrescribir la sesión
**Qué falla:** guardar de nuevo la misma sesión crea otra "molestia"/"caída".
**Cómo evitarlo:** UNIQUE `(tenant, user, type, dedupe_key)` + upsert; si la condición dejó de cumplirse y la alerta sigue abierta, auto-resolverla.

### Pitfall 10: choque 200/201 al mergear
Ver sección 3: `ENTRADAS_BASELINE`, `featureFlags.ts`, `EntrenarView.vue`, numeración de migraciones.

### Pitfall 11: dato sensible en logs y Sentry
Fotos, claves, URLs firmadas, perímetros y peso nunca en logs (loguear `{checkId,pose}`); el `beforeSend` de Sentry sólo borra contraseñas. Las URLs firmadas pueden quedar en breadcrumbs de `fetch` (PUT): bajo riesgo (10 min, un objeto), endurecer opcionalmente quitando la query del host de R2.

## Code Examples

### Caída del E1 (A6, default) — módulo puro
```ts
// values: marcas del E1 desde el último cambio de peldaño, cronológicas.
export function caidaE1(values: readonly number[]): boolean {
  const v = values.slice(1); // la 1ª es la de calibración
  if (v.length < 3) return false;
  const [a, b, c] = v.slice(-3);
  return a > b && b > c;
}
```

### Calibración (§4.3)
```ts
export type Calibracion = "subir" | "quedarse" | "bajar";
export function calibracion(e1: number, unit: "reps" | "s"): Calibracion {
  const [piso, alto] = unit === "reps" ? [3, 6] : [4, 9];
  return e1 < piso ? "bajar" : e1 >= alto ? "subir" : "quedarse";
}
```

### Validación de clave de foto al confirmar (patrón de `isPoseExampleKey`, 196)
```ts
const POSES = ["frente", "perfil", "espalda"] as const;
export function isOwnPhotoKey(key: string, t: number, u: number, c: number, pose: string): boolean {
  return new RegExp(
    `^private/conquer/${t}/${u}/${c}/${pose}-[0-9a-f-]{36}\\.(jpg|png|webp)$`,
  ).test(key);
}
```

### Figura con zonas encendidas en tema Conquer
```vue
<!-- Fuente: components/anatomy/BodyFigure.vue (197-10) -->
<div class="cq-fig">
  <BodyFigure :gender="gender" :lit="principalZones" :lit2="secondaryZones" tone="sage" :height="200" />
</div>
<style scoped lang="scss">
.cq-fig :deep(.body-figure--sage .mu--lit path) { fill: var(--cq-gold-hi); }
.cq-fig :deep(.body-figure--sage .mu--lit2 path) { fill: var(--cq-gold); }
.cq-fig :deep(.body-figure__caption) { color: var(--cq-muted); }
</style>
```

### Harness local del oráculo (Node ≥22, sin dependencias; resumen del script verificado)
```js
const vm = require("node:vm"), fs = require("node:fs");
const js = fs.readFileSync(".../conquer-app.html", "utf8").split("<script>")[1].split("</script>")[0];
const el = () => ({ textContent: "", innerHTML: "", classList: { add() {}, remove() {} }, dataset: {}, querySelector: () => null });
const ctx = { document: { getElementById: el, querySelectorAll: () => [], addEventListener() {} },
  window: {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, console };
vm.createContext(ctx); vm.runInContext(js, ctx);
// luego: S.perfil=defPerfil(); S.ses=[{fecha,dia:'Plancha',pasos:{1:{e1:v}},prev:{1:{e1:null}}}]; next('Plancha',1,'e1')
```

## State of the Art

| Enfoque viejo | Actual | Cuándo cambió | Impacto |
|---|---|---|---|
| Conquer v1 (196): 17 tablas `conquer_*` acopladas a `personalized_*`, registro por serie, sugerencias con aprobación, cola offline | v2: 10 tablas, un número por escalón, SUBIR del alumno sin aprobación, sin offline | 2026-10-21 (síntesis de Nacho) | ~70k líneas parqueadas; se reusan solo piezas |
| Marcas en `exercises` + `exercise_muscles` (mig 0269) | Marcas en el peldaño; zonas en el ejercicio | esta investigación | Menos tablas gym-owned y `exercises` intacta |
| Fuentes por Google Fonts en los HTML de referencia | `@fontsource/*` en el build | regla "sin CDN en producción" | Los HTML de `ref/` linkean `fonts.googleapis.com`: no copiar esa línea |

**Obsoleto:** `ConquerPose` con poses opcionales de bíceps, fotos de ejemplo por pose, tipos de medida configurables (la 196); `ENTRENAR_TABS_ENABLED=false` (a revertir).

## Assumptions Log

| # | Claim | Sección | Riesgo si es falso |
|---|---|---|---|
| AS-1 | Regla del día del cambio (`fecha > since` o snapshot de peldaño actual) | 9.2 | Objetivos mal reiniciados; resolver con test dorado |
| AS-2 | Calibración mueve todo el ejercicio, no solo E1 | 9.2 A5 | Si Nacho quiere solo E1, cambia el servicio de aceptación |
| AS-3 | Registrar rutas con `moduleScope("templo-training")` | Patrón 3 | Otro gimnasio vería la tab; el manifiesto cambia de categoría |
| AS-4 | Alumno sin plan queda en la vidriera sin acceso a Conquer | 2 | Un alumno online con Conquer activado no podría usarlo |
| AS-5 | Caída = 2 bajas estrictas tras descartar la sesión de calibración (≥4 sesiones) | 9.2 A6 | Alertas tardías o falsas |
| AS-6 | Semana del bloque = semana calendario desde `activated_at`, sin rotación | 9.2 A11 | Objetivo de apertura (3/4) incorrecto |
| AS-7 | Recortes: Toro 1→5 luego 6; el coach elige el escalón del paso 6; sin reversión automática | 9.2 A12 | Flujo de recortes distinto |
| AS-8 | Paso de nivel: 4 semanas con todos los días del plan sin sábado | 9.2 A13 | Falsos 🟢 |
| AS-9 | Marcas `brazos_rectos`/`unilateral` y zonas por ejercicio de la semilla propuesta | 8 | Textos de fallo y mapa incorrectos hasta que Nacho valide |
| AS-10 | Finishers de las plantillas de 2/3 días | 8 | Texto equivocado en Hoy |
| AS-11 | Alertas por tiempo derivadas en lectura, sin cron | 8 | Si se quiere "vista/resuelta" para esas alertas hace falta persistirlas |
| AS-12 | `destinations.test.ts` tiene conteo fijo de secciones | 4 | Un test extra para tocar |
| AS-13 | Nacho tendrá rol `admin` u `owner` | 5 | No podría validar en la prueba |
| AS-14 | ISO-03 no aplica a `/api/{admin,members}/conquer` | 6 | Casos ISO-03 adicionales |
| AS-15 | Precarga igual al objetivo sin exigir toque (como el oráculo) | 9.2 A9 | Progresión inflada por "Guardar" sin hacer nada |

## Open Questions

1. **¿La calibración mueve solo el E1 o todo el ejercicio?** (AS-2, A5 de 9.2) Default: todo el ejercicio; Nacho valida.
2. **¿Qué es un "bloque" y cuánto dura?** (§3.2, AS-6, A11 de 9.2) Default: semanas desde la activación, sin rotación.
3. **Recorte 6 (Ternero/Novillo): ¿qué escalón baja si la molestia es por sesión?** Default: lo elige el coach al aceptar.
4. **¿Alumno sin plan puede abrir Conquer?** (AS-4) Default: no (vidriera).
5. **Finishers de las plantillas de 2 y 3 días, marcas `brazos_rectos`/`unilateral` por peldaño y zonas por ejercicio**: no están en la síntesis; hay semilla propuesta que Nacho valida.
6. **¿Exigir un toque por ejercicio antes de guardar?** (AS-15) Default: no.
7. **Coordinación de migraciones con la 200** (sección 7): confirmar 0287-0289 para ella y 0290+ para la 201.
8. **Aprobación de `@fontsource/jost`** (instalar dependencias requiere OK de Franco).
9. **Infra:** bucket R2 privado + CORS + secrets (`R2_PRIVATE_BUCKET_NAME`, `STAGING_R2_PRIVATE_BUCKET_NAME`) los crea Franco; sin eso el control físico responde 503.
10. **¿D-01 dice base `origin/master` pero D-10 y la rama real usan `origin/staging`?** Verificado: la rama está sobre staging (tiene 0285/0286); tomar staging como base.

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node | motor, harness del oráculo, type-stripping | ✓ | v22.22.0 | — |
| pnpm | scripts del repo | ✓ | 10.28.2 | — |
| MySQL (cliente) | migraciones/tests en CI | cliente ✓ (8.0.46); servidor no verificado | — | CI corre los tests |
| `node_modules` en el worktree | tsc/vue-tsc/eslint/vitest | ✗ (no hay ni se instalan) | — | Verificación estática (grep, `python3 -I`, `node` sobre el motor) y CI |
| python3 | parsear el xlsx y greps | ✓ | — | — |
| slopcheck | auditoría de paquetes | ✓ (`scan`; el `install` auto-detecta PyPI y no sirve) | — | — |
| Bucket R2 privado + CORS | fotos | ✗ (infra de Franco) | — | Sin bucket el control responde 503; no usar el bucket público |
| Secrets de deploy `*_R2_PRIVATE_BUCKET_NAME` | fotos en staging/prod | ✗ | — | Franco los crea; hasta entonces las fotos fallan limpio |
| Context7 / ctx7 | docs | no usado | — | Docs oficiales no necesarias (la fase es de código propio) |

**Sin fallback que bloquee:** bucket y secrets (bloquean la prueba real de fotos, no el desarrollo ni los tests, que mockean el store con `vi.spyOn(privateMediaResolver, "resolve")`).

## Validation Architecture

`workflow.nyquist_validation` no está en `false` (config: `research:false, plan_check:true, verifier:true`): sección incluida.

### Test Framework

| Propiedad | Valor |
|---|---|
| API | vitest ^4.0.18; `vitest.config.ts` (MySQL real, `test/**/*.test.ts`, `setup.ts` provisiona `eltemplo_test_<POOL_ID>`) y `vitest.config.unit.ts` (sin DB, `test/unit/**`) |
| App | vitest ^4.0.18, `vitest.config.ts` (env node, alias `src`), `test/` y `src/**/__tests__` |
| Admin | **sin vitest**: verificación por `vue-tsc` + UAT |
| Comando rápido | `cd el-templo-api && pnpm vitest run test/unit/conquer-engine.test.ts` (CI) |
| Suite completa | `cd el-templo-api && pnpm test`; `cd el-templo-app && pnpm test` |
| Regla local | Los tests corren en CI, no local (memoria); sí `tsc --noEmit` y `vue-tsc`. En este worktree no hay `node_modules`: la verificación local del motor es el harness `node` |

### Phase Requirements → Test Map

| Req | Comportamiento | Tipo | Comando / forma | Existe |
|---|---|---|---|---|
| S12-1 | Activar con nivel y días crea steps desde la tabla de Toro + offset del nivel | integración API | `test/conquer/members-admin.test.ts` | ❌ Wave 0 |
| S12-1 | Alta < 5 min | manual UAT | cronometrar en el admin | manual (justificación: es de usabilidad) |
| S12-2 | `GET /today` devuelve valores precargados = objetivo; guardar = 1 request | integración | `test/conquer/today-session.test.ts` | ❌ |
| S12-2 | < 1 min de carga | manual UAT | teléfono real | manual |
| S12-3 | Novillo/Ternero: sin apertura ni sábado; `PUT` de sábado → 403/409; Toro sí | integración | `test/conquer/levels.test.ts` | ❌ |
| S12-4 | Calibración 2/3/5/6/8 reps y 3/4/8/9/12 s → bajar/quedarse/subir | unitario + integración | `test/unit/conquer-engine.test.ts`, `test/conquer/calibration.test.ts` | ❌ |
| S12-5 | 6,7,8,8 → SUBIR; Subir pasa al peldaño más difícil; siguiente objetivo 3 | unitario + diferencial + integración | `test/unit/conquer-engine.test.ts` (+ oráculo en `fixtures/`), `test/conquer/subir.test.ts` | ❌ |
| S12-5 | Tope de escalera: sin botón + alerta 🟡 | integración | `test/conquer/subir.test.ts` | ❌ |
| S12-6 | Molestia 4 → alerta roja + recorte propuesto; re-guardar no duplica | integración | `test/conquer/alerts.test.ts` | ❌ |
| S12-7 | Tablero con 30 alumnos en una request, ordenados por semáforo, cantidad de queries acotada | integración | `test/conquer/board.test.ts` | ❌ |
| S12-8 | Foto: otro alumno → 404; rol no autorizado → 403; sin `R2_PRIVATE_BUCKET_NAME` → 503; clave ajena en `confirm` → 400/409; tamaño/tipo | integración (store mockeado con `vi.spyOn`) | `test/conquer/body-checks.test.ts` | ❌ |
| S12-8 | Día 0 pedido al entrar; "Lo hago después" crea alerta | integración + manual | idem | ❌ |
| S12-9 | 390 px | manual UAT (Chrome devtools + teléfono) | `vue-tsc` + UAT | manual |
| D-12 | Pedido idempotente, contador y activación | integración | `test/conquer/requests.test.ts` | ❌ |
| D-13 | Regla de encendido (≥2 principal / ≥4 secundario; hold y finisher no) | unitario | `test/unit/conquer-lighting.test.ts` | ❌ |
| D-14 | Plantillas 2/3 días, offset de nivel, N semanas de combos desde settings | integración | `test/conquer/settings-catalog.test.ts` | ❌ |
| D-16 | "Qué día toca": primer día faltante de la semana (TZ sede), "Semana completa" | unitario | `test/unit/conquer-calendar.test.ts` | ❌ |
| Tenancy | Cada ruta con segundo gimnasio; manifiesto; conteos | integración | `test/tenancy/*`, `test/db/tenant-tables.test.ts` | existe (actualizar) |
| Migración | Tablas, uniques con `tenant_id`, semilla idempotente = paridad con `LAD`/`DIAS` del oráculo | integración | `test/migrations/0290-0292-conquer.test.ts` | ❌ |
| Pop-up | Destino `conquer` en las 3 copias | integración | `test/communications/destinations-sync.test.ts` | existe (se actualiza solo si cambia el conteo) |
| App | utilidades puras del app (parseo de medidas, mime, `litSlugs`-equivalente) | unitario app | `el-templo-app/src/modules/conquer/**/__tests__` | ❌ |

### Estrategia del test diferencial
`test/unit/conquer-engine.test.ts` evalúa `test/conquer/fixtures/conquer-app.html` con `vm` y compara `nextTarget` (objetivo y estado) contra `next()` para todas las secuencias de hasta 4 marcas sobre `{0,2,3,5,6,7,8,9,12}` y por unidad. Se **excluyen** de la comparación los casos donde el oráculo es incorrecto por diseño (A1, A2, A3, A8), que tienen casos dorados propios. Más: paridad catálogo/oráculo (la semilla produce las mismas escaleras y la misma tabla de arranque que `LAD`/`DIAS`), y la serie de la hoja "Simulación".

### Sampling Rate
- **Por commit de tarea:** motor/regla pura → harness `node` local (sin deps) + revisión de diff; el resto, estático (grep de higiene: `console.*`, `any`, `tenantWhere`).
- **Por merge de wave:** CI completo en la rama (el orquestador no corre tests local).
- **Gate de fase:** CI verde (API: tipos, lint, `lint:tenant`, tests; app/admin no se typechequean en CI → `vue-tsc` de los archivos tocados) y UAT en teléfono de Franco/Nacho.

### Wave 0 Gaps
- [ ] `el-templo-api/test/conquer/fixtures/conquer-app.html` (copia del oráculo)
- [ ] `el-templo-api/test/conquer/_helpers.ts` (crear alumno Conquer, segundo gimnasio, mock de `privateMediaResolver`, control de "hoy" con fake timers sólo de `Date`; ver memoria "saltos relativos a `Date.now()`")
- [ ] Todos los archivos marcados ❌ arriba
- [ ] Sin instalación de framework (ya existen); la única dependencia propuesta es `@fontsource/jost` (aprobación aparte)

## Security Domain

`security_enforcement` no está desactivado: sección incluida.

### Applicable ASVS Categories

| Categoría ASVS | Aplica | Control estándar |
|---|---|---|
| V2 Autenticación | no (reusa `fastify.authenticate`) | JWT existente |
| V3 Sesiones | no | refresh tokens existentes |
| V4 Control de acceso | **sí** | `canManageConquer`/`canViewConquerPhotos`; `userId` solo del token; 404 (no 403) ante recurso ajeno; `moduleScope` |
| V5 Validación de entrada | **sí** | JSON-schema de Fastify por ruta; rangos (valores ≥0 y topes, dolor 0-10, perímetros 10-300 cm, peso 20-400 kg); enums cerrados; clave de foto por regex |
| V6 Criptografía | no propia | firma SigV4 de S3/R2 vía SDK; nunca hand-roll |
| V8 Protección de datos | **sí** | fotos y medidas = datos sensibles de salud/imagen; bucket privado; URLs firmadas de 5 min con `Cache-Control: no-store`; sin logs de claves/URLs |

### Known Threat Patterns

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| IDOR en fotos/controles (`checkId` de otro alumno u otro gimnasio) | Information disclosure | Resolver siempre por pareja (`checkId`, `userId` dueño) con `tenantWhere`; 404 uniforme; orden 404→503→409 |
| Foto de otro alumno vía `confirm` con clave ajena | Tampering | Regex de clave contra tenant/usuario/control/pose + `HEAD` |
| Bucket público por falta de la variable | Information disclosure | Sin fallback: 503 |
| Archivo enorme o tipo no permitido | DoS / Tampering | Enum de `Content-Type`, `HEAD` con `ContentLength` máximo |
| Alumno toca datos de otro (`:userId` en rutas de alumno) | Elevation | Las rutas de alumno no reciben `userId`; admin lo recibe y exige `canManageConquer` |
| Escalada de rol (coach/gestion usan rutas de admin) | Elevation | Guard de plugin con `canManageConquer` + test por rol |
| Otro gimnasio ve o escribe el catálogo | Information disclosure | `tenantWhere` en todo; semilla solo tenant 1; `moduleScope` |
| Valores fuera de rango o `rung_id` de otra escalera | Tampering | El server toma peldaño/modo del estado, no del body; `rung` validado contra la escalera del ejercicio |
| Fecha manipulada | Tampering | Fecha del servidor |
| Doble guardado / carrera | Tampering | UNIQUE + upsert en transacción; botón deshabilitado mientras guarda |
| Fotos o URLs en Sentry/logs | Information disclosure | Solo `{checkId,pose}`; opcional recortar la query de URLs de R2 en breadcrumbs |
| Enumeración del contador de pedidos | Information disclosure | Endpoint solo `canManageConquer` |

## Sources

### Primary (HIGH)
- Código del repo, lectura directa: `201-CONTEXT.md`, `ref/conquer-desarrollo-sintesis.md`, `ref/conquer-app.html` (oráculo, **ejecutado**), `ref/conquer-registro.xlsx` (parseado), `ref/conquer-prototipo.html`, `CLAUDE.md`, `.claude/skills/{el-templo-db-migrations,el-templo-change-control}`.
- Staging (este worktree): `plugins/r2.ts`, `modules/shared/{permissions,tenant,module-registry,modules,date-utils,week-dates}.ts`, `modules/communications/destinations.ts`, `db/schema/communications.ts`, `db/tenant-tables.ts`, `test/db/tenant-tables.test.ts`, `test/tenancy/*`, `test/tenant-manifest.ts`, `test/helpers.ts`, `app/src/modules/training/*`, `config/featureFlags.ts`, `components/anatomy/*`, `config/destinations.ts`.
- 196 (`/home/franco/projects/et-196-personalizados`): `private-media.ts`, `body-checks.ts`, `body-check-rules.ts`, `balance-map.ts`, `muscles.ts`, mig 0269/0276, `LadderBuilder.vue`, `conquer-ladder.ts`, app `useBodyCheckCamera.ts`, `body-check.ts`, `BalanceMap.vue`, `muscle-figure.ts`, `196-38-SUMMARY.md`, `196-UAT.md`.
- 200 (`/home/franco/projects/et-200-anatomia`): `200-CONTEXT.md`.
- Escaneo de migraciones en 56 worktrees y ramas remotas.
- Registro npm: `npm view @fontsource/jost` (versión, fechas, mantenedores, sin postinstall); `slopcheck scan` → [OK].

### Secondary (MEDIUM)
- Memorias del proyecto: `reference_gates_tenancy_ruta_job_nueva`, `reference_tabla_gym_owned_nueva_cinco_conteos`.
- Verificación HTTP de existencia de `400/500/600.css` de Jost y `500/600/700.css` de Cormorant en el paquete publicado.

### Tertiary (LOW)
- `fontsource.org/fonts/jost/install` no confirmó el nombre del paquete (WebFetch sin esos datos).

## Metadata

**Confianza:**
- Stack estándar: ALTA — todo verificado en `package.json`/código; una sola dependencia nueva, auditada.
- Arquitectura y modelo de datos: MEDIA — el modelo es propuesta (el planner lo define); tenancy y gates verificados por lectura de tests.
- Motor: ALTA para §4.4/§4.5 (oráculo ejecutado); MEDIA para calibración, caída, recortes, bloque (sin oráculo, defaults marcados).
- Pitfalls: ALTA para los verificados en código; MEDIA para ISO-03 (no corrido).
- Cantera 196: ALTA (LOC y dependencias medidos).

**Fecha de investigación:** 2026-10-21
**Vigencia:** ~14 días o hasta que la 200 mueva migraciones/`ENTRADAS_BASELINE`, o cambie el `BodyFigure` compartido (fast-moving: tres fases en vuelo sobre staging).
