---
phase: 115-evento-desafio-de-la-barra
plan: 06
subsystem: bar-challenge (frontend pages)
tags:
  - frontend
  - vue
  - quasar
  - pinia
  - capacitor
  - r11
requirements:
  - R5
  - R6
  - R7
  - R8
  - R9
  - R10
  - R11
dependency_graph:
  requires:
    - "115-03 useImageComposer composeWithFrame contract"
    - "115-05 useBarChallengeStore actions (start/tick/setPhoto/finalize/drainPendingSubmits)"
    - "115-CONTEXT D-09 Date.now() timer math"
    - "115-CONTEXT D-10 retry banner copy + optimistic UI"
    - "115-UI-SPEC copy + color + spacing locks"
  provides:
    - "/desafio-barra → Explicacion.vue (CTA swap por R11)"
    - "/desafio-barra/timer → Timer.vue (cronómetro fullscreen + R11 guard + KeepAwake)"
    - "/desafio-barra/resultado → Resultado.vue (share + compose + retry banner + empty state)"
  affects:
    - "el-templo-app/src/modules/bar-challenge/pages/* — flujo end-to-end ya implementable salvo install plugins"
tech-stack:
  added: []
  patterns:
    - "Dynamic `await import('@capacitor/camera' | '@capacitor/share')` con `@ts-expect-error` para diferir el install al Plan 08 sin romper type-check"
    - "R11 guard como `router.replace` en `onMounted` ANTES de `store.start()` / `setInterval` / `KeepAwake.keepAwake()` — defensa en profundidad sobre el 409 atómico del backend"
    - "Fullscreen-dark via `position: fixed; inset: 0; z-index: 9999` contenido en SCSS scoped (sin tocar MainLayout)"
    - "Tabular-nums on display tokens (timer 120/800 + resultado 64/800) via `font-feature-settings: 'tnum'` + `font-variant-numeric: tabular-nums`"
key-files:
  created: []
  modified:
    - "el-templo-app/src/modules/bar-challenge/pages/Explicacion.vue (stub → full impl)"
    - "el-templo-app/src/modules/bar-challenge/pages/Timer.vue (stub → full impl)"
    - "el-templo-app/src/modules/bar-challenge/pages/Resultado.vue (stub → full impl)"
decisions:
  - "Use `position: fixed; inset: 0; z-index: 9999` SCSS-contained fullscreen workaround para no tocar el MainLayout (Plan 06 NO debería modificar el shell de routing)"
  - "Dynamic import + `@ts-expect-error` en lugar de instalar los plugins ahora — Plan 08 los activa con explicit user approval (Capacitor install gate per CLAUDE.md memory)"
  - "R11 guard en `Timer.vue` corre ANTES de `store.start()` — orden crítico verificado vía awk en acceptance criteria (línea 100 < línea 106 en el commit final)"
  - "Resultado.vue lee la queue de sessionStorage read-only para mostrar el banner — la lógica de retry vive en el store; la página solo refleja el estado"
  - "Fallback `<a download>` (NO Capacitor Filesystem) si `Share.share` falla — evita una segunda dependencia opt-in y matches UI-SPEC copy 'Tu dispositivo no permite compartir directamente. Descargamos la foto.'"
metrics:
  duration_minutes: ~25
  tasks_completed: 2
  completed_date: 2026-05-21
---

# Phase 115 Plan 06: Frontend Pages (Explicacion + Timer + Resultado) Summary

Pages Explicacion + Timer + Resultado del flujo "Desafío de la Barra" implementadas end-to-end (excepto install Capacitor en Plan 08), con R11 single-attempt frontend guard (defensa en profundidad sobre el 409 del backend).

## What changed

**3 stubs reemplazados por implementaciones completas** en `el-templo-app/src/modules/bar-challenge/pages/`:

- **Explicacion.vue** — Heading 28/600 "Desafío de la Barra" + body 14/400 + 3-rules list con icon `check` + CTA con swap dinámico según `userStore.profile.barChallengeAttemptedAt`:
  - sin intento → "Comenzar" → router.push('/desafio-barra/timer')
  - con intento → "Ver mi intento" → router.push('/desafio-barra/resultado')
