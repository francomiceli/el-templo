---
phase: 195-web-seo-local-aeo-atribucion
plan: "04"
subsystem: web
tags: [seo, json-ld, schema-org, nuxt, sedes, exercisegym, verifier]
requires: ["195-03"]
provides:
  - "utils/schema-graph.ts: builder puro del grafo JSON-LD (Organization @id fijo, ExerciseGym por sede, Place para espacios de comunidad, Article, BreadcrumbList, ItemList, safeJson, jsonLdScript, sedePath/sedeUrl, hasExactGeo)"
  - "Paginas /sedes (hub), /sedes/<slug> (AR + espacio de comunidad) y /es/sedes/<slug> (ES) con SedeDetail y useSedeSeo compartidos"
  - "utils/register-url.ts: buildRegisterUrl(params, attribution?) para el CTA 'Reservá online'"
  - "verify-seo-output.mjs: 10 chequeos nuevos de schema/sedes (16 en total)"
affects: [195-05, 195-06, 195-07, 195-11, 195-13]
tech-stack:
  added: []
  patterns:
    - "JSON-LD solo via useHead({ script: [jsonLdScript([...nodes])] }); nuxt-schema-org queda instalado pero apagado (schemaOrg.enabled false)"
    - "Cada pagina emite su propio @graph con organizationNode + nodos propios (referencias por @id)"
    - "Pagina de sede = findWebSede + guard de pais (404) + useSedeSeo(sede) + <SedeDetail>"
key-files:
  created:
    - el-templo-web/utils/schema-graph.ts
    - el-templo-web/utils/register-url.ts
    - el-templo-web/composables/useSedeSeo.ts
    - el-templo-web/components/SedeDetail.vue
    - el-templo-web/pages/sedes/index.vue
    - el-templo-web/pages/sedes/[slug].vue
    - el-templo-web/pages/es/sedes/[slug].vue
  modified:
    - el-templo-web/nuxt.config.ts
    - el-templo-web/app.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/pages/academy.vue
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/pages/blog/tag/[slug].vue
    - el-templo-web/components/SectionLocations.vue
    - el-templo-web/components/AppFooter.vue
    - el-templo-web/data/sedes.ts
    - el-templo-web/data/prerender-routes.ts
    - el-templo-web/data/web-data.fixture.json
    - el-templo-web/scripts/verify-seo-output.mjs
decisions:
  - "useSedeSeo (composable) en vez de duplicar el useHead en las dos paginas [slug].vue (DRY); las paginas solo hacen lookup + guard + useSedeSeo"
  - "sedePath() vive en schema-graph.ts y lo usan data/sedes.ts (campo Sede.path), prerender-routes.ts y las paginas: una sola regla AR=/sedes, ES=/es/sedes"
  - "Footer: 'N sedes en Mar del Plata y Barcelona' enlazando a /sedes (N = sedesCount.total); el link 'Sedes' de la columna Empresa pasa de /#sedes a /sedes"
  - "El fixture cubre los casos borde a proposito (ver Deviations): Moreno sin horarios, Jujuy y Barcelona con geo exacta, Alberti con geo parcial, Mario Bravo con direccion hostil"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 04: Schema correcto y paginas de sede Summary

La home publica un unico `Organization` (`@id https://eltemplo.org/#organization`), cada sede con clases tiene su pagina con un `ExerciseGym` propio (AR bajo `/sedes/<slug>`, Barcelona bajo `/es/sedes/barcelona`), El Templo Park es un `Place` sin `ExerciseGym`, existe el hub `/sedes` y todo queda protegido por 10 chequeos nuevos del verificador post-build.

## Commits

| Hash | Mensaje |
|------|---------|
| `56ebf49ab` | feat(195-04): grafo JSON-LD propio |
| `e08920a13` | feat(195-04): hub y paginas por sede |
| `5a7d673de` | feat(195-04): chequeos de schema y sedes en el verificador SEO |

(Un commit por tarea, en vez de los 2 del success_criteria.)

## Verificacion

Node 20 + capa `--extends` del scratchpad (`pnpm run generate` literal es falso verde en este entorno). Fixture, sin API local.

