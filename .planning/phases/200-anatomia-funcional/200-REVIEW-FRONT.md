---
phase: 200-anatomia-funcional
reviewed: 2026-10-22T01:35:39Z
depth: deep
scope: front (admin + app), diff 99152a195..HEAD
files_reviewed: 34
files_reviewed_list:
  - el-templo-admin/src/components/anatomy/AnatomyFigure.vue
  - el-templo-admin/src/components/anatomy/AnatomySheet.vue
  - el-templo-admin/src/components/anatomy/GlosarioRoles.vue
  - el-templo-admin/src/components/anatomy/MarcaEvidencia.vue
  - el-templo-admin/src/components/anatomy/MusculoRoles.vue
  - el-templo-admin/src/components/anatomy/RutaFicha.vue
  - el-templo-admin/src/components/anatomy/ZonaPanel.vue
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/constants/route-labels.ts
  - el-templo-admin/src/css/_anatomia.scss
  - el-templo-admin/src/pages/AnatomiaPage.vue
  - el-templo-admin/src/router/routes.ts
  - el-templo-admin/src/stores/useAnatomyStore.ts
  - el-templo-admin/src/tv/poll.ts
  - el-templo-admin/src/types/anatomy.ts
  - el-templo-app/src/components/anatomy/BodyFigure.vue
  - el-templo-app/src/components/anatomy/__tests__/zones.test.ts
  - el-templo-app/src/components/anatomy/zones.ts
  - el-templo-app/src/config/featureFlags.ts
  - el-templo-app/src/constants/route-labels.ts
  - el-templo-app/src/css/_brand.scss
  - el-templo-app/src/layouts/MainLayout.vue
  - el-templo-app/src/modules/anatomy/components/AnatomySheet.vue
  - el-templo-app/src/modules/anatomy/components/ZonaAlumno.vue
  - el-templo-app/src/modules/anatomy/pages/GuiaHomePage.vue
  - el-templo-app/src/modules/anatomy/pages/TuCuerpoFichaPage.vue
  - el-templo-app/src/modules/anatomy/pages/TuCuerpoPage.vue
  - el-templo-app/src/modules/anatomy/stores/anatomyStore.ts
  - el-templo-app/src/modules/anatomy/types.ts
  - el-templo-app/src/modules/training/components/semana/BlockChipStack.vue
  - el-templo-app/src/modules/training/components/semana/HoyEnTuClase.vue
  - el-templo-app/src/modules/training/components/semana/SemanaTab.vue
  - el-templo-app/src/modules/training/routes.ts
  - el-templo-app/src/modules/training/types/session.ts
findings:
  critical: 1
  warning: 6
  info: 11
  total: 18
status: issues_found
---

# Fase 200: revisión de código del front (admin + app)

**Revisado:** 2026-10-22T01:35:39Z
**Profundidad:** deep (cruzando con `el-templo-api/src/modules/anatomy/{serializers,types,zone-hits,routes}.ts`, `content/*` y `sessions/session-response.ts`)
**Archivos revisados:** 34
**Estado:** issues_found

## Resumen

Esta revisión reemplaza al `vue-tsc`, que no está disponible. Con el flag `ANATOMIA_ALUMNOS_ENABLED = false` el front de la fase está bien armado. En lo que pediste revisar primero no aparecieron errores de tipos que `vue-tsc` fuera a marcar. En cambio hay **un bug de runtime que rompe Tu cuerpo** (BLOCKER) y varios problemas reales de contenido y navegación.

**Lo que se verificó y está bien** (para que no haga falta revisarlo de nuevo):

