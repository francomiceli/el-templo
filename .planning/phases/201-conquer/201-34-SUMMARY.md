---
phase: 201-conquer
plan: 34
subsystem: app/conquer (cierre técnico de los hallazgos 1 y 2)
tags: [conquer, estetica-b, limpieza, scss, test-de-tokens, uat]
requires: [201-33]
provides:
  - Conquer sin CqSky, CqSun, CqCloudButton ni bloque LEGADO en conquer.scss
  - conquer-tokens.test.ts con it.each que impide que vuelvan los tokens y clases del cielo
  - 201-UAT.md y 201-CONTEXT.md al día (D-23 estética, D-24 guía, UAT-H1)
affects: [201-35]
key-files:
  modified:
    - el-templo-app/src/modules/conquer/styles/conquer.scss
    - el-templo-app/src/modules/conquer/styles/__tests__/conquer-tokens.test.ts
    - .planning/phases/201-conquer/201-UAT.md
    - .planning/phases/201-conquer/201-CONTEXT.md
  deleted:
    - el-templo-app/src/modules/conquer/components/brand/CqSky.vue
    - el-templo-app/src/modules/conquer/components/brand/CqSun.vue
    - el-templo-app/src/modules/conquer/components/brand/CqCloudButton.vue
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 34: fuera el cielo, UAT y CONTEXT al día Summary

Se borró todo lo del cielo (3 componentes y el bloque LEGADO de la hoja), el test de tokens pasó a exigir que no vuelva, y el UAT y el
CONTEXT describen la estética nueva (D-23) y la guía (D-24). Sin migración, dependencias ni cambios de lógica.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `72eb9f07e` | `refactor(201-34): fuera el cielo, el sol y las nubes de Conquer (hallazgo 2)` |
| 2 | `9733f6a50` | `docs(201-34): UAT y CONTEXT con la estética del templo clásico y la guía (D-23, D-24)` |

El SUMMARY se commitea aparte con `docs(201-34)`.

## Qué quedó

- **Borrados con `git rm`** (ruta explícita): `CqSky.vue`, `CqSun.vue`, `CqCloudButton.vue`. El grep previo sobre todo `el-templo-app/src`
  solo los encontró a ellos mismos (más el comentario de `CqSun.vue` que nombraba `CqSky`, que se fue con el archivo).
- **`conquer.scss`**: de 731 a 460 líneas. Se quitó el segundo bloque `.cq-root` (tokens `--cq-sky*`, `--cq-gold*`, `--cq-ink*`, etc. y las
  utilidades `.cq-display`, `.cq-ital`, `.cq-caps`, `.cq-rule`, `.cq-grow`, `.cq-toast`, `.cq-link`, `.cq-cta`, `.cq-small`, `.cq-foot`) y los
  dos comentarios que hablaban del LEGADO. El archivo termina en `@keyframes cq-enter`.
- **`conquer-tokens.test.ts`**: se reemplazó el `it` "el LEGADO también vive dentro de .cq-root" (que exigía `--cq-sky1`) por el describe
  "sin restos del cielo": `it.each` de 24 tokens (`--cq-<nombre>` no definido, regex con lookbehind para que `--cq-text-gold` no cuente como
  `--cq-gold`), `it.each` de 11 clases (`.cq-foot`… `.cq-sky`, no existen como selector, con lookahead para no confundir `.cq-link` con
  `.cq-textlink`) y un `it` que exige que la hoja no diga "LEGADO". El test mira `inside + outside` (los comentarios de línea ya van filtrados).
- **UAT**: cabecera y §2.1/§6 con migraciones 0290-0294; §2.3 con el paso de la guía y el `UPDATE ... guide_seen_at = NULL`; bloque nuevo
  **UAT-H1** con las 6/5 pantallas, Saltar/Listo, reapertura desde Inicio y el criterio de uso (7, 6 y 5 → 5; Subir tras dos sesiones seguidas
  en Progreso; molestia antes de guardar, 4 o más la ve el coach); §3 "Estética" reescrita para D-23 (con la pieza oscura de cada pantalla, DA-18 y
  la portada de Bloqueado como preguntas); S12-9 sin el punto de Georgia y con los puntos a ojo de 201-29..33; §8 con la nota "Resuelto en
  201-27..201-34" en las filas 1 y 2 (y un párrafo debajo).
- **CONTEXT**: sección final "Decisiones post-UAT local (Franco, 2026-10-22)" con D-23 y D-24.

## Gates

- Tarea 1: `<automated>` imprime `OK` (grep de restos, sass compila, `pnpm lint` 0 errores y los 2 warnings preexistentes de siempre, `vue-tsc` sin
  nada en `src/modules/conquer` ni `modules/training`, `git diff origin/staging` vacío en `src/css`, `components/anatomy` y `package.json`).
- Test de tokens corrido con el shim de 201-28 (`runtok.sh`): **60/60 antes** del cambio y **95/95 después** (60 − 1 + 36). Vitest real: CI.
- Tarea 2: `<automated>` imprime `OK`; STATE.md y ROADMAP.md sin cambios.
- `prettier --check` limpio sobre `conquer.scss` y el test (el test hubo que pasarlo con `--write` una vez).

