-- Cancelacion de clases por fecha (schedule_exceptions)
--
-- Los horarios (schedules) son plantillas semanales recurrentes sin dimension
-- de fecha. Hasta ahora la unica cancelacion posible era desactivar la
-- plantilla entera (todas las semanas) via schedules.is_active, que es el
-- origen del feedback "cancelo la semana que viene y se cancela en todas".
-- Una fila aca = "este horario NO corre en esta fecha puntual".
--
-- created_at es ademas el cutoff de restauracion -- las reservas canceladas
-- automaticamente por la excepcion tienen cancelled_at >= created_at, asi
-- deshacer la excepcion restaura exactamente esas reservas.
--
-- DDL puramente aditiva, sin datos. Los nombres snake_case DEBEN coincidir
-- byte a byte con src/db/schema/schedule-exceptions.ts (leccion 125/126/142).
-- Convencion de nombre de FK = la auto-generada por Drizzle.
--
-- Hand-written SQL (el journal de drizzle-kit sigue desincronizado, mismo
-- patron que 0152/0169).

CREATE TABLE schedule_exceptions (
  id INT NOT NULL AUTO_INCREMENT,
  schedule_id INT NOT NULL,
  exception_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT idx_schedule_exceptions_schedule_date
    UNIQUE (schedule_id, exception_date),
  CONSTRAINT schedule_exceptions_schedule_id_schedules_id_fk
    FOREIGN KEY (schedule_id) REFERENCES schedules(id)
);
