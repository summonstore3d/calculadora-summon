CREATE TABLE `user_profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  `settings` text NOT NULL,
  `write_token` text NOT NULL,
  `legacy_migrated_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `materials` ADD `snapshot` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `calculations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_components` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `recipe_version_id` text NOT NULL,
  `material_id` text NOT NULL,
  `weight_grams` real NOT NULL,
  `snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calculations_user_created` ON `calculations` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_recipe_components_recipe` ON `recipe_components` (`user_id`,`recipe_version_id`);
--> statement-breakpoint
CREATE INDEX `idx_orders_user_created` ON `orders` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_customers_user_location` ON `customers` (`user_id`,`state`,`city`);
--> statement-breakpoint
PRAGMA optimize;
