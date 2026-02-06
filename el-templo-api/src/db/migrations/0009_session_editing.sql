-- Session editing schema additions
-- Phase 15: Edit logs, algorithm snapshot, format params

CREATE TABLE session_edit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX session_edit_logs_session_idx (session_id)
);

ALTER TABLE sessions ADD COLUMN algorithm_snapshot JSON DEFAULT NULL;
ALTER TABLE session_blocks ADD COLUMN format_params JSON DEFAULT NULL;
