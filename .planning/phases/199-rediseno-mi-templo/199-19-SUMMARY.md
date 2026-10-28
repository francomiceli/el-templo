---
phase: 199-rediseno-mi-templo
plan: 19
subsystem: app-sponsors-sheet
tags:
  [
    sponsors,
    sheet,
    member-card,
    clipboard,
    live-clock,
    mi-templo,
    d-21,
    d-22,
    d-25,
  ]
requires: [199-18]
provides:
  - SponsorSheet.vue (hoja de detalle con canje por código o carnet, estados ok / verificando / bloqueado)
  - MemberCard.vue (carnet a pantalla completa con hora en vivo en la zona de la sede)
  - useLiveClock (reloj por segundo con cleanup())
  - useBackButtonClose (cierre con el atrás de Android solo mientras está abierto)
  - utils/clipboard.ts (copyWithFallback compartido)
affects: [199-20, 199-21]
key-files:
  created:
    - el-templo-app/src/utils/clipboard.ts
    - el-templo-app/src/composables/useLiveClock.ts
    - el-templo-app/src/composables/useBackButtonClose.ts
    - el-templo-app/src/composables/__tests__/useLiveClock.test.ts
    - el-templo-app/src/modules/progression/components/SponsorSheet.vue
    - el-templo-app/src/modules/progression/components/MemberCard.vue
  modified:
    - el-templo-app/src/pages/MisInvitadosPage.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
requirements-completed: [D-21, D-22, D-25]
completed: 2026-10-15
---

# Phase 199 Plan 19: Hoja de beneficio y carnet de socio (app, parte 2) Summary

Al tocar una card del carrusel se abre una hoja inferior igual a `SponsorSheetPreview` del admin, con canje por código copiable o por carnet de socio a pantalla completa con hora en vivo. Todo el gate de "plan activo" sale de una sola fuente (`sponsorsStore.canRedeem`) y mientras algo carga se ve "Verificando tu plan…", nunca el candado.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `1da3e6eb2` feat(199-19): carnet de socio con hora en vivo en la zona de la sede y copyWithFallback compartido (D-21, D-22)
- Task 2: `044a91a14` feat(199-19): hoja de beneficio con código copiable o carnet en vivo, canje solo con plan activo (D-21, D-22)
- Test: `462fb2bf4` test(199-19): useLiveClock en la zona de la sede, un solo reloj y cleanup

## Qué se hizo

- **`utils/clipboard.ts`**: `copyWithFallback` movido tal cual de `MisInvitadosPage` (Quasar `copyToClipboard` y fallback `execCommand` para el WebView de Android), con `createLogger('clipboard')`. `MisInvitadosPage` lo importa y se quitó su copia y el import de `copyToClipboard`; comportamiento igual.
- **`useLiveClock(tz: () => string)`**: `{ time, dateLabel, start, cleanup }`. Un solo `setInterval(1000)` (`start()` repetido reinicia, no duplica). Hora con `Intl.DateTimeFormat('es-AR', { timeZone, hh:mm:ss, hour12: false })`; fecha armada con `formatToParts` ("Jueves 15 de octubre") para evitar la coma que algunas versiones de ICU agregan. Sin `onUnmounted` ni `getHours()`. La zona se relee en cada tick.
- **`MemberCard.vue`**: `q-dialog maximized` con `fade`, `:model-value = modelValue && sponsorsStore.canRedeem`. Contenido calcado del sketch: "EL TEMPLO", nombre y apellido, "{sede} · {plan}" (solo la sede si el plan no está cargado), píldora "Socio activo", fecha, hora con segundos (`aria-live="off"`, `tabular-nums`), pista y botón "Listo". Reloj de `useTodayBookingStore().tz` (= `branchTimezone ?? DEFAULT_BRANCH_TZ`). El reloj arranca/para con un `watch` sobre la visibilidad real (no sobre el prop), así también se limpia si se pierde el plan o se desloguea; además al cambiar de ruta y en `onUnmounted`.
- **`SponsorSheet.vue`**: props `modelValue`/`sponsor`, emits `update:modelValue`/`show-card`. Cabecera con logo en los colores de la marca (`--b-bg`/`--b-fg`), beneficio, detalle y condiciones con `white-space: pre-line` (sin `v-html`). `redeemState = canRedeem ? 'ok' : (store.loading || userStore.planStateLoading) ? 'loading' : 'locked'`. `loading`: fila neutra con `q-spinner-dots` + "Verificando tu plan…" y sin botón. `locked`: fila con candado + "Activá tu plan para usarlo" → cierra y `router.push('/planes')` (el mismo destino que el CTA de la card de hoy, tanto presencial como online). `code`: caja punteada con el código (seleccionable) + "Copiar"; si copia, notify "Código copiado" + `redeem`; si falla, notify "No pudimos copiar, anotalo a mano" y el código sigue visible. `carnet`: "Mostrá tu carnet" → `redeem` + `show-card` + cierra. Ningún texto con "QR".
- **`redeem` (D-25/L53)**: fail-open (lo da el store), una sola vez por apertura de la hoja (flag que se reinicia al abrir; copiar dos veces o copiar y luego abrir el carnet no duplica), nunca al montar.
- **L40**: nuevo `useBackButtonClose(onBack)` (misma mecánica que `ProgramSheet`: listener `backButton` de Capacitor solo en nativo y solo mientras está abierto, con token anti-carrera) usado por la hoja y el carnet; ambos también se cierran al cambiar de ruta.
- **`MiTemplo.vue`**: `sheetOpen` computed sobre `selectedSponsor`, `memberCardOpen`, `<SponsorSheet ... @show-card>` y `<MemberCard>` después de `ProgramSheet`.

## Verificación

