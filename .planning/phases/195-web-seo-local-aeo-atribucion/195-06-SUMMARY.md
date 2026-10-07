---
phase: 195-web-seo-local-aeo-atribucion
plan: "06"
subsystem: web
tags: [seo, hreflang, consent-mode-v2, rgpd, ga4, meta-pixel, attribution, smart-app-banner, nuxt]
requires: ["195-03", "195-04", "195-05"]
provides:
  - "Seccion /es (home, primera-clase-gratis, planes, sede Barcelona) con lang es-ES; el resto del sitio es-AR"
  - "utils/hreflang.ts: HREFLANG_PAIRS + hreflangLinks (es-AR, es-ES, x-default reciprocos y autorreferentes, solo entre paginas equivalentes)"
  - "utils/analytics-loader.ts: loadGa4/loadPixel (modos none y es-granted), denyConsent, restoreConsent, analyticsMode, isEsPath"
  - "composables/useConsent.ts + components/ConsentBanner.vue: consentimiento RGPD propio solo en /es"
  - "composables/useAttribution.ts + plugins/attribution.client.ts: first-touch y registerParams() para /register (contrato para 195-07)"
  - "verify-seo-output.mjs: 5 chequeos nuevos (31 en total)"
affects: [195-07, 195-11, 195-13, 195-14]
tech-stack:
  added: []
  patterns:
    - "GA4 y Pixel solo se insertan con document.createElement en el cliente; en /es solo despues de 'granted' (modo basico de Consent Mode: sin consentimiento no hay script ni ping)"
    - "Todo lo que depende del cliente en un link (atribucion) espera al onMounted DEL COMPONENTE: Vue no corrige atributos distintos al hidratar"
    - "useAnalytics decide con getConsent() (espejo en memoria) porque lo llaman handlers async fuera de contexto Nuxt"
key-files:
  created:
    - el-templo-web/utils/hreflang.ts
    - el-templo-web/utils/analytics-loader.ts
    - el-templo-web/composables/useConsent.ts
    - el-templo-web/composables/useAttribution.ts
    - el-templo-web/components/ConsentBanner.vue
    - el-templo-web/plugins/attribution.client.ts
    - el-templo-web/pages/es/index.vue
    - el-templo-web/pages/es/primera-clase-gratis.vue
    - el-templo-web/pages/es/planes.vue
  modified:
    - el-templo-web/app.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/pages/disciplinas/[slug].vue
    - el-templo-web/pages/es/sedes/[slug].vue
    - el-templo-web/layouts/default.vue
    - el-templo-web/composables/usePageSeo.ts
    - el-templo-web/composables/useSedeSeo.ts
    - el-templo-web/composables/useAnalytics.ts
    - el-templo-web/components/SedeDetail.vue
    - el-templo-web/components/PrimeraClaseGratisContent.vue
    - el-templo-web/components/PlanesContent.vue
    - el-templo-web/plugins/ga4.client.ts
    - el-templo-web/plugins/meta-pixel.client.ts
    - el-templo-web/data/prerender-routes.ts
    - el-templo-web/scripts/verify-seo-output.mjs
  removed:
    - el-templo-web/components/CookieConsent.vue
decisions:
  - "En /es sin consentimiento, registerParams() devuelve {} (ni siquiera los params de la URL actual): el must-have dice 'en /es solo despues del consentimiento'. Sin sessionStorage disponible, en AR/ES-consentido se usan solo los params de la URL actual"
  - "El rechazo en el banner de /es se respeta en todo el sitio (analyticsMode: AR + 'denied' = deny)"
  - "Meta Pixel y GA4 usan el mismo criterio central (analyticsMode); la navegacion SPA AR->/es revoca (denyConsent) y /es->AR restaura (restoreConsent) solo lo que se revoco"
  - "usePageSeo agrega lang es-ES y hreflang por ruta: las paginas AR/ES de planes y primera clase no necesitaron tocar su .vue"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 06: /es con hreflang, consentimiento RGPD y first-touch Summary

Barcelona vive en `/es` con `lang="es-ES"` y hreflang recíproco solo entre páginas equivalentes; GA4 y el Pixel no se cargan ni se disparan en `/es` hasta que la persona acepta el banner propio (Consent Mode v2: default denied, luego update granted; Pixel revoke, init, grant); Argentina carga como siempre; cada link "Reservá online" lleva a la app el first-touch del visitante (en `/es` solo con consentimiento); Safari iOS muestra el Smart App Banner.

