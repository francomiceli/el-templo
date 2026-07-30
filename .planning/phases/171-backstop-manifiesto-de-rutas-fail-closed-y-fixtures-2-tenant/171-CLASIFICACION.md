# Fase 171 — Dossier de revisión de la clasificación de rutas

**Insumo del checkpoint D-03/D-04.** Fuente: `el-templo-api/test/tenant-manifest.ts`,
poblado en el plan 171-02 desde un volcado one-shot del hook `onRoute` sobre `buildApp()`
real (2026-07-29, rama `feat/170-sentinel-lint`).

> **REVISADO Y APROBADO por Franco el 2026-07-29** en el checkpoint del plan 171-06.
> El veredicto de cada caso está en la **sección D** al final de este documento, y ya
> está aplicado en `el-templo-api/test/tenant-manifest.ts`. Las secciones A, B y C de
> abajo quedan tal como se le presentaron —son el insumo de la decisión, no su
> resultado—: donde el veredicto cambió algo, la sección D lo dice.

**Reparto de las 370 rutas presentado a revisión:** 221 `tenant-scoped` · 11 `global` ·
138 `templo-module`. **Reparto final aprobado:** 221 `tenant-scoped` · **8** `global` ·
**141** `templo-module` (ver sección D).

Se revisan **solo las dos listas peligrosas** (`global` y las fronteras de
`templo-module`) más las dudosas. Las 221 `tenant-scoped` **no van a revisión** (D-03):
equivocarse hacia `tenant-scoped` sobra protección, no falta.

---

## A. `global` — las 11, con su motivo escrito

Es la lista corta y peligrosa: `global` significa "esta ruta ve datos de todos los
gimnasios y está bien". Se revisa entera, fila por fila.

| Ruta                                             | Motivo escrito en el manifiesto                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                    | Liveness probe del proceso: devuelve un objeto fijo y no consulta ninguna tabla, así que no hay datos de ningún gimnasio que aislar.                                 |
| `OPTIONS *`                                      | Preflight CORS que registra `@fastify/cors`: responde cabeceras y termina, sin ejecutar una sola línea de lógica de negocio ni tocar la base.                        |
| `POST /api/auth/login`                           | Resuelve la identidad ANTES de conocer el gimnasio: busca por el email pelado y el tenant sale de la fila encontrada, no al revés.                                   |
| `POST /api/auth/refresh`                         | Mismo lookup pre-scope que el login pero sobre el hash del refresh token: el tenant se deriva de la fila del token, que se encuentra sin ningún scope.               |
| `POST /api/auth/logout`                          | Invalida el refresh token del portador y no lee ni escribe una sola fila de datos de un gimnasio.                                                                    |
| `POST /api/webhooks/wellhub`                     | Entrada pública sin sesión: Wellhub no manda tenant y el gimnasio se DERIVA server-side desde `gym.id` contra `branches.wellhub_gym_id` (CON-04, cerrado en 169-05). |
| `POST /api/tv/pair/start`                        | Pre-claim (mina M7): la fila de pairing nace ANTES de saber de quién es el televisor — `branch_id` queda nulo hasta que el staff hace el claim.                      |
| `GET /api/tv/pair/status`                        | Pre-claim: el televisor poll-ea su device code sin sesión ni sede asignada, así que la fila que consulta todavía no pertenece a ningún gimnasio.                     |
| `POST /api/app/labs-inquiry`                     | Lead del propio SaaS y no de un gimnasio: `labs_inquiries` es tabla de plataforma por la decisión Q2 del doc 06 §8, así que la fila nace sin dueño de gimnasio.      |
| `GET /api/app/admin/labs-inquiries`              | Bandeja de los leads de la plataforma: quien la lee es el dueño del SaaS y necesita verlos todos, no el staff de un gimnasio (decisión Q2 del doc 06 §8).            |
| `PATCH /api/app/admin/labs-inquiries/:id/status` | Gestiona el estado de un lead de la plataforma sobre la misma tabla global de Q2; el que lo mueve es el dueño del SaaS.                                              |

Las tres últimas (`labs-inquiry`) son además **dudosas** — ver caso 3 de la sección C.

> ⚠️ **Estas 3 filas ya NO son `global`.** El veredicto de Franco (sección D, caso 3) las
> movió a `templo-module` / `templo-marketing`. La lista `global` vigente son las **8**
> primeras filas de esta tabla.

---

## B. `templo-module` — fronteras por módulo, no ruta por ruta

