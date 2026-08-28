---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 05
subsystem: docs
tags:
  [design-doc, multitenancy, member-facing, security, stride, cors, subdomain]

# Dependency graph
requires:
  - phase: 181-04
    provides: "Doc 08 con esqueleto + H-1..H-4 + Definiciones 1-7 completas (verificador en 0 fallas)"
provides:
  - "DIS-02 (dos superficies, stack/nombre/subdominio/branding/tiendas de la app de alumnos, costo en el monorepo)"
  - "Seguridad del diseño (STRIDE): fronteras de confianza, categorías ASVS, registro de 9 amenazas con disposición explícita"
affects: [182-wizard-alta-tenant, 189-192-app-de-alumnos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolución de tenant por Host (H-3) + login scoped, anterior a attachScope"
    - "CORS como función de origin con anclaje ^https://[a-z0-9-]+\\.<dominio>$, nunca endsWith"
    - "Branding en runtime: setCssVar sobre --q-* + tokens propios como CSS custom properties (nunca SCSS)"
    - "Publicación en tiendas: un solo binario multi-tenant, picker + Preferences (modelo 4.2.6)"
    - "Subcarpeta pages/gimnasio/ en el-templo-admin, primera excepción al patrón plano"

key-files:
  created: []
  modified:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md

key-decisions:
  - "Nombre de la app de alumnos: 'Kaia' (directorio el-templo-alumnos-kaia, appId org.eltemplo.kaia como placeholder hasta que el dominio de plataforma se registre)"
  - "Corrección de conteo: el monorepo tiene 4 apps hoy (api/app/admin/web), la de alumnos es la QUINTA, no la cuarta"
  - "Timing de publicación en tiendas: web/PWA por subdominio primero (habilita ONB-01 sin depender de review); build de tiendas cuando exista un tenant pago que la pida o el volumen de gimnasios lo justifique"
  - "Riesgo del manifest.json por subdominio: se verifica antes de comprometer D-12(a); fallback = manifest genérico de plataforma en v1 si no es viable"
  - "CORS pasa de allowlist estática a función con anclaje estricto; endsWith prohibido explícitamente"
  - "Registro STRIDE: 9 amenazas, 2 nuevas por D-06 (host header injection, CORS laxo), todas con disposición mitigate salvo 'privacidad profe→alumno' (accept, decisión de producto brief §9)"

requirements-completed: [DIS-02]

duration: 55min
completed: 2026-08-27
---

# Phase 181 Plan 05: DIS-02 (superficie member-facing) + Seguridad del diseño (STRIDE) Summary

**Decidió dónde vive cada superficie del módulo Gimnasio (staff en `el-templo-admin`, alumnos en
la quinta app del monorepo, "Kaia", Quasar+Vue+Capacitor con PWA), bajo qué dominio, con qué
branding en runtime y qué modelo de publicación en tiendas — y escribió el registro STRIDE de
las amenazas que esa superficie nueva introduce, con las dos amenazas nuevas del subdominio
(host header injection, CORS laxo) mitigadas explícitamente.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2/2 completadas
- **Files modified:** 1

## Accomplishments

- **DIS-02** completa: las dos superficies (staff gateado por `module.gimnasio.enabled` en
  `el-templo-admin`, convención `pages/gimnasio/`; alumnos en app nueva); corrección de conteo a
  cuatro apps actuales + la de alumnos como quinta; constancia literal `no se transforma` sobre
  `el-templo-app` + prohibición explícita de clonarla; stack y estructura de la app nueva con
  versiones reales del repo; nombre elegido ("Kaia", con directorio/nombre de tienda/appId);
  subdominio (D-06) con DNS-01/cert wildcard y el dominio de plataforma nombrado como
  precondición no resuelta de la fase 182; CORS como función anclada, nunca `endsWith`;
  publicación en tiendas citando 4.2.6 ("picker")/4.3, los límites de `setAlternateIconName`/
  `CFBundleDisplayName`, y el timing decidido; branding en runtime con `setCssVar`/CSS custom
  properties y el riesgo abierto del manifest por subdominio con su fallback; costo exacto de la
  quinta app en CI/deploy/EC2; consecuencia colateral del push dormido.
- **Seguridad del diseño (STRIDE)** completa: tabla de 5 fronteras de confianza; tabla de 7
  categorías ASVS aplicables (V2, V3, V4 eje central, V5, V6 no aplica, V7, V13) con el control
  concreto de este repo; registro STRIDE de 9 amenazas (incluidas las 2 nuevas de D-06) con
  disposición explícita y mitigación concreta citando helper/header/índice/código de estado; y
  el cierre con la prohibición para siempre del fallback de tenant (`?? 1` / non-null assertion).

## Task Commits

1. **Tasks 1-2: DIS-02 y Seguridad del diseño** - `2da57adc` (docs) — un solo commit, ambas
   secciones son contiguas en el mismo archivo (mismo patrón que 181-02/03/04: docs-only,
   verificación conjunta con `verificar-doc-08.sh`).

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — reemplazados los dos stubs
  `_PENDIENTE_` de `## DIS-02` y `## Seguridad del diseño (STRIDE)` por las secciones completas
  (293 líneas netas agregadas). Las secciones `Frontera A1/A2`, `Trazabilidad REQ`,
  `Decisiones heredadas` y `Registro de cambios` quedaron intactas como stub, a completar en el
  plan 181-06.

## Decisions Made

Ver `key-decisions` en el frontmatter. Todas dentro de la discreción que el CONTEXT deja abierta
("proponer el nombre en el doc", "el timing de la primera publicación lo especifica el doc") —
ninguna re-litiga D-03/D-04/D-05/D-06/D-11/D-12, que se citan y formalizan, no se re-discuten.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. Una corrección menor de precisión sobre el propio
`read_first` del plan: el `read_first` de la Task 1 decía que `el-templo-admin/src/pages` es
"plano salvo `tv/`"; verificado con `find el-templo-admin/src/pages -type d`, hoy no existe
ninguna subcarpeta (ni `tv/`) — las páginas de TV (`TvControlPage.vue`, `TvScreenPage.vue`) son
archivos planos como el resto. El doc quedó escrito con el hecho verificado ("completamente
plana... sin ninguna subcarpeta"), no con la premisa del `read_first`, para no dejar una
afirmación falsa verificable en el propio doc. No es una desviación de Rule 1-4 (no hay bug ni
blocker): es una corrección de precisión sobre una nota de contexto, documentada acá porque
`pages/gimnasio/` se presenta como "primera excepción al patrón plano", y esa frase depende de
que el hecho sea exacto.

## Self-Check: PASSED

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — FOUND, contiene `## DIS-02 —
Superficie member-facing multi-tenant` y `## Seguridad del diseño (STRIDE)` completas, sin
  `PENDIENTE`.
- Commit `2da57adc` — FOUND en `git log`.
- `git show --stat HEAD` — un solo archivo, 293 inserciones / 2 borrados, coincide con lo
  reportado.
- `pnpm exec prettier --check` sobre el doc — sale 0.
- `bash verificar-doc-08.sh` (sin `--final`) — 0 fallas.

## Verificación (salida completa)

```
OK: C1 - el archivo .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md existe
OK: C2 - hay 7 secciones '## Definición N —' (7)
OK: C3 - hay 4 subsecciones '### H-N' (4)
OK: C4 - todas las secciones de Definición trazan a al menos un REQ ID
OK: C5 - constancia de que el-templo-app no se transforma
OK: C6 - constancia del trigger de split de repos
OK: C8 - prettier --check pasa

Resumen: 0 falla(s).
```

Exit code: 0.

Checks del plan (además del script genérico):

- Sección DIS-02: 196 líneas (≥70 requerido).
- `no se transforma` — 2 ocurrencias.
- Las cuatro apps por nombre (`el-templo-api`, `el-templo-app`, `el-templo-admin`,
  `el-templo-web`) presentes; `quinta` — 2 ocurrencias.
- `setCssVar` (5), lista de nombres válidos de Quasar presente, `pwa: true` (2),
  `CSS custom properties` (2), `@capacitor/preferences` (2), `4.2.6` (4) + `picker` (6) +
  `4.3` (1), `setAlternateIconName` (1), `CFBundleDisplayName` (1), `DNS-01` (3) + `HTTP-01` (1),
  `^https://` (3) + `endsWith` (4), `VITE_API_URL` (1) + "ningún vhost de front proxea `/api`"
  (1), `paths-filter` (2) + `event.before` (1) — todos ≥1.
- Nombre elegido con directorio/nombre de tienda/appId (no solo candidatos) — presente.
- Timing de primera publicación en tiendas — decisión explícita presente.
- Riesgo del `manifest.json` por subdominio con fallback — presente.
- Prohibición explícita de clonar `el-templo-app` — presente.
- REQ IDs únicos entre `## DIS-02` y `## Seguridad del diseño`: **5** (`DIS-02`, `ONB-01`,
  `PLAT-02`, `PLAT-03`, `REG-01`) — ≥3 requerido (acceptance criteria pedía ≥1 en verify).
- Sección Seguridad del diseño: 40 líneas (≥30 requerido); 3 tablas markdown (27 líneas `|` en
  el rango); registro STRIDE con 9 filas, todas con disposición explícita
  (`mitigate`/`accept`).
- `Host header` (1), `proxy_set_header Host` (2), `tenantValues` (4), `client_set_uid` (8),
  `404` (3), `ISO-03` (1) — todos ≥1.
- ASVS `V2` (1), `V3` (1), `V4` (2), `V5` (1), `V7` (1), `V13` (1) — todos ≥1.
- Prohibición explícita del fallback de tenant (`?? 1` / non-null assertion) — presente en la
  sección de cierre.
- `git status --porcelain` fuera de `.planning/` — vacío; ningún directorio de app nuevo, ningún
  cambio en `.github/workflows/`.

## Nota sobre el commit y `.gitignore`

`.docs/` está gitignored a nivel repo. `git add .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`
imprime el warning "The following paths are ignored" (el `add` explícito devuelve exit 1), pero
el archivo (ya tracked desde el plan 181-01) queda commiteado igual al pasarlo como pathspec de
`git commit -m ... <archivo>`. El hook `lint-staged` corre `prettier --write` sobre el archivo
(ya formateado, sin cambios) y falla al intentar re-stagearlo por el mismo motivo de
`.gitignore` — pero el commit se completa igual con el contenido correcto (293 inserciones
exactas, sin archivos extra), mismo comportamiento ya documentado y verificado en los planes
181-02/03/04.
