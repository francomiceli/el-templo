---
phase: 195-web-seo-local-aeo-atribucion
plan: "05"
subsystem: web
tags: [seo, nuxt, disciplinas, planes, profes, person, blog, verifier]
requires: ["195-04"]
provides:
  - "data/disciplinas.ts: calistenia (metodo + 6 niveles), actividades-con-aura y yoga, con findDisciplina y sedesForDisciplina (matching por palabra completa, sin acentos, solo sedes gym)"
  - "data/planes.ts + components/PlanesContent.vue (prop country): modalidades del catalogo SIN precios, CTA 'Consultá precios por WhatsApp'"
  - "data/profes.ts (D-27): profes, publishedProfes, findProfe, DEFAULT_BLOG_AUTHOR_SLUG; personNode/personId/profePath en utils/schema-graph.ts"
  - "components/PrimeraClaseGratisContent.vue (prop country) + pages /disciplinas, /disciplinas/<slug>, /planes, /profes, /profes/<slug>, /primera-clase-gratis"
  - "components/PageShell.vue y composables/usePageSeo.ts: contenedor y head/JSON-LD compartidos por las paginas de contenido"
  - "Blog: Article con autor Person, imagen con fallback, 'Por <autor>' y cover de reserva (card + hero)"
  - "verify-seo-output.mjs: 10 chequeos nuevos (26 en total) y flag --src-data-dir"
affects: [195-06, 195-11, 195-13, 195-14]
tech-stack:
  added: []
  patterns:
    - "Paginas de contenido = PageShell (h1/lead/clases cpage__*) + usePageSeo({ title, description, path, breadcrumb, extraNodes })"
    - "El verificador lee data/disciplinas.ts y data/profes.ts con regex (un objeto por entrada, sin lineas // comentadas) en vez de duplicar slugs"
    - "Contenido de pais = componente con prop country ('AR' | 'ES'), la pagina AR lo usa y 195-06 lo reusa para /es"
key-files:
  created:
    - el-templo-web/data/disciplinas.ts
    - el-templo-web/data/planes.ts
    - el-templo-web/data/profes.ts
    - el-templo-web/components/PageShell.vue
    - el-templo-web/components/PlanesContent.vue
    - el-templo-web/components/PrimeraClaseGratisContent.vue
    - el-templo-web/composables/usePageSeo.ts
    - el-templo-web/pages/disciplinas/index.vue
    - el-templo-web/pages/disciplinas/[slug].vue
    - el-templo-web/pages/planes.vue
    - el-templo-web/pages/profes/index.vue
    - el-templo-web/pages/profes/[slug].vue
    - el-templo-web/pages/primera-clase-gratis.vue
  modified:
    - el-templo-web/data/prerender-routes.ts
    - el-templo-web/data/web-data.fixture.json
    - el-templo-web/utils/schema-graph.ts
    - el-templo-web/components/AppFooter.vue
    - el-templo-web/components/BlogPostCard.vue
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/scripts/verify-seo-output.mjs
decisions:
  - "PageShell + usePageSeo (archivos no listados en el plan) para no repetir 6 veces el mismo head, JSON-LD y CSS (DRY)"
  - "El autor del Article es el Person completo (personNode) embebido en `author`, no una referencia suelta: Google lee name/url del autor; el @id coincide con el de /profes/<slug>"
  - "Los niveles de disciplinas.ts replican el copy de SectionLevels.vue (no se refactorizo SectionLevels: fuera del alcance del plan); queda anotado en el docblock"
  - "Sin 'qué llevar': el plan lo pedia pero el sitio no publica ninguna lista de elementos, y no se inventan datos; la landing explica la sesion con el copy del metodo"
  - "Slugs/profes para el verificador: regex sobre el .ts (lo mas simple); un profe se considera publicado si tiene publicado: true + foto + bio, igual que publishedProfes"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 05: Disciplinas, planes, profes, primera clase y blog Summary

La web publica `/disciplinas` (calistenia con sus 6 niveles, Actividades con Aura, Yoga) con "Dónde se dicta" calculado contra las actividades reales de cada sede, `/planes` sin precios, `/profes` con `Person` desde un archivo de datos editable (Ignacio Bordón), `/primera-clase-gratis` con "Reservá online" por sede, y el blog con autor `Person`, imagen de reserva y tags ocultos cuando no hay; todo protegido por 10 chequeos nuevos del verificador con mutation testing.

## Commits