## Commits

| Hash | Mensaje |
|------|---------|
| `bf7dd1338` | feat(195-06): seccion /es de Barcelona con hreflang reciproco y Smart App Banner |
| `0135a3f4e` | feat(195-06): banner de consentimiento en /es con Consent Mode v2 y plugins de GA4 y Pixel |
| `de7074b8a` | feat(195-06): first-touch de origen en los links de registro y chequeos del verificador |

## Contrato de parámetros de `/register` (para 195-07)

Los arma `buildRegisterUrl({ branchId, branchName }, registerParams())`. Todos opcionales salvo que se indique; valores truncados a 255 caracteres, vacíos omitidos, solo estas claves salen de la web.

| Param | Origen | Notas |
|-------|--------|-------|
| `branchId`, `branchName` | el CTA de la sede / primera clase / home ES | `disciplinas` y el CTA genérico no los mandan |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | URL del first-touch | |
| `fbclid`, `gclid` | URL del first-touch | |
| `promo` | `?promo=` del first-touch | |
| `src_ref` | host del `document.referrer` si es externo | `eltemplo.org` y cualquier `*.eltemplo.org` (incluido `app.`) cuentan como internos y no se mandan; tráfico directo = ausente |
| `landing` | `pathname` de aterrizaje (con barra final, ej. `/sedes/juan-b-justo/`) | |
| `ft` | `Date.now()` del first-touch, 13 dígitos | |
| `fbp` | cookie `_fbp` actual si existe | no es parte del first-touch: se lee al renderizar el link |

- **El first-touch dura la pestaña** (`sessionStorage`, clave `et_ft_v1`) y nunca se pisa. Un link que no pasó por la web (QR `/qr/*`, que son redirects de `routeRules`) llega sin `utm_*`: la app debe tolerar la ausencia de todos.
- **`/es` sin consentimiento: ningún param** (ni siquiera los de la URL). Con consentimiento, igual que Argentina.
- La API (195-07) debe volver a validar longitudes y charset (T-195-22): el navegador puede mandar cualquier cosa en la URL.
- El HTML estático lleva el link sin atribución (correcto): se decora al montar cada componente.

## Verificación

Node 20 + capa `--extends` del scratchpad (el `pnpm run generate` literal es falso verde en este entorno). Fixture, sin API local.

| Chequeo | Resultado |
|---------|-----------|
| `pnpm exec nuxi typecheck` | verde |
| `pnpm lint` | 0 errores (2 warnings `v-html` preexistentes) |
| `npx prettier --check` en los `.ts`/`.mjs` propios | OK |
| `nuxt generate` | 64 rutas (58 en la base de 195-05: +`/es`, `/es/primera-clase-gratis`, `/es/planes` y payloads) |
| `node scripts/verify-seo-output.mjs` | 31/31 OK (26 de 03-05 + 5 nuevos) |
| `.output/public/es/{index,primera-clase-gratis,planes}/index.html` | existen con `lang="es-ES"`; `index.html` con `lang="es-AR"` |
| hreflang de `/` y `/es` | es-AR `https://eltemplo.org/`, es-ES `https://eltemplo.org/es`, x-default `https://eltemplo.org/`; igual en los otros 2 pares |
| `grep -c hreflang sedes/juan-b-justo/index.html` | 0 (y 0 en `es/sedes/barcelona`) |
| `grep -c 'content="app-id=6761773726"' index.html` | 1 |
| `grep -rlE 'googletagmanager.com/gtag/js\|connect.facebook.net' .output/public/es` | sin resultados (solo aparece en el chunk JS de `_nuxt`, que es el código del loader) |
| acceptance greps (`consent default`, `revoke`, `ad_user_data`, `ad_personalization`, `CookieConsent` fuera, `et_ft_v1`, `consentState`, `registerParams` x2, `cleanup` >= 2, `onUnmounted` = 0) | todos cumplen |
| Sin `console.*` ni `any` en el código nuevo | si |
| Borrado `el-templo-web/.data/` y symlink `dist` antes de cada commit | si |

