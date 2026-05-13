import type { TrackDef } from '../app/track-types';
import { validateTrackDef } from '../app/state/track-validation';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type D1Result<T> = { results: T[] };

type D1PreparedStatement = {
	bind(...values: unknown[]): {
		all<T>(): Promise<D1Result<T>>;
		first<T>(): Promise<T | null>;
		run(): Promise<unknown>;
	};
};

type D1Client = {
	prepare(sql: string): D1PreparedStatement;
	exec(sql: string): Promise<unknown>;
};

type R2ObjectBody = {
	body: ReadableStream | null;
	httpMetadata?: { contentType?: string };
	writeHttpMetadata?(headers: Headers): void;
	httpEtag?: string;
};

type R2Client = {
	put(
		key: string,
		value: Uint8Array,
		options?: {
			httpMetadata?: { contentType?: string };
		},
	): Promise<unknown>;
	get(key: string): Promise<R2ObjectBody | null>;
};

export type TrackLibraryEnv = {
	TRACKS_DB?: D1Client;
	TRACK_IMAGES?: R2Client;
};

type TrackRow = {
	id: string;
	name: string;
	width_meters: number;
	height_meters: number;
	topdown_w_px: number;
	topdown_h_px: number;
	image_key: string;
	track_json: string;
	created_at: string;
	updated_at: string;
};

export async function handleTrackLibraryRequest(
	request: Request,
	env?: TrackLibraryEnv,
): Promise<Response | null> {
	const url = new URL(request.url);
	const { pathname } = url;
	if (!pathname.startsWith('/api/tracks')) {
		return null;
	}

	const db = env?.TRACKS_DB;
	const images = env?.TRACK_IMAGES;
	if (!db || !images) {
		return jsonError(
			503,
			'Cloud track library is not configured. Missing TRACKS_DB or TRACK_IMAGES binding.',
		);
	}

	await ensureSchema(db);

	try {
		if (pathname === '/api/tracks' && request.method === 'GET') {
			return await listTracks(request, db);
		}
		if (pathname === '/api/tracks' && request.method === 'POST') {
			return await saveTrack(request, db, images);
		}

		const trackIdMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
		if (trackIdMatch && request.method === 'GET') {
			return await getTrack(trackIdMatch[1], db);
		}

		const trackImageMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/topdown\.png$/);
		if (trackImageMatch && request.method === 'GET') {
			return await getTrackImage(trackImageMatch[1], db, images);
		}

		return jsonError(405, 'Method not allowed.');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error.';
		return jsonError(500, `Failed to handle track library request: ${message}`);
	}
}