| Hash | Mensaje |
|------|---------|
| `ae1746408` | feat(195-05): disciplinas y planes sin precios |
| `e3ac7dacf` | feat(195-05): profes (Person) y landing de primera clase gratis |
| `fbe7568a9` | feat(195-05): blog con autor Person y cover de reserva, y chequeos del verificador |

(El cuerpo del commit 3 dice "10 chequeos nuevos y 3 de cobertura del fixture": lo correcto es 10 nuevos en total, de los cuales 2 son de cobertura del fixture. No se amendo el commit.)

## Consultas a la DB local (D-12)

`SELECT DISTINCT name, is_special, special_line FROM activities WHERE is_active = 1` (DB local `eltemplo`):

| name | is_special | special_line |
|------|-----------|--------------|
| Maquinas | 0 | NULL |
| ROM | 0 | NULL |
| Sesion Grupal | 0 | NULL |
| Flexi | 1 | NULL |
| Yoga para calisténicos | 1 | Yoga |
| Yoga regenerativo | 1 | Yoga |

`SELECT name, description FROM subscription_plans WHERE is_active = 1` (resumen; la tabla tiene duplicados con y sin acento y decenas de "Paquete · N sem · M/sem"):

| name | description |
|------|-------------|
| Flex | 2 sesiones de regalo |
| Flex+ | Acceso ROM |
| Foundation | 2 sesiones de regalo |
| Foundation+ | Acceso ROM |
| Performance | Acceso ROM + Eventos exclusivos |
| Sesion de Prueba | Clase de prueba gratuita |
| Clase unica | Clase individual |
| Pack familiar x 2 / x 3 / x 4 | Pack familiar para N miembros |
| Actividades con Aura — Socio / Externo (+ "4 accesos" / "Ilimitado") | NULL |
| Yoga — 2 x semana / Clase suelta / Pack 4 clases (Alumnos y General) / Clase de prueba | NULL (special_line Yoga) |
| Flexi — Clase suelta / 4 clases | NULL |
| 30 Dias Online, Foundation Online, Cero a Atleta, Piernas y Gluteos, Tu Primer Front Lever, Todos los Programas (online) | varias |

Las descripciones de la DB son cortas ("Acceso ROM"): para las tarjetas se usaron las del seed de produccion (`seed-production.ts`: turnos fijos o libres, una sede o todas, ROM, eventos exclusivos), sin los precios, sin "compromiso de 4 meses" ni "ROM los sabados" (datos que pueden haber cambiado).

## Verificacion

Node 20 + capa `--extends` del scratchpad (el `pnpm run generate` literal es falso verde en este entorno). Fixture, sin API local.

| Chequeo | Resultado |
|---------|-----------|
| `pnpm exec nuxi typecheck` | verde |
| `pnpm lint` | 0 errores (2 warnings `v-html` preexistentes) |
| `nuxt generate` | 58 rutas (42 en la base de 195-04: +hub y 3 disciplinas, +planes, +hub y 1 profe, +primera clase, +payloads) |
| `node scripts/verify-seo-output.mjs` | 26/26 OK (16 de 03-04 + 10 nuevos) |
| Generate con mock de la API del blog (2 posts: con y sin cover) + verificador | OK; 26/26 |
| `grep` precios en `planes/index.html` (`\$ ?[0-9]\|ARS\|€\|EUR`) | 0; `wa.me/` presente |
| calistenia contiene Alfa, Delta, Sigma, Omega, Spartan, Olympic | si |
| `profes/ignacio-bordon`: Person con `@id .../profes/ignacio-bordon#person` y `worksFor` = ORG_ID; NO existe `profes/profe-de-ejemplo` | si |
| `primera-clase-gratis`: `register?branchId=<id>` de cada sede AR + `wa.me/` | si (un `branchId` por sede AR de la fixture) |
| Footer del home: los 5 links (`/sedes`, `/disciplinas`, `/primera-clase-gratis`, `/planes`, `/profes`) | si |
| Post sin cover: JSON-LD `image` = `https://eltemplo.org/images/photos/sesion-real.webp`, `<img>` del hero y de la card con la imagen de reserva, SIN `og:image`; post con cover: `og:image` = su cover | si |
| `ogImage` en `blog/[slug].vue` | 1 antes y 1 despues (sin tocar) |
| `prettier --check` en los `.ts`/`.mjs` propios | OK (los 8 archivos que fallan son preexistentes) |
| Borrado `el-templo-web/.data/` y symlink `dist` antes de cada commit | si |

