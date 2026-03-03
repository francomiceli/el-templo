CREATE TABLE `academy_inquiries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `telefono` varchar(100) NOT NULL,
  `ciudad_pais` varchar(255) NOT NULL,
  `nivel_interes` varchar(100) NOT NULL,
  `modalidad` varchar(100) NOT NULL,
  `experiencia` varchar(100) NOT NULL,
  `alumno_el_templo` varchar(50) NOT NULL,
  `origen` varchar(100) NOT NULL,
  `mensaje` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `status` varchar(50) NOT NULL DEFAULT 'new',
  PRIMARY KEY (`id`)
);
