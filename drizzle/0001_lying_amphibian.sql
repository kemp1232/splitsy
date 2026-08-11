ALTER TABLE `bills` ADD `split_mode` text DEFAULT 'ITEMIZED' NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `contributed_centavos` integer DEFAULT 0 NOT NULL;