Son **138 rutas**. Presentarlas sueltas sería impracticable, así que lo que se revisa acá
es **dónde cae la frontera de cada módulo**, no cada línea. El mapeo carpeta → módulo ya
está cerrado en `.docs/saas-multitenancy/04-mecanismo-modulos.md` §2.1 (validado con Nacho
el 2026-07-02); lo que se confirma es que estos prefijos caen ahí.

| Módulo                    | Prefijo                                                          |   Rutas | Qué hay ahí                                                                                                             |
| ------------------------- | ---------------------------------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------- |
| `templo-training`         | `/spom/*`                                                        |       5 | Semana SPOM, lookup, tablas y pool de ejercicios del generador (único módulo fuera de `/api`)                           |
| `templo-training`         | `/api/sessions/*`                                                |       5 | Sesión del socio: diaria, semanal, detalle, completar, generar                                                          |
| `templo-training`         | `/api/admin/sessions/*`                                          |      24 | Editor de sesiones del coach: bloques, formatos, roles, rutas, swaps, aprobación y day-modes                            |
| `templo-training`         | `/api/admin/exercises/*`                                         |      16 | ABM del pool de ejercicios, propuestas y subida de videos                                                               |
| `templo-training`         | `/api/admin/{blocks,generate,routes,weeks,saved-blocks,formats}` |       9 | Resto del editor: pool de bloques, generación, rutas, resumen de semana, bloques guardados y compatibilidad de formatos |
| `templo-training`         | `/api/admin/tree-editor/*`                                       |       9 | Árbol de progresiones: milestones, precedencias, reagrupado, reorden                                                    |
| `templo-training`         | `/api/{admin/goal-plans,goal-plans}/*`                           |       9 | Planes de objetivo: 3 del staff + 6 del socio                                                                           |
| `templo-training`         | `/api/{admin/programs,members/programs,members/me}/*`            |      16 | Programas: 10 del staff, 3 del catálogo del socio, 3 de su programa/inscripciones actuales                              |
| `templo-training`         | `/api/progression/*`                                             |       3 | Stats, resumen semanal y pedido de evaluación                                                                           |
| `templo-training`         | `/api/{check-ins,admin/check-ins}*`                              |       3 | Check-ins de entrenamiento (NO el check-in de asistencia, que es core)                                                  |
| `templo-training`         | `/api/{admin/exercise-adjustments,exercise-adjustments}`         |       2 | Ajustes de ejercicio por socio (dominado/bajado)                                                                        |
| `templo-training`         | `/api/tree-progress/me`                                          |       1 | Progreso del socio en el árbol                                                                                          |
| **`templo-training`**     |                                                                  | **102** |                                                                                                                         |
| `templo-marketing`        | `/api/blog/*`                                                    |      16 | Blog público de eltemplo.org + su ABM                                                                                   |
| `templo-marketing`        | `/api/gladius/*`                                                 |       7 | Catálogo Gladius + consultas + ABM                                                                                      |
| `templo-marketing`        | `/api/franchise/*`                                               |       5 | Solicitudes de franquicia + bandeja del staff                                                                           |
| `templo-marketing`        | `/api/academy/*`                                                 |       2 | Consultas de la academia + bandeja                                                                                      |
| `templo-marketing`        | `/api/app/{waitlist,admin/waitlist}`                             |       2 | Waitlist de la app (el resto de `/api/app` es `global`, ver caso 3)                                                     |
| **`templo-marketing`**    |                                                                  |  **32** |                                                                                                                         |
| `templo-onboarding`       | `/api/onboarding/*`                                              |       3 | Perfil, analytics y cierre del onboarding                                                                               |
| **`templo-onboarding`**   |                                                                  |   **3** |                                                                                                                         |
| `templo-gamification`     | `/api/bar-challenge/result`                                      |       1 | Único endpoint del módulo: AURA no expone rutas propias, es un service interno                                          |
| **`templo-gamification`** |                                                                  |   **1** |                                                                                                                         |
| **TOTAL**                 |                                                                  | **138** |                                                                                                                         |

**La suma de la columna "Rutas" da exactamente 138**, que es el número de entradas
`templo-module` del manifiesto (verificado contra `TENANT_MANIFEST` en el plan 171-02:
`templo-training=102`, `templo-marketing=32`, `templo-onboarding=3`,
`templo-gamification=1`).

---

## C. Dudosas (D-04) — nada de esto se cierra sin Franco