- **Tipos espejo contra los serializadores.** `el-templo-admin/src/types/anatomy.ts` coincide campo por campo con `VistaProfe`, `RutaProfe`, `MusculoProfe`, `RegionVista`, `BanderaProfe` y `FichaProfeVista` (`Omit<FichaProfe,'escalones'> & {escalones: string[] | Pendiente}`), y con `GlosarioRol`, `GlosarioEntrada`, `CitaDef` y `leyenda`. `el-templo-app/src/modules/anatomy/types.ts` coincide con `VistaAlumno`, `MusculoAlumno`, `RutaAlumno` y `FichaCortaAlumno`. `HitsZona` coincide con `zone-hits.ts`: `MusculoId[]` se asigna a `string[]` y `movilidad?: true` / `sinDetalle?: true` son iguales. `Block.zoneHits?: Partial<Record<ZoneSlug, HitsZona>>` es compatible con `Partial<Record<ZonaSlug, HitsZona>>`, y `ZoneSlug` (16) es igual a `REGIONES` (eso sí lo cubre `test/anatomy/sync-front.test.ts`).
- **TypeScript en los templates.** Hay narrowing correcto en `v-if` / `v-else-if` / `v-else`: `ruta.fichaCorta.que`, `ficha.evidencia`, `ficha.gestos` y `ficha.pendientes` caen dentro de la rama `v-else-if="secciones"` que sigue a `v-if="!ficha"`. `resolver<T>(s: Seccion<T>)` infiere bien. El narrowing de `history.state` (`unknown` → `typeof object` → `'back' in st` → `typeof st.back === 'string'`) es válido con TS 5.9. Las firmas de emits y handlers coinciden (`select-zone: [ZoneSlug, ViewKey]` contra `onSelectZone(slug, vista)`), lo mismo que los `v-model:full` y los `v-bind="hoyProps"` dentro de `v-if`. El `tsconfig` no tiene `noUncheckedIndexedAccess`.
- **Imports.** Todos existen: `src/constants/sceneVeil` (`NOCHE_GRADIENT`, `sceneBackgroundStyle`), `src/utils/extract-error`, `TemploLoader.vue`, `ROLE_LABELS`, `blockDisplayName`, `cargarAnatomia` / `Anatomia` / `GrupoAnatomico` del admin y los alias `components/*` y `stores/*`.
- **SCSS.** Todas las variables `$…` y los `@include` usados en los `.vue` nuevos existen en `src/css/*.scss`.
- **Reglas del proyecto.** No hay `console.*`, `any`, `v-html` ni `onUnmounted` nuevos. Los `catch` son `(err: unknown)`. Los stores son Pinia setup. No se tocaron `package.json` (cero dependencias nuevas).
- **P1, flag apagado.** La tab Guía va a `/training/guia`. Las rutas `guia-inicio`, `tu-cuerpo` y `tu-cuerpo-ficha` no se registran. Las únicas llamadas a esas rutas por nombre están detrás de `tocable`, que exige el flag. `BodyFigure` recibe `interactive=false`, `dim=false` y `selected=null`. `BlockChipStack` recibe `hits=[]` y `dimOthers=false`. El watch de precarga no llama a `cargar()`, así que no hay requests a `/api/anatomy`. Excepción: IN-01.
- **D18 y D19 en Semana.** Con zona tocada: `selected=-1`, `lit=[zona]`, `lit2=[]`, `dim=true`, y los hits salen solo de `b.zoneHits?.[zona]`. `activeBlock` y `BlockExercisesCard` no dependen de `touchedZone`, así que la lista no se recarga. Tocar un chip cierra la hoja. La hoja es `seamless`: en Quasar la raíz `.q-dialog` es `no-pointer-events` y solo la card recibe toques.

---

## BLOCKER

### BL-01: Tu cuerpo: al girar Frente/Espalda la figura queda invisible

**Archivos:**
- `el-templo-app/src/components/anatomy/BodyFigure.vue:126-134` (`views` filtra por `side`)
- `el-templo-app/src/components/anatomy/BodyFigure.vue:208-251` (`measure`, `refit`, `onMounted` y el único `watch`, que es sobre `gender`)
- `el-templo-app/src/modules/anatomy/pages/TuCuerpoPage.vue:39-47` y `137-139` (`:side="vistaActual"`, `girar()`)

