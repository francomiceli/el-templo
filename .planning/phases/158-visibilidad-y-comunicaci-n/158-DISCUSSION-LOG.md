# Phase 158: Visibilidad y comunicación - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 158-Visibilidad y comunicación
**Areas discussed:** Pantalla "Mis referidos", Notificaciones, Panel admin (VIS-03), Puesta en marcha

---

## Selección de áreas

Se presentaron las 4 áreas como multiselect. Franco respondió **"hagamos todo
lo que recomiendes"** → Claude presentó recomendaciones completas para las 4
áreas en un solo paso y Franco las aprobó en bloque ("Aprobar las 4").

---

## Pantalla "Mis referidos"

| Option                               | Description                                                                            | Selected |
| ------------------------------------ | -------------------------------------------------------------------------------------- | -------- |
| Entrada desde Perfil → página propia | Con share del código, desglose del descuento y lista de vínculos con estados derivados | ✓        |
| Tab principal de navegación          | Descartado — no amerita                                                                |          |

**User's choice:** recomendación de Claude aprobada en bloque.
**Notes:** simetría explícita (ambos lados del vínculo visibles); nombre
completo del referido (se conocen por definición); estados Pendiente /
Activo / Suspendido ("se reactiva si vuelve").

---

## Notificaciones

| Option                                                                    | Description                                                | Selected |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Solo "vínculo activado" (push al referidor) + categoría nueva `referidos` | Migración de enum + template + preferencia opt-out         | ✓        |
| También "descuento por caerse"                                            | Diferida — requiere cron de vigilancia y puede ser ruidosa |          |
| Reusar categoría existente (`planes`/`anuncios`)                          | Descartado — mezcla preferencias                           |          |

**User's choice:** recomendación de Claude aprobada en bloque.

---

## Panel admin (VIS-03)

| Option                                     | Description                                | Selected |
| ------------------------------------------ | ------------------------------------------ | -------- |
| Sección "Referidos" en la ficha del alumno | Quién lo trajo + a quiénes trajo + estados | ✓        |
| Listado/dashboard global del programa      | Diferido hasta que haya volumen            |          |
| No hacer nada (VIS-03 es opcional)         | Descartado — la ficha es barata y útil     |          |

**User's choice:** recomendación de Claude aprobada en bloque.

---

## Puesta en marcha

| Option                                                                | Description                      | Selected |
| --------------------------------------------------------------------- | -------------------------------- | -------- |
| Deploy → backfill de códigos (D-25) → anuncio push único (`anuncios`) | Sin banners ni onboarding in-app | ✓        |

**User's choice:** recomendación de Claude aprobada en bloque.

## Claude's Discretion

- Copy exacto de pantalla y notificación; layout Quasar.
- Shape de la respuesta de `GET /members/referrals`.
- Endpoint nuevo vs extender detalle de member para la ficha admin.

## Deferred Ideas

- Notificación "descuento por caerse" (cron de vigilancia).
- Dashboard global de referidos en admin.
- Banner/onboarding in-app del programa.