### Navegador real (Chrome headless + CDP, 23 aserciones, build con IDs de prueba `G-TEST12345` / `999000111`)

Harness `mut06/e2e.mjs` en el scratchpad (servidor estático propio + `chrome-headless-shell` del cache de Playwright manejado por CDP con `node --experimental-websocket`; no se instaló nada). Todo pasa:
- `/es` sin elegir: 0 requests a GA/Pixel, sin `window.gtag/fbq/dataLayer`, banner con Aceptar y Rechazar, nada en `sessionStorage`/`localStorage`, link de registro sin atribución, navegar dentro de `/es` sigue sin requests.
- Aceptar: pide `gtag/js?id=...` y `fbevents.js`; `dataLayer` = `consent default` (los 4 `denied`) → `consent update` (los 4 `granted`) → `js` → `config`; `et_consent_v1=granted`; el banner se va y queda "Preferencias de cookies"; el link de registro lleva `utm_source`, `fbclid`, `landing=/es/`, `ft`.
- Recargar con `granted`: carga directo sin banner. "Preferencias de cookies": revoca (`update` denied) y vuelve el banner. Rechazar: `denied`, y ni `/es` ni `/` vuelven a cargar nada.
- Argentina limpia: carga GA y Pixel sin banner y sin comandos `consent`; el link de la sede lleva `branchId`, `utm_source`, `utm_medium`, `gclid`, `promo`, `landing`, `ft`.
- Navegación SPA AR → `/es/sedes/barcelona` sin consentimiento: `consent update` denied y ninguna vista de `/es` enviada.

## Mutation testing (hecho, honesto)

**1. Verificador sobre copias de `.output/public` (34 mutantes, `mut06/out-mutants.py`): 31 mueren, 3 sobreviven y deben.**
- hreflang: sin es-AR, es-ES apuntando a otra página, x-default a ES, link duplicado, barra final en `/es/`, canonical distinto, `es/planes` sin hreflang, `es/planes` con es-ES a `/es` (no recíproco), página AR de un par sin objetivo, falta `es/index` o `es/planes`, sede AR y sede Barcelona con hreflang.
- lang: `es/index` en es-AR, `index` en es-ES, sede de Barcelona con `lang="es"`, sede AR con `lang="es"`.
- consentimiento sin aceptar: `<script src=gtag/js>` en `es/index`, `fbevents.js` en `es/planes`, `gtag()` y `dataLayer` inline en `es/primera-clase-gratis`, `fbq('init')` inline en `es/sedes/barcelona`, `preconnect` a google-analytics, `preload` a googletagmanager, `<noscript><img facebook.com/tr>`; y los mismos `<script>` estáticos en `index.html` y en una sede AR.
- Smart App Banner: sin meta, id equivocado, sin meta en `es/index`, meta duplicada.
- Equivalentes que sobreviven (3, correcto): la palabra `hreflang="es-AR"` en texto visible de una página fuera de par (el parser mira solo `<link>`), "gtag" como palabra suelta en texto, `lang` en `404.html` (los shells no cuentan).
- **Reciprocidad probada de forma independiente:** con una copia del verificador SIN el chequeo de pares, el chequeo de reciprocidad solo atrapa 3/3 (`es/planes` sin hreflang, AR apuntando a una página inexistente, `es/planes` con es-AR hacia otra página).

**2. Verificador sobre el código fuente + regenerar (16 mutantes, `mut06/gen-mutants.py`): 14 mueren, 2 equivalentes.**
- Mueren: `usePageSeo` sin hreflang, par `/planes` fuera del source, home AR sin hreflang, `app.vue` con `lang="es"`, sin `apple-itunes-app`, id equivocado, `es/index` sin `lang`, `usePageSeo` y `useSedeSeo` sin `es-ES`, `<script gtag>` en el head de `es/index` (vía `useHead`), `fbq` inline en `es/planes`, `es/index` sin hreflang, sede ES con hreflang de la home, `<script fbevents>` estático en el layout.
- Equivalentes: quitar `/es` de `prerenderRoutes` (la página se genera igual, muy probablemente porque el crawler de nitro sigue los links, hreflang incluidos; el verificador testea existencia) y la rama `path === "/"` de `absolute()` (código muerto: `SITE_URL + "/"` es lo mismo; se eliminó).