async function ensureSchema(db: D1Client): Promise<void> {
	await db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	width_meters REAL NOT NULL,
	height_meters REAL NOT NULL,
	topdown_w_px INTEGER NOT NULL,
	topdown_h_px INTEGER NOT NULL,
	image_key TEXT NOT NULL,
	track_json TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tracks_updated_at ON tracks(updated_at DESC);
`);
}

async function listTracks(request: Request, db: D1Client): Promise<Response> {
	const url = new URL(request.url);
	const page = readPositiveInt(url.searchParams.get('page')) ?? 1;
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		readPositiveInt(url.searchParams.get('pageSize')) ?? DEFAULT_PAGE_SIZE,
	);
	const offset = (page - 1) * pageSize;

	const result = await db
		.prepare(
			`SELECT id, name, width_meters, height_meters, topdown_w_px, topdown_h_px, created_at, updated_at
			 FROM tracks
			 ORDER BY updated_at DESC
			 LIMIT ? OFFSET ?`,
		)
		.bind(pageSize, offset)
		.all<TrackRow>();

	return jsonResponse(200, {
		items: result.results.map((row) => ({
			id: row.id,
			name: row.name,
			widthMeters: row.width_meters,
			heightMeters: row.height_meters,
			topdownPx: { w: row.topdown_w_px, h: row.topdown_h_px },
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			imageUrl: `/api/tracks/${encodeURIComponent(row.id)}/topdown.png`,
		})),
		page,
		pageSize,
	});
}

async function saveTrack(
	request: Request,
	db: D1Client,
	images: R2Client,
): Promise<Response> {
	const body = await parseJsonBody(request);
	if (!body || !isRecord(body)) {
		return jsonError(400, 'Body must be a JSON object.');
	}

	const trackValidation = validateTrackDef(body['track']);
	if (!trackValidation.ok) {
		return jsonError(400, trackValidation.errors.join(' '));
	}
	const track = trackValidation.track;
	if (!isSafeTrackId(track.id)) {
		return jsonError(
			400,
			'Track id must contain only letters, numbers, underscores, and hyphens.',
		);
	}

	const imageB64 = body['topdownPngBase64'];
	if (typeof imageB64 !== 'string' || imageB64.trim().length === 0) {
		return jsonError(400, 'topdownPngBase64 is required.');
	}

	const imageBytes = decodeBase64(imageB64);
	if (!imageBytes) {
		return jsonError(400, 'topdownPngBase64 must be valid base64.');
	}
	if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
		return jsonError(413, 'topdownPngBase64 exceeds max allowed size.');
	}
	const pngSize = readPngSize(imageBytes);
	if (!pngSize) {
		return jsonError(400, 'topdownPngBase64 must decode to a valid PNG image.');
	}
	if (
		pngSize.width !== track.topdownPx.w ||
		pngSize.height !== track.topdownPx.h
	) {
		return jsonError(
			400,
			`PNG dimensions (${pngSize.width}x${pngSize.height}) do not match track.topdownPx (${track.topdownPx.w}x${track.topdownPx.h}).`,
		);
	}

	const imageKey = `tracks/${track.id}/topdown.png`;
	await images.put(imageKey, imageBytes, {
		httpMetadata: { contentType: 'image/png' },
	});

	const now = new Date().toISOString();
	const existing = await db
		.prepare(
			`SELECT created_at
			 FROM tracks
			 WHERE id = ?`,
		)
		.bind(track.id)
		.first<Pick<TrackRow, 'created_at'>>();
	const createdAt = existing?.created_at ?? now;

	await db
		.prepare(
			`INSERT INTO tracks (
				 id, name, width_meters, height_meters, topdown_w_px, topdown_h_px, image_key, track_json, created_at, updated_at
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				 name = excluded.name,
				 width_meters = excluded.width_meters,
				 height_meters = excluded.height_meters,
				 topdown_w_px = excluded.topdown_w_px,
				 topdown_h_px = excluded.topdown_h_px,
				 image_key = excluded.image_key,
				 track_json = excluded.track_json,
				 updated_at = excluded.updated_at`,
		)
		.bind(
			track.id,
			track.name,
			track.widthMeters,
			track.heightMeters,
			track.topdownPx.w,
			track.topdownPx.h,
			imageKey,
			JSON.stringify(track),
			createdAt,
			now,
		)
		.run();

	return jsonResponse(201, { id: track.id, imageKey, savedAt: now });
}

async function getTrack(trackId: string, db: D1Client): Promise<Response> {
	const row = await db
		.prepare(
			`SELECT id, track_json, created_at, updated_at
			 FROM tracks
			 WHERE id = ?`,
		)
		.bind(trackId)
		.first<TrackRow>();
	if (!row) {
		return jsonError(404, 'Track not found.');
	}

	const track = parseTrackJson(row.track_json);
	if (!track) {
		return jsonError(500, 'Stored track_json is invalid.');
	}

	return jsonResponse(200, {
		track,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		imageUrl: `/api/tracks/${encodeURIComponent(row.id)}/topdown.png`,
	});
}

async function getTrackImage(
	trackId: string,
	db: D1Client,
	images: R2Client,
): Promise<Response> {
	const row = await db
		.prepare(
			`SELECT image_key
			 FROM tracks
			 WHERE id = ?`,
		)
		.bind(trackId)
		.first<TrackRow>();
	if (!row) {
		return jsonError(404, 'Track not found.');
	}

	const image = await images.get(row.image_key);
	if (!image || !image.body) {
		return jsonError(404, 'Track image not found.');
	}

	const headers = new Headers();
	if (image.writeHttpMetadata) {
		image.writeHttpMetadata(headers);
	}
	if (!headers.get('content-type')) {
		headers.set('content-type', image.httpMetadata?.contentType ?? 'image/png');
	}
	headers.set('cache-control', 'public, max-age=300');
	if (image.httpEtag) {
		headers.set('etag', image.httpEtag);
	}

	return new Response(image.body, {
		status: 200,
		headers,
	});
}

function parseTrackJson(raw: string): TrackDef | null {
	try {
		const parsed = JSON.parse(raw);
		const validation = validateTrackDef(parsed);
		return validation.ok ? validation.track : null;
	} catch {
		return null;
	}
}

function readPositiveInt(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

function decodeBase64(input: string): Uint8Array | null {
	try {
		const normalized = input.replace(/\s+/g, '');
		const atobFn = globalThis.atob;
		if (typeof atobFn !== 'function') {
			const bufferCtor = (globalThis as {
				Buffer?: { from(data: string, encoding: string): Uint8Array };
			}).Buffer;
			if (!bufferCtor) return null;
			return new Uint8Array(bufferCtor.from(normalized, 'base64'));
		}

		const binary = atobFn(normalized);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	} catch {
		return null;
	}
}

async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}

function jsonError(status: number, message: string): Response {
	return jsonResponse(status, { error: message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeTrackId(trackId: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(trackId);
}

function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
	// Minimum bytes needed to read PNG signature + IHDR length/type + IHDR width/height.
	if (bytes.byteLength < 24) return null;
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (bytes[i] !== PNG_SIGNATURE[i]) return null;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const ihdrLength = view.getUint32(8);
	if (ihdrLength !== 13) return null;

	if (
		bytes[12] !== 73 || // I
		bytes[13] !== 72 || // H
		bytes[14] !== 68 || // D
		bytes[15] !== 82 // R
	) {
		return null;
	}

	const width = view.getUint32(16);
	const height = view.getUint32(20);
	if (width === 0 || height === 0) return null;
	return { width, height };
}
