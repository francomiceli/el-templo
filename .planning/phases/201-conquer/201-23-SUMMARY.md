---
phase: 201-conquer
plan: 23
subsystem: admin
tags: [conquer, admin, catalogo, escaleras, plantillas, ajustes, publicacion]
requires: ["201-22"]
provides:
  - "tabs Catalogo (?tab=catalogo) y Ajustes (?tab=ajustes) en ConquerPage"
  - "ConquerCatalog (sub-tabs Escaleras, Ejercicios, Plantillas), ConquerLadderEditor, ConquerExerciseEditor, ConquerTemplateDays, ConquerSettings"
  - "FichaMember.publishEnabled / publishNoFace (API y admin)"
affects: []
key-files:
  created:
    - el-templo-admin/src/components/conquer/ConquerCatalog.vue
    - el-templo-admin/src/components/conquer/ConquerLadderEditor.vue
    - el-templo-admin/src/components/conquer/ConquerExerciseEditor.vue
    - el-templo-admin/src/components/conquer/ConquerTemplateDays.vue
    - el-templo-admin/src/components/conquer/ConquerSettings.vue
  modified:
    - el-templo-admin/src/pages/ConquerPage.vue
    - el-templo-admin/src/components/conquer/ConquerAlertActions.vue
    - el-templo-admin/src/components/conquer/ConquerEvolution.vue
    - el-templo-admin/src/pages/ConquerAlumnoPage.vue
    - el-templo-admin/src/types/conquer.ts
    - el-templo-api/src/modules/conquer/ficha-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/test/conquer/ficha.test.ts
    - el-templo-api/test/conquer/_helpers.ts
decisions:
  - "Cada editor reemplaza su copia del catalogo con la respuesta del API (escalera, ejercicio o dia); si una mutacion falla se relee el catalogo entero sin spinner (T-201-72)."
  - "Las banderas de publicacion viajan por props desde la ficha: ConquerEvolution ya no llama a getGallery."
metrics:
  tasks: 3 (+ fix del orquestador)
  commits: 4
---

# Phase 201 Plan 23: Catalogo y ajustes de Conquer en el admin Summary

Owner y admin editan sin deploy lo que es propuesta de Nacho: las escaleras (orden, nombre, brazos rectos, por lado, activo, alta), la tabla de arranque y las zonas de cada ejercicio, las plantillas de 4, 3 y 2 dias, el arranque de Novillo y Ternero y las semanas de la regla de combos. Ademas, la ficha trae las banderas de publicacion y la Evolucion deja de depender de la galeria.

## Commits

- `b70709042` fix(201-23) banderas de publicacion en la ficha de Conquer (A19) (encargo del orquestador, antes de las tareas)
- `15dc49ab8` feat(201-23) editor de escaleras de Conquer en el admin (§8.1, D-04)
- `093d1b11f` feat(201-23) arranque, zonas y plantillas de Conquer editables (D-14, D-20)
- `5af5035c2` feat(201-23) ajustes de Conquer en el admin (D-14)

(Los hashes estan en `git log --oneline` de `feat/201-conquer`.)

## Que quedo

- **Fix de banderas (API + admin).** `FichaResponse.member` suma `publishEnabled` y `publishNoFace` (`ficha-service.ts` desde la fila que ya carga `requireActiveMember`, y entradas en `fichaResponseSchema`). Test nuevo en `ficha.test.ts` (default `false`; el alumno activa el permiso por `PUT /api/members/conquer/publish-permission` y la ficha lo refleja). `ConquerEvolution` recibe `publishEnabled`/`publishNoFace` por props desde `ConquerAlumnoPage`, se borraron `loadFlags` y el `ref flags`, y las banderas se muestran siempre (ya no dependen de que el alumno tenga controles con contenido).
- **Catalogo** (`ConquerCatalog`): banner D-20 ("se validan en la prueba"), sub-tabs Escaleras / Ejercicios / Plantillas, `q-expansion-item` por escalera y por ejercicio.
- **Escaleras** (`ConquerLadderEditor`, escrito de cero): peldanos por `position` (0 = el mas dificil arriba), flechas arriba/abajo de 44 px que mandan el orden COMPLETO (tambien los desactivados) a `reorderRungs`, nombre inline (se confirma con blur o Enter), checkboxes "Brazos rectos (fallo tecnico)" y "Por lado (unilateral)", toggle Activo, chips "En uso" y "Desactivado", alta "Nuevo peldano (mas facil)". Una sola mutacion a la vez; spinner por fila; el error del API (`CONQUER_PELDANO_EN_ARRANQUE`, `CONQUER_ESCALERA_VACIA`, 409) se muestra en un Notify y el catalogo se relee.
- **Ejercicios** (`ConquerExerciseEditor`): nombre, 4 filas de arranque (Α E1, Β E2, Γ E3, Ω Hold final) con select de peldano (activos de su escalera, mas el actual aunque este desactivado) y de modo (el hold queda fijo en hold), zonas como chips principal/secundario con quitar y selector para agregar, nota "Novillo arranca 1 peldano mas facil y Ternero 2 (se cambia en Ajustes)" y chips "A validar". Guarda el ejercicio entero y reemplaza el estado con la vista devuelta.
- **Plantillas** (`ConquerTemplateDays`): grupos de 4, 3 y 2 dias; por dia nombre, finisher y 3 selects de ejercicio; cada dia se guarda aparte y el error (`CONQUER_EJERCICIO_REPETIDO`, etc.) se ve tal cual debajo del dia ademas del Notify.
- **Ajustes** (`ConquerSettings`): tres campos numericos con los rangos que manda el API (Novillo 0-4, Ternero 0-4, combos 1-8), la aclaracion de que el arranque se aplica a las altas nuevas, banner D-20; manda solo las claves que cambiaron.
- **ConquerPage**: tabs Tablero, Pedidos, Galeria, Catalogo y Ajustes (`?tab=`). El gate es la ruta `conquer` con `allowedRoles` (T-201-73) y el API.
- **Link pendiente de 201-22**: la alerta de tope de escalera ahora muestra el texto "Extendé la escalera desde Catálogo" y el boton "Ir al Catalogo" (`{ name: 'conquer', query: { tab: 'catalogo' } }`).