**Problema:** la fase 200 agregó la prop `side`. Con `side='front'|'back'` solo se monta **un** `<svg>`. `measure()` corre una sola vez, en `onMounted` después de `loadAnatomy()` (y cuando cambia `gender`), y solo mide los svgs montados en ese momento. Al tocar "Espalda" en Tu cuerpo se monta el svg de la otra vista con `viewBoxes[key] === undefined`. `svgStyle()` lo deja en `visibility: hidden` (líneas 189-197) y nada lo vuelve a medir: **la figura desaparece y la pantalla queda inútil.** Pasa en cualquier orden: con `?zona=` de espalda se mide la espalda y lo que se rompe es volver a "Frente". El admin tuvo el mismo problema y lo resolvió (`AnatomyFigure.vue:192-198`, `watch(() => props.view, ajustar)`); el app no.

Hasta ahora no lo vio nadie porque el flag está apagado y no hubo UAT en teléfono. Es la interacción central de D7/D14 ("frente / espalda").

**Arreglo:** medir las vistas que falten cuando cambia `side`, sin borrar las que ya están medidas (la geometría no cambia):

```ts
// BodyFigure.vue
function measure() {
  for (const key of ['front', 'back'] as const) {
    if (viewBoxes.value[key] !== undefined) continue   // ya medida: la geometría no cambia
    const svg = svgs[key]
    // ...igual que hoy
  }
}

async function refit() {           // solo para cambio de género (otra geometría)
  viewBoxes.value = { front: undefined, back: undefined }
  await nextTick()
  measure()
}

// Fase 200: al girar se monta el svg de la otra vista; hay que medirlo.
watch(
  () => props.side,
  async () => {
    if (!anatomy.value) return
    await nextTick()
    measure()
  },
)
```

Antes de cerrar el UAT, probar en el teléfono: Tu cuerpo → Espalda → Frente, y volver desde una ficha con `?zona=gluteal`.

---

## WARNING

### WR-01: Un rol más débil le gana al más fuerte en zonas con vista `both` (HSPU pinta mal el trapecio)

**Archivos:**
- `el-templo-admin/src/components/anatomy/RutaFicha.vue:398-404` (`rolesFigura`) y `AnatomyFigure.vue:118-120` (`rolDe`: "la específica gana")
- `el-templo-app/src/modules/anatomy/pages/TuCuerpoFichaPage.vue:128-135` (`roles`) y `BodyFigure.vue:144-146` (`roleOf`)
- Causa de fondo en el API: `serializers.ts` `zonasFichaDe` y `zonasAlumnoDe` deduplican por `slug|vista`, y `both` es una vista distinta de `back`

**Problema:** el front arma claves `slug` cuando la vista es `both` y `slug@front|back` cuando es una sola. En la figura, la clave con vista **siempre** le gana a la clave sola, sin mirar la prioridad del rol. `trapezius` tiene `trap-sup` (vista `both`) y `trap-inf` (vista `back`). En **HSPU**, `trap-sup` es motor y `trap-inf` estabilizador. Resultado: en la vista de espalda la ficha del admin pinta el trapecio como **estabilizador** y la del alumno como **"te sostiene"**, cuando el motor `trap-sup` también se ve de espalda. Contradice el comentario de `zonasFichaDe` ("el rol de MAYOR prioridad entre los músculos que la comparten"). Hoy afecta a toda ruta en la que `trap-sup` tenga un rol más alto que `trap-inf` (como mínimo HSPU).

**Arreglo:** preferentemente en el API, expandiendo `both` a `front` y `back` antes de combinar con `mejorRol` / fuerte>sostiene, para que el payload ya llegue resuelto. Otra opción es resolverlo en el front con prioridad:

