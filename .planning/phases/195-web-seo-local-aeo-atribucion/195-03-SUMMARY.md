---
phase: 195-web-seo-local-aeo-atribucion
plan: "03"
subsystem: web
tags: [seo, nuxt, prebuild, llms-txt, robots, sitemap, whatsapp, ci]
requires: ["195-01", "195-02"]
provides:
  - "scripts/fetch-web-data.mjs: prebuild endpoint -> data/generated/web-data.json + public/llms.txt (D-10, D-15, D-29)"
  - "data/sedes.ts como adapter tipado sobre web-data.json (+ brandName, webSedes, findWebSede, webData)"
  - "utils/whatsapp.ts: salesWhatsappUrl / salesPhoneHref / salesPhoneDisplay / DEFAULT_TRIAL_TEXT"
  - "scripts/verify-seo-output.mjs: verificador post-generate extensible (6 chequeos + --require-api), corre en CI"
  - "data/prerender-routes.ts: prerenderRoutes(data) (los planes 04-06 agregan sedes, disciplinas, profes, /es)"
affects: [195-04, 195-05, 195-06, 195-11, 195-13]
tech-stack:
  added: []
  patterns:
    - "Fuente unica de datos de la web = data/generated/web-data.json (gitignoreado, lo escribe el prebuild)"
    - "Build contra API remota falla (exit 1) si el endpoint no responde o el payload es invalido: nunca hay fallback a datos viejos"
    - "Chequeos del verificador como lista { name, run(ctx) -> problemas[] }"
key-files:
  created:
    - el-templo-web/data/web-data.types.ts
    - el-templo-web/data/web-data.fixture.json
    - el-templo-web/data/prerender-routes.ts
    - el-templo-web/scripts/fetch-web-data.mjs
    - el-templo-web/scripts/verify-seo-output.mjs
  modified:
    - el-templo-web/data/sedes.ts
    - el-templo-web/utils/whatsapp.ts
    - el-templo-web/nuxt.config.ts
    - el-templo-web/package.json
    - el-templo-web/.gitignore
    - el-templo-web/public/robots.txt
    - el-templo-web/server/api/__sitemap__/blog.ts
    - el-templo-web/components/{AppNav,AppFooter,AppPrefooter,SectionConversion,BlogSidebar,BlogPostCta}.vue
    - .github/workflows/ci.yml
  removed-from-index:
    - el-templo-web/public/llms.txt
decisions:
  - "nuxt.config.ts lee web-data.json con import dinamico (top-level await + catch con el mensaje del plan), no con node:fs: el typecheck de la web no trae @types/node (TS2307)"
  - "BlogPost.updatedAt es string | null: la API publica /blog/posts NO devuelve updatedAt (solo publishedAt), el prebuild usa updatedAt ?? publishedAt"
  - "El telefono del footer (tel: + texto) tambien sale de web-data (salesPhoneHref/salesPhoneDisplay)"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 03: Datos de la web desde el endpoint en el build Summary

El build de la web lee sedes, marca y WhatsApp de ventas de `GET /api/web/site-data` (via `data/generated/web-data.json`); una API remota caida o un payload invalido frena el build en vez de publicar datos viejos, robots/llms/sitemap salen de esos datos y un verificador post-build corre en CI.

## Commits

| Hash | Mensaje |
|------|---------|
| `a260d49c1` | feat(195-03): datos de la web desde el endpoint en el build |
| `d155d0f10` | feat(195-03): robots IA, llms.txt generado y verificador SEO |
| `074f4f520` | feat(195-03): WhatsApp de ventas por pais desde los datos de la web |

(Un commit por tarea, en vez de los 2 del success_criteria del plan.)

## Verificacion

Corrido en el worktree con Node 20 y la capa `--extends` del scratchpad (el `pnpm run generate` literal es falso verde en este entorno: se corrio `node scripts/fetch-web-data.mjs` + `pnpm exec nuxt generate --extends <capa>`).

