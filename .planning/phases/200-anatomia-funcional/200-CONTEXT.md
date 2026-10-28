# Fase 200: Anatomía funcional (profes, Guía y Entrenar) — CONTEXT

**Fecha:** 2026-10-21 · **Rama:** `feat/200-anatomia` (worktree `/home/franco/projects/et-200-anatomia`, base `origin/staging` `99152a195` = master + toda la 197) · **Sin push** hasta el OK de Franco (staging primero) · **Sin bump de versión**.

Base en staging (no en master) porque el cuerpo interactivo de Entrenar se monta sobre la pantalla Semana de la 197, que todavía no está en master. **La 200 sale a producción con o después del tren de la 197.**

El discuss está hecho: son la investigación (decisiones D1–D5 de Franco, §0) y los tres sketches ganadores (019, 020, 021), todo del 2026-10-21. Ante una duda, mandan en ese orden: este CONTEXT → los README de los sketches → la investigación.

## Dominio

Un recurso de **anatomía funcional aplicada al método de El Templo** (no un glosario): qué músculos trabaja cada ruta del catálogo, con qué rol (motor, sinergista, estabilizador, antagonista, se estira), por qué progresa, dónde se siente, compensaciones, cues y cuándo derivar. Un **solo modelo de contenido** alimenta tres superficies:

1. **Admin › Anatomía** (profes, desde el celular): por músculo, tocando el cuerpo.
2. **App › Guía** partida en dos: Empezá acá (las historias de hoy) + **Tu cuerpo** (la misma vista en tono alumno).
3. **App › Entrenar (Semana)**: el cuerpo de la clase de hoy se vuelve tocable.

El modelo reemplaza a `el-templo-api/src/modules/tv/muscle-zones.ts` como **fuente única** de músculo → zona del dibujo.

## Fuentes canónicas (leer antes de planificar o ejecutar)

| Qué | Dónde |
|---|---|
| Investigación consolidada (inventario, análisis por ruta con citas, banderas, modelo, validación). **§0 trae D1–D5** | `.planning/research/anatomia-profes-2026-10-21.md` (en esta rama) |
| Sketch 019, admin. **Ganador: `ronda2.html` B2** + ajuste "roles como frase" (README) | `/home/franco/projects/el-templo/.planning/sketches/019-anatomia-profes-admin/` |
| Sketch 020, Guía + Tu cuerpo. **Ganador: Síntesis** (primer celular de `index.html`) | `/home/franco/projects/el-templo/.planning/sketches/020-guia-anatomia-app/` |
| Sketch 021, Entrenar. **Ganador: A2** (con el ajuste "modos sin mezclar") | `/home/franco/projects/el-templo/.planning/sketches/021-entrenar-cuerpo-tap/` |
| Datos de los sketches (forma del modelo, ya probada en pantalla) | `019-…/data.js` (MUSCULOS, FICHAS FL/PS, GLOSARIO, COMPLEJOS), `020-…/alumno.js` (QUE_HACE, GRUPOS_ALUMNO, RUTA_ALUMNO) |
| Figura (geometría MIT, ELABBASSI Hicham) | admin `el-templo-admin/src/tv/recorrido/anatomia.json` + `anatomia.ts`; app `el-templo-app/src/components/anatomy/anatomia.ts` + `BodyFigure.vue` (copia de la 197-10) |
| Mapeo actual a reemplazar | `el-templo-api/src/modules/tv/muscle-zones.ts` (+ `test/tv/tv-muscle-zones.test.ts`); lo consumen `tv/class-day.ts`, `tv/recorrido.ts`, `tv/types.ts`, admin `src/tv/poll.ts`, y la 197 (zonas/grupos por bloque en `/weekly` y `/daily`, canasta) |
| Nombres de ruta | `el-templo-api/src/modules/tv/route-labels.ts`, `el-templo-app/src/constants/route-labels.ts`, `routes.display_name` en la DB |
| Ejemplo de flag del app | `el-templo-app/src/config/featureFlags.ts` (`ENTRENAR_TABS_ENABLED`) |
| Reglas de ejecutor heredadas | `.planning/phases/197-entrenar-tabs-canasta-bloque-libre/197-EXECUTOR-RULES.md` |

