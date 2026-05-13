import { desc, eq } from 'drizzle-orm';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { validateTrackDef } from '../app/state/track-validation';
import type { TrackDef } from '../app/track-types';
import { requireDb, type ServerDb } from '../server.db';
import type { R2Bucket, ServerEnv } from '../server.env';
import { tracks } from '../server.schema';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const TRACK_LIBRARY_NOT_CONFIGURED_MESSAGE =
	'Cloud track library is not configured. Missing TRACKS_DB or TRACK_IMAGES binding.';

export type TrackLibraryHonoEnv = {
	Bindings: Partial<ServerEnv>;
	Variables: {
		db: ServerDb;
	};
};

type TrackLibraryContext = Context<TrackLibraryHonoEnv>;

type RegisterTrackLibraryRoutesOptions = {
	resolveDb?: (env: Partial<ServerEnv>) => ServerDb;
};

export function registerTrackLibraryRoutes(
	app: Hono<TrackLibraryHonoEnv>,
	options: RegisterTrackLibraryRoutesOptions = {},
) {
	const resolveDb = options.resolveDb ?? requireDb;
	const requireTrackLibraryBindings: MiddlewareHandler<
		TrackLibraryHonoEnv
	> = async (c, next) => {
		if (!c.env.TRACK_IMAGES) {
			return jsonError(c, 503, TRACK_LIBRARY_NOT_CONFIGURED_MESSAGE);
		}

		try {
			c.set('db', resolveDb(c.env));
		} catch {
			return jsonError(c, 503, TRACK_LIBRARY_NOT_CONFIGURED_MESSAGE);
		}

		return next();
	};

	app.use('/api/tracks', requireTrackLibraryBindings);
	app.use('/api/tracks/*', requireTrackLibraryBindings);

	app.get('/api/tracks', listTracks);
	app.post('/api/tracks', saveTrack);
	app.get('/api/tracks/:id/topdown.png', getTrackImage);
	app.get('/api/tracks/:id', getTrack);
}

async function listTracks(c: TrackLibraryContext): Promise<Response> {
	const page = readPositiveInt(c.req.query('page') ?? null) ?? 1;
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		readPositiveInt(c.req.query('pageSize') ?? null) ?? DEFAULT_PAGE_SIZE,
	);
	const offset = (page - 1) * pageSize;

	const rows = await c
		.get('db')
		.select({
			id: tracks.id,
			name: tracks.name,
			widthMeters: tracks.widthMeters,
			heightMeters: tracks.heightMeters,
			topdownWPx: tracks.topdownWPx,
			topdownHPx: tracks.topdownHPx,
			createdAt: tracks.createdAt,
			updatedAt: tracks.updatedAt,
		})
		.from(tracks)
		.orderBy(desc(tracks.updatedAt))
		.limit(pageSize)
		.offset(offset);

	return c.json({
		items: rows.map((row) => ({
			id: row.id,
			name: row.name,
			widthMeters: row.widthMeters,
			heightMeters: row.heightMeters,
			topdownPx: { w: row.topdownWPx, h: row.topdownHPx },
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			imageUrl: `/api/tracks/${encodeURIComponent(row.id)}/topdown.png`,
		})),
		page,
		pageSize,
	});
}

