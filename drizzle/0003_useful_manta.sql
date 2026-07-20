CREATE TABLE `listing_fee_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`sellerId` int NOT NULL,
	`feeRate` decimal(5,2) NOT NULL,
	`feeAmount` decimal(12,2) NOT NULL,
	`productPrice` decimal(12,2) NOT NULL,
	`walletId` int,
	`balanceBefore` decimal(14,2),
	`balanceAfter` decimal(14,2),
	`approvedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_fee_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `paymentMethod` enum('promptpay','bank_transfer') DEFAULT 'promptpay';--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `status` enum('draft','pending_approval','active','sold','hidden','deleted','rejected') NOT NULL DEFAULT 'pending_approval';--> statement-breakpoint
ALTER TABLE `orders` ADD `sellerPromptpay` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `sellerBankName` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `sellerBankAccountName` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `sellerBankAccountNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `products` ADD `videoUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `videoKey` text;--> statement-breakpoint
ALTER TABLE `products` ADD `listingFeeRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `products` ADD `listingFeeAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `products` ADD `listingFeePaid` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `products` ADD `rejectedNote` text;