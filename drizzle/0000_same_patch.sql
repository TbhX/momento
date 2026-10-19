CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`actor` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor`, `target`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`group_key` text NOT NULL,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `bookings_user` ON `bookings` (`user_id`);--> statement-breakpoint
CREATE TABLE `encounters` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round` integer NOT NULL,
	`user_a` text NOT NULL,
	`user_b` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `encounters_event` ON `encounters` (`event_id`,`round`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`theme` text NOT NULL,
	`city` text NOT NULL,
	`min_age` integer NOT NULL,
	`max_age` integer NOT NULL,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`start_token` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`group_a` text NOT NULL,
	`group_b` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`city` text NOT NULL,
	`premium_until` integer DEFAULT 0 NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`encounter_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_encounter` ON `messages` (`encounter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`target` text NOT NULL,
	`encounter_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_uses` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `usage_day` ON `session_uses` (`user_id`,`day`);--> statement-breakpoint
CREATE TABLE `votes` (
	`encounter_id` text NOT NULL,
	`user_id` text NOT NULL,
	`interested` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`encounter_id`, `user_id`)
);
--> statement-breakpoint
CREATE TRIGGER booking_guard BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NEW.group_key NOT IN ('A','B') THEN RAISE(ABORT,'invalid_group') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM events e JOIN members m ON m.id=NEW.user_id WHERE e.id=NEW.event_id AND e.status='open' AND e.scheduled_at>NEW.created_at AND m.suspended=0 AND m.age BETWEEN e.min_age AND e.max_age) THEN RAISE(ABORT,'event_unavailable') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM bookings WHERE event_id=NEW.event_id AND group_key=NEW.group_key)>=10 THEN RAISE(ABORT,'group_full') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.user_id=NEW.user_id AND e.status='open') >= (SELECT CASE WHEN premium_until>NEW.created_at THEN 3 ELSE 1 END FROM members WHERE id=NEW.user_id) THEN RAISE(ABORT,'booking_quota') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings b JOIN events e ON e.id=b.event_id JOIN events n ON n.id=NEW.event_id WHERE b.user_id=NEW.user_id AND e.status IN ('open','live') AND ABS(e.scheduled_at-n.scheduled_at)<3300000) THEN RAISE(ABORT,'schedule_overlap') END;
END;
--> statement-breakpoint
CREATE TRIGGER usage_guard BEFORE INSERT ON session_uses BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM session_uses WHERE user_id=NEW.user_id AND day=NEW.day)>=(SELECT CASE WHEN premium_until>NEW.created_at THEN 5 ELSE 1 END FROM members WHERE id=NEW.user_id) THEN RAISE(ABORT,'daily_quota') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM session_uses u JOIN events e ON e.id=u.event_id WHERE u.user_id=NEW.user_id AND e.status='live' AND e.started_at+3300000>NEW.created_at AND e.id<>NEW.event_id) THEN RAISE(ABORT,'already_in_session') END;
END;
