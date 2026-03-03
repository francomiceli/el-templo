CREATE TABLE `app_waitlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `modulo_interes` varchar(255) NOT NULL,
  `ciudad_pais` varchar(255),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `status` varchar(50) NOT NULL DEFAULT 'new',
  PRIMARY KEY (`id`)
);

CREATE TABLE `labs_inquiries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `telefono` varchar(100) NOT NULL,
  `nombre_gimnasio` varchar(255) NOT NULL,
  `ciudad_pais` varchar(255) NOT NULL,
  `cantidad_socios` varchar(50) NOT NULL,
  `sistema_actual` varchar(100) NOT NULL,
  `mensaje` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `status` varchar(50) NOT NULL DEFAULT 'new',
  PRIMARY KEY (`id`)
);
