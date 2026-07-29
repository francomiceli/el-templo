# Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-29
**Phase:** 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
**Areas discussed:** Forma del manifiesto, Revisión de la clasificación, Fixtures del tenant 2, templo-module hoy

---

## Forma del manifiesto

| Option | Description | Selected |
|--------|-------------|----------|
| Por ruta exacta | Una línea por endpoint (~300 una sola vez; después 1 línea por ruta nueva). Agregar una ruta obliga a tocar el manifiesto — esa edición ES la decisión consciente. | ✓ |
| Reglas por prefijo | Archivo corto (~20 comodines + excepciones), pero una ruta nueva bajo un prefijo existente se clasifica sola sin decisión humana. | |
| Híbrido | Comodines para lo masivo, entradas exactas para lo sensible; dos semánticas conviviendo. | |

**User's choice:** Por ruta exacta
**Notes:** Franco pidió aclarar primero qué es el manifiesto y el malentendido de "cientos de líneas por ruta nueva" (son ~300 líneas UNA vez; una ruta nueva agrega 1 línea). Con la aclaración, eligió la recomendada.

| Option | Description | Selected |
|--------|-------------|----------|
| Motivo obligatorio en `global` | Cada entrada global lleva su motivo al lado (como las exenciones tenant-safe del lint); tenant-scoped sin anotación. | ✓ |
| Sin motivo | La categoría sola alcanza; menos ceremonia, el porqué queda en el aire. | |

**User's choice:** Motivo obligatorio

---

## Revisión de la clasificación

| Option | Description | Selected |
|--------|-------------|----------|
| Solo global y templo-module | Checkpoint bloqueante con las dos listas cortas (~10-20 global, ~30-50 templo-module) con motivos; la masa tenant-scoped sin revisión (default seguro). | ✓ |
| Revisar las 3 listas completas | Las ~300 rutas presentadas a revisión. | |
| Autónomo | El executor clasifica todo sin checkpoint. | |

**User's choice:** Solo global y templo-module

| Option | Description | Selected |
|--------|-------------|----------|
| Duda → al checkpoint | Las dudosas van a una sección aparte del checkpoint con recomendación y porqué. | ✓ |
| Duda → tenant-scoped | Default restrictivo sin consultar. | |

**User's choice:** Duda → al checkpoint

---

## Fixtures del tenant 2

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in por archivo | Helper explícito (seedSecondTenant); formaliza los tenants ad-hoc de la 169; la suite existente no ve el tenant 2 (criterio 4 por construcción). | ✓ |
| Siempre sembrado (setup global) | Más realista pero rompe conteos absolutos de decenas de tests existentes. | |

**User's choice:** Opt-in por archivo

| Option | Description | Selected |
|--------|-------------|----------|
| Espejo mínimo fijo | 1 sede, 1 admin, 1 coach, 2 socios, 1 plan, 1 schedule — determinístico y barato. | ✓ |
| Réplica del seed del tenant 1 | Mismo volumen que el seed actual; duplica costo de provisioning. | |
| Configurable por parámetro | El helper acepta qué sembrar; más superficie de API. | |

**User's choice:** Espejo mínimo fijo

---

## templo-module hoy

| Option | Description | Selected |
|--------|-------------|----------|
| Clasificar ahora | SPOM/gladius/academy/etc. se etiquetan templo-module ya (revisadas en el checkpoint); la 176 solo agrega enforcement. | ✓ |
| Poblar en la 176 | Arrancar con 2 categorías efectivas y reclasificar después. | |

**User's choice:** Clasificar ahora

## Claude's Discretion

- Formato de la clave method+path y manejo de prefijos de plugins.
- Estructura interna del archivo del manifiesto y wording de los mensajes de rojo.
- Limpieza del tenant 2 entre tests (precedente `limpiarRastro()` del 169-06; trampas `cleanAllTestData`/`branches`).
- Ubicación del test del manifiesto en la suite.

## Deferred Ideas

- `v51-milestone-data-rollout.md` — todo revisado y NO folded (sin relación; matcheó por keywords genéricas).
