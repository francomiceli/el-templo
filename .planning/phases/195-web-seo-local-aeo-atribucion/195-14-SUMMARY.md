---
phase: 195-web-seo-local-aeo-atribucion
plan: "14"
subsystem: docs + api-scripts
tags: [guia, maps, migracion-datos, prompts-ia, rollout, capi]
requires: ["195-13"]
provides:
  - "parseMapsLink / precisionOk / isGoogleMapsUrl / isShortMapsUrl (puros) en el-templo-api/src/modules/web-public/maps-link.ts"
  - "scripts/sedes-maps-a-migracion.ts: JSON de links de Google Maps a la migracion 0275 (resuelve links cortos, exige 5 decimales, no pisa archivos)"
  - "docs/guia-195-web-seo-atribucion.md: guia final D-23 (631 lineas), ordenada por prioridad"
  - "docs/planilla-prompts-ia.csv: 25 prompts para la medicion mensual de visibilidad en IA"
affects: []
tech-stack:
  added: []
  patterns:
    - "Script local con logica exportada y main() solo bajo require.main === module (como gbp-list-locations.ts)"
    - "Allowlist de hosts en dos niveles: destino final (isGoogleMapsUrl) y saltos intermedios (isShortMapsUrl), validada ANTES de cada pedido"
key-files:
  created:
    - el-templo-api/src/modules/web-public/maps-link.ts
    - el-templo-api/scripts/sedes-maps-a-migracion.ts
    - el-templo-api/scripts/sedes-maps.example.json
    - el-templo-api/test/unit/maps-link.test.ts
    - el-templo-api/test/unit/sedes-maps-a-migracion.test.ts
    - docs/guia-195-web-seo-atribucion.md
    - docs/planilla-prompts-ia.csv
  modified:
    - deploy/ROLLOUT-195.md
decisions:
  - "SIN bump de version (Franco 2026-10-07): la guia dice 'build de tienda nueva, version a definir por Franco al armar el release'. No se toco version.txt ni package.json"
  - "La guia se ordena por prioridad (publicacion, medicion, bloque C) y no por el orden 1-12 del plan; las 12 secciones del plan estan todas, mas una seccion 5 de contenido propia y el checklist final"
  - "Un link de Maps cuyo largo supera los 500 caracteres de branches.maps_url (o trae punto y coma, barra invertida, control o -->) se guarda como link canonico de busqueda con las coordenadas ya validadas, con un aviso"
metrics:
  tasks: 2
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 14: Guia final, generador de datos de sedes y planilla de prompts Summary

Cierra la fase 195: `Franco` tiene una guia unica en lenguaje simple con todo lo que le toca hacer (cada paso dice en que secret, pantalla del admin, archivo o migracion se carga el resultado), un comando que convierte los links de Google Maps de las sedes en la migracion `0275_sedes_maps_franco.sql`, y la planilla mensual de 25 prompts de IA.

## Commits

| Hash        | Mensaje                                                             |
| ----------- | ------------------------------------------------------------------- |
| `bf8cffabf` | feat(195-14): generador de datos exactos de sedes                   |
| `8acd202af` | docs(195-14): corregir el orden de activacion de CAPI en el rollout |
| `9207d70c9` | docs(195-14): guía final de Meta, Google y bloque C                 |

## Verificacion

Todo en foreground. Tests unit sin DB (no se tocaron la DB ni la red).