async function saveTrack(c: TrackLibraryContext): Promise<Response> {
	const body = await parseJsonBody(c);
	if (!body || !isRecord(body)) {
		return jsonError(c, 400, 'Body must be a JSON object.');
	}

	const trackValidation = validateTrackDef(body['track']);
	if (!trackValidation.ok) {
		return jsonError(c, 400, trackValidation.errors.join(' '));
	}
	const track = trackValidation.track;
	if (!isSafeTrackId(track.id)) {
		return jsonError(
			c,
			400,
			'Track id must contain only letters, numbers, underscores, and hyphens.',
		);
	}

	const imageB64 = body['topdownPngBase64'];
	if (typeof imageB64 !== 'string' || imageB64.trim().length === 0) {
		return jsonError(c, 400, 'topdownPngBase64 is required.');
	}

	const imageBytes = decodeBase64(imageB64);
	if (!imageBytes) {
		return jsonError(c, 400, 'topdownPngBase64 must be valid base64.');
	}
	if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
		return jsonError(c, 413, 'topdownPngBase64 exceeds max allowed size.');
	}
	const pngSize = readPngSize(imageBytes);
	if (!pngSize) {
		return jsonError(
			c,
			400,
			'topdownPngBase64 must decode to a valid PNG image.',
		);
	}
	if (
		pngSize.width !== track.topdownPx.w ||
		pngSize.height !== track.topdownPx.h
	) {
		return jsonError(
			c,
			400,
			`PNG dimensions (${pngSize.width}x${pngSize.height}) do not match track.topdownPx (${track.topdownPx.w}x${track.topdownPx.h}).`,
		);
	}

	const imageKey = `tracks/${track.id}/topdown.png`;
	await getImages(c).put(imageKey, imageBytes, {
		httpMetadata: { contentType: 'image/png' },
	});

	const db = c.get('db');
	const now = new Date();
	const [existing] = await db
		.select({ createdAt: tracks.createdAt })
		.from(tracks)
		.where(eq(tracks.id, track.id))
		.limit(1);
	const createdAt = existing?.createdAt ?? now;
	const trackJson = JSON.stringify(track);

	await db
		.insert(tracks)
		.values({
			id: track.id,
			name: track.name,
			widthMeters: track.widthMeters,
			heightMeters: track.heightMeters,
			topdownWPx: track.topdownPx.w,
			topdownHPx: track.topdownPx.h,
			imageKey,
			trackJson,
			createdAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: tracks.id,
			set: {
				name: track.name,
				widthMeters: track.widthMeters,
				heightMeters: track.heightMeters,
				topdownWPx: track.topdownPx.w,
				topdownHPx: track.topdownPx.h,
				imageKey,
				trackJson,
				updatedAt: now,
			},
		});

	return c.json(
		{
			id: track.id,
			imageKey,
			savedAt: now.toISOString(),
		},
		201,
	);
}

async function getTrack(c: TrackLibraryContext): Promise<Response> {
	const trackId = c.req.param('id');
	if (!trackId) {
		return jsonError(c, 404, 'Track not found.');
	}

	const [row] = await c
		.get('db')
		.select({
			id: tracks.id,
			trackJson: tracks.trackJson,
			createdAt: tracks.createdAt,
			updatedAt: tracks.updatedAt,
		})
		.from(tracks)
		.where(eq(tracks.id, trackId))
		.limit(1);
	if (!row) {
		return jsonError(c, 404, 'Track not found.');
	}

	const track = parseTrackJson(row.trackJson);
	if (!track) {
		return jsonError(c, 500, 'Stored track_json is invalid.');
	}

	return c.json({
		track,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		imageUrl: `/api/tracks/${encodeURIComponent(row.id)}/topdown.png`,
	});
}

async function getTrackImage(c: TrackLibraryContext): Promise<Response> {
	const trackId = c.req.param('id');
	if (!trackId) {
		return jsonError(c, 404, 'Track not found.');
	}

	const [row] = await c
		.get('db')
		.select({ imageKey: tracks.imageKey })
		.from(tracks)
		.where(eq(tracks.id, trackId))
		.limit(1);
	if (!row) {
		return jsonError(c, 404, 'Track not found.');
	}

	const image = await getImages(c).get(row.imageKey);
	if (!image || !image.body) {
		return jsonError(c, 404, 'Track image not found.');
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

function getImages(c: TrackLibraryContext): R2Bucket {
	return c.env.TRACK_IMAGES as R2Bucket;
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
			const bufferCtor = (
				globalThis as {
					Buffer?: { from(data: string, encoding: string): Uint8Array };
				}
			).Buffer;
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

async function parseJsonBody(c: TrackLibraryContext): Promise<unknown> {
	try {
		return await c.req.json();
	} catch {
		return null;
	}
}

function jsonError(
	c: TrackLibraryContext,
	status: 400 | 404 | 413 | 500 | 503,
	message: string,
): Response {
	return c.json({ error: message }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeTrackId(trackId: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(trackId);
}

function readPngSize(
	bytes: Uint8Array,
): { width: number; height: number } | null {
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
