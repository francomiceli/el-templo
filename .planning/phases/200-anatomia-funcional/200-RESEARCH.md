# Fase 200: Anatomía funcional (profes, Guía y Entrenar) — Research

**Investigado:** 2026-10-21
**Dominio:** modelo de contenido versionado en el API (TypeScript) + proyección a zonas para TV/`/weekly`/canasta + 3 superficies Vue/Quasar (admin, Guía, Entrenar)
**Confianza:** ALTA en las costuras de código (todo leído en esta rama con file:line); MEDIA en la forma exacta del contenido (depende de destilar el §2); BAJA solo donde se marca.

<user_constraints>
## User Constraints (de 200-CONTEXT.md, copia literal)

### Decisiones bloqueadas

#### De la investigación (§0, Franco 2026-10-21)

- **D1 · Nombres oficiales:** HR = **Espinales y planchas laterales** · MN/RP = **Manna** · SIDE PCK = **Side Pancake** · HD/ID = **Fondos** · FLR = **Front Lever Row**. Reemplazan "Ham Raise", "L-Sit", "Side Pike Compression", "Hefesto / Impossible Dips" y "Front Lever Pull Ups" en DB (`routes.display_name`, por migración), TV y app (`route-labels.ts` de API y app).
- **D2 · PLYO, CARDIO y KL fuera de la v1** (99 ejercicios sin ruta): sin rutas nuevas ni fichas. Sí se corrigen por migración los **5 "SISSY SQ OL…" sin ruta → SS**.
- **D3 · Los profes solo leen y opinan.** El contenido vive en **archivos versionados en el repo** (opción B de §4.7), no en tablas. Mismo contenido para todos los tenants en v1. Sin tablas nuevas → sin gates de tenancy de tabla.
- **D4 · Dibujo actual** (23 zonas + `tibialis`, que hoy existe y no se usa) con **precisión por músculo** (exacta / agrupada / aproximada) y aviso "esta zona es un grupo". Zonas como datos, no enum cableado.
- **D5 · Kinesiólogo humano pendiente.** Todo el contenido nace en estado **borrador**.

#### Admin › Anatomía (sketch 019, ganador B2)

- **D6** Entrada nueva **Anatomía** en el menú (`NAV_MODEL`, categoría Entrenamiento, después de Árbol), para todo el staff que ve Entrenamiento. Diseño **mobile-first** (los profes entran al admin desde el celular); en escritorio, la misma navegación con el cuerpo a la izquierda y el panel a la derecha (019 ronda 1, B).
- **D7** Cuerpo frente / espalda en grande con botón para girar. Sin buscador (Franco eligió B2 sobre B3).
- **D8** Tocar una zona → **hoja desde abajo** (media pantalla; se arrastra a entera o se cierra; el cuerpo se achica arriba para que la zona marcada se vea). Por cada músculo de la zona: nombre, precisión, y **los roles como frase** arriba de las rutas: *Es motor en · Es sinergista en · Estabiliza en · Es antagonista en · Se estira en*. Rutas con **nombre completo + código chico** (sin repetir si son iguales).
- **D9** Cada rol tiene una **(i)** que despliega su definición con un ejemplo de nuestras rutas. **Glosario** (roles, tipos de contracción, precisión de zona) dentro de cada ficha ("¿Qué significa cada rol?"). **Sin** el link al glosario debajo del cuerpo.
- **D10** Músculos profundos que el dibujo no muestra (serrato, manguito rotador, iliopsoas) como chips debajo del cuerpo; abren la misma hoja.
- **D11** Tocar una ruta → **ficha a pantalla completa** con "← <zona>". Ficha: encabezado (complejo, código, n ejercicios, tipo, brazo, **"Borrador · sin validar"**), resumen, chips de sección, cuerpo pintado por rol + leyenda + "no están en el dibujo" + aviso de grupo, y secciones *Articulaciones y músculos · Fases · Por qué progresa (escalones) · Se siente / compensa · Cues · Cuándo derivar · Ejercicios*. Cada afirmación con su **marca de evidencia** (`[n]`, L1, C, M, R, H) con tooltip.

#### App › Guía (sketch 020, ganador Síntesis)

- **D12** La pestaña Guía pasa a ser una portada con **dos cards de media pantalla**: arriba **Empezá acá** (fondo oscuro con la foto de las barras, botón lleno "Ver la guía") que abre las historias **sin cambios**; abajo **Tu cuerpo** (card blanca con el cuerpo encendido asomando, botón lleno "Explorar").
- **D13** Los links "¿Qué es Nucleus?" (`guia-role-map.ts`) y cualquier deep link a un slide siguen yendo **directo a la historia**, no a la portada.
- **D14** **Tu cuerpo** = la vista de D7–D10 en tono alumno: "‹ Guía", "Tocá un músculo", frente / espalda, "Los que no se ven (están más adentro)". En la hoja, por músculo: **qué hace** en una frase + **tres grupos** en vez de cinco roles: *Trabaja fuerte en* (motor + sinergista) · *Te sostiene en* (estabilizador) · *Se estira en*; cada uno con su (i). **Sin** antagonista, **sin** códigos de ruta, **sin** banderas de derivación: al pie, "¿Te molesta o te duele acá? Avisale a tu profe".
- **D15** Tocar un ejercicio → **ficha corta**: qué es, cuerpo pintado (trabaja fuerte / te sostiene), dónde se siente, tips, errores comunes, "Si algo te duele, avisale a tu profe".

#### App › Entrenar (sketch 021, ganador A2)

- **D16** En Semana, el cuerpo de la 197 (al lado de los chips de bloque) se vuelve tocable, con "Tocá un músculo" debajo.
- **D17** Tocar una zona → la misma hoja de Tu cuerpo con **"Hoy en tu clase"** arriba (estilo oscuro de la card de hoy): por cada bloque de hoy que trabaja la zona, qué hace con esos músculos (trabaja fuerte / te sostiene / se estira) y sus primeros ejercicios; si ninguno: "Hoy tu clase no trabaja esta zona". Abajo, lo de Tu cuerpo + "Ver en Tu cuerpo ›".
- **D18** **Modos que no se mezclan:** sin hoja, el cuerpo muestra las zonas del bloque elegido (como la 197); con la hoja abierta, muestra **solo la zona tocada**, ningún chip queda como elegido y se marcan (borde + punto) **solo los chips de los bloques que trabajan esa zona**; el resto se apaga. Al cerrar, vuelve el bloque elegido.
- **D19** Tocar una zona **no redibuja** la pantalla: la lista de ejercicios del bloque no se recarga. Tocar un chip cambia de bloque y cierra la hoja.
- **D20** Las zonas que pinta Entrenar (y la canasta de Libre de la 197) salen del **modelo nuevo**, no de `muscle-zones.ts`.

### Decisiones tomadas por defecto (P1–P4, confirmadas por Franco según el orquestador; el planner puede justificar otra forma en P3)

- **P1 · Todo lo de alumnos detrás de un flag** `ANATOMIA_ALUMNOS_ENABLED = false` en `featureFlags.ts` hasta la validación humana (D5): con el flag apagado, la Guía abre las historias como hoy y el cuerpo de Entrenar no es tocable. El admin sí queda visible para el staff, con "Borrador · sin validar".
- **P2 · Alcance del contenido v1:** los **28 músculos** del sketch (zona + precisión + qué hace) y las relaciones ruta ↔ músculo ↔ rol de las **30 rutas** (tablas S8 y TI-H de la investigación). **Fichas de profe completas para las 30 rutas** destiladas del §2 con sus marcas de evidencia, y la **ficha corta de alumno para las 30**. Lo que la investigación no tenga queda explícito como pendiente, nunca inventado.
- **P3 · Dónde vive el contenido:** archivos tipados en el **API** (fuente única), validados con un esquema en tests, y servidos por endpoints de solo lectura (staff: todo; socio: solo vista alumno, sin banderas ni códigos). La TV, `/weekly` y la canasta consumen una **proyección** ruta → zonas compatible con lo que hoy produce `muscle-zones.ts`. El planner puede elegir otra forma si la justifica.
- **P4 · Fuera de esta fase:** la prueba de dividir `upper-back` (D4, va como spike aparte), la explicación por ejercicio en el control de la TV, y Nacho/siglas sin resolver (⚑N): quedan como pendientes en el contenido.

### Fuera de alcance (OUT OF SCOPE)

- PLYO, CARDIO, KL (D2). Rutas nuevas.
- Editor de contenido para profes (D3). Tablas de contenido en MySQL.
- Cambios a la geometría del dibujo (POC upper-back = spike aparte).
- Explicación por ejercicio en el control de la TV.
- Mostrar a alumnos contenido no validado (P1).

### Restricciones técnicas (de CONTEXT, resumidas sin cambiar el sentido)

Migraciones `0287+` (0284 reservada a la 196), SQL a mano sin `;` en comentarios, runner propio, datos de prod por migración. Tests de coherencia obligatorios (códigos de ruta, zonas del dibujo, cobertura de 30 rutas, paridad documentada con `muscle-zones.ts`, endpoint de alumno sin banderas/antagonista/códigos). Endpoints nuevos: `tenant-manifest.ts` + `ENTRADAS_BASELINE` + gates de ruta nueva. Front: `createLogger()`, sin `any`, composables con `cleanup()`, Pinia setup, sin dependencias nuevas, sin CDN, `git add` explícito, sin `git stash`. Figura: reusar `BodyFigure.vue`/`anatomia.ts` (app) y `tv/recorrido` (admin), sin geometría nueva, presupuesto de TV. Sin `pnpm install` ni typecheck en el worktree (igual que la 197).
</user_constraints>

<phase_requirements>
## Requisitos de la fase → qué de esta investigación los habilita

No hay IDs formales; los requisitos son D1–D20, P1–P4 y los 6 criterios del ROADMAP.

