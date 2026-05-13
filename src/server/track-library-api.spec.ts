import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../app/track-types';
import type { ServerDb } from '../server.db';
import type { R2Bucket, ServerEnv } from '../server.env';
import {
	registerTrackLibraryRoutes,
	type TrackLibraryHonoEnv,
} from './track-library-api';

describe('track library API routes', () => {
	const oneByOnePng = decodeBase64(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l5QAAAABJRU5ErkJggg==',
	);

	it('returns 503 when cloud bindings are missing', async () => {
		const { app, db } = createTestApp();

		const response = await app.request('https://example.com/api/tracks', {}, {
			TRACKS_DB: {} as ServerEnv['TRACKS_DB'],
		} satisfies Partial<ServerEnv>);

		expect(response.status).toBe(503);
		expect(db.rows.size).toBe(0);
	});

	it('saves, lists, and retrieves a track with image', async () => {
		const { app, env } = createTestApp();
		const track = createTrack();
		const imageBytes = oneByOnePng;

		const saveResponse = await app.request(
			'https://example.com/api/tracks',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					track,
					topdownPngBase64: encodeBase64(imageBytes),
				}),
			},
			env,
		);
		expect(saveResponse.status).toBe(201);

		const listResponse = await app.request(
			'https://example.com/api/tracks',
			{},
			env,
		);
		expect(listResponse.status).toBe(200);
		const listBody = await listResponse.json();
		expect(listBody.items).toHaveLength(1);
		expect(listBody.items[0].id).toBe(track.id);

		const trackResponse = await app.request(
			`https://example.com/api/tracks/${track.id}`,
			{},
			env,
		);
		expect(trackResponse.status).toBe(200);
		const trackBody = await trackResponse.json();
		expect(trackBody.track.id).toBe(track.id);

		const imageResponse = await app.request(
			`https://example.com/api/tracks/${track.id}/topdown.png`,
			{},
			env,
		);
		expect(imageResponse.status).toBe(200);
		expect(imageResponse.headers.get('content-type')).toBe('image/png');
		expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(
			imageBytes,
		);
	});

	it('rejects unsafe track ids', async () => {
		const { app, env } = createTestApp();
		const track = createTrack();
		track.id = 'track/1';

		const response = await app.request(
			'https://example.com/api/tracks',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					track,
					topdownPngBase64: encodeBase64(oneByOnePng),
				}),
			},
			env,
		);

		expect(response.status).toBe(400);
	});

	it('rejects invalid png bytes', async () => {
		const { app, env } = createTestApp();
		const track = createTrack();

		const response = await app.request(
			'https://example.com/api/tracks',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					track,
					topdownPngBase64: encodeBase64(new Uint8Array([1, 2, 3, 4])),
				}),
			},
			env,
		);

		expect(response.status).toBe(400);
	});

	it('rejects png dimensions that do not match track.topdownPx', async () => {
		const { app, env } = createTestApp();
		const track = createTrack();
		track.topdownPx = { w: 2, h: 2 };

		const response = await app.request(
			'https://example.com/api/tracks',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					track,
					topdownPngBase64: encodeBase64(oneByOnePng),
				}),
			},
			env,
		);

		expect(response.status).toBe(400);
	});
});

function createTrack(): TrackDef {
	return {
		schemaVersion: 1,
		id: 'track-1',
		name: 'Test Track',
		widthMeters: 20,
		heightMeters: 12,
		topdownPx: { w: 1, h: 1 },
		zones: [
			{
				id: 'z1',
				type: 'jump',
				poly: [
					[0.1, 0.1],
					[0.2, 0.1],
					[0.2, 0.2],
				],
			},
		],
		centerline: [
			[0.1, 0.1],
			[0.8, 0.8],
		],
	};
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const value of bytes) {
		binary += String.fromCharCode(value);
	}
	return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

type StoredTrackRow = {
	id: string;
	name: string;
	widthMeters: number;
	heightMeters: number;
	topdownWPx: number;
	topdownHPx: number;
	imageKey: string;
	trackJson: string;
	createdAt: Date;
	updatedAt: Date;
};

function createTestApp() {
	const db = createMockDb();
	const images = createMockImages();
	const app = new Hono<TrackLibraryHonoEnv>();

	registerTrackLibraryRoutes(app, {
		resolveDb: () => db.instance,
	});

	return {
		app,
		db,
		env: {
			TRACK_IMAGES: images,
		} satisfies Partial<ServerEnv>,
	};
}

function createMockDb(): {
	instance: ServerDb;
	rows: Map<string, StoredTrackRow>;
} {
	const rows = new Map<string, StoredTrackRow>();
	const firstRow = () => [...rows.values()][0];

	const instance = {
		select(selection: Record<string, unknown>) {
			const keys = Object.keys(selection) as (keyof StoredTrackRow)[];
			const project = (row: StoredTrackRow) =>
				Object.fromEntries(keys.map((key) => [key, row[key]]));

			return {
				from() {
					return {
						orderBy() {
							return {
								limit(limit: number) {
									return {
										async offset(offset: number) {
											return [...rows.values()]
												.sort(
													(a, b) =>
														b.updatedAt.getTime() - a.updatedAt.getTime(),
												)
												.slice(offset, offset + limit)
												.map(project);
										},
									};
								},
							};
						},
						where() {
							return {
								async limit() {
									const row = firstRow();
									return row ? [project(row)] : [];
								},
							};
						},
					};
				},
			};
		},
		insert() {
			return {
				values(value: StoredTrackRow) {
					return {
						async onConflictDoUpdate({
							set,
						}: {
							set: Partial<StoredTrackRow>;
						}) {
							const existing = rows.get(value.id);
							rows.set(value.id, {
								...existing,
								...value,
								...set,
								createdAt: existing?.createdAt ?? value.createdAt,
							});
						},
					};
				},
			};
		},
	} as unknown as ServerDb;

	return { instance, rows };
}

function createMockImages(): R2Bucket {
	const objects = new Map<string, Uint8Array>();

	return {
		async put(key: string, value: Uint8Array) {
			objects.set(key, value);
		},
		async get(key: string) {
			const bytes = objects.get(key);
			if (!bytes) return null;
			return {
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(bytes);
						controller.close();
					},
				}),
				httpMetadata: { contentType: 'image/png' },
			};
		},
	};
}
