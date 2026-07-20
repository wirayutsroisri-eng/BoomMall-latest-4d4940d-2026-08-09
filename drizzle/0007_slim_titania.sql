ALTER TABLE `products` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `renewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `renewCount` int DEFAULT 0 NOT NULL;