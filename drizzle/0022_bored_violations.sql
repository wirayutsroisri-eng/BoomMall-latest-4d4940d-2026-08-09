ALTER TABLE `push_subscriptions` DROP INDEX `push_subscriptions_fcmToken_unique`;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `status` enum('pending_payment','waiting_buyer_confirm','seller_confirmed','payment_submitted','payment_confirmed','shipped','completed','cancelled','refunded') NOT NULL DEFAULT 'pending_payment';--> statement-breakpoint
ALTER TABLE `orders` ADD `shippingProvider` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `shippedAt` timestamp;