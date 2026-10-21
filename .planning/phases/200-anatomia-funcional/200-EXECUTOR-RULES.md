# Fase 200 — Reglas para el ejecutor (gsd-executor, model sonnet)

Este archivo es INPUT de todos los planes 200-NN. Leerlo entero antes de la primera tarea. Ante una duda de
producto mandan, en este orden: `200-CONTEXT.md` (D1–D20, P1–P4, R1–R5) → los README de los sketches ganadores →
la investigación `.planning/research/anatomia-profes-2026-10-21.md`. Ante una duda técnica manda `200-RESEARCH.md`.

## Entorno

- Worktree: `/home/franco/projects/et-200-anatomia`, rama `feat/200-anatomia` (base `origin/staging` `99152a195`).
  Trabajar SOLO acá, con rutas absolutas en cada comando (el cwd se resetea entre llamadas).
- El checkout principal `/home/franco/projects/el-templo` es de SOLO LECTURA: de ahí se leen por ruta absoluta los
  sketches `.planning/sketches/019-anatomia-profes-admin/`, `020-guia-anatomia-app/`, `021-entrenar-cuerpo-tap/`.
  No se copian a la rama. NUNCA commitear en el checkout principal (ni docs, ni nada).
- **No hay `node_modules` en el worktree y NO se instalan.** PROHIBIDO `pnpm install`, `pnpm add`, `npm i`,
  `pnpm update`, symlinks a los `node_modules` del checkout principal y todo lo que dependa de ellos (`pnpm test`,
  `pnpm exec vitest`, `tsc`, `vue-tsc`, `pnpm lint`, `pnpm lint:tenant`, `quasar build`). Si un plan parece
  necesitarlos, PARAR y reportarlo en el SUMMARY.
- Sin dependencias nuevas. Sin CDN. Sin bump de versión (`version.txt`, `package.json` quedan como están).
- Sin env vars nuevas (el flag del app es una constante de código).

## Cómo se verifica cada plan (no hay typecheck ni tests locales)

- Los tests se ESCRIBEN (en `el-templo-api/test/`) y corren en **CI**. El `<verify>` de cada tarea es estático:
  `grep`, `cmp`, `test -f`, `python3 -I -c` sobre el texto de los archivos, y revisión del diff
  (`git diff --stat`, `git diff <archivo>`).
- **Chequeo de carga de los archivos de contenido** (los únicos TS que se pueden ejecutar acá): todo archivo bajo
  `el-templo-api/src/modules/anatomy/content/` y `el-templo-api/src/modules/anatomy/types.ts` tiene SOLO imports
  `import type` (nada de imports de valor, nada de `enum`/`namespace`), así Node los carga con
  `node --experimental-strip-types -e 'Promise.all(process.argv.slice(1).map((p) => import(p))).then(() => console.log("OK"))' /home/franco/projects/et-200-anatomia/el-templo-api/src/modules/anatomy/content/<archivo>.ts`.
  Si imprime `OK`, la sintaxis es válida (el aviso `MODULE_TYPELESS_PACKAGE_JSON` por stderr es inofensivo).
  **Regla de Node en el worktree:** el texto del programa de `-e` es FIJO (sin variables de shell como `$PWD` o `$f`
  adentro: el guard del worktree rechaza "un programa calculado en runtime") y los archivos van como argumentos con
  ruta absoluta literal, leídos con `process.argv.slice(1)`. Excepción: `content/rutas/index.ts` (importa las 30 rutas por valor; no se
  carga con Node, se revisa a ojo y con grep).
- **Chequeo de tipos del contenido** (única excepción a la prohibición de `tsc`): el binario del checkout principal, de
  solo lectura, sobre archivos del worktree con rutas absolutas y flags explícitos (sin tsconfig del repo):
  `/home/franco/projects/el-templo/el-templo-api/node_modules/.bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --skipLibCheck /home/franco/projects/et-200-anatomia/el-templo-api/src/modules/anatomy/types.ts /home/franco/projects/et-200-anatomia/el-templo-api/src/modules/anatomy/content/*.ts /home/franco/projects/et-200-anatomia/el-templo-api/src/modules/anatomy/content/rutas/*.ts`
  (antes de que exista `content/rutas/`, sin el último glob). Funciona porque `types.ts` y `content/**` solo tienen imports
  relativos. Nada de `tsc` sobre el resto del API ni sobre app/admin (eso lo hace CI / el orquestador).
