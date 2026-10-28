---
phase: 201-conquer
plan: 22
subsystem: admin
tags: [conquer, admin, ficha, recortes, paso-de-nivel, evolucion, galeria, fotos-privadas]
requires: ["201-21"]
provides:
  - "ruta /conquer/alumno/:userId (name conquer-alumno, CONQUER_MANAGER_ROLES) -> ConquerAlumnoPage"
  - "ConquerMemberHeader, ConquerProgressTable, ConquerAlertActions, ConquerCutDialog, ConquerLevelUpDialog, ConquerEvolution, ConquerGallery, ConquerPhoto"
  - "tab Galeria en ConquerPage (?tab=galeria)"
  - "utils/conquer-format.ts: alertActionKind, ALERT_HINTS, markText, diffText, measureText, weeksText, checkHasContent, posesWithPhotos, galleryPose, ESTADO_LABELS, MODE_LABELS, POSE_LABELS, SEVERITY_CHIP_COLOR"
affects: [201-23]
key-files:
  created:
    - el-templo-admin/src/pages/ConquerAlumnoPage.vue
    - el-templo-admin/src/components/conquer/ConquerMemberHeader.vue
    - el-templo-admin/src/components/conquer/ConquerProgressTable.vue
    - el-templo-admin/src/components/conquer/ConquerAlertActions.vue
    - el-templo-admin/src/components/conquer/ConquerCutDialog.vue
    - el-templo-admin/src/components/conquer/ConquerLevelUpDialog.vue
    - el-templo-admin/src/components/conquer/ConquerEvolution.vue
    - el-templo-admin/src/components/conquer/ConquerGallery.vue
    - el-templo-admin/src/components/conquer/ConquerPhoto.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/pages/ConquerPage.vue
    - el-templo-admin/src/components/conquer/ConquerBoard.vue
    - el-templo-admin/src/utils/conquer-format.ts
decisions:
  - "Cada accion del coach (changeStep, applyCut, levelUp) reemplaza la ficha con la respuesta del API; updateMember y vista/resuelta (que no devuelven ficha) hacen que la pagina relea getFicha."
  - "Las fotos las pide un componente unico (ConquerPhoto): URL en un ref local, un reintento si la imagen falla, nada en store ni en log."
  - "La logica de decision (que boton corresponde a cada alerta, que controles tienen contenido, que pose mostrar) vive en funciones puras de conquer-format.ts."
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 22: Ficha del alumno y galeria de Conquer en el admin Summary

El coach abre la ficha desde el tablero y resuelve por excepcion: corrige progresiones, incremento, nivel y dias, acepta el recorte propuesto (o elige el escalon a bajar), confirma el paso de nivel con los dias del nivel nuevo, deshace la ultima etapa y mira la Evolucion del alumno; la tab Galeria muestra el antes y despues de todos, filtrable por autorizados.

## Commits

- `5934bc3da` feat(201-22): ficha del alumno Conquer con progreso editable (§7.2)
- `e56cfd902` feat(201-22): recortes y paso de nivel desde la ficha (S12-6, §5.1, §2.2)
- `082e16af9` feat(201-22): evolución del alumno y galería antes/después (§6)

## Que quedo

- **Ficha** (`ConquerAlumnoPage`): `getFicha` + `getCatalog` en paralelo. 404/409 -> Notify con el `error` del API y vuelta al tablero; otro error -> banner con "Reintentar". Orden: acciones de alertas, encabezado editable, tabs Progreso / Evolucion (la Evolucion se monta recien al abrir su tab).
- **Encabezado**: nombre, nivel, dias, etapa de recorte, fecha de activacion. Formulario de nivel (LEVEL_DAYS filtra los dias, al cambiar de nivel los dias pasan al primero valido), incremento reps 1-3 y segundos 1-6. Manda solo lo que cambio (nivel y dias siempre juntos, el API valida la combinacion).
- **Tabla de progreso**: KPIs (sesiones, acierto, delta promedio), "listo para subir", y por dia/ejercicio/escalon: select de peldaño (activos de la escalera del ejercicio + el actual aunque este desactivado, del mas dificil al mas facil), select de modo (el hold no lo tiene y manda `hold`), ultima marca, proximo objetivo y estado. 390 px: cada escalon es un bloque apilado.
- **Alertas**: `alertActionKind(kind, cutProposal.kind, hayNivelSiguiente)` decide el boton: molestia/caida -> "Aceptar: {label}" (etapa) o "Bajar un escalon" (dialogo); tope -> texto de Catalogo + "Marcar resuelta"; paso de nivel -> "Confirmar {nivel}" (dialogo de dias); derivadas -> solo el texto de §5. Vista/Resuelta si tienen `id`. "Deshacer la ultima etapa de recorte" con confirmacion cuando `cutStage > 0`.
- **Evolucion**: usa el par `compare` del API (mas viejo con contenido vs mas nuevo); con un solo control muestra el "Dia 0" y sus medidas sin diferencia. Una pose a la vez, fotos solo de la pose visible. Banderas "Autorizó publicar" / "Sin cara".
- **Galeria**: toggle "Solo autorizados" (`getGallery(true | undefined)`), tarjeta con nombre, nivel, semanas entre controles, dia 0 y ultimo (frente, o la primera pose con foto), chips y link a la ficha. Cada tarjeta va dentro de `q-intersection once`: las URLs firmadas se piden solo para las tarjetas que se ven.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `pnpm lint` (admin): 0 errores, 8 warnings preexistentes ajenos (CobrosPage, session-pdf-builder), tras cada tarea.
- `vue-tsc --noEmit -p tsconfig.json` filtrado por `ConquerAlumnoPage|ConquerPage|components/conquer|router/routes|conquer-format`: vacio tras cada tarea.
- `prettier --check` OK en todo lo tocado. Higiene (`console.*`, `any`, `color="info|primary"`, Google Fonts, `localStorage|sessionStorage`, logs con `url`): sin hallazgos.
- Greps de existencia de los verify del plan: pasan, salvo el desvio de abajo (`getMemberPhotoUrl` en `ConquerEvolution.vue`).
- Sin vitest ni tests de API (el admin no tiene runner y el plan no toca el API).

