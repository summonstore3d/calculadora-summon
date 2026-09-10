CREATE TABLE `app_states` (`user_id` text PRIMARY KEY NOT NULL,`version` integer DEFAULT 1 NOT NULL,`payload` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `audit_events` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`entity_type` text NOT NULL,`entity_id` text NOT NULL,`action` text NOT NULL,`payload` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `images` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`object_key` text NOT NULL,`content_type` text NOT NULL,`size` integer NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_images_object_key` ON `images` (`object_key`);
--> statement-breakpoint
CREATE TABLE `materials` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`brand` text NOT NULL,`type` text NOT NULL,`color` text NOT NULL,`stock_grams` real DEFAULT 0 NOT NULL,`average_cost` real DEFAULT 0 NOT NULL,`minimum_grams` real DEFAULT 250 NOT NULL,`status` text DEFAULT 'active' NOT NULL);
--> statement-breakpoint
CREATE TABLE `products` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`sku` text NOT NULL,`name` text NOT NULL,`category` text NOT NULL,`universe` text,`tags` text DEFAULT '[]' NOT NULL,`ready_stock` integer DEFAULT 0 NOT NULL,`status` text DEFAULT 'active' NOT NULL,`snapshot` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_user_sku` ON `products` (`user_id`,`sku`);
--> statement-breakpoint
CREATE TABLE `orders` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`product_id` text NOT NULL,`status` text NOT NULL,`quantity` integer NOT NULL,`channel` text NOT NULL,`snapshot` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `movements` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`entity_type` text NOT NULL,`entity_id` text NOT NULL,`kind` text NOT NULL,`quantity` real NOT NULL,`balance_after` real NOT NULL,`snapshot` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_audit_user_created` ON `audit_events` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_materials_user_status` ON `materials` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_orders_user_status_created` ON `orders` (`user_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_movements_user_entity` ON `movements` (`user_id`,`entity_type`,`entity_id`);