- Para cálculos sobre el contenido (proyección, diferencias, conteos) se puede escribir un script `.mjs` en el
  **scratchpad de la sesión** (nunca en el repo) que importe cada archivo `.ts` de contenido por ruta absoluta con
  `node --experimental-strip-types`. El script no se commitea; su salida va resumida en el SUMMARY.
- Comandos SOLO en primer plano. PROHIBIDO `run_in_background`, `&`, `nohup`, loops de espera con `sleep`/`pgrep`/`ps`.
  Si alguna vez se corre un test (no debería), en primer plano y con timeout amplio.
- Greps de higiene en todo archivo tocado (tienen que NO imprimir nada):
  - `grep -nE "console\.(log|warn|error|info|debug)" <archivos>` (front: `createLogger()`; API: `request.log`/`fastify.log`).
  - `grep -nE ":\s*any\b|<any>|as any\b" <archivos>` (sin `any`; `catch (err: unknown)` + `instanceof Error`).
  - `grep -n "v-html" <archivos .vue>` (el contenido se pinta SOLO con interpolación `{{ }}`).
  - En `.vue`/`.scss` nuevos o tocados: `grep -nE "^\s*color:\s*rgba\(" <archivos>` (texto en color sólido).
- `grep -c` cuenta comentarios: si un gate cuenta tokens, filtrar comentarios antes
  (`grep -vE "^\s*(//|\*|/\*|<!--)" archivo | grep -c token`). Nunca un gate `== 0` sobre un archivo sin filtrar.
- Al cerrar cada plan: `git -C /home/franco/projects/et-200-anatomia status --porcelain` tiene que salir VACÍO.
- Si el guard del worktree rechaza un `<verify>` por "demasiado complejo" (cadenas largas con `git`, sustituciones
  `$(...)`), correr sus partes como comandos separados con el MISMO contenido y rutas absolutas (`git -C
  /home/franco/projects/et-200-anatomia ...`). Nunca saltear un chequeo: si una parte no se puede correr, decirlo en el
  SUMMARY.

## Código

- API: Fastify + Drizzle. Logs con `request.log` / `fastify.log` (Pino). El módulo nuevo es
  `el-templo-api/src/modules/anatomy/`. Contenido = archivos `.ts` tipados (D3/P3), sin tablas nuevas.
  Si una query toca una tabla gym-owned (`exercises`): `tenantWhere(tabla, ctx)` de `src/modules/shared/tenant.ts`
  con `ctx` de `attachCountryScope(request, fastify.db)` + `assertTenant(request.scope, "<etiqueta>")`.
- Front (Quasar + Vue 3.5 + Pinia setup stores): `createLogger()` de `src/utils/logger.ts`; composables exponen
  `cleanup()` y NO usan `onUnmounted` adentro; stores Pinia con `defineStore('x', () => {...})`.
- Formato a mano (en el worktree el pre-commit NO corre, nadie formatea por vos):
  - API (Prettier por defecto): punto y coma, comillas dobles, ancho 80, comas finales.
  - App (`el-templo-app/.prettierrc.json`): SIN punto y coma, comillas simples, ancho 100.
  - Admin (`el-templo-admin/.prettierrc.json`): CON punto y coma, comillas simples, ancho 100, `trailingComma: es5`.
  - Imitar el archivo vecino.
- Copy en español rioplatense con voseo y tildes. Comentarios en español citando la decisión
  (`// Fase 200 D8: ...`).
- Tokens visuales: SOLO los de `src/css/_premium-card.scss` y `src/css/_brand.scss` (app) y los existentes del admin
  (`src/css/`). Los colores por rol de la figura salen del sketch 019 `base.css` (M `#96593a`, S `#c27c54`,
  Est `#e3b892`, Al `#f4ead9` con borde punteado terracota); el plan que los introduce los declara como tokens una
  sola vez. Hitbox ≥ 44 px en todo lo tocable. Animaciones dentro de `@media (prefers-reduced-motion: no-preference)`.
- Nada de geometría nueva: la figura sale de `el-templo-admin/src/tv/recorrido/anatomia.json` (admin, vía
  `cargarAnatomia()`) y de `el-templo-app/src/components/anatomy/anatomia.json` (app, vía `loadAnatomy()`). Copias
  byte a byte (`cmp`). No tocar `el-templo-admin/src/tv/recorrido/figuras.ts` ni `index.ts` (presupuesto de la TV).
- Hojas desde abajo: `q-dialog seamless position="bottom"` (sin backdrop: el chip y otra zona siguen tocables, D19).

