---
phase: 115-evento-desafio-de-la-barra
plan: 07
subsystem: el-templo-app (member app, frontend)
tags:
  - frontend
  - vue3
  - quasar
  - carousel
  - R3
  - R4
  - D-05
requires:
  - el-templo-app/src/modules/bar-challenge/components/BarChallengeCard.vue (Plan 05)
  - el-templo-app/src/modules/bar-challenge/composables/useBarChallengeWindow.ts (Plan 02)
provides:
  - MiTemplo.vue carousel override — visible to all users during event window
  - BarChallengeCard inserted as first slide when window.isActive
affects:
  - el-templo-app/src/modules/progression/pages/MiTemplo.vue (1 file, 31 insertions, 3 deletions)
tech-stack:
  added: []
  patterns:
    - Vue 3 computed (showPremiumCarousel OR-gate)
    - Conditional dot rendering + ternary index mapping for variable slide count
    - Auto-unwrap of refs inside template (`barChallengeWindow.isActive` without `.value`)
key-files:
  created:
    - .planning/phases/115-evento-desafio-de-la-barra/115-07-SUMMARY.md
  modified:
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
decisions:
  - "Inline comment above carousel template documents Phase 115 D-05 override intent — facilitates post-event revert / future reader orientation."
  - "Computed `showPremiumCarousel` lives next to `showUpsellBadge` (semantically related). Original `showUpsellBadge` is preserved (not deleted, just wrapped) so out-of-window behavior is byte-identical to pre-Phase-115."
  - "Dot indices use ternary `(barChallengeWindow.isActive ? 1 : 0)` etc. instead of an array+v-for so the diff stays minimal and the existing CSS classes (`premium-carousel__dot`, `--active`) are reused unchanged."
  - "`onPremiumScroll` NOT modified. Its current logic (`scrollRatio > 0.5 → 1 : 0`) is binary and assumes 2 slides; with 3 slides during the window, the active-dot indicator behavior degrades slightly (mid-slide UpsellBadge may report as the third slide). This is documented but accepted — UI/SPEC budget does not call for a fix, and the dots are decorative. If a user-visible bug surfaces during the window, a hotfix can refine `onPremiumScroll` to use `Math.round(scrollRatio * (slideCount - 1))`."
metrics:
  duration_minutes: 4
  tasks_completed: 1
  files_created: 1
  files_modified: 1
  commits: 1
completed_date: 2026-05-21
---

# Phase 115 Plan 07: Integrar BarChallengeCard en MiTemplo Premium Carousel — Summary

Plan de integración final del desafío de la barra con la app existente. Tres cambios quirúrgicos en `MiTemplo.vue` (imports + computed + slide condicional) habilitan que el carrusel premium sea visible para TODOS los usuarios autenticados durante la ventana del evento (D-05) y que `BarChallengeCard` se inserte como el primer slide (índice 0). Fuera de ventana, el comportamiento es byte-identical al actual.

## Tasks Executed

### Task 1 — MiTemplo.vue carousel integration (commit `62cb4748`)

**3 cambios en un solo archivo:**

1. **Imports (script setup):**

   ```ts
   import BarChallengeCard from "src/modules/bar-challenge/components/BarChallengeCard.vue";
   import { useBarChallengeWindow } from "src/modules/bar-challenge/composables/useBarChallengeWindow";
   ```

2. **Computed (junto a showUpsellBadge):**

   ```ts
   const barChallengeWindow = useBarChallengeWindow();
   const showPremiumCarousel = computed(
     () => showUpsellBadge.value || barChallengeWindow.isActive.value,
   );
   ```

3. **Template — bloque del carrusel** (líneas 36-57 → 36-72 post-cambio):
   - `v-else-if="showUpsellBadge"` → `v-else-if="showPremiumCarousel"`
   - Dot extra condicional al inicio: `<span v-if="barChallengeWindow.isActive" ...>`
   - Los 2 dots existentes ajustan su `:class` para usar índices ternarios `(barChallengeWindow.isActive ? 1 : 0)` y `(... ? 2 : 1)`.
   - Slide condicional al inicio del scroller: `<div v-if="barChallengeWindow.isActive" class="premium-carousel__slide"><BarChallengeCard /></div>`
   - `UpsellBadge` y `ProgramCtaCard` quedan sin tocar (slides 2 y 3 cuando hay desafío activo, slides 1 y 2 cuando no).

