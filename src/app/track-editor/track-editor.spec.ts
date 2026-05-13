import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import {
	TrackApiClient,
	type TrackListResponse,
} from '../state/track-api-client';
import { TrackStore } from '../state/track-store';
import { TRACK_SCHEMA_VERSION, type TrackDef } from '../track-types';
import { TrackEditor } from './track-editor';

const SAVED_TRACK: TrackDef = {
	schemaVersion: TRACK_SCHEMA_VERSION,
	id: 'saved-track',
	name: 'Saved Cloud Track',
	widthMeters: 18,
	heightMeters: 10,
	topdownPx: { w: 800, h: 450 },
	zones: [
		{
			id: 'jump-1',
			type: 'jump',
			poly: [
				[0.1, 0.1],
				[0.3, 0.1],
				[0.3, 0.3],
				[0.1, 0.3],
			],
		},
	],
	centerline: [
		[0.1, 0.5],
		[0.5, 0.5],
		[0.9, 0.5],
	],
	import: {
		srcImageName: 'saved-source.png',
		srcQuadPx: [
			{ x: 0, y: 0 },
			{ x: 800, y: 0 },
			{ x: 800, y: 450 },
			{ x: 0, y: 450 },
		],
	},
};

const SAVED_TRACKS_RESPONSE: TrackListResponse = {
	items: [
		{
			id: SAVED_TRACK.id,
			name: SAVED_TRACK.name,
			widthMeters: SAVED_TRACK.widthMeters,
			heightMeters: SAVED_TRACK.heightMeters,
			topdownPx: SAVED_TRACK.topdownPx,
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-02T00:00:00.000Z',
			imageUrl: '/api/tracks/saved-track/topdown.png',
		},
	],
	page: 1,
	pageSize: 25,
};

describe('TrackEditor', () => {
	let component: TrackEditor;
	let fixture: ComponentFixture<TrackEditor>;
	let store: TrackStore;
	let trackApi: {
		listTracks: ReturnType<typeof vi.fn>;
		getTrack: ReturnType<typeof vi.fn>;
		getTrackImage: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		trackApi = {
			listTracks: vi.fn().mockReturnValue(of(SAVED_TRACKS_RESPONSE)),
			getTrack: vi.fn().mockReturnValue(
				of({
					track: SAVED_TRACK,
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					imageUrl: '/api/tracks/saved-track/topdown.png',
				}),
			),
			getTrackImage: vi
				.fn()
				.mockReturnValue(of(new Blob([new Uint8Array([137, 80, 78, 71])]))),
		};

		await TestBed.configureTestingModule({
			imports: [TrackEditor],
			providers: [
				provideRouter([]),
				{ provide: TrackApiClient, useValue: trackApi },
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackEditor);
		component = fixture.componentInstance;
		store = TestBed.inject(TrackStore);
		fixture.detectChanges();
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('loads the saved cloud track list on init', () => {
		expect(trackApi.listTracks).toHaveBeenCalledOnce();
		expect(fixture.nativeElement.textContent).toContain('Saved Cloud Track');
	});

	it('loads a saved cloud track back into the editor', async () => {
		const fakeImg = document.createElement('img');
		Object.defineProperty(fakeImg, 'naturalWidth', {
			value: 800,
			configurable: true,
		});
		Object.defineProperty(fakeImg, 'naturalHeight', {
			value: 450,
			configurable: true,
		});
		vi.spyOn(
			component as unknown as {
				loadImageBlob: (blob: Blob) => Promise<HTMLImageElement>;
			},
			'loadImageBlob',
		).mockResolvedValue(fakeImg);

		component.loadCloudTrack(SAVED_TRACK.id);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(trackApi.getTrack).toHaveBeenCalledWith(SAVED_TRACK.id);
		expect(trackApi.getTrackImage).toHaveBeenCalledWith(SAVED_TRACK.id);
		expect(store.trackId()).toBe(SAVED_TRACK.id);
		expect(store.name()).toBe(SAVED_TRACK.name);
		expect(store.widthMeters()).toBe(SAVED_TRACK.widthMeters);
		expect(store.heightMeters()).toBe(SAVED_TRACK.heightMeters);
		expect(store.zones()).toEqual(SAVED_TRACK.zones);
		expect(store.centerline()).toEqual(SAVED_TRACK.centerline);
		expect(store.srcImageName()).toBe('saved-source.png');
		expect(store.topDown()?.width).toBe(800);
		expect(store.topDown()?.height).toBe(450);
		expect(store.step()).toBe('annotate');
		expect(component.cloudTrackLoadError()).toBeNull();
	});

	it('shows a recoverable error when loading a saved cloud track fails', async () => {
		trackApi.getTrack.mockReturnValue(
			throwError(() => ({ status: 404, message: 'Track not found.' })),
		);

		component.loadCloudTrack('missing-track');
		await new Promise((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();

		expect(component.cloudTrackLoadError()).toBe('Track not found.');
		expect(fixture.nativeElement.textContent).toContain('Track not found.');
		expect(component.cloudTrackLoadingId()).toBeNull();
	});
});
