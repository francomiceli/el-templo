---
phase: 199-rediseno-mi-templo
plan: 17
subsystem: app-for-you-carousel
tags:
  [
    para-vos,
    carousel,
    perfil,
    aviso-prompt,
    mi-templo,
    d-10,
    d-11,
    d-13,
    d-14,
    d-15,
  ]
requires: [199-16]
provides:
  - ForYouCard.vue (card clara presentacional de "Para vos")
  - ReferralCtaCard / UpsellBadge / ProgramCtaCard / AvisoCard renderizando con ForYouCard
  - Carrusel "Para vos" en MiTemplo (sin dots, sin Sugerencias, asoma la siguiente)
  - Entrada "Proponer una mejora" en Perfil
  - AvisoPromptDialog con contraste >= 4.5 y textos sólidos
affects: [199-20, 199-21]
key-files:
  created:
    - el-templo-app/src/modules/progression/components/ForYouCard.vue
  modified:
    - el-templo-app/src/modules/progression/components/ReferralCtaCard.vue
    - el-templo-app/src/modules/progression/components/UpsellBadge.vue
    - el-templo-app/src/modules/programs/components/ProgramCtaCard.vue
    - el-templo-app/src/modules/progression/components/AvisoCard.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/pages/ProfilePage.vue
    - el-templo-app/src/components/AvisoPromptDialog.vue
requirements-completed: [D-10, D-11, D-13, D-14, D-15]
completed: 2026-10-15
---

# Phase 199 Plan 17: "Para vos" claro y Sugerencias en Perfil Summary

"Para vos" pasó de cards oscuras con borde dorado y dots a un carrusel de cards blancas compactas (kicker, título, texto de 2 líneas, link "Acción →") con la siguiente asomando 24 px. "Sugerencias" salió del carrusel y vive como "Proponer una mejora" en Perfil. El pop-up de entrada conserva su diseño con botón sólido terracota y textos sólidos.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `6fb62a1e3` feat(199-17): ForYouCard clara y las 4 tarjetas de Para vos sobre ella (D-10, D-15)
- Task 2: `1aab91a63` feat(199-17): "Para vos" con cards claras sin dots, "Proponer una mejora" en Perfil y contraste del pop-up de entrada (D-10, D-11, D-15)

(Dos commits, uno por task; el plan hablaba de uno solo al final. lint-staged/Prettier pasó en ambos.)

## Qué se hizo

- **`ForYouCard.vue`** (props `kicker/title/body/actionLabel`, emit `action`): estilos del sketch (`#fff`, borde `#e5dbcd`, radio 16, `min-height: 128px`; kicker Montserrat 700 10 `#96593a`; título 16/1.25 `#2c2318`; texto 13/1.4 `#6b6459` con `line-clamp: 2`; link Geologica 600 14 `#96593a`, `min-height: 44px`). Toda la card es clickeable (`role="button"`, `tabindex="0"`, `@keydown.enter.self`) y el botón usa `@click.stop` para no emitir dos veces. Interpolación con `{{ }}`, sin `v-html`, sin `color: rgba`.
- **Las 4 tarjetas**: se conservó TODO el `<script>` (copy editable `tarjetaByCode`, fallbacks, `reportClicked`, `navigateToAvisoDestination`, tracking de clic de referidos `POST /members/referrals/cta-click`, fallback WhatsApp). Solo cambió el template a `<ForYouCard>` y se borraron los estilos viejos (oscuros, dorados, shimmer, sparkles). Kickers: Invitaciones / Presencial / Planes personalizados / Aviso. `ProgramCtaCard` aplana `\n` a espacio.
- **`MiTemplo.vue`**: `<section class="for-you">` con título y rail (`scroll-snap-type: x mandatory`, `scroll-padding-inline: 16px`, `padding: 0 16px 2px`, hijos `flex: 0 0 calc(100% - 2 * 16px - 24px)` vía `> :deep(.for-you-card)`). Orden: Referral, Upsell (`showUpsellBadge`), ProgramCta (`showProgramCta`), avisos libres. Eliminados `ImprovementCtaCard`, dots, `premiumSlideCount/premiumSlide/onPremiumScroll/premiumScroller`, `type Ref` y los estilos `.premium-carousel*`.
- **`ProfilePage.vue`**: entrada "Proponer una mejora" (`lightbulb`) tras "Mis invitados", con divider, `router.push('/proponer-mejora')`.
- **`AvisoPromptDialog.vue`** (solo estilos): primario `#96593a` sólido / `#fff` (5.55:1), texto `#d9cfc1`, "Descartar" `#c9bfb2`, sin gradiente; comentario actualizado.