| Chequeo | Resultado |
|---------|-----------|
| `pnpm exec nuxi typecheck` | verde |
| `pnpm lint` | 0 errores (2 warnings `v-html` preexistentes) |
| `nuxt generate` | 42 rutas (24 en la base: +hub, +8 paginas de sede, +payloads) |
| `node scripts/verify-seo-output.mjs` | 16/16 OK (6 de 195-03 + 10 nuevos) |
| `.output/public/index.html` | 1 bloque `ld+json`, 1 `Organization` con el `@id`, 0 `ExerciseGym` |
| Acceptance greps Task 1 | `useSchemaOrg/define*` 0, `enabled: false` 1, `identity` 0, `u003c` >= 1 |
| Acceptance Task 2 | existen las 6 sedes MdP + `parque-primavesi` + `es/sedes/barcelona`; NO existe `sedes/barcelona`; Park con 0 `ExerciseGym`; `register?branchId=` en JBJ; `Alem\b` 0 |
| Footer del home | sin direccion de sede, con `href="/sedes"` y "7 sedes en Mar del Plata y Barcelona" |
| sitemap | `/sedes` + 7 AR + `/es/sedes/barcelona` (los toma solo del prerender, sin fuente extra en `nuxt.config.ts`) |
| Prettier | `schema-graph.ts`, verificador y fixture OK. `index.vue`, `[slug].vue` del blog y `academy.vue` ya estaban fuera de formato en la base y no se reformatearon |
| Borrado `el-templo-web/.data/` y symlink `dist` antes de cada commit | si |

### Chequeos nuevos del verificador (12 a 16 en `CHECKS`, al final)

7. home: un solo bloque JSON-LD, exactamente 1 `Organization` con `@id` fijo, 0 `ExerciseGym` (a)
8. sedes AR con clases: 1 `ExerciseGym`, `@id`, `parentOrganization`, `streetAddress`, `telephone` valido, `openingHoursSpecification` = franjas de la sede (ausente si no hay), copy "horarios por WhatsApp" si no hay, `geo` si y solo si exacta (b)
9. idem sedes ES bajo `/es/sedes/<slug>` (c)
10. espacios de comunidad: 1 `Place`, 0 `ExerciseGym`, sin `parentOrganization` (d)
11. ES no existe bajo `/sedes` ni AR bajo `/es/sedes` (e)
12. sitemap con `/sedes` y la pagina de cada sede (f)
13. ningun bloque JSON-LD con `<` crudo y todos parsean (g)
14. `name` de todo `ExerciseGym` empieza con `brand.name` (h)
15. footer sin ninguna `address.street` de `web-data` y con link a `/sedes` (leccion tras 195-03)
16. fixture (solo si `source === "fixture"`): debe tener sede sin horarios, geo exacta, geo aproximada y una direccion con `<` (leccion tras 195-03 + protege los casos borde)

Los chequeos 15 y 16 no estaban en el plan: salen de la seccion 9 de EXECUTION-RULES.

### Mutation testing (hecho, honesto)

**Sobre una copia de `.output/public` / `web-data.json` (35 mutantes, harness en el scratchpad, `--public-dir`/`--data`)**: sin `parentOrganization`; home con `ExerciseGym` / con 2 `Organization` / sin el `@id`; `@id` del gym AR incorrecto y del ES apuntando a `/sedes`; `streetAddress` distinta; sin `openingHoursSpecification` / con una franja menos / `[]` en sede sin horarios; geo parcial publicada, geo exacta omitida (AR y ES), geo aproximada del seed publicada; sin `telephone`; Park como `ExerciseGym` / con `parentOrganization`; existe `/sedes/barcelona` / `/es/sedes/<AR>`; sitemap sin ES / sin hub / sin una sede AR; JSON-LD con `</script>` crudo y con `<` crudo sin cortar; `name` sin marca; footer con direccion / sin link a `/sedes`; sede sin horarios sin copy; faltan pagina AR / ES / Park; fixture sin sede sin horarios / sin geo exacta / sin direccion hostil. **35/35 mueren** (el de "fixture sin geo parcial" muere por el desfase pagina-datos, no por el chequeo de fixture: las otras sedes conservan coordenadas de 4 decimales, asi que ese chequeo solo es discriminante para las otras tres variantes del fixture).

