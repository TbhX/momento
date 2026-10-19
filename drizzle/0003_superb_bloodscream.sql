CREATE TABLE `second_date_test` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`session_id` text,
	`expires_at` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`credit` integer DEFAULT 0 NOT NULL,
	`sync_token` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_test_events` (
	`id` text PRIMARY KEY NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `billing_test` ADD `test_premium_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_test` ADD `test_state` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_test` ADD `sync_token` text;--> statement-breakpoint
ALTER TABLE `billing_test` ADD `synced_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_test` ADD `payment_hold` integer DEFAULT 0 NOT NULL;