| Requisito | Qué hay que saber | Dónde está acá |
|---|---|---|
| Criterio 1 / D3 / D4 / D5 / P2 / P3 | Forma de los archivos de contenido, dónde viven, cómo se validan sin zod (no está en el API) y contra qué fuente de rutas (la tabla `routes` NO sirve en CI) | Patrones 1–2, Pitfall 1, Validation Architecture |
| Criterio 2 / D20 | Todos los consumidores de `muscle-zones.ts`, la regla de proyección, la tabla real de diferencias por ruta, los tests que cambian | Patrón 3, tabla "Diferencias reales", Pitfalls 2–5 |
| Criterio 3 / D6–D11 | `NAV_MODEL` + `trainingOnly` (choque con "staff que ve Entrenamiento"), router admin, reuso de `cargarAnatomia()`, figura nueva en Vue | Patrón 5, Open Question 1 |
| Criterio 4 / D12–D15 / P1 | 7 lugares que navegan a `guia`, cómo partir la Guía sin romper deep links, BodyFigure extensible, hoja `seamless` | Patrón 6, Pitfalls 6–8 |
| Criterio 5 / D16–D19 | `SemanaTab.vue`/`BlockChipStack`/`figureZones`, vidriera con `interactive=false`, cálculo "Hoy en tu clase" en el server (`zoneHits`) | Patrón 7 |
| Criterio 6 / D1 / D2 | `route-labels.ts` ×3, `routes.display_name` real, las 5 filas SISSY (ids, `route = ''`, efecto en el generador) | Patrón 8, Runtime State Inventory, Pitfall 9 |
</phase_requirements>

## Project Constraints (de CLAUDE.md y skills)

- API: logs con Pino (`request.log`/`fastify.log`), nunca `console.*`. Front: `createLogger()` de `src/utils/logger.ts`.
- Sin `any`; `catch (err: unknown)` + `instanceof Error`.
- Rutas nuevas del API con tests de integración en `el-templo-api/test/` (MySQL real; corren en CI, no local — memoria `tests_run_in_ci_not`).
- Schema/migraciones: SQL a mano en `el-templo-api/src/db/migrations/`, runner `pnpm db:migrate`, nunca `drizzle-kit migrate`/`db:push`; sin `;` dentro de comentarios `--` (skill `el-templo-db-migrations`, Hard Rule 2); datos de prod por migración; staging y prod comparten host MySQL (una migración de staging corre contra prod al mergear).
- Stores Pinia con `defineStore('x', () => {...})`; composables exponen `cleanup()` y no usan `onUnmounted`.
- Env vars nuevas → `.env.example` (esta fase NO necesita ninguna: el flag es constante de código).
- Sin bump de versión en fases GSD; sin dependencias nuevas sin preguntar; sin CDN.
- `git add` por ruta explícita; nunca `git stash` en worktrees; no commitear docs en el checkout principal.
- Ejecutores sonnet en secuencia, comandos en primer plano, sin `run_in_background` ni loops con `pgrep` (CLAUDE.md "Ejecución de fases GSD con modelo barato").
- Reglas heredadas de `197-EXECUTOR-RULES.md`: verificación estática (grep/cmp/diff), formato a mano (API: Prettier por defecto con `;` y comillas dobles; app: sin `;`, comillas simples, ancho 100), tokens visuales solo de `_premium-card.scss`/`_brand.scss`, hitbox ≥ 44 px, animaciones dentro de `prefers-reduced-motion: no-preference`, copy rioplatense con voseo.
- Push tras un fix solo-tests: tocar código de producción del mismo componente (paths-filter del deploy).

## Summary

La fase es, sobre todo, **un cambio de fuente de verdad** más tres pantallas. Hoy las zonas salen de `el-templo-api/src/modules/tv/muscle-zones.ts`, que mapea por `exercises.category` + `category_secondary` ("contiene") + 2 rutas sueltas. Lo consumen cuatro archivos de producción (`tv/recorrido.ts:45-48,162-163`, `sessions/session-response.ts:3-7,39,84`, `sessions/free-blocks-service.ts:42-49,187,710`, `sessions/free-blocks-ranking.ts:11`) y lo fijan seis archivos de test. El reemplazo correcto es un módulo nuevo `el-templo-api/src/modules/anatomy/` con el contenido en archivos `.ts` tipados y una **proyección por ejercicio = zonas de su ruta** que conserva las mismas firmas (`zonasDelGrupo`, `zonasDelBloque`, `ejerciciosPorGrupo`, `gruposDeZonas`), así los consumidores solo cambian el import. Corrí la proyección con los datos del sketch 019 contra la distribución real del catálogo local y la tabla de diferencias por ruta está abajo: hay correcciones buscadas (SS sin glúteo/aductores, NC con gemelos, QC con tibial) y también **regresiones que el contenido tiene que arreglar** (BL sigue igual a PL, DS sin cuádriceps, HS sin deltoides, MN/RP sin abdomen). Esas regresiones aparecen porque las tablas S8/TI-H están incompletas. La salida es completar las relaciones desde la tabla "Análisis articular" de cada ruta en el §2.

Hay tres hallazgos que cambian el plan. (1) **La tabla `routes` no sirve como fuente en los tests**: `cleanAllTestData` la borra (`test/helpers.ts:324`) y otros archivos del mismo worker la vacían. La fuente estática correcta es `ROUTE_PROGRESSION_MAP` (`src/modules/exercises/route-progression-map.ts:75`), que tiene exactamente las 30 rutas del contenido. (2) **"Todo el staff que ve Entrenamiento" son hoy dos personas**: los ítems de Entrenamiento son `trainingOnly`, o sea `canAccessTraining`, que deja pasar solo al owner y a un coach puntual por email (`el-templo-admin/src/utils/trainingAccess.ts`). Si Anatomía se gatea así, los profes no la ven. (3) **CI no corre los tests de app ni de admin** (`.github/workflows/ci.yml`: app/admin solo lint y build). Toda lógica no trivial ("Hoy en tu clase", chips marcados, zonas por rol de la ficha) conviene calcularla en el API, donde los tests sí corren, y que el front solo la pinte.

**Recomendación principal:** módulo `anatomy` en el API con contenido tipado + validadores escritos a mano + proyección compatible, dos endpoints de solo lectura (`GET /api/admin/anatomy` staff, `GET /api/anatomy` alumno), `zoneHits` calculado por bloque en `blockToResponse`, y el front (admin y app) como capa de presentación sobre esos payloads, con el alumno detrás de `ANATOMIA_ALUMNOS_ENABLED`.

## Architectural Responsibility Map

| Capacidad | Tier principal | Tier secundario | Por qué |
|---|---|---|---|
| Contenido (músculos, regiones, relaciones, fichas, glosario, banderas, citas) | API (archivos `.ts` versionados) | — | D3/P3: fuente única; el API ya es dueño de la proyección TV |
| Validación de coherencia (rutas, zonas, roles, marcas) | API tests (CI) | — | Único lugar donde corren tests en CI |
| Proyección ruta → zonas (TV, `/weekly`, `/daily`, canasta) | API (`anatomy/projection.ts`) | — | Reemplaza `muscle-zones.ts` (D20) |
| "Hoy en tu clase" (zona → bloques → músculos por grupo) | API (`zoneHits` por bloque en `blockToResponse`) | App (render) | Lógica testeable en CI; el app solo pinta |
| Vista profe vs vista alumno (recorte de antagonista/banderas/códigos) | API (serializadores) | — | El recorte es seguridad de contenido, no UI |
| Gate de roles staff | API (`onRequest` con set de roles) | Admin (`NAV_MODEL` + `meta.allowedRoles`) | El nav solo oculta (templo-config.ts:12-13) |
| Gate alumnos (P1) | App (`featureFlags.ts`) | — | Flag de código, mismo patrón que `FREE_BLOCKS_ENABLED` |
| Dibujo (geometría) | Admin `src/tv/recorrido/anatomia.json` / App `src/components/anatomy/anatomia.json` | — | Copias byte a byte (anatomia.ts:8-9 del app); nada de geometría nueva |
| Nombres de ruta D1 | DB (migración) + `route-labels.ts` ×3 | — | Tres copias toleradas (route-labels.ts:1-12 del API) |

## Standard Stack

Sin dependencias nuevas (restricción bloqueada). Todo con lo que ya está instalado:

### Core
| Pieza | Versión (package.json) | Para qué | Por qué |
|---|---|---|---|
| Fastify | ^5.7.4 | 2 rutas GET nuevas | Ya es el server [VERIFIED: el-templo-api/package.json] |
| TypeScript `satisfies` / `as const` | ^5.9.3 | Contenido tipado (tipos derivados de los datos) | Sin zod/ajv en el API; el tipo atrapa errores en `tsc` de CI |
| Vitest | ^4.0.18 | Tests de coherencia + integración | Ya corre en CI con MySQL [VERIFIED: ci.yml:125] |
| Quasar | ^2.16.0 (app y admin) | `q-dialog seamless position="bottom"`, `$q.screen` | Ya instalado [VERIFIED: package.json] |
| Vue | ^3.5.22 | Componentes | Ya instalado |
| Pinia | ^3.0.4 | Store `anatomy` (app y admin) | Patrón setup del repo |

### Supporting
| Pieza | Para qué | Cuándo |
|---|---|---|
| `src/boot/axios.ts` (`api`) app y admin | fetch de los endpoints | siempre |
| `cargarAnatomia()` admin (`src/tv/recorrido/anatomia.ts:79`) | geometría para la figura del admin | import dinámico, chunk propio |
| `loadAnatomy()` + `figureFor()` app (`src/components/anatomy/anatomia.ts`) | geometría del app | ya lo usa `BodyFigure.vue` |

### Alternativas consideradas
| En vez de | Se podría | Tradeoff |
|---|---|---|
| Contenido en `.ts` del API | JSON/YAML + JSON Schema | Necesitaría un validador (dependencia nueva) o un parser a mano; `.ts` da el chequeo de `tsc` gratis. **Usar `.ts`.** |
| Endpoints | Copiar el contenido al bundle de app/admin | Rompe la fuente única (3 copias) y suma peso al bundle del app. **Descartado.** |
| Cálculo de hits en el app | `zoneHits` en el server | Los tests del app no corren en CI. **Server.** |

