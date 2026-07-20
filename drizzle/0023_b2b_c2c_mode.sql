ALTER TABLE `products` ADD `listingType` enum('c2c','b2b','both') NOT NULL DEFAULT 'both';--> statement-breakpoint
ALTER TABLE `conversations` ADD `chatMode` enum('c2c','b2b') NOT NULL DEFAULT 'c2c';--> statement-breakpoint
ALTER TABLE `messages` ADD `messageType` enum('text','shipping_address','payment_info') NOT NULL DEFAULT 'text';
