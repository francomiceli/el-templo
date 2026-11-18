# Fase 214 — Decisiones tomadas sin consultar a Franco

Franco pidió el 2026-11-17 que la 214 se planifique y ejecute "todo autónomamente, sin mi supervisión".
Este archivo junta cada decisión que le tocaba a él y que se tomó con la opción recomendada para no
frenar la cadena. **Todas se pueden cambiar**: dice dónde está implementada cada una.

Lo que NO se hizo por no tener su OK: push, SSH o consultas a producción, instalar dependencias y bump de
versión.

## 1. Decisiones abiertas del UI-SPEC (`214-UI-SPEC.md`, sección "Decisiones abiertas para Franco")

| # | Tema | Lo que se tomó | Alternativa descartada |
|---|---|---|---|
| 1 | Selector de nivel en la computadora | Pastilla clara arriba de las pestañas de Entrenar, a la derecha | — (en escritorio no hay barra de arriba) |
| 2 | Dónde revisa el staff las fotos | Ítem nuevo "Fotos" en Gestión del admin, con la pelotita de pendientes | Dentro de Feedback (solo lo ven los dueños) |
| 3 | Motivo del rechazo de una foto | El staff elige un motivo de una lista y va en el aviso al alumno | Aviso genérico sin motivo |
| 4 | Sello de antigüedad | Solo el de 1 año o más pasa a crema con logo terracota. Bronce y plata no cambian | Rehacer los tres sellos |
| 5 | Línea bajo el nombre cuando no hay foto | Siempre la antigüedad | "Subí tu foto y sumá 5 de Aura", como en el sketch |
| 6 | Recorte de la foto | Automático al centro, con vista previa antes de subir | Recorte manual |
| 7 | Movimientos de Aura | Sin íconos, solo texto y monto | Con ícono por tipo |
| 8 | "Reservar" desde la hoja "Quiénes van" | Pasa por la ventana de confirmación de siempre | Reservar en el acto |
| 9 | Aura en 0 en el encabezado | La ficha muestra "0" | Ocultar la ficha |
| 10 | Textos borrador | Se usan tal como están en "Borradores para aprobar" del UI-SPEC | — |
| 11 | Aro dorado de la foto | Dorado siempre que se vea la ficha de Aura, aunque tenga 0 | Aro de otro tono sin Aura |

**Textos para revisar** (todos en `214-UI-SPEC.md`, sección "Borradores para aprobar"): normas para subir
la foto, aviso de primera vez de la lista, interruptor de visibilidad, permiso de cámara de iOS, motivos
de rechazo, textos de cada movimiento de Aura y anuncio previo. Las normas son las que más importan:
Google Play exige que el alumno las acepte antes de subir la foto.

## 2. Preguntas que dejó el planificador de servidor

| Tema | Lo que se tomó | Dónde |
|---|---|---|
| Quien viene por Wellhub | Aparece en la lista, pero como no tiene plan vigente ve solo el número | Plan 16 |
| Alcance de quien aprueba fotos | Igual que hoy al cargar la foto de ficha: profes, recepción y gestión en todo el país; el admin de sede, solo en su sede | Plan 15 |
| Aviso de foto rechazada | Push por la categoría de anuncios, más el estado visible en Perfil para quien tenga los anuncios apagados | Planes 15 y pantallas |
| Programas con premio de Aura | 15 pasa a 8 y 100 pasa a 50 donde el valor es el de fábrica. La consulta 05 lista los programas afectados antes del merge | Plan 04 |
| Foto reportada | Sigue visible hasta que el staff decide. Un reporte por persona y foto | Plan 14 |
| Lista de anotados | Solo para los horarios que el alumno ve en su grilla | Plan 17 |
| Visita por Wellhub y tope del día | No bloquea el Aura de la app de ese día | Planes 08 y 10 |

## 3. Supuestos técnicos que hay que confirmar en staging

- **Copia de la foto de ficha al almacenamiento privado.** Se asume que el almacenamiento permite copiar
  del lugar público al privado. Si no, las fotos de ficha salen sin imagen en la lista.
- **Check-in forzado de noche.** Guarda la fecha en UTC, así que puede no cruzarse con el día de la app
  para el tope de 5. Deuda conocida, sin arreglar.
- **Tests de integración.** Corren en CI. Hasta que haya un push a staging, lo ejecutado está verificado
  solo con typecheck, lint y tests unitarios o angostos.

## 4. Pendientes que solo puede resolver Franco

- Correr (o autorizar) las consultas de solo lectura de `consultas/`: 04 (fecha real de los 367
  importados), 05 (conciliación y programas afectados), 07 (línea de base) y 08 (calibración de la regla
  del 80 % con sesiones reales).
- Si tiene el archivo "Socios según fecha de ingreso" del sistema anterior.
- Revisar en App Store Connect y Play Console que "Fotos" figure como dato recopilado.
- Decidir si en la 1.9.6 se saca el número de los textos "+5 AURA" antes de generar los builds.
- Push a staging de la rama `feat/comunidad-anotados-aura` cuando la quiera probar.

## 5. Registro de lo que se vaya sumando durante la ejecución

Cada vez que un ejecutor se encuentre con una decisión de producto, se anota acá con la opción tomada.

| Fecha | Plan | Tema | Lo que se tomó |
|---|---|---|---|
| 2026-11-17 | 214-21, 214-27 | Motivo del rechazo visible en Perfil (el UI-SPEC no trae el texto) | Segundo renglón "Motivo: {etiqueta}." en la hoja de foto y caption "Motivo: {etiqueta}. Podés subir otra." en Perfil, con las etiquetas que ve el staff; sin renglón para "Otro motivo" |
| 2026-11-17 | 214-13 | Copia de la foto de ficha al almacenamiento privado | Job cada 15 minutos, una sola vez por foto; si falla queda marcada y no se reintenta. Una foto de ficha nueva aparece en la lista hasta 15 minutos después |
| 2026-11-17 | 214-17 | Cuentas borradas en la card del horario | Tampoco cuentan en el número de la card (misma cuenta que la hoja) |
| 2026-11-17 | 214-31 | Migración de repaso de D-49 | Queda preparada en `deploy-2/` y se mueve a migraciones recién para el deploy siguiente al de la 0344 |
| 2026-11-17 | 214-08 | Regla del 80 % sin calibrar | La consulta 08 (cuántas sesiones reales pasarían la regla) no se corrió porque pide acceso a producción. La regla sale con la fórmula del plan. Conviene correr la 08 antes de mergear a master |
| 2026-11-17 | 214-01 | Consulta 08 | El ejecutor la escribió tratando la duración en minutos. Corregida a segundos por el orquestador (`215686b9e`) |
| 2026-11-17 | 214-32 | Lista de cambios para Apple y Google (D-67) | No la escribe un ejecutor: la escribe el orquestador al cierre, en `.docs/` del checkout principal |
| 2026-11-17 | 214-04 | Historial: dos sesiones de app el mismo día (anteriores al tope diario del 9 de noviembre) | No se colapsan: cada una queda en 3. Son pocas filas (252 sesiones de app en total) y la consulta 05 las mide. Hacia adelante el día paga una sola |
| 2026-11-17 | 214-04 | Historial: asistencia que después fue anulada | Cuenta igual para el tope del día, porque la anulación no guarda a qué asistencia corresponde. Caso marginal |

