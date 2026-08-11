CREATE TABLE `adjustment_allocations` (
	`adjustment_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	PRIMARY KEY(`adjustment_id`, `participant_id`),
	FOREIGN KEY (`adjustment_id`) REFERENCES `adjustments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adjustment_allocations_participant_id_idx` ON `adjustment_allocations` (`participant_id`);--> statement-breakpoint
CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	`allocation_method` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adjustments_bill_id_idx` ON `adjustments` (`bill_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`merchant_name` text,
	`receipt_date` text,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`entry_method` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`receipt_image_uri` text,
	`original_receipt_image_uri` text,
	`raw_ocr_text` text,
	`detected_receipt_total_centavos` integer,
	`detected_subtotal_centavos` integer,
	`parser_version` integer,
	`discrepancy_acknowledged` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `item_assignments` (
	`line_item_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`line_item_id`, `participant_id`),
	FOREIGN KEY (`line_item_id`) REFERENCES `line_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_assignments_participant_id_idx` ON `item_assignments` (`participant_id`);--> statement-breakpoint
CREATE TABLE `line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_centavos` integer,
	`line_total_centavos` integer NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`raw_text` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `line_items_bill_id_idx` ON `line_items` (`bill_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `participants_bill_id_idx` ON `participants` (`bill_id`);