| Chequeo | Resultado |
|---------|-----------|
| `rm -rf data/generated .nuxt && pnpm run postinstall` | exit 0 (fixture copiado, `nuxi prepare` OK) |
| `NUXT_PUBLIC_API_URL=https://no-existe.invalid/api node scripts/fetch-web-data.mjs` | exit 1, mensaje del plan, `web-data.json` byte a byte intacto |
| `pnpm exec nuxi typecheck` | verde |
| `pnpm lint` | 0 errores (2 warnings `v-html` preexistentes) |
| generate (sin `NUXT_PUBLIC_API_URL`) | exit 0, `"source": "fixture"`, 24 rutas prerenderizadas |
| `node scripts/verify-seo-output.mjs` | 6/6 OK |
| `node scripts/verify-seo-output.mjs --require-api` con build de fixture | exit 1 (como pide el plan) |
| `grep wa.me/[0-9]` en components/pages/layouts/data/utils/app.vue | 0 |
| `grep -cE "wa.me/\|Diagonal\|Juan B. Justo" data/sedes.ts` | 0 |
| `grep -c catch` y `grep -c '\$fetch'` en `__sitemap__/blog.ts` | 0 y 0 |
| `.output/public/llms.txt` contiene "Juan B. Justo 1018" | si |
| YAML de `ci.yml` | valido |
| Acceptance greps (package.json x2, check-ignore, prerenderRoutes, robots x3 / disallow 0, llms no versionado, `verify-seo-output` en ci.yml = 1) | todos cumplen |

No hay tests unitarios de la web (el proyecto no tiene runner): la logica nueva se probo con harnesses temporales en el scratchpad (no commiteados).

### Mutation testing (hecho, honesto)

**`fetch-web-data.mjs`** contra un servidor HTTP mock (host `127.0.0.2` cuenta como remoto, `127.0.0.1` como local; 16 casos):
- Casos: remoto valido (source api, `publishedAt` como fallback de `updatedAt`, tags solo slug); remoto con `sedes: []`, slug invalido, sin sede ES, WhatsApp AR no numerico, WhatsApp ES null, brand vacio, street vacio, kind invalido, `/blog/posts` 500, `site-data` 404 (menciona `ROLLOUT-195`): todos exit 1 con el mensaje "No se pudo leer /api/web/site-data de <host>" y el archivo intacto; local con API caida y con payload invalido: fixture + aviso "NO publicar este build"; local con API ok: source api.
- Mutantes (cada uno rompe el test esperado): remoto tratado como local (rompe 10 casos), validacion anulada (rompe 9), `SLUG_RE` laxo (badSlug), `WHATSAPP_RE` laxo (badWa y payload invalido local), sin fallback a `publishedAt`. 5/5 muertos.

**`verify-seo-output.mjs`** contra copias de `.output/public` con `--public-dir`/`--data` (cada regresion rompe exactamente el chequeo que debe): sin `404.html`; robots sin PerplexityBot; llms sin la calle de JBJ; llms con "Chapadmalal" (rompe 2: el 3 y el 4); html con "Alem 3958", "8 sedes", "logo-eltemplo.svg", "54223XXXXXXX" (check 4); `wa.me/5492235820999` (check 5); post en web-data sin pagina, y post con pagina pero sin sitemap (check 6). Con la pagina y el sitemap presentes pasa. 12/12 detectados.

**End-to-end:** (a) cambiando el numero AR de `web-data.json` a otro valor, el html generado tiene 0 apariciones del numero viejo (incluido el footer): los numeros fluyen de los datos; (b) re-hardcodeando el numero viejo en `AppNav.vue`, el verificador falla en el check 5; (c) con posts/tags en `web-data.json` el sitemap trae `/blog/<slug>` (con `lastmod`), `/blog/tag/<tag>` y el prerender los intenta; como la API del blog no corre, no se generan las paginas y el check 6 falla (la regresion "post publicado sin prerender" se detecta).

### Chequeos del verificador (y como agregar otros)

