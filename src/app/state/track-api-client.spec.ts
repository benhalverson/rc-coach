import { provideHttpClient } from '@angular/common/http';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRACK_SCHEMA_VERSION, type TrackDef } from '../track-types';
import {
	TrackApiClient,
	type TrackApiError,
	type TrackGetResponse,
	type TrackListResponse,
	type TrackSaveResponse,
} from './track-api-client';

const VALID_TRACK: TrackDef = {
	schemaVersion: TRACK_SCHEMA_VERSION,
	id: 'test-track',
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
				[0.3, 0.1],
				[0.3, 0.3],
			],
		},
	],
	centerline: [
		[0.1, 0.5],
		[0.9, 0.5],
	],
};

describe('TrackApiClient', () => {
	let client: TrackApiClient;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});

		client = TestBed.inject(TrackApiClient);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	describe('listTracks', () => {
		it('sends GET /api/tracks with default pagination params', () => {
			const mockResponse: TrackListResponse = {
				items: [],
				page: 1,
				pageSize: 25,
			};

			client.listTracks().subscribe((res) => {
				expect(res).toEqual(mockResponse);
			});

			const req = httpMock.expectOne(
				(r) =>
					r.url === '/api/tracks' &&
					r.params.get('page') === '1' &&
					r.params.get('pageSize') === '25',
			);
			expect(req.request.method).toBe('GET');
			req.flush(mockResponse);
		});

		it('sends custom page and pageSize params', () => {
			client.listTracks(2, 10).subscribe();

			const req = httpMock.expectOne(
				(r) =>
					r.url === '/api/tracks' &&
					r.params.get('page') === '2' &&
					r.params.get('pageSize') === '10',
			);
			req.flush({ items: [], page: 2, pageSize: 10 });
		});

		it('returns items matching the API contract shape', () => {
			const item = {
				id: 'track-1',
				name: 'Track 1',
				widthMeters: 20,
				heightMeters: 12,
				topdownPx: { w: 1600, h: 900 },
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				imageUrl: '/api/tracks/track-1/topdown.png',
			};
			const mockResponse: TrackListResponse = {
				items: [item],
				page: 1,
				pageSize: 25,
			};

			client.listTracks().subscribe((res) => {
				expect(res.items).toHaveLength(1);
				expect(res.items[0]).toEqual(item);
				expect(res.page).toBe(1);
				expect(res.pageSize).toBe(25);
			});

			httpMock.expectOne((r) => r.url === '/api/tracks').flush(mockResponse);
		});

		it('surfaces a TrackApiError with status and message on 503', () => {
			let caughtError: TrackApiError | undefined;

			client.listTracks().subscribe({
				error: (err: TrackApiError) => {
					caughtError = err;
				},
			});

			httpMock
				.expectOne((r) => r.url === '/api/tracks')
				.flush(
					{ error: 'Cloud track library is not configured.' },
					{ status: 503, statusText: 'Service Unavailable' },
				);

			expect(caughtError?.status).toBe(503);
			expect(caughtError?.message).toBe(
				'Cloud track library is not configured.',
			);
		});
	});

	describe('saveTrack', () => {
		it('sends POST /api/tracks with track and topdownPngBase64', () => {
			const mockResponse: TrackSaveResponse = {
				id: VALID_TRACK.id,
				imageKey: `tracks/${VALID_TRACK.id}/topdown.png`,
				savedAt: '2024-01-01T00:00:00.000Z',
			};
			const base64 = 'abc123==';

			client.saveTrack(VALID_TRACK, base64).subscribe((res) => {
				expect(res).toEqual(mockResponse);
			});

			const req = httpMock.expectOne('/api/tracks');
			expect(req.request.method).toBe('POST');
			expect(req.request.body).toEqual({
				track: VALID_TRACK,
				topdownPngBase64: base64,
			});
			req.flush(mockResponse, { status: 201, statusText: 'Created' });
		});

		it('surfaces a TrackApiError with status 400 on invalid payload', () => {
			let caughtError: TrackApiError | undefined;

			client.saveTrack(VALID_TRACK, '').subscribe({
				error: (err: TrackApiError) => {
					caughtError = err;
				},
			});

			httpMock
				.expectOne('/api/tracks')
				.flush(
					{ error: 'topdownPngBase64 is required.' },
					{ status: 400, statusText: 'Bad Request' },
				);

			expect(caughtError?.status).toBe(400);
			expect(caughtError?.message).toBe('topdownPngBase64 is required.');
		});
	});

	describe('getTrack', () => {
		it('sends GET /api/tracks/:id', () => {
			const mockResponse: TrackGetResponse = {
				track: VALID_TRACK,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				imageUrl: '/api/tracks/test-track/topdown.png',
			};

			client.getTrack('test-track').subscribe((res) => {
				expect(res.track).toEqual(VALID_TRACK);
				expect(res.imageUrl).toBe('/api/tracks/test-track/topdown.png');
			});

			const req = httpMock.expectOne('/api/tracks/test-track');
			expect(req.request.method).toBe('GET');
			req.flush(mockResponse);
		});

		it('URL-encodes the track id', () => {
			client.getTrack('my track/1').subscribe();

			httpMock.expectOne('/api/tracks/my%20track%2F1').flush({
				track: VALID_TRACK,
				createdAt: '',
				updatedAt: '',
				imageUrl: '',
			});
		});

		it('surfaces a TrackApiError with status 404 when not found', () => {
			let caughtError: TrackApiError | undefined;

			client.getTrack('missing').subscribe({
				error: (err: TrackApiError) => {
					caughtError = err;
				},
			});

			httpMock
				.expectOne('/api/tracks/missing')
				.flush(
					{ error: 'Track not found.' },
					{ status: 404, statusText: 'Not Found' },
				);

			expect(caughtError?.status).toBe(404);
			expect(caughtError?.message).toBe('Track not found.');
		});

		it('falls back to error.message when body has no error field', () => {
			let caughtError: TrackApiError | undefined;

			client.getTrack('bad').subscribe({
				error: (err: TrackApiError) => {
					caughtError = err;
				},
			});

			httpMock.expectOne('/api/tracks/bad').flush('Internal Server Error', {
				status: 500,
				statusText: 'Internal Server Error',
			});

			expect(caughtError?.status).toBe(500);
			expect(typeof caughtError?.message).toBe('string');
			expect(caughtError?.message.length).toBeGreaterThan(0);
		});
	});

	describe('getTrackImage', () => {
		it('sends GET /api/tracks/:id/topdown.png with responseType blob', () => {
			const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], {
				type: 'image/png',
			});

			client.getTrackImage('track-1').subscribe((blob) => {
				expect(blob).toBeInstanceOf(Blob);
			});

			const req = httpMock.expectOne('/api/tracks/track-1/topdown.png');
			expect(req.request.method).toBe('GET');
			expect(req.request.responseType).toBe('blob');
			req.flush(pngBlob);
		});

		it('URL-encodes the track id', () => {
			client.getTrackImage('my track/1').subscribe();

			httpMock
				.expectOne('/api/tracks/my%20track%2F1/topdown.png')
				.flush(new Blob());
		});

		it('surfaces a TrackApiError with status 404 when image not found', () => {
			let caughtError: TrackApiError | undefined;

			client.getTrackImage('missing').subscribe({
				error: (err: TrackApiError) => {
					caughtError = err;
				},
			});

			// For blob responseType, the error body must be a Blob — HttpTestingController
			// cannot auto-convert JSON. The message falls back to error.message.
			httpMock
				.expectOne('/api/tracks/missing/topdown.png')
				.flush(new Blob([], { type: 'image/png' }), {
					status: 404,
					statusText: 'Not Found',
				});

			expect(caughtError?.status).toBe(404);
			expect(typeof caughtError?.message).toBe('string');
			expect(caughtError?.message.length).toBeGreaterThan(0);
		});
	});

	describe('getTrackImageUrl', () => {
		it('returns the expected image URL without making an HTTP request', () => {
			expect(client.getTrackImageUrl('track-1')).toBe(
				'/api/tracks/track-1/topdown.png',
			);
		});

		it('URL-encodes the track id', () => {
			expect(client.getTrackImageUrl('my track/1')).toBe(
				'/api/tracks/my%20track%2F1/topdown.png',
			);
		});
	});
});
