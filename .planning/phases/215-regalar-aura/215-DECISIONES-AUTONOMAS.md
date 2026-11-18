# Fase 215 — Decisiones tomadas sin consultar a Franco

Franco pidió el 2026-11-17 que la 215 se planifique y ejecute "todo autónomamente, sin mi supervisión".
Acá queda cada decisión que le tocaba a él y se tomó con la opción recomendada. Todas se pueden cambiar.

No se hizo por no tener su OK: push, SSH o consultas a producción, instalar dependencias y bump de versión.

## Decisiones

| Fecha      | Plan       | Tema                                   | Lo que se tomó                                                                                                                                                                       |
| ---------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-18 | sketch 034 | Cómo da Aura el alumno desde Mi Templo | Variante A: una sola hoja con las caras arriba y los motivos abajo. Franco vio el sketch y no eligió                                                                                 |
| 2026-11-18 | sketch 035 | Bandeja de notificaciones              | Variante B: pantalla propia "Notificaciones", agrupada por día. Franco vio el sketch y no eligió                                                                                     |
| 2026-11-18 | rama       | Dónde vive la 215                      | Rama `feat/regalar-aura`, que sale de la punta de la 214 (`fase-214-ejecutada`), en el mismo worktree. Así la 214 se puede subir a staging por separado                              |
| 2026-11-18 | research   | Quién cuenta como profe                | Cualquier profe con la sede asignada puede regalar a quien asistió ese día en esa sede (cubre suplencias). Los administradores no regalan como profe                                 |
| 2026-11-18 | research   | Si se anula una asistencia             | Se anulan los regalos que dio y recibió esa persona en esa clase, sin aviso                                                                                                          |
| 2026-11-18 | research   | Regalo anulado                         | No devuelve la posibilidad de regalar de esa clase                                                                                                                                   |
| 2026-11-18 | research   | Tope de 2 por semana                   | Semana de lunes a domingo según la fecha de la clase; cuentan los regalos no anulados                                                                                                |
| 2026-11-18 | research   | Bandeja                                | Guarda 90 días; un aviso se marca leído al tocarlo (y hay "Marcar todo como leído"); tocarlo lleva a la pantalla del aviso. Guarda también avisos de quien no tiene la push activada |
| 2026-11-18 | research   | Silenciar regalos                      | La push de regalos va en la categoría "Motivación" existente; no se crea una categoría nueva                                                                                         |
| 2026-11-18 | research   | Barra de arriba                        | La campana va entre perfil y salir; en Entrenar a 360 px los botones se achican un poco. En escritorio, pestaña "Avisos" en el riel                                                  |
| 2026-11-18 | research   | Valor del regalo del profe             | Se edita en Ajustes del admin, solo dueño y administradores, entre 1 y 10                                                                                                            |
| 2026-11-18 | research   | Quién anula                            | Dueño, administradores y administradores de sede (solo sus sedes). Los profes no anulan                                                                                              |