Los sketches viven en el checkout principal (commits del master local, que está divergido y no se pushea): se leen por ruta absoluta y no se copian a la rama.

## Decisiones (bloqueadas)

### De la investigación (§0, Franco 2026-10-21)

- **D1 · Nombres oficiales:** HR = **Espinales y planchas laterales** · MN/RP = **Manna** · SIDE PCK = **Side Pancake** · HD/ID = **Fondos** · FLR = **Front Lever Row**. Reemplazan "Ham Raise", "L-Sit", "Side Pike Compression", "Hefesto / Impossible Dips" y "Front Lever Pull Ups" en DB (`routes.display_name`, por migración), TV y app (`route-labels.ts` de API y app).
- **D2 · PLYO, CARDIO y KL fuera de la v1** (99 ejercicios sin ruta): sin rutas nuevas ni fichas. Sí se corrigen por migración los **5 "SISSY SQ OL…" sin ruta → SS**.
- **D3 · Los profes solo leen y opinan.** El contenido vive en **archivos versionados en el repo** (opción B de §4.7), no en tablas. Mismo contenido para todos los tenants en v1. Sin tablas nuevas → sin gates de tenancy de tabla.
- **D4 · Dibujo actual** (23 zonas + `tibialis`, que hoy existe y no se usa) con **precisión por músculo** (exacta / agrupada / aproximada) y aviso "esta zona es un grupo". Zonas como datos, no enum cableado.
- **D5 · Kinesiólogo humano pendiente.** Todo el contenido nace en estado **borrador**.

### Admin › Anatomía (sketch 019, ganador B2)

- **D6** Entrada nueva **Anatomía** en el menú (`NAV_MODEL`, categoría Entrenamiento, después de Árbol), para todo el staff que ve Entrenamiento. Diseño **mobile-first** (los profes entran al admin desde el celular); en escritorio, la misma navegación con el cuerpo a la izquierda y el panel a la derecha (019 ronda 1, B).
- **D7** Cuerpo frente / espalda en grande con botón para girar. Sin buscador (Franco eligió B2 sobre B3).
- **D8** Tocar una zona → **hoja desde abajo** (media pantalla; se arrastra a entera o se cierra; el cuerpo se achica arriba para que la zona marcada se vea). Por cada músculo de la zona: nombre, precisión, y **los roles como frase** arriba de las rutas: *Es motor en · Es sinergista en · Estabiliza en · Es antagonista en · Se estira en*. Rutas con **nombre completo + código chico** (sin repetir si son iguales).
- **D9** Cada rol tiene una **(i)** que despliega su definición con un ejemplo de nuestras rutas. **Glosario** (roles, tipos de contracción, precisión de zona) dentro de cada ficha ("¿Qué significa cada rol?"). **Sin** el link al glosario debajo del cuerpo.
- **D10** Músculos profundos que el dibujo no muestra (serrato, manguito rotador, iliopsoas) como chips debajo del cuerpo; abren la misma hoja.
- **D11** Tocar una ruta → **ficha a pantalla completa** con "← <zona>". Ficha: encabezado (complejo, código, n ejercicios, tipo, brazo, **"Borrador · sin validar"**), resumen, chips de sección, cuerpo pintado por rol + leyenda + "no están en el dibujo" + aviso de grupo, y secciones *Articulaciones y músculos · Fases · Por qué progresa (escalones) · Se siente / compensa · Cues · Cuándo derivar · Ejercicios*. Cada afirmación con su **marca de evidencia** (`[n]`, L1, C, M, R, H) con tooltip.

### App › Guía (sketch 020, ganador Síntesis)