- **Timer.vue** — Fullscreen-dark `#1a1612` (via `position: fixed; inset: 0; z-index: 9999`), status label arriba (`AGUANTÁ` / `¡LO LOGRASTE! SEGUÍ AGUANTANDO`), digit cluster centered 120/800 tabular-nums, CTA row "Tomar foto" (outline gold) + "Finalizar" (filled gold). Color + texto cambian a gold-gradient cuando `secondsHeld >= 90` (transición 200ms). R11 guard corre en `onMounted` ANTES de `store.start()`. KeepAwake activado en mount, liberado en unmount. Captura de foto via dynamic `import('@capacitor/camera')` con `@ts-expect-error` + try/catch → cámara denegada muestra "Sin permiso de cámara. Podés seguir el desafío sin foto." sin romper el flujo.
- **Resultado.vue** — Fullscreen-dark con preview de foto (240px max-width, aspect 9/16, shimmer-gold border 1.5px) + headline "Aguantaste {N} segundos" con `{N}` en 64/800 gold-gradient si `completed`, cream si no. Body según completed ("Mostrá la foto etiquetando a @eltemplo..." vs "La barra te está esperando..."). CTA `Compartir foto` (compose + dynamic `import('@capacitor/share')` + fallback `<a download>` con Quasar notify) o `Sacar foto ahora` si no hay foto. Banner gold-tinted no bloqueante "No se pudo guardar el intento, se está reintentando." cuando la queue de sessionStorage tiene entries. Empty state "El desafío terminó" / "Vení al próximo evento." / "Volver" para deep-link sin attempt previo.

## Copy literals verbatim (matches UI-SPEC Copywriting Contract)

| Page        | Copy verbatim                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicacion | `Desafío de la Barra`                                                                                                                                                         |
| Explicacion | `Aguantá colgado de la barra por al menos 1:30. Si lo lográs, compartí tu foto etiquetando a @eltemplo y mostrásela al staff para llevarte tu premio. Tenés un solo intento.` |
| Explicacion | `Un solo intento.`                                                                                                                                                            |
| Explicacion | `El staff opera el cronómetro.`                                                                                                                                               |
| Explicacion | `Para reclamar el premio, mostrá la foto con la etiqueta @eltemplo al staff del local.`                                                                                       |
| Explicacion | `Comenzar` / `Ver mi intento` (CTA swap por R11)                                                                                                                              |
| Timer       | `AGUANTÁ` (status pre-90s)                                                                                                                                                    |
| Timer       | `¡LO LOGRASTE! SEGUÍ AGUANTANDO` (status post-90s)                                                                                                                            |
| Timer       | `Tomar foto` / `Finalizar`                                                                                                                                                    |
| Timer       | `Sin permiso de cámara. Podés seguir el desafío sin foto.` (camera-denied)                                                                                                    |
| Resultado   | `Aguantaste {N} segundos` (headline)                                                                                                                                          |
| Resultado   | `Mostrá la foto etiquetando a @eltemplo al staff del local y llevate tu premio.` (completed=true)                                                                             |
| Resultado   | `La barra te está esperando. Vení a entrenar.` (completed=false, locked por SPEC R8)                                                                                          |
| Resultado   | `Compartir foto` / `Sacar foto ahora`                                                                                                                                         |
| Resultado   | `No se pudo guardar el intento, se está reintentando.` (banner D-10)                                                                                                          |
| Resultado   | `Tu dispositivo no permite compartir directamente. Descargamos la foto.` (share fallback notify)                                                                              |
| Resultado   | `El desafío terminó` / `Vení al próximo evento.` / `Volver` (empty state)                                                                                                     |

## R11 single-attempt guard implementation

**Timer.vue** — orden lockeado en `onMounted`:

```ts
onMounted(async () => {
  if (userStore.profile?.barChallengeAttemptedAt != null) {  // ← línea 100 del commit
    logger.info('R11 guard: already attempted, redirecting to /resultado', { ... })
    await router.replace('/desafio-barra/resultado')
    return
  }

  store.start()                                              // ← línea 106 del commit
  intervalId = window.setInterval(() => store.tick(), 100)
  try {
    await KeepAwake.keepAwake()
  } catch (err: unknown) { ... }
})
```

Verificación automática via `awk`:

```bash
awk '/barChallengeAttemptedAt/ {g=NR} /store\.start\(\)/ {s=NR} END {exit (g && s && g<s) ? 0 : 1}' Timer.vue
# guard line: 100 start line: 106 → exit 0 (OK)
```

**Explicacion.vue** — CTA swap controlado por `computed`:

```ts
const alreadyAttempted = computed(
  () => userStore.profile?.barChallengeAttemptedAt != null,
);
const ctaLabel = computed(() =>
  alreadyAttempted.value ? "Ver mi intento" : "Comenzar",
);

function onPrimaryCta(): void {
  if (alreadyAttempted.value) {
    void router.push("/desafio-barra/resultado");
  } else {
    void router.push("/desafio-barra/timer");
  }
}
```

## `@ts-expect-error` for deferred plugin install (Plan 08)

