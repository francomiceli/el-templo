---
phase: 162
slug: superficie-member-app-y-reporte-de-reparto
status: draft
shadcn_initialized: false
preset: not applicable (Quasar/Vue, not React)
created: 2026-07-14
mode: AUTO (owner not consulted — derived from artifacts + existing design system)
---

# Phase 162 — UI Design Contract

> Contrato visual e interactivo para la **superficie** de "Actividades con Aura": (1) la grilla de reservas del **member app** (`el-templo-app`, Quasar/Vue 3 + Capacitor, mobile-first) con distintivo + estados por acceso, contador x/2 y mensaje informativo; (2) el **reporte de reparto** en el admin (`el-templo-admin`, Quasar/Vue 3) como tab nuevo en Analíticas. Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **AUTO mode — Franco NO fue consultado.** Toda decisión abierta se derivó de `162-CONTEXT.md` (D-01..D-07, autoritativo) + el design system existente + patrones vigentes del repo. Cada supuesto lleva `[ASSUMPTION]` con el patrón citado, y es overridable por el planner sin romper las decisiones locked.

---

## Design System

| Property                  | Value                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Tool                      | none (shadcn N/A — es Quasar/Vue, no React; el shadcn gate no aplica)                             |
| Component library         | **Quasar 2.x** (existente en ambas apps). Sin UI kit nuevo.                                       |
| Icon library              | Material Icons (default de Quasar, ya en uso)                                                     |
| Font                      | Sistema + **Montserrat** para énfasis (horas, acciones, títulos), ya en uso en `ReservasPage.vue` |
| Paleta (fuente de verdad) | `el-templo-app/src/css/quasar.variables.scss` — cálida, **SIN azul**                              |

**Fuentes de verdad de componentes (a extender, NO reescribir):**

- Member app: `el-templo-app/src/pages/ReservasPage.vue` (grilla semanal, `slot-card`, `coverage-dialog`) y `el-templo-app/src/pages/ProfilePage.vue` (`info-card` de Mi Templo).
- Admin: `el-templo-admin/src/pages/AnaliticasPage.vue` (`q-tabs`/`q-tab-panels`) + `el-templo-admin/src/components/analytics/MiembrosTab.vue` (tabla mensual + export Excel por blob).

---

## Spacing Scale

Ambas apps usan las utilidades de spacing de Quasar (base 4px): `xs=4, sm=8, md=16, lg=24, xl=48`. No se introducen valores px custom fuera de los ya presentes en `slot-card`.

| Token | Value | Quasar class              | Uso en esta fase                                                                                    |
| ----- | ----- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| xs    | 4px   | `q-pa-xs` / `q-mr-xs`     | Gap ícono↔label dentro del chip "Especial" y del contador x/2                                       |
| sm    | 8px   | `q-gutter-sm` / `q-mb-sm` | Separación del chip contador respecto del header de la grilla; gap en `slot-card__right` (ya = 8px) |
| md    | 16px  | `q-pa-md`                 | Padding del dialog informativo (APP-03); padding de la tabla del reporte                            |
| lg    | 24px  | `q-mt-lg`                 | Corte entre KPIs "Especiales" y la tabla del reporte                                                |
| xl    | 48px  | `q-mt-xl`                 | Safe-area inferior en el dialog en mobile                                                           |

**Excepción touch-target (member app, Capacitor):** el botón "Entendido" del dialog informativo y el CTA de la card de Mi Templo van a **mínimo 44px de alto** (WCAG/Apple). El chip "Especial" NO es interactivo por sí mismo — el tap se captura en toda la `slot-card` (patrón existente `@click="onSlotTap(slot)"`), así que su tamaño visual (badge ~20-24px) no es un touch target.

---

## Typography

Se reusa la escala existente. `slot-card` ya define hora 16px/700 Montserrat, actividad 12px, pills 11px/600.