Tags del blog: `pages/blog/index.vue` (`BlogTagBar v-if="tags.length > 0"`), `BlogPostCard.vue`, `BlogRelatedPosts.vue` y el hero de `[slug].vue` ya ocultaban el bloque con lista vacia; `BlogSidebar.vue` no tiene UI de tags. Verificado con el mock: 0 elementos `blog-card__tags` / `blog-tag-bar` / `blog-post__tags`. No hizo falta ningun cambio.

### Chequeos nuevos del verificador (17 a 26 en `CHECKS`)

17. cada disciplina de `data/disciplinas.ts` tiene pagina, el hub existe y calistenia nombra los 6 niveles
18. "Dónde se dicta" lista EXACTAMENTE las sedes gym con una actividad que coincide con algun matcher (o el aviso de WhatsApp si no hay)
19. `planes/index.html` (y `es/planes/` si existe) sin patron de precio en el texto visible (ignora `<style>` y scripts que no sean JSON-LD, decodifica `&euro;`/`&dollar;`) y con `wa.me/`
20. profes: cada publicado tiene 1 `Person` con `@id` y `worksFor` correctos y `name`; los no publicados no tienen pagina; el autor por defecto del blog esta publicado; no hay paginas de profes huerfanas
21. `primera-clase-gratis`: existe, `app.eltemplo.org/register`, `register?branchId=<id>` de cada sede AR, `wa.me/`
22. sitemap con disciplinas, `/planes`, `/profes`, profes publicados y primera clase
23. las paginas nuevas llevan 1 `Organization` (@id fijo) y 1 `BreadcrumbList`
24. cada post del blog tiene 1 `Article` con `author["@id"]` = el del autor por defecto e `image` absoluta
25. fixture: hay una sede cuyo parecido con un matcher es solo una subcadena (Moreno + "Aromaterapia")
26. fixture: hay una sede que solo matchea por quitar acentos (Alberti sin ROM) y un espacio de comunidad con actividad que matchea (filtro `kind gym`)

Para sumar otro chequeo (195-06): al final de `CHECKS`. Helpers nuevos: `parseDisciplinas()` -> `[{ slug, matchers }]`, `parseProfes()` -> `{ published, unpublished, defaultAuthor }`, `nameMatches`, `normalizeText`, `stripNonLdScripts`. Flag de test `--src-data-dir=<carpeta con disciplinas.ts y profes.ts>`.

### Mutation testing (hecho, honesto)

**Sobre copias de `.output/public`, `web-data.json` y los `.ts` fuente (60 mutantes, harness `mut05/out-mutants.py`, 60/60 como se esperaba):**
- disciplinas: sin pagina / sin hub / sin nivel Olympic / sede de menos / sede de mas / otra sede en yoga / sin aviso de WhatsApp / lista una sede sin actividad / sin seccion; fuente con disciplina sin pagina, con matcher que no coincide y con matcher que coincide de mas.
- planes: `$ 80000`, `$80.000`, `ARS`, `€`, `EUR`, `&euro;`, sin `wa.me`, precio en JSON-LD, sin pagina.
- profes: sin pagina, `@id` mal, sin `worksFor`, `worksFor` mal, sin Person, dos Person, sin `name`, pagina de un no publicado, sin hub; fuente con autor por defecto no publicado, ejemplo publicado con foto (sin pagina), Ignacio sin bio.
- primera clase: sin pagina / sin registro / sin una sede / sin wa.me. Sitemap: 6 rutas faltantes (una por una). `Organization` ausente / duplicada / con otro id, `BreadcrumbList` ausente. Blog: autor Organization, sin autor, otro `@id`, dos Article, sin Article, sin image, image relativa. Fixture: sin Aromaterapia, Alberti con ROM, parque sin actividad que matchee.
- **Equivalentes que sobreviven, y deben (3):** `$5 ARS` dentro de un `<script>`/`<style>` que no es JSON-LD; texto "VARSOVIA PARSE $s" (sin digito ni palabra completa); ejemplo `publicado: true` pero sin foto (sigue sin publicarse por regla de `publishedProfes`).