- **D12** La pestaña Guía pasa a ser una portada con **dos cards de media pantalla**: arriba **Empezá acá** (fondo oscuro con la foto de las barras, botón lleno "Ver la guía") que abre las historias **sin cambios**; abajo **Tu cuerpo** (card blanca con el cuerpo encendido asomando, botón lleno "Explorar").
- **D13** Los links "¿Qué es Nucleus?" (`guia-role-map.ts`) y cualquier deep link a un slide siguen yendo **directo a la historia**, no a la portada.
- **D14** **Tu cuerpo** = la vista de D7–D10 en tono alumno: "‹ Guía", "Tocá un músculo", frente / espalda, "Los que no se ven (están más adentro)". En la hoja, por músculo: **qué hace** en una frase + **tres grupos** en vez de cinco roles: *Trabaja fuerte en* (motor + sinergista) · *Te sostiene en* (estabilizador) · *Se estira en*; cada uno con su (i). **Sin** antagonista, **sin** códigos de ruta, **sin** banderas de derivación: al pie, "¿Te molesta o te duele acá? Avisale a tu profe".
- **D15** Tocar un ejercicio → **ficha corta**: qué es, cuerpo pintado (trabaja fuerte / te sostiene), dónde se siente, tips, errores comunes, "Si algo te duele, avisale a tu profe".

### App › Entrenar (sketch 021, ganador A2)

- **D16** En Semana, el cuerpo de la 197 (al lado de los chips de bloque) se vuelve tocable, con "Tocá un músculo" debajo.
- **D17** Tocar una zona → la misma hoja de Tu cuerpo con **"Hoy en tu clase"** arriba (estilo oscuro de la card de hoy): por cada bloque de hoy que trabaja la zona, qué hace con esos músculos (trabaja fuerte / te sostiene / se estira) y sus primeros ejercicios; si ninguno: "Hoy tu clase no trabaja esta zona". Abajo, lo de Tu cuerpo + "Ver en Tu cuerpo ›".
- **D18** **Modos que no se mezclan:** sin hoja, el cuerpo muestra las zonas del bloque elegido (como la 197); con la hoja abierta, muestra **solo la zona tocada**, ningún chip queda como elegido y se marcan (borde + punto) **solo los chips de los bloques que trabajan esa zona**; el resto se apaga. Al cerrar, vuelve el bloque elegido.
- **D19** Tocar una zona **no redibuja** la pantalla: la lista de ejercicios del bloque no se recarga. Tocar un chip cambia de bloque y cierra la hoja.
- **D20** Las zonas que pinta Entrenar (y la canasta de Libre de la 197) salen del **modelo nuevo**, no de `muscle-zones.ts`.

## Decisiones tomadas por defecto (Franco: confirmar o corregir)

- **P1 · Todo lo de alumnos detrás de un flag** `ANATOMIA_ALUMNOS_ENABLED = false` en `featureFlags.ts` hasta la validación humana (D5): con el flag apagado, la Guía abre las historias como hoy y el cuerpo de Entrenar no es tocable. El admin sí queda visible para el staff, con "Borrador · sin validar".
- **P2 · Alcance del contenido v1:** los **28 músculos** del sketch (zona + precisión + qué hace) y las relaciones ruta ↔ músculo ↔ rol de las **30 rutas** (tablas S8 y TI-H de la investigación). **Fichas de profe completas para las 30 rutas** destiladas del §2 con sus marcas de evidencia, y la **ficha corta de alumno para las 30**. Lo que la investigación no tenga queda explícito como pendiente, nunca inventado.
- **P3 · Dónde vive el contenido:** archivos tipados en el **API** (fuente única), validados con un esquema en tests, y servidos por endpoints de solo lectura (staff: todo; socio: solo vista alumno, sin banderas ni códigos). La TV, `/weekly` y la canasta consumen una **proyección** ruta → zonas compatible con lo que hoy produce `muscle-zones.ts`. El planner puede elegir otra forma si la justifica.
- **P4 · Fuera de esta fase:** la prueba de dividir `upper-back` (D4, va como spike aparte), la explicación por ejercicio en el control de la TV, y Nacho/siglas sin resolver (⚑N): quedan como pendientes en el contenido.

## Decisiones del orquestador sobre las preguntas abiertas del RESEARCH (2026-10-21, recomendación adoptada en modo autónomo; Franco puede revertir)

