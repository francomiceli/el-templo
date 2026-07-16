-- Gestión de deudas (brief-fran-reporte-deudas) -- capa de gestión sobre el
-- reporte "Por deuda": promesa de pago, observaciones y estado operativo
-- (activa / cobrada / incobrable). Hand-written (db:generate roto por drift de
-- goal_plan_type -- ver skill el-templo-db-migrations).
-- 1:1 con balances vía balance_id UNIQUE. La fila se crea recién cuando una
-- administrativa gestiona la deuda -- una deuda sin gestión no tiene fila.
-- 'cobrada' se auto-setea cuando el balance llega a <= 0 (BalanceService).

CREATE TABLE IF NOT EXISTS debt_management (
  id INT AUTO_INCREMENT PRIMARY KEY,
  balance_id INT NOT NULL,
  status ENUM('activa', 'cobrada', 'incobrable') NOT NULL DEFAULT 'activa',
  promised_payment_date DATE NULL,
  notes TEXT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_debt_management_balance (balance_id),
  CONSTRAINT fk_debt_management_balance FOREIGN KEY (balance_id) REFERENCES balances(id),
  CONSTRAINT fk_debt_management_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);
