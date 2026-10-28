# Code review: rework visual APP (feat/popups-estilo-card vs origin/staging)

Worktree: /home/franco/projects/et-199-mi-templo (solo `el-templo-app`, 25 archivos). Profundidad: standard con diff funcional contra origin/staging.
Verificado: `slot-availability.test.ts` 21/21 verde; vue-tsc = 18 errores (igual a la línea base, ninguno en archivos tocados salvo `OnboardingQuestion.vue` `frame`, que ya existía en staging); eslint limpio en ReservasPage/Premium*/ReservasRulesNote/BranchPickerDialog/slot-availability. Sin `console.*`, sin `any` nuevos.

Conteo: BLOCKER 0 | WARNING 5 | INFO 6

## Foco 1: regresiones de comportamiento (resultado)

Diff de `<script>` de ReservasPage contra staging: lógica idéntica. Los únicos cambios son (a) la disponibilidad se delega a `utils/slot-availability` con los mismos umbrales y ramas que antes, (b) copy de mensajes, (c) `nextBookingTitle` y `currentBranchShortName` nuevos. Handlers (reservar, cancelar, waitlist, prueba, especiales, feriado, bonus, cobertura, sede, semanas), `persistent`, `v-close-popup`, `:loading`, `:disable` y `@hide` de los 4 pop-ups y de los diálogos de trámite se conservan. El botón nuevo "Lista de espera" llama a `onSlotTap(slot)` con `@click.stop`, o sea lo mismo que el tap sobre la card completa en staging (rama `slot.isFull`), y solo aparece en dos ramas: no-especial completo y no pasado, y especial `reservable` completo (el pasado ya salió antes por `isSlotPast`). No aparece en modo prueba ni partner (ahí completo = sin acción, igual que antes). Login/registro/olvidé/invitación: solo template/estilo, validaciones, submit y navegación intactos.

## WARNING

### WR-01: "Tu próxima clase" muestra la sede que se está viendo, no la de la reserva

**File:** `el-templo-app/src/pages/ReservasPage.vue:583-589` (meta) y `:1812-1817` (`currentBranchShortName`)
**Issue:** la meta es `${nextBooking.activityName} · ${currentBranchShortName}`. `currentBranchShortName` sale de `selectedBranchId` (sede seleccionada en el chip), pero `nextBooking` sale de `myBookings`, que `GET .../weekly-grid` trae SIN filtrar por sede (`bookingService.getMyBookings(ctx, userId, weekStart)`, routes.ts:1273). `BookingRecord` no trae sede. Escenario: socio multi-sede con reserva el martes en Mario Bravo mira la grilla de Alberti: la card dice "Funcional · Alberti" para una clase que es en Mario Bravo. Dato falso en una card de confirmación.
**Fix:** usar la sede de la reserva si viene (`MyBookingRecord.branchName`, opcional) y, si no, omitir la sede de la meta en vez de inventarla, p. ej. `const b = (nextBooking as MyBookingRecord).branchName; meta = b ? \`${activityName} · ${shortBranchName(b)}\` : activityName`. Mejor: que el weekly-grid mande `branchName`en`myBookings`.

### WR-02: Fila de sede = `role="button"` con un `q-btn` adentro, y sin Space

**File:** `el-templo-app/src/components/BranchPickerDialog.vue:10-30`
**Issue:** el `div.pd-row` es `role="button" tabindex="0"` y contiene el `q-btn` "Cómo llegar". Un botón dentro de un botón: ARIA marca los hijos de `button` como presentacionales, así que lectores de pantalla no exponen "Cómo llegar" y el nombre accesible de la fila queda "Mario Bravo Dirección... Cómo llegar". Además solo maneja `Enter` (`@keydown.enter.self`), no `Space`, que es lo que se espera de `role=button`.
**Fix:** fila contenedora sin rol (`div.pd-row`), con un `<button type="button" class="pd-row-main">` que ocupe el nombre+dirección y dispare `onSelect`, y el `q-btn` de mapas como hermano (no hijo). Así cada control es nativo (Enter/Space gratis) y se quita el `.self`.

### WR-03: Los campos oscuros (`pd-field`) pierden el rojo del mensaje de error

**File:** `el-templo-app/src/css/_premium-card.scss:163-165` (mixin `pd-field`), usado en `PremiumGlassCard.vue:55` y `PremiumDialogCard.vue` (`:slotted(.pd-area)`)
**Issue:** el mixin fija `.q-field__bottom { color: $pd-cream-3 }` con especificidad mayor que la regla de Quasar `.q-field--error .q-field__bottom { color: var(--q-negative) }` (QField.sass:466-471). Resultado: en Login/Registro/Olvidé los mensajes de validación ("Campo requerido", etc.) salen en crema grisáceo igual que la ayuda; solo queda el anillo/ícono rojo. `pd-field-light` sí maneja `&.q-field--error` (líneas 208-216), el oscuro no: inconsistencia que parece olvido.
**Fix:** en `pd-field` agregar, después del bloque `.q-field__bottom`:

```scss
&.q-field--error .q-field__bottom {
  color: #ff9b94;
} // >= 4.5:1 sobre #2c2318
```

(y borde `::before` rojo en error si se quiere paridad con el claro).

### WR-04: El botón "Lista de espera" puede abrir "Cambiar horario" y cancelar la reserva que ya tenía

