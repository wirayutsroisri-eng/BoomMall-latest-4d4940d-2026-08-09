CREATE TABLE `listing_fee_slips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`sellerId` int NOT NULL,
	`slipUrl` text NOT NULL,
	`slipKey` text NOT NULL,
	`feeAmount` decimal(12,2) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_fee_slips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `status` enum('draft','pending_fee','pending_approval','active','sold','hidden','deleted','rejected','expired') NOT NULL DEFAULT 'pending_fee';--> statement-breakpoint
ALTER TABLE `users` ADD `lineId` varchar(64);