**3. Loader, plugins, `useAnalytics`, `useConsent` contra un `window` falso (101 aserciones, `mut06/harness.mjs`; 54 mutantes, 54 mueren).**
Cubre el orden exacto de `dataLayer` (default denied x4 antes de `config`, update granted después), `arguments` y no arrays, Pixel revoke → init → grant → PageView, guardas de doble carga e id vacío, `analyticsMode` (ES sin elección / rechazado / aceptado, AR rechazado, `/espacio` no es ES), deny/restore idempotentes, flujos de plugin (`/es` sin consent nada, aceptar carga una vez con una sola vista, retirar revoca, AR→ES revoca sin vista, ES→AR carga o restaura con una sola vista, ES con `granted` guardado no duplica la vista inicial, AR inicial conserva el comportamiento previo de doble vista), `useAnalytics` sin eventos en `/es` sin consent, y `useConsent` (persistencia, valor inválido, storage de otras pestañas, un solo listener, `cleanup`, sin `localStorage`). Mutantes: sin `consent default`, default granted, falta cada uno de los 4 parámetros, default después de config, sin update, Pixel sin revoke / sin grant / grant antes de init, ES unknown o denied tratado como granted, ES siempre `none`, rechazo ignorado en AR, `isEsPath` por prefijo o sin `/es` raíz, deny/restore anulados, sin guarda de doble carga, `dataLayer` con arrays, id vacío carga igual, plugins sin `watch` / sin deny en `afterEach` / sin restore / sin dedupe / con dedupe en AR inicial (cambia AR) / sin modo es-granted / cargando en `/es` sin consentimiento, `useAnalytics` sin guarda (x4), `useConsent` (x8).

**4. `useAttribution` (36 aserciones, `mut06/harness-attr.mjs`; 32 mutantes: 31 mueren en el harness y 1 en el navegador).**
Cubre captura completa, no pisar, referrer interno (`eltemplo.org`, `www`, `app.`) vs externo (`eltemplo.org.evil.com`, `noeltemplo.org`), referrer inválido, tráfico directo, truncado a 255, vacíos y blancos, `sessionStorage` manipulado (claves ajenas, no-strings, JSON inválido), `/es` unknown/denied/granted, first-touch de AR no reenviado en `/es` sin consentimiento, sin `sessionStorage` (solo URL), espera al `onMounted` del componente, fuera de componente no espera. El único mutante que el harness no ve (quitar la dependencia reactiva de `version`) muere en el navegador real.

**5. Navegador real (5 mutantes, `mut06/e2e-mutants.py`): 5 mueren.** Sin dependencia reactiva (el link no se decora al aceptar), sin gating de montaje (rompe la hidratación: el link de AR no se decora), `denyConsent` anulado (AR→ES no revoca), banner que no desaparece tras elegir, layout sin banner.

## Deltas de gates de tenancy

Ninguno (solo web: sin tabla, ruta ni job de la API).

## Deviations from Plan

### Auto-fixed / agregado

**1. [Rule 1 - Bug] La atribución no llegaba a los links tras hidratar (lo detectó el navegador real)**
- **Found during:** verificación en Chrome. El plan decía "actualizar el `href` en `onMounted`" y mi primer diseño gateaba por un `app:mounted` global.
- **Issue:** la navegación inicial del router termina antes de hidratar, así que el primer render del componente ya veía la atribución (el estado global había cambiado antes de la hidratación), difería del HTML estático y Vue (en producción) no corrige atributos distintos al hidratar: el link quedaba sin `utm_*` para siempre.
- **Fix:** `useAttribution()` dentro de un componente devuelve `{}` hasta el `onMounted` de ese componente; `refresh()` (plugin: cambio de consentimiento, navegación) recalcula. Cubierto por harness y por el mutante E2.
- **Commit:** `de7074b8a`

**2. [Rule 2 - Critical] `useAnalytics` ignoraba el consentimiento**
- Si GA4 ya estaba cargado por Argentina, un `trackEvent` en `/es` habría seguido mandando pings con el consentimiento revocado. `useAnalytics` ahora decide con `analyticsMode(window.location.pathname, getConsent())`. `getConsent()` es un espejo en memoria porque los formularios llaman `useAnalytics()` dentro de handlers async, donde `useState` falla.
- **Commit:** `0135a3f4e`

