export const MISSING_TRACKS_DB_MESSAGE = 'TRACKS_DB binding is not configured.';

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(columnName?: string): Promise<T | null>;
	run(): Promise<unknown>;
}

export interface D1Database {
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
	exec(query: string): Promise<unknown>;
	prepare(query: string): D1PreparedStatement;
}

export interface ServerEnv {
	TRACKS_DB: D1Database;
}
