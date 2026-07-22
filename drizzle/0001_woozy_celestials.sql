CREATE TABLE `access_events` (
	`id` varchar(64) NOT NULL,
	`telegramUserId` int NOT NULL,
	`subscriptionId` varchar(64),
	`accessEventType` enum('age_confirmed','invite_issued','invite_sent','access_revoked','renewal_reminder','payment_confirmed') NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(64) NOT NULL,
	`category` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`auditStatus` enum('success','warning','error') NOT NULL,
	`entityType` varchar(64),
	`entityId` varchar(128),
	`message` text,
	`metadataJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_jobs` (
	`id` varchar(64) NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`lastRunSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `automation_jobs_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(64) NOT NULL,
	`telegramUserId` int NOT NULL,
	`planId` varchar(64) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'evopay',
	`providerTransactionId` varchar(128),
	`externalReference` varchar(128) NOT NULL,
	`callbackTokenHash` varchar(128) NOT NULL,
	`amountCents` int NOT NULL,
	`paymentStatus` enum('pending','completed','canceled','expired','refunded','failed') NOT NULL DEFAULT 'pending',
	`pixCopyPaste` text,
	`qrCodeUrl` text,
	`qrCodeBase64` text,
	`providerPayload` text,
	`paidAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_providerTransactionId_unique` UNIQUE(`providerTransactionId`),
	CONSTRAINT `payments_externalReference_unique` UNIQUE(`externalReference`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`priceCents` int NOT NULL,
	`durationDays` int,
	`isLifetime` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`displayOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(64) NOT NULL,
	`telegramUserId` int NOT NULL,
	`planId` varchar(64) NOT NULL,
	`paymentId` varchar(64) NOT NULL,
	`subscriptionStatus` enum('active','expired','revoked','canceled') NOT NULL DEFAULT 'active',
	`startsAt` timestamp NOT NULL,
	`expiresAt` timestamp,
	`renewalReminderSentAt` timestamp,
	`accessGrantedAt` timestamp,
	`accessRevokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_payment_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_invites` (
	`id` varchar(64) NOT NULL,
	`subscriptionId` varchar(64) NOT NULL,
	`telegramUserId` int NOT NULL,
	`inviteLink` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`memberLimit` int NOT NULL DEFAULT 1,
	`inviteStatus` enum('issued','used','revoked','expired') NOT NULL DEFAULT 'issued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramUserId` varchar(32) NOT NULL,
	`username` varchar(128),
	`firstName` varchar(256),
	`lastName` varchar(256),
	`languageCode` varchar(16),
	`ageConfirmedAt` timestamp,
	`ageConfirmationVersion` varchar(32),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastInteractionAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_users_telegramUserId_unique` UNIQUE(`telegramUserId`)
);
--> statement-breakpoint
ALTER TABLE `access_events` ADD CONSTRAINT `access_events_telegramUserId_telegram_users_id_fk` FOREIGN KEY (`telegramUserId`) REFERENCES `telegram_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_events` ADD CONSTRAINT `access_events_subscriptionId_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_telegramUserId_telegram_users_id_fk` FOREIGN KEY (`telegramUserId`) REFERENCES `telegram_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_planId_subscription_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_telegramUserId_telegram_users_id_fk` FOREIGN KEY (`telegramUserId`) REFERENCES `telegram_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_subscription_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `telegram_invites` ADD CONSTRAINT `telegram_invites_subscriptionId_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `telegram_invites` ADD CONSTRAINT `telegram_invites_telegramUserId_telegram_users_id_fk` FOREIGN KEY (`telegramUserId`) REFERENCES `telegram_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_events_user_idx` ON `access_events` (`telegramUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_user_status_idx` ON `payments` (`telegramUserId`,`paymentStatus`);--> statement-breakpoint
CREATE INDEX `payments_provider_status_idx` ON `payments` (`providerTransactionId`,`paymentStatus`);--> statement-breakpoint
CREATE INDEX `subscription_plans_active_idx` ON `subscription_plans` (`isActive`,`displayOrder`);--> statement-breakpoint
CREATE INDEX `subscriptions_expiry_idx` ON `subscriptions` (`subscriptionStatus`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `subscriptions_user_status_idx` ON `subscriptions` (`telegramUserId`,`subscriptionStatus`);--> statement-breakpoint
CREATE INDEX `telegram_invites_subscription_status_idx` ON `telegram_invites` (`subscriptionId`,`inviteStatus`);--> statement-breakpoint
CREATE INDEX `telegram_users_age_confirmed_idx` ON `telegram_users` (`ageConfirmedAt`);