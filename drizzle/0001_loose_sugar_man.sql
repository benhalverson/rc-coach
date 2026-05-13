ALTER TABLE `tracks` ADD `width_meters` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `height_meters` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `topdown_w_px` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `topdown_h_px` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `image_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `track_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tracks_updated_at` ON `tracks` (`updated_at`);