**3. [Rule 2 - Critical] Retirar el consentimiento**
- RGPD pide que retirarlo sea tan fácil como darlo: `ConsentBanner` muestra un botón discreto "Preferencias de cookies" en `/es` tras elegir; vuelve a preguntar y el plugin revoca. `useConsent` también sincroniza el estado entre pestañas (evento `storage`).
- **Commit:** `0135a3f4e`

**4. [Rule 2 - Critical] El rechazo se respeta en todo el sitio, y la navegación SPA entre países se maneja**
- AR→`/es` por SPA revoca (`denyConsent`) y vuelve a conceder al regresar a AR (`restoreConsent`, solo lo que se revocó); ES→AR carga (modo `none`) si no se rechazó. El plan solo definía la carga inicial.
- **Commit:** `0135a3f4e`

**5. [Rule 1 - Bug] `dataLayer` recibe objetos `arguments`**
- El plugin original hacía `dataLayer.push(args)` (array). gtag.js solo procesa objetos `arguments` (snippet oficial); el loader nuevo los usa en los dos modos. Para Argentina es equivalente o más correcto: **verificar en GA4 Realtime después del deploy** que el tráfico AR sigue entrando igual (no se pudo probar contra Google en este entorno).
- **Commit:** `0135a3f4e`

**6. Mejoras de alcance menor**
- `usePageSeo`/`useSedeSeo` fijan `lang es-ES` y hreflang por ruta, así que `pages/planes.vue` y `pages/primera-clase-gratis.vue` no se tocaron.
- `isEsPath` vive en `analytics-loader.ts` (el plan lo pide ahí); `utils/es-path.ts` existió en el primer commit y se borró en el segundo por el aviso de auto-import duplicado de Nuxt.
- `pages/disciplinas/[slug].vue` también decora su link "Reservá online" (el plan solo listaba sede y primera clase).
- El chequeo de consentimiento del verificador, además de `es/`, rechaza etiquetas `<script>`/`<link>` estáticas de GA4/Pixel en cualquier HTML (en Argentina también se cargan solo desde el cliente).
- El chequeo `lang` ignora los shells sin `<head>` de la app (`200.html`, `404.html`) y los redirects de `routeRules` (`meta refresh`): no son páginas con contenido.
- Copy ES neutro en los textos de CTA de los componentes compartidos (`SedeDetail`, `PrimeraClaseGratisContent`, `PlanesContent`) vía `country`; ver pendientes.

## Issues Encountered / Lecciones para los planes siguientes

1. **Hidratación: nunca calcular en cliente un atributo que difiere del HTML estático antes del `onMounted` del propio componente.** `app:mounted` no sirve (probado: el estado ya había cambiado cuando la página hidrató, y el link quedó sin decorar; la causa exacta del orden no se investigó más). Vue en producción mantiene el atributo del servidor sin avisar.
2. **Hay un Chrome utilizable en este entorno sin instalar nada:** `/home/franco/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`, manejado por CDP con `node --experimental-websocket` (Node 20). **No pasar `--user-data-dir`** (con ese flag no hace ningún request de red) y limpiar `localStorage`/`sessionStorage` al arrancar (usa el perfil por defecto). `Runtime.evaluate` ve `innerText` en mayúsculas si el CSS lo transforma: usar `textContent`. Harness reutilizable: `mut06/e2e.mjs` (requiere `generate` con `NUXT_PUBLIC_GA4_ID`/`NUXT_PUBLIC_META_PIXEL_ID` de prueba; volver a generar sin ellos).
3. `useState` no se puede llamar fuera de contexto Nuxt (handlers async): para estado leído ahí, espejo en memoria (`getConsent()`).
4. `useHead({ link })` rechaza una `interface` (falta firma `data-*`): usar `type`.
5. Nuxt auto-importa `utils/`: dos exports con el mismo nombre dan aviso; definir cada función en un solo archivo.
6. `/es` se genera aunque falte en `prerenderRoutes` (probablemente el crawler de nitro sigue los `<link rel="alternate" hreflang>`): el verificador testea existencia, no la lista.
7. **El aviso de consola "Multiple pixels with conflicting versions" ya existía en la base** (el stub del Pixel que viene del plan 195-03 no define `window._fbq` como el snippet oficial); lo reproduje con el plugin original. No afecta el funcionamiento ni lo cambia este plan. Si molesta: `window._fbq ??= n` en `ensureFbq()`.
8. **Contrato de `useAttribution` para otros planes:** `buildRegisterUrl({...}, registerParams())` dentro de un `computed` (nunca en `<script>` plano) y `registerParams` de `const { registerParams } = useAttribution()` en setup del componente.
9. Harnesses (scratchpad, sin commitear): `mut06/harness.mjs` (loader, plugins, `useAnalytics`, `useConsent`), `harness-attr.mjs`, `src-mutants.py`, `attr-mutants.py`, `out-mutants.py`, `gen-mutants.py`, `e2e.mjs`, `e2e-mutants.py`.