**Sobre el codigo fuente + regenerar (14 mutantes, harness `mut05/src-mutants.py`):** matching sin quitar acentos, por subcadena y sin filtro `kind gym`; `personNode` con `worksFor` mal; `publishedProfes` sin filtro (publica el ejemplo); precio `$ 80000` en `planes.ts`; "Reservá online" sin `branchId`; disciplina que lista solo la primera sede; `usePageSeo` sin `Organization`; `breadcrumbNode` con otro `@type`; blog con autor Organization; blog sin imagen de reserva en el JSON-LD. **12 de 14 mueren.**
- **Sobreviven (equivalentes, por `crawlLinks` de nitro):** quitar `/planes` o `/profes/<slug>` de `prerenderRoutes`: el footer y el hub ya los enlazan, el crawler los genera igual. Por eso el verificador testea existencia y no la lista de rutas.
- Primera pasada con 3 supervivientes reales (matching por palabra completa, acentos y filtro `kind gym` no estaban fijados por el fixture): se corrigio sumando casos al fixture y los chequeos 25 y 26; con eso mueren los tres.

Los harness estan en el scratchpad `mut05/` (sin commitear): `blog-gen.mjs` levanta un mock HTTP del blog y corre `nuxt generate` en un solo proceso foreground.

## Deltas de gates de tenancy

Ninguno (solo web: sin tabla, ruta ni job de la API).

## Deviations from Plan

### Auto-fixed / agregado

**1. [Rule 2 - Critical] `PageShell`, `usePageSeo` y chequeos de cobertura del fixture**
- Seis paginas con el mismo head/JSON-LD/CSS habrian repetido ~60 lineas cada una (DRY, CLAUDE.md): `components/PageShell.vue` (CSS `cpage__*` sin scoped a proposito) y `composables/usePageSeo.ts`.
- El mutation testing mostro 3 comportamientos no fijados por el fixture: se agrego "Aromaterapia" a Moreno (y se quito ROM de Alberti, y el espacio de comunidad paso a "Sesión grupal al aire libre") + chequeos 25-26. Es dato solo del fixture (CI/dev; el prebuild avisa "NO publicar este build").
- **Commits:** `ae1746408`, `fbe7568a9`

**2. [Rule 1 - Bug] Escapes unicode convertidos en caracteres literales**
- `data/disciplinas.ts` y el verificador tenian `/[̀-ͯ]/` como caracteres combinantes literales (invisibles y fragiles); se restituyeron los escapes.
- **Commit:** `fbe7568a9` (en `ae1746408` el archivo quedo con los literales)

**3. Sin "qué llevar" en la landing de primera clase** — el plan lo pide pero el sitio no publica ninguna lista; se redacto "Cómo es la sesión" con el copy del metodo ya publicado. Si Franco quiere "qué llevar", lo agrega en `PrimeraClaseGratisContent.vue`.

**4. Footer:** ademas de los 5 links, el item deshabilitado "Ignacio Bordón" (`/ignacio-bordon`) paso a `/profes/ignacio-bordon` habilitado y se agrego "Profes" en Empresa; "Disciplinas", "Planes" y "Primera clase gratis" van en la columna Entrená.

**5. Menores:** `usePageSeo` fija `og:type` `website` (`profile` en la ficha de un profe); la foto de reserva (4:5) se recorta a 21:9 en el hero del post (`.blog-post__cover--fallback`); `BlogSidebar.vue` y `pages/blog/index.vue` no necesitaron cambios; el literal `/images/photos/sesion-real.webp` queda en 2 lugares (card y post) porque el plan pide que `BlogPostCard.vue` lo contenga.

## Issues Encountered / Lecciones para los planes siguientes

1. **`pnpm`/`prettier` en `.vue` de la web chocan con eslint:** prettier convierte `<img ... >` en `<img ... />` y `vue/html-self-closing` lo marca. lint-staged corre `eslint --fix` (no prettier) sobre los `.vue` de la web: formatear los `.vue` con `pnpm exec eslint --fix`, y los `.ts`/`.mjs` con `npx prettier --write`.
2. **Escapes unicode en regex:** al escribir un regex con `̀-ͯ` por herramientas, verificar con un script que no quedaron caracteres literales (0x300-0x36f) en el archivo.
3. **Patron para `/es` (195-06):** `PlanesContent` y `PrimeraClaseGratisContent` ya reciben `country`; `/es/planes` y `/es/primera-clase-gratis` solo envuelven en `PageShell` con su copy en la pagina y llaman a `usePageSeo`. El chequeo 19 ya mira `es/planes/index.html` si existe. El copy de las tarjetas de planes (`data/planes.ts`) es unico para AR y ES: si Barcelona necesita otro, 195-06 debe parametrizarlo.
4. **Rutas nuevas:** `prerenderRoutes(data)` ya suma disciplinas, planes, profes publicados y primera clase. El chequeo 22 (sitemap) y el 17-21 (paginas) leen `data/disciplinas.ts`/`data/profes.ts`: si 195-06 suma disciplinas ES, reutilizar `parseDisciplinas`.
5. **Fixture:** casos borde nuevos a proposito (Moreno con "Aromaterapia", Alberti sin ROM, parque con "Sesión grupal al aire libre"): no limpiarlos.
6. **`crawlLinks` (otra vez):** quitar una ruta de `prerenderRoutes` no la saca del build si algo la enlaza; el verificador testea existencia, no la lista.
7. **Blog en el build real:** el JSON-LD del post solo se vio con el mock de la API (`mut05/blog-gen.mjs`); revisar el primer build contra la API real.