**Instalación:** ninguna.

## Package Legitimacy Audit

Esta fase **no instala paquetes externos** (restricción bloqueada "sin dependencias nuevas"). No se corrió slopcheck porque no hay nada que auditar.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| (ninguno) | — | — | — | — | — | — |

**Paquetes removidos:** ninguno. **Paquetes sospechosos:** ninguno.

## Architecture Patterns

### Diagrama del sistema

```
                    ARCHIVOS DE CONTENIDO (API, git)
   regiones.ts ── musculos.ts ── relaciones (rutas/*.ts) ── fichas profe/alumno
        │              │                 │                       │
        └──────────────┴────── validadores + tests CI ───────────┘
                                         │
                  ┌──────────────────────┼─────────────────────────────┐
                  ▼                      ▼                             ▼
     projection.ts                 serializers.ts                 zone-hits.ts
  zonasDeRuta(code)            vistaProfe() / vistaAlumno()   hits(zona → músculos por grupo)
  zonasDeEjercicio({route,         │                │                  │
     category})                    ▼                ▼                  │
  zonasDelGrupo / zonasDelBloque  GET /api/admin/   GET /api/anatomy   │
  ejerciciosPorGrupo / grupos     anatomy (staff)   (cualquier         │
        │                          │                 autenticado)      │
        ├─► tv/recorrido.ts ─► poll TV (zonas ∩ 15 de la TV) ─► admin tv/recorrido (sin cambios)
        ├─► session-response.ts blockToResponse ─► /weekly /daily /:id ─┐
        │        └── zones + groups + zoneHits ◄────────────────────────┘
        └─► free-blocks-service.ts (canasta: zones, groupHits, todayZones)
                                   │                │
                                   ▼                ▼
                     ADMIN › Anatomía          APP: Guía portada ─► Tu cuerpo ─► ficha corta
                     cuerpo ─► hoja ─► ficha        Entrenar › Semana: tap zona ─► hoja
                                                    (Hoy en tu clase desde zoneHits)
```

### Estructura recomendada

```
el-templo-api/src/modules/anatomy/
├── types.ts                 # Rol, Precision, Marca, Afirmacion, Musculo, Region, RutaContenido, FichaProfe, FichaAlumno
├── content/
│   ├── regiones.ts          # 16 regiones del dibujo usadas (15 + tibialis): slug, nombre, vista, grupo, enTv
│   ├── musculos.ts          # 28 músculos: id, nombre, zona {slug, vista}|null, precision, queHaceProfe?, queHaceAlumno, nota?
│   ├── glosario.ts          # roles, contracciones, precisión (sketch 019 data.js GLOSARIO)
│   ├── grupos-alumno.ts     # 3 grupos (fuerte/sostiene/estira) con su definición (020 alumno.js)
│   ├── banderas.ts          # catálogo a1–a7, b1–b21, c1–c6 (§3.1) con nivel + textoProfe + notaInterna + fuente
│   ├── citas.ts             # [1]–[109] + L1–L5 del Apéndice A (para el tooltip)
│   ├── diferencias-aprobadas.ts  # quita/agrega por ruta vs la TV pre-200, con motivo (T16)
│   └── rutas/
│       ├── index.ts         # RUTAS: RutaContenido[] (orden = complejos del sketch)
│       ├── FL.ts … AF.ts    # 30 archivos: relaciones por rol + fichaProfe + fichaAlumno + pendientes
├── validate.ts              # validadores a mano (sin zod): devuelven lista de errores legibles
├── projection.ts            # reemplazo de muscle-zones.ts (mismas firmas)
├── zone-hits.ts             # zona → { fuerte, sostiene, estira: musculoId[] } por bloque
├── serializers.ts           # vistaProfe() / vistaAlumno() (el recorte vive acá)
└── routes.ts                # GET /admin/anatomy y GET /anatomy

el-templo-api/test/anatomy/
├── content-schema.test.ts   # validate() sin errores + invariantes (T3/T4/T7, marcas, banderas)
├── content-coverage.test.ts # 30 rutas == ROUTE_PROGRESSION_MAP, ⊆ ROUTE_LABELS (T1/T2/T15)
├── projection.test.ts       # reemplaza tv-muscle-zones.test.ts + block-zones.test.ts
├── projection-parity.test.ts# T16: snapshot pre-200 − quita + agrega == nueva
├── zone-hits.test.ts
├── anatomy-routes.test.ts   # integración: 401, 403 por rol, payload alumno sin antagonista/banderas/código
├── sync-front.test.ts       # zones.ts del app y route-labels ×3 en sync (precedente destinations-sync)
└── __fixtures__/zonas-tv-pre-200.ts

el-templo-admin/src/
├── components/anatomy/AnatomyFigure.vue   # figura Vue (frente/espalda, roles por color, seleccionada, tap → slug+vista)
├── components/anatomy/AnatomySheet.vue    # hoja desde abajo (seamless) para el admin
├── components/anatomy/RutaFicha.vue        # ficha a pantalla completa
├── stores/anatomyStore.ts
├── types/anatomy.ts
└── pages/AnatomiaPage.vue                  # ruta /anatomia

el-templo-app/src/
├── config/featureFlags.ts                  # + ANATOMIA_ALUMNOS_ENABLED = false
├── components/anatomy/BodyFigure.vue       # props opcionales nuevas (no rompen la 197)
├── components/anatomy/zones.ts             # + tibialis (piernas), fuera de NON_MUSCLE_SLUGS
├── modules/anatomy/                        # store, types, AnatomySheet, ZonaAlumno, RutaFichaCorta
├── modules/training/pages/GuiaHomePage.vue # portada (2 cards)
├── modules/training/pages/TuCuerpoPage.vue
└── modules/training/components/semana/     # SemanaTab + BlockChipStack + HoyEnTuClase
```

### Patrón 1: contenido tipado, validado a mano, con tipos derivados de los datos

**Qué:** los datos son `as const`/`satisfies`, y los tipos de slug/id salen de los datos (D4: "zonas como datos, no enum cableado"). Un validador puro devuelve errores legibles y un test exige `[]`.

```typescript
// Fuente: patrón propio del repo (empeza-aca-content.ts, route-progression-map.ts); sin dependencias
export const REGIONES = [
  { slug: "chest", nombre: "Pecho", vista: "frente", grupo: "pecho", enTv: true },
  // …
  { slug: "tibialis", nombre: "Tibial anterior", vista: "frente", grupo: "piernas", enTv: false },
] as const satisfies readonly RegionDef[];
export type ZonaSlug = (typeof REGIONES)[number]["slug"];

/** Una afirmación con sus marcas: nunca "[4]" pegado en el texto (sin v-html, sin parsear). */
export interface Afirmacion { t: string; c: readonly Marca[] } // Marca = number | "L1".."L5" | "C" | "M" | "R" | "H" | "N"
```

**Relaciones por rol, por ruta** (no por músculo como en el sketch): cada `rutas/XX.ts` declara `relaciones: { motor: MusculoId[], sinergista: [...], estabilizador: [...], antagonista: [...], estira: [...] }`. La vista "por músculo" (hoja de D8) se **deriva** con un índice inverso. Así cada plan de fichas edita SU archivo y no un `musculos.ts` compartido (no hay conflictos entre ejecutores en secuencia, y el diff de la revisión del kinesiólogo queda por ruta).

### Patrón 2: fuente de rutas estática para los tests

`ROUTE_PROGRESSION_MAP` (`src/modules/exercises/route-progression-map.ts:75`) tiene exactamente estas claves: `FL FLR BL PLPU MN/RP TTB PL REVERSE HYPER OAP OAPU MU HSPU PHS OAR HD/ID PS SU NC L DS SS QC SIDE PCK HT SPAGAT BRIDGE PIKE HS AF HR`, que son las 30 rutas del contenido [VERIFIED: grep en esta rama]. T1/T2 = `Object.keys(ROUTE_PROGRESSION_MAP)` igual al set de códigos del contenido, y cada código ∈ `ROUTE_LABELS`. `FB` queda fuera a propósito: no tiene ejercicios y la TV pinta el cuerpo entero (`recorrido.ts:159-163`). Los `escalones` de una ficha de ruta "token" salen de `ROUTE_PROGRESSION_MAP[code].steps` (T17, sin doble fuente). Las rutas "linear" (PS, SU, NC, L, DS, SS, QC, HT, HD/ID) declaran sus escalones en la ficha.

### Patrón 3: proyección compatible (reemplazo de `muscle-zones.ts`)

```typescript
// anatomy/projection.ts: mismas firmas que muscle-zones.ts, otra fuente
export interface EjercicioZonaInput { route: string | null | undefined; category: string | null | undefined }

/** Zonas de una ruta: motor ∪ sinergista; si queda vacío (movilidad/flow), estabilizador ∪ se estira. */
export function zonasDeRuta(code: string): ZonaSlug[] { /* índice precalculado al cargar el módulo */ }

/** Por ejercicio: su ruta si está en el modelo; si no, el fallback explícito por categoría (D2: PLYO/CARDIO/KL sin ruta). */
export function zonasDeEjercicio(e: EjercicioZonaInput): ZonaSlug[] {
  const code = normalizar(e.route);
  if (code && RUTAS_POR_CODIGO.has(code)) return zonasDeRuta(code);
  return ZONAS_SIN_RUTA[normalizar(e.category)] ?? [];
}
// zonasDelGrupo (TV, UMBRAL_DOMINANCIA 0.4 por conteo de ejercicios), zonasDelBloque (unión),
// ejerciciosPorGrupo, gruposDeZonas, grupoDeZona: mismo algoritmo, solo cambia acumularZonas → zonasDeEjercicio.
// ROM_ROLE_ZONAS se mantiene igual (fallback por rol del sábado).
```