## Pendientes para Franco (UAT y decisiones)

1. **UAT manual en un navegador real (Barcelona):** en `/es`, DevTools › Network sin requests a `googletagmanager.com` ni `facebook.net` hasta pulsar Aceptar; con Aceptar aparecen; con Rechazar no aparecen nunca. Ya se verificó con Chrome headless y IDs de prueba; falta contra los IDs reales de producción y con las extensiones/CMP del usuario.
2. **Los IDs `NUXT_PUBLIC_GA4_ID` y `NUXT_PUBLIC_META_PIXEL_ID` de producción** viven en los secrets de CI (D-04, plan 195-11). Sin ellos, GA4 y el Pixel no cargan en ningún país (comportamiento previo).
3. **GA4 Realtime después del deploy:** confirmar que el tráfico de Argentina sigue entrando (deviation 5: `arguments` en vez de arrays).
4. **`/privacidad` no menciona Google Analytics ni Meta Pixel para Barcelona** (el banner enlaza a esa página). Hace falta revisar el texto legal; yo no lo toqué.
5. **El chrome compartido de `/es` sigue en voseo argentino:** el menú y el footer (`AppNav`, `AppFooter`, `AppPrefooter`) son los mismos para todo el sitio ("Entrená", "Probá", etc.) y los textos de `data/planes.ts` también ("Elegí turnos fijos o libres...", "todas las sedes"). `/es/planes` muestra el catálogo argentino sin precios; Barcelona tiene su propio catálogo y precisa su contenido.
6. **Nadie enlaza `/es` desde el sitio argentino** (solo `hreflang`, el sitemap y `/sedes`). Si se quiere un acceso visible para personas, hace falta un selector de país o un link en el footer.
7. **Barcelona sin consentimiento pierde la atribución** (decisión de diseño por RGPD): las altas que vengan de campañas en `/es` y rechacen el banner llegan sin `utm_*`. La atribución propia de D-18 es entonces una medición parcial en España.
8. Si el visitante de `/es` llega con `?utm_*` y acepta el banner después de navegar por la SPA, el first-touch se captura en la URL del momento de aceptar (los `utm_*` de la URL inicial ya no están).
9. Los contenidos de `/es` (home, método, niveles, copy de primera clase) son una redacción en español neutro a partir del texto publicado: revisar tono y exactitud.

## Known Stubs

Ninguno nuevo. `/es/planes` reutiliza el catálogo de `data/planes.ts` (ver pendiente 5): está documentado como contenido a completar, no como stub funcional.

## Threat Flags

Ninguno nuevo. T-195-20 (RGPD) mitigado con modo básico + revoke/restore + chequeo (c) + prueba en navegador real; T-195-21 (first-touch en `/es`) mitigado sin persistir ni reenviar sin consentimiento; T-195-22 (tampering de utm/referrer) mitigado con whitelist de claves, truncado a 255 y `URLSearchParams` (la API vuelve a validar en 195-07); T-195-23 aceptado.

## Self-Check: PASSED

- Archivos creados existen y los commits `bf7dd1338`, `0135a3f4e`, `de7074b8a` están en `git log`.
- `CookieConsent.vue` y `utils/es-path.ts` no existen; sin referencias a `CookieConsent`.
- Worktree limpio salvo este SUMMARY; sin `.data/`, `dist` ni harnesses commiteados (están en el scratchpad `mut06/`).