## Gates corridos

- Pre-flight `node_modules`: OK.
- API: `npx tsc --noEmit` OK, `pnpm lint:tenant` `DISCREPANCIAS: 0`, `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` vacio. Vitest NO se corrio (regla de la fase); el test nuevo corre en CI. El manifiesto de rutas no cambia (sigue en 515: no hay rutas nuevas).
- Admin: `pnpm lint` 0 errores (8 warnings preexistentes ajenos) tras cada tarea; `vue-tsc --noEmit` filtrado por `components/conquer|ConquerPage|ConquerAlumnoPage|ConquerAlertActions|types/conquer` vacio (el baseline sigue trayendo ~60 lineas de errores ajenos); `prettier --check` OK en todo lo tocado; higiene (`console.*`, `any`, `color="info|primary"`, Google Fonts) sin hallazgos.
- Los tres `verify` del plan: sus greps pasan (con el desvio de abajo sobre `LadderBuilder`).

## Mutation testing

Sin logica pura nueva en el admin (los componentes son formularios sobre el API; no hay runner en el admin). La unica logica testeable es el fix del API, con mutantes razonados (aplicados, `tsc` compila, revertidos con `git checkout --`, `git status` limpio):

1. `ficha-service.ts` con `publishEnabled: false` fijo: falla `ficha.test.ts:164` (`despues.member.publishEnabled` esperado `true`).
2. `schemas.ts` sin `publishNoFace` en `fichaResponseSchema` (el serializador la borra): fallan `ficha.test.ts:153` y `:165` (`toBe(false)` / `toBe(true)` reciben `undefined`).
3. Mutante descartado por inocuo: sacar `publishEnabled` de `required` del schema no cambia la respuesta (el servicio siempre lo manda); es defensa, no comportamiento.

## Desvios del plan

- **Fix previo del orquestador** (`fix(201-23)`): el encargo de las banderas se hizo primero, en un commit propio que toca API + admin juntos (el tipo `FichaMember` y la prop de `ConquerEvolution` tenian que viajar con el cambio del contrato para que HEAD compile).
- **`LadderBuilder`**: el verify del plan rechaza esa palabra en `ConquerLadderEditor.vue`; el comentario de cabecera dice "no se copia el editor de escaleras de la 196" sin nombrarlo.
- **Archivos extra** (no estaban en `files_modified`): `ConquerAlertActions.vue` (link al Catalogo, pedido por 201-22), `ConquerEvolution.vue`, `ConquerAlumnoPage.vue`, `types/conquer.ts` y los del API (encargo del orquestador).
- Los componentes de catalogo reciben `reloadToken` (patron de 201-21/22) en vez de `changed` con el catalogo entero: el API devuelve la escalera/ejercicio/dia, no el catalogo, asi que cada editor emite lo que recibio y `ConquerCatalog` reemplaza esa pieza.

Ambiguedades nuevas (opcion mas simple):

- Mover un peldano intercambia con el vecino inmediato aunque sea un peldano desactivado (el orden siempre es el de TODOS los peldanos).
- El alta de peldano manda `brazosRectos: false` y `unilateral: false` (el API los pide); se marcan despues en la fila.
- Los modos de E1-E3 ofrecen completa / negativa / hold (lo que el API acepta); el hold final queda fijo.
- No se ofrece editar activar/desactivar escaleras ni ejercicios (el API no tiene esas rutas).
- Un campo numerico vacio o decimal en Ajustes se frena en la UI con un Notify, sin llamar al API.

## Trampas / notas para los planes siguientes

- `q-input type="number"` con `v-model.number` devuelve `''` al vaciarse: validar antes de mandar.
- `drafts[id]!` en el template de `ConquerTemplateDays` pasa lint y vue-tsc; si algun dia se endurece la regla, usar un componente por dia.
- `ConquerExerciseEditor` y `ConquerTemplateDays` se reinician cuando cambia la identidad del objeto (`watch` sobre la prop): si un padre reemplaza todo el catalogo tras un error, se pierde lo editado (es el comportamiento buscado para volver a lo guardado).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 5 componentes nuevos existen; los 4 commits estan en `git log`; `git status --porcelain` vacio tras el commit del SUMMARY.