## Mutation testing

La logica pura se verifico con un script en el scratchpad (`node --experimental-strip-types`, no versionado: el admin no tiene runner). Cada mutante se aplico a `conquer-format.ts`, el script fallo y se restauro desde una copia (el archivo estaba sin commitear, por eso no se uso `git checkout`; `cmp` confirmo la restauracion):

1. `alertActionKind` con la rama etapa/bajar_escalon invertida: falla `alertActionKind('molestia','etapa',true)` (devuelve `bajar_escalon`).
2. `alertActionKind` de `paso_nivel` sin chequear `hasNextLevel`: falla `alertActionKind('paso_nivel','etapa',false)` (devuelve `confirmar_nivel`).
3. `markText` sin el singular: falla `markText(1,'reps',false)` ("1 reps").
4. `diffText` sin el caso 0: falla `diffText(0,'cm')` ("-0 cm").
5. `checkHasContent` ignorando las medidas: falla el caso de cintura 80 sin fotos.
6. `checkHasContent` tratando 0 como vacio: falla el caso `weightKg: 0`.
7. `posesWithPhotos` con `every` en vez de `some`: falla (devuelve `[]` en vez de las tres poses).
8. `galleryPose` buscando la pose SIN foto: falla (devuelve `frente` donde esperaba `null`).

Los componentes (dialogos, galeria, evolucion) no tienen logica pura propia mas alla de esas funciones; se cubren con UAT.

## Desvios del plan

- **`ConquerPhoto.vue` (archivo extra)**: la URL firmada la pide un componente compartido por la Evolucion y la Galeria (DRY), por eso `getMemberPhotoUrl` aparece en `ConquerPhoto.vue` y no literalmente en `ConquerEvolution.vue` (el grep `key_links` del plan apunta a Evolution). La garantia es la misma: URL de la pose visible, de a una, solo en un ref local.
- **Banderas de publicacion**: ni la ficha ni `GET .../body-checks` las traen (solo `GalleryItem`). La Evolucion llama una vez a `getGallery()` y busca al alumno; si falla o el alumno no tiene controles con contenido, las banderas no se muestran. Mejor fix (fuera de este plan): sumar `publishEnabled`/`publishNoFace` a `FichaMember` en el API.
- Helpers extra en `conquer-format.ts` (DRY) y `SEVERITY_CHIP_COLOR` movido ahi desde `ConquerBoard.vue` (que ahora lo importa; mismo comportamiento).
- `ConquerPage` comentario de cabecera actualizado (Galeria ya no es "futuro").

Ambiguedades nuevas (opcion mas simple):

- "Chip Sin cara" solo si el alumno tiene `publishEnabled` (sin permiso no hay uso como testimonio que recordar).
- El escalon por defecto del dialogo de recorte es E1 y el ejercicio por defecto es el de la caida (`detail.exerciseId`) o el primero del dia de la molestia (`detail.dayKey`).
- La confirmacion de "Deshacer la ultima etapa" usa `$q.dialog` (plugin ya registrado).
- En la tabla de progreso el hold no muestra "Proximo objetivo" ni estado (el motor no los calcula para el hold; `estado` viene `null`).

## Trampas / notas para 201-23

- Los `q-tab-panel` desmontan el inactivo: `ConquerGallery` y `ConquerEvolution` cargan en `onMounted`. `ConquerPage` ya acepta `?tab=galeria`; para Catalogo/Ajustes sumar el nombre a `TAB_NAMES`.
- Para mostrar un `q-select` que "revierte" tras un 4xx, bindear con `:model-value` + `@update:model-value` (no `v-model`): el estado solo cambia cuando el API devuelve la ficha.
- `conquer-format.ts` ya no es "solo fechas": tiene labels y helpers de ficha/galeria. Reusar antes de redeclarar.
- El texto "Extendé la escalera desde Catálogo" no tiene link: cuando 201-23 cree la tab Catalogo se puede enlazar (`?tab=catalogo`).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 9 archivos nuevos existen, los 4 modificados estan en los diffs de los commits `5934bc3da`, `e56cfd902` y `082e16af9` (presentes en `git log`).
