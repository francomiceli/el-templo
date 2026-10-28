---
phase: 202-conquer-tutoriales-correcciones
plan: 15
subsystem: docs
tags: [conquer, uat, sweep, r2, corrections, tutorials]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: cadena 202-01..14 (API, admin y app de tutoriales y correcciones)
provides:
  - barrido final de la cadena 202 registrado en el UAT (sección 7)
  - 201-UAT.md al día: infra de R2, casos D-25..D-29, decisiones DA-37..DA-52
affects: []
key-files:
  modified:
    - .planning/phases/201-conquer/201-UAT.md
key-decisions:
  - "El conteo de migraciones 029* es 8 (no 7): la 0297 de Novedades push vino con el merge de master; las 7 de Conquer están"
duration: 35min
completed: 2026-10-27
---

# Phase 202 Plan 15: Barrido final y guía de UAT Summary

**Barrido automático completo de 202-01..14 sin hallazgos de código, y `201-UAT.md` ampliado con los pasos de infraestructura de Franco (CORS con orígenes nativos, regla de 60 días con prefijo exacto), los casos manuales D-25..D-29 y las 16 decisiones DA-37..DA-52 para validar.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `63afdc882` | docs(202-15): barrido final de tutoriales y correcciones en el UAT |
| 2 | `3facaf775` | docs(202-15): UAT de tutoriales y correcciones (infra de R2, casos D-25..D-29, decisiones) |

## Resultado del barrido (detalle en UAT §7, "Barrido de 202-15")

Todo verde, sin tocar código:

- API: `tsc` 0, `lint:tenant` `DISCREPANCIAS: 0`, `typecheck:tests` filtrado vacío, `oracle-check.mjs` OK (ORACULO, SEMILLA, MOTOR 14785, REGLAS, ANEXO).
- Manifiesto: 17 claves nuevas (3+2+4+2+6) y `ENTRADAS_BASELINE` 533 = 516 + 17 (las claves contadas a mano también dan 533).
- Migraciones: 0298 y 0299 libres en `origin/master`, `origin/staging`, el resto de ramas remotas y los worktrees `et-*`; sin `;` en comentarios.
- App: `pnpm lint` 0 errores (2 warnings preexistentes); `vue-tsc` filtrado por conquer/training vacío; barridos de estética (sin CDN, sin Cormorant, sin hex ni `--cq-` fuera de lugar, `.cq-root` en las 8 páginas y los 4 `q-dialog`).
- Admin: `pnpm lint` 0 errores (8 warnings preexistentes); `vue-tsc` filtrado vacío; sin `primary`/`info`.
- D-19: `package.json` x3, `capacitor.config.ts`, `components/anatomy` y `src/css` sin cambios de la 202; `video-service.ts` solo +70 líneas.
- Higiene: sin `console.*` ni `any`; revisadas a mano las 15 llamadas a `log.*` de archivos nuevos: ninguna loguea URL firmada ni clave.

## Desvíos del plan

1. **Conteo de migraciones `029*` = 8, no 7.** El verify del plan espera 7; la 0297 (Novedades push) llegó con el merge de `origin/master` (2026-10-26). Los 7 archivos de Conquer están y 0298/0299 son únicos. Anotado en la tabla del UAT; el verify con `= "7"` no se corrió tal cual por ese motivo, se corrieron todos sus demás chequeos por separado.
2. **`git diff origin/staging` sobre `el-templo-app/src/css`** da `app.scss` por commits de master ya mergeados (mismo caso que 202-12); contra la base de la 202 (`87e77f38b`) está vacío.
3. **Recuento de claves del manifiesto con grep**: el grep `^  "(GET|POST|...) /"` da 532 porque la entrada `OPTIONS *` no lleva barra; el total real es 533 (`Object.keys` del test).
4. Los textos de los casos manuales de pantallas se tomaron de los SUMMARYs 202-08..14 y de los strings del código (por ejemplo "Ya tenés 3 videos esperando respuesta.", "Tu coach borró el video después de corregirlo.", "Video no disponible"). Si algún ejecutor retocó un copy después, el UAT lo cita tal cual está en el código a esta fecha.

## Ambigüedades nuevas (opción más simple)