- **`ZONAS_SIN_RUTA`**: solo para las categorías que aparecen en ejercicios **sin ruta** del catálogo [VERIFIED: SELECT local]: `PLYO`, `POTENCIA` → `gluteal, quadriceps, calves` (igual que hoy); `LUNGE`, `KNEE DOMINANT` → `quadriceps, gluteal, adductors` (el `KNEE DOMINANT` cubre a los 5 SISSY hasta que se aplique la migración); `CARDIO`, `COORDINATIVO`, `ESTABILIDAD` → nada (igual que hoy). Documentado como interino de D2.
- **TV**: `recorrido.ts` filtra a las regiones `enTv: true` (las 15 de hoy). `tibialis` no viaja a la TV en v1, así no cambian `TvZonaMuscular` del admin (`poll.ts:27`), `ZONA_ES` (`figuras.ts:44`) ni `TOTAL_ZONAS` (`index.ts:395`, que compara `b.zonas.length >= TOTAL_ZONAS` para el Full Body). El contrato del poll (`zonas: string[]` ordenado) queda igual (T20).
- **`/weekly` y la canasta** sí reciben `tibialis` (QC). Por eso `grupoDeZona` tiene que tener `tibialis → piernas`, porque si no **tira** `Error("Zona sin grupo")` (`muscle-zones.ts:252-256`). Lo mismo del lado del app: `zones.ts` (sumar a `ZoneSlug` y a `piernas`, sacarlo de `NON_MUSCLE_SLUGS`).
- **DRY:** hoy hay dos conversores idénticos de prescripción → input (`session-response.ts:12-18` `toZoneInput` y `free-blocks-service.ts:166-176` `aEjercicioZona`). Unificarlos en un `zonaInputDe(ex)` exportado del módulo `anatomy`. `categorySecondary` deja de usarse: sacarlo del input (y de los dos conversores y de `recorrido.ts:129-133`). La columna `exerciseCategorySecondary` del select de `class-day.ts` puede quedar o irse, a criterio del planner.
- `muscle-zones.ts` **se borra** y `TvZonaMuscular` pasa a derivarse de las regiones `enTv` (`types.ts:266`). Un grep posterior no tiene que encontrar `muscle-zones` en `src/` (salvo comentarios históricos).

#### Diferencias reales por ruta (corrida de esta investigación)

Corrí el `muscle-zones.ts` real de esta rama sobre la distribución `(route, category, category_secondary)` del catálogo local (1.546 filas), contra la proyección M∪S (fallback Est∪Al) de los 28 músculos del sketch 019 `data.js` [VERIFIED: script en el scratchpad, `node --experimental-strip-types`]. "TV hoy" = `zonasDelGrupo` sobre todos los ejercicios de la ruta, igual que el §1.7.2.

| Ruta | n | TV hoy | Nueva (sketch) | Quita | Agrega | Lectura |
|---|---|---|---|---|---|---|
| AF | 66 | abs, obliques | forearm, gluteal, quadriceps, adductors | abs, obliques | forearm, gluteal, quadriceps, adductors | fallback Est (no hay M/S); revisar con D1/D2 del §2 |
| BL | 49 | chest, deltoids, triceps, abs | chest, deltoids, lower-back, gluteal | triceps, abs | lower-back, gluteal | ⚠ **sigue = PL**. S4.1 da bíceps CL = M/Est en el hombro: con eso BL ≠ PL |
| BRIDGE | 30 | deltoids, lower-back, gluteal | deltoids, triceps, trapezius, gluteal | lower-back | triceps, trapezius | revisar con C2 (erectores S) |
| DS | 20 | lower-back, gluteal, hamstring | gluteal | lower-back, hamstring | — | ⚠ **sin cuádriceps** (TI-H no lista DS); completar desde B-DS |
| FL | 127 | deltoids, biceps, trapezius, upper-back, abs | chest, deltoids, triceps, trapezius, upper-back, quadriceps | biceps, abs | chest, triceps, quadriceps | corrección C4 (flexores de cadera → recto femoral) |
| FLR | 30 | deltoids, biceps, trapezius, upper-back | deltoids, biceps, forearm, upper-back | trapezius | forearm | ok |
| HD/ID | 67 | chest, deltoids, triceps | chest, triceps | deltoids | — | delt. anterior Est en S8; revisar S4.2 |
| HR | 18 | lower-back, abs, obliques, gluteal | lower-back, gluteal | abs, obliques | — | ⚠ planchas laterales = oblicuos/CL (S6.3): falta |
| HS | 53 | deltoids, triceps, trapezius, abs | forearm, trapezius | deltoids, triceps, abs | forearm | ⚠ deltoides solo Est en S8; revisar S5.1 |
| HSPU | 61 | deltoids, triceps, trapezius | igual | — | — | ok |
| HT | 45 | lower-back, gluteal, hamstring | gluteal, hamstring | lower-back | — | ok (erectores Est) |
| L | 21 | gluteal, quadriceps, adductors | gluteal, quadriceps | adductors | — | ok |
| MN/RP | 30 | deltoids, triceps, biceps, trapezius, upper-back, abs | deltoids, upper-back | triceps, biceps, trapezius, abs | — | ⚠ sin abdomen; revisar S3.3 |
| MU | 55 | biceps, forearm, upper-back | + chest, triceps, trapezius | — | chest, triceps, trapezius | corrección (fase de empuje) |
| NC | 45 | lower-back, gluteal, hamstring | gluteal, hamstring, calves | lower-back | calves | corrección §1.7.2 (gemelos) |
| OAP | 94 | biceps, forearm, upper-back | + trapezius | — | trapezius | ok |
| OAPU | 76 | chest, deltoids, triceps | chest, triceps | deltoids | — | revisar S4.3 |
| OAR | 31 | deltoids, biceps, trapezius, upper-back | deltoids, biceps, forearm, upper-back | trapezius | forearm | ok |
| PHS | 47 | deltoids, triceps, trapezius, abs | chest, deltoids | triceps, trapezius, abs | chest | revisar S5.3 (compresión = abdomen/flexores) |
| PIKE | 28 | lower-back, abs, gluteal, hamstring | hamstring | lower-back, abs, gluteal | — | fallback Al |
| PL | 48 | chest, deltoids, triceps, abs | chest, deltoids, lower-back, gluteal | triceps, abs | lower-back, gluteal | revisar S4.4 |
| PLPU | 23 | chest, deltoids, triceps | + lower-back, gluteal | — | lower-back, gluteal | ok |
| PS | 65 | gluteal, quadriceps, adductors | + hamstring, calves | — | hamstring, calves | corrección §1.7.2 |
| QC | 22 | gluteal, quadriceps, adductors | quadriceps, tibialis | gluteal, adductors | tibialis | corrección §1.7.2 (tibial; en la TV se filtra) |
| REVERSE HYPER | 11 | lower-back, gluteal | + hamstring | — | hamstring | ok |
| SIDE PCK | 28 | abs, obliques, gluteal, hamstring | lower-back, obliques | abs, gluteal, hamstring | lower-back | corrección A9 (secundaria mal cargada) |
| SPAGAT | 43 | quadriceps, hamstring, adductors | + gluteal | — | gluteal | fallback Est∪Al |
| SS | 22 | gluteal, quadriceps, adductors | quadriceps | gluteal, adductors | — | corrección §1.7.2 (foco cuádriceps) |
| SU | 38 | lower-back, gluteal, quadriceps, hamstring, adductors | gluteal, quadriceps | lower-back, hamstring, adductors | — | ok |
| TTB | 149 | biceps, forearm, upper-back, abs, obliques | trapezius, abs, obliques, quadriceps | biceps, forearm, upper-back | trapezius, quadriceps | corrección §1.7.2 (dorsal Est, flexores de cadera) |
| (sin ruta) | 104 | gluteal, quadriceps, calves | vía `ZONAS_SIN_RUTA` igual | — | — | D2 |

**Conclusión para el plan:** el plan de relaciones parte de S8/TI-H (P2), pero **tiene que** completarlas desde la tabla "Análisis articular" del §2 de cada ruta marcada ⚠. Después, el plan de proyección congela "TV hoy" como snapshot (`__fixtures__/zonas-tv-pre-200.ts`) y escribe `diferencias-aprobadas.ts` con la diferencia **final** y un motivo por línea que cite §1.7.2 o §2. Franco revisa esa lista en la UAT: es el criterio 2.

### Patrón 4: endpoints de solo lectura y recorte por audiencia

- `GET /api/admin/anatomy` → vista profe completa. Guard: `onRequest` autentica y exige un set nuevo `ANATOMIA_STAFF_ROLES` en `shared/permissions.ts`, con el mismo estilo que `tv/control-routes.ts:40-50`. No hay `attachCountryScope`/`assertTenant` porque no hay acceso a DB.
- `GET /api/anatomy` → vista alumno (cualquier autenticado: `onRequest: [fastify.authenticate]`).
- Registrar un plugin nuevo con `moduleScope(app, "templo-training", anatomyRoutes, { prefix: "/api" })` (`app.ts:183-224` es el patrón). Así iso-01 test 7 ("toda ruta templo-module lleva requireModule de SU módulo") pasa solo, porque el guard lo agrega `moduleScope` (`module-registry.ts:269-303`).
- Manifiesto: `"GET /api/admin/anatomy"` y `"GET /api/anatomy"` como `{ categoria: "templo-module", modulo: "templo-training" }` en `test/tenant-manifest.ts`; `ENTRADAS_BASELINE` 476 → 478 (`iso-01-manifiesto.test.ts:347`), con el comentario de la unidad ganada y el título del `it` ("exactamente las 478 entradas", línea 490). **No aplica** iso-03 (no está en los 8 prefijos), ni con-04 (no hay job), ni con-06 (no hay DB), ni tenant-tables (no hay tabla).
- **Recorte (en `serializers.ts`, testeado):** la vista alumno no lleva `antagonista`, ni `banderas`, ni `fichaProfe`, ni `code`. Las rutas se identifican por `slug` (`front-lever`, `manna`, `fondos`, `side-pancake`…) y la ficha corta pinta zonas `{ slug: "fuerte" | "sostiene" }` ya calculadas por el server.
- Payload: un solo GET por audiencia, cacheado en el store Pinia durante la sesión (30 fichas ≈ 150–250 KB sin comprimir según estimación [ASSUMED]). Nada de endpoints por ruta: los códigos tienen `/` y espacios (`MN/RP`, `HD/ID`, `SIDE PCK`, `REVERSE HYPER`), un dolor de cabeza en path params.

