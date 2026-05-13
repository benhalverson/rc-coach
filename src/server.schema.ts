import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

export const tracks = sqliteTable(
	'tracks',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		surface: text('surface'),
		widthMeters: real('width_meters').notNull().default(0),
		heightMeters: real('height_meters').notNull().default(0),
		topdownWPx: integer('topdown_w_px').notNull().default(0),
		topdownHPx: integer('topdown_h_px').notNull().default(0),
		imageKey: text('image_key').notNull().default(''),
		trackJson: text('track_json').notNull().default('{}'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('idx_tracks_updated_at').on(table.updatedAt)],
);

export const schema = { tracks };
