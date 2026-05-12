import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../app/track-types';
import {
	handleTrackLibraryRequest,
	type TrackLibraryEnv,
} from './track-library-api';

describe('handleTrackLibraryRequest', () => {
	it('returns 503 when cloud bindings are missing', async () => {
		const response = await handleTrackLibraryRequest(
			new Request('https://example.com/api/tracks'),
		);

		expect(response?.status).toBe(503);
	});

	it('saves, lists, and retrieves a track with image', async () => {
		const env = createMockEnv();
		const track = createTrack();
		const imageBytes = new Uint8Array([137, 80, 78, 71]);

		const saveResponse = await handleTrackLibraryRequest(
			new Request('https://example.com/api/tracks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					track,
					topdownPngBase64: encodeBase64(imageBytes),
				}),
			}),
			env,
		);
		expect(saveResponse?.status).toBe(201);

		const listResponse = await handleTrackLibraryRequest(
			new Request('https://example.com/api/tracks'),
			env,
		);
		expect(listResponse?.status).toBe(200);
		const listBody = await listResponse?.json();
		expect(listBody.items).toHaveLength(1);
		expect(listBody.items[0].id).toBe(track.id);

		const trackResponse = await handleTrackLibraryRequest(
			new Request(`https://example.com/api/tracks/${track.id}`),
			env,
		);
		expect(trackResponse?.status).toBe(200);
		const trackBody = await trackResponse?.json();
		expect(trackBody.track.id).toBe(track.id);

		const imageResponse = await handleTrackLibraryRequest(
			new Request(`https://example.com/api/tracks/${track.id}/topdown.png`),
			env,
		);
		expect(imageResponse?.status).toBe(200);
		expect(imageResponse?.headers.get('content-type')).toBe('image/png');
		expect(new Uint8Array(await imageResponse!.arrayBuffer())).toEqual(imageBytes);
	});
});

function createTrack(): TrackDef {
	return {
		schemaVersion: 1,
		id: 'track-1',
		name: 'Test Track',
		widthMeters: 20,
		heightMeters: 12,
		topdownPx: { w: 1600, h: 900 },
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

function createMockEnv(): TrackLibraryEnv {
	const rows = new Map<
		string,
		{
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
		}
	>();

	const db = {
		async exec() {},
		prepare(sql: string) {
			return {
				bind(...values: unknown[]) {
					return {
						async all<T>() {
							if (!sql.includes('SELECT id, name')) {
								return { results: [] as T[] };
							}
							return {
								results: [...rows.values()].map((row) => ({ ...row })) as T[],
							};
						},
						async first<T>() {
							if (sql.includes('SELECT id, track_json')) {
								const row = rows.get(values[0] as string);
								if (!row) return null;
								return {
									id: row.id,
									track_json: row.track_json,
									created_at: row.created_at,
									updated_at: row.updated_at,
								} as T;
							}
							if (sql.includes('SELECT image_key')) {
								const row = rows.get(values[0] as string);
								if (!row) return null;
								return { image_key: row.image_key } as T;
							}
							return null;
						},
						async run() {
							if (!sql.includes('INSERT INTO tracks')) {
								return;
							}
							rows.set(values[0] as string, {
								id: values[0] as string,
								name: values[1] as string,
								width_meters: values[2] as number,
								height_meters: values[3] as number,
								topdown_w_px: values[4] as number,
								topdown_h_px: values[5] as number,
								image_key: values[6] as string,
								track_json: values[7] as string,
								created_at: values[9] as string,
								updated_at: values[10] as string,
							});
						},
					};
				},
			};
		},
	};

	const objects = new Map<string, Uint8Array>();
	const images = {
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

	return {
		TRACKS_DB: db,
		TRACK_IMAGES: images,
	};
}