3 dynamic imports usan `@ts-expect-error` con comentario apuntando al Plan 08:

| File                                        | Line context                                                                                                          | Reason                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `Timer.vue` `onTakePhoto()`                 | `// @ts-expect-error - installed in Plan 08 (D-Capacitor approval gate)` antes de `await import('@capacitor/camera')` | Camera plugin no instalado todavía |
| `Resultado.vue` `handleShare()`             | `// @ts-expect-error - installed in Plan 08 (D-Capacitor approval gate)` antes de `await import('@capacitor/share')`  | Share plugin no instalado todavía  |
| `Resultado.vue` `handleTakePhotoAndShare()` | `// @ts-expect-error - installed in Plan 08 (D-Capacitor approval gate)` antes de `await import('@capacitor/camera')` | Camera plugin no instalado todavía |

Una vez Plan 08 instale los plugins, los `@ts-expect-error` se vuelven "unused expect-error" y eslint los va a marcar — Plan 08 debe removerlos como parte del install. Esto es intencional: el compilador nos avisa que ya no son necesarios.

## Verification

- **Type-check:** `pnpm exec tsc --noEmit` — sin errores nuevos en mis archivos. El ruido baseline (TS2307 sobre `.vue` modules y TS2339 sobre `import.meta.env`) afecta a todo el proyecto y no es regresión de este plan.
- **Lint:** `pnpm exec eslint -c ./eslint.config.js` — limpio (3 files, 0 problems).
- **Acceptance grep:** todos los grep counts del plan (>=1) pasan; `awk` order-check del R11 guard pasa (line 100 < line 106).
- **Husky pre-commit hooks:** corrieron en ambos commits (prettier + eslint --fix), aplicaron sólo whitespace normalizations.

## Manual smoke (visual described, no dev server run)

- **Explicacion** (sin intento): Page dark, heading cream "Desafío de la Barra", body cream, 3 rules con check icons cream, single CTA gold-gradient "Comenzar" full-width.
- **Explicacion** (con intento, ej. `barChallengeAttemptedAt='2026-05-23T15:30:00Z'`): mismo cuerpo + CTA cambia a "Ver mi intento", router target = `/desafio-barra/resultado`.
- **Timer** (running, secondsHeld<90): fullscreen `#1a1612`, status cream "AGUANTÁ", digits cream "00:00" → "01:29" tabular-nums.
- **Timer** (running, secondsHeld>=90): mismo layout, status + digits cambian a gold-gradient suave (transition 200ms ease), texto status pasa a "¡LO LOGRASTE! SEGUÍ AGUANTANDO".
- **Timer** (already attempted, deep-link): mount → R11 guard redirige a `/resultado` antes de `store.start()` / `setInterval` / `KeepAwake`. El store no se resetea, el intervalo no se monta.
- **Resultado** (completed, has photo): banner si retry-pending, photo preview 240px, headline "Aguantaste 95 segundos" con `95` gold-gradient, body "Mostrá la foto etiquetando a @eltemplo...", CTA "Compartir foto" gold-filled + "Volver" text-button.
- **Resultado** (no completed, has photo): mismo layout, `87` cream, body "La barra te está esperando...".
- **Resultado** (no photo): se reemplaza el CTA filled por "Sacar foto ahora" outlined gold.
- **Resultado** (empty state): "El desafío terminó" + "Vení al próximo evento." + "Volver".

## Deviations from Plan

None — plan executed as specified. Pre-commit hooks (Husky + lint-staged) aplicaron formatting con Prettier sin cambios funcionales.

## Threat surface scan

No new threats outside the plan's `<threat_model>`. T-115-20 (deep-link bypass) está mitigado por R11 guard (verificado).

## Known Stubs

None. Las 3 pages son production-ready salvo el install pendiente de Capacitor camera/share, que es D-Capacitor approval gate y queda explícitamente en Plan 08.

## Commits

| Task                                               | Commit     | Files                          |
| -------------------------------------------------- | ---------- | ------------------------------ |
| 1 (Explicacion + Timer + R11 guards)               | `bc5c9b70` | `Explicacion.vue`, `Timer.vue` |
| 2 (Resultado + share + retry banner + empty state) | `acfb5db0` | `Resultado.vue`                |

## Self-Check: PASSED

- FOUND: `el-templo-app/src/modules/bar-challenge/pages/Explicacion.vue`
- FOUND: `el-templo-app/src/modules/bar-challenge/pages/Timer.vue`
- FOUND: `el-templo-app/src/modules/bar-challenge/pages/Resultado.vue`
- FOUND: commit `bc5c9b70`
- FOUND: commit `acfb5db0`