```ts
// admin RutaFicha.vue (en el app es igual, con 'fuerte' > 'sostiene')
const PRIORIDAD: Record<Rol, number> = { motor: 0, sinergista: 1, estabilizador: 2, antagonista: 3, estira: 4 };
const rolesFigura = computed<Record<string, Rol>>(() => {
  const out: Record<string, Rol> = {};
  const poner = (k: string, rol: Rol) => {
    const actual = out[k];
    if (!actual || PRIORIDAD[rol] < PRIORIDAD[actual]) out[k] = rol;
  };
  for (const z of props.ruta.zonasFicha) {
    const vistas = z.vista === 'both' ? (['front', 'back'] as const) : [z.vista];
    for (const v of vistas) poner(`${z.slug}@${v}`, z.rol);
  }
  return out;
});
```

Sumar un caso a `test/anatomy/serializers.test.ts`: HSPU, trapezius de espalda = motor.

### WR-02: Admin en el celular: al abrir un link o recargar con `?zona=…&ruta=…`, la hoja queda encima de la ficha

**Archivo:** `el-templo-admin/src/pages/AnatomiaPage.vue:101-135`

**Problema:** el estado vive en la URL a propósito, así que recargar o compartir con la ficha abierta es un caso normal. Cuando llega la vista, en el mismo render pasa esto:
1. La ficha (`q-dialog maximized`, ya montada) recibe `model-value=true` y se muestra durante el patch: crea su portal primero.
2. La hoja (`v-if="esMovil && anatomyStore.vista"`) se monta en ese mismo render, pero `QDialog` la muestra recién en `onMounted` (post-flush): su portal se agrega **después** al `<body>`.

Las dos tienen el mismo z-index, así que la hoja seamless (52vh) tapa la mitad de abajo de la ficha. En el flujo normal (hoja abierta → tocar ruta) el orden es el correcto; el problema es solo la carga en frío.

**Arreglo:** no mostrar la hoja mientras la ficha está abierta (al cerrarse la ficha la hoja vuelve sola, porque la zona sigue en la URL):

```vue
<AnatomySheet
  v-if="esMovil && anatomyStore.vista"
  :model-value="hojaAbierta && !fichaAbierta"
  @update:model-value="(v) => { if (!v && !fichaAbierta) cerrarPanel() }"
  v-model:full="hojaEntera"
  :reset-key="claveUltima"
>
```

Otra opción es una clase con z-index mayor en el `q-dialog` de la ficha.

### WR-03: Los tipos espejo no tienen ningún guard (sin `vue-tsc` y sin test)

**Archivos:** `el-templo-admin/src/types/anatomy.ts:1-193`, `el-templo-app/src/modules/anatomy/types.ts:1-90`

**Problema:** los dos archivos dicen "Espejo A PROPÓSITO… cambiar los dos juntos", pero `sync-front.test.ts` solo verifica `ROUTE_LABELS`, `ZoneSlug` y `ZONE_GROUPS`. CI no typechequea app ni admin. Hoy coinciden (verificado a mano en esta revisión), pero el primer cambio a `RutaProfe`, `FichaCortaAlumno` o `HitsZona` en el API va a romper el front en silencio: un `undefined` en runtime, sin error de build.

**Arreglo:** un test barato en `el-templo-api/test/anatomy/sync-front.test.ts` que lea los dos `.ts` espejo como texto y verifique que cada clave de primer nivel del payload real (`Object.keys(vistaAlumno())`, `Object.keys(vistaAlumno().rutas[0])`, `Object.keys(vistaProfe(new Map()).rutas[0])`, `Object.keys(...fichaProfe)`, campos de `HitsZona`) aparezca como propiedad en la interfaz espejo correspondiente (regex por bloque `interface X { ... }`). Así queda el mismo patrón que ya usan las etiquetas.

### WR-04: Tu cuerpo no se puede usar con teclado ni con lector de pantalla

**Archivos:** `el-templo-app/src/components/anatomy/BodyFigure.vue:8-33` (svg `aria-hidden`, `<g @click>` sin foco), `el-templo-app/src/modules/anatomy/pages/TuCuerpoPage.vue:38-63`

