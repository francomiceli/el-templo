-- Add address, phone, and google_maps_url columns to branches table
ALTER TABLE `branches` ADD `address` varchar(255);--> statement-breakpoint
ALTER TABLE `branches` ADD `phone` varchar(50);--> statement-breakpoint
ALTER TABLE `branches` ADD `google_maps_url` varchar(500);
