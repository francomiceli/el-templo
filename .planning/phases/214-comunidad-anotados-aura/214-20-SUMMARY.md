---
phase: 214-comunidad-anotados-aura
plan: 20
subsystem: app-profile-photo
tags: [app, foto-perfil, canvas, exif, ios, D-30, D-33, D-34, D-35, D-50, D-63, D-69]
requires: ["214-19"]
provides:
  - "centerSquareCrop, toAvatarJpeg, AVATAR_SIDE (480), AVATAR_QUALITY (0,82)"
  - "photoErrorMessage(err), rejectionReasonLabel(code)"
  - "useProfilePhoto: pickFromCamera, pickFromGallery, pickFromFile, upload, removePhoto, discard, cleanup, previewUrl, uploading, error, isNative"
  - "NSCameraUsageDescription con la foto de perfil (D-35)"
affects: ["214-21", "214-27"]
key-files:
  created:
    - el-templo-app/src/utils/avatar-image.ts
    - el-templo-app/src/utils/photo-messages.ts
    - el-templo-app/src/utils/__tests__/avatar-image.test.ts
    - el-templo-app/src/utils/__tests__/photo-messages.test.ts
    - el-templo-app/src/composables/useProfilePhoto.ts
  modified:
    - el-templo-app/src-capacitor/ios/App/App/Info.plist
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 20: lógica de la foto de perfil en la app Summary

La app elige la foto (cámara, galería o archivo), la recorta cuadrada al centro a 480 px, la re-codifica a JPEG 0,82 por canvas (sin EXIF ni ubicación) y la sube por URL firmada sin el token de la app. Sin pantallas: la hoja es el plan 21.

## Commits

- `33b2673d4` test(214-20): recorte de la foto y textos de error (rojo)
- `852975440` feat(214-20): recorte cuadrado y textos de la foto de perfil
- `c10e3ef15` feat(214-20): lógica de la foto de perfil y permiso de cámara de iOS (D-35)

## Verificación

- `avatar-image.test.ts` 7 de 7 y `photo-messages.test.ts` 11 de 11 en verde (el commit del test es anterior).
- vue-tsc (app): 21 errores, igual a la línea de base, ninguno en los archivos tocados.
- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- Ningún mensaje contiene "pesad" (D-33); sin `CameraSource.Prompt`; sin `onUnmounted`.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

## Decisiones propias

- Códigos propios de error: `DECODE`, `PERMISSION` y `PUT`. `photoErrorMessage` mira primero el `code` y después `response.status` de axios; todo lo demás (red caída, 409, 500, desconocido) cae en "No pudimos subir la foto…".
- Una falla de canvas que no es de formato (sin contexto 2d, `toBlob` nulo, fallo del plugin) se muestra como "No pudimos procesar la foto. Probá con otra." (el texto del 400).
- `pickFromCamera`/`pickFromGallery`/`pickFromFile` devuelven `true` si quedó una foto preparada; `false` si se canceló (sin error) o falló (con `error`). La galería no pide permiso de cámara.
- Tras confirmar, `upload` fija un estado provisional `pendiente` (conservando `url` y `pendingUrl`) y luego `refreshProfile()` lo pisa con el del servidor: así, si la recarga falla (es best-effort), la UI igual muestra "en revisión". Después descarta el blob y la vista previa.
- PUT con timeout de 90 s (igual que Conquer) y `AbortController` que `cleanup()` corta.
- `upload()` ignora un segundo llamado mientras `uploading` está en true.

## Notas para los planes siguientes

- Plan 21: la hoja usa `isNative` para elegir botones; tras `pickFrom*` devuelve `true` se muestra `previewUrl`; "Elegir otra" = `discard()` y volver a elegir; `error` ya viene con el texto final. `removePhoto()` actualiza el store a `none`; los notify de éxito/fracaso los pone la pantalla. Llamar `cleanup()` desde el `onUnmounted` del componente.
- Plan 27: usar `rejectionReasonLabel` para el staff y armar "Motivo: {etiqueta}." con el código que trae `/me`.
- Cambiar Info.plist exige binario nuevo de iOS (D-35); no se generó build. La prueba con una foto con ubicación en iOS queda para el UAT (plan 32).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-20-01: el único `body` del PUT es el blob de `toAvatarJpeg`. T-214-20-02: el PUT usa `fetch` sin `Authorization`. T-214-20-03: el canvas reduce a 480 px y un formato ilegible corta con mensaje claro sin subir nada. T-214-20-04: los logs llevan solo status y causa corta, nunca `uploadUrl` ni `key`.

## Self-Check: PASSED