**Problema:** en Tu cuerpo la única forma de abrir una zona visible es tocar un `<g>` del SVG, que está `aria-hidden` y no recibe foco. Solo los músculos profundos son botones. El admin resolvió lo mismo con una lista accesible de zonas (`AnatomiaPage.vue:47-60`, "Equivalente accesible del cuerpo"); el app no tiene nada parecido. Con TalkBack o VoiceOver, Tu cuerpo es una pantalla vacía. Lo mismo vale para el cuerpo tocable de Semana, aunque ahí la hoja es un extra.

**Arreglo:** copiar el patrón del admin en TuCuerpoPage: una `<nav class="sr-only-focusable">` con un `<button>` por `store.vista.regiones` filtradas por `vistaActual`, que llame a `onSelectZone(r.slug, r.vista === 'both' ? vistaActual : r.vista)`.

### WR-05: En Android, el botón atrás no cierra la hoja: se va de la pantalla (no sigue la convención `useBackButtonClose`)

**Archivos:** `el-templo-app/src/modules/anatomy/components/AnatomySheet.vue:129-220`, usada en `TuCuerpoPage.vue:67-75` y `SemanaTab.vue:73-113`. La convención del proyecto está en `el-templo-app/src/composables/useBackButtonClose.ts`.

**Problema:** el propio repo documenta (fase 199, L40, en `useBackButtonClose.ts:9-13`) que en este app el `QDialog` **no** engancha el botón atrás en Capacitor, porque no se usa `Platform.is.cordova`. Por eso cada hoja registra `App.addListener('backButton')` mientras está abierta (`SponsorSheet.vue:114`, `MemberCard.vue:58`, `ProgramSheet.vue:66`). `AnatomySheet` no lo hace. Con la hoja abierta en Tu cuerpo, el back de Android lleva a la pantalla anterior (la selección se guardó con `router.replace`) en vez de cerrar la hoja. En Semana, sale de Entrenar. En celular es lo primero que se prueba.

**Arreglo** (sin dependencias nuevas; `@capacitor/app` ya está):

```ts
// el-templo-app/src/modules/anatomy/components/AnatomySheet.vue
import { onBeforeUnmount } from 'vue'   // componente, no composable: está permitido
import { useBackButtonClose } from 'src/composables/useBackButtonClose'

const backClose = useBackButtonClose(cerrar)
watch(
  () => props.modelValue,
  (abierta) => {
    if (abierta) void backClose.attach()
    else backClose.cleanup()
  },
  { immediate: true },
)
onBeforeUnmount(() => backClose.cleanup())
```

Agregarlo a la lista de UAT del teléfono.

### WR-06: La lógica nueva del front no tiene ningún test

**Archivos:** `SemanaTab.vue` (máquina de modos D18/D19), `BodyFigure.vue` (`side`, `roles`, `selected`), `anatomyStore.ts` (dedupe `enCurso`), `TuCuerpoPage.vue` (`aplicarQuery`), `MainLayout.vue` (`isTabActive` con `match`)

**Problema:** el único test de front que se tocó es `zones.test.ts`. CLAUDE.md pide "Well-tested code is non-negotiable". BL-01 y WR-01 son justo el tipo de regresión que un test de componente o de función pura agarra (WR-01 con una función `rolesPorClave(zonas)` testeable). Aunque hoy CI no corra los tests del app, estos tests documentan los contratos D18/D19 para la UAT y la próxima fase.

**Arreglo:** como mínimo, sacar a funciones puras y testear con vitest: `hitIndices(blocks, zona)`, `rolesFigura(zonas)` (con el caso HSPU), `isTabActive(tab, path)` y el dedupe de `cargar()` (dos llamadas → un solo `api.get`, error → reintenta). Para BL-01, un test de montaje con `getBBox` mockeado que verifique que, después de cambiar `side`, el svg nuevo tiene `viewBox`.

---

## INFO

### IN-01: Con el flag apagado, P1 no es 100% "igual que antes"

