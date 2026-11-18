---
phase: 214-comunidad-anotados-aura
plan: 13
subsystem: private-media
tags: [r2, avatars, hmac, jobs, member-photos, D-34, D-43, D-63]
requires: ["214-12"]
provides:
  - "Claves privadas de avatar sin id de usuario (segmento HMAC) y validador anclado"
  - "Firma de lectura estable por hora (opts.stableHourly) sin cambiar Conquer"
  - "copyFromPublic / removePublic en PrivateMediaStore"
  - "Job cada 15 min que espeja la foto de ficha al bucket privado"
affects: ["214-14", "214-15"]
key-files:
  created:
    - el-templo-api/src/modules/members/ficha-photo-mirror.ts
    - el-templo-api/src/jobs/ficha-photo-mirror.ts
    - el-templo-api/test/jobs/ficha-photo-mirror.test.ts
  modified:
    - el-templo-api/src/modules/conquer/private-media.ts
    - el-templo-api/src/index.ts
    - el-templo-api/test/unit/conquer-private-media.test.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
decisions:
  - "Las URLs de menos de 15 min se cuentan en skipped y no dejan fila: se reintentan en la corrida siguiente"
  - "Una photo_url sin timestamp legible no es 'nueva': se procesa y, si no tiene la forma esperada, queda fallida"
  - "Sin storage privado configurado el servicio devuelve skipped = candidatos y no escribe nada"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 13: tienda privada de avatares y espejo de la foto de ficha Summary

Claves `private/avatars/{tenant}/{HMAC 24 hex}/{uuid}.jpg` sin el id del usuario, firma de lectura estable por hora (solo con `opts.stableHourly`), copia/borrado entre bucket público y privado, y un job de 15 minutos que espeja una sola vez cada `users.photo_url` sin escribir en ningún GET.

## Commits

- `002a542ce` test(214-13): claves de avatar sin id y firma estable (rojo)
- `445de9309` feat(214-13): claves de avatar sin id de usuario y firma estable por hora
- `a8bf80f75` feat(214-13): copia de la foto de ficha al bucket privado y borrado del público
- `cea4f76fc` feat(214-13): job del espejo de la foto de ficha (D-43)

## Verificación

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 0 errores en los archivos tocados (el total sigue rojo por deuda ajena).
- Test unitario `conquer-private-media.test.ts` con `vitest.config.unit.ts`: RED 9 fallos, GREEN 78/78.
- `ficha-photo-mirror.test.ts` (8 casos) y el gate CON-04 (14 jobs): escritos, quedan para CI.

## Deviations from Plan

- La ventana de 15 minutos (nota del orquestador / verificador) no estaba en las tareas: se agregó `isFichaUrlTooFresh` y `FICHA_PHOTO_MIN_AGE_MS` en el servicio, con un octavo caso de test (se ignora y madura).
- `mirrorFichaPhotos` acepta además `opts.now` (reloj inyectable para el test).
- Se actualizó el texto de CON-04 ("13" -> "14" jobs) además de la lista.

## Notas para los planes siguientes

- La foto de ficha nueva aparece en la comunidad entre 15 y ~30 minutos después de cargarla.
- SUPUESTO sin verificar: R2 admite `CopyObject` entre buckets de la misma cuenta. Si en staging falla, todas quedan `fallida` y el plan 14 cae a "sin foto".
- `copyFromPublic` y `removePublic` son SOLO para la foto de ficha; `publicKey` sale siempre de `publicKeyFromFichaUrl`.
- Para firmar un avatar usar `presignGet(key, AVATAR_LIST_GET_EXPIRES_SEC | AVATAR_ME_GET_EXPIRES_SEC, { stableHourly: true })`.
- `isOwnAvatarKey` y `privateAvatarKey` tiran Error si falta `JWT_SECRET`.
- El job necesita `app` (cliente R2): `startFichaPhotoMirrorJob(app)`, no `app.db`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 4 commits y los 3 archivos nuevos existen.
