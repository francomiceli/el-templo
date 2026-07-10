-- Cupo de El Templo Mogotes 22 -> 16 (pedido operativo 2026-07-10)
--
-- branches.max_capacity es el cupo por defecto de todos los horarios de la
-- sede (las actividades con max_capacity NULL lo heredan -- ver
-- src/modules/scheduling/capacity.ts). Se lee en vivo en cada verificacion,
-- por lo que el cambio aplica de inmediato a todas las clases futuras sin
-- regenerar nada. Las reservas existentes por encima del nuevo cupo no se
-- cancelan -- solo se bloquean reservas nuevas hasta bajar de 16.
--
-- Cambio de dato de prod via migracion, nunca via seed (regla del repo).
-- Idempotente -- re-ejecutar deja el mismo valor.

UPDATE branches SET max_capacity = 16 WHERE code = 'MOGOTES';