**Archivos:** `el-templo-app/src/components/anatomy/zones.ts:27,47,61-69`

`tibialis` pasó de `NON_MUSCLE_SLUGS` a zona de `piernas`. Con el flag apagado, Semana pinta la canilla como músculo sin trabajar, o encendida si el API la manda en `zones`. Está anotado en ORQUESTADOR-NOTAS (200-14). Además, en la tab Libre (hoy oculta por `ENTRENAR_TABS_ENABLED`) tocar la canilla ahora selecciona "Piernas". Hay que confirmarlo con Franco en la UAT.

### IN-02: El primer músculo de la hoja de Entrenar lleva borde arriba

**Archivo:** `el-templo-app/src/modules/anatomy/components/ZonaAlumno.vue:186-193`

`.zona-alumno__mus:first-of-type` pierde el efecto porque el slot `antes` mete `HoyEnTuClase`, cuya raíz es un `<section>`, y ese pasa a ser el primero de su tipo. Usar `.zona-alumno__mus + .zona-alumno__mus { border-top }` en lugar de `:first-of-type`.

### IN-03: La medición de la tab bar está duplicada y no es reactiva

**Archivos:** `SemanaTab.vue:271-275`, `TuCuerpoPage.vue:123-127`

Es el mismo código en los dos lados (DRY). En TuCuerpoPage además está dentro de un `computed` que lee el DOM, así que no se recalcula si el footer cambia de alto. Pasarlo a `src/utils/tab-bar.ts` (`medirTabBar(screenWidth)`) y llamarlo al abrir la hoja, como hace Semana.

### IN-04: "‹ Guía" en Tu cuerpo apila historial

**Archivo:** `el-templo-app/src/modules/anatomy/pages/TuCuerpoPage.vue:129-131`

`router.push({ name: 'guia-inicio' })` genera la secuencia portada → Tu cuerpo → portada → … en el historial. Usar el mismo `hayPantallaAnterior() ? router.back() : push` de la ficha.

### IN-05: La URL de Tu cuerpo no guarda la vista

**Archivo:** `TuCuerpoPage.vue:152-158, 188-198`

Si se toca una zona `both` (tríceps, trapecio, antebrazo) en la espalda y se vuelve desde la ficha, `aplicarQuery` gira a "Frente". El admin guarda `?vista=`; hacer lo mismo.

### IN-06: La ficha de alumno dice "‹ Tu cuerpo" aunque se haya abierto desde Entrenar

**Archivo:** `TuCuerpoFichaPage.vue:4-7, 156-159`

`router.back()` vuelve a Entrenar, pero el botón dice "Tu cuerpo". Es una decisión documentada (SUMMARY 15, "etiqueta fija"); conviene confirmarla en la UAT.

### IN-07: El dedupe del store del admin es más débil que el del app

**Archivo:** `el-templo-admin/src/stores/useAnatomyStore.ts:18-21`

Si hay una carga en curso, `cargar()` devuelve enseguida y quien hace `await` ve `vista === null`. Hoy no se nota, porque solo lo llama `AnatomiaPage` y el template muestra `loading` primero. Copiar el patrón `enCurso` del app (`anatomyStore.ts:24-77`).

### IN-08: Bloques dentro de `<button>` en la portada

**Archivo:** `el-templo-app/src/modules/anatomy/pages/GuiaHomePage.vue:25-28`

`BodyFigure` renderiza `<div>`, `<figure>` y `<figcaption>` dentro de un `<button>`, cuyo contenido tiene que ser *phrasing*. Los navegadores lo toleran (y el `aria-hidden` del wrapper evita que se lea "Frente"), pero es HTML inválido. Si se quiere corregir, pasar la card a `<div role="button" tabindex="0">` o poner la figura como fondo absoluto fuera del botón.

### IN-09: Marcas de evidencia: claves repetidas y presentación inconsistente

