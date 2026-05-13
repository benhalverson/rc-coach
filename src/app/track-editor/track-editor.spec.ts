import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Opencv } from '../opencv';
import {
	TrackApiClient,
	type TrackApiError,
	type TrackGetResponse,
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

describe('TrackEditor', () => {
	let component: TrackEditor;
	let fixture: ComponentFixture<TrackEditor>;
	let store: TrackStore;
	let trackApiClient: {
		listTracks: ReturnType<typeof vi.fn>;
		getTrack: ReturnType<typeof vi.fn>;
		getTrackImage: ReturnType<typeof vi.fn>;
		saveTrack: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		trackApiClient = {
			listTracks: vi.fn().mockReturnValue(emptyTrackList()),
			getTrack: vi.fn(),
			getTrackImage: vi.fn(),
			saveTrack: vi.fn(),
		};

		await TestBed.configureTestingModule({
			imports: [TrackEditor],
			providers: [
				provideRouter([]),
				TrackStore,
				{
					provide: Opencv,
					useValue: {
						ready: vi.fn().mockResolvedValue(undefined),
						warpPerspective: vi.fn(),
					},
				},
				{ provide: TrackApiClient, useValue: trackApiClient },
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackEditor);
		component = fixture.componentInstance;
		store = TestBed.inject(TrackStore);
		await fixture.whenStable();
		fixture.detectChanges();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('loads saved tracks when the library is opened', async () => {
		trackApiClient.listTracks.mockReturnValue(savedTrackList());

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		expect(trackApiClient.listTracks).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.textContent).toContain('Saved Cloud Track');
		expect(fixture.nativeElement.textContent).toContain('Open track');
	});

	it('shows error, refresh, and empty states for the saved tracks library', async () => {
		trackApiClient.listTracks
			.mockReturnValueOnce(
				throwError(
					() =>
						({
							status: 503,
							message: 'Cloud track library is not configured.',
						}) satisfies TrackApiError,
				),
			)
			.mockReturnValueOnce(emptyTrackList());

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).toContain(
			'Cloud track library is not configured.',
		);

		clickButton(fixture, 'Refresh');
		await fixture.whenStable();
		fixture.detectChanges();

		expect(trackApiClient.listTracks).toHaveBeenCalledTimes(2);
		expect(fixture.nativeElement.textContent).toContain('No saved tracks yet.');
	});

	it('opens a saved track from the library and can save again afterward', async () => {
		const imageBlob = new Blob([new Uint8Array([137, 80, 78, 71])]);
		trackApiClient.listTracks.mockReturnValue(savedTrackList());
		trackApiClient.getTrack.mockReturnValue(savedTrack());
		trackApiClient.getTrackImage.mockReturnValue(of(imageBlob));
		trackApiClient.saveTrack.mockReturnValue(
			of({
				id: SAVED_TRACK.id,
				imageKey: 'tracks/saved-track/topdown.png',
				savedAt: '2024-01-03T00:00:00.000Z',
			}),
		);
		vi.spyOn(
			component as unknown as {
				loadImageBlob: (blob: Blob) => Promise<HTMLImageElement>;
			},
			'loadImageBlob',
		).mockResolvedValue(createImage(800, 450));

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		clickButton(fixture, 'Open track');
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();

		expect(trackApiClient.getTrack).toHaveBeenCalledWith(SAVED_TRACK.id);
		expect(trackApiClient.getTrackImage).toHaveBeenCalledWith(SAVED_TRACK.id);
		expect(store.trackId()).toBe(SAVED_TRACK.id);
		expect(store.name()).toBe(SAVED_TRACK.name);
		expect(store.widthMeters()).toBe(SAVED_TRACK.widthMeters);
		expect(store.heightMeters()).toBe(SAVED_TRACK.heightMeters);
		expect(store.zones()).toEqual(SAVED_TRACK.zones);
		expect(store.centerline()).toEqual(SAVED_TRACK.centerline);
		expect(store.srcImageName()).toBe('saved-source.png');
		expect(store.quadPx()).toEqual(SAVED_TRACK.import?.srcQuadPx);
		expect(store.topDown()?.width).toBe(800);
		expect(store.topDown()?.height).toBe(450);
		expect(component.step()).toBe('annotate');
		expect(component.trackLibraryError()).toBeNull();

		const loadedCanvas = store.topDown();
		expect(loadedCanvas).toBeTruthy();
		Object.defineProperty(loadedCanvas as HTMLCanvasElement, 'toDataURL', {
			value: vi.fn(() => 'data:image/png;base64,loaded123=='),
			configurable: true,
		});
		store.step.set('export');
		component.saveToCloud();
		fixture.detectChanges();

		expect(trackApiClient.saveTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				id: SAVED_TRACK.id,
				name: SAVED_TRACK.name,
			}),
			'loaded123==',
		);
	});

	it('shows a recoverable error when loading a saved cloud track fails', async () => {
		trackApiClient.listTracks.mockReturnValue(savedTrackList());
		trackApiClient.getTrack.mockReturnValue(
			throwError(() => ({ status: 404, message: 'Track not found.' })),
		);

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		clickButton(fixture, 'Open track');
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).toContain('Track not found.');
		expect(component.trackLibraryError()).toBe('Track not found.');
		expect(component.openingTrackId()).toBeNull();
	});

	it('does not send a cloud save request when export is invalid', () => {
		store.step.set('export');
		fixture.detectChanges();

		const saveButton = getButtonByText(fixture, 'Save to cloud');
		expect(saveButton.disabled).toBe(true);

		component.saveToCloud();
		fixture.detectChanges();

		expect(trackApiClient.saveTrack).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain(
			'Resolve all export errors before saving to cloud.',
		);
	});

	it('saves a valid export to the cloud and shows confirmation', () => {
		seedValidExportState(store);
		trackApiClient.saveTrack.mockReturnValue(
			of({
				id: 'saved-track',
				imageKey: 'tracks/saved-track/topdown.png',
				savedAt: '2024-01-01T00:00:00.000Z',
			}),
		);

		fixture.detectChanges();
		component.saveToCloud();
		fixture.detectChanges();

		expect(trackApiClient.saveTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'saved-track',
				name: 'Saved Track',
			}),
			'abc123==',
		);
		expect(store.step()).toBe('export');
		expect(fixture.nativeElement.textContent).toContain(
			'Saved "Saved Track" to cloud as saved-track.',
		);
		expect(getButtonByText(fixture, 'Download topdown.png')).toBeTruthy();
		expect(getButtonByText(fixture, 'Download track.json')).toBeTruthy();
	});

	it('shows actionable API errors when cloud save fails', () => {
		seedValidExportState(store);
		trackApiClient.saveTrack.mockReturnValue(
			throwError(() => ({
				status: 400,
				message: 'topdownPngBase64 is required.',
			})),
		);

		fixture.detectChanges();
		component.saveToCloud();
		fixture.detectChanges();

		expect(trackApiClient.saveTrack).toHaveBeenCalledOnce();
		expect(fixture.nativeElement.textContent).toContain('Cloud save failed');
		expect(fixture.nativeElement.textContent).toContain(
			'topdownPngBase64 is required.',
		);
	});
});

