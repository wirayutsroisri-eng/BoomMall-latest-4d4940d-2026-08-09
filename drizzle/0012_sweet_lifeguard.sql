ALTER TABLE `products` ADD `allowPromptpay` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `bankName` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `bankAccountNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `products` ADD `bankAccountName` text;--> statement-breakpoint
ALTER TABLE `products` ADD `promptpayQrUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `promptpayQrKey` text;