**Archivos:** `el-templo-admin/src/components/anatomy/MarcaEvidencia.vue:4-6`, `MusculoRoles.vue:51-53, 155-158`

`:key="m.etiqueta"` duplica clave si una afirmación repite una marca (`[4, 4]`); usar `${i}-${m.etiqueta}`. La `nota` del músculo muestra las marcas como texto plano ("· L1 · 4") en vez de usar `<MarcaEvidencia>` con tooltip, como pide D11 para el resto de las afirmaciones.

### IN-10: Regex con caracteres combinantes literales

**Archivo:** `el-templo-admin/src/components/anatomy/ZonaPanel.vue:92`

`/[̀-ͯ]/g` funciona, pero no se lee y es fácil de romper con un formateador o un copy-paste. Escribirlo como `/[̀-ͯ]/g`.

### IN-11: Detalles menores con el flag prendido

- `SemanaTab.vue:117-123`: importa `AnatomySheet`, `ZonaAlumno` y `useAnatomyStore` de forma estática aun con el flag apagado. Es peso muerto en el chunk de Entrenar; se puede pasar a `defineAsyncComponent` o dejarlo, es chico.
- `HoyEnTuClase.vue:63` / `SemanaTab.vue:250-258`: un payload de `/weekly` cacheado de antes del deploy no trae `zoneHits`, así que la hoja diría "Hoy tu clase no trabaja esta zona" aunque la trabaje. Se corrige solo con el refetch; aceptable, pero conviene saberlo para la UAT.

---

_Revisado: 2026-10-22T01:35:39Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidad: deep_

---

## Arreglos aplicados

Alcance: BL-01, WR-01 a WR-05. WR-06 y los INFO quedan sin tocar. Sin tests corridos ni typecheck (el worktree no tiene `node_modules`); verificación por lectura. Los cambios de WR-01 y WR-03 en el API quedan para CI.

| ID    | Commit      | Qué se hizo |
| ----- | ----------- | ----------- |
| BL-01 | `b5dc47969` | `BodyFigure.vue`: `measure()` salta las vistas ya medidas y un `watch` sobre `side` mide el svg que se monta al girar. Sin `side` (default `both`) nada cambia. |
| WR-01 | `3bdf77dc5` | Causa de fondo en `serializers.ts`: `zonasFichaDe` y `zonasAlumnoDe` expanden `both` a `front` y `back` antes de combinar (rol de mayor prioridad / fuerte > sostiene), así que el payload ya no trae `both`. Tests nuevos en `serializers.test.ts` (HSPU trapecio = motor/fuerte en espalda y frente; ninguna zona `both`; rol máximo por zona y vista en todas las rutas). `RutaFicha.vue` (admin) y `TuCuerpoFichaPage.vue` (app) arman siempre `slug@vista` (y abren un `both` residual en las dos vistas). |
| WR-02 | `0a015e7fc` | `AnatomiaPage.vue`: `hojaModel` es `hojaAbierta && !fichaAbierta` y no cierra el panel si la ficha está abierta. |
| WR-03 | `5877354e9` | `sync-front.test.ts`: lee `types/anatomy.ts` (admin) y `modules/anatomy/types.ts` (app) como texto y verifica, por interfaz, que las claves del payload real estén declaradas y que no haya claves requeridas de más; `HitsZona` del app contra la del API. |
| WR-04 | `91b11eb2e` | `TuCuerpoPage.vue`: `<nav aria-label="Zonas del cuerpo">` con un botón por región de la vista actual (visible al enfocar), igual al patrón del admin. |
| WR-05 | `d69ccaeaf` | `AnatomySheet.vue`: `useBackButtonClose(cerrar)` con `attach()` al abrir, `cleanup()` al cerrar y en `onUnmounted`, como `MemberCard` y `SponsorSheet`. |

Para el UAT del teléfono: Tu cuerpo → Espalda → Frente, volver desde una ficha con `?zona=gluteal`, y el botón atrás de Android con la hoja abierta (Tu cuerpo y Semana).
