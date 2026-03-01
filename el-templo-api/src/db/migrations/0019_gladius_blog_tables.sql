CREATE TABLE `gladius_products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `photo` varchar(500) NULL,
  `status` varchar(20) NOT NULL DEFAULT 'published',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
);

CREATE TABLE `gladius_inquiries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `producto_interes` varchar(255) NOT NULL,
  `mensaje` text NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `status` varchar(50) NOT NULL DEFAULT 'new',
  PRIMARY KEY (`id`)
);

CREATE TABLE `blog_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `excerpt` text NOT NULL,
  `cover_image` varchar(500) NULL,
  `body` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `published_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
);