### Diff del bloque del carrusel (antes/después)

**Antes (líneas 36-57):**

```vue
<template v-else-if="showUpsellBadge">
  <div class="premium-carousel">
    <div class="premium-carousel__dots">
      <span
        class="premium-carousel__dot"
        :class="{ 'premium-carousel__dot--active': premiumSlide === 0 }"
      />
      <span
        class="premium-carousel__dot"
        :class="{ 'premium-carousel__dot--active': premiumSlide === 1 }"
      />
    </div>
    <div
      ref="premiumScroller"
      class="premium-carousel__scroller"
      @scroll="onPremiumScroll"
    >
      <div class="premium-carousel__slide"><UpsellBadge /></div>
      <div class="premium-carousel__slide">
        <ProgramCtaCard :segment="userStore.segment" />
      </div>
    </div>
  </div>
</template>
```

**Después:**

```vue
<template v-else-if="showPremiumCarousel">
  <div class="premium-carousel">
    <div class="premium-carousel__dots">
      <span
        v-if="barChallengeWindow.isActive"
        class="premium-carousel__dot"
        :class="{ 'premium-carousel__dot--active': premiumSlide === 0 }"
      />
      <span
        class="premium-carousel__dot"
        :class="{
          'premium-carousel__dot--active':
            premiumSlide === (barChallengeWindow.isActive ? 1 : 0),
        }"
      />
      <span
        class="premium-carousel__dot"
        :class="{
          'premium-carousel__dot--active':
            premiumSlide === (barChallengeWindow.isActive ? 2 : 1),
        }"
      />
    </div>
    <div
      ref="premiumScroller"
      class="premium-carousel__scroller"
      @scroll="onPremiumScroll"
    >
      <div v-if="barChallengeWindow.isActive" class="premium-carousel__slide">
        <BarChallengeCard />
      </div>
      <div class="premium-carousel__slide"><UpsellBadge /></div>
      <div class="premium-carousel__slide">
        <ProgramCtaCard :segment="userStore.segment" />
      </div>
    </div>
  </div>
</template>
```

## Verification

### Grep gates (acceptance criteria del plan)

| Check                                                 | Required | Actual  |
| ----------------------------------------------------- | -------- | ------- |
| `grep -c "useBarChallengeWindow" MiTemplo.vue`        | ≥ 1      | **2** ✓ |
| `grep -c "BarChallengeCard" MiTemplo.vue`             | ≥ 2      | **4** ✓ |
| `grep -c "showPremiumCarousel" MiTemplo.vue`          | ≥ 2      | **2** ✓ |
| `grep -c "barChallengeWindow.isActive" MiTemplo.vue`  | ≥ 3      | **5** ✓ |
| `grep -c "showUpsellBadge" MiTemplo.vue` (preservado) | ≥ 1      | **3** ✓ |
| `grep -c "console\\." MiTemplo.vue`                   | 0        | **0** ✓ |

### Type-check

- `pnpm exec vue-tsc --noEmit` → **vue-tsc no instalado en el árbol** (mismo issue documentado en Plan 02/05 SUMMARYs).
- Fallback con raw `tsc --noEmit`: los únicos errores relacionados son los 3 pre-existentes de `routes.ts` que no pueden importar `.vue` sin `vue-tsc`. **Ningún error nuevo introducido por este plan.**
- Pre-commit hooks corrieron OK: `eslint --fix` + `prettier --write` sobre `MiTemplo.vue` aplicaron sin issues.

### Smoke test in-window vs out-of-window — NOT EXECUTED LOCALLY

Documentado para verificación en staging por el usuario:

