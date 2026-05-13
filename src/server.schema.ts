import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tracks = sqliteTable('tracks', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	surface: text('surface'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const schema = { tracks };