### Patrón 5: Admin › Anatomía

- Ruta `/anatomia` en `el-templo-admin/src/router/routes.ts`, al lado de `planis` (línea 246), con `meta: { allowedRoles: <set> }`.
- `NAV_MODEL` (`templo-config.ts:263-282`): ítem después de Árbol, `{ path: '/anatomia', label: 'Anatomía', icon: 'accessibility_new', roles: <set> }`, **sin** `trainingOnly` (ver Open Question 1). Con eso la categoría Entrenamiento aparece para los coaches con un solo ítem (`isNavCategoryVisible`, línea 463).
- Figura: componente Vue nuevo `AnatomyFigure.vue` que importa `cargarAnatomia()` de `src/tv/recorrido/anatomia.ts` (import dinámico, sin copiar el JSON). **No** reusar `figuras.ts`/`index.ts` de la TV: son strings SVG de mármol pensados para el kiosco y su presupuesto. Portar la estructura de `el-templo-app/src/components/anatomy/BodyFigure.vue` (medición `getBBox`, degradé por id único) y agregar colores por rol (sketch 019 `base.css`: M `#96593a`, S `#c27c54`, Est `#e3b892`, Al `#f4ead9` con borde punteado), vista única con botón de giro (D7) y `selected`.
- Mobile-first con `$q.screen.lt.md`: en celular, cuerpo grande + hoja desde abajo + ficha a pantalla completa. En escritorio, cuerpo a la izquierda y panel a la derecha (D6).
- Figura por defecto: hombre (sketch 019). No hay decisión de toggle de género para profes.

### Patrón 6: Guía partida sin romper deep links (D12–D13)

Hoy navegan a la ruta `guia` (`/training/guia`, `routes.ts:35-39`) **siete** lugares: `BlockCard.vue:132`, `BlockChoiceCard.vue:116`, `BlockExercisesCard.vue:63`, `SummaryBlockCard.vue:97` (los cuatro con `?slide=`), `MainLayout.vue:308-310` (abre las historias solas al socio nuevo), `destinations.ts:68-80` (avisos `guia` y `empeza_aca`), `router/routes.ts:43-44` (redirect `/empeza-aca`), además de `empeza-aca-content.ts:217` (CTA "Ver la Guía").

**Recomendado:** la ruta `guia` sigue siendo **las historias**, sin tocar nada. Se suman:
- `/training/guia/inicio` (`guia-inicio`) → `GuiaHomePage.vue` (las dos cards). Solo existe si el flag está ON (mismo spread condicional que `free-block-player`, `routes.ts:19-28`).
- `/training/guia/cuerpo` (`tu-cuerpo`, `?zona=<slug>`) → `TuCuerpoPage.vue`.
- `/training/guia/cuerpo/:slug` (`tu-cuerpo-ficha`) → ficha corta (ruta propia: el back de Android y del navegador funcionan).
- El tab "Guía" de `MainLayout.vue:408` apunta a `ANATOMIA_ALUMNOS_ENABLED ? '/training/guia/inicio' : '/training/guia'`. `isTabActive` (`MainLayout.vue:416-425`) ya funciona por `startsWith('/training/guia')`.
- Con el flag OFF nada cambia: ni el tab, ni las rutas nuevas, ni el cuerpo tocable.

Ventaja: los 7 lugares + el auto-abrir de socios nuevos siguen yendo a la historia (D13) con **cero cambios**. Alternativa: que la portada sea `/training/guia` y mover las historias a `/training/guia/historias`. Obliga a tocar los 7 lugares, cada uno con condicional de flag. Descartada.

### Patrón 7: Entrenar › Semana tocable (D16–D19)

- `SemanaTab.vue` (`components/semana/SemanaTab.vue:24-44`) monta `BlockChipStack` + `BodyFigure` (`:lit`, `:lit2`, `:tone`) + `BlockExercisesCard`. Estado nuevo **local**: `touchedZone: string | null`. Con el flag OFF o `interactive === false` (la vidriera de D-06 lo monta con datos fijos e `inert`), la figura no es tocable.
- Modo zona (D18): `BodyFigure` recibe `lit = [touchedZone]`, `lit2 = []`, `dim = true`. `BlockChipStack` recibe `selected = -1` (nada elegido) y un set nuevo `hitIndices` (borde + punto). Al cerrar la hoja: `touchedZone = null` y vuelven `figureZones(blocks, selectedBlockIndex)`.
- D19: `BlockExercisesCard :block="activeBlock"` no depende de `touchedZone`, así que tocar una zona no lo re-renderiza. Tocar un chip llama a `onSelectBlock` y además pone `touchedZone = null` (cierra la hoja).
- "Hoy en tu clase" (D17): **calculado en el server**. `blockToResponse` suma `zoneHits: Record<ZonaSlug, { fuerte: MusculoId[]; sostiene: MusculoId[]; estira: MusculoId[] }>` con las rutas distintas de los ejercicios main del bloque. El schema de respuesta deja pasar campos nuevos sin tocarlo (`schemas.ts:96-106`: `blocks: { type: "array" }` sin `items`). Los chips marcados = bloques con `zoneHits[zona]`. Primeros ejercicios = `block.exercises.slice(0, 3)`. "Hoy tu clase no trabaja esta zona" = ningún hit. Los nombres de los músculos salen del store alumno (`/api/anatomy`).
- `BodyFigure.vue` necesita props **opcionales** nuevas, todas con default que deja intacta la 197: `views?: 'both' | 'front' | 'back'`, `roles?: Record<string, 'fuerte' | 'sostiene' | 'estira'>` (ficha corta), `selected?: string | null`, y emit nuevo `select-zone: [slug, view]`. El emit actual `select-group` queda (`BodyFigure.vue:75,163-167`). Hoy el único consumidor es `SemanaTab.vue:34` [VERIFIED: grep].

### Patrón 8: migraciones de datos D1/D2

```sql
-- @data-only
-- Fase 200 D1: nombres oficiales de rutas en routes.display_name
-- Idempotente: UPDATE por code, sin tocar filas ajenas
UPDATE routes SET display_name = 'Espinales y planchas laterales' WHERE code = 'HR';
UPDATE routes SET display_name = 'Fondos' WHERE code = 'HD/ID';
UPDATE routes SET display_name = 'Side Pancake' WHERE code = 'SIDE PCK';
UPDATE routes SET display_name = 'Manna' WHERE code = 'MN/RP';
UPDATE routes SET display_name = 'Front Lever Row' WHERE code = 'FLR';
```

```sql
-- @data-only
-- Fase 200 D2: los 5 SISSY SQ OL cargados sin ruta pasan a la ruta SS
-- Se apunta por nombre y ruta vacia, nunca por id (los ids de local y prod difieren)
UPDATE exercises SET route = 'SS'
WHERE tenant_id = 1
  AND TRIM(route) = ''
  AND TRIM(exercise) LIKE 'SISSY SQ OL%'
  AND TRIM(category) = 'KNEE DOMINANT';
```

Datos locales [VERIFIED: SELECT en `eltemplo` local]: ids 4125–4129, `route = ''` (la columna es `NOT NULL`, `schema/exercises.ts:38`), `dificultad_lineal` 9–11, niveles omega/spartan, `progression_step` NULL. `MN/RP` y `FLR` ya tienen el nombre D1 en la DB local (`0144_route_display_names.sql`); el UPDATE igual va, por si prod difiere. `HT`, `NC` y `QC` siguen con `display_name` NULL: D1 no les pone nombre (ver Open Question 4).

### Anti-patrones a evitar

- **Roles por músculo en un `musculos.ts` gigante** (forma del sketch): 6 planes de fichas lo editarían en secuencia y cada diff sería ilegible. Las relaciones van por ruta y el índice por músculo se deriva.
- **Marcas pegadas en el texto** ("…dorsal [4]") con `v-html` o regex: van estructuradas `{ t, c: [...] }`.
- **Copiar el contenido o el JSON del dibujo a una tercera ubicación.**
- **Recalcular hits o zonas por rol en el front**: tests sin CI.
- **Usar `q-dialog` modal para la hoja de Entrenar**: el backdrop se come el toque del chip (D19) y el de otra zona.
- **Gatear el admin con `trainingOnly`** sin confirmarlo (Open Question 1).

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Hoja desde abajo no modal | Un `div` fijo con su propio manejo del back de Android | `q-dialog seamless position="bottom"` + clase para media/entera y un handle con pointer events (como el sketch 021) | Quasar maneja el back button de Capacitor para dialogs; `seamless` = sin backdrop, se puede tocar la página de atrás [CITED: quasar.dev/vue-components/dialog] |
| Carga de la geometría | Otro loader/JSON | `cargarAnatomia()` (admin) / `loadAnatomy()` (app) | Ya validan la forma y quedan en un chunk propio |
| Lista de rutas válidas | Lista a mano en el contenido | `ROUTE_PROGRESSION_MAP` + `ROUTE_LABELS` | Ya son la fuente del código |
| Nombres de ruta en la UI de anatomía | Un 4.º diccionario de nombres | `getRouteLabel(code)` del API al serializar | T14 sin otra copia (ver Open Question 3 por OAP/OAR/OAPU) |
| Gate de módulo | `requireModule` a mano | `moduleScope(app, "templo-training", …)` | Lo exige el test 7 de iso-01 |
| Sync front ↔ API (`zones.ts`, `route-labels.ts` ×3) | Revisión manual | Test que lee los archivos del app/admin por path relativo | Precedente: `test/communications/destinations-sync.test.ts:52-56` |