**File:** `el-templo-app/src/pages/ReservasPage.vue:709-717, 727-735` (botón) y `:1860-1892` (`onSlotTap`) + `:1908-1914` (`confirmReserve`)
**Issue:** en `onSlotTap` la rama `existingBooking` (mismo día, misma categoría) va ANTES de `slot.isFull`. Un socio con una reserva ese día toca el botón rotulado "Lista de espera" de una clase completa y ve el diálogo "Cambiar horario"; si confirma, `confirmReserve` hace `cancelBooking(cancelFirst)` y después `reserve()` sobre un turno lleno: pierde su lugar confirmado y queda en lista de espera (sin garantía de entrar). Es un comportamiento PREEXISTENTE (en staging el tap sobre la card completa hacía lo mismo), pero ahora un botón con rótulo explícito lo hace mucho más probable y el rótulo no coincide con el diálogo.
**Fix:** en `onSlotTap`, si `slot.isFull` y hay `existingBooking`, no ofrecer cambio: mostrar el diálogo de lista de espera con `cancelFirst: null` (anotarse sin soltar la otra), o bloquear con un aviso. Mínimo: ocultar el botón cuando `dayHasBooking` de la misma categoría.

### WR-05: Meses en mayúscula en el rango de semana y en los mensajes

**File:** `el-templo-app/src/pages/ReservasPage.vue:1549-1577` (`weekLabel`, 'Octubre', etc.) y `:1455-1468` (`MONTH_ABBREV` 'Oct', 'Ene'...)
**Issue:** el pedido de copy era "12 al 16 de Octubre" → minúscula. `weekLabel` no se tocó (sigue `monthNames` capitalizado, se ve en los 3 estados de la grilla), y `MONTH_ABBREV` capitalizado alimenta los mensajes nuevos que justamente bajaron el día a minúscula: "Ya tenés una reserva el viernes 16 Oct a las 19:00" / "Reservar X el viernes 16 Oct a las 19:00". Mezcla minúscula en el día y mayúscula en el mes.
**Fix:** `monthNames` y `MONTH_ABBREV` en minúscula ('octubre', 'oct'). Revisar los usos de `MONTH_ABBREV` (líneas 1245, 1524, 1749, 1772, 1852, 1975) y `formatBonusPeriodEnd`; el título de la card ya no usa mes.

## INFO

### IN-01: `span role="button"` del nombre de actividad solo responde a Enter

**File:** `ReservasPage.vue:439-442, 667-673`
`role="button"` pide también `Space` (con `.prevent` para no scrollear). Agregar `@keydown.space.prevent="onActivityNameTap(slot, $event)"`.

### IN-02: `!important` evitable

**File:** `ReservasPage.vue:2837-2839` (`.next-card__title { margin-top: 2px !important }`)
Se usa porque `.next-card__info p { margin: 0 }` (más específico) le gana. Subir la especificidad (`.next-card__info .next-card__title`) o poner el margin en el `p` del padre y evitar el `!important`. (El de `pd-cta-disabled` está justificado por Quasar; el del botón WhatsApp de Recommendation también.)

### IN-03: DRY entre componentes y partial

- `ReservasPage.vue`/`ReservasRulesNote.vue` repiten literales (`#e5dbcd`, `#2c2318`, `#6b6459`, `#96593a`, `#fbf8f3`) que el partial ya exporta (`$pd-light-line`, `$pd-ink`, `$pd-ink-2`, `$pd-terra-ink`, `$pd-light-surface`); ReservasPage hasta importa el partial y usa solo `pd-frame-light` y `$pd-light-surface`. `ReservasRulesNote` no importa el partial.
- `OnboardingAge.vue:88-114` (`.dob-input`) reimplementa a mano el campo de `pd-field` ("mismo campo oscuro" según su comentario): borde, fondo, radio y foco duplicados.
- `pd-frame` y `pd-frame-light` (\_premium-card.scss) comparten el mismo degradé salvo dos colores y el radio: extraer un mixin base con parámetros.

### IN-04: Tests de `slot-availability`: cubren bien los bordes, faltan tres casos

Cubiertos: umbral 15/16/19/20/25 de 20, `isFull` manda, singular/plural, bookedCount negativo, modo prueba (restantes, 1, 0, negativo, isFull ignorado). Faltan: `maxCapacity: 0` (debe dar full), modo prueba con `trialSpotsRemaining >= FEW_THRESHOLD` (hoy cae en "available" y muestra "N anotados" usando `bookedCount` del cupo general, que contradice el comentario "nunca se llega acá"), y un test que fije el cambio de copy `personas anotadas` -> `anotados` / "Sé el primero" para que no se revierta sin querer. Tampoco hay test de `ReservasPage` (no existía), así que `v-if` de estados y botón de waitlist no tienen red.

### IN-05: Destello infinito del botón primario

**File:** `_premium-card.scss:281-285`
Respeta `prefers-reduced-motion` (bien). Con movimiento permitido repite cada 5 s para siempre, en cada pantalla de formulario; WCAG 2.2.2 pide poder pausar contenido que se mueve más de 5 s. Considerar `animation-iteration-count: 3` o frenar en `:hover/:focus`.

### IN-06: Detalles menores

- `Cormorant Garamond` itálica 500 (`pd-hint`, `question-frame`) no está cargada (app.scss importa 400-italic y 600-italic); el navegador cae a 400, sin daño visible pero la regla engaña.
- Las fichas de día no anuncian "hoy" (solo borde tinta); agregar `<span class="day-pill__sr">hoy</span>` o `aria-current="date"`.
- El título de "Tu próxima clase" no lleva mes ("Lunes 19 · 19:00"); una reserva de la semana siguiente es ambigua si la card sobrevive al cambio de semana.
- El link "Cancelar" de la card de próxima clase no tiene `aria-label` con la clase (sí lo tienen los de cada fila).

---

_Reviewed: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
