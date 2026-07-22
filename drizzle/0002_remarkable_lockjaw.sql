CREATE TABLE `bot_settings` (
	`id` varchar(64) NOT NULL,
	`startTitle` varchar(120) NOT NULL,
	`startDescription` text NOT NULL,
	`previewText` text,
	`previewImageUrl` text,
	`ageNotice` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `pixExpiresAt` timestamp;