-- Phase 105: Finance model replace payments and debts with transactional 3-table model
-- Created 2026-04-28
-- CREATE order financial_transactions then transaction_links then balances then DROP payments then DROP debts
-- No backfill per SPEC payments and debts are dropped without data migration
-- Manual not drizzle-kit generate per CLAUDE.md and CONTEXT D-Migration Constraints
--
-- MySQL DDL is not transactional for CREATE or DROP TABLE so order is the only
-- protection if the migration fails midway. CREATE-before-DROP guarantees that
-- a partial failure leaves payments and debts intact.
--
-- Idempotency the _migrations tracker prevents a successful file from running
-- twice. CREATE TABLE without IF NOT EXISTS is intentional surfaces a clear
-- already exists error if someone applied SQL outside the tracker.
--
-- Note SQL line comments must NOT contain inline statement-terminator chars
-- because run-migrations.ts splits on the semicolon BEFORE stripping comments
-- per Phase 103-01 precedent.

CREATE TABLE financial_transactions (
  id INT NOT NULL AUTO_INCREMENT,
  member_id INT NOT NULL,
  kind ENUM('plan_charge','debt_settlement','refund','adjustment','advance_payment') NOT NULL,
  direction ENUM('inflow','outflow') NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  payment_method ENUM('cash','transfer','card','aura_credit','internal') NOT NULL,
  transaction_date DATE NOT NULL,
  effective_date DATE NOT NULL,
  branch_id INT NOT NULL,
  recorded_by INT NOT NULL,
  voided_at TIMESTAMP NULL,
  voided_by INT NULL,
  void_reason TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_financial_tx_member FOREIGN KEY (member_id) REFERENCES users(id),
  CONSTRAINT fk_financial_tx_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_financial_tx_recorder FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT fk_financial_tx_voider FOREIGN KEY (voided_by) REFERENCES users(id),
  INDEX idx_financial_tx_member_id (member_id),
  INDEX idx_financial_tx_transaction_date (transaction_date),
  INDEX idx_financial_tx_branch_date (branch_id, transaction_date),
  INDEX idx_financial_tx_kind_voided (kind, voided_at)
);

CREATE TABLE transaction_links (
  id INT NOT NULL AUTO_INCREMENT,
  transaction_id INT NOT NULL,
  target_kind ENUM('subscription','debt_balance','transaction') NOT NULL,
  target_id INT NOT NULL,
  allocated_amount INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_tx_links_transaction FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id),
  UNIQUE KEY uniq_tx_target (transaction_id, target_kind, target_id),
  INDEX idx_tx_links_target (target_kind, target_id)
);

CREATE TABLE balances (
  id INT NOT NULL AUTO_INCREMENT,
  member_id INT NOT NULL,
  target_kind ENUM('subscription','debt_balance') NOT NULL,
  target_id INT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  amount INT NOT NULL,
  last_recomputed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_balances_member FOREIGN KEY (member_id) REFERENCES users(id),
  UNIQUE KEY uniq_balance_target (member_id, target_kind, target_id, currency),
  INDEX idx_balances_member (member_id),
  INDEX idx_balances_amount_member (amount, member_id)
);

DROP TABLE `payments`;
DROP TABLE `debts`;