| Role                         | Clase / valor                                   | Size | Weight | Line-height | Uso                                         |
| ---------------------------- | ----------------------------------------------- | ---- | ------ | ----------- | ------------------------------------------- |
| Hora del slot                | `.slot-card__hour` (Montserrat)                 | 16px | 700    | 1.2         | Existente — sin cambio                      |
| Nombre de actividad          | `.slot-card__activity`                          | 12px | 400    | 1.4         | Existente — el nombre de la especial va acá |
| Badge "Especial"             | nuevo `.slot-card__badge--special` (Montserrat) | 11px | 600    | 1.2         | Distintivo dorado                           |
| Contador x/2 (chip)          | `q-chip` label                                  | 12px | 600    | 1.3         | "Especiales 2/2"                            |
| Título dialog APP-03         | `.info-dialog__title` (h3, Montserrat)          | 18px | 600    | 1.3         | "Actividades con Aura"                      |
| Body dialog APP-03           | `.info-dialog__text` (body)                     | 14px | 400    | 1.5         | Descripción + precios                       |
| Admin: título de tab/sección | `text-subtitle2`                                | 14px | 500    | 1.4         | "Asistencias a Especiales — <mes>"          |
| Admin: KPI número            | `text-h4`                                       | 34px | 400    | 1.2         | Contador de suscripciones activas           |
| Admin: KPI caption           | `text-caption`                                  | 12px | 400    | 1.4         | "Socios activos" / "Externos activos"       |

**Regla de pesos:** 400 (regular) + 600/700 (semibold/bold) — coherente con lo ya presente. No introducir un tercer peso.

---

## Color

Split 60/30/10 sobre la paleta cálida existente. **El acento dorado ("Aura") es la única incorporación de color de esta fase** y queda RESERVADO para señalizar "especial".

| Rol                          | Color                                     | Token                                     | Uso                                                                                                                                                          |
| ---------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 60% dominante                | Marble Cream `#f2ede5`                    | `$cream`                                  | Fondo de página (member app) — existente                                                                                                                     |
| 30% secundario               | Blanco / superficie de card               | `slot-card` (borde `rgba($primary,.12)`)  | Cards de slot, cards de KPI, panel del dialog — existente                                                                                                    |
| 10% acento primario          | Terracotta `#96593a`                      | `$primary`                                | Acción "Reservar", links, hora del slot — existente                                                                                                          |
| **Acento "Especial" (Aura)** | Aged Gold `#7d6520` sobre tinte `#f5ecd9` | `$warning` (texto) + bronce claro (fondo) | **RESERVADO exclusivamente para:** badge "Especial", ícono `auto_awesome`, chip contador x/2, ícono del dialog informativo. No usar en ningún otro elemento. |
| Semántico éxito              | Warm green `#3b7249`                      | `$positive`                               | "Reservado"/"Asististe" — existente, sin cambio                                                                                                              |
| Semántico bloqueo            | Olive Stone `#6b6459` / grey-6            | `$info` / grises                          | Estado "sin saldo" y "requiere plan especial" — **tono neutro apagado, NO rojo** (no es un error, es una condición de acceso) `[ASSUMPTION]`                 |

**Regla de acento dorado:** ningún otro elemento de la app puede usar el dorado Aura. Si el checker encuentra dorado fuera de la lista reservada → violación de contrato.

**Estado bloqueado ≠ error:** el bloqueo por falta de pase o saldo se representa con grises/olive apagado + ícono `lock`/`auto_awesome`, nunca con `$negative` (rojo). El rojo queda reservado para errores reales y para el botón cancelar existente.

---

## Component Contract — Member app

### APP-01 · Distintivo y estados del slot especial

**Distintivo (todos los estados):** en la `slot-card__right` de una actividad especial se antepone un badge dorado:

```
<span class="slot-card__badge slot-card__badge--special">
  <q-icon name="auto_awesome" size="14px" /> Especial
</span>
```

- CSS nuevo: `.slot-card__badge--special { color:#7d6520; background:#f5ecd9; padding:2px 9px; border-radius:8px; font:600 11px Montserrat; }` (espeja el patrón de `.slot-card__avail`).
- El flag por slot viene de `WeeklySlotView.isSpecial` (Discretion: 161-05 lo expuso en `getScheduleSlotRaw`; el planner debe propagarlo a `getWeeklyGrid`/`WeeklySlotView`).

**Matriz de estados** (evaluada después de holiday/attended/booked/full/past, que conservan su prioridad actual):

