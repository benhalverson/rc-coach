import { drizzle } from 'drizzle-orm/d1';
import {
	type D1Database,
	MISSING_TRACKS_DB_MESSAGE,
	type ServerEnv,
} from './server.env';
import { schema } from './server.schema';

export const createDb = (binding: D1Database) => drizzle(binding, { schema });

export type ServerDb = ReturnType<typeof createDb>;

export const requireDb = (env?: Partial<ServerEnv>): ServerDb => {
	const binding = env?.TRACKS_DB;

	if (!binding) {
		throw new Error(MISSING_TRACKS_DB_MESSAGE);
	}

	return createDb(binding);
};
