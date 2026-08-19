CREATE TABLE `trip_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trip_participants_trip_id_idx` ON `trip_participants` (`trip_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
-- Manually restored `ON DELETE` clauses on the two lines below: drizzle-kit's
-- SQLite `ALTER TABLE ... ADD COLUMN` generator silently drops onDelete/onUpdate
-- for a referenced column (confirmed against drizzle-kit 0.31.10 — schema.ts's
-- own `.references(() => ..., { onDelete: ... })` and this migration's sibling
-- 0002_snapshot.json both correctly record `cascade` / `set null`; only the
-- raw SQL text drizzle-kit emitted here was missing it). Everything else in
-- this file is untouched, generated output.
ALTER TABLE `bills` ADD `trip_id` text REFERENCES trips(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `bills_trip_id_idx` ON `bills` (`trip_id`);--> statement-breakpoint
ALTER TABLE `participants` ADD `trip_participant_id` text REFERENCES trip_participants(id) ON DELETE set null;