1. existen `index.html`, `404.html`, `robots.txt`, `llms.txt`, `sitemap.xml`
2. robots.txt con los tres `User-agent` IA y linea `Sitemap:`
3. llms.txt con el `address.street` de cada sede y sin "Chapadmalal"
4. ningun `.html` ni llms.txt con "Alem 3958", "Chapadmalal", "8 sedes", "54223XXXXXXX", "logo-eltemplo.svg"
5. todo `wa.me/<digitos>` de los html pertenece a `countries.*.salesWhatsapp`
6. cada `blog.posts[].slug` tiene `blog/<slug>/index.html` o `.html` y su `<loc>` en sitemap.xml
7. solo con `--require-api`: `web-data.json` con `source: "api"` (lo usa el deploy en 195-11)

Para agregar uno (planes 04-06): al final de `CHECKS` en `scripts/verify-seo-output.mjs`, `{ name, run: (ctx) => [...problemas] }`. `ctx` expone `data` (web-data.json), `exists(rel)`, `read(rel)` y `htmlFiles` (todo relativo a `.output/public`). Una excepcion cuenta como FALLA. Flags de test: `--public-dir=<ruta>` y `--data=<ruta>`.

## Deltas de gates de tenancy

Ninguno (solo web y CI: sin tabla, ruta ni job de la API).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `/blog/posts` no devuelve `updatedAt`**
- **Found during:** Task 1 (leyendo `el-templo-api/src/modules/blog/service.ts`)
- **Issue:** el plan asume `{ posts: [{ slug, updatedAt }] }`, pero el endpoint publico solo selecciona `publishedAt`. El sitemap viejo ya salia sin `lastmod` por ese motivo, y validar `updatedAt` como requerido habria roto TODO build real.
- **Fix:** el prebuild usa `updatedAt ?? publishedAt` y el tipo es `updatedAt: string | null`; el sitemap omite `lastmod` si es null. Los planes 04-06 que lean `blog.posts[].updatedAt` deben tolerar null.
- **Commit:** `a260d49c1`

**2. [Rule 3 - Blocking] `nuxt.config.ts` no puede importar `node:fs`**
- **Issue:** `nuxi typecheck` falla con TS2307 (la web no tiene `@types/node`).
- **Fix:** `const webData = await import("./data/generated/web-data.json").then(...).catch(() => { throw new Error("Falta data/generated/web-data.json: corré pnpm prepare-data") })`. Verificado: sin el archivo, `nuxi prepare` falla con ese mensaje.
- **Commit:** `a260d49c1`

**3. [Rule 2 - Critical] Telefono hardcodeado en el footer**
- **Issue:** `AppFooter.vue:103-104` tenia `tel:+5492235820521` y el texto `+54 9 223 582-0521` (el mismo numero de ventas). El plan solo listaba los `wa.me`, pero D-16 y el must-have dicen "ningun numero de ventas queda escrito en el codigo de la web". Lo detecto la prueba de mutacion del numero (el numero viejo seguia en 8 html).
- **Fix:** `salesPhoneHref("AR")` / `salesPhoneDisplay("AR")` en `utils/whatsapp.ts` (formato `+54 9 223 582-0521` para celulares AR, `+<digitos>` en otro caso).
- **Commit:** `074f4f520`

**4. Division en commits:** la generacion de `llms.txt` vive en `fetch-web-data.mjs` y entro en el commit de la Task 1 (junto con `git rm --cached public/llms.txt` y el `.gitignore`), no en el de la Task 2; `utils/whatsapp.ts` tambien nace en el commit de la Task 1 (lo necesita `data/sedes.ts`).

**5. Fixture:** `address.street` de Barcelona es "Av. Diagonal 368" (la de la mig 0271) y todas las sedes llevan horarios de ejemplo (el plan lo pedia). La tolerancia a `openingHours: []` NO queda cubierta por el fixture (ver Lecciones).

**Menores:** `fetch-web-data.mjs` exporta `validateSiteData`, `normalizeBlogPosts`, `normalizeBlogTags`, `renderLlmsTxt` (solo corre `main()` si es el entrypoint); host `[::1]` tambien cuenta como local; validacion extra de slug repetido, `mapsUrl` no vacio y `openingHours`/`schedule` como arrays; slugs de blog validados con `^[A-Za-z0-9][A-Za-z0-9_-]*$` (el admin puede cargar slugs custom).