## Reglas de CONTENIDO (planes 200-01..05 y 200-17..22)

1. **Nunca inventar.** Todo texto de una ficha sale del texto **corregido** del §2 de la investigación (y del
   Apéndice B cuando una corrección cambia el sentido). No reinterpretar la mecánica de palancas: boca arriba
   (FL, dragon flag, reverse planche) sostienen flexores de cadera + abdomen; boca abajo (BL, PL) glúteo/isquios/
   erectores (BS5). Si el §2 no dice algo, la sección queda como `Pendiente` (`quien: "fuente"`), nunca rellenada.
2. **Marcas de evidencia**: cada afirmación es `{ t: "texto", c: [marcas] }`. Las marcas se copian de la frase
   fuente: número de cita (`4`, `18`…), `"L1"`–`"L5"`, `"C"`, `"M"`, `"R"`, y `"H"`/`"N"` donde la investigación
   pone ⚑H/⚑N. Nunca pegar `[4]` dentro del texto. Si la frase fuente no trae marca, usar la que la sección declara
   para todo su contenido (p. ej. S3.1: "Todo lo siguiente es anatomía [L1] + coaching [L3] + extrapolación de
   [4][21]") o la de la celda/tabla de donde sale; si tampoco hay, `c: []` (válido en fases y descripciones). Una marca
   NUNCA se inventa (tampoco `"C"`).
3. **⚑H y ⚑N**: todo punto marcado ⚑H (kinesiólogo humano, lista §6.3) o ⚑N (Nacho, §5.4) en la sección de la ruta
   va a `fichaProfe.pendientes` como `{ pendiente: "<qué falta>", quien: "H" | "N" }`.
4. **Banderas**: el texto visible al profe es la SEÑAL observable y la ACCIÓN (§3.1). Rótulos clínicos (cauda equina,
   rabdomiólisis, epifisiólisis, escafoides, nombres de pruebas) van SOLO en `notaInterna` del catálogo, que no sale
   del API (decisión del planner, T21 de §6.6). Las banderas propias de la ruta (bloque 6 del §2) van en
   `fichaProfe.banderasRuta`; los bloques consolidados de §3.2 van por id en `fichaProfe.banderas`.
5. **Ficha de alumno** (D15): tono alumno, voseo, frases cortas, SIN códigos de ruta, SIN latín, SIN "antagonista",
   SIN banderas ni diagnósticos. Se arma con lo mismo de la ficha de profe (no hay otra fuente): `que` = qué es el
   ejercicio en una frase; `siente` = bloque 4 "dónde se siente" en palabras llanas; `tips` = 2–3 cues del bloque 5;
   `errores` = 2–3 compensaciones del bloque 4 con su consecuencia. Molde exacto: `RUTA_ALUMNO` de
   `/home/franco/projects/el-templo/.planning/sketches/020-guia-anatomia-app/alumno.js`.
6. **Relaciones** (R2): por ruta, `relaciones.{motor,sinergista,estabilizador,antagonista,estira}` con los ids de
   los 28 músculos. Fuente: la tabla "Análisis articular" del §2 de la ruta (manda) unida con las tablas S8 (l.982)
   y TI-H (l.1611). Cada relación lleva las marcas de la celda fuente. Un músculo aparece UNA vez por ruta (el rol más
   alto si el §2 le da dos: motor > sinergista > estabilizador > antagonista > estira; el otro rol se menciona en la
   ficha). Los planes de fichas (17–22) NO tocan `relaciones` (el verify lo exige): si encuentran un error contra el
   §2, lo anotan en el SUMMARY con la cita y el orquestador decide un plan de corrección (que actualiza relaciones,
   `diferencias-aprobadas.ts` y las expectativas de tests juntos).
7. **Equivalencias de músculos** (las relaciones solo usan estos 28 ids; lo demás va en el texto de la ficha):

   | En la investigación | id |
   |---|---|
   | Dorsal ancho | `dorsal` |
   | Redondo mayor | `redondo` |
   | Romboides, trapecio medio | `romboides` |
   | Trapecio inferior | `trap-inf` |
   | Trapecio superior / descendente | `trap-sup` |
   | Pectoral mayor (esternal o clavicular) | `pectoral` |
   | Deltoides anterior | `delt-ant` |
   | Deltoides posterior | `delt-post` |
   | Tríceps (cualquier cabeza) | `triceps` |
   | Bíceps braquial | `biceps` |
   | Braquial, braquiorradial | `braquial` |
   | Flexores de muñeca y dedos (agarre) | `antebrazo` |
   | Serrato anterior | `serrato` |
   | Manguito (infraespinoso, redondo menor, subescapular, supraespinoso) | `manguito` |
   | Recto abdominal | `recto-abd` |
   | Oblicuo externo / interno | `oblicuos` |
   | Erectores espinales, multífidos | `erectores` |
   | Cuadrado lumbar | `cuadrado` |
   | Glúteo mayor | `gluteo-mayor` |
   | Glúteo medio / menor | `gluteo-medio` |
   | Vastos (cuádriceps) | `vastos` |
   | Recto femoral | `recto-fem` |
   | Iliopsoas, psoas, ilíaco, flexores de cadera | `psoas` |
   | Isquiotibiales (BF, ST, SM) | `isquios` |
   | Aductores, aductor mayor | `aductores` |
   | Gastrocnemio / gemelo | `gemelo` |
   | Sóleo | `soleo` |
   | Tibial anterior | `tibial` |

   Sin id (NO van en relaciones, sí en el texto): pectoral menor, coracobraquial, deltoides medio, TFL, transverso
   del abdomen, rotadores de cadera, extensores de muñeca.
8. **Nombres de ruta**: siempre `getRouteLabel(code)` (R3), nunca los nombres del sketch. HT/NC/QC sin cambio (R4).
9. **Gestos** (R5): texto en `fichaProfe.gestos` (p. ej. FL: dragon flag, elbow victorian, boat, hangs). No hay modelo
   por gesto en v1.
10. Todo nace `estado: "borrador"` (D5). Nada se marca validado.

### Dónde está cada ruta en la investigación (`.planning/research/anatomia-profes-2026-10-21.md`)

| Ruta | Sección (línea aprox.) | Complementos |
|---|---|---|
| FL | S3.1 (l.540) | S2.1 hangs (l.420), S6.1 boat/dragon flag (l.899) |
| FLR | S3.2 (l.579) | S3.1 |
| MN/RP | S3.3 (l.602) | |
| OAR | S3.4 (l.630) | |
| MU | S2.2 (l.447) | |
| OAP | S2.3 (l.482) | |
| TTB | S2.4 (l.506) | S6.1 (l.899) |
| BL | S4.1 (l.658) | |
| HD/ID | S4.2 (l.684) | §1.4 siglas (⚑N) |
| OAPU | S4.3 (l.715) | |
| PL | S4.4 (l.743) | |
| PLPU | S4.5 (l.778) | |
| HS | S5.1 (l.806) | |
| HSPU | S5.2 (l.841) | |
| PHS | S5.3 (l.865) | |
| HR | S6.2 (l.921) + S6.3 (l.946) | |
| L | A1 (l.1076) | |
| PS | A2 (l.1108) | B-PSS (l.1327) |
| QC | A3 (l.1144) | B-PSS |
| SS | A4 (l.1169) | |
| SU | A5 (l.1192) | B-PSS |
| DS | B-DS (l.1220) | |
| HT | B-HT (l.1241) | |
| NC | B-NC (l.1271, B-NC-1..4) | |
| SPAGAT | C1 (l.1348) | C0 (l.1337) |
| BRIDGE | C2 (l.1379) | C0 |
| SIDE PCK | C3 (l.1411) | C0 |
| PIKE | C4 (l.1433) | C0 |
| REVERSE HYPER | C5 (l.1455) | |
| AF | TI-D (l.1474, D1 + D2) | sin tabla articular por ruta: más `Pendiente` |

Bases comunes: BS1–BS6 (l.362), BI1–BI6 (l.1015). Debilidades: S7 (l.970), TI-I (l.1638). Inventario por ruta
(tipo, brazo, n): §1.3 (l.121). Siglas: §1.4 (l.195). Correcciones de la TV: §1.7.2 (l.302). Banderas: §3.1
(l.1657), §3.2 (l.1722). Nacho: §5.4 (l.2113). Kinesiólogo humano: §6.3 (l.2180). Citas: Apéndice A (l.2251).
Correcciones: Apéndice B (l.2491). Los números de línea son de esta rama; usar el título de la sección como ancla.

## Migraciones (plan 200-10)

- SQL a mano en `el-templo-api/src/db/migrations/NNNN_nombre.sql`. Esta fase NO cambia schema: solo datos.
- Numeración: **0287 y 0288**. La 0284 queda libre para la 196. Antes de crear, refrescar las refs remotas con
  `git -C /home/franco/projects/et-200-anatomia fetch origin` (primer plano) y chequear:
  `ls /home/franco/projects/et-200-anatomia/el-templo-api/src/db/migrations/*.sql | sort | tail -3` y
  `git -C /home/franco/projects/et-200-anatomia ls-tree --name-only <ref> el-templo-api/src/db/migrations/ | sort | tail -3`
  para `origin/master`, `origin/staging`, `feat/196-personalizados` y `feat/201-conquer` (si la ref no existe,
  saltearla). Si 0287/0288 ya existen en alguna, PARAR y reportar (no renumerar por cuenta propia).
- NUNCA `;` dentro de un comentario `--`. NUNCA `drizzle-kit push/migrate`, `pnpm db:push`, `pnpm db:generate`,
  `pnpm db:migrate`. WHERE por código o nombre + `tenant_id = 1`, NUNCA por id (los ids de local y prod difieren).
  Idempotentes. Staging y prod comparten host: la migración va a correr contra prod.

## Tests del API (se escriben, corren en CI)

- La tabla `routes` NO sirve como fuente en tests (la vacían `cleanAllTestData` y otras suites): la fuente estática de
  rutas es `ROUTE_PROGRESSION_MAP` (`src/modules/exercises/route-progression-map.ts`) y `ROUTE_LABELS`.
- Archivos del front se leen por path relativo desde el test (precedente
  `test/communications/destinations-sync.test.ts`): `path.resolve(__dirname, "../../../el-templo-app/...")`.
- Usuarios con las fábricas de `test/helpers.ts`; NUNCA ids de `users` hardcodeados.
- Queries directas de test a tablas strict llevan `tenantWhere(tabla, TEMPLO_CTX)`.
- Ruta HTTP nueva: entrada en `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` (+1 por ruta) y el título del `it`
  que dice el número, en `test/tenancy/iso-01-manifiesto.test.ts`.
- Los tests de proyección/zonas comparan contra las funciones de `anatomy/projection.ts` cuando prueban cableado, y
  contra valores literales solo en el test de paridad y en invariantes nombradas (SS con cuádriceps, NC con gemelos).

## Git

- `git add` SIEMPRE por ruta explícita. PROHIBIDO `git add -A`, `git add .`, `git commit -a`, `git stash`.
- Un commit por tarea: `feat(200-NN): ...`, `test(200-NN): ...`, `refactor(200-NN): ...`, `fix(200-NN): ...`,
  `content(200-NN): ...` para fichas. Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (o el que
  indique el orquestador).
- NO commitear docs fuera de `.planning/phases/200-anatomia-funcional/` (nada de STATE.md, ROADMAP.md, memorias). El
  SUMMARY del plan sí va en el phase dir.
- NUNCA `git push`, nunca SSH, nunca tocar `master`/`staging`.
- Si un commit falla por un hook, NO usar `--no-verify` ni tocar `core.hooksPath`: parar y reportarlo.
- Si un fix toca SOLO tests, en el mismo push tiene que ir también un cambio de código de producción del mismo
  componente (el `paths-filter` del deploy no dispara con solo tests). Avisarlo en el SUMMARY para el orquestador.

## Lecciones heredadas (200-CONTEXT "Lecciones")

- Comandos en primer plano. Prohibido `run_in_background` y loops de espera con `pgrep` (se matchean a sí mismos).
- No commitear docs en el checkout principal. Todo va en el worktree `et-200-anatomia`.
- Los investigadores citan bien pero **erran la mecánica de palancas**: respetar el texto corregido del §2 y el
  Apéndice B, no reinterpretar.
- Franco corrige mirando la app real: respetar los sketches ganadores al píxel razonable, con estados extremos (zona
  con 1 músculo, músculo sin rutas, ruta con secciones pendientes, día sin plani, bloque sin ruta como Initium,
  nombres largos, 360/390/412 px).
- Zona horaria de la sede, nunca UTC.
- Pitfalls de la investigación técnica (200-RESEARCH §Common Pitfalls) que más muerden: `grupoDeZona` tira con una
  zona sin grupo (tibialis → piernas, Pitfall 2); hoja modal en Entrenar se come el toque del chip (Pitfall 7);
  deep links a la Guía (Pitfall 6: la ruta `guia` sigue siendo las historias); numeración de migraciones (Pitfall 10);
  CI no typechequea app ni admin (Pitfall 11).

## Lecciones acumuladas de la fase

(El orquestador agrega acá, entre planes, las trampas que encontraron los ejecutores anteriores. Leerlas.)