## Datos de contenido que Franco tiene que completar o confirmar

1. **Profes:** hoy solo esta Ignacio Bordón (bio armada con el texto ya publicado de `FranFounder.vue`). Para sumar profes: copiar el objeto "EJEMPLO" de `el-templo-web/data/profes.ts` (esta con `publicado: false` y sin foto: no se publica), completar nombre, rol, bio y `sedes` (slugs), subir la foto a `public/images/photos/`, poner `foto` y pasar `publicado` a `true`; publicar con el boton "solo web" (D-11). Opcional: `sameAs` (Instagram, etc.) de cada uno e Ignacio.
2. **Bio de Ignacio, dos versiones en el sitio:** `FranFounder`/academy dicen "más de 20 años de experiencia"; `SectionMethod` dice "más de 10 años formando atletas, más de 10.000 alumnos". Se uso la de 20 años; confirmar cual es la correcta y unificar.
3. **Actividades con Aura:** en la DB local no existen las actividades "Verticales", "Acrobacias" ni "Open Gym" (solo Flexi y Yoga como especiales); la pagina las nombra (vienen de la fase 161) y muestra "Consultá disponibilidad por WhatsApp" porque ninguna sede publicada las tiene. Revisar en produccion si estan cargadas y, si se quiere, sumar una descripcion de cada una en `data/disciplinas.ts` (no se inventaron).
4. **Planes (`data/planes.ts`):** descripciones tomadas del catalogo/seed sin precios. Confirmar: "2 sesiones de regalo" en Flex/Foundation, "ROM", "eventos exclusivos", turnos fijos/libres y sedes. No se listaron los planes online, "Flexi" ni los "Paquete · N sem" (el plan pedia Flex/Foundation/Performance, "+", Clase única, pases de Aura/Yoga). Los precios van por WhatsApp.
5. **Calistenia, "Dónde se dicta":** se calcula con las actividades "Sesión Grupal" y "ROM" (no "Máquinas"). Confirmar que es lo que se quiere mostrar.
6. **Moreno** (solo Yoga) aparece solo bajo Yoga y su pagina dice "consultá horarios por WhatsApp" (pregunta abierta del filtro D-30 de 195-02/04).
7. **Tags del blog:** el equipo los asigna desde el admin (D-30); mientras no haya tags, la UI de tags no se muestra. Los posts sin cover usan `sesion-real.webp` (D-06: `og:image` no se toca).
8. **Titulos y meta descriptions** de disciplinas, planes y primera clase estan en las paginas y en `data/disciplinas.ts`: revisarlos para el tono de marca.

## Known Stubs

Ninguno funcional. Datos de ejemplo claramente marcados: el profe "EJEMPLO" en `data/profes.ts` (`publicado: false`, `foto: null`: nunca se publica) y los datos del fixture (solo CI/dev; el verificador los bloquea en el deploy con `--require-api`).

## Threat Flags

Ninguno nuevo. T-195-17: todo el JSON-LD sale por `jsonLdScript` (`safeJson`) y los textos de profes/planes/disciplinas se interpolan en el template (cero `v-html` nuevos); T-195-18: solo se publican profes con `publicado`, foto y bio (`publishedProfes`) y el verificador falla si un no publicado tiene pagina; T-195-19: el chequeo 19 bloquea patrones de precio (con mutation testing).

## Self-Check: PASSED

- Archivos creados existen (`disciplinas.ts`, `planes.ts`, `profes.ts`, `PageShell.vue`, `PlanesContent.vue`, `PrimeraClaseGratisContent.vue`, `usePageSeo.ts`, las 6 paginas); commits `ae1746408`, `e3ac7dacf`, `fbe7568a9` presentes en `git log`.
- Worktree limpio salvo este SUMMARY; sin `.data/`, `dist` ni archivos temporales commiteados (harness en el scratchpad).
