CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`icon` varchar(50),
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buyerId` int NOT NULL,
	`sellerId` int NOT NULL,
	`productId` int NOT NULL,
	`productTitle` varchar(255) NOT NULL,
	`productImage` text,
	`amount` decimal(12,2) NOT NULL,
	`feeRate` decimal(5,2) NOT NULL,
	`feeAmount` decimal(12,2) NOT NULL,
	`sellerReceives` decimal(12,2) NOT NULL,
	`status` enum('pending_payment','payment_submitted','payment_confirmed','shipped','completed','cancelled','refunded') NOT NULL DEFAULT 'pending_payment',
	`paymentMethod` enum('wallet','promptpay') DEFAULT 'promptpay',
	`shippingAddress` text,
	`trackingNumber` varchar(100),
	`note` text,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_slips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`slipUrl` text NOT NULL,
	`slipKey` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_slips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payout_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`orderId` int,
	`amount` decimal(12,2) NOT NULL,
	`bankAccountName` text,
	`bankAccountNumber` varchar(20),
	`bankName` varchar(64),
	`promptpayNumber` varchar(20),
	`status` enum('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending',
	`adminNote` text,
	`transferSlipUrl` text,
	`processedBy` int,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payout_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`categoryId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`price` decimal(12,2) NOT NULL,
	`condition` enum('new','like_new','good','fair','poor') NOT NULL DEFAULT 'good',
	`status` enum('draft','active','sold','hidden','deleted') NOT NULL DEFAULT 'active',
	`images` json DEFAULT ('[]'),
	`location` varchar(100),
	`viewCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`sellerId` int NOT NULL,
	`productId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviews_orderId_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('topup','purchase','refund','payout','fee','escrow_hold','escrow_release') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`balanceBefore` decimal(14,2) NOT NULL,
	`balanceAfter` decimal(14,2) NOT NULL,
	`referenceId` int,
	`referenceType` varchar(50),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` decimal(14,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `kycStatus` enum('none','pending','approved','rejected') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `kycProvider` enum('facebook','google');--> statement-breakpoint
ALTER TABLE `users` ADD `kycSocialId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `kycSocialName` text;--> statement-breakpoint
ALTER TABLE `users` ADD `kycSocialEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `kycSubmittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `kycReviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `kycReviewNote` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isSeller` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `sellerFeeRate` decimal(5,2) DEFAULT '7.00';--> statement-breakpoint
ALTER TABLE `users` ADD `bankAccountName` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bankAccountNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `bankName` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `promptpayNumber` varchar(20);