Cada caso está marcado en `test/tenant-manifest.ts` con un comentario que arranca con
`D-04 dudosa:` justo arriba de la(s) entrada(s). La categoría escrita hoy es la
**recomendación**, no la decisión.

| #   | Ruta(s)                                                                                                             | Recomendación escrita                | Por qué es dudosa                                                                                                                                              | Documento que la respalda / contradice                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /api/auth/register`                                                                                           | `tenant-scoped`                      | Es pública y sin sesión, como las tres rutas `global` de su mismo prefijo, pero crea una fila gym-owned.                                                       | Hoy cae en el `DEFAULT 1` de la columna porque `auth` no es tenant-aware hasta la fase 175 (ADO-06).                                                                                |
| 2   | `GET /api/auth/me`, `POST /api/auth/me/change-password`, `POST /api/auth/me/delete-account`                         | `tenant-scoped`                      | Son self-scoped por el token del portador, pero cuelgan de `/api/auth`, cuyo resto es `global`.                                                                | Sin conflicto documental; la duda es de frontera de prefijo.                                                                                                                        |
| 3   | `POST /api/app/labs-inquiry`, `GET /api/app/admin/labs-inquiries`, `PATCH /api/app/admin/labs-inquiries/:id/status` | **`global`**                         | **Conflicto real de docs.** Son los leads del propio SaaS, no de un gimnasio. Se partió el prefijo `/api/app`: labs a `global`, waitlist a `templo-marketing`. | Doc 06 §8 **Q2** (`labs_inquiries` es GLOBAL, plataforma) **vs.** doc 04 §2.1, que mete `app-landing` entero en `templo-marketing`. Se siguió Q2.                                   |
| 4   | `GET /api/app/admin/waitlist`, `POST /api/app/waitlist`                                                             | `templo-module` (`templo-marketing`) | Comparten prefijo con las `labs-inquiry` del caso 3 pero van a otra categoría.                                                                                 | `app_waitlist` **sí** es tabla gym-owned; doc 04 §2.1 la deja en `templo-marketing`.                                                                                                |
| 5   | `GET /api/campaigns/track/open`, `GET /api/campaigns/track/click`, `GET /api/campaigns/unsubscribe`                 | **`tenant-scoped`**, NO `global`     | Son públicas y se resuelven por token, que es el perfil típico de una `global`.                                                                                | Doc 06 §8 **Q5** hizo la supresión de `unsubscribe` **por tenant** (`uq (tenant_id, email)`). Marcarlas `global` contradiría esa decisión y dejaría Q5 sin backstop en la fase 175. |
| 6   | `GET /api/admin/ratings`, `/coaches`, `/roster`, `POST /api/admin/ratings/roster`                                   | `tenant-scoped` (core)               | "Rating de clase" suena a feature Templo.                                                                                                                      | `coach_ratings` es tabla core y la usa cualquier gimnasio que tenga coaches; el doc 04 §2.1 no lista `ratings` en ningún módulo.                                                    |
| 7   | `GET /api/members/ratings/pending`, `POST /api/members/ratings`                                                     | `tenant-scoped` (core)               | Misma duda que el caso 6, del lado del socio.                                                                                                                  | Ídem: `coach_ratings` es core.                                                                                                                                                      |
| 8   | `GET /api/tv/me`, `GET /api/tv/state`, `POST /api/tv/client-log`                                                    | `tenant-scoped`                      | El televisor no tiene JWT ni scope, igual que las dos rutas de pairing que sí son `global`.                                                                    | Diferencia real: son **post-claim** — el tenant sale de la fila ya reclamada, no de una fila pre-claim sin dueño.                                                                   |
| 9   | `GET /api/members/me/current-program`, `PUT /api/members/me/current-program`, `GET /api/members/me/enrollments`     | `templo-module` (`templo-training`)  | Viven bajo `/api/members/me`, que en el resto del API es core.                                                                                                 | Doc 04 §2.1 pone `programs` en `templo-training`; lo que sirven es el programa de entrenamiento y sus inscripciones.                                                                |
| 10  | `GET /api/check-ins/today`, `POST /api/check-ins`, `GET /api/admin/check-ins`                                       | `templo-module` (`templo-training`)  | El nombre se confunde con el check-in de asistencia (`POST /api/members/attendance/check-in`), que es **core** y quedó `tenant-scoped`.                        | Doc 04 §2.1 lista `check-ins` como Templo.                                                                                                                                          |
| 11  | `/api/blog/*` (16)                                                                                                  | `templo-module` (`templo-marketing`) | Son rutas públicas de eltemplo.org: contenido de marca, no del gimnasio.                                                                                       | Doc 04 §2.1 pone `blog` en `templo-marketing`; las tablas de blog son gym-owned.                                                                                                    |
| 12  | `/api/academy/*` (2)                                                                                                | `templo-module` (`templo-marketing`) | La academia es formación de marca.                                                                                                                             | Doc 04 §2.1 pone `academy` en `templo-marketing`; `academy_inquiries` es gym-owned.                                                                                                 |
| 13  | `/api/gladius/*` (7)                                                                                                | `templo-module` (`templo-marketing`) | Tienda pública de la marca.                                                                                                                                    | Doc 04 §2.1 pone `gladius` en `templo-marketing`; `gladius_products` es gym-owned.                                                                                                  |
| 14  | `/api/franchise/*` (5)                                                                                              | `templo-module` (`templo-marketing`) | Franquiciar "El Templo" es la **marca**, no el gimnasio: roza plataforma, como las `labs-inquiry` del caso 3.                                                  | Doc 04 §2.1 lo pone en `templo-marketing`; ninguna decisión del doc 06 §8 lo contradice (a diferencia del caso 3).                                                                  |