**Idea clave:** en esta fase el riesgo no es técnico, es de **deriva**: tres copias de nombres, dos JSON de dibujo, un espejo de grupos y 30 archivos de contenido escritos por ejecutores distintos. Cada invariante tiene que ser un test de CI, no una convención.

## Runtime State Inventory

(Aplica en parte: D1 es un rename de etiquetas y la fase reemplaza una fuente.)

| Categoría | Qué hay | Acción |
|---|---|---|
| Datos guardados | `routes.display_name` (prod/staging comparten host): HR NULL, SIDE PCK "Side Pike Compression", HD/ID "Fondos (Dips)" en local [VERIFIED]. `exercises.route = ''` en 5 SISSY. Los `session_blocks.route` guardan **códigos**, no nombres: no cambian | Migraciones 0287/0288 (datos). Ningún dato guarda las etiquetas viejas ("Ham Raise"…): son de display [VERIFIED: grep, solo en route-labels ×3] |
| Config de servicios vivos | Ninguna: no hay contenido de anatomía en ningún servicio externo | — |
| Estado registrado en el SO | Ninguno | — |
| Secretos / env vars | Ninguno: el flag es constante de código | — |
| Build artifacts | Bundles del app ya instalados en teléfonos (1.8.x) con `route-labels.ts` viejo: muestran "L-Sit"/"Ham Raise" hasta el próximo build nativo | Ninguna en código: lo resuelve el próximo build de tiendas. Anotarlo en la UAT |
| Generador de sesiones | Al pasar los 5 SISSY a SS, entran al pool de la ruta SS (estrategia "linear" por `dificultad_lineal`, `route-progression-map.ts`) para omega/spartan; el grafo `exercise_progressions` no tiene aristas para ellos hasta un rebuild | Ver Pitfall 9: decidir si basta con la migración o hace falta un rebuild del grafo |

## Common Pitfalls

### Pitfall 1: la tabla `routes` está vacía en muchos tests de CI
**Qué pasa:** un test de coherencia que hace `SELECT code FROM routes` pasa solo o falla según el orden de archivos. **Por qué:** `cleanAllTestData` borra `routes` (`test/helpers.ts:324`) y cinco suites más la vacían (`test/exercises/*.test.ts`, `exercise-adjustments.test.ts`), con `isolate=false` por worker. **Cómo evitarlo:** T1/T2 contra `ROUTE_PROGRESSION_MAP` y `ROUTE_LABELS` (estáticos). Para validar las migraciones D1/D2, guard estático sobre el texto del SQL (precedente `test/migrations/0285-0286-extra-blocks.test.ts`). **Señal temprana:** un test que "a veces" falla en CI.

### Pitfall 2: `grupoDeZona` tira con una zona nueva
**Qué pasa:** `/weekly` responde 500 cuando un bloque de QC trae `tibialis`. **Por qué:** `grupoDeZona` hace `throw new Error("Zona sin grupo")` (`muscle-zones.ts:252-256`). **Cómo evitarlo:** el grupo es un campo obligatorio de cada región, y un test exige que toda región tenga grupo. Además, `zones.ts` del app con `tibialis → piernas` y fuera de `NON_MUSCLE_SLUGS` (`zones.ts:61-70`).

### Pitfall 3: las tablas S8/TI-H no alcanzan para la proyección
**Qué pasa:** BL queda igual a PL, DS sin cuádriceps, HS sin deltoides, MN/RP sin abdomen (tabla de diferencias). **Por qué:** S8/TI-H son resúmenes; el rol por ruta está en la tabla "Análisis articular" de cada sección del §2. **Cómo evitarlo:** el plan de relaciones lee el §2 de cada ruta ⚠; el test de paridad (T16) obliga a justificar cada diferencia. Respetar el texto **corregido** del §2 y el Apéndice B en la mecánica de palancas (boca arriba: flexores de cadera + abdomen; boca abajo: glúteo/isquios/erectores, BS5), sin reinterpretar.

### Pitfall 4: la regla de proyección deja a oscuras movilidad y flow
**Qué pasa:** SPAGAT, PIKE y AF no tienen motor/sinergista en el modelo → `[]`. **Por qué:** sus roles son "se estira"/estabilizador. **Cómo evitarlo:** fallback documentado y testeado (M∪S; si vacío, Est∪Al). En los bloques ROM sigue el fallback por rol (`ROM_ROLE_ZONAS`) cuando la unión da vacía.

### Pitfall 5: tests de la 197 que cambian (lista cerrada)
| Archivo | Por qué cambia | Qué hacer |
|---|---|---|
| `test/tv/tv-muscle-zones.test.ts` | Fija CATEGORY/SECONDARY/ROUTE_ZONAS | Reemplazar por `test/anatomy/projection.test.ts` |
| `test/sessions/block-zones.test.ts` | Importa de `tv/muscle-zones` y usa `porCategoria` | Reescribir sobre `projection.ts` con rutas |
| `test/sessions/weekly-zones.test.ts:125-215` | NUCLEUS = OAP+SS (hoy `biceps…adductors`); DEUTEROS con ruta AF espera `[]` | Nuevas expectativas (OAP ∪ SS del modelo; AF ≠ `[]` con fallback) |
| `test/tv/tv-recorrido-inicio.test.ts:107-168` | HSPU/SS/OAR con categoría | Expectativas por ruta |
| `test/tv/tv-recorrido-screen.test.ts:120-135` | Igual | Igual |
| `test/sessions/free-blocks-list.test.ts`, `free-blocks-invariants.test.ts` | `ex(category)` siembra **siempre ruta AF** (`_free-blocks-fixtures.ts:58-75`): con la proyección por ruta, la categoría deja de mandar y todos los ejercicios dan zonas de AF | `seedExercise` recibe `route` y su default pasa a `''` (sin zonas, como hoy); los `ex('PUSH…')` pasan a `ex({ route: 'HD/ID' })`, etc. |
| `test/tv/tv-class-day.test.ts:230` | ROM: zonas por rol | Probablemente sin cambio (fallback ROM); verificar |
| `test/sessions/free-blocks-ranking.test.ts` | Zonas explícitas; solo importa el tipo `GrupoZona` | Cambiar el import |

### Pitfall 6: deep links a la Guía
**Qué pasa:** si la portada pasa a ser `guia`, los 4 "¿Qué es X?" y el auto-abrir de socios nuevos caen en la portada. **Cómo evitarlo:** Patrón 6 (las historias se quedan con la ruta `guia`).

### Pitfall 7: hoja modal en Entrenar
**Qué pasa:** con `q-dialog` modal, tocar un chip cierra la hoja pero no cambia de bloque, y tocar otra zona no la abre. **Cómo evitarlo:** `seamless`. Ojo: Escape la cierra [CITED: quasar.dev] y el back de Android también (manejo de Quasar para Capacitor). Es el comportamiento buscado.

### Pitfall 8: hitbox de zonas chicas
**Qué pasa:** `forearm`, `tibialis` y `adductors` (frente) quedan bajo 44 px en una figura de 220 px. **Por qué:** el toque cae en el `<g>` del path. **Cómo evitarlo:** en Tu cuerpo y en el admin, figura grande (vista única, D7); en Semana se acepta el tamaño de la 197 (sketch 021 aprobado) [ASSUMED: aceptable para Franco].

### Pitfall 9: los 5 SISSY entran al generador en prod
**Qué pasa:** después de 0288, los socios omega/spartan pueden recibir SISSY SQ OL en bloques de SS. **Por qué:** SS es "linear" por `dificultad_lineal` (9–11). **Cómo evitarlo:** es el arreglo pedido (D2), pero el SUMMARY tiene que avisarlo. Revisar si `exercise_progressions` necesita rebuild (`test/exercises/rebuild-progression-graph.test.ts` es el script relacionado) [ASSUMED: el generador "linear" no depende del grafo]. Apuntar siempre por nombre, `TRIM(route) = ''` y `tenant_id = 1`, nunca por id.

### Pitfall 10: numeración de migraciones con trenes en paralelo
**Qué pasa:** choque de números con la 196 (0284 reservada; usa 0276–0282) o con la 201 (`feat/201-conquer` hoy no tiene migraciones nuevas [VERIFIED: `git ls-tree`]). **Cómo evitarlo:** antes de crear, `ls … | sort | tail -3` en la rama + `git ls-tree` de `origin/master`, `origin/staging`, `feat/196-personalizados` y `feat/201-conquer`; si 0287/0288 existen en alguna, PARAR.

### Pitfall 11: CI no typechequea app ni admin
**Qué pasa:** un error de tipos en `.vue` llega a staging. **Por qué:** `ci.yml` solo corre lint (con `continue-on-error`) y build. **Cómo evitarlo:** revisión del diff + greps; si `vue-tsc` no está en el worktree (no lo está: no hay `node_modules`), el plan final lista los archivos para que el orquestador los typechequee desde el checkout principal con permiso de Franco [ASSUMED: el orquestador puede hacerlo].

## Code Examples

### Índice inverso músculo → rutas por rol (vista de la hoja D8/D14)
```typescript
// anatomy/serializers.ts (forma propuesta)
type Rol = "motor" | "sinergista" | "estabilizador" | "antagonista" | "estira";
export function rolesPorMusculo(rutas: readonly RutaContenido[]): Map<MusculoId, Record<Rol, string[]>> {
  const out = new Map<MusculoId, Record<Rol, string[]>>();
  for (const r of rutas) {
    for (const rol of ROLES) {
      for (const m of r.relaciones[rol] ?? []) {
        const fila = out.get(m) ?? { motor: [], sinergista: [], estabilizador: [], antagonista: [], estira: [] };
        if (!fila[rol].includes(r.code)) fila[rol].push(r.code);
        out.set(m, fila);
      }
    }
  }
  return out;
}
// Vista alumno: fuerte = motor ∪ sinergista, sostiene = estabilizador, estira = estira; antagonista se descarta.
```