## Mutantes (shim en node sobre copias en el scratchpad; el repo no se tocó)

| # | Mutante | Resultado | `expect` de CI que lo atrapa |
| --- | --- | --- | --- |
| 1 | volver a definir `--cq-sky1: #111838;` dentro de `.cq-root` | falla "--cq-sky1 no está definido" (94/95) | `conquer-tokens.test.ts`, `it.each(TOKENS_DEL_CIELO)`: `expect(definition.test(inside + outside)).toBe(false)` |
| 2 | volver a crear `.cq-root .cq-foot { margin: 0 }` | falla ".cq-foot no existe como selector" (94/95) | `it.each(CLASES_DEL_CIELO)`: `expect(new RegExp(...).test(inside + outside)).toBe(false)` |

El mismo `.scss` real vuelve a dar 95/95 después de las dos pruebas.

## Deviations from Plan

**1. [Rule 3 - gate] El comentario de cabecera de `conquer.scss` nombraba `@fontsource`.** El verify del plan encadena con `&&` y `;`: un
`! grep "@fontsource"` fallido corta ese tramo pero el `;` siguiente hace que igual imprima `OK` (lo vi porque aparecía la línea del
grep arriba del `OK`). Se reescribió el comentario ("sin paquetes de fuentes ni CDN") y se reevaluó el verify. Lección abajo.

**2. [Anotado, fuera de alcance] `src/modules/onboarding/mockup.html` linkea Google Fonts.** El barrido `fonts\.googleapis` sobre todo `src`
lo lista. Es de la fase de onboarding (commit `8b2b66026`), no está en Conquer, nadie lo importa y no lo sirve el app. No se tocó. No
afecta al OK de la tarea (el `!` de ese tramo queda "cortado" por los `;`, igual que en el punto 1), pero 201-35 puede acotar el barrido a `src/modules/conquer`.

**3. [Anotado] "una pieza oscura por pantalla" no es literal en Hoy, Sábado y Progreso.** Hoy y Sábado tienen la cabecera oscura de cada
card de ejercicio/combo (`cq-ex__head`, `cq-combo__head`) y Progreso tiene dos KPIs oscuros más la cabecera de "Hoy toca subir". Lo anoté así en
el UAT (§3 Estética, punto 1) con la lista real para que Franco diga si es demasiado oscuro; no se cambió ninguna pantalla en este plan.

Ninguna ambigüedad de producto nueva.

## Trampas para el plan 35

1. **No queda nada del cielo**: cualquier `--cq-sky*`, `--cq-gold*`, `.cq-foot`, etc. que aparezca en el UAT visual sería una regresión y CI lo cacha.
2. El **UAT-H1** (guía) y la **estética D-23** tienen ahora una sección propia en `201-UAT.md`: 201-35 debe probar contra esas, no contra el prototipo viejo.
3. El UAT hace dos preguntas abiertas de producto para Franco: ¿la puerta "Conquer" de Entrenar queda marrón o azul noche (DA-18)? y ¿la portada
   de Bloqueado (con cielo y nubes propios de Nacho) se queda? Ninguna está decidida.
4. La base LOCAL necesita la 0294 para ver la guía (la corre el orquestador, no el ejecutor).
5. `201-UAT.md` §0 dice "37 rutas" y §7 es el barrido de 201-24: no incluye `POST /guide-seen` (201-27). Si 201-35 recuenta rutas, sumar esa.

## Lecciones nuevas

- **Un verify con `;` en medio no es una cadena `&&`**: los tramos después de un `;` corren aunque el anterior haya fallado y el `OK` final se
  imprime igual. Mirar SIEMPRE la salida completa del verify (no solo la cola) y buscar líneas de grep arriba del `OK`.
- Los comentarios cuentan para los greps de verify (otra vez): este plan reescribió el de la cabecera de `conquer.scss`.
- Para un test de CI que prohíbe nombres, usar regex con lookbehind/lookahead (`(?<![a-z0-9-])--cq-gold\s*:`, `\.cq-link(?![a-z0-9_-])`) y así no
  chocar con `--cq-text-gold` ni `.cq-textlink`.
- El shim `runtok.sh` de 201-28 corre `it.each` con arrays de strings y `toBe(false)`: sirvió tal cual para los mutantes.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: solo borrado y documentación. T-201-114 (nada de la submarca fuera de `.cq-root`) y T-201-115 (sin CDN de fuentes) quedaron verificados por los
barridos del verify y por `conquer-tokens.test.ts`.

## Para el orquestador

- Pendiente de CI: `conquer-tokens.test.ts` (95 casos; corrido en node con shim, no con vitest real).
- No hay migración ni dependencias nuevas; no se tocó STATE.md, ROADMAP.md ni memorias.
- Falta aplicar la 0293 y la 0294 en la base LOCAL antes de probar (201-35).

## Self-Check: PASSED

- Los 3 componentes ya no existen; `conquer.scss`, el test, `201-UAT.md` y `201-CONTEXT.md` existen y están commiteados.
- Commits `72eb9f07e` y `9733f6a50` en la rama `feat/201-conquer`.
