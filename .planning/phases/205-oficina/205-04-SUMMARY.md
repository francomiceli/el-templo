---
phase: 205-oficina
plan: 04
subsystem: el-templo-admin
tags: [oficina, admin, quasar, vue3, polling]
requires: [205-02]
provides:
  - "Ruta /oficina y /oficina/:topicId (owner/admin/gestion) con pelotita en el menu"
  - "useOfficeApi: tipos del contrato y 8 llamadas a /admin/office"
  - "relativeTime(iso, now) con test unitario"
  - "Componentes OficinaTopicList/Detail/Composer/Dialog reutilizables (el Dialog acepta presetTarget para la ficha del socio)"
affects: [205-05]
key-files:
  created:
    - el-templo-admin/src/composables/useOfficeApi.ts
    - el-templo-admin/src/utils/relative-time.ts
    - el-templo-admin/src/utils/__tests__/relative-time.test.ts
    - el-templo-admin/src/pages/OficinaPage.vue
    - el-templo-admin/src/components/oficina/office-labels.ts
    - el-templo-admin/src/components/oficina/OficinaTopicList.vue
    - el-templo-admin/src/components/oficina/OficinaTopicDetail.vue
    - el-templo-admin/src/components/oficina/OficinaComposer.vue
    - el-templo-admin/src/components/oficina/OficinaTopicDialog.vue
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/stores/useAdminStore.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts
metrics:
  tasks: 2
  commits: 2
---

# Fase 205 Plan 04: Oficina en el admin

Seccion Oficina completa en el admin: menu con pelotita, rutas, composable contra la API del plan 02, pagina de dos columnas (alterna lista/detalle en movil) con filtros, hilo con menciones, acciones (tomar, responsable, dormir, cerrar, reabrir, editar), dialogo de alta/edicion y refresco cada 60 s.

## Commits

- `8f0fa7bb9` feat(205-04): roles, menu con badge, rutas, composable, labels y `relativeTime` con test
- `fea622177` feat(205-04): pagina Oficina con lista, detalle, compositor con menciones y dialogo

## Verificacion

- `pnpm lint` (admin): 0 errores, 8 warnings, todos preexistentes en archivos ajenos (env.d.ts, CobrosPage.vue, session-pdf-builder.ts). Ningun archivo propio suma warnings.
- `prettier --check` limpio en todos los archivos tocados.
- `relative-time.test.ts`: 9 tests verdes. `vitest` NO esta instalado en `el-templo-admin` (`npx --no-install` falla); se corrio con el binario del paquete API sin instalar nada: `cd el-templo-admin && ../el-templo-api/node_modules/.bin/vitest run --root . src/utils/__tests__/relative-time.test.ts`. El test usa fechas locales (`new Date(y, m, d, h)`), asi que no depende de la zona horaria de la maquina.
- `vue-tsc` no esta disponible localmente: se verifico con `tsc --noEmit` (sin errores en `.ts` propios; unico ruido: el import de `vitest` en el test, igual que los demas tests del admin), con `@vue/compiler-sfc` (los 5 `.vue` compilan template y script) y con grep de CADA import: paths (`src/boot/axios`, `src/stores/useAuthStore`, `src/stores/useAdminStore`, `src/components/ReferrerSelect.vue`, `src/utils/relative-time`, `src/components/oficina/office-labels`, etc.) y nombres exportados.
- Props/emits contra componentes reales: `ReferrerSelect` (props `label`/`hint`/`disable`, emit `update:modelValue`, expose `reset`), `QInput.nativeEl`, `QMenu.hide()`, `QDialog` con `prompt`.
- Sin `v-html`, sin `console.*`, sin hex ni azul en los archivos nuevos.

## Decisiones y desvios

1. **`ReferrerSelect` sin `v-model`**: el dialogo escucha `@update:model-value` en vez de `v-model`, porque el componente no declara la prop `modelValue` (evita que el atributo pase de largo al `q-select` raiz). No se modifico `ReferrerSelect` (ya tenia `label`/`hint`).
2. **`targetLabel` no se manda en el alta con socio buscado**: `ReferrerSelect` no expone el nombre, y la API lo resuelve sola desde `users` cuando falta. Con `presetTarget` (ficha del socio) si se manda el `label` recibido.
3. **Dormido: boton "Despertar"** en lugar de "Reabrir" cuando el tema esta dormido (hace `patch({ status: 'abierto' })`, igual que Reabrir). Ademas queda disponible "Cerrar" para temas dormidos.
4. **Dormir con atajos**: el menu del boton Dormir suma "Manana / En 3 dias / En 1 semana" arriba del `q-date`. El calendario usa `:options` (q-date no tiene `minDate`) para bloquear hoy y el pasado. El "hoy" del cliente es el del navegador; la validacion real (`> hoy` en la tz de la sede) sigue siendo la de la API, que devuelve 400 con mensaje si no cumple.
5. **Compositor siempre montado** (`v-show`, no `v-if`) con el tema cerrado: si alguien cierra el tema mientras alguien escribe, el borrador sobrevive. Se muestra la franja "Reabrir y comentar" y, al reabrir, se enfoca el compositor.
6. **Eventos en la linea de tiempo** usan `assigneeName` del payload ("Ana asigno el tema a Bruno"); el despertar automatico (`reabierto` con `{ auto: true }`, actor null) se lee "El tema se desperto solo"; los eventos `sistema` muestran su `body` tal cual. El resumen de la lista (`lastEventLine`) cubre el caso sin payload.
7. **Alta desde la pagina y filtros**: si el tema recien creado quedaria escondido por los filtros activos (Cerrados, Dormidos, Mios sin asignarse, Del sistema, busqueda), se limpian los filtros antes de seleccionarlo.
8. **Layout**: tarjeta de detalle de alto fijo en escritorio (solo scrollea la conversacion) y de alto libre en movil (scrollea la pagina). En movil, con un tema abierto, se esconden titulo y filtros para que el detalle ocupe todo; el boton "Volver" limpia la seleccion y hace `router.replace('/oficina')`.
9. **Sin cambios en `OficinaTopicDialog` para edicion de responsable/estado**: en modo edicion solo se editan titulo y detalle (el responsable y el estado se mueven desde el detalle, como pide el plan).

## Fuera de alcance (queda para el plan 05)

- Pestana "Oficina" en la ficha del socio (D-20): no figura en `files_modified` de este plan. `OficinaTopicDialog` ya acepta `presetTarget: { kind: 'socio', id, label }` y `OficinaTopicList`/`OficinaTopicDetail` se pueden reutilizar tal cual.

## Dudas para Franco

- Ninguna bloqueante. Visual sin verificar en navegador (no hay stack levantado en este worktree): conviene una pasada rapida por Oficina en staging, en escritorio y en el telefono, mirando sobre todo el menu de menciones `@` y el alto del detalle.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: el admin solo consume rutas existentes (gateadas por rol en la API); los textos de comentarios se renderizan como texto plano (spans, sin HTML crudo).

## Self-Check: PASSED

Archivos creados y commits `8f0fa7bb9` y `fea622177` verificados en el log.