| #   | Usuario / condición                        | Distintivo   | Zona derecha del slot                                                                          | Tap (`onSlotTap`)                                                                                                             |
| --- | ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| E1  | Con pase + `classesRemaining > 0`          | Badge dorado | Pill de disponibilidad + botón **"Reservar"** (flujo normal)                                   | Reserva; backend descuenta del sub especial                                                                                   |
| E2  | Con pase + `classesRemaining == 0` (0/2)   | Badge dorado | Pill neutra apagada **"Usaste tus 2 clases"** (olive/grey, sin botón)                          | Abre toast/dialog corto: "Ya usaste tus 2 clases especiales del mes. Se renuevan con tu próximo período." `[ASSUMPTION]` copy |
| E3  | Socio presencial **sin** pase especial     | Badge dorado | Chip/afordancia **"Requiere plan especial"** (olive apagado, ícono `lock`, sin botón Reservar) | Abre **dialog informativo APP-03**                                                                                            |
| E4  | Externo-solo-pase, viendo una **especial** | Badge dorado | Igual que E1/E2 según saldo                                                                    | Igual que E1/E2                                                                                                               |
| E5  | Externo-solo-pase, viendo una **regular**  | —            | **OCULTA** (ver decisión abajo)                                                                | n/a                                                                                                                           |

**Decisión E5 — regulares OCULTAS para externo-solo-pase (no bloqueadas):**
Se filtran client-side por `isSpecial` cuando el usuario es "solo-especial". Rationale: D-06 dice que ese usuario "ve la grilla **limitada a especiales**"; mostrar decenas de slots regulares bloqueados que estructuralmente nunca podrá reservar (GATE-04 los rechaza en backend) es ruido, no información. El socio presencial (E3) SÍ ve sus regulares normalmente + las especiales con estado informativo — no pierde nada de su vista actual (D-06). `[ASSUMPTION]` sobre "ocultas vs bloqueadas", explícitamente permitida por CONTEXT.

**Refinamiento del gate de página** (`useUserStore` + `ReservasPage` gate `canReservePresencial`): hoy es todo-o-nada por `hasPresencialPlan`. Debe pasar a tres capacidades derivadas de las subs:

- `hasPresencialAccess` (socio con presencial activo) → ve grilla completa.
- `hasSpecialPass` (sub categoría `especial` activa) → ve especiales reservables/contador.
- externo-solo-pase = `hasSpecialPass && !hasPresencialAccess` → grilla filtrada a especiales (E5).
  El usuario que hoy ve la página no debe perder acceso: cualquiera con `hasPresencialAccess` **o** `hasSpecialPass` pasa el gate de página.

### APP-02 · Contador x/2

Dos ubicaciones (Discretion: "chip, card, o ambos" → **ambos**, mínimo esfuerzo reusando patrones):

1. **Chip en la grilla (primario):** un `q-chip` dorado, **una sola instancia** anclada al header/cabecera de la semana de `ReservasPage`, visible **solo si `hasSpecialPass`**. Label: `<q-icon auto_awesome> Especiales · {classesRemaining}/2`. No se pone el contador en cada slot (sería ruido). Cuando `0/2`, el chip cambia label a "Especiales · 0/2 · se renuevan el próximo mes" en tono apagado. `[ASSUMPTION]` — no hay chip de header hoy; se agrega bajo el selector de sede, coherente con la fila de contexto existente.
2. **Card en Mi Templo (`ProfilePage`):** un `info-card` análogo a la card de suscripción existente (`card_membership`), solo si hay sub especial activa. Ícono `auto_awesome` dorado, label "Actividades con Aura", value "{classesRemaining} de 2 clases este mes" + vencimiento del período. Espeja exactamente el markup de `.info-card` ya presente (no CSS nuevo salvo el color del ícono).

Fuente del dato: `classesRemaining` del sub `especial` (D-03; el backend ya lo expone como sub en paralelo vía los endpoints de suscripciones / `GET /members/me`).

### APP-03 · Dialog informativo (sin pago in-app)

Se dispara desde E3 (tap en especial sin pase) y opcionalmente desde el chip contador cuando no hay pase. Estructura = clon de `coverage-dialog` existente, con acento dorado en vez de terracotta y **una sola acción** (sin CTA de compra — D-02).