| Chequeo                                                                                                        | Resultado                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest run --config vitest.config.unit.ts test/unit/maps-link.test.ts`                                        | 22/22                                                                                                                                                                |
| `vitest run --config vitest.config.unit.ts test/unit/sedes-maps-a-migracion.test.ts`                           | 45/45                                                                                                                                                                |
| `npx tsc --noEmit` (api)                                                                                       | verde                                                                                                                                                                |
| `tsc` standalone del script (`--module nodenext ... scripts/sedes-maps-a-migracion.ts`)                        | verde                                                                                                                                                                |
| `pnpm lint:tenant`                                                                                             | DISCREPANCIAS: 0 (el script lleva la anotacion `tenant-safe`)                                                                                                        |
| `pnpm typecheck:tests`                                                                                         | DISCREPANCIAS: 15 (igual que la base, ninguna en archivos de este plan)                                                                                              |
| `test ! -e el-templo-api/src/db/migrations/0275_sedes_maps_franco.sql`                                         | OK, no existe                                                                                                                                                        |
| Numeros de migracion 0275/0276 libres en todas las ramas                                                       | si (maximo ocupado: 0274)                                                                                                                                            |
| `<verify>` de la Task 2 (>= 250 lineas, 17 palabras clave, >= 20 prompts)                                      | OK: 631 lineas, 25 prompts, 9 columnas en todas las filas                                                                                                            |
| `grep -c "se carga en"` de la guia                                                                             | 34 (minimo 15)                                                                                                                                                       |
| Acceptance greps del script (`redirect: "manual"`, `0275_sedes_maps_franco`, `maps.google.com`, `precisionOk`) | todos >= 1                                                                                                                                                           |
| Ejecucion real del CLI con un JSON temporal (links largos, sin red)                                            | tabla correcta, `--write --out=<scratchpad>` escribe el SQL esperado, la segunda corrida se niega a pisarlo, un JSON con problemas sale con exit 1 y no escribe nada |
| El SQL generado pasa por `splitSqlStatements` (el mismo parser del runner)                                     | si: una sentencia por sede, sin `;` en comentarios                                                                                                                   |
| Guia sin valores de secrets ni tokens                                                                          | si (solo formatos de ejemplo `G-XXXXXXXXXX`, un telefono de ejemplo ficticio y el codigo `TEST12345`)                                                                |

No se llamo a Google ni a Meta en ningun momento: `fetch` va mockeado en los tests y el CLI solo se corrio con links largos.

### Mutation testing (honesto)

Harness `mut14/mut.py` del scratchpad (sin commitear), baseline verde antes y archivos restaurados despues (verificado byte a byte). 27 mutantes sobre `maps-link.ts` y el script (26 muertos al final, 1 equivalente):

- **Muertos en la primera pasada (23):** prioridad `@` sobre `!3d`, `isGoogleMapsUrl` aceptando cualquier `*google.com`, precision >= 4, 0,0 aceptado, https no exigido, `place_id:` ignorado, un salto de mas (`>` por `>=`), `redirect: "follow"`, destino no corto sin validar, sin escape de comilla simple, sin escape de barra invertida, sin `tenant_id` en el WHERE, sin separador entre sentencias, Place ID del link ganando sobre el del JSON, telefono 7 y 17 caracteres, borde de 500 caracteres, `;` fuera de la lista de caracteres inseguros, campos desconocidos aceptados, error de precision anulado, codes repetidos aceptados, CP de 21, entrada vacia nunca saltada, `toFixed(7)` en longitud, lat/lng en el borde del rango.
- **Sobrevivieron al primer intento y obligaron a mejorar tests (3):** limite de latitud 91 (agregue 90.5/-90.5/180.5/-180.5), `toFixed(7)` en latitud (el `toContain` matcheaba el prefijo: ahora exige la coma o el salto de linea) y el segundo del `tenant_id` (mi mutante no matcheaba el texto formateado por prettier: rehecho). Con esas correcciones los tres mueren (26 de 27).
- **Equivalente que sobrevive (1):** `flag: "wx"` por `"w"` en `writeFileSync`. Es solo proteccion contra una carrera entre el `existsSync` previo y la escritura (el chequeo explicito ya cubre el caso normal, probado con el CLI).

## Deltas de gates de tenancy

Ninguno (sin tablas, rutas ni jobs). Baselines intactos: `GYM_OWNED_TABLES` 103, `schemaTables` 107, `gymOwnedChecked` 103, 0196 Test 10: 103, `ENTRADAS_BASELINE` 450, `JOBS_ESPERADOS` 11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `deploy/ROLLOUT-195.md` seccion 4 pedia validar CAPI sin `META_CAPI_START_AT`, pero sin esa fecha CAPI no envia nada**

- **Found during:** Task 2 (armando el orden de activacion de la guia, leyendo `meta/config.ts`: `getMetaCapiConfig()` devuelve `null` si falta `META_CAPI_START_AT`).
- **Issue:** el rollout (195-11) y el summary de 195-08 decian "cargar el codigo de prueba SIN la fecha, validar en Probar eventos, despues borrar el codigo y cargar la fecha". Siguiendo eso nadie veria nunca un evento de prueba.
- **Fix:** el orden correcto es: token, pixel y cuentas (se prende solo el gasto) -> codigo de prueba + fecha juntos y validar -> borrar el codigo. Confirmado en `capi-service.ts` que con codigo de prueba los eventos se marcan `sent` (por eso la ventana de prueba debe ser corta y esos eventos no se reenvian). Corregido en `ROLLOUT-195.md` (renumerando la lista) y escrito asi en la guia.
- **Commit:** `8acd202af` (prettier reformateo ademas las tablas de ese archivo: ruido de formato, lo habria hecho el hook igual).

**2. [Rule 2 - Critical] Limite de 500 caracteres de `branches.maps_url` y caracteres inseguros en el link**

- El plan decia "maps_url = link largo resuelto". Un link largo de Google puede pasar los 500 caracteres (la columna es `varchar(500)`) y la migracion fallaria o truncaria. Ademas un `;`, una barra invertida o un caracter de control romperian el SQL (T-195-59).
- **Fix:** si no entra o trae esos caracteres, se guarda el link canonico `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>[&query_place_id=<id>]` con las coordenadas ya validadas, y el script avisa. `sqlString` escapa comillas simples Y barras invertidas. **Commit:** `bf8cffabf`.

**3. [Rule 2 - Critical] Validaciones extra del JSON de entrada**

- Codes fuera de la lista (CONST, JUJUY, MORENO, ALEM, ALBERTI, MOGOTES, BCN, PARK), repetidos, campos desconocidos (un `telefono` en vez de `phone` se habria ignorado en silencio), valores que no son texto, Place ID con charset acotado, y telefono normalizado (se sacan espacios, guiones, puntos y parentesis antes de validar 8-16 caracteres) para que un equipo no tecnico pueda escribir `+54 223 ...`. **Commit:** `bf8cffabf`.

**4. [Rule 2] Segundo archivo de tests**

- El plan nombra solo `test/unit/maps-link.test.ts`. Agregue `test/unit/sedes-maps-a-migracion.test.ts` (45 casos con `fetch` mockeado) porque el script tiene logica critica (allowlist de hosts, saltos, SQL) y CLAUDE.md exige tests (mismo criterio que `gbp-scripts.test.ts` en 195-09). **Commit:** `bf8cffabf`.

**5. Estructura de la guia**

- Por pedido del orquestador la guia se ordena por prioridad (publicacion, medicion, bloque C) y no por el orden del plan. Estan las 12 secciones del plan, mas "Contenido" separado como seccion 5 y el checklist al final. El plan decia "build 1.9.0": la guia dice "build de tienda nueva (version a definir por Franco)".
- Agregue al plan, por pedido del orquestador: decisiones abiertas (Moreno D-30, bio de Ignacio, HSTS), telefonos reales antes de `apply`, marcador legal de `/privacidad`, lista de contenido de 195-05, altas viejas `unknown`, convencion de campanas de Meta.

**6. Parser: extensiones menores sobre los formatos del plan**

- Acepta tambien coordenadas pegadas en la ruta (`/maps/place/<lat>,<lng>`) y `place_id=` como parametro, ademas de los formatos listados. Un 0,0 y cualquier coordenada fuera de rango dan null (sin caer a un candidato de menor prioridad). Los links de `google.com.ar` o de consentimiento (`consent.google.com`) se rechazan a proposito: el mensaje pide pegar el link largo desde el navegador.

## Pendientes de Franco (los 5 primeros y el resto, tal como estan en la guia)

1. **DNS:** saber quien administra el DNS de `eltemplo.org` (hace falta para Search Console y Bing).
2. **`/privacidad`:** completar el marcador de razon social, NIF y domicilio de España en `el-templo-web/pages/privacidad.vue` y que lo revise un asesor legal. **Nada automatico bloquea publicar con el marcador** (el verificador no lo mira): se ve un cartel "PENDIENTE" en la pagina. Decidir quien ejecuta el proceso manual de oposicion que el texto promete.
3. **Decisiones abiertas:** Moreno (solo Yoga: sin horarios publicados y sin horarios en su ficha de Google), bio de Ignacio (10 o 20 años), HSTS (recomendado no adoptar).
4. **Datos de sedes:** links de Maps, Place ID, telefonos reales y codigos postales, `sedes-maps-a-migracion` y revision de la `0275` (los telefonos antes de `GBP_SYNC_MODE=apply`).
5. **IDs de medicion:** crear la propiedad de GA4 (`WEB_GA4_ID`) y el Pixel (`WEB_META_PIXEL_ID`, `META_PIXEL_ID`) antes del paso 2 del rollout en produccion.
6. Rollout en 2 pasos (`ROLLOUT-195.md`), probar el boton `solo-web` en staging, nginx tanda A y B (`RUNBOOK-195-NGINX.md`, cada SSH con OK).
7. Contenido (profes, planes, tags del blog, Actividades con Aura, WhatsApp de ventas, revision de `/es` que sigue en voseo).
8. Search Console y Bing por DNS, cuenta de servicio (`GOOGLE_SC_SERVICE_ACCOUNT_BASE64`).
9. Meta: usuario del sistema, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_IDS`, convencion de campañas (slug de la sede en el nombre y `utm_campaign={{campaign.name}}`), activacion de CAPI en orden (privacidad en prod, codigo de prueba con fecha, borrar el codigo), quien maneja los anuncios.
10. Fichas de Google (verificar las 7, pedir acceso a la API de Business Profile, OAuth, `GBP_*`, dry-run una semana, `apply`).
11. Apps: fingerprints de `assetlinks.json` + `pnpm check-well-known --strict`, Associated Domains y `IOS_PROVISION_PROFILE_BASE64`, build de tienda nueva (version a definir por Franco), ASO, etiquetas de privacidad, app vieja de Virtuagym. Las altas de versiones viejas llegan como `unknown`.
12. Bloque C (resenas sin gating, NAP, directorios, prensa del Parque Primavesi, bio de IG, Bing Places, Apple Business Connect, USC/ClassPass, Reddit, Wikidata), planilla mensual y etapa 2 del noindex (`Disallow`, runbook seccion D).