- Task 1 `<verify>`: `vue-tsc` sin matches en `clipboard|MisInvitadosPage|useLiveClock|MemberCard` (también `useBackButtonClose`); `export async function copyWithFallback` = 1. Greps: `function copyWithFallback` en MisInvitadosPage = 0, import de `src/utils/clipboard` = 1, `onUnmounted`/`getHours()`/`getMinutes()` en `useLiveClock` = 0, `second: '2-digit'` = 1, `sponsorsStore.canRedeem` en MemberCard >= 1, `hasActiveSubscription` = 0, `Socio activo` = 1, `QR` (insensible a mayúsculas) = 0, `subscription?.planName` >= 1.
- Task 2 `<verify>`: `vue-tsc` = 18 errores totales (límite 18, todos preexistentes, ninguno en archivos del plan); `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`). Greps: `Activá tu plan para usarlo` = 1, `'/planes'` = 1, `redeemState` = 6, `planStateLoading` = 1, `Verificando tu plan` = 1, `hasActiveSubscription` = 0, `Mostrá tu carnet` = 1, `QR` = 0, `<SponsorSheet|<MemberCard` en MiTemplo = 2, `color: rgba(` = 0 en ambos componentes, `v-html`/`console.` = 0. **`markRedeem(` = 1, no 2** (ver desviación 2).
- **Tests de app corridos** (foreground): `src/composables/__tests__/useLiveClock.test.ts` 6/6 verdes. Mutación comprobada: quitar el `cleanup()` inicial de `start()` hace fallar "start() repetido no deja dos relojes" (mutante muerto; archivo restaurado). No se tocaron `useSponsorsStore` ni `utils/sponsors.ts`, así que no se re-corrieron sus tests. No hay tests de componente (el repo no tiene `@vue/test-utils`): hoja, carnet y el cierre con atrás quedan para el UAT/plan 21.

## Deviations from Plan

1. **[Menor] Tres commits** (uno por task + uno de test) en vez de uno solo.
2. **[Menor] `markRedeem(` aparece una vez, no dos**: el criterio de aceptación pedía 2 (código y carnet). Se centralizó en `reportRedeem()` con la guarda "una vez por apertura" (L53), que ambos caminos llaman. Es el mismo comportamiento con una sola llamada.
3. **[Rule 2 - L40] Archivo extra `composables/useBackButtonClose.ts`** (no estaba en `files_modified`): las lecciones piden cierre con atrás de Android para la hoja y el carnet; duplicar el bloque de `ProgramSheet` dos veces más era repetición. `ProgramSheet` no se refactorizó para usarlo (fuera de alcance).
4. **[Rule 2] Test extra** `useLiveClock.test.ts` (el plan no pedía tests).
5. **[Menor] Fecha con `formatToParts`** en vez de `format()` directo, para no depender de la coma de ICU ("jueves, 15 de octubre").
6. **[Menor] Copia local `current` de la marca en la hoja**: el padre pone `selectedSponsor = null` al cerrar y sin la copia el contenido desaparece en plena animación de salida.
7. **[Menor] Hint del carnet**: el sketch dice "Mostrale esta pantalla al comercio. La hora en vivo evita capturas viejas."; se usó solo la primera frase, como pide el plan.
8. **[Menor] Botón "Copiar" de 44 px de alto** (el sketch dice 40) para respetar el área táctil mínima; el resto de medidas del sketch al pie de la letra.
9. El hook lint-staged hizo su backup interno con `git stash` en los commits (automático, no manual).

## Bugs reales encontrados

Ninguno en código previo.

## Known Stubs

Ninguno.

## Dudas abiertas (no bloqueantes)

- **"Verificando tu plan…" podría quedar fijo**: `userStore.planStateLoading` es true mientras `!planStatusLoaded`; si `loadPlanStatus()` falla de forma que no marque `planStatusLoaded`, un socio sin plan (con el feed ya cargado y `canRedeem = false`) vería "Verificando…" en vez del candado. Es lo que pide el plan (nunca candado mientras algo carga); verificar en el UAT con red mala. Si molesta, limitar `loading` a `store.loading`, ya que el server es la fuente de verdad.
- **Colores de la marca en `--b-bg/--b-fg`**: el admin cae a `#3d3732`/`#f2ede5` si el hex es inválido; la app confía en el server (que valida contraste y formato).
- Hoja y carnet sin validación visual (capturas y paridad con la vista previa del admin): plan 21.
- El carnet muestra "Socio activo" también para `paused` (el server lo cuenta como plan activo, plan 02/04); es consistente con lo que manda el feed.
- `canRedeem` se recarga solo con `sponsorsStore.load()` (al montar Mi Templo): si el socio activa o renueva el plan en la misma sesión sin volver a montar Mi Templo, la hoja sigue bloqueada hasta el próximo `load()`. Mi Templo se remonta al navegar, así que en la práctica se recupera al volver.

## Threat Flags

Ninguno fuera del threat_model. T-199-50 (el carnet exige `canRedeem` y la hoja no ofrece el botón si `redeemState !== 'ok'`; ambos handlers lo re-chequean), T-199-51 (el código solo se muestra con el estado `ok`; el server no lo manda sin plan), T-199-52 (hora con segundos en la zona de la sede) y T-199-53 (`redeem` fail-open, una vez por apertura) cubiertos.

## Self-Check: PASSED

- Archivos existen: `clipboard.ts`, `useLiveClock.ts`, `useBackButtonClose.ts`, `useLiveClock.test.ts`, `SponsorSheet.vue`, `MemberCard.vue`; `MisInvitadosPage.vue` y `MiTemplo.vue` modificados.
- Commits `1da3e6eb2`, `044a91a14` y `462fb2bf4` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` salvo este SUMMARY sin commitear.