### Hits por bloque (D17/D18)
```typescript
// anatomy/zone-hits.ts: misma regla que el sketch 021 hoyEnZona, en el server
export function zoneHitsDeRutas(codes: readonly string[]): Partial<Record<ZonaSlug, HitsGrupo>> {
  // por cada ruta del bloque y cada músculo con zona: agrega su id al grupo alumno del rol
  // (motor/sinergista → fuerte, estabilizador → sostiene, estira → estira; antagonista no)
}
// blockToResponse: zoneHits: zoneHitsDeRutas(rutasDistintas(mainExercises))
```

### Hoja no modal (app y admin)
```vue
<!-- Fuente: quasar.dev/vue-components/dialog (seamless + position bottom) -->
<q-dialog :model-value="open" seamless position="bottom" @update:model-value="onUpdate">
  <q-card class="anatomy-sheet" :class="{ 'anatomy-sheet--full': full }">
    <div class="anatomy-sheet__handle" @pointerdown="onDown" @pointerup="onUp" />
    <!-- contenido con interpolación {{ }} (nunca v-html) -->
  </q-card>
</q-dialog>
```

## State of the Art

| Antes | Ahora | Cuándo | Impacto |
|---|---|---|---|
| Zonas por `category` + "contiene" en `category_secondary` | Zonas derivadas de músculo → región, por ruta | Fase 200 | La TV cambia de pintura en ~25 rutas (tabla); todas documentadas |
| Guía = historias directas (SPEC 2026-09-24) | Portada con 2 cards cuando el flag está ON | Fase 200 | Las historias no cambian |
| `tibialis` = parte no muscular en el app | Zona tocable (grupo piernas) | Fase 200 | La TV no lo recibe en v1 |

**Deprecado:** `muscle-zones.ts` (se borra); `CATEGORY_ZONAS`/`SECONDARY_ZONAS`/`ROUTE_ZONAS` (quedan solo `ZONAS_SIN_RUTA` interino y `ROM_ROLE_ZONAS`).

## Assumptions Log

| # | Afirmación | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | El payload completo de la vista profe ronda 150–250 KB sin comprimir | Patrón 4 | Si es mucho más, partir en índice + ficha por `?code=` |
| A2 | La estrategia "linear" del generador no depende de `exercise_progressions` para elegir los SISSY | Pitfall 9 | Si depende, hace falta rebuild del grafo en prod (otra tarea con aval de Franco) |
| A3 | El tamaño de toque de zonas chicas en Semana (220 px) es aceptable | Pitfall 8 | Franco puede pedir agrandar la figura o un área de toque extra |
| A4 | El orquestador puede correr `vue-tsc` desde el checkout principal sobre los archivos tocados | Pitfall 11 | Si no, los errores de tipos del front se ven recién en el build de CI |
| A5 | Los slugs de ruta para el alumno (`front-lever`, `manna`…) cumplen la restricción "sin códigos" del endpoint de alumno | Patrón 4 | Si Franco interpreta otra cosa, cambia solo el serializador |
| A6 | La figura del admin por defecto es la de hombre | Patrón 5 | Cambio cosmético |

## Open Questions (RESOLVED)

> Resueltas en `200-CONTEXT.md` como R1–R5 (2026-10-21): R1 roles de Planis para Admin › Anatomía · R2 relaciones S8/TI-H + §2 · R3 `getRouteLabel` · R4 HT/NC/QC sin `display_name` · R5 gestos como texto en v1.

1. **¿Quién ve Admin › Anatomía?** (bloqueante para el plan del admin)
   - Qué sabemos: D6 dice "todo el staff que ve Entrenamiento", pero hoy Entrenamiento es `trainingOnly`, o sea solo owner + `Scaine7@hotmail.com` (`trainingAccess.ts`). El objetivo de la sección son los **profes desde el celular**.
   - Recomendación: un set nuevo `ANATOMIA_ROLES = ['coach', 'admin', 'owner', 'coach_actividad']` (= `PLANIS_ROLES`, el staff de piso), espejado en el API (`ANATOMIA_STAFF_ROLES`) y fijado en `test/rbac-sets.test.ts`. Avanzar con esa opción y anotarla para que Franco la confirme (memoria: no bloquear la cadena con preguntas).
2. **Relaciones: ¿S8/TI-H estrictas (P2) o completadas desde el §2?**
   - Recomendación: base S8/TI-H completada desde el §2 de cada ruta ⚠ (tabla de diferencias), dentro de "destiladas del §2" (P2), con cada agregado marcado con su cita. Si no, BL = PL y DS sin cuádriceps contradicen el propio CONTEXT.
3. **Nombres en Anatomía: ¿`ROUTE_LABELS` ("Dominadas", "Remos", "Push Ups", "Toe to Bar", "Press to Handstand") o los del sketch/DB ("One Arm Pull Up", "One Arm Row", "One Arm Push Up", "Toes To Bar", "Press Handstand")?**
   - Recomendación: `getRouteLabel(code)` (una sola fuente, lo que el socio ya ve en la TV y en el app), y el código chico al lado en el admin (D8). Anotarlo como diferencia con el sketch.
4. **`display_name` de HT/NC/QC (hoy NULL):** D1 no los nombra. Recomendación: dejarlos (0144 los dejó NULL a propósito) y que T14 tolere NULL.
5. **Gestos (FL, NC, TTB, PIKE, MN/RP, AF):** la investigación (§4.9, T22) los pide para roles por gesto, pero P2 no los incluye. Recomendación: v1 por ruta, con la lista de gestos como texto en la ficha y el test T22 como pendiente explícito.

## Environment Availability

| Dependencia | Para qué | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node | scripts de verificación ad hoc (`--experimental-strip-types`) | ✓ | v22.22.0 | — |
| `node_modules` en el worktree | tests/tsc/vue-tsc locales | ✗ (a propósito, regla de la 197) | — | Verificación estática; CI corre los tests del API |
| MySQL local (`eltemplo`) | consultas de solo lectura de verificación | ✓ (`/usr/bin/mysql`) | — | No lo necesitan los ejecutores |
| CI (GitHub Actions) | tests del API con MySQL, build de app/admin | ✓ | — | — |
| `gh` CLI | — | ✗ (memoria) | — | No hace falta |

**Faltantes sin fallback:** ninguno. **Con fallback:** typecheck/tests locales → CI + revisión.

## Validation Architecture

### Test Framework
| Propiedad | Valor |
|---|---|
| Framework | Vitest ^4.0.18 (API, con MySQL `eltemplo_test` en CI) |
| Config | `el-templo-api/vitest.config.*` existente |
| Comando rápido | `cd el-templo-api && pnpm exec vitest run test/anatomy` (solo en CI / checkout con deps) |
| Suite completa | `cd el-templo-api && pnpm test` (CI) |
| En el worktree | estático: `grep`, `cmp`, `python3 -I -c`, `git diff`, `node --experimental-strip-types` sobre archivos puros sin imports de deps |

### Criterio → verificación
| Criterio | Comportamiento | Tipo | Comando / chequeo | ¿Existe? |
|---|---|---|---|---|
| 1 | 28 músculos, 30 rutas con relaciones, fichas profe y alumno, glosario, todo `borrador` | unit (CI) | `test/anatomy/content-schema.test.ts` (validate() == []; `estado === 'borrador'` en todo; 28 músculos; ids únicos; toda marca `[n]` ∈ citas.ts; banderas con nivel + notaInterna; textos alumno sin términos bloqueados: latín, "antagonista", códigos) | ❌ Wave 0 |
| 1 | Rutas del contenido == `ROUTE_PROGRESSION_MAP`, ⊆ `ROUTE_LABELS`; zonas ∈ `anatomia.json` (leído por path relativo) y `cmp` admin vs app | unit (CI) | `test/anatomy/content-coverage.test.ts` | ❌ |
| 1 | Fichas: las 30 con ficha profe y alumno, o `pendiente` explícito por sección | unit (CI) | mismo archivo; en el cierre de fase, modo estricto (0 secciones vacías sin `pendiente`) | ❌ |
| 2 | Proyección = snapshot pre-200 − quita + agrega, por ruta | unit (CI) | `test/anatomy/projection-parity.test.ts` + `diferencias-aprobadas.ts` | ❌ |
| 2 | TV recibe solo zonas `enTv`, `string[]` ordenado; FB = las 15 | integración (CI) | `tv-recorrido-*.test.ts` actualizados | ✅ (a modificar) |
| 2 | `/weekly` `/daily` zones/groups/zoneHits desde el modelo; canasta | integración (CI) | `weekly-zones.test.ts`, `free-blocks-*.test.ts` actualizados + `zone-hits.test.ts` | ✅/❌ |
| 2 | `muscle-zones` borrado | grep | `git grep -n "muscle-zones" -- el-templo-api/src` sin resultados (salvo comentarios) | — |
| 3 | `GET /api/admin/anatomy`: 401 sin token, 403 para member/gestion/recepcion/tv, 200 para el set elegido | integración (CI) | `test/anatomy/anatomy-routes.test.ts` + `rbac-sets.test.ts` | ❌ |
| 3 | Manifiesto 478 entradas, templo-module con guard | integración (CI) | `iso-01-manifiesto.test.ts` | ✅ (a modificar) |
| 3 | UI admin (hoja, roles como frase, (i), ficha, marcas, "Borrador · sin validar") | manual | UAT en celular (390 px) y en escritorio | manual |
| 4 | `GET /api/anatomy` sin `antagonista`, `banderas`, `fichaProfe`, `code` (recorrido profundo de claves y valores) | integración (CI) | `anatomy-routes.test.ts` | ❌ |
| 4 | Flag OFF: tab Guía → historias, sin rutas nuevas | grep | `grep -n "ANATOMIA_ALUMNOS_ENABLED" el-templo-app/src -r` (routes.ts spread + MainLayout + SemanaTab) y `= false` en featureFlags | — |
| 4 | Deep links "¿Qué es X?" siguen en `guia` | grep | los 4 `router.push({ name: 'guia', query: { slide` sin cambios en el diff | — |
| 5 | zoneHits por bloque; chips marcados = bloques con hit; D19 sin re-render | integración + manual | `zone-hits.test.ts`; UAT teléfono (flag ON en un build local) | ❌ |
| 6 | Migraciones 0287/0288: texto (sin `;` en comentarios, WHERE por nombre + `TRIM(route) = ''` + tenant) | unit (CI) | `test/migrations/0287-0288-anatomia.test.ts` (guard estático del SQL, precedente 0285-0286) | ❌ |
| 6 | `route-labels.ts` ×3 iguales y con los nombres D1; `zones.ts` del app en sync con las regiones | unit (CI) | `test/anatomy/sync-front.test.ts` | ❌ |

