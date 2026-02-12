-- Saved blocks for coach reuse
-- Phase 16: Coaches can save block configurations for later use

CREATE TABLE saved_blocks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_by INT NOT NULL,
  source_block_id INT DEFAULT NULL,
  block_role VARCHAR(20) NOT NULL,
  block_route VARCHAR(20) NOT NULL,
  format_name VARCHAR(50) NOT NULL,
  block_data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX saved_blocks_created_by_idx (created_by)
);
