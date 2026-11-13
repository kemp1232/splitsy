CREATE TABLE `saved_group_members` (
	`group_id` text NOT NULL,
	`saved_person_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`group_id`, `saved_person_id`),
	FOREIGN KEY (`group_id`) REFERENCES `saved_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_person_id`) REFERENCES `saved_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_group_members_saved_person_id_idx` ON `saved_group_members` (`saved_person_id`);--> statement-breakpoint
CREATE TABLE `saved_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`last_used_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_people_normalized_name_idx` ON `saved_people` (`normalized_name`);