CREATE TABLE `product_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`productId` int NOT NULL,
	`categoryId` int,
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_views_id` PRIMARY KEY(`id`)
);