**Sobre el codigo fuente + regenerar (11 mutantes)**: `hasExactGeo` con >= 4 decimales, solo mirando la latitud, y geo siempre publicada; `openingHoursSpecification: []` en sede sin horarios; gym sin `parentOrganization`; gym `name` sin marca; footer con la direccion fija; Park como `gymNode`; home con `gymNode` por sede; `@id` del gym ES con la regla AR; y ES prerenderizado bajo `/sedes` con el guard de pais de la pagina quitado. **Todos mueren.**

**Dos mutantes equivalentes (sobreviven, y deben):**
- `safeJson` sin el escape de `<`: unhead v2 re-escapa `<` como `<` en el `innerHTML` de `ld+json`, asi que el HTML final es identico. Dos capas de proteccion; el verificador protege el resultado (mutante M23/M24 sobre el HTML). La escritura propia de `safeJson` queda como defensa en profundidad no observable sin tests unitarios (la web no tiene runner).
- ES prerenderizado bajo `/sedes/<slug>` SOLO en `prerender-routes.ts` (guard de pais de la pagina intacto): la pagina responde 404 y no se genera, ademas el crawler de nitro (`crawlLinks`) encuentra `/es/sedes/barcelona` desde el hub. Con el guard tambien quitado, el verificador falla (chequeo "ES no existe bajo /sedes").

**Prueba pedida por el plan:** borrando a mano `parentOrganization` del `index.html` de `sedes/juan-b-justo` en `.output/public`, el verificador sale con exit 1 (falla el chequeo de sedes AR); restaurada la pagina, 16/16 OK.

## Deltas de gates de tenancy

Ninguno (solo web: sin tabla, ruta ni job de la API).

## Deviations from Plan

### Auto-fixed / agregado

**1. [Rule 2 - Critical] Sede sin horarios en el fixture y en el verificador, y footer sin direccion fija**
- Pedido por las lecciones de 195-03. El fixture ahora tiene Moreno con `openingHours: []`, `schedule: []` y solo Yoga especial (como en la DB local); el verificador exige que esa pagina exista, sin `openingHoursSpecification` y con el copy "horarios por WhatsApp" (chequeo 8) y que el fixture siga cubriendo el caso (chequeo 16).
- Footer: `AppFooter.vue` ya no escribe "Av. Constitucion 6745"; muestra "N sedes en Mar del Plata y Barcelona" con link a `/sedes` (chequeo 15).
- **Commits:** `e08920a13`, `5a7d673de`

**2. [Rule 2 - Critical] Fixture con casos borde de geo y de escape**
- El plan decia "con el fixture y el seed actual, ninguna sede publica geo", lo que dejaba sin cubrir el camino positivo de `hasExactGeo` (un mutante "nunca publica geo" sobrevivia). El fixture lleva Jujuy y Barcelona con 5 decimales (geo publicada), Alberti con latitud de 5 y longitud de 3 (NO se publica) y el resto con las de 4 del seed.
- Para ejercitar el escape de JSON-LD, la direccion de Mario Bravo en el fixture es `Mario Bravo 618 </script><b>x</b>` (el fixture solo se usa en CI/dev, el prebuild avisa "NO publicar este build" y `--require-api` lo bloquea). El HTML visible la escapa y el JSON-LD sale con `<`.
- **Commits:** `e08920a13`, `5a7d673de`

**3. [Rule 3 - Blocking] Construccion de tipos**
- `m[1].length` falla con `noUncheckedIndexedAccess` (TS2532): `m?.[1]?.length ?? 0`. Y U+2028/2029 literales en `safeJson` rompian el parser: usados los escapes en forma de texto (barra invertida + u2028 / u2029) dentro del regex.

