CREATE TABLE `billing_test` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`customer_id` text,
	`session_id` text,
	`checkout_until` integer DEFAULT 0 NOT NULL,
	`attempt` text,
	`subscription_id` text,
	`updated_at` integer NOT NULL
);