## L44: alcance de la ruta `/proponer-mejora`

- La ruta (`router/routes.ts`) no se tocó, sigue viva y ahora se alcanza desde Perfil.
- `config/destinations.ts` (`proponer_mejora`) y `el-templo-api/src/modules/communications/destinations.ts` apuntan a `/proponer-mejora`: la ruta no cambió, así que avisos/pushes con ese destino siguen funcionando. No hay enlaces muertos.
- El pop-up `improvement_prompt` (`ImprovementPromptDialog`, en `MainLayout`) no se tocó.
- Grep de otras referencias: solo el propio `ImprovementCtaCard` (ahora sin importadores).

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18; el de `displayName` en `MainLayout.vue` es preexistente). Un primer intento con `$router.push` en la entrada nueva dio 19 (el `$router` del template ya fallaba en "Mis invitados"); se cambió a `router.push` y quedó en 18, sin errores en los archivos del plan.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Task 1: vue-tsc sin errores en los 5 archivos; `c4956a|a07850|shimmer|sparkle` = 0 en las 4 tarjetas; `<ForYouCard` = 1 en cada una; `#e5dbcd` = 1 y `color: rgba(` = 0 en `ForYouCard`; `tarjetaByCode` = 1 en las 3 fijas (la lógica no se tocó).
- Task 2: `ImprovementCtaCard|premium-carousel|premiumSlide` = 0 en MiTemplo; `scroll-padding-inline: 16px` = 1; `Proponer una mejora` y `/proponer-mejora` presentes en Perfil; `AvisoPromptDialog`: `color: rgba(` = 0, `linear-gradient` = 0, diff sin tocar template/script = 0.
- **Tests de app corridos** (uno por uno, foreground): `src/stores/__tests__/avisos-store.test.ts` 11/11 verdes; `src/utils/__tests__/aviso-navigation.test.ts` 3/3 verdes. No hay tests de componente de las tarjetas ni de Perfil (el repo no tiene `@vue/test-utils`); no se crearon. Ninguna lógica cambió. Validación visual (capturas, `contrast.py`, asomo de 24 px) pendiente del plan 21.

## Deviations from Plan

1. **[Menor] Dos commits** (uno por task).
2. **[Menor] `$router.push` -> `router.push`** en la entrada nueva de Perfil (el plan copiaba el markup de "Mis invitados"; el `$router` del template no tipa en esta config y habría subido vue-tsc a 19). La entrada de "Mis invitados" no se tocó.
3. **[Menor] Estilo del rail** vía `> :deep(.for-you-card)` en MiTemplo, para que el ancho del slide lo defina el carrusel y no `ForYouCard` (reutilizable fuera del rail).
4. **[Menor] Kicker "Aviso"** fijo en `AvisoCard` (igual que antes: badge genérico).

## Bugs reales encontrados

Ninguno en código previo.

## Componentes huérfanos (L45, no borrados)

- `ImprovementCtaCard.vue` (sin importadores en `src`). El plan 20 decide el borrado.
- Se suman a los de 199-16: `CheckInCard`, `WeeklySummaryCard`, `RpeTrendChart`, y a los de 199-15 (`SessionCtaCard`, `BookingStatusCard`, `RestDayCard`) si el plan 20 los confirma.

## Dudas abiertas (no bloqueantes)

- **`card_improvement` queda como aviso de sistema editable en Comunicaciones** (sembrado en la API: `system-avisos.ts`, `prompt-service.ts`, `schemas.ts`; consumido solo por el `ImprovementCtaCard` huérfano). Editar su copy desde el admin ya no tiene efecto visible en la app. Decidir en el plan 20 (o fase posterior) si se oculta del admin o se deja inerte; no se tocó la API.
- El "Descartar" y el cuerpo del pop-up se midieron por cálculo (contrastes del plan), no con captura; verificar en el plan 21.
- Si se vuelve a introducir una tarjeta en el rail con otro root que no sea `.for-you-card`, el selector `:deep(.for-you-card)` no la dimensiona.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-45 mitigado (`ForYouCard` interpola con `{{ }}`, sin `v-html`). T-199-46 aceptado (se reutiliza `navigateToAvisoDestination`; eventos `seen`/`clicked` sin cambios, L43).

## Self-Check: PASSED

- `ForYouCard.vue` existe; commits `6fb62a1e3` y `1aab91a63` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` salvo este SUMMARY sin commitear.