function emptyTrackList() {
	return of<TrackListResponse>({
		items: [],
		page: 1,
		pageSize: 25,
	});
}

function savedTrackList() {
	return of<TrackListResponse>({
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
	});
}

function savedTrack() {
	return of<TrackGetResponse>({
		track: SAVED_TRACK,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-02T00:00:00.000Z',
		imageUrl: '/api/tracks/saved-track/topdown.png',
	});
}

function clickButton(
	fixture: ComponentFixture<TrackEditor>,
	label: string,
): void {
	const buttons = Array.from(
		(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
	) as HTMLButtonElement[];
	const button = buttons.find((element) =>
		element.textContent?.includes(label),
	);

	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Could not find button: ${label}`);
	}

	button.click();
	fixture.detectChanges();
}

function seedValidExportState(store: TrackStore) {
	const canvas = document.createElement('canvas');
	canvas.width = 800;
	canvas.height = 450;
	Object.defineProperty(canvas, 'toDataURL', {
		value: vi.fn(() => 'data:image/png;base64,abc123=='),
		configurable: true,
	});

	store.step.set('export');
	store.trackId.set('saved-track');
	store.name.set('Saved Track');
	store.widthMeters.set(20);
	store.heightMeters.set(12);
	store.zones.set([
		{
			id: 'jump-1',
			type: 'jump',
			poly: [
				[0.1, 0.1],
				[0.3, 0.1],
				[0.3, 0.3],
			],
		},
	]);
	store.centerline.set([
		[0.1, 0.5],
		[0.9, 0.5],
	]);
	store.topDown.set(canvas);
}

function getButtonByText(
	fixture: ComponentFixture<TrackEditor>,
	text: string,
): HTMLButtonElement {
	const buttons = Array.from(
		fixture.nativeElement.querySelectorAll('button'),
	) as HTMLButtonElement[];
	const button = buttons.find(
		(candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === text,
	);

	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Button not found: ${text}`);
	}

	return button;
}

function createImage(width: number, height: number): HTMLImageElement {
	const image = document.createElement('img');
	Object.defineProperty(image, 'naturalWidth', {
		value: width,
		configurable: true,
	});
	Object.defineProperty(image, 'naturalHeight', {
		value: height,
		configurable: true,
	});
	return image;
}
