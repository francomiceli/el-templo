-- Rol 'inversor': inversor activo de UNA sucursal que hace gestion
-- administrativa y financiera SOLO de las sedes que tiene asignadas en
-- `user_branches` (caso real: Alberti, branch_id 16).
-- Hereda los permisos de 'gestion' (caja, cobros, alumnos, sesiones de prueba,
-- leads) pero su alcance NO es el pais: es la lista de sedes, igual que
-- coach/recepcion (canAccessBranch Regla 4). Ademas, a diferencia de
-- coach/recepcion, los listados y agregados le FUERZAN el filtro por sede
-- server-side -- ver `enforcedBranchIds` en modules/shared/branch-access.ts.
-- Esta migracion NO crea ninguna cuenta: el alta se hace desde Usuarios.

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv','inversor') NOT NULL;