Extras que quedaron registrados en la guia para el equipo tecnico: retencion de `search_console_stats` sin definir, moneda de la cuenta publicitaria de Argentina (si factura en USD ajustar `COUNTRY_CURRENCY`), credenciales de Meta y Google globales (no por gimnasio), y `keep-awake` ausente en `src-capacitor/package.json`.

## Known Stubs

Ninguno. La planilla CSV tiene las columnas de resultado vacias a proposito (se completan cada mes). `sedes-maps.example.json` tiene los valores vacios a proposito (los completa Franco). La migracion 0275 NO existe en el repo: la genera Franco con sus datos.

## Recomendaciones que quedan abiertas (fuera del alcance de este plan)

- **Gate para el marcador de `/privacidad`:** agregar un chequeo a `verify-seo-output.mjs` que falle el build de produccion si el HTML de `/privacidad` contiene `PENDIENTE DE COMPLETAR`. Hoy depende de que alguien lo recuerde. No se hizo aqui (el verificador no esta en `files_modified` de este plan).
- `ROLLOUT-195.md` seccion 5 dice que nginx se aplica "despues" de la web nueva; el runbook (195-13) distingue la tanda A (se puede en cualquier momento) de la B. La guia sigue al runbook.

## Threat Flags

Ninguno nuevo. T-195-58 (la guia nombra secrets y nunca valores: revisado), T-195-59 (valores validados, comillas y barras escapadas, UPDATE keyed por code + `tenant_id = 1`, se niega a pisar, flag `wx`, revision humana antes del commit) y T-195-60 (maximo 5 saltos, host validado antes de cada pedido, destino final solo en la allowlist) mitigados y cubiertos por tests con mutation.

## Self-Check: PASSED

- Archivos creados existen: `maps-link.ts`, `sedes-maps-a-migracion.ts`, `sedes-maps.example.json`, los 2 tests, la guia (631 lineas) y la planilla (25 prompts).
- Commits `bf8cffabf`, `8acd202af` y `9207d70c9` presentes en `feat/195-seo-web`; ningun borrado de archivos en los commits.
- `0275_sedes_maps_franco.sql` no existe; sin archivos temporales en el worktree (harness y JSON de prueba en el scratchpad).
- No se toco `version.txt`, `package.json`, STATE.md ni ROADMAP.md. Sin push, sin SSH, sin llamadas a Google o Meta.