**Nota de exactitud sobre el caso 2:** el inventario del RESEARCH anotaba estas rutas como
`PATCH /api/auth/me/change-password` y `DELETE /api/auth/me/delete-account`. El volcado
real las registra ambas como **`POST`**; el manifiesto usa los métodos reales.

---

---

## D. Veredicto — checkpoint del plan 171-06, **2026-07-29**

Franco revisó la sección A entera, las fronteras de la sección B y los **14 casos** de la
sección C uno por uno. Los dos conflictos reales de documentación tienen veredicto
explícito. **No queda ninguna duda abierta:** `grep -c "D-04 dudosa:"` sobre
`el-templo-api/test/tenant-manifest.ts` da **0**, y cada grupo que estuvo en duda conserva
su comentario, ahora como `D-04 veredicto:` con la decisión y su fuente. La duda existió y
su resolución es la información que se guarda; borrar el comentario habría borrado el
rastro.

### Sección A (`global`) y sección B (`templo-module`)

Revisadas y **aprobadas**, con una única corrección: las 3 rutas de `labs-inquiries`
salen de `global` (caso 3). Las 8 `global` que quedan y las fronteras módulo × prefijo
de la sección B se aprobaron sin cambios.

### Los 14 casos

| #      | Ruta(s)                                        | Veredicto                                                | Fuente                                                                                                                                                                            |
| ------ | ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `POST /api/auth/register`                      | **APROBADO** `tenant-scoped`                             | Checkpoint 171-06, 2026-07-29                                                                                                                                                     |
| 2      | `/api/auth/me` (3)                             | **APROBADO** `tenant-scoped`                             | Ídem                                                                                                                                                                              |
| **3**  | **`labs-inquiry` + `labs-inquiries` (3)**      | **OVERRIDE → `templo-module` / `templo-marketing`**      | **Veredicto de Franco en el checkpoint 171-06, 2026-07-29** — palabras textuales: **"todo eso es parte del Templo"**. Supersede la recomendación Q2-global **para estas rutas**. |
| 4      | `/api/app/{waitlist,admin/waitlist}` (2)       | **APROBADO** `templo-module` / `templo-marketing`        | Checkpoint 171-06, 2026-07-29                                                                                                                                                     |
| **5**  | **`campaigns/track/*` + `/unsubscribe` (3)**   | **APROBADO** `tenant-scoped`, NO `global` — con salvedad | Checkpoint 171-06, 2026-07-29 + decisión Q5 del doc 06 §8 (ver salvedad abajo)                                                                                                     |
| 6      | `/api/admin/ratings` (4)                       | **APROBADO** `tenant-scoped` (core)                      | Checkpoint 171-06, 2026-07-29                                                                                                                                                     |
| 7      | `/api/members/ratings` (2)                     | **APROBADO** `tenant-scoped` (core)                      | Ídem                                                                                                                                                                              |
| 8      | `/api/tv/{me,state,client-log}` (3)            | **APROBADO** `tenant-scoped` (post-claim)                | Ídem                                                                                                                                                                              |
| 9      | `/api/members/me/{current-program,…}` (3)      | **APROBADO** `templo-module` / `templo-training`         | Ídem                                                                                                                                                                              |
| 10     | `check-ins` de entrenamiento (3)               | **APROBADO** `templo-module` / `templo-training`         | Ídem — confirmada la trampa de nombre: el check-in de **asistencia** sigue core                                                                                                    |
| 11     | `/api/blog/*` (16)                             | **APROBADO** `templo-module` / `templo-marketing`        | Ídem                                                                                                                                                                              |
| 12     | `/api/academy/*` (2)                           | **APROBADO** `templo-module` / `templo-marketing`        | Ídem                                                                                                                                                                              |
| 13     | `/api/gladius/*` (7)                           | **APROBADO** `templo-module` / `templo-marketing`        | Ídem                                                                                                                                                                              |
| 14     | `/api/franchise/*` (5)                         | **APROBADO** `templo-module` / `templo-marketing`        | Ídem — misma dirección que el override del caso 3: lo de la marca es del Templo                                                                                                   |

