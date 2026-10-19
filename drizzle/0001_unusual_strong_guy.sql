ALTER TABLE `events` ADD `sector` text DEFAULT 'Tous secteurs' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `intent` text DEFAULT 'Découverte sans pression' NOT NULL;