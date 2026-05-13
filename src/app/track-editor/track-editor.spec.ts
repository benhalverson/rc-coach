import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK_SCHEMA_VERSION, type TrackDef } from '../track-types';
import {
	TrackApiClient,
	type TrackApiError,
	type TrackGetResponse,
	type TrackListResponse,
} from '../state/track-api-client';

import { TrackEditor } from './track-editor';

const SAVED_TRACK: TrackDef = {
	schemaVersion: TRACK_SCHEMA_VERSION,
	id: 'saved-track',
	name: 'Cloud Track',
	widthMeters: 20,
	heightMeters: 12,
	topdownPx: { w: 1600, h: 900 },
	zones: [],
	centerline: [],
};
const RealImage = globalThis.Image;

describe('TrackEditor', () => {
	let component: TrackEditor;
	let fixture: ComponentFixture<TrackEditor>;
	let trackApiClient: {
		listTracks: ReturnType<typeof vi.fn>;
		getTrack: ReturnType<typeof vi.fn>;
		getTrackImageUrl: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		trackApiClient = {
			listTracks: vi.fn().mockReturnValue(
				of<TrackListResponse>({
					items: [],
					page: 1,
					pageSize: 25,
				}),
			),
			getTrack: vi.fn(),
			getTrackImageUrl: vi
				.fn()
				.mockImplementation((id: string) => `/api/tracks/${id}/topdown.png`),
		};

		await TestBed.configureTestingModule({
			imports: [TrackEditor],
			providers: [
				provideRouter([]),
				{ provide: TrackApiClient, useValue: trackApiClient },
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackEditor);
		component = fixture.componentInstance;
		await fixture.whenStable();
		fixture.detectChanges();
	});

	afterEach(() => {
		globalThis.Image = RealImage;
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('loads saved tracks when the library is opened', async () => {
		trackApiClient.listTracks.mockReturnValue(
			of<TrackListResponse>({
				items: [
					{
						id: 'saved-track',
						name: 'Cloud Track',
						widthMeters: 20,
						heightMeters: 12,
						topdownPx: { w: 1600, h: 900 },
						createdAt: '2024-01-01T00:00:00.000Z',
						updatedAt: '2024-01-02T00:00:00.000Z',
						imageUrl: '/api/tracks/saved-track/topdown.png',
					},
				],
				page: 1,
				pageSize: 25,
			}),
		);

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		expect(trackApiClient.listTracks).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.textContent).toContain('Cloud Track');
		expect(fixture.nativeElement.textContent).toContain('Open track');
	});

	it('shows error, refresh, and empty states for the saved tracks library', async () => {
		trackApiClient.listTracks
			.mockReturnValueOnce(
				throwError(() =>
					({
						status: 503,
						message: 'Cloud track library is not configured.',
					}) satisfies TrackApiError,
				),
			)
			.mockReturnValueOnce(
				of<TrackListResponse>({
					items: [],
					page: 1,
					pageSize: 25,
				}),
			);

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

	it('opens a saved track from the library', async () => {
		trackApiClient.listTracks.mockReturnValue(
			of<TrackListResponse>({
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
			}),
		);
		trackApiClient.getTrack.mockReturnValue(
			of<TrackGetResponse>({
				track: SAVED_TRACK,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				imageUrl: '/api/tracks/saved-track/topdown.png',
			}),
		);
		globalThis.Image = createMockImageConstructor(1600, 900);

		clickButton(fixture, 'Browse saved tracks');
		await fixture.whenStable();
		fixture.detectChanges();

		clickButton(fixture, 'Open track');
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();

		expect(trackApiClient.getTrack).toHaveBeenCalledWith('saved-track');
		expect(trackApiClient.getTrackImageUrl).toHaveBeenCalledWith('saved-track');
		expect(component.step()).toBe('annotate');
		expect(component.name()).toBe('Cloud Track');
		expect(component.topDown()).toBeTruthy();
	});
});

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

function createMockImageConstructor(
	width: number,
	height: number,
): typeof Image {
	return class MockImage {
		onload: null | (() => void) = null;
		onerror: null | (() => void) = null;
		width = width;
		height = height;
		naturalWidth = width;
		naturalHeight = height;

		set src(_value: string) {
			queueMicrotask(() => this.onload?.());
		}
	} as unknown as typeof Image;
}