### Muestreo
- **Por commit de tarea:** greps de higiene (console, any, rgba en `color:`), `git status --porcelain` vacío, diff revisado.
- **Por plan:** el orquestador revisa el diff y el worktree limpio (sin typecheck local).
- **Gate de fase:** CI verde en staging (tests del API + build de app/admin) antes de `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `el-templo-api/test/anatomy/` (los 7 archivos de arriba) + `__fixtures__/zonas-tv-pre-200.ts`
- [ ] `test/migrations/0287-0288-anatomia.test.ts`
- [ ] Fixture `_free-blocks-fixtures.ts`: `seedExercise` con `route` (default `''`)
- Framework: ya está (sin instalación)

## Security Domain

### Categorías ASVS
| Categoría | Aplica | Control |
|---|---|---|
| V2 Authentication | sí | `fastify.authenticate` (JWT) en las dos rutas |
| V3 Session Management | no | sin cambios |
| V4 Access Control | sí | set de roles en `onRequest` del endpoint staff (patrón `tv/control-routes.ts:40-50`) + `moduleScope` templo-training; recorte de contenido en el server para el alumno |
| V5 Input Validation | mínima | las rutas no reciben parámetros (si se suma `?code=`, validar contra el set de códigos) |
| V6 Cryptography | no | — |

### Amenazas conocidas
| Patrón | STRIDE | Mitigación |
|---|---|---|
| Socio que llama al endpoint staff y ve banderas/notas internas | Information disclosure | 403 por rol + test; la vista alumno no se arma recortando en el front |
| `notaInterna` de banderas que se filtra al profe | Information disclosure | `notaInterna` solo en el archivo; el serializador profe manda `textoProfe` y no `notaInterna` (§3.1: "no se le dice al alumno", y T21) |
| XSS por contenido | Tampering | el contenido es del repo (sin input de usuario); igual, solo interpolación `{{ }}`, nunca `v-html` (precedente `ActivityInfoSheet.vue:9-10`) |
| Contenido borrador mostrado a socios | (producto) | P1: flag OFF; "Borrador · sin validar" en el admin |

## Plan propuesto (para que el planner lo adopte o ajuste)

Ejecución **secuencial** (worktree compartido). Cada plan con must_haves, verificación estática y SUMMARY. Convenciones del 197 en un `200-EXECUTOR-RULES.md` (copiar el de la 197 cambiando worktree, migraciones 0287/0288 y lecciones).

**Wave 1 — Fundación en el API**
- **200-01** Tipos + regiones (16) + 28 músculos (zona, vista, precisión, qué hace profe/alumno de `alumno.js`) + glosario + grupos alumno + catálogo de banderas (§3.1) + `citas.ts` (Apéndice A) + `validate.ts` + `content-schema.test.ts` / `content-coverage.test.ts` (parte estática, leyendo `anatomia.json` del admin y del app).
- **200-02** Relaciones por rol de las 30 rutas (`rutas/*.ts`, S8/TI-H + §2 en las ⚠) + port de las fichas FL y PS del sketch (profe `data.js FICHAS`, alumno `alumno.js RUTA_ALUMNO`) para que la UI tenga datos reales desde el principio.
- **200-03** `projection.ts` + `zone-hits.ts` (puros) + snapshot pre-200 + `diferencias-aprobadas.ts` + `projection.test.ts`, `projection-parity.test.ts`, `zone-hits.test.ts`.
- **200-04** Pasar los consumidores (`recorrido.ts` con filtro `enTv`, `session-response.ts` con `zoneHits`, `free-blocks-service.ts`, `free-blocks-ranking.ts`, `types.ts`), borrar `muscle-zones.ts`, unificar el conversor, actualizar los tests de la lista del Pitfall 5 y la fixture de free-blocks.
- **200-05** `serializers.ts` + `routes.ts` (2 GET) + registro con `moduleScope` + `ANATOMIA_STAFF_ROLES` + manifiesto 476 → 478 + `anatomy-routes.test.ts` + `rbac-sets`.
- **200-06** Migraciones 0287 (D1) y 0288 (SISSY) + `route-labels.ts` ×3 + `sync-front.test.ts` + test de migraciones.

**Wave 2 — Admin**
- **200-07** Tipos + store + `AnatomyFigure.vue` + ruta `/anatomia` + ítem de `NAV_MODEL` (set de la Open Question 1).
- **200-08** `AnatomiaPage.vue` mobile B2: giro, chips de profundos, hoja (músculos, precisión, aviso de grupo, roles como frase con (i), nombre + código chico); layout de escritorio.
- **200-09** `RutaFicha.vue` a pantalla completa (encabezado con "Borrador · sin validar", chips de sección, cuerpo por rol + leyenda + "no están en el dibujo", secciones, marcas con tooltip, glosario).

**Wave 3 — App (todo detrás de `ANATOMIA_ALUMNOS_ENABLED`)**
- **200-10** Flag + store/tipos alumno + `BodyFigure` (props opcionales + `select-zone`) + `zones.ts` (`tibialis`) + `AnatomySheet` seamless + componentes de hoja alumno (qué hace, 3 grupos con (i), "Avisale a tu profe").
- **200-11** Rutas nuevas + tab condicional + `GuiaHomePage` (2 cards) + `TuCuerpoPage` (giro, profundos, `?zona=`) + ficha corta.
- **200-12** Semana tocable: modos D18, chips marcados, "Hoy en tu clase" desde `zoneHits`, "Ver en Tu cuerpo ›", D19, vidriera sin cambios.

**Wave 4 — Contenido de fichas (las 28 restantes, 5–6 por plan, cada una con profe + alumno + marcas + banderas por id + pendientes ⚑H/⚑N)**
- **200-13** FLR, OAP, OAR, MU, TTB · **200-14** MN/RP, BL, HD/ID, OAPU, PL · **200-15** PLPU, HS, HSPU, PHS, HR · **200-16** L, QC, SS, SU, DS · **200-17** HT, NC, REVERSE HYPER, SPAGAT · **200-18** BRIDGE, SIDE PCK, PIKE, AF.
- Cobertura de la investigación: buena en tren superior (22–38 líneas por ruta, con tablas articulares). Más flaca en DS (20), REVERSE HYPER (18), FLR (22), SS (22), AF (sin análisis articular por ruta: D1/D2 por posición) y el Jefferson de NC (3 líneas). En esas, más `pendiente` explícitos y nada inventado (P2).
- Si una ficha cambia relaciones, el test de paridad falla y el ejecutor actualiza `diferencias-aprobadas.ts` con su motivo.

**Wave 5 — Cierre**
- **200-19** Coherencia estricta (las 30 fichas completas o con pendiente), barrido de greps, lista de archivos para `vue-tsc` desde el checkout principal, `200-UAT.md` (admin en celular, Guía y Entrenar con el flag ON en un build local, TV en staging, tabla de diferencias para Franco).

## Sources

### Primarias (ALTA)
- Código de esta rama (todas las referencias file:line de arriba), leído el 2026-10-21.
- Consulta local de solo lectura a `eltemplo` (categorías por ruta, filas SISSY, `routes`) + corrida del `muscle-zones.ts` real vs la proyección del sketch (script en el scratchpad).
- `.planning/phases/200-anatomia-funcional/200-CONTEXT.md`; `.planning/research/anatomia-profes-2026-10-21.md` (§0, §1.4–1.7, §2 S4.1, S8, TI-H, §3.1–3.2, §4, §6.6, Apéndice A).
- Sketches 019/020/021 (README, `data.js`, `ficha.js`, `alumno.js`, `alumno-ui.js`, `021/index.html`).
- `197-EXECUTOR-RULES.md`; skill `el-templo-db-migrations`; memorias `reference_gates_tenancy_ruta_job_nueva`, `reference_tabla_gym_owned_nueva_cinco_conteos`.
- [CITED: https://quasar.dev/vue-components/dialog]: `seamless` ("Does not use a backdrop so user is able to interact with the rest of the page too"), `position`, manejo del back button en Capacitor.

### Secundarias (MEDIA)
- Ninguna fuente web más allá de Quasar.

### Terciarias (BAJA)
- Estimaciones de tamaño de payload (A1).

## Metadata

**Confianza:**
- Stack: ALTA. No hay nada nuevo y todo está verificado en package.json.
- Arquitectura y costuras: ALTA. Cada consumidor y cada test están listados con línea.
- Diferencias de proyección: ALTA en el método, MEDIA en el resultado final (depende de las relaciones que se escriban).
- Contenido/fichas: MEDIA. La fuente es buena pero desigual entre rutas.
- Pitfalls: ALTA (1, 2, 5, 6 y 10 verificados en código o git).

**Fecha:** 2026-10-21 · **Vigencia:** ~30 días (o hasta que la 196/201 muevan migraciones o la 197 cambie `blockToResponse`).
