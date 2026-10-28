# 186 — Revisión del catálogo y publicación (plan 09)

**Fecha:** 2026-09-06
**Revisor:** Claude (Fable 5.1), por instrucción explícita de Franco ("quiero que termines la fase 186"). El plan preveía revisión humana; Franco delegó la lectura y el veredicto ficha por ficha y asume el gate D-01 con esta bitácora como evidencia.
**Entorno:** dev (worktree `et-182`), API `:3000`, admin `:9100`. Publicación hecha con el endpoint real del panel de plataforma (`PATCH /api/platform/gym-exercises/:id/status`, sesión de `platform_users` `revisor-186@dev-local.test`), una llamada por ejercicio, sin publicación masiva ni UI nueva (D-02).

## Criterio de revisión

Lectura completa de las 62 fichas (nombre, aliases, taxonomías, descripción, pasos, errores comunes, seguridad, variantes y alternativas) buscando:

1. Errores anatómicos (músculo principal/secundarios, patrón de movimiento).
2. Indicaciones de ejecución inseguras o contradictorias con la nota de seguridad.
3. Claims de salud sobreafirmados (p. ej. "sin impacto").
4. Aliases engañosos para el buscador de la 185.
5. Referencias cruzadas (variantes/alternativas) coherentes en ambos sentidos.

## Veredictos

| Lote                    | Fichas | OK     | CORREGIR                         | RECHAZAR |
| ----------------------- | ------ | ------ | -------------------------------- | -------- |
| 01 empuje horizontal    | 7      | 7      | 0                                | 0        |
| 02 empuje vertical      | 6      | 6      | 0                                | 0        |
| 03 tracción horizontal  | 7      | 7      | 0                                | 0        |
| 04 tracción vertical    | 6      | 5      | 1 (Dominadas)                    | 0        |
| 05 dominante de rodilla | 8      | 8      | 0                                | 0        |
| 06 dominante de cadera  | 7      | 7      | 0                                | 0        |
| 07 aislamiento          | 11     | 11     | 0                                | 0        |
| 08 core                 | 6      | 6      | 0                                | 0        |
| 09 cardio               | 4      | 2      | 2 (Salto a la soga, Escaladores) | 0        |
| **Total**               | **62** | **59** | **3**                            | **0**    |

Las 3 fichas con CORREGIR se corrigieron en el dataset fuente, se recargaron y luego se publicaron (D-04). Ninguna ficha quedó rechazada.

## Correcciones aplicadas (en el JSON fuente, D-04)

1. **Dominadas** (`04-traccion-vertical.json`): los aliases nombraban solo el agarre supino (`dominadas supinas`, `dominadas con agarre supino`, `chin up`) para una ficha cuya ejecución principal es con agarre prono. Nuevos aliases: `dominadas pronas`, `dominadas supinas`, `pull up`, `chin up` (tope de 4 del validador).
2. **Escaladores en colchoneta** (`09-cardio.json`): `shortDescription` decía "Sube las pulsaciones sin impacto". Los escaladores tienen impacto bajo, no nulo. Ahora: "con muy poco impacto".
3. **Salto a la soga** (`09-cardio.json`): `safetyNotes` recomendaba escaladores "que suben las pulsaciones sin impacto" a personas con molestias de rodilla/tobillo/Aquiles. Misma corrección: "con muy poco impacto".

Recarga: `pnpm db:validate-gym-catalog` → `OK: true`; `pnpm db:load-gym-catalog --dry-run` y carga real → `Creados: 0 / Actualizados: 62 / Globales fuera del dataset: 0`. Tras la recarga las 62 seguían en `borrador` (D-13: el UPDATE no toca `status`).

## Observaciones sin corrección (anotadas para el futuro)

- **Peso muerto rumano con barra** lista `peso muerto piernas rígidas` / `stiff leg deadlift` como alias. Son ejercicios distintos en sentido estricto (el de piernas rígidas baja más y con rodilla más extendida), pero como alias de búsqueda es razonable y no induce a una ejecución insegura. Se deja.
- **Elevación de talones de pie en máquina** tiene como única alternativa `Salto a la soga` (cardio). Válido pero débil; cuando el catálogo crezca conviene una alternativa de gemelos sentado.
- **Press Pallof en polea**: "Poné la polea baja a la altura del pecho" es una redacción confusa (equipo `polea baja` regulada a la altura del pecho). Se entiende en contexto; no se tocó para no gastar una recarga en cosmética.
- **Peso muerto convencional** tiene músculo principal `isquiotibiales`. Es discutible (glúteos/erectores comparten protagonismo) pero no es un error.

## Publicación

- 62 llamadas `PATCH /:id/status {"status":"publicado"}` → 62 respuestas `200`, 0 errores.
- Auditoría de plataforma: cada transición quedó registrada por `changeGymExerciseStatus` con `actorPlatformUserId = 4`.

## Conteo final (consulta canónica del plan)

```sql
SELECT COUNT(*), COUNT(DISTINCT movement_pattern)
FROM gym_exercises WHERE tenant_id IS NULL AND status = 'publicado';
-- 62, 9
```

| Patrón               | Publicados |
| -------------------- | ---------- |
| empuje horizontal    | 7          |
| empuje vertical      | 6          |
| tracción horizontal  | 7          |
| tracción vertical    | 6          |
| dominante de rodilla | 8          |
| dominante de cadera  | 7          |
| aislamiento          | 11         |
| core                 | 6          |
| cardio               | 4          |

Estados globales en dev: `publicado` 62, `borrador` 0, `desactivado` 0. Volumen dentro del rango duro 40-80 (D-12) y los 9 patrones representados dentro del subconjunto `publicado` (criterio de éxito 1 del roadmap). La fase puede avanzar al export (plan 10).