## Issues Encountered / Lecciones para los planes siguientes

1. **BLOQUEANTE de integracion (195-11, D-29):** `deploy.yml` `build-web` corre `pnpm run generate` con `NUXT_PUBLIC_API_URL=${{ secrets.VITE_API_URL }}` (API de prod). Desde este plan, ese build FALLA mientras prod no tenga `/api/web/site-data`. No pushear/mergear esta rama a master antes de que 195-11 implemente el rollout en 2 pasos. `deploy/ROLLOUT-195.md` (citado en el mensaje de error) todavia NO existe: lo crea 195-11 (8 menciones en su plan).
2. **Contrato para 04-06:** `import { webData, webSedes, findWebSede, brandName } from "~/data/sedes"`. `WebData` en `data/web-data.types.ts`. `blog.posts[].updatedAt` puede ser null. `prerenderRoutes(data)` en `data/prerender-routes.ts` es donde se suman las rutas nuevas (los consumidores deben sumar tambien los chequeos al verificador).
3. **Tolerancia a sedes sin horarios:** el fixture lleva horarios en todas las sedes, asi que CI NO detecta una pagina de sede que rompa con `openingHours: []` (caso real: MORENO en la DB local). 195-04 debe agregar un test/chequeo explicito (p. ej. variante de fixture sin horarios o un chequeo del verificador que mire una sede sin franjas).
4. **Dato hardcodeado fuera de alcance, pendiente de decidir:** `AppFooter.vue:106-108` tiene `Av. Constituci&oacute;n 6745, Mar del Plata, Argentina` escrito a mano (direccion "principal" del footer, no es una lista de sedes). No se toco porque no hay una sede "principal" en `web-data`; conviene resolverlo en 195-04 (derivar de una sede, o quitarla del footer a favor de `/sedes`).
5. **llms.txt enlaza `/sedes/<slug>` y `/es/sedes/<slug>`** que recien existen con 195-04/05/06: no publicar antes de esos planes.
6. **Generate local en este entorno:** `pnpm run generate` ejecuta bien el prebuild pero el `nuxt generate` sigue siendo falso verde sin la capa: usar `node scripts/fetch-web-data.mjs && pnpm exec nuxt generate --extends <capa>` con Node 20, y borrar `el-templo-web/.data/` y el symlink `dist`. `data/generated/` y `public/llms.txt` quedan ignorados por git (no hace falta borrarlos, pero `rm -rf data/generated` + `pnpm run postinstall` restituye el fixture).
7. **Mocks sin procesos en background:** un servidor `http` + `spawn` dentro de UN solo script node en foreground sirve para probar el prebuild (hosts `127.0.0.2` = remoto, `127.0.0.1` = local); el harness no se commitea.
8. **Prettier:** `AppNav.vue` y `SectionConversion.vue` ya estaban fuera de formato en la base (un `<img ... >` y un template literal); no se reformatearon para no ensuciar el diff.
9. `public/robots.txt` es CRLF (se preservo). `nuxt.config.ts`, `.gitignore`, `package.json` y los componentes se editaron con scripts que preservan los finales de linea originales.

## Known Stubs

Ninguno. El fixture es de uso explicito solo en CI/dev y el prebuild avisa "NO publicar este build"; `--require-api` (deploy, 195-11) lo bloquea.

## Threat Flags

Ninguno nuevo. T-195-10 (build con API remota caida), T-195-11 (validacion `^[0-9]{8,15}$` + `encodeURIComponent`) y el chequeo 5 del verificador quedaron cubiertos y con mutation testing.

## Self-Check: PASSED

- Archivos creados existen (`web-data.types.ts`, `web-data.fixture.json`, `prerender-routes.ts`, `fetch-web-data.mjs`, `verify-seo-output.mjs`); commits `a260d49c1`, `d155d0f10`, `074f4f520` presentes en `git log`.
- Worktree limpio salvo este SUMMARY; sin `.data/`, `dist` ni archivos temporales commiteados (harnesses en el scratchpad).
