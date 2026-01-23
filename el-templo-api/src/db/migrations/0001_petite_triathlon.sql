CREATE TABLE `contraction_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intensity` int NOT NULL,
	`total_exercises` int NOT NULL,
	`concentrico` int NOT NULL,
	`excentrico` int NOT NULL,
	`isometrico` int NOT NULL,
	CONSTRAINT `contraction_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `contraction_rules_intensity_total_idx` UNIQUE(`intensity`,`total_exercises`)
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pattern` varchar(100) NOT NULL,
	`category` varchar(100) NOT NULL,
	`category_secondary` varchar(100),
	`exercise` varchar(150) NOT NULL,
	`exercise_2` varchar(150),
	`position` varchar(100),
	`effort` varchar(10) NOT NULL,
	`exercise_level` enum('alfa','delta','sigma','omega','spartan'),
	`code_number` int,
	`difficulty` int NOT NULL DEFAULT 1,
	`route` varchar(20) NOT NULL,
	`mobility_related` varchar(100),
	CONSTRAINT `exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `format_compatibility` (
	`id` int AUTO_INCREMENT NOT NULL,
	`format_id` int NOT NULL,
	`block` enum('nucleus','deuteros','plethora') NOT NULL,
	`compat_level` enum('alfa','delta','sigma','omega') NOT NULL,
	`intensity` int NOT NULL,
	`compatibility` int NOT NULL,
	CONSTRAINT `format_compatibility_id` PRIMARY KEY(`id`),
	CONSTRAINT `format_compat_lookup_idx` UNIQUE(`format_id`,`block`,`compat_level`,`intensity`)
);
--> statement-breakpoint
CREATE TABLE `formats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` varchar(50),
	CONSTRAINT `formats_id` PRIMARY KEY(`id`),
	CONSTRAINT `formats_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`display_name` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `routes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `spom_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`week` int NOT NULL,
	`route_id` int NOT NULL,
	`intensity` int NOT NULL,
	`wave` varchar(50) NOT NULL,
	`pattern` varchar(150) NOT NULL,
	`pattern_2` varchar(100),
	`category` varchar(100) NOT NULL,
	CONSTRAINT `spom_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `spom_rules_week_route_idx` UNIQUE(`week`,`route_id`)
);
--> statement-breakpoint
CREATE TABLE `intensity_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intensity` int NOT NULL,
	`reps_budget` int NOT NULL,
	`difficulty` varchar(20) NOT NULL,
	`exercise_count_min` int NOT NULL,
	`exercise_count_max` int NOT NULL,
	CONSTRAINT `intensity_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `intensity_rules_intensity_unique` UNIQUE(`intensity`)
);
--> statement-breakpoint
CREATE TABLE `weekly_rotator` (
	`id` int AUTO_INCREMENT NOT NULL,
	`week` int NOT NULL,
	`day` enum('lunes','martes','miercoles','jueves','viernes','sabado') NOT NULL,
	`level_group` enum('alfa_delta','sigma','omega') NOT NULL,
	`nucleus_route_id` int NOT NULL,
	`deuteros1_route_id` int NOT NULL,
	`deuteros2_route_id` int,
	`athlos_route_id` int NOT NULL,
	CONSTRAINT `weekly_rotator_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_rotator_week_day_level_idx` UNIQUE(`week`,`day`,`level_group`)
);
--> statement-breakpoint
CREATE TABLE `spom_config` (
	`id` int NOT NULL DEFAULT 1,
	`current_week` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spom_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `spom_config_single_row` CHECK(`spom_config`.`id` = 1)
);
--> statement-breakpoint
ALTER TABLE `format_compatibility` ADD CONSTRAINT `format_compatibility_format_id_formats_id_fk` FOREIGN KEY (`format_id`) REFERENCES `formats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spom_rules` ADD CONSTRAINT `spom_rules_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_rotator` ADD CONSTRAINT `weekly_rotator_nucleus_route_id_routes_id_fk` FOREIGN KEY (`nucleus_route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_rotator` ADD CONSTRAINT `weekly_rotator_deuteros1_route_id_routes_id_fk` FOREIGN KEY (`deuteros1_route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_rotator` ADD CONSTRAINT `weekly_rotator_deuteros2_route_id_routes_id_fk` FOREIGN KEY (`deuteros2_route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_rotator` ADD CONSTRAINT `weekly_rotator_athlos_route_id_routes_id_fk` FOREIGN KEY (`athlos_route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exercises_route_effort_level_diff_idx` ON `exercises` (`route`,`effort`,`exercise_level`,`difficulty`);--> statement-breakpoint
CREATE INDEX `exercises_level_idx` ON `exercises` (`exercise_level`);--> statement-breakpoint
CREATE INDEX `formats_name_idx` ON `formats` (`name`);--> statement-breakpoint
CREATE INDEX `spom_rules_route_idx` ON `spom_rules` (`route_id`);--> statement-breakpoint
CREATE INDEX `weekly_rotator_nucleus_idx` ON `weekly_rotator` (`nucleus_route_id`);--> statement-breakpoint
CREATE INDEX `weekly_rotator_deuteros1_idx` ON `weekly_rotator` (`deuteros1_route_id`);--> statement-breakpoint
CREATE INDEX `weekly_rotator_deuteros2_idx` ON `weekly_rotator` (`deuteros2_route_id`);--> statement-breakpoint
CREATE INDEX `weekly_rotator_athlos_idx` ON `weekly_rotator` (`athlos_route_id`);