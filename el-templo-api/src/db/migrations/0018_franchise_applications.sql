CREATE TABLE `franchise_applications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `telefono` varchar(50) NOT NULL,
  `ciudad_pais` varchar(255) NOT NULL,
  `modelo` varchar(50) NOT NULL,
  `experiencia` varchar(100) NOT NULL,
  `capital` varchar(100) NOT NULL,
  `origen` varchar(100) NOT NULL,
  `mensaje` text NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `status` varchar(50) NOT NULL DEFAULT 'new',
  PRIMARY KEY (`id`)
);
