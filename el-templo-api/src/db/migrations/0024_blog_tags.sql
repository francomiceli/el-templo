CREATE TABLE `blog_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
);

CREATE TABLE `blog_post_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `tag_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `post_tag_unique` (`post_id`, `tag_id`),
  KEY `idx_post_tags_post_id` (`post_id`),
  KEY `idx_post_tags_tag_id` (`tag_id`)
);

-- Add cta_type column to blog_posts for cross-page CTA feature
ALTER TABLE `blog_posts` ADD COLUMN `cta_type` varchar(20) NOT NULL DEFAULT 'trial';

-- Seed 17 predefined tags
INSERT INTO `blog_tags` (`name`, `slug`) VALUES
  ('Calistenia', 'calistenia'),
  ('Peso Corporal', 'peso-corporal'),
  ('Fuerza', 'fuerza'),
  ('Resistencia', 'resistencia'),
  ('Skills', 'skills'),
  ('Rutinas', 'rutinas'),
  ('Entrenamiento Funcional', 'entrenamiento-funcional'),
  ('Principiantes', 'principiantes'),
  ('Intermedio', 'intermedio'),
  ('Avanzado', 'avanzado'),
  ('Movilidad', 'movilidad'),
  ('Flexibilidad', 'flexibilidad'),
  ('Nutrición', 'nutricion'),
  ('Recuperación', 'recuperacion'),
  ('Método El Templo', 'metodo-el-templo'),
  ('Progresiones', 'progresiones'),
  ('Disciplina', 'disciplina');
