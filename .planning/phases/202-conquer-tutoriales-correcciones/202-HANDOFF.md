# Fase 202 — Handoff (2026-10-23, para la semana del 2026-10-26)

Conquer: tutoriales en video y correcciones con video. Pedidos del profe probando la 201 en staging.
**Estado: planificada, sin ejecutar.** 15 planes (202-01..15) listos y validados (`frontmatter.validate` y
`verify.plan-structure`). Nada de código escrito. Todo vive en la rama de la 201.

## Dónde está

- Worktree `/home/franco/projects/et-201-conquer`, rama `feat/201-conquer` (SIN PUSH de los commits de planificación).
- Decisiones de producto: **D-25..D-29** al final de `../201-conquer/201-CONTEXT.md`.
- Decisiones de diseño del planificador: **DA-37..DA-52**, lista completa en `202-01-PLAN.md`.
- Los planes se escribieron como 201-36..50 y se renumeraron a 202-01..15 (rutas, `depends_on`, rangos y menciones).
  La guía de prueba sigue siendo una sola: `../201-conquer/201-UAT.md` (202-15 la amplía).

## Qué decidió Franco (D-25..D-29)

- Tutoriales: video por ejercicio y por combo, lo sube owner/admin, bucket público; el alumno ve "Ver cómo se hace".
- Correcciones: el alumno manda un video de **30 s como máximo**; el coach responde con texto y/o **video propio (30 s)**
  y puede borrar el del alumno. Bucket **privado**, vencimiento a los **60 días**.
- Defaults sin preguntar (D-29, se pueden cambiar): solo escalones del plan (+ combos si `toro`), hasta 3 sin responder,
  sin push (contadores en Inicio y en el menú del admin), sin dependencias nuevas.

## Antes de ejecutar (orquestador)

1. **¿La 201 ya está en master?** Si sí, mergear `origin/master`; si no, mergear `origin/staging` en `feat/201-conquer`
   (el 2026-10-23 la rama estaba 28 commits atrás de staging). Pendientes de la 201 sin push en la rama: nombres
   Legionario/Centurión/Espartano (`413924288`) y cascos (`108375889`).
2. **Re-chequear migraciones 0298 y 0299** contra `origin/master`, `origin/staging` y los worktrees `et-*` (D-21). El
   2026-10-23: master/staging en 0297 (Novedades push), Wellhub reservó 0295/0296.
3. **Overrides de `201-EXECUTOR-RULES.md`** (están en `202-01-PLAN.md`, conviene pasarlos al archivo de reglas):
   migraciones 0298/0299 (no 0290-0292) y niveles visibles Legionario/Centurión/Espartano (códigos internos sin cambio).
4. `node_modules` en api/app/admin del worktree (están). Sin instalar nada nuevo.
5. Ejecutar 202-01..15 **de a uno** con `gsd-executor` en `model: sonnet` (método de la 173/201, ver `CLAUDE.md`):
   después de cada plan, worktree limpio + `tsc` + lint + `lint:tenant` y encadenar. Tests solo en CI.

## Lo que tiene que hacer Franco en Cloudflare / GitHub (staging y prod)

- Bucket R2 **privado** (sin dominio público), el token del API con acceso a él.
- CORS del bucket privado: PUT/GET/HEAD desde la app y el admin + `capacitor://localhost`, `http://localhost`,
  `https://localhost`. **Probar primero en staging** si R2 acepta el origen `capacitor://` (si no, cambia DA-51).
- Regla de vencimiento de 60 días sobre el prefijo **`private/conquer-corrections/`** (con la barra final: sin ella
  borraría también las fotos del control físico, que van en `private/conquer/`).
- CORS del bucket **público** que permita PUT desde el admin de staging (hoy los videos de Ejercicios solo se suben en prod).
- Secrets: `STAGING_R2_PRIVATE_BUCKET_NAME` y `R2_PRIVATE_BUCKET_NAME`; `R2_PUBLIC_URL` cargado en staging y prod
  (sin él no aparece "Ver cómo se hace").

## Riesgos y cosas a mirar en la prueba

- **Build nativo de iOS:** 202-14 agrega `NSMicrophoneUsageDescription` (grabar video graba audio). Android no cambia.
- Un `.mov` HEVC de iPhone puede no reproducirse en el admin con Chrome en Windows (el del alumno no se transcodifica,
  DA-52). Si pasa, va a hallazgos: la salida sería transcodificar en el servidor.
- La subida desde la app va con `window.CapacitorWebFetch` (DA-51), no con CapacitorHttp, para no pasar 100 MB en base64
  por el puente nativo.
- Tope de tamaño: 100 MB correcciones, 200 MB tutoriales. R2 no permite fijar el tamaño en la URL firmada: el servidor
  revisa con HEAD al confirmar y borra lo que se pase (DA-39).

## Planes

202-01 tablas (0298/0299) + tenancy · 202-02 reglas de video y storage privado para video · 202-03/04 API alumno ·
202-05/06 API coach · 202-07 API tutoriales · 202-08 admin tutoriales · 202-09/10 admin bandeja y respuesta ·
202-11 app datos/store · 202-12 app "Ver cómo se hace" · 202-13 app pantalla de correcciones · 202-14 app mandar video +
permiso iOS · 202-15 barrido final y UAT.