**13 de 14 aprobados tal como se recomendaron. 1 override: el caso 3.**

### El override del caso 3, en detalle

El plan 171-02 recomendaba `global` siguiendo la decisión **Q2** del doc 06 §8
(`labs_inquiries` es tabla de PLATAFORMA: son leads del propio SaaS). El doc 04 §2.1, en
cambio, mete `app-landing` entero en `templo-marketing`. Franco decidió por el doc 04:
**"todo eso es parte del Templo"**.

Consecuencias, escritas para que nadie las re-litigue por sorpresa:

- Para la clasificación de **RUTAS**, el mapeo carpeta → módulo del doc 04 §2.1 gana sobre
  la recomendación Q2-global **en este caso**. El veredicto no dice nada sobre la
  clasificación de la **TABLA** `labs_inquiries` en `src/db/tenant-tables.ts`, que es un
  registro distinto y sigue gobernada por Q2.
- El prefijo `/api/app` **deja de partirse**: las 5 rutas viven juntas en
  `templo-marketing · app-landing`.
- La dirección es **más protección, no menos**: las 3 rutas pasan de estar exentas del
  aislamiento a estar cubiertas por él. `global` baja de 11 a **8**.
- En la fase **176**, estas 3 rutas van a requerir `requireModule("templo-marketing")`.

### La salvedad del caso 5 — material de PLANNING de la fase 175

Franco aprobó la clasificación `tenant-scoped` y agregó, textual:

> "queda por verificar si campaigns está realmente preparado para que cada tenant lo use
> (armando su propia campaña con su propio mail saliente, etc.) — es material de la fase
> 175 (adopción)"

**No cambia la clasificación de hoy.** Es un pendiente para el `/gsd:plan-phase 175`: el
manifiesto afirma que estas rutas *deben* estar aisladas por tenant, no que el módulo
`campaigns` ya sepa operar multi-tenant end-to-end (remitente saliente propio por
gimnasio, entre otras). Etiquetarlas `tenant-scoped` es justamente lo que hace que la 175
tenga que resolverlo en vez de descubrirlo en producción.

### Reparto final, verificado por runtime

Contado importando `TENANT_MANIFEST` y no a mano (Prettier parte las entradas largas en
multilínea: cualquier contador textual es frágil — hallazgo del plan 171-02):

| Categoría          | Presentado a revisión | **Final aprobado** |
| ------------------ | --------------------: | -----------------: |
| `tenant-scoped`    |                   221 |            **221** |
| `global`           |                    11 |              **8** |
| `templo-module`    |                   138 |            **141** |
| **TOTAL**          |               **370** |            **370** |

`templo-module` por módulo: `templo-training` **102** · `templo-marketing` **35** (era 32)
· `templo-onboarding` **3** · `templo-gamification` **1**.

Validaciones de forma en runtime: `sinMotivo` = 0, `sinModulo` = 0, `categoriaInvalida`
= 0, suma de las 3 categorías = 370.

**`tenant-scoped` no se movió**, y eso es lo esperado: las 3 rutas del override salieron de
`global`, no de la masa. El TOTAL tampoco: una recategorización cambia la etiqueta, no la
cantidad de rutas — que es la razón por la que el gate ISO-01 quedó **verde 9/9** después
de aplicar el veredicto (afirma el total y la forma de cada entrada, no el reparto por
categoría).

---

_Veredicto aplicado al manifiesto en el plan **171-06** el 2026-07-29. Gate ISO-01 verde
9/9 con la clasificación aprobada._