```
<q-dialog v-model="showAuraInfoDialog">   <!-- NO persistent -->
  <q-card class="info-dialog">
    <q-card-section class="info-dialog__body">
      <q-icon class="info-dialog__icon" name="auto_awesome" size="2.5em" />  <!-- dorado -->
      <h3 class="info-dialog__title">Actividades con Aura</h3>
      <p class="info-dialog__text">...</p>
    </q-card-section>
    <q-card-actions>
      <q-btn unelevated no-caps class="full-width" label="Entendido" v-close-popup />
    </q-card-actions>
  </q-card>
</q-dialog>
```

**Copy (español rioplatense, tono de la app):**

> **Actividades con Aura**
> Son clases especiales de nuestros profes, además de tu plan.
> Con el plan especial reservás **2 clases por mes**.
> **Socios: $10.000 · No socios: $20.000** por mes.
> Consultá en recepción o con tu profe para sumarte.

- Sin botón de pago, sin link a WhatsApp de cobro (no hay gateway; la venta es por gestión/PoS — D-02). Un único botón "Entendido".
- Los precios se muestran como texto informativo, no como precio-por-comprar. `[ASSUMPTION]` — hardcode del copy es aceptable en esta superficie (los planes viven en backend, pero el mensaje es marketing interno estático); si el planner prefiere leerlos del plan `especial`, es override válido.

---

## Component Contract — Admin (REP-01)

### Ubicación

**Nuevo tab "Especiales" en `AnaliticasPage.vue`** (Analíticas vive dentro de Finanzas en el nav v5.4). Se agrega como último `q-tab` + `q-tab-panel`, espejando el patrón exacto del tab "Referidos A/B" (v5.5): `<q-tab name="especiales" label="Especiales" icon="auto_awesome" />` + componente `EspecialesTab.vue` en `src/components/analytics/`. Ícono `auto_awesome` (coherente con el acento Aura de la app; NO `star`, que ya usa "Clases").

### Contenido del tab

1. **KPIs "Especiales" (D-05 — contador de suscripciones activas):** fila de 2 `q-card` (patrón `MiembrosTab` KPI cards):
   - "Socios con plan especial activo" — `text-h4`, número.
   - "Externos con plan especial activo" — `text-h4`, número.
   - `[ASSUMPTION]` opcional tercer card "Total activos" si es barato.
   - Separación socio/externo por: plan `requiresPresencial` presente en otra sub / categoría → socio; sin presencial → externo (regla de derivación de D-04/D-06).

2. **Selector de mes:** reusar el patrón de período existente en Analíticas (mismo control que otros tabs). Default = mes en curso.

3. **Tabla de asistencias (REP-01):** `q-table` (patrón `churnedColumns`), filas = actividad especial, para el mes seleccionado:

   | Columna             | Alineación | Contenido                               |
   | ------------------- | ---------- | --------------------------------------- |
   | Actividad           | left       | Nombre de la actividad especial         |
   | Asistencias socio   | right      | Conteo de asistencias de origen socio   |
   | Asistencias externo | right      | Conteo de asistencias de origen externo |
   | Total               | right      | Suma (peso 600)                         |
   - Fila de totales al pie (o `text-weight-medium` en la última). **SIN montos** (D-04 — la regla de reparto es de Nacho).
   - Derivación: `JOIN attendance → schedules → activities (is_special)` + origen del member al momento (socio si tenía presencial activo / plan `requiresPresencial`, si no externo).
   - Empty state: "No hubo asistencias a actividades especiales en <mes>."

4. **Export Excel:** botón `q-btn` con `icon="download"` + `:loading`, patrón `exportChurnedMembers` de `MiembrosTab` (endpoint que devuelve blob xlsx; `a.download = 'especiales-<YYYY-MM>.xlsx'`). Consistente con los reportes existentes que reusan export Excel server-side (Discretion: "seguí el patrón si es barato" → lo es).

---

## Copywriting Contract