- **R1 · Quién ve Admin › Anatomía:** los mismos roles que Planis (`coach`, `admin`, `owner`, `coach_actividad`), espejados en el API (`ANATOMIA_STAFF_ROLES`). Reemplaza la lectura literal de D6 ("staff que ve Entrenamiento"), que hoy dejaría afuera a los profes.
- **R2 · Relaciones:** base = tablas S8/TI-H; en las rutas donde la tabla sola contradice el §2 (BL = PL, DS sin cuádriceps, HS sin deltoides, MN/RP sin abdomen, HR sin oblicuos, etc.) se completa desde la tabla articular de la ruta en el §2. Toda diferencia con las zonas pre-200 queda en `diferencias-aprobadas.ts` con su motivo.
- **R3 · Nombres de ruta en Anatomía:** `getRouteLabel` (fuente existente, ya con los nombres D1), no los nombres de los sketches.
- **R4 · `display_name` de HT, NC y QC:** se dejan como están (D1 no los nombra).
- **R5 · Gestos (FL, NC, TTB…):** texto dentro de la ficha en v1; el modelo por gesto queda como pendiente explícito.

## Fuera de alcance

- PLYO, CARDIO, KL (D2). Rutas nuevas.
- Editor de contenido para profes (D3). Tablas de contenido en MySQL.
- Cambios a la geometría del dibujo (POC upper-back = spike aparte).
- Explicación por ejercicio en el control de la TV.
- Mostrar a alumnos contenido no validado (P1).

## Restricciones técnicas

- **Migraciones:** la última en staging es `0286`; `0284` está reservada para la 196 → la 200 usa **`0287` en adelante** (nombres D1 en `routes.display_name`, 5 SISSY SQ OL → SS). SQL a mano, **sin `;` en comentarios**, runner propio (`pnpm db:migrate`), nunca `drizzle-kit migrate`. Datos de prod por migración.
- **Coherencia (tests obligatorios, corren en CI):** todo `code` de ruta del contenido existe en `routes`; toda zona existe en `anatomia.json`; ningún músculo con zona inexistente; las 30 rutas tienen relaciones; la proyección ruta → zonas cubre lo que hoy cubre `muscle-zones.ts` (o documenta cada diferencia como corrección intencional, p. ej. BL ≠ PL, SS con cuádriceps, gemelos en las rutas de piernas: §1.7.2); el endpoint de alumno no expone banderas, antagonista ni códigos.
- **Endpoints nuevos:** entrada en `test/tenant-manifest.ts` + `ENTRADAS_BASELINE`, y los gates de tenancy de ruta nueva (ver referencia `reference_gates_tenancy_ruta_job_nueva` de la memoria y `197-CONTEXT.md`). Contenido igual para todos los tenants, pero el acceso sigue el auth normal.
- **Código:** front con `createLogger()`, nunca `console.*`; sin `any`, `catch (err: unknown)`; composables con `cleanup()` y sin `onUnmounted`; stores Pinia setup; **sin dependencias nuevas**; sin CDN (fuentes por `@fontsource`); `git add` explícito; prohibido `git stash` en worktrees.
- **Figura:** reusar `BodyFigure.vue` / `anatomia.ts` (app) y `tv/recorrido` (admin); nada de geometría nueva. Respetar el presupuesto de la TV (incidentes `f655466c` / `750e11f58`) si se toca su proyección.
- **Sin línea base de typecheck ni `pnpm install` en el worktree** (igual que la 197): verificación local = revisión del diff, worktree limpio y greps; CI valida el resto. CI no typechequea app ni admin: correr `vue-tsc` de los archivos tocados si está disponible sin instalar.

## Lecciones de fases anteriores (para los ejecutores)

- Comandos en primer plano. Prohibido `run_in_background` y los loops de espera con `pgrep`.
- No commitear docs en el checkout principal. Todo va en el worktree `et-200-anatomia`.
- Si un fix toca solo tests, también hay que tocar código de producción del mismo componente (paths-filter del deploy).
- Los investigadores citan bien pero **erran la mecánica de palancas** (boca arriba vs boca abajo): al destilar las fichas, respetar el texto **corregido** del §2 y el Apéndice B, no reinterpretar.
- Franco corrige mirando la app real: respetar los sketches ganadores al píxel razonable, con estados extremos (zona con 1 músculo, músculo sin rutas, ruta sin ficha completa, día sin plani, bloque sin ruta como Initium).
- Zona horaria de la sede, nunca UTC.