- El CORS del bucket público se describe sin JSON propio (el plan solo pide el del privado): basta `PUT` con `Content-Type` desde el admin de staging y de prod. Staging y prod usan el mismo secret `R2_BUCKET_NAME` (ambos workflows), así que es un único bucket.
- En el JSON de CORS se agregó `MaxAgeSeconds: 3600` y no se expone ningún header; se incluyó el puerto local del admin (`http://localhost:9100`, el de `pnpm dev` según el UAT §2.2).

## Hallazgos del barrido

Ninguno de código. Observaciones para el orquestador:

- Quedó por error un archivo `/tmp/x` con la salida de una corrida de `vue-tsc` (redirección mal armada); está fuera de todo repo y no se pudo borrar (prohibido `rm`). Inofensivo.
- `CqVideoSheet.vue:71` sigue logueando `'tutorial video failed'` aunque la hoja la usan también las correcciones (ya anotado en 202-12/13). Cosmético, no tocado en este plan.
- Dos `onUnmounted` en páginas de Conquer (`ConquerLevelsPage`, `ConquerTab`) son de la 201, no de composables; no son de la 202.

## Qué tiene que hacer Franco (en orden; el detalle está en `201-UAT.md` §1 punto 6, §3 "Fase 202" y §4)

**Infraestructura (Cloudflare / GitHub)**

1. Bucket R2 privado de prod y de staging (el de las fotos) con **CORS**: `GET`, `PUT`, `HEAD`, header `Content-Type`, orígenes concretos (app y admin de prod y de staging, `capacitor://localhost`, `https://localhost`, `http://localhost:9000`, `http://localhost:9100`). El JSON está en el UAT.
2. **Regla de ciclo de vida a 60 días** en los dos buckets privados con prefijo EXACTO `private/conquer-corrections/` (con la barra final; sin ella borraría también las fotos del control físico).
3. CORS del **bucket público** (`R2_BUCKET_NAME`) para `PUT` desde el admin de **staging** además del de prod; `R2_PUBLIC_URL` cargado como secret (sin él no aparece "Ver cómo se hace").
4. Secrets `R2_PRIVATE_BUCKET_NAME` (prod) y `STAGING_R2_PRIVATE_BUCKET_NAME` (staging), más las cuatro `R2_*` del bucket de videos. Los workflows ya los pasan.

**Build**

5. `cap sync` y build nuevo de **iOS** (Info.plist con `NSMicrophoneUsageDescription` y textos de cámara/galería). Android no cambia. Sin push ni bump hasta que Franco lo autorice; CI verde antes de empezar el UAT (los tests de la 202 se escribieron y no se corrieron).
6. En staging, probar **primero** que R2 acepta el origen `capacitor://localhost` mandando un video desde el teléfono; si lo rechaza cambia DA-51.

**UAT** (`201-UAT.md`, bloque "Fase 202 · Tutoriales y correcciones con video")

7. D-25 tutoriales (admin sube `.mp4` y `.mov`; el alumno los ve en Hoy, Progreso, apertura y sábado solo donde hay).
8. D-26 correcciones de punta a punta (Espartano y Centurión; grabar y galería; coach responde con texto, con video y con ambos; "Nueva respuesta"; dos coaches).
9. D-27 topes (40 s, 4K, tipo raro, sin bucket → 503), D-28 borrado por el coach y vencido simulado borrando un objeto a mano en R2, D-29 tope de 3 y avisos sin push.
10. Puntos "a mirar a ojo" de 202-08..14 y las pantallas nuevas a 390 px en teléfono real (iPhone y Android); un `.mov` HEVC en el admin con Chrome de Windows.
11. Validar las decisiones **[validar]** de la tabla DA-37..DA-52 (§4: DA-39, DA-41, DA-43, DA-46, DA-47, DA-50) y anotar hallazgos en la §8.

El plan no tenía checkpoint humano propio; toda la prueba manual queda pendiente de Franco.

## Known Stubs

Ninguno (plan solo de documentación).

## Self-Check: PASSED

- `201-UAT.md` contiene todas las cadenas exigidas por el verify de la Task 2 (`OK`) y la tabla "Barrido de 202-15".
- Commits `63afdc882` y `3facaf775` en `git log`.