| Elemento                  | Copy                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge de slot             | **Especial**                                                                                                                                                                                                        |
| Chip contador (con saldo) | **Especiales · {n}/2**                                                                                                                                                                                              |
| Chip contador (0/2)       | **Especiales · 0/2 · se renuevan el próximo mes**                                                                                                                                                                   |
| Estado E2 (sin saldo)     | Pill: **Usaste tus 2 clases** · toast: "Ya usaste tus 2 clases especiales del mes. Se renuevan con tu próximo período."                                                                                             |
| Estado E3 (sin pase)      | Afordancia: **Requiere plan especial** → abre dialog APP-03                                                                                                                                                         |
| Dialog APP-03 título      | **Actividades con Aura**                                                                                                                                                                                            |
| Dialog APP-03 body        | "Son clases especiales de nuestros profes, además de tu plan. Con el plan especial reservás **2 clases por mes**. Socios: $10.000 · No socios: $20.000 por mes. Consultá en recepción o con tu profe para sumarte." |
| Dialog APP-03 acción      | **Entendido** (única, sin pago)                                                                                                                                                                                     |
| Mi Templo card            | Label **Actividades con Aura** · value **{n} de 2 clases este mes**                                                                                                                                                 |
| Admin tab                 | **Especiales**                                                                                                                                                                                                      |
| Admin KPIs                | **Socios con plan especial activo** / **Externos con plan especial activo**                                                                                                                                         |
| Admin tabla título        | **Asistencias a Especiales — {mes}**                                                                                                                                                                                |
| Admin empty               | "No hubo asistencias a actividades especiales en {mes}."                                                                                                                                                            |
| Export archivo            | `especiales-{YYYY-MM}.xlsx`                                                                                                                                                                                         |

**Naming lock (D-01):** en toda superficie visible → **"Especiales" / "plan especial"** y marca **"Actividades con Aura"**. **NUNCA "pase(s)"** en UI (jerga interna). El checker debe rechazar cualquier "pase" visible.

**Acciones destructivas:** ninguna en esta fase. El único botón destructivo tocado es "Cancelar reserva" (existente, sin cambios) — aplica también a una especial reservada (cancelar debería devolver el crédito, pero eso es comportamiento backend, fuera de contrato UI).

---

## Accesibilidad y responsive

- **Contraste:** Aged Gold `#7d6520` sobre `#f5ecd9` ≈ AA para texto ≥600/11px (badge). Los tokens de marca ya son WCAG AA sobre cream. El olive `#6b6459` para estado bloqueado cumple AA sobre superficie clara.
- **No solo color:** cada estado combina color + ícono + texto (badge dorado lleva ícono `auto_awesome` + palabra "Especial"; bloqueo lleva `lock` + texto). Un usuario daltónico distingue por ícono/label.
- **Touch targets:** botones interactivos ≥44px (member app Capacitor). El tap del slot cubre toda la card (ya existente).
- **Mobile-first:** member app es la superficie primaria; el dialog APP-03 usa el ancho del `coverage-dialog` existente (responsive, botón full-width). Admin (web) reusa `q-table` responsive de Analíticas.
- **Dark mode:** el member app soporta dark (charcoal, `$dark`/`$dark-page`). El badge dorado debe tener variante dark: texto `#d4b896` (bronze-light) sobre `rgba(125,101,32,.18)`. `[ASSUMPTION]` — espeja cómo `slot-card__avail` maneja fondos claros; si la app hoy fuerza light en Reservas, el planner puede omitir la variante dark.

---

## Registry Safety

No aplica — sin registries de terceros. Stack Quasar/Vue existente, sin dependencias nuevas de UI (respeta la regla "nunca instalar deps sin preguntar").

| Gate                 | Estado         |
| -------------------- | -------------- |
| shadcn init          | N/A (no React) |
| Third-party registry | ninguno        |
| Vetting              | no requerido   |

---

## Checker Sign-Off

- [ ] Spacing: solo utilidades Quasar base-4 + valores `slot-card` existentes.
- [ ] Typography: 2 pesos (400 + 600/700), escala reusada.
- [ ] Color: 60/30/10 + dorado Aura RESERVADO a la lista de 4 usos; bloqueo en olive/grey (no rojo).
- [ ] Naming: "Especiales"/"Actividades con Aura", cero "pase(s)" visible.
- [ ] Estados APP-01: E1-E5 cubiertos; E5 = ocultas (documentado).
- [ ] APP-02: chip único en grilla + card Mi Templo, ambos gateados por sub especial.
- [ ] APP-03: dialog informativo, una sola acción, sin pago.
- [ ] REP-01: tab "Especiales" en Analíticas, KPIs socio/externo, tabla sin montos, export xlsx.
- [ ] Accesibilidad: color+ícono+texto en cada estado; touch ≥44px.
