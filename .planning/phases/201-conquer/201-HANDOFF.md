# Fase 201 Conquer v2: handoff (2026-10-22)

## Dónde está todo

- Worktree `/home/franco/projects/et-201-conquer`, rama `feat/201-conquer`, sobre `origin/staging` con la 197 y la 200. **No se pusheó nada.**
- Planes 201-01 a 201-24 ejecutados y verificados: 37 rutas, migraciones 0290 a 0292 y oráculo de 14785 casos OK. Cada plan pasó `tsc`, `lint:tenant`, lint y `vue-tsc`. Los tests están escritos pero **no se corrieron**: corren en CI.
- 201-24 quedó en su tarea 3, el checkpoint humano (UAT). La guía es `201-UAT.md`. Los hallazgos van en su §8.
- El UAT local de Franco encontró 3 hallazgos, anotados en `201-UAT.md` §8:
  1. **Guía introductoria:** explicar el método, incluida la molestia. Criterio: después de leerla, el alumno usa Conquer como se espera.
  2. **Estética:** sacar las nubes y lo "dreamy". Va la estética clásica de El Templo, con los colores de Conquer en las terminaciones. Ganó la variante **B · Pórtico nocturno** del sketch 022, **con las fuentes de la app en todo, también en los números**. El sketch está en `/home/franco/projects/el-templo/.planning/sketches/022-conquer-templo-clasico/` (sin commitear, en el checkout principal; el MANIFEST ya marca la B).
  3. **Catálogo:** usar el anexo de Nacho `.docs/conquer-catalogo.md`, que no se había usado. Las diferencias están en `201-CATALOGO-DIFF.md`. Falta `conquer-catalogo.json`, que según el anexo "manda": hay que pedírselo a Nacho.

## Qué falta, en orden

1. **201-25 HECHO** (`8c0804f40`): la 0293 trae el catálogo del anexo, las tablas de arranque por nivel, la escalera de hold y brazos rectos por ejercicio. Verificado (`tsc`, `lint:tenant`, oráculo con ANEXO OK) y **0293 aplicada en la base local**.
2. **Ejecutar 201-26**, con `gsd-executor` en sonnet y el mismo prompt que los anteriores. Cubre modos, tope, recorte, frases de las alertas, textos del app, admin y validaciones de Nacho. **Hasta que se ejecute, CI queda en rojo** por `catalog-admin.test.ts` y la pantalla de Ajustes del admin, que todavía lee `ranges.startOffset*`. Los SUMMARYs de 201-25 y 201-26 tienen las trampas.
3. **Planes de los hallazgos 1 y 2 (201-27 en adelante):** un planner los estaba escribiendo en `/tmp/claude-1000/-home-franco-projects-el-templo/5d3b23a4-76b2-4a15-9505-253a22bfe220/scratchpad/plans/`.
   - Si los archivos existen, revisarlos, copiarlos a esta carpeta, commitearlos y ejecutarlos después de 201-26.
   - Si no existen, relanzar `gsd-planner` con este pedido: variante B del sketch 022 con las fuentes de la app en todo; aplicar a todas las pantallas Conquer del app (reemplazar `CqSky`, nubes y sol); guía de 6 pantallas con los textos del anexo §9, que se muestra una vez después del día 0 y queda en "¿Cómo funciona?" en Inicio; "ya la vio" guardado en el API; migración libre después de la 0293; checkpoint visual final en local.
4. **Verificación del orquestador después de cada plan:** `/tmp/.../scratchpad/verify201.sh front` puede no existir. Si falta, correr a mano: `git status` vacío, `npx tsc --noEmit` y `pnpm lint:tenant` en la API, y `pnpm lint` más `vue-tsc` filtrado (binario en `et-195-seo/el-templo-web`) en app y admin. Sumar las lecciones al final de `201-EXECUTOR-RULES.md`.
5. **UAT local otra vez** con Franco. Paso a paso y con pasos cortos.
6. Con el OK de Franco: push a staging (preguntar antes), CI verde y después el UAT de Nacho.

## Entorno local

- **Base local** `eltemplo` en localhost, migrada hasta la 0293.
  - `admin@eltemplo.com` y `member1@eltemplo.com` tienen la clave local `admin123`.
  - El alumno Toro de prueba es el user 28. Su activación está corrida 28 días hacia atrás y tiene historial de Vertical con E1 en 6, 7 y 8 (para ver Subir). Ya tiene una molestia 4 en Front y un recorte.
- **Para ver las tablas de Novillo y Ternero del anexo** hay que activar un alumno nuevo.
- **Para levantar todo:** API con `cd el-templo-api && pnpm dev` (puerto 3000), app con `cd el-templo-app && pnpm dev` (9000), admin con `cd el-templo-admin && pnpm dev` (9100). El sketch se sirve con `cd /home/franco/projects/el-templo/.planning/sketches && python3 -m http.server 8765`.
- **`node_modules`:** api y raíz son symlinks a `et-199-mi-templo`. App y admin son **copias con hardlinks** (`cp -al`), porque Vite no sirve fuentes desde symlinks fuera de la carpeta. Los `.env` se copiaron del checkout principal y están en `.gitignore`.

## Pendientes fuera del código

- Bucket R2 privado + CORS + secrets `R2_PRIVATE_BUCKET_NAME` y `STAGING_R2_PRIVATE_BUCKET_NAME`. Sin eso, las fotos dan 503.
- Boceto del pop-up de lanzamiento (D-11), ahora sketch 023. El destino `conquer` ya existe.
- Build nativo, porque cambió `NSCameraUsageDescription`.
- Validaciones de Nacho (lista en el UAT §3), más: sábado sin mapa muscular y tope "llega" en vez de "está" (DA-11 de 201-25).
