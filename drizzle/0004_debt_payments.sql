CREATE TABLE `debt_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text,
	`trip_id` text,
	`from_key` text NOT NULL,
	`to_key` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "debt_payments_scope_check" CHECK(("debt_payments"."bill_id" IS NULL) <> ("debt_payments"."trip_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debt_payments_bill_pair_idx` ON `debt_payments` (`bill_id`,`from_key`,`to_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `debt_payments_trip_pair_idx` ON `debt_payments` (`trip_id`,`from_key`,`to_key`);