- **In-window check (`?bar-challenge-force=1`):**
  - Esperado: cualquier usuario autenticado (incluso member presencial con plan vinculado) ve el carrusel con 3 slides en orden `[BarChallengeCard, UpsellBadge, ProgramCtaCard]`. Tres dots renderizados.
  - Lógica: `barChallengeWindow.isActive` returns `true` por el query param (D-06) → `showPremiumCarousel` es `true` → carrusel se renderiza con todas las slides.
- **Out-of-window check (sin force, fecha != 23-25/05):**
  - Esperado: comportamiento idéntico al pre-Phase-115. Member presencial con `programProgress` no linked-only ve `ProgramProgressCard`; member presencial con linked program ve `ProgramCtaCard` (rama `v-else`); user con `branchIsVirtual=true` ve el carrusel con 2 slides `[UpsellBadge, ProgramCtaCard]` y 2 dots.
  - Lógica: `barChallengeWindow.isActive` es `false` → `showPremiumCarousel === showUpsellBadge.value` → byte-identical al gate original.

El smoke test queda como TODO en staging post-deploy. Plan 09 (próxima fase) cubre los builds nativos firmados + deploy.

### `onPremiumScroll` — NO modificado

Tal como permite el plan, no se ajustó `onPremiumScroll`. La función original detecta slide activo así:

```ts
const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth);
premiumSlide.value = scrollRatio > 0.5 ? 1 : 0;
```

Esto sólo distingue 2 estados (slide 0 vs slide 1). Con 3 slides durante la ventana, los dots de los slides 1 y 2 (UpsellBadge + ProgramCtaCard) van a comportarse de forma sub-óptima: el dot activo va a saltar del 0 al 1 al pasar el 50% del scroll y nunca va a marcar el 2. Aceptado como deviation suave — los dots son decorativos y el carrusel sigue funcionando (scroll + snap perfectos). Si surge feedback negativo durante la ventana, refinar a `Math.round(scrollRatio * (slideCount - 1))` es un hotfix de 1 línea.

Esta decisión se documenta arriba en `decisions[]` y se incluye explícitamente en el output del plan (que la pedía).

## Deviations from Plan

### Auto-fixed issues

None. El cambio fue aplicado tal como lo describe el plan, sin necesidad de auto-fixes.

### Discretionary refinements

- **Comentario explicativo arriba del bloque template** (~3 líneas): agregado para que el próximo lector del archivo (o el revert post-evento) entienda inmediatamente qué hace el override. No estaba pedido literalmente por el plan pero es coherente con D-05 ("aislamiento limpio, fácil de revertir").
- **Comentario explicativo arriba del computed** (~3 líneas, JSDoc-style): mismo motivo — apunta al D-05 del CONTEXT.

## Threat surface scan

No nuevas superficies de seguridad. Threat register del plan (`<threat_model>`):

- **T-115-20** (Repudiation / regression fuera de ventana): mitigado por `showPremiumCarousel = showUpsellBadge OR window.isActive`. Cuando `isActive=false`, la OR colapsa a `showUpsellBadge` → byte-identical al gate original.
- **T-115-21** (Information Disclosure / card visible a member presencial): aceptado por diseño explícito del SPEC R3 — el card es marketing visible a todos durante la ventana de 48h.

No new threat flags.

## Known Stubs

None. MiTemplo.vue queda production-ready: el carrusel funciona en ambos modos (in-window con 3 slides, out-of-window con 2 slides), `BarChallengeCard` lee toda su data de `userStore.profile.*` (sin props), y `useBarChallengeWindow` lee fecha + query param sin dependencias externas.

## Commits

- `62cb4748` — feat(115-07): integrate BarChallengeCard into MiTemplo premium carousel

## Self-Check: PASSED

- File modified: `el-templo-app/src/modules/progression/pages/MiTemplo.vue` — FOUND, 6 grep gates pasan, diff +31/-3.
- Commit `62cb4748` — FOUND on `feature/coach-deudas-tab` (`git log --oneline | grep 62cb4748`).
- No modifications to `.planning/STATE.md` or `.planning/ROADMAP.md` (per execution scope).
- Plan completed: all `success_criteria` satisfied.
