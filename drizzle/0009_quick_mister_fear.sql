ALTER TABLE `orders` MODIFY COLUMN `paymentMethod` enum('promptpay','bank_transfer','wallet','cod') DEFAULT 'promptpay';--> statement-breakpoint
ALTER TABLE `orders` ADD `shippingFee` decimal(10,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `totalAmount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `shippingFee` decimal(10,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `allowCod` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `allowWallet` boolean DEFAULT false NOT NULL;