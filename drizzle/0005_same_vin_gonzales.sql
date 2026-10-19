CREATE TABLE `shop_test_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`persona` text NOT NULL,
	`sku` text NOT NULL,
	`session_id` text,
	`subscription_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`checkout_until` integer NOT NULL,
	`paid_at` integer,
	`period_end` integer DEFAULT 0 NOT NULL,
	`cancel_at_end` integer DEFAULT 0 NOT NULL,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`immediate` integer DEFAULT 0 NOT NULL,
	`acknowledged` integer DEFAULT 0 NOT NULL,
	`sync_token` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shop_test_user` ON `shop_test_orders` (`user_id`,`created_at`);