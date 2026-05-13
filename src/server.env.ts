export const MISSING_TRACKS_DB_MESSAGE = 'TRACKS_DB binding is not configured.';

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = unknown>(): Promise<{ results: T[] }>;
	first<T = unknown>(columnName?: string): Promise<T | null>;
	run(): Promise<unknown>;
}

export interface D1Database {
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
	exec(query: string): Promise<unknown>;
	prepare(query: string): D1PreparedStatement;
}

export interface R2ObjectBody {
	body: ReadableStream | null;
	httpMetadata?: { contentType?: string };
	httpEtag?: string;
	writeHttpMetadata?(headers: Headers): void;
}

export interface R2Bucket {
	put(
		key: string,
		value: Uint8Array,
		options?: {
			httpMetadata?: { contentType?: string };
		},
	): Promise<unknown>;
	get(key: string): Promise<R2ObjectBody | null>;
}

export interface ServerEnv {
	TRACKS_DB: D1Database;
	TRACK_IMAGES: R2Bucket;
}
