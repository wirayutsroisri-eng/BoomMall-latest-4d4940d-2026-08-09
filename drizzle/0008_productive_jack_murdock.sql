ALTER TABLE `users` ADD `shippingName` text;--> statement-breakpoint
ALTER TABLE `users` ADD `shippingPhone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `shippingAddress` text;--> statement-breakpoint
ALTER TABLE `users` ADD `shippingDistrict` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `shippingSubdistrict` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `shippingProvince` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `shippingZipCode` varchar(10);