**Otras diferencias menores:**
- Archivos extra no listados en el plan: `composables/useSedeSeo.ts` (head + JSON-LD compartido AR/ES) y `sedeListNode` en `schema-graph.ts` (ItemList del hub). `data/sedes.ts` suma `Sede.path`; `data/prerender-routes.ts` reutiliza `sedePath`.
- `key_links` del plan: el patron `jsonLdScript` esta en `composables/useSedeSeo.ts`, no en las dos paginas `[slug].vue` (llaman a `useSedeSeo`). `pages/sedes/index.vue` usa `jsonLdScript` directo.
- `organizationNode` omite `contactPoint` de un pais si su WhatsApp es null (el contrato lo admite).
- `gymNode`: sin `postalCode` (null hasta 195-14) y `mapsUrl` es el fallback de busqueda de Maps cuando la sede no tiene `maps_url`; solo se emite `hasMap` junto con `geo` exacta.
- La home ya no importa `faqItems` (el FAQPage se fue) ni `sedes`; `app.vue` ya no emite schema.
- El tag del blog usaba `watchEffect` + `useSchemaOrg`; ahora `useHead(() => ({ script: ... }))`. El tag y el post del blog no tienen paginas generadas en el fixture (la API del blog no corre), asi que su JSON-LD NO se vio en HTML: solo typecheck + lint. Revisar en el primer build con API real.

## Issues Encountered / Lecciones para los planes siguientes

1. **unhead ya escapa `<` en `ld+json`** (`<`): no confiar en que un mutante de `safeJson` aparezca en el verificador; el chequeo (g) protege el HTML resultante.
2. **`crawlLinks` de nitro descubre paginas linkeadas desde otras** (el hub enlaza `/es/sedes/barcelona`): una ruta que falta en `prerenderRoutes` puede generarse igual. Para que la lista sea autoritativa hay que testear la existencia de la pagina (los chequeos 8-11 lo hacen).
3. **Disciplinas y profes (195-05)**: sumar rutas a `prerenderRoutes(data)` y sus chequeos AL FINAL de `CHECKS` (despues de "fixture: cubre ..."). Los nodos nuevos van como `Record<string, unknown>` en `schema-graph.ts`; `articleNode(post, author)` ya acepta el `Person` de Ignacio Bordon en `author` (hoy `{ "@id": ORG_ID }`).
4. **`/es` (195-06)**: `useSedeSeo` fija `og:type website`, `htmlAttrs.lang` queda en `es` desde `app.vue`; hreflang `es-AR`/`es-ES` reciproco y consentimiento van en 195-06. `buildRegisterUrl(params, attribution)` ya acepta el segundo argumento: 195-06 solo tiene que pasar `Record<string, string>`.
5. **App `/register` (195-07)** debe leer `branchId` y `branchName` (el CTA de cada sede los manda).
6. **Mutation testing del verificador** se hace en 2 niveles: copia de `.output/public` con `--public-dir`/`--data` (segundos) y mutacion del codigo + `nuxt generate` (~25 s por mutante). Los harness estan en el scratchpad (`mut04/`), no commiteados.
7. Si el endpoint real devuelve una sede publicada con direccion o nombre con `<`, el JSON-LD sigue siendo valido (probado con el fixture).
8. **Pendientes de Franco** (para la guia final): pregunta abierta del filtro D-30 (Moreno solo con Yoga queda sin horarios y su pagina dice "consultá horarios por WhatsApp"); coordenadas exactas, Place ID y fotos llegan por la migracion 0275 (195-14): hasta entonces ninguna sede real publica `geo`.

## Known Stubs

Ninguno nuevo. Las sedes sin foto muestran `PlaceholderBox` (D-06: no se inventan fotos); `phone` cae al WhatsApp de ventas del pais mientras 195-14 no cargue telefonos por sede.

## Threat Flags

Ninguno nuevo. T-195-14 (XSS en JSON-LD) mitigado por `safeJson` + escape de unhead + chequeo (g); T-195-15 (geo falsa) mitigado por `hasExactGeo` + chequeos (b)/(c) con mutation testing; T-195-16 aceptado (solo datos publicos).

## Self-Check: PASSED

- Archivos creados existen (`schema-graph.ts`, `register-url.ts`, `useSedeSeo.ts`, `SedeDetail.vue`, `pages/sedes/index.vue`, `pages/sedes/[slug].vue`, `pages/es/sedes/[slug].vue`); commits `56ebf49ab`, `e08920a13`, `5a7d673de` presentes en `git log`.
- Worktree limpio salvo este SUMMARY; sin `.data/`, `dist` ni archivos temporales commiteados.
