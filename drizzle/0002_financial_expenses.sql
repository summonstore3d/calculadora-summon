CREATE TABLE `expenses` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `description` text NOT NULL,
  `category` text NOT NULL,
  `amount_cents` integer NOT NULL,
  `due_date` text NOT NULL,
  `paid_at` text,
  `status` text NOT NULL,
  `recurring` integer DEFAULT false NOT NULL,
  `snapshot` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_user_due` ON `expenses` (`user_id`,`due_date`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_user_status` ON `expenses` (`